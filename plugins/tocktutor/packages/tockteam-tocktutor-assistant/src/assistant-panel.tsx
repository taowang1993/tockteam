import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ArrowDown, ArrowUp, FileText, List, Plus, Search, Sparkles } from 'lucide-react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { TockTutorAssistantPanelOwnerProps } from '@tockteam/tocktutor-workbench/client'
import { redactBoundaryText } from './context.ts'
import type {
  AssistantApprovalRequest,
  AssistantApprovalView,
  AssistantAuditResult,
  AssistantDecisionView,
  AssistantPageRequest,
  AssistantProposalListResult,
  AssistantRejectionRequest,
  AssistantSettingsView,
  AssistantTurnRequest,
  AssistantTurnResult,
} from './remote-types.ts'

const EMPTY_CONVERSATION: AssistantConversationSnapshot = Object.freeze({
  lastAgentError: null,
  nodes: Object.freeze([]),
  openError: null,
  openState: 'cold',
  partial: null,
  promptError: null,
  running: false,
  runningCalls: Object.freeze([]),
})

interface AssistantTextBlock {
  kind: string
  text?: string
}

export interface AssistantConversationSnapshot {
  lastAgentError: string | null
  nodes: readonly unknown[]
  openError: { message: string } | null
  openState: 'cold' | 'loading' | 'open' | 'error'
  partial: { blocks: readonly AssistantTextBlock[] } | null
  promptError: { error: { message: string } } | null
  running: boolean
  runningCalls: readonly { callId: string; name: string }[]
}

interface ConversationSource {
  getSnapshot(): AssistantConversationSnapshot
  subscribe(listener: () => void): () => void
}

interface ScopedAssistantRemote {
  remote: {
    tocktutorAssistant: {
      continueTurn(request: AssistantTurnRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantTurnResult>>
    }
  }
}

export interface AssistantPanelSessions {
  binding(id: string): { session: ConversationSource } | undefined
  list: {
    getSnapshot(): { current: string | undefined }
    subscribe(listener: () => void): () => void
  }
  scope(id: string): ScopedAssistantRemote | undefined
}

export interface AssistantPanelRemote {
  tocktutorAssistant: {
    approveProposal(request: AssistantApprovalRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantApprovalView>>
    audit(request: AssistantPageRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantAuditResult>>
    currentSettings(signal?: AbortSignal): Promise<RemoteResult<AssistantSettingsView>>
    listProposals(request: AssistantPageRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantProposalListResult>>
    rejectProposal(request: AssistantRejectionRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantDecisionView>>
    saveSettings(request: AssistantSettingsView, signal?: AbortSignal): Promise<RemoteResult<AssistantSettingsView>>
  }
}

export interface TockTutorAssistantPanelProps extends TockTutorAssistantPanelOwnerProps {
  remote: AssistantPanelRemote
  sessions: AssistantPanelSessions
}

function remoteValue<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

const emptySubscribe = () => () => {}
const MAX_TRANSCRIPT_ENTRIES = 20
const MAX_TRANSCRIPT_ENTRY_CHARS = 2_000
const MAX_TRANSCRIPT_CHARS = 16_000
const PROMPT_SUGGESTIONS = [
  { icon: Search, label: 'Summarize the current note', prompt: 'Summarize the current note.' },
  { icon: List, label: 'Find related notes', prompt: 'Find related notes in this vault.' },
  { icon: FileText, label: 'Complete writing with AI', prompt: 'Help complete this note.' },
  { icon: Sparkles, label: 'Freely communicate with AI', prompt: 'I want to brainstorm about this note.' },
] as const

type TranscriptEntry = { key: string; label: string; text: string; toolStatus?: boolean }
type ReviewPage<T> = { key: string; value: T }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function boundedText(value: string, limit: number): string {
  const redacted = redactBoundaryText(value)
  return redacted.length <= limit
    ? redacted
    : `${redacted.slice(0, Math.max(0, limit - 1))}…`
}

function blockText(value: unknown, discriminator: 'kind' | 'type'): string {
  if (!Array.isArray(value)) return ''
  return value.flatMap(block => {
    const candidate = record(block)
    return candidate?.[discriminator] === 'text' && typeof candidate.text === 'string'
      ? [candidate.text]
      : []
  }).join('')
}

function transcriptEntry(value: unknown, index: number): TranscriptEntry | null {
  const node = record(value)
  if (node === null || typeof node.kind !== 'string') return null
  const key = `${typeof node.seq === 'number' ? String(node.seq) : String(index)}-${node.kind}`
  if (node.kind === 'user' || node.kind === 'steering') {
    const text = blockText(node.content, 'type')
    return text === '' ? null : { key, label: node.kind === 'user' ? 'You' : 'Steering', text }
  }
  if (node.kind === 'assistant') {
    const text = blockText(node.blocks, 'kind')
    return text === '' ? null : { key, label: 'Assistant', text }
  }
  if (node.kind === 'tool-result') {
    const call = record(node.call)
    const name = typeof call?.name === 'string'
      ? boundedText(call.name, 127)
      : typeof node.callId === 'string' ? boundedText(node.callId, 127) : 'Tool'
    return {
      key,
      label: 'Tool',
      text: `${name} · ${node.isError === true ? 'Failed' : 'Completed'}`,
      toolStatus: true,
    }
  }
  if (node.kind === 'turn-error' && typeof node.message === 'string') {
    return { key, label: 'Assistant Error', text: node.message }
  }
  return null
}

function auditTime(timestamp: number): { dateTime: string; label: string } | null {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  return { dateTime: date.toISOString(), label: date.toLocaleString() }
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}

function projectTranscript(nodes: readonly unknown[]): TranscriptEntry[] {
  const entries = nodes.slice(-100)
    .map(transcriptEntry)
    .filter((entry): entry is TranscriptEntry => entry !== null)
    .slice(-MAX_TRANSCRIPT_ENTRIES)
  let remaining = MAX_TRANSCRIPT_CHARS
  return entries.flatMap(entry => {
    if (remaining <= 0) return []
    const text = boundedText(entry.text, Math.min(MAX_TRANSCRIPT_ENTRY_CHARS, remaining))
    remaining -= text.length
    return [{ ...entry, text }]
  })
}

/** Inline, authority-free browser presentation for the selected Agent and Host review queue. */
export function TockTutorAssistantPanel(props: TockTutorAssistantPanelProps): ReactNode {
  const [settings, setSettings] = useState<AssistantSettingsView | null>(null)
  const [audit, setAudit] = useState<ReviewPage<AssistantAuditResult> | null>(null)
  const [auditOffset, setAuditOffset] = useState(0)
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [proposals, setProposals] = useState<ReviewPage<AssistantProposalListResult> | null>(null)
  const [proposalOffset, setProposalOffset] = useState(0)
  const [decision, setDecision] = useState<{
    action: 'approve' | 'reject'
    routeEpoch: number
    proposalId: string
  } | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const pending = useRef(new Set<AbortController>())
  const reviewPending = useRef(new Set<AbortController>())
  const reviewControllers = reviewPending.current
  const followingRef = useRef(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const reviewKey = `${props.vault?.id ?? 'inactive'}:${String(props.vault?.generation ?? 0)}:${props.activePath ?? ''}`
  const routeRef = useRef<{ epoch: number; key: string } | null>(null)
  if (routeRef.current === null) routeRef.current = { epoch: 0, key: reviewKey }
  else if (routeRef.current.key !== reviewKey) {
    routeRef.current = { epoch: routeRef.current.epoch + 1, key: reviewKey }
  }
  const routeEpoch = routeRef.current.epoch
  const auditPage = audit?.key === reviewKey ? audit.value : null
  const proposalPage = proposals?.key === reviewKey ? proposals.value : null
  const activeDecision = decision?.routeEpoch === routeEpoch ? decision : null
  const current = useSyncExternalStore(
    listener => props.sessions.list.subscribe(listener),
    () => props.sessions.list.getSnapshot().current,
    () => undefined,
  )
  const conversation = current === undefined ? undefined : props.sessions.binding(current)?.session
  const transcript = useSyncExternalStore(
    listener => conversation?.subscribe(listener) ?? emptySubscribe(),
    () => conversation?.getSnapshot() ?? EMPTY_CONVERSATION,
    () => EMPTY_CONVERSATION,
  )

  const loadAudit = useCallback((offset = 0): Promise<void> => {
    const controller = new AbortController()
    pending.current.add(controller)
    reviewPending.current.add(controller)
    return props.remote.tocktutorAssistant.audit({ limit: 20, offset }, controller.signal)
      .then(remoteValue)
      .then(value => {
        if (!controller.signal.aborted) {
          setAudit({ key: reviewKey, value })
          setAuditOffset(offset)
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Audit history could not be loaded.')
      })
      .finally(() => {
        pending.current.delete(controller)
        reviewPending.current.delete(controller)
      })
  }, [props.remote, reviewKey])

  const loadProposals = useCallback((offset = 0): Promise<void> => {
    const controller = new AbortController()
    pending.current.add(controller)
    reviewPending.current.add(controller)
    return props.remote.tocktutorAssistant.listProposals({ limit: 20, offset }, controller.signal)
      .then(remoteValue)
      .then(value => {
        if (!controller.signal.aborted) {
          setProposals({ key: reviewKey, value })
          setProposalOffset(offset)
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Staged proposals could not be loaded.')
      })
      .finally(() => {
        pending.current.delete(controller)
        reviewPending.current.delete(controller)
      })
  }, [props.remote, reviewKey])

  useEffect(() => {
    const controller = new AbortController()
    pending.current.add(controller)
    void props.remote.tocktutorAssistant.currentSettings(controller.signal)
      .then(remoteValue)
      .then(value => {
        if (!controller.signal.aborted) {
          setSettings(value)
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Assistant settings could not be loaded.')
      })
      .finally(() => { pending.current.delete(controller) })
    return () => { controller.abort() }
  }, [props.remote])

  useEffect(() => {
    void loadAudit()
    void loadProposals()
    return () => {
      for (const controller of reviewControllers) controller.abort()
      reviewControllers.clear()
    }
  }, [loadAudit, loadProposals, reviewControllers])

  useEffect(() => () => {
    for (const controller of pending.current) controller.abort()
    pending.current.clear()
  }, [pending])

  const decideProposal = (
    proposal: AssistantProposalListResult['proposals'][number],
    action: 'approve' | 'reject',
  ): void => {
    if (activeDecision !== null) return
    if (proposal.expiresAt <= Date.now()) {
      setStatus('This proposal has expired. Refresh the review queue.')
      statusRef.current?.focus()
      void loadProposals()
      return
    }
    const controller = new AbortController()
    pending.current.add(controller)
    reviewPending.current.add(controller)
    setDecision({ action, routeEpoch, proposalId: proposal.proposalId })
    setStatus(action === 'approve' ? 'Approving proposal…' : 'Rejecting proposal…')
    const request = action === 'approve'
      ? props.remote.tocktutorAssistant.approveProposal({ proposalId: proposal.proposalId }, controller.signal)
      : props.remote.tocktutorAssistant.rejectProposal({
          proposalId: proposal.proposalId,
          reason: 'Rejected from the TockTutor review panel.',
        }, controller.signal)
    void request
      .then(remoteValue)
      .then(() => {
        if (controller.signal.aborted) return
        setStatus(action === 'approve'
          ? `${proposal.destination} was ${proposal.operation === 'create' ? 'created' : 'saved'}.`
          : `${proposal.destination} was rejected.`)
        statusRef.current?.focus()
        void loadAudit()
        void loadProposals()
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setStatus(error instanceof Error ? error.message : 'The proposal decision failed.')
          statusRef.current?.focus()
          void loadAudit()
          void loadProposals()
        }
      })
      .finally(() => {
        pending.current.delete(controller)
        reviewPending.current.delete(controller)
        setDecision(current => current?.routeEpoch === routeEpoch
          && current.proposalId === proposal.proposalId
          ? null
          : current)
      })
  }

  const saveSettings = (event: FormEvent): void => {
    event.preventDefault()
    if (settings === null || settingsSaving) return
    const controller = new AbortController()
    pending.current.add(controller)
    setSettingsSaving(true)
    setStatus('Saving settings…')
    void props.remote.tocktutorAssistant.saveSettings(settings, controller.signal)
      .then(remoteValue)
      .then(value => {
        if (!controller.signal.aborted) {
          setSettings(value)
          setStatus('Settings saved.')
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Settings could not be saved.')
      })
      .finally(() => {
        pending.current.delete(controller)
        if (!controller.signal.aborted) setSettingsSaving(false)
      })
  }

  const send = (event: FormEvent): void => {
    event.preventDefault()
    const text = message.trim()
    if (text === '') return
    if (current === undefined) {
      setStatus('Select an active conversation before sending a message.')
      return
    }
    const scope = props.sessions.scope(current)
    if (scope === undefined) {
      setStatus('The selected conversation is unavailable.')
      return
    }
    const controller = new AbortController()
    pending.current.add(controller)
    setStatus('Sending message…')
    const requestText = props.activePath === null ? text : `Active note: ${props.activePath}\n\n${text}`
    void scope.remote.tocktutorAssistant.continueTurn({ mode: 'followup', text: requestText }, controller.signal)
      .then(remoteValue)
      .then(() => {
        if (!controller.signal.aborted) {
          setMessage('')
          setStatus('Message accepted. Live output appears below.')
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'The message could not be sent.')
      })
      .finally(() => { pending.current.delete(controller) })
  }

  const partial = boundedText(blockText(transcript.partial?.blocks, 'kind'), MAX_TRANSCRIPT_ENTRY_CHARS)
  const transcriptEntries = projectTranscript(transcript.nodes)
  const transcriptError = transcript.promptError?.error.message
    ?? transcript.openError?.message
    ?? transcript.lastAgentError
  const renderedAt = Date.now()
  const hasConversation = transcriptEntries.length > 0
    || partial !== ''
    || transcript.runningCalls.length > 0
    || transcriptError !== null
  const scrollToLatest = useCallback(() => {
    const scroll = scrollRef.current
    if (scroll === null) return
    scroll.scrollTop = scroll.scrollHeight
    followingRef.current = true
    setShowJumpToLatest(false)
  }, [])
  useEffect(() => {
    const scroll = scrollRef.current
    if (followingRef.current && scroll !== null) scroll.scrollTop = scroll.scrollHeight
  }, [partial, proposalPage, transcript])

  return (
    <aside aria-label="TockTutor Assistant" className="tocktutor-assistant-panel tocktutor-assistant-styles">
      <div
        className="tocktutor-assistant-scroll"
        onScroll={event => {
          const scroll = event.currentTarget
          const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 48
          followingRef.current = atBottom
          setShowJumpToLatest(!atBottom)
        }}
        ref={scrollRef}
      >
        <section aria-label="Live Assistant Output" aria-live="polite" className="tocktutor-assistant-transcript">
          {!hasConversation && (proposalPage?.proposals.length ?? 0) === 0 && (
            <div className="tocktutor-assistant-empty">
              <div className="tocktutor-assistant-empty-icon"><Sparkles aria-hidden="true" /></div>
              <h2>What can I help you with?</h2>
              <div className="tocktutor-assistant-suggestions">
                {PROMPT_SUGGESTIONS.map(suggestion => {
                  const Icon = suggestion.icon
                  return (
                    <button
                      key={suggestion.label}
                      onClick={() => { setMessage(suggestion.prompt) }}
                      type="button"
                    >
                      <Icon aria-hidden="true" />
                      <span>{suggestion.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {transcriptEntries.map(entry => entry.toolStatus === true
            ? <p className="tocktutor-assistant-tool-status" key={entry.key}>{entry.text}</p>
            : (
                <article
                  aria-label={`${entry.label} transcript entry`}
                  className={entry.label === 'You' || entry.label === 'Steering' ? 'tocktutor-assistant-user-message' : 'tocktutor-assistant-answer'}
                  key={entry.key}
                >
                  {entry.label !== 'You' && entry.label !== 'Steering' && <p className="tocktutor-assistant-kicker">TockTutor Assistant</p>}
                  <p>{entry.text}</p>
                </article>
              ))}
          {partial !== '' && (
            <article aria-label="Streaming assistant transcript entry" className="tocktutor-assistant-answer">
              <p className="tocktutor-assistant-kicker">TockTutor Assistant</p>
              <p>{partial}</p>
            </article>
          )}
          {transcript.runningCalls.slice(0, 20).map(call => (
            <p className="tocktutor-assistant-tool-status" key={call.callId}>{boundedText(call.name, 127)} · Reading…</p>
          ))}
          {transcriptError !== null && transcriptError !== undefined && (
            <p className="tocktutor-assistant-error" role="alert">{boundedText(transcriptError, 500)}</p>
          )}
          {(proposalPage?.proposals.length ?? 0) > 0 && (
            <section aria-label="Staged Proposals" className="tocktutor-assistant-reviews">
              <h2>Staged Proposals</h2>
              {proposalPage?.proposals.slice(0, 20).map(proposal => {
                const expired = proposal.expiresAt <= renderedAt
                const pendingDecision = activeDecision?.proposalId === proposal.proposalId
                const operation = proposal.operation === 'create' ? 'Create' : 'Update'
                return (
                  <article key={proposal.proposalId}>
                    <h3>{operation} {proposal.destination}</h3>
                    <p>{String(proposal.contentChars)} characters · {String(proposal.contentBytes)} bytes</p>
                    <pre>{boundedText(proposal.preview, 1_000)}</pre>
                    {proposal.warnings.length > 0 && (
                      <ul aria-label={`Warnings for ${proposal.destination}`}>
                        {proposal.warnings.map((warning, index) => (
                          <li key={String(index)}>{boundedText(warning, 500)}</li>
                        ))}
                      </ul>
                    )}
                    {proposal.skippedEntryCount > 0 && (
                      <p>{String(proposal.skippedEntryCount)} skipped {proposal.skippedEntryCount === 1 ? 'entry' : 'entries'}{proposal.skippedEntries.length > 0 ? `: ${proposal.skippedEntries.join(', ')}` : ''}</p>
                    )}
                    <div>
                      <button
                        aria-label={expired ? undefined : `Approve ${operation} ${proposal.destination}`}
                        disabled={expired || activeDecision !== null}
                        onClick={() => { decideProposal(proposal, 'approve') }}
                        type="button"
                      >
                        {expired ? 'Expired' : pendingDecision && activeDecision.action === 'approve' ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        aria-label={`Reject ${operation} ${proposal.destination}`}
                        disabled={expired || activeDecision !== null}
                        onClick={() => { decideProposal(proposal, 'reject') }}
                        type="button"
                      >
                        {pendingDecision && activeDecision.action === 'reject' ? 'Rejecting…' : 'Reject'}
                      </button>
                    </div>
                  </article>
                )
              })}
              {proposalPage !== null && (proposalOffset > 0 || proposalPage.nextOffset !== null) && (
                <nav aria-label="Proposal Pages">
                  <button
                    aria-label="Previous Proposal Page"
                    disabled={proposalOffset === 0}
                    onClick={() => { void loadProposals(Math.max(0, proposalOffset - 20)) }}
                    type="button"
                  >Previous</button>
                  <button
                    aria-label="Next Proposal Page"
                    disabled={proposalPage.nextOffset === null}
                    onClick={() => { if (proposalPage.nextOffset !== null) void loadProposals(proposalPage.nextOffset) }}
                    type="button"
                  >Next</button>
                </nav>
              )}
            </section>
          )}
        </section>
      </div>
      {showJumpToLatest && (
        <button className="tocktutor-assistant-jump" onClick={scrollToLatest} type="button">
          <ArrowDown aria-hidden="true" />
          Jump to Latest
        </button>
      )}
      <div className="tocktutor-assistant-composer-wrap">
        <div className="tocktutor-assistant-add-menu" hidden={!menuOpen} id="tocktutor-assistant-add-menu">
          <button
            disabled={props.activePath === null}
            onClick={() => {
              if (props.activePath !== null) setMessage(currentMessage => [currentMessage.trim(), `Use ${props.activePath} as context.`].filter(Boolean).join('\n'))
              setMenuOpen(false)
            }}
            type="button"
          >
            <FileText aria-hidden="true" />
            <span>{props.activePath ?? 'Current Note'}</span>
          </button>
          <details>
            <summary>Assistant Settings</summary>
            <form onSubmit={saveSettings}>
              <label>
                Provider
                <input
                  aria-label="Provider"
                  disabled={settings === null || settingsSaving}
                  maxLength={127}
                  onChange={event => {
                    setSettings(currentSettings => currentSettings === null
                      ? null
                      : { ...currentSettings, provider: event.target.value })
                  }}
                  value={settings?.provider ?? ''}
                />
              </label>
              <label>
                Model
                <input
                  aria-label="Model"
                  disabled={settings === null || settingsSaving}
                  maxLength={127}
                  onChange={event => {
                    setSettings(currentSettings => currentSettings === null
                      ? null
                      : { ...currentSettings, model: event.target.value })
                  }}
                  value={settings?.model ?? ''}
                />
              </label>
              <label>
                Write Permission
                <select
                  aria-label="Write Permission"
                  disabled={settings === null || settingsSaving}
                  onChange={event => {
                    const writePermission = event.target.value === 'propose' ? 'propose' : 'read-only'
                    setSettings(currentSettings => currentSettings === null
                      ? null
                      : { ...currentSettings, writePermission })
                  }}
                  value={settings?.writePermission ?? 'read-only'}
                >
                  <option value="read-only">Read Only</option>
                  <option value="propose">Propose Writes</option>
                </select>
              </label>
              <button disabled={settings === null || settingsSaving} type="submit">
                {settingsSaving ? 'Saving…' : 'Save Settings'}
              </button>
            </form>
          </details>
          <details>
            <summary>Audit History</summary>
            <section aria-label="Audit History" className="tocktutor-assistant-audit">
              {auditPage === null && <p>Loading audit history…</p>}
              {auditPage !== null && auditPage.entries.length === 0 && <p>No audit entries.</p>}
              {auditPage?.dropped !== undefined && auditPage.dropped > 0 && (
                <p>{String(auditPage.dropped)} older audit {auditPage.dropped === 1 ? 'entry was' : 'entries were'} dropped by bounded retention.</p>
              )}
              {auditPage?.entries.slice(0, 20).map(entry => {
                const outcome = entry.outcome.split('-').map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ')
                const operation = entry.operation === 'create' ? 'Create' : 'Update'
                const time = auditTime(entry.timestamp)
                return (
                  <article aria-label={`Audit entry ${entry.auditId}`} key={entry.auditId}>
                    <h3>{outcome} {operation} {entry.destination}</h3>
                    {time === null
                      ? <span>Time Unavailable</span>
                      : <time dateTime={time.dateTime}>{time.label}</time>}
                    {entry.reason !== undefined && <p>{boundedText(entry.reason, 500)}</p>}
                  </article>
                )
              })}
              {auditPage !== null && (auditOffset > 0 || auditPage.nextOffset !== null) && (
                <nav aria-label="Audit Pages">
                  <button
                    aria-label="Previous Audit Page"
                    disabled={auditOffset === 0}
                    onClick={() => { void loadAudit(Math.max(0, auditOffset - 20)) }}
                    type="button"
                  >Previous</button>
                  <button
                    aria-label="Next Audit Page"
                    disabled={auditPage.nextOffset === null}
                    onClick={() => { if (auditPage.nextOffset !== null) void loadAudit(auditPage.nextOffset) }}
                    type="button"
                  >Next</button>
                </nav>
              )}
            </section>
          </details>
        </div>
        <form className="tocktutor-assistant-composer" onSubmit={send}>
          <textarea
            aria-label="Assistant Message"
            id="tocktutor-assistant-message"
            maxLength={8_000}
            onChange={event => { setMessage(event.target.value) }}
            onKeyDown={submitOnEnter}
            placeholder="What are your thoughts?"
            rows={3}
            value={message}
          />
          <div>
            <button
              aria-controls="tocktutor-assistant-add-menu"
              aria-expanded={menuOpen}
              aria-label="Add Context"
              className="tocktutor-assistant-icon-button"
              onClick={() => { setMenuOpen(open => !open) }}
              type="button"
            ><Plus aria-hidden="true" /></button>
            <button
              aria-label="Send"
              className="tocktutor-assistant-send"
              disabled={message.trim() === ''}
              type="submit"
            ><ArrowUp aria-hidden="true" /></button>
          </div>
        </form>
      </div>
      <p aria-live="polite" className="tocktutor-assistant-status" ref={statusRef} role="status" tabIndex={-1}>
        {status === null ? '' : boundedText(status, 500)}
      </p>
    </aside>
  )
}
