import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@tockteam/ui/empty'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@tockteam/ui/popover'
import { Textarea } from '@tockteam/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip'
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
  const statusRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    setMessage('')
  }, [reviewKey])
  useEffect(() => {
    const selected = props.selectedText?.slice(0, 10_000)
    if (selected === undefined || selected === '') return
    setMessage(`${selected.split(/\r?\n/u).map(line => `> ${line}`).join('\n')}\n\n`)
  }, [props.selectedText, reviewKey])

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
    <TooltipProvider>
      <aside
      aria-label="TockTutor Assistant"
      className="tocktutor-assistant-panel relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[var(--tta-panel)] text-inherit [--tta-accent:var(--tt-accent,#4f46e5)] [--tta-bg:var(--tt-bg,#f7f8fa)] [--tta-border:var(--tt-border,#d9dde5)] [--tta-muted:var(--tt-muted,#667085)] [--tta-panel:var(--tt-panel,#fff)] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tta-accent)] [&_h2]:m-0 [&_h3]:m-0 [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tta-accent)] [&_p]:m-0 [&_select:focus-visible]:outline-2 [&_select:focus-visible]:outline-offset-2 [&_select:focus-visible]:outline-[var(--tta-accent)] [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tta-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!duration-0"
    >
      <div
        className="tocktutor-assistant-scroll flex min-h-0 flex-[1_1_auto] flex-col overflow-auto p-3.5"
        onScroll={event => {
          const scroll = event.currentTarget
          const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 48
          followingRef.current = atBottom
          setShowJumpToLatest(!atBottom)
        }}
        ref={scrollRef}
      >
        <section aria-label="Live Assistant Output" aria-live="polite" className="tocktutor-assistant-transcript flex min-h-full min-w-0 flex-col gap-4">
          {!hasConversation && (proposalPage?.proposals.length ?? 0) === 0 && (
            <Empty unstyled className="tocktutor-assistant-empty flex min-h-full flex-col items-center justify-center gap-4 text-center">
              <EmptyHeader unstyled>
                <EmptyMedia unstyled className="tocktutor-assistant-empty-icon flex size-10 items-center justify-center rounded-xl border border-[var(--tta-border)] bg-[var(--tta-panel)] text-[var(--tta-accent)] shadow-[0_1px_2px_rgb(0_0_0_/_7%)] [&_svg]:size-[18px]"><Sparkles aria-hidden="true" /></EmptyMedia>
                <EmptyTitle unstyled aria-level={2} className="max-w-64 text-sm leading-5 font-bold" role="heading">What can I help you with?</EmptyTitle>
              </EmptyHeader>
              <EmptyContent unstyled className="tocktutor-assistant-suggestions flex w-[min(100%,288px)] flex-col items-stretch gap-1.5 text-left">
                {PROMPT_SUGGESTIONS.map(suggestion => {
                  const Icon = suggestion.icon
                  return (
                    <Button unstyled
                      className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left text-[13px] leading-[18px] text-inherit hover:border-[var(--tta-border)] hover:bg-[var(--tta-bg)] focus-visible:border-[var(--tta-border)] focus-visible:bg-[var(--tta-bg)] [&_span]:min-w-0 [&_span]:truncate [&_svg]:size-3.5 [&_svg]:flex-none"
                      key={suggestion.label}
                      onClick={() => { setMessage(suggestion.prompt) }}
                      type="button"
                    >
                      <Icon aria-hidden="true" />
                      <span>{suggestion.label}</span>
                    </Button>
                  )
                })}
              </EmptyContent>
            </Empty>
          )}
          {transcriptEntries.map(entry => entry.toolStatus === true
            ? <p className="tocktutor-assistant-tool-status py-0.5 text-xs text-[var(--tta-muted)]" key={entry.key}>{entry.text}</p>
            : (
                <article
                  aria-label={`${entry.label} transcript entry`}
                  className={entry.label === 'You' || entry.label === 'Steering'
                    ? 'tocktutor-assistant-user-message max-w-[88%] self-end rounded-[10px] bg-[var(--tta-bg)] px-2.5 py-2 leading-normal [overflow-wrap:anywhere]'
                    : 'tocktutor-assistant-answer grid gap-2 leading-[1.55] [overflow-wrap:anywhere]'}
                  key={entry.key}
                >
                  {entry.label !== 'You' && entry.label !== 'Steering' && <p className="tocktutor-assistant-kicker text-[11px] font-semibold text-[var(--tta-muted)]">TockTutor Assistant</p>}
                  <p>{entry.text}</p>
                </article>
              ))}
          {partial !== '' && (
            <article aria-label="Streaming assistant transcript entry" className="tocktutor-assistant-answer grid gap-2 leading-[1.55] [overflow-wrap:anywhere]">
              <p className="tocktutor-assistant-kicker text-[11px] font-semibold text-[var(--tta-muted)]">TockTutor Assistant</p>
              <p>{partial}</p>
            </article>
          )}
          {transcript.runningCalls.slice(0, 20).map(call => (
            <p className="tocktutor-assistant-tool-status py-0.5 text-xs text-[var(--tta-muted)]" key={call.callId}>{boundedText(call.name, 127)} · Reading…</p>
          ))}
          {transcriptError !== null && transcriptError !== undefined && (
            <Alert unstyled className="tocktutor-assistant-error rounded-lg border border-[var(--tta-border)] p-2 text-xs text-[#b42318]">{boundedText(transcriptError, 500)}</Alert>
          )}
          {(proposalPage?.proposals.length ?? 0) > 0 && (
            <section aria-label="Staged Proposals" className="tocktutor-assistant-reviews grid gap-2.5">
              <h2 className="text-xs tracking-[.04em] uppercase">Staged Proposals</h2>
              {proposalPage?.proposals.slice(0, 20).map(proposal => {
                const expired = proposal.expiresAt <= renderedAt
                const pendingDecision = activeDecision?.proposalId === proposal.proposalId
                const operation = proposal.operation === 'create' ? 'Create' : 'Update'
                return (
                  <article className="grid gap-[7px] rounded-lg border border-[var(--tta-border)] bg-[var(--tta-bg)] p-2.5" key={proposal.proposalId}>
                    <h3 className="text-[13px] [overflow-wrap:anywhere]">{operation} {proposal.destination}</h3>
                    <p className="text-xs text-[var(--tta-muted)]">{String(proposal.contentChars)} characters · {String(proposal.contentBytes)} bytes</p>
                    <pre className="m-0 max-h-[180px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--tta-border)] bg-[var(--tta-panel)] p-2 font-mono text-xs leading-normal">{boundedText(proposal.preview, 1_000)}</pre>
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
                    <div className="flex flex-wrap gap-1.5">
                      <Button unstyled
                        aria-label={expired ? undefined : `Approve ${operation} ${proposal.destination}`}
                        className="cursor-pointer rounded-[7px] border border-[var(--tta-accent)] bg-[var(--tta-accent)] px-[9px] py-1.5 font-semibold text-white disabled:cursor-default disabled:opacity-50"
                        disabled={expired || activeDecision !== null}
                        onClick={() => { decideProposal(proposal, 'approve') }}
                        type="button"
                      >
                        {expired ? 'Expired' : pendingDecision && activeDecision.action === 'approve' ? 'Approving…' : 'Approve'}
                      </Button>
                      <Button unstyled
                        aria-label={`Reject ${operation} ${proposal.destination}`}
                        className="cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50"
                        disabled={expired || activeDecision !== null}
                        onClick={() => { decideProposal(proposal, 'reject') }}
                        type="button"
                      >
                        {pendingDecision && activeDecision.action === 'reject' ? 'Rejecting…' : 'Reject'}
                      </Button>
                    </div>
                  </article>
                )
              })}
              {proposalPage !== null && (proposalOffset > 0 || proposalPage.nextOffset !== null) && (
                <nav aria-label="Proposal Pages" className="flex flex-wrap gap-1.5">
                  <Button unstyled
                    aria-label="Previous Proposal Page"
                    className="cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50"
                    disabled={proposalOffset === 0}
                    onClick={() => { void loadProposals(Math.max(0, proposalOffset - 20)) }}
                    type="button"
                  >Previous</Button>
                  <Button unstyled
                    aria-label="Next Proposal Page"
                    className="cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50"
                    disabled={proposalPage.nextOffset === null}
                    onClick={() => { if (proposalPage.nextOffset !== null) void loadProposals(proposalPage.nextOffset) }}
                    type="button"
                  >Next</Button>
                </nav>
              )}
            </section>
          )}
        </section>
      </div>
      {showJumpToLatest && (
        <Button unstyled className="tocktutor-assistant-jump absolute right-4 bottom-28 z-2 flex items-center gap-[5px] rounded-lg border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[5px] text-xs shadow-[0_1px_4px_rgb(0_0_0_/_10%)] [&_svg]:size-3.5" onClick={scrollToLatest} type="button">
          <ArrowDown aria-hidden="true" />
          Jump to Latest
        </Button>
      )}
      <div className="tocktutor-assistant-composer-wrap relative flex-none px-3 pb-3">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverContent
            unstyled
            align="start"
            aria-label="Assistant Options"
            className="tocktutor-assistant-add-menu z-[2147483647] grid max-h-[min(520px,calc(100vh-180px))] w-[min(304px,calc(100vw-24px))] gap-1 overflow-auto rounded-[10px] border border-[var(--tta-border,#d9dde5)] bg-[var(--tta-panel,#fff)] p-2 text-inherit shadow-[0_8px_24px_rgb(0_0_0_/_12%)] outline-none [--tta-accent:var(--tt-accent,#4f46e5)] [--tta-bg:var(--tt-bg,#f7f8fa)] [--tta-border:var(--tt-border,#d9dde5)] [--tta-muted:var(--tt-muted,#667085)] [--tta-panel:var(--tt-panel,#fff)]"
            id="tocktutor-assistant-add-menu"
            side="top"
            sideOffset={8}
          >
          <Button unstyled
            className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left text-[13px] leading-[18px] text-inherit hover:border-[var(--tta-border)] hover:bg-[var(--tta-bg)] focus-visible:border-[var(--tta-border)] focus-visible:bg-[var(--tta-bg)] disabled:cursor-default disabled:opacity-50 [&_span]:min-w-0 [&_span]:truncate [&_svg]:size-3.5 [&_svg]:flex-none"
            disabled={props.activePath === null}
            onClick={() => {
              if (props.activePath !== null) setMessage(currentMessage => [currentMessage.trim(), `Use ${props.activePath} as context.`].filter(Boolean).join('\n'))
              setMenuOpen(false)
            }}
            type="button"
          >
            <FileText aria-hidden="true" />
            <span>{props.activePath ?? 'Current Note'}</span>
          </Button>
          <details className="border-t border-[var(--tta-border)] pt-1">
            <summary className="cursor-pointer px-2 py-1.5 text-[13px]">Assistant Settings</summary>
            <form className="grid gap-2 p-2" onSubmit={saveSettings}>
              <Label unstyled className="grid gap-1 text-xs">
                Provider
                <Input unstyled
                  aria-label="Provider"
                  className="w-full rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[7px] text-inherit"
                  disabled={settings === null || settingsSaving}
                  maxLength={127}
                  onChange={event => {
                    setSettings(currentSettings => currentSettings === null
                      ? null
                      : { ...currentSettings, provider: event.target.value })
                  }}
                  value={settings?.provider ?? ''}
                />
              </Label>
              <Label unstyled className="grid gap-1 text-xs">
                Model
                <Input unstyled
                  aria-label="Model"
                  className="w-full rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[7px] text-inherit"
                  disabled={settings === null || settingsSaving}
                  maxLength={127}
                  onChange={event => {
                    setSettings(currentSettings => currentSettings === null
                      ? null
                      : { ...currentSettings, model: event.target.value })
                  }}
                  value={settings?.model ?? ''}
                />
              </Label>
              <Label unstyled className="grid gap-1 text-xs">
                Write Permission
                <NativeSelect unstyled
                  aria-label="Write Permission"
                  className="w-full rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[7px] text-inherit"
                  disabled={settings === null || settingsSaving}
                  onChange={event => {
                    const writePermission = event.target.value === 'propose' ? 'propose' : 'read-only'
                    setSettings(currentSettings => currentSettings === null
                      ? null
                      : { ...currentSettings, writePermission })
                  }}
                  value={settings?.writePermission ?? 'read-only'}
                >
                  <NativeSelectOption value="read-only">Read Only</NativeSelectOption>
                  <NativeSelectOption value="propose">Propose Writes</NativeSelectOption>
                </NativeSelect>
              </Label>
              <Button unstyled className="cursor-pointer rounded-[7px] border border-[var(--tta-accent)] bg-[var(--tta-accent)] px-[9px] py-1.5 font-semibold text-white disabled:cursor-default disabled:opacity-50" disabled={settings === null || settingsSaving} type="submit">
                {settingsSaving ? 'Saving…' : 'Save Settings'}
              </Button>
            </form>
          </details>
          <details className="border-t border-[var(--tta-border)] pt-1">
            <summary className="cursor-pointer px-2 py-1.5 text-[13px]">Audit History</summary>
            <section aria-label="Audit History" className="tocktutor-assistant-audit grid gap-2 p-2">
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
                  <article aria-label={`Audit entry ${entry.auditId}`} className="grid gap-[7px] rounded-lg border border-[var(--tta-border)] bg-[var(--tta-bg)] p-2.5 [&>h3]:text-[13px] [&>h3]:[overflow-wrap:anywhere] [&>p]:text-xs [&>p]:text-[var(--tta-muted)] [&>span]:text-xs [&>span]:text-[var(--tta-muted)] [&>time]:text-xs [&>time]:text-[var(--tta-muted)]" key={entry.auditId}>
                    <h3>{outcome} {operation} {entry.destination}</h3>
                    {time === null
                      ? <span>Time Unavailable</span>
                      : <time dateTime={time.dateTime}>{time.label}</time>}
                    {entry.reason !== undefined && <p>{boundedText(entry.reason, 500)}</p>}
                  </article>
                )
              })}
              {auditPage !== null && (auditOffset > 0 || auditPage.nextOffset !== null) && (
                <nav aria-label="Audit Pages" className="flex flex-wrap gap-1.5">
                  <Button unstyled
                    aria-label="Previous Audit Page"
                    className="cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50"
                    disabled={auditOffset === 0}
                    onClick={() => { void loadAudit(Math.max(0, auditOffset - 20)) }}
                    type="button"
                  >Previous</Button>
                  <Button unstyled
                    aria-label="Next Audit Page"
                    className="cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50"
                    disabled={auditPage.nextOffset === null}
                    onClick={() => { if (auditPage.nextOffset !== null) void loadAudit(auditPage.nextOffset) }}
                    type="button"
                  >Next</Button>
                </nav>
              )}
            </section>
          </details>
          </PopoverContent>
          <form className="tocktutor-assistant-composer flex min-h-24 flex-col gap-2 rounded-2xl border border-[var(--tta-border)] bg-[var(--tta-panel)] p-2.5 focus-within:border-[var(--tta-accent)]" onSubmit={send}>
          <Textarea unstyled
            aria-label="Assistant Message"
            className="min-h-12 w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[18px] text-inherit outline-0 focus-visible:shadow-none focus-visible:outline-none"
            id="tocktutor-assistant-message"
            maxLength={8_000}
            onChange={event => { setMessage(event.target.value) }}
            onKeyDown={submitOnEnter}
            placeholder="What are your thoughts?"
            rows={3}
            value={message}
          />
            <div className="flex items-center justify-between">
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button unstyled
                      aria-label="Add Context"
                      className="tocktutor-assistant-icon-button flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-inherit [&_svg]:size-3.5"
                      type="button"
                    ><Plus aria-hidden="true" /></Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Add Context</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button unstyled
                    aria-label="Send"
                    className="tocktutor-assistant-send flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--tta-accent)] p-0 text-white disabled:cursor-default disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:stroke-white [&_svg]:text-white"
                    disabled={message.trim() === ''}
                    type="submit"
                  ><ArrowUp aria-hidden="true" /></Button>
                </TooltipTrigger>
                <TooltipContent>Send</TooltipContent>
              </Tooltip>
            </div>
          </form>
        </Popover>
      </div>
      <Alert unstyled aria-live="polite" className="tocktutor-assistant-status absolute right-3 bottom-[120px] left-3 z-2 rounded-[7px] bg-[color-mix(in_srgb,var(--tta-accent)_9%,var(--tta-panel))] px-2.5 py-2 text-xs text-[var(--tta-muted)] empty:hidden" ref={statusRef} role="status" tabIndex={-1}>
        {status === null ? '' : boundedText(status, 500)}
      </Alert>
      </aside>
    </TooltipProvider>
  )
}
