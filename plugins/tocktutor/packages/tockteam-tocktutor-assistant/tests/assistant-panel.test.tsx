import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import {
  TockTutorAssistantPanel,
  type AssistantConversationSnapshot,
  type AssistantPanelRemote,
  type AssistantPanelSessions,
} from '../src/assistant-panel.tsx'

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
  }
}

function success<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

function failure(code: string, message: string) {
  return Promise.resolve({ ok: false as const, error: { code, details: {}, message } })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function emptyConversation(): AssistantConversationSnapshot {
  return {
    lastAgentError: null,
    nodes: [],
    openError: null,
    openState: 'open',
    partial: null,
    promptError: null,
    running: false,
    runningCalls: [],
  }
}

class FakeSession {
  private notifier = new Set<() => void>()
  snapshot = emptyConversation()

  get listenerCount(): number { return this.notifier.size }

  getSnapshot(): AssistantConversationSnapshot {
    return this.snapshot
  }
  subscribe(listener: () => void): () => void {
    this.notifier.add(listener)
    return () => { this.notifier.delete(listener) }
  }
  publish(snapshot: AssistantConversationSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.notifier) listener()
  }
}

class FakeSessionList {
  readonly notifier = new Set<() => void>()

  getSnapshot(): { current: string } {
    return { current: 'selected-agent' }
  }
  subscribe(listener: () => void): () => void {
    this.notifier.add(listener)
    return () => { this.notifier.delete(listener) }
  }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('TockTutorAssistantPanel', () => {
  it('sends through the selected Agent scope and renders bounded streaming and read status', async () => {
    const turnCalls: Array<{ mode: string; text: string; signal?: AbortSignal }> = []
    const session = new FakeSession()
    const scopedRemote = {
      tocktutorAssistant: {
        continueTurn(request: { mode: string; text: string }, signal?: AbortSignal) {
          turnCalls.push({ ...request, ...(signal === undefined ? {} : { signal }) })
          return success({ status: 'accepted' as const, ...request, redacted: true, truncated: false })
        },
      },
    }
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: () => success({
          auditCorrelationId: 'audit-1', destination: 'Notes/New.md', operation: 'create' as const,
          proposalId: 'proposal-1', snapshotCaptured: false, status: 'created' as const,
        }),
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'safe-provider', model: 'safe-model', writePermission: 'propose' as const }),
        listProposals: () => success({ nextOffset: null, proposals: [], total: 0 }),
        rejectProposal: () => success({ auditCorrelationId: 'audit-1', proposalId: 'proposal-1' }),
        saveSettings: settings => success(settings),
      },
    }
    const list = new FakeSessionList()
    const sessions: AssistantPanelSessions = {
      binding: () => ({ session }),
      list,
      scope: () => ({ remote: scopedRemote }) as never,
    }

    const view: ReactNode = <TockTutorAssistantPanel
      activePath="Folder/Plan.md"
      remote={remote}
      sessions={sessions}
      vault={{ generation: 7, id: `vault:${'a'.repeat(64)}` }}
    />
    const mounted = render(view)
    expect(screen.getByRole('complementary', { name: 'TockTutor Assistant' }).className).toContain('bg-[var(--tta-panel)]')
    expect(screen.getByRole('heading', { name: 'What can I help you with?' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Provider' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Summarize the current note' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find related notes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Complete writing with AI' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Freely communicate with AI' })).toBeTruthy()
    const composer = screen.getByRole('textbox', { name: 'Assistant Message' }) as HTMLTextAreaElement
    expect(composer.placeholder).toBe('What are your thoughts?')
    expect(composer.className).toContain('focus-visible:outline-none')
    expect(screen.getByRole('button', { name: 'Send' }).className).toContain('[&_svg]:stroke-white')
    fireEvent.click(screen.getByRole('button', { name: 'Summarize the current note' }))
    expect(composer.value).toBe('Summarize the current note.')

    fireEvent.change(composer, { target: { value: 'Summarize this note.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Message accepted. Live output appears below.')
    expect(turnCalls).toHaveLength(1)
    expect(turnCalls[0]?.mode).toBe('followup')
    expect(turnCalls[0]?.text).toBe('Active note: Folder/Plan.md\n\nSummarize this note.')

    session.publish({
      ...emptyConversation(),
      partial: { blocks: [{ kind: 'text', text: 'Reading the note now…' }], step: 1, turn: 1 },
      running: true,
      runningCalls: [{ callId: 'read-1', name: 'read_note' }],
    } as never)
    expect(await screen.findByText('Reading the note now…')).toBeTruthy()
    expect(screen.getByText('read_note · Reading…')).toBeTruthy()

    mounted.unmount()
    expect(list.notifier.size).toBe(0)
  })

  it('edits and saves bounded provider settings with pending and committed feedback', async () => {
    const save = deferred<Awaited<ReturnType<AssistantPanelRemote['tocktutorAssistant']['saveSettings']>>>()
    const saved: unknown[] = []
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: () => success({
          auditCorrelationId: 'audit-1', destination: 'Notes/New.md', operation: 'create' as const,
          proposalId: 'proposal-1', snapshotCaptured: false, status: 'created' as const,
        }),
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'provider-a', model: 'model-a', writePermission: 'read-only' as const }),
        listProposals: () => success({ nextOffset: null, proposals: [], total: 0 }),
        rejectProposal: () => success({ auditCorrelationId: 'audit-1', proposalId: 'proposal-1' }),
        saveSettings: settings => {
          saved.push(settings)
          return save.promise
        },
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)
    const addContext = screen.getByRole('button', { name: 'Add Context' })
    fireEvent.focus(addContext)
    expect((await screen.findByRole('tooltip')).textContent).toContain('Add Context')
    fireEvent.click(addContext)
    expect(await screen.findByDisplayValue('provider-a')).toBeTruthy()
    expect(screen.getByText('Assistant Settings')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByText('Assistant Settings')).toBeNull() })
    fireEvent.click(addContext)
    fireEvent.click(screen.getByText('Assistant Settings'))

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'provider-b' } })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } })
    fireEvent.change(screen.getByLabelText('Write Permission'), { target: { value: 'propose' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(saved).toEqual([{ provider: 'provider-b', model: 'model-b', writePermission: 'propose' }])

    await act(async () => {
      save.resolve(await success({ provider: 'provider-b', model: 'model-b', writePermission: 'propose' }))
    })
    expect(await screen.findByText('Settings saved.')).toBeTruthy()
    expect(screen.getByDisplayValue('provider-b')).toBeTruthy()
  })

  it('renders redacted create and update reviews and approves one live proposal explicitly', async () => {
    const approval = deferred<Awaited<ReturnType<AssistantPanelRemote['tocktutorAssistant']['approveProposal']>>>()
    const approveCalls: unknown[] = []
    let listCalls = 0
    const proposals = [
      {
 auditCorrelationId: 'audit-create', contentBytes: 14, contentChars: 14,
        createdAt: Date.now(), destination: 'Notes/New.md', expiresAt: Date.now() + 60_000,
        operation: 'create' as const, preview: '<script>inert()</script>', proposalId: 'proposal-create',
        skippedEntries: ['Skipped.md'], skippedEntryCount: 1, warnings: ['Review the title.'],
      },
      {
 auditCorrelationId: 'audit-update', contentBytes: 20, contentChars: 20,
        createdAt: Date.now(), destination: 'Notes/Old.md', expiresAt: Date.now() - 1,
        operation: 'update' as const, preview: '# Revised', proposalId: 'proposal-update',
        skippedEntries: [], skippedEntryCount: 0, warnings: [],
      },
    ]
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: request => {
          approveCalls.push(request)
          return approval.promise
        },
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'propose' as const }),
        listProposals: () => {
          listCalls += 1
          const visible = listCalls === 1 ? proposals : proposals.slice(1)
          return success({ nextOffset: null, proposals: visible, total: visible.length })
        },
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: settings => success(settings),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath="Notes/New.md" remote={remote} sessions={sessions} vault={null} />)

    expect(await screen.findByRole('heading', { name: 'Create Notes/New.md' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Update Notes/Old.md' })).toBeTruthy()
    expect(screen.getByText('<script>inert()</script>')).toBeTruthy()
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText('Review the title.')).toBeTruthy()
    expect(screen.getByText('1 skipped entry: Skipped.md')).toBeTruthy()
    const expired = screen.getByRole('button', { name: 'Expired' }) as HTMLButtonElement
    expect(expired.disabled).toBe(true)

    const approve = screen.getByRole('button', { name: 'Approve Create Notes/New.md' })
    approve.focus()
    expect(document.activeElement).toBe(approve)
    fireEvent.click(approve)
    expect((approve as HTMLButtonElement).disabled).toBe(true)
    expect(approve.textContent).toBe('Approving…')
    expect(approveCalls).toEqual([{ proposalId: 'proposal-create' }])

    await act(async () => {
      approval.resolve(await success({
        auditCorrelationId: 'audit-create', destination: 'Notes/New.md', operation: 'create',
        proposalId: 'proposal-create', snapshotCaptured: false, status: 'created',
      }))
    })
    const successStatus = await screen.findByText('Notes/New.md was created.')
    expect(document.activeElement).toBe(successStatus)
    await waitFor(() => { expect(screen.queryByRole('heading', { name: 'Create Notes/New.md' })).toBeNull() })
  })

  it('rejects explicitly and surfaces a Host stale-proposal refusal without treating it as approval', async () => {
    const base = {
      auditCorrelationId: 'audit', contentBytes: 8, contentChars: 8, createdAt: Date.now(),
      expiresAt: Date.now() + 60_000, operation: 'update' as const, preview: '# Review',
      skippedEntries: [], skippedEntryCount: 0, warnings: [],
    }
    const rejected = { ...base, destination: 'Reject.md', proposalId: 'reject-proposal' }
    const stale = { ...base, destination: 'Stale.md', proposalId: 'stale-proposal' }
    const rejectCalls: unknown[] = []
    const approveCalls: unknown[] = []
    let page = 0
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: request => {
          approveCalls.push(request)
          return failure('STALE_PROPOSAL', 'This proposal is stale. Refresh the review queue.')
        },
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'propose' as const }),
        listProposals: () => {
          const visible = page === 0 ? [rejected, stale] : page === 1 ? [stale] : []
          page += 1
          return success({ nextOffset: null, proposals: visible, total: visible.length })
        },
        rejectProposal: request => {
          rejectCalls.push(request)
          return success({ auditCorrelationId: 'audit', proposalId: 'reject-proposal' })
        },
        saveSettings: settings => success(settings),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)

    const reject = await screen.findByRole('button', { name: 'Reject Update Reject.md' })
    reject.focus()
    expect(document.activeElement).toBe(reject)
    fireEvent.click(reject)
    expect(await screen.findByText('Reject.md was rejected.')).toBeTruthy()
    expect(rejectCalls).toEqual([{
      reason: 'Rejected from the TockTutor review panel.',
      proposalId: 'reject-proposal',
    }])

    const approveStale = await screen.findByRole('button', { name: 'Approve Update Stale.md' })
    fireEvent.click(approveStale)
    expect(await screen.findByText('This proposal is stale. Refresh the review queue.')).toBeTruthy()
    expect(approveCalls).toEqual([{ proposalId: 'stale-proposal' }])
    await waitFor(() => { expect(screen.queryByRole('heading', { name: 'Update Stale.md' })).toBeNull() })
  })

  it('renders only one bounded audit page and replaces it when navigating', async () => {
    const auditCalls: unknown[] = []
    const auditEntry = (index: number) => ({
      auditCorrelationId: `correlation-${String(index)}`,
      auditId: `audit-${String(index)}`,
      contentBytes: index,
      destination: `Notes/File-${String(index)}.md`,
      operation: 'update' as const,
      outcome: 'applied' as const,
      proposalId: `proposal-${String(index)}`,
      reason: `Bounded reason ${String(index)}`,
      timestamp: index === 24 ? Number.MAX_SAFE_INTEGER : 1_700_000_000_000 + index,
    })
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: () => success({
          auditCorrelationId: 'audit', destination: 'Note.md', operation: 'update' as const,
          proposalId: 'proposal', snapshotCaptured: true, status: 'saved' as const,
        }),
        audit: request => {
          auditCalls.push(request)
          const offset = request.offset ?? 0
          const entries = offset === 0
            ? Array.from({ length: 20 }, (_, index) => auditEntry(index))
            : Array.from({ length: 5 }, (_, index) => auditEntry(20 + index))
          return success({ dropped: 3, entries, nextOffset: offset === 0 ? 20 : null, total: 25 })
        },
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'read-only' as const }),
        listProposals: () => success({ nextOffset: null, proposals: [], total: 0 }),
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: settings => success(settings),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Context' }))
    fireEvent.click(screen.getByText('Audit History'))

    expect(await screen.findByRole('heading', { name: 'Applied Update Notes/File-0.md' })).toBeTruthy()
    expect(screen.getAllByRole('article', { name: /audit entry/iu })).toHaveLength(20)
    expect(screen.getByText('3 older audit entries were dropped by bounded retention.')).toBeTruthy()
    expect(auditCalls).toEqual([{ limit: 20, offset: 0 }])

    fireEvent.click(screen.getByRole('button', { name: 'Next Audit Page' }))
    expect(await screen.findByRole('heading', { name: 'Applied Update Notes/File-24.md' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Applied Update Notes/File-0.md' })).toBeNull()
    expect(screen.getAllByRole('article', { name: /audit entry/iu })).toHaveLength(5)
    expect(screen.getByText('Time Unavailable')).toBeTruthy()
    expect(auditCalls).toEqual([{ limit: 20, offset: 0 }, { limit: 20, offset: 20 }])
  })

  it('keeps proposal pages bounded while making later reviews reachable', async () => {
    const proposalCalls: unknown[] = []
    const proposal = (name: string) => ({
 auditCorrelationId: `${name}-audit`, contentBytes: 1, contentChars: 1,
      createdAt: Date.now(), destination: `${name}.md`, expiresAt: Date.now() + 60_000,
      operation: 'create' as const, preview: name, proposalId: `${name}-proposal`,
      skippedEntries: [], skippedEntryCount: 0, warnings: [],
    })
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: () => success({
          auditCorrelationId: 'audit', destination: 'Note.md', operation: 'create' as const,
          proposalId: 'proposal', snapshotCaptured: false, status: 'created' as const,
        }),
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'propose' as const }),
        listProposals: request => {
          proposalCalls.push(request)
          return request.offset === 20
            ? success({ nextOffset: null, proposals: [proposal('Later')], total: 21 })
            : success({ nextOffset: 20, proposals: [proposal('First')], total: 21 })
        },
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: settings => success(settings),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)

    expect(await screen.findByRole('heading', { name: 'Create First.md' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next Proposal Page' }))
    expect(await screen.findByRole('heading', { name: 'Create Later.md' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Create First.md' })).toBeNull()
    expect(proposalCalls).toEqual([{ limit: 20, offset: 0 }, { limit: 20, offset: 20 }])
  })

  it('renders a bounded escaped transcript plus completed and failed tool status', async () => {
    const session = new FakeSession()
    session.snapshot = {
      ...emptyConversation(),
      nodes: [
        ...Array.from({ length: 25 }, (_, index) => ({
          content: [{ text: `Message ${String(index)}`, type: 'text' }],
          kind: 'user', seq: index, time: index,
        })),
        {
          blocks: [{
            kind: 'text',
            text: `<b>safe</b> OPENAI_API_KEY=top-secret path=/Users/alice/private ${'x'.repeat(5_000)}`,
          }],
          kind: 'assistant', seq: 26, step: 1, time: 26, turn: 1,
        },
        {
          call: { argsRaw: '{}', name: 'read_note' }, callId: 'read-done', content: [],
          isError: false, kind: 'tool-result', seq: 27, time: 27,
        },
        {
          call: { argsRaw: '{}', name: 'search_notes' }, callId: 'search-failed', content: [],
          isError: true, kind: 'tool-result', seq: 28, time: 28,
        },
      ],
      promptError: { error: { message: 'Failed at C:\\Users\\alice\\private token=error-secret' } },
    }
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: () => success({
          auditCorrelationId: 'audit', destination: 'Note.md', operation: 'update' as const,
          proposalId: 'proposal', snapshotCaptured: true, status: 'saved' as const,
        }),
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'read-only' as const }),
        listProposals: () => success({ nextOffset: null, proposals: [], total: 0 }),
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: settings => success(settings),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => ({ session }),
      list: { getSnapshot: () => ({ current: 'selected' }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)

    expect(await screen.findByText('Message 8')).toBeTruthy()
    expect(screen.queryByText('Message 7')).toBeNull()
    const assistantText = screen.getByText(text => text.startsWith('<b>safe</b>'))
    expect(assistantText.textContent?.length).toBeLessThanOrEqual(2_001)
    expect(assistantText.textContent).toContain('[REDACTED]')
    expect(document.querySelector('b')).toBeNull()
    expect(screen.getByText('read_note · Completed')).toBeTruthy()
    expect(screen.getByText('search_notes · Failed')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('[REDACTED]')
    expect(document.body.textContent).not.toMatch(/top-secret|Users\\alice|error-secret/u)
  })

  it('aborts route-scoped review loads and drops late results after a vault switch', async () => {
    const oldProposals = deferred<Awaited<ReturnType<AssistantPanelRemote['tocktutorAssistant']['listProposals']>>>()
    const oldAudit = deferred<Awaited<ReturnType<AssistantPanelRemote['tocktutorAssistant']['audit']>>>()
    const proposalSignals: AbortSignal[] = []
    const auditSignals: AbortSignal[] = []
    let proposalCalls = 0
    let auditCalls = 0
    const proposal = (name: string) => ({
 auditCorrelationId: `${name}-audit`, contentBytes: 1, contentChars: 1,
      createdAt: Date.now(), destination: `${name}.md`, expiresAt: Date.now() + 60_000,
      operation: 'create' as const, preview: name, proposalId: `${name}-proposal`,
      skippedEntries: [], skippedEntryCount: 0, warnings: [],
    })
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: () => success({
          auditCorrelationId: 'audit', destination: 'Note.md', operation: 'create' as const,
          proposalId: 'proposal', snapshotCaptured: false, status: 'created' as const,
        }),
        audit: (_request, signal) => {
          if (signal !== undefined) auditSignals.push(signal)
          auditCalls += 1
          return auditCalls === 1
            ? oldAudit.promise
            : success({ dropped: 0, entries: [], nextOffset: null, total: 0 })
        },
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'propose' as const }),
        listProposals: (_request, signal) => {
          if (signal !== undefined) proposalSignals.push(signal)
          proposalCalls += 1
          return proposalCalls === 1
            ? oldProposals.promise
            : success({ nextOffset: null, proposals: [proposal('New')], total: 1 })
        },
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: settings => success(settings),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    const mounted = render(<TockTutorAssistantPanel
      activePath="Old.md"
      remote={remote}
      sessions={sessions}
      vault={{ generation: 1, id: `vault:${'1'.repeat(64)}` }}
    />)
    await waitFor(() => { expect(proposalCalls).toBe(1); expect(auditCalls).toBe(1) })

    mounted.rerender(<TockTutorAssistantPanel
      activePath="New.md"
      remote={remote}
      sessions={sessions}
      vault={{ generation: 2, id: `vault:${'2'.repeat(64)}` }}
    />)
    expect(await screen.findByRole('heading', { name: 'Create New.md' })).toBeTruthy()
    expect(proposalSignals[0]?.aborted).toBe(true)
    expect(auditSignals[0]?.aborted).toBe(true)

    await act(async () => {
      oldProposals.resolve(await success({ nextOffset: null, proposals: [proposal('Old')], total: 1 }))
      oldAudit.resolve(await success({
        dropped: 0,
        entries: [{
          auditCorrelationId: 'old', auditId: 'old-audit', contentBytes: 1, destination: 'Old.md',
          operation: 'create', outcome: 'staged', proposalId: 'old-proposal', timestamp: Date.now(),
        }],
        nextOffset: null,
        total: 1,
      }))
    })
    expect(screen.queryByRole('heading', { name: 'Create Old.md' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Staged Create Old.md' })).toBeNull()
  })

  it('does not revive an aborted decision after navigating A to B to A', async () => {
    const approval = deferred<Awaited<ReturnType<AssistantPanelRemote['tocktutorAssistant']['approveProposal']>>>()
    const decisionSignals: AbortSignal[] = []
    const staged = {
 auditCorrelationId: 'audit', contentBytes: 1, contentChars: 1,
      createdAt: Date.now(), destination: 'Same.md', expiresAt: Date.now() + 60_000,
      operation: 'create' as const, preview: 'same', proposalId: 'proposal',
      skippedEntries: [], skippedEntryCount: 0, warnings: [],
    }
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: (_request, signal) => {
          if (signal !== undefined) decisionSignals.push(signal)
          return approval.promise
        },
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'propose' as const }),
        listProposals: () => success({ nextOffset: null, proposals: [staged], total: 1 }),
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: value => success(value),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    const vaultA = { generation: 1, id: `vault:${'a'.repeat(64)}` }
    const vaultB = { generation: 2, id: `vault:${'b'.repeat(64)}` }
    const mounted = render(<TockTutorAssistantPanel activePath="A.md" remote={remote} sessions={sessions} vault={vaultA} />)
    const approve = await screen.findByRole('button', { name: 'Approve Create Same.md' }) as HTMLButtonElement
    fireEvent.click(approve)
    expect(approve.disabled).toBe(true)

    mounted.rerender(<TockTutorAssistantPanel activePath="B.md" remote={remote} sessions={sessions} vault={vaultB} />)
    await waitFor(() => { expect(decisionSignals[0]?.aborted).toBe(true) })
    mounted.rerender(<TockTutorAssistantPanel activePath="A.md" remote={remote} sessions={sessions} vault={vaultA} />)
    const revisited = await screen.findByRole('button', { name: 'Approve Create Same.md' }) as HTMLButtonElement
    expect(revisited.disabled).toBe(false)
    expect(revisited.textContent).toBe('Approve')
    mounted.unmount()
  })

  it('aborts every pending request and removes session subscriptions on unmount', async () => {
    const signals: AbortSignal[] = []
    const never = <T,>(signal?: AbortSignal): Promise<T> => {
      if (signal !== undefined) signals.push(signal)
      return new Promise<T>(() => {})
    }
    const session = new FakeSession()
    const listListeners = new Set<() => void>()
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: (_request, signal) => never(signal),
        audit: (_request, signal) => never(signal),
        currentSettings: signal => never(signal),
        listProposals: (_request, signal) => never(signal),
        rejectProposal: (_request, signal) => never(signal),
        saveSettings: (_settings, signal) => never(signal),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => ({ session }),
      list: {
        getSnapshot: () => ({ current: 'selected' }),
        subscribe: listener => {
          listListeners.add(listener)
          return () => { listListeners.delete(listener) }
        },
      },
      scope: () => ({
        remote: {
          tocktutorAssistant: {
            continueTurn: (_request, signal) => never(signal),
          },
        },
      }),
    }
    const mounted = render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)
    await waitFor(() => { expect(signals).toHaveLength(3) })
    expect(listListeners.size).toBe(1)
    expect(session.listenerCount).toBe(1)

    fireEvent.change(screen.getByLabelText('Assistant Message'), { target: { value: 'Pending request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => { expect(signals).toHaveLength(4) })
    mounted.unmount()

    expect(signals.every(signal => signal.aborted)).toBe(true)
    expect(listListeners.size).toBe(0)
    expect(session.listenerCount).toBe(0)
  })

  it('does not hide a review-load failure when settings finish later', async () => {
    const settings = deferred<Awaited<ReturnType<AssistantPanelRemote['tocktutorAssistant']['currentSettings']>>>()
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: () => success({
          auditCorrelationId: 'audit', destination: 'Note.md', operation: 'create' as const,
          proposalId: 'proposal', snapshotCaptured: false, status: 'created' as const,
        }),
        audit: () => failure('AUDIT_UNAVAILABLE', 'Audit history is temporarily unavailable.'),
        currentSettings: () => settings.promise,
        listProposals: () => success({ nextOffset: null, proposals: [], total: 0 }),
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: value => success(value),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)
    expect(await screen.findByText('Audit history is temporarily unavailable.')).toBeTruthy()

    await act(async () => {
      settings.resolve(await success({ provider: 'provider', model: 'model', writePermission: 'read-only' }))
    })
    expect(screen.getByText('Audit history is temporarily unavailable.')).toBeTruthy()
  })

  it('refuses a proposal that expires after rendering and explains the refusal', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const approveCalls: unknown[] = []
    const remote: AssistantPanelRemote = {
      tocktutorAssistant: {
        approveProposal: request => {
          approveCalls.push(request)
          return success({
            auditCorrelationId: 'audit', destination: 'Soon.md', operation: 'create' as const,
            proposalId: 'proposal', snapshotCaptured: false, status: 'created' as const,
          })
        },
        audit: () => success({ dropped: 0, entries: [], nextOffset: null, total: 0 }),
        currentSettings: () => success({ provider: 'provider', model: 'model', writePermission: 'propose' as const }),
        listProposals: () => success({
          nextOffset: null,
          proposals: [{
 auditCorrelationId: 'audit', contentBytes: 1, contentChars: 1,
            createdAt: now, destination: 'Soon.md', expiresAt: 2_000, operation: 'create',
            preview: 'Soon', proposalId: 'proposal', skippedEntries: [], skippedEntryCount: 0, warnings: [],
          }],
          total: 1,
        }),
        rejectProposal: () => success({ auditCorrelationId: 'audit', proposalId: 'proposal' }),
        saveSettings: value => success(value),
      },
    }
    const sessions: AssistantPanelSessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} },
      scope: () => undefined,
    }
    render(<TockTutorAssistantPanel activePath={null} remote={remote} sessions={sessions} vault={null} />)
    const approve = await screen.findByRole('button', { name: 'Approve Create Soon.md' })

    now = 3_000
    fireEvent.click(approve)
    expect(await screen.findByText('This proposal has expired. Refresh the review queue.')).toBeTruthy()
    expect(approveCalls).toEqual([])
  })
})
