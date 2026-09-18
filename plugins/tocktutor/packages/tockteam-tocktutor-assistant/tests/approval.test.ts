import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type {
  CreateDocumentRequest,
  NoteVaultState,
  OpenDocumentResult,
  SaveDocumentRequest,
  WriteDocumentResult,
} from 'tockbot-note-runtime'
import {
  Config as RuntimeConfig,
  NoteVaultRuntime,
} from 'tockbot-note-runtime'
import {
  ApprovalError,
  ProposalApprovalExecutor,
  type ApprovalRuntime,
} from '../src/approval.ts'
import {
  ProposalError,
  ProposalQueue,
  type ApprovalContext,
  type StageProposalInput,
} from '../src/proposals.ts'

const context: ApprovalContext = {
  vaultId: 'vault-12345678',
  vaultGeneration: 3,
  childInstanceId: 'child-12345678',
  turnId: 'turn-12345678',
  requestId: 'request-12345678',
  provider: 'test-provider',
  model: 'test-model',
  writePermission: 'propose',
  permissionEpoch: 0,
}

function ids() {
  let index = 0
  return () => `opaque-${(++index).toString().padStart(8, '0')}`
}

function queue(): ProposalQueue {
  return new ProposalQueue({ clock: () => 1_000, randomId: ids() })
}

function stage(
  proposals: ProposalQueue,
  overrides: Partial<StageProposalInput> = {},
) {
  return proposals.stage({
    ...context,
    destination: 'notes/new.md',
    operation: 'create',
    expectedTarget: { exists: false },
    content: '# New note',
    ...overrides,
  })
}

function document(
  path: string,
  revision = `file:${'a'.repeat(64)}`,
  content = '# Existing',
): OpenDocumentResult {
  return {
    content,
    digest: `sha256:${'b'.repeat(64)}`,
    generation: context.vaultGeneration,
    path,
    revision,
  }
}

function noteError(code: string, detail = 'Bearer secret /Users/max/vault'): Error {
  return Object.assign(new Error(detail), { name: 'NoteVaultError', code })
}

class FakeApprovalRuntime implements ApprovalRuntime {
  state: NoteVaultState = { active: true, id: context.vaultId, generation: context.vaultGeneration }
  documents = new Map<string, OpenDocumentResult>()
  opens: string[] = []
  creates: CreateDocumentRequest[] = []
  saves: SaveDocumentRequest[] = []
  createFailure: unknown = null
  saveFailure: unknown = null
  openPending: Promise<OpenDocumentResult> | null = null
  createPending: Promise<WriteDocumentResult> | null = null
  savePending: Promise<WriteDocumentResult> | null = null
  createResult: WriteDocumentResult = {
    digest: `sha256:${'c'.repeat(64)}`,
    generation: context.vaultGeneration,
    path: 'notes/new.md',
    revision: `file:${'d'.repeat(64)}`,
    status: 'created',
  }
  saveResult: WriteDocumentResult = {
    digest: `sha256:${'c'.repeat(64)}`,
    generation: context.vaultGeneration,
    path: 'notes/existing.md',
    revision: `file:${'e'.repeat(64)}`,
    snapshotId: 'snapshot-12345678',
    status: 'saved',
  }

  async openDocument(path: string): Promise<OpenDocumentResult> {
    this.opens.push(path)
    if (this.openPending !== null) return this.openPending
    const result = this.documents.get(path)
    if (result === undefined) throw noteError('not-found')
    return result
  }

  async createDocument(
    request: CreateDocumentRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    this.creates.push(request)
    if (this.createPending !== null) await this.createPending
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    if (this.createFailure !== null) throw this.createFailure
    return this.createResult
  }

  async saveDocument(
    request: SaveDocumentRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    this.saves.push(request)
    if (this.savePending !== null) await this.savePending
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    if (this.saveFailure !== null) throw this.saveFailure
    return this.saveResult
  }
}

function executor(
  proposals: ProposalQueue,
  runtime: FakeApprovalRuntime,
  current: () => ApprovalContext = () => ({ ...context }),
) {
  return new ProposalApprovalExecutor(proposals, runtime, current)
}

function expectApprovalCode(error: unknown, code: string): boolean {
  return error instanceof ApprovalError && error.code === code
}

test('approved create rechecks absence and performs exactly one exclusive bounded mutation', async () => {
  const proposals = queue()
  const proposal = stage(proposals)
  const runtime = new FakeApprovalRuntime()
  runtime.createResult = {
    ...runtime.createResult,
    digest: `sha256:${proposal.contentDigest}`,
  }

  const result = await executor(proposals, runtime).approve(
    proposal.proposalId, new AbortController().signal,
  )

  assert.deepEqual(runtime.opens, [])
  assert.deepEqual(runtime.creates, [{
    content: '# New note',
    expectedVault: { id: context.vaultId, generation: context.vaultGeneration },
    path: 'notes/new.md',
  }])
  assert.deepEqual(result, {
    proposalId: proposal.proposalId,
    auditCorrelationId: proposal.auditCorrelationId,
    operation: 'create',
    path: 'notes/new.md',
    snapshotCaptured: false,
    status: 'created',
  })
  assert.doesNotMatch(JSON.stringify(result), /sha256:|file:|# New note/u)
  assert.equal(proposals.audit().at(-1)?.outcome, 'applied')
  assert.equal(
    ProposalQueue.hydrate(proposals.serialize()).audit().at(-1)?.outcome,
    'applied',
  )
  await assert.rejects(
    executor(proposals, runtime).approve(proposal.proposalId, new AbortController().signal),
    error => error instanceof ProposalError && error.code === 'INVALID_PROPOSAL',
  )
  assert.equal(runtime.creates.length, 1)
})

test('approved update rechecks source and target identities and requires a recovery snapshot', async () => {
  const proposals = queue()
  const sourceContent = '# Source'
  const sourceRevision = `file:${'1'.repeat(64)}`
  const targetRevision = `file:${'2'.repeat(64)}`
  const proposal = stage(proposals, {
    destination: 'notes/existing.md',
    operation: 'update',
    expectedTarget: { exists: true, identity: targetRevision },
    source: {
      relativePath: 'notes/source.md',
      identity: sourceRevision,
      contentDigest: (await import('../src/proposals.ts')).sha256(sourceContent),
    },
    content: '# Updated',
  })
  const runtime = new FakeApprovalRuntime()
  runtime.documents.set('notes/source.md', {
    ...document('notes/source.md', sourceRevision, sourceContent),
    digest: `sha256:${(await import('../src/proposals.ts')).sha256(sourceContent)}`,
  })
  runtime.documents.set('notes/existing.md', document('notes/existing.md', targetRevision))
  runtime.saveResult = {
    ...runtime.saveResult,
    digest: `sha256:${proposal.contentDigest}`,
  }

  const result = await executor(proposals, runtime).approve(
    proposal.proposalId, new AbortController().signal,
  )

  assert.deepEqual(runtime.opens, ['notes/source.md', 'notes/existing.md'])
  assert.deepEqual(runtime.saves, [{
    content: '# Updated',
    expectedRevision: targetRevision,
    expectedVault: { id: context.vaultId, generation: context.vaultGeneration },
    path: 'notes/existing.md',
  }])
  assert.equal(result.snapshotCaptured, true)
  assert.equal(result.status, 'saved')
  assert.equal(proposals.audit().at(-1)?.outcome, 'applied')
})

test('changed source or target burns the token before any mutation', async () => {
  for (const changed of ['source', 'target'] as const) {
    const proposals = queue()
    const proposal = stage(proposals, {
      destination: 'notes/existing.md',
      operation: 'update',
      expectedTarget: { exists: true, identity: `file:${'2'.repeat(64)}` },
      source: {
        relativePath: 'notes/source.md',
        identity: `file:${'1'.repeat(64)}`,
        contentDigest: '3'.repeat(64),
      },
    })
    const runtime = new FakeApprovalRuntime()
    runtime.documents.set('notes/source.md', {
      ...document('notes/source.md', `file:${changed === 'source' ? '9'.repeat(64) : '1'.repeat(64)}`),
      digest: `sha256:${'3'.repeat(64)}`,
    })
    runtime.documents.set(
      'notes/existing.md',
      document('notes/existing.md', `file:${changed === 'target' ? '9'.repeat(64) : '2'.repeat(64)}`),
    )

    await assert.rejects(
      executor(proposals, runtime).approve(proposal.proposalId, new AbortController().signal),
      error => expectApprovalCode(error, changed === 'source' ? 'SOURCE_CHANGED' : 'TARGET_CHANGED'),
    )
    assert.equal(runtime.saves.length, 0)
    assert.equal(proposals.audit().at(-1)?.outcome, 'approval-failed')
    await assert.rejects(
      executor(proposals, runtime).approve(proposal.proposalId, new AbortController().signal),
      error => error instanceof ProposalError && error.code === 'INVALID_PROPOSAL',
    )
  }
})

test('create collision, update conflict, and recovery failure are sanitized and terminal', async () => {
  const cases = [
    { operation: 'create', code: 'exists', expected: 'CREATE_CONFLICT' },
    { operation: 'update', code: 'conflict', expected: 'UPDATE_CONFLICT' },
    { operation: 'update', code: 'recovery-unavailable', expected: 'RECOVERY_UNAVAILABLE' },
  ] as const
  for (const entry of cases) {
    const proposals = queue()
    const isUpdate = entry.operation === 'update'
    const revision = `file:${'2'.repeat(64)}`
    const proposal = stage(proposals, isUpdate ? {
      destination: 'notes/existing.md',
      operation: 'update',
      expectedTarget: { exists: true, identity: revision },
    } : {})
    const runtime = new FakeApprovalRuntime()
    if (isUpdate) {
      runtime.documents.set('notes/existing.md', document('notes/existing.md', revision))
      runtime.saveFailure = noteError(entry.code)
    } else {
      runtime.createFailure = noteError(entry.code)
    }
    await assert.rejects(
      executor(proposals, runtime).approve(proposal.proposalId, new AbortController().signal),
      error => expectApprovalCode(error, entry.expected) && !String(error).includes('/Users/max'),
    )
    assert.equal(proposals.audit().at(-1)?.outcome, 'approval-failed')
  }
})

test('abort before consume preserves a proposal while late fact changes burn it without writing', async () => {
  const proposals = queue()
  const targetRevision = `file:${'a'.repeat(64)}`
  const proposal = stage(proposals, {
    destination: 'notes/existing.md',
    operation: 'update',
    expectedTarget: { exists: true, identity: targetRevision },
  })
  const runtime = new FakeApprovalRuntime()
  const aborted = new AbortController()
  aborted.abort('Bearer secret /Users/max')
  await assert.rejects(
    executor(proposals, runtime).approve(proposal.proposalId, aborted.signal),
    error => expectApprovalCode(error, 'ABORTED'),
  )
  assert.equal(proposals.list().length, 1)

  let resolve!: (value: OpenDocumentResult) => void
  runtime.openPending = new Promise<OpenDocumentResult>(accept => { resolve = accept })
  let activeContext = { ...context }
  const pending = executor(proposals, runtime, () => ({ ...activeContext })).approve(
    proposal.proposalId, new AbortController().signal,
  )
  activeContext = { ...context, childInstanceId: 'child-replaced-12345678' }
  resolve(document('notes/existing.md', targetRevision))
  await assert.rejects(pending, error => expectApprovalCode(error, 'CHILD_REPLACED'))
  assert.equal(runtime.saves.length, 0)
  assert.equal(proposals.list().length, 0)

  const abortQueue = queue()
  const abortProposal = stage(abortQueue, {
    destination: 'notes/existing.md',
    operation: 'update',
    expectedTarget: { exists: true, identity: targetRevision },
  })
  const abortRuntime = new FakeApprovalRuntime()
  let settle!: (value: OpenDocumentResult) => void
  abortRuntime.openPending = new Promise<OpenDocumentResult>(accept => { settle = accept })
  const controller = new AbortController()
  const abortPending = executor(abortQueue, abortRuntime).approve(abortProposal.proposalId, controller.signal)
  controller.abort('Bearer secret /Users/max')
  settle(document('notes/existing.md', targetRevision))
  await assert.rejects(abortPending, error => expectApprovalCode(error, 'ABORTED'))
  assert.equal(abortRuntime.saves.length, 0)
  assert.equal(abortQueue.list().length, 0)
  assert.equal(abortQueue.audit().at(-1)?.outcome, 'approval-failed')
})

test('a runtime success is the commit point even when cancellation arrives with its result', async () => {
  const proposals = queue()
  const proposal = stage(proposals)
  const runtime = new FakeApprovalRuntime()
  runtime.createResult = { ...runtime.createResult, digest: `sha256:${proposal.contentDigest}` }
  const controller = new AbortController()
  const originalCreate = runtime.createDocument.bind(runtime)
  runtime.createDocument = async (request, signal) => {
    const result = await originalCreate(request, signal)
    controller.abort(new Error('late cancellation'))
    return result
  }

  const result = await executor(proposals, runtime).approve(proposal.proposalId, controller.signal)
  assert.equal(result.status, 'created')
  assert.equal(proposals.audit().at(-1)?.outcome, 'applied')
})

test('caller cancellation during a runtime mutation prevents the commit and stays terminal', async () => {
  for (const operation of ['create', 'update'] as const) {
    const proposals = queue()
    const revision = `file:${'a'.repeat(64)}`
    const proposal = stage(proposals, operation === 'create' ? {} : {
      destination: 'notes/existing.md',
      operation: 'update',
      expectedTarget: { exists: true, identity: revision },
    })
    const runtime = new FakeApprovalRuntime()
    if (operation === 'update') {
      runtime.documents.set('notes/existing.md', document('notes/existing.md', revision))
    }
    const pending = Promise.withResolvers<WriteDocumentResult>()
    if (operation === 'create') runtime.createPending = pending.promise
    else runtime.savePending = pending.promise
    const controller = new AbortController()
    const approval = executor(proposals, runtime).approve(proposal.proposalId, controller.signal)
    while ((operation === 'create' ? runtime.creates : runtime.saves).length === 0) {
      await Promise.resolve()
    }
    controller.abort(new Error('cancelled'))
    pending.resolve(operation === 'create' ? runtime.createResult : runtime.saveResult)

    await assert.rejects(approval, error => expectApprovalCode(error, 'ABORTED'))
    assert.deepEqual(proposals.list(), [])
    assert.equal(proposals.audit().at(-1)?.outcome, 'approval-failed')
  }
})

test('permission epoch changes during runtime reads fail before the mutation commit', async () => {
  const proposals = queue()
  const targetRevision = `file:${'a'.repeat(64)}`
  const proposal = stage(proposals, {
    destination: 'notes/existing.md',
    operation: 'update',
    expectedTarget: { exists: true, identity: targetRevision },
  })
  const runtime = new FakeApprovalRuntime()
  runtime.saveResult = { ...runtime.saveResult, digest: `sha256:${proposal.contentDigest}` }
  let settle!: (value: OpenDocumentResult) => void
  runtime.openPending = new Promise<OpenDocumentResult>(accept => { settle = accept })
  let active = { ...context }
  const pending = executor(proposals, runtime, () => ({ ...active })).approve(
    proposal.proposalId,
    new AbortController().signal,
  )

  active = { ...context, writePermission: 'read-only', permissionEpoch: 1 }
  active = { ...context, writePermission: 'propose', permissionEpoch: 2 }
  settle(document('notes/existing.md', targetRevision))
  await assert.rejects(pending, error => expectApprovalCode(error, 'PERMISSION_CHANGED'))
  assert.equal(runtime.saves.length, 0)
  assert.equal(proposals.audit().at(-1)?.reason, 'PERMISSION_CHANGED')
})

test('approval crossing its queue-clock expiry fails before mutation', async () => {
  let now = 1_000
  const proposals = new ProposalQueue({ clock: () => now, randomId: ids() })
  const targetRevision = `file:${'a'.repeat(64)}`
  const proposal = stage(proposals, {
    destination: 'notes/existing.md',
    operation: 'update',
    expectedTarget: { exists: true, identity: targetRevision },
    expiresInMs: 10,
  })
  const runtime = new FakeApprovalRuntime()
  let settle!: (value: OpenDocumentResult) => void
  runtime.openPending = new Promise<OpenDocumentResult>(accept => { settle = accept })
  const pending = executor(proposals, runtime).approve(proposal.proposalId, new AbortController().signal)

  now = proposal.expiresAt
  settle(document('notes/existing.md', targetRevision))
  await assert.rejects(pending, error => expectApprovalCode(error, 'EXPIRED'))
  assert.equal(runtime.saves.length, 0)
  assert.equal(proposals.audit().at(-1)?.reason, 'EXPIRED')
})

test('a committed mutation surfaces durable-audit failure without inventing approval-failed', async () => {
  const proposals = queue()
  const proposal = stage(proposals)
  const runtime = new FakeApprovalRuntime()
  runtime.createResult = { ...runtime.createResult, digest: `sha256:${proposal.contentDigest}` }
  let persistenceCalls = 0
  const approved = new ProposalApprovalExecutor(
    proposals,
    runtime,
    () => ({ ...context }),
    () => {
      persistenceCalls += 1
      return persistenceCalls === 2
        ? Promise.reject(new Error('durable state unavailable'))
        : Promise.resolve()
    },
  )

  await assert.rejects(
    approved.approve(proposal.proposalId, new AbortController().signal),
    error => expectApprovalCode(error, 'OUTCOME_PERSISTENCE_FAILED'),
  )
  assert.equal(runtime.creates.length, 1)
  assert.equal(proposals.audit().at(-1)?.outcome, 'applied')
  assert.deepEqual(proposals.list(), [])
})

test('concurrent approve and reject requests produce exactly one terminal outcome', async () => {
  const proposals = queue()
  const proposal = stage(proposals)
  const runtime = new FakeApprovalRuntime()
  runtime.createResult = { ...runtime.createResult, digest: `sha256:${proposal.contentDigest}` }
  const attempts = await Promise.allSettled([
    Promise.resolve().then(() => executor(proposals, runtime).approve(
      proposal.proposalId,
      new AbortController().signal,
    )),
    Promise.resolve().then(() => proposals.reject(proposal.proposalId, 'Concurrent rejection.')),
  ])

  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
  assert.ok(runtime.creates.length === 0 || runtime.creates.length === 1)
  const terminal = proposals.audit().filter(entry =>
    entry.proposalId === proposal.proposalId
    && (entry.outcome === 'applied' || entry.outcome === 'rejected'))
  assert.equal(terminal.length, 1)
  assert.deepEqual(proposals.list(), [])
})

test('concurrent approvals mutate once and malformed runtime success fails closed', async () => {
  const proposals = queue()
  const proposal = stage(proposals)
  const runtime = new FakeApprovalRuntime()
  runtime.createResult = { ...runtime.createResult, digest: `sha256:${proposal.contentDigest}` }
  const attempts = await Promise.allSettled([
    executor(proposals, runtime).approve(proposal.proposalId, new AbortController().signal),
    executor(proposals, runtime).approve(proposal.proposalId, new AbortController().signal),
  ])
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(runtime.creates.length, 1)

  const malformedQueue = queue()
  const malformedProposal = stage(malformedQueue)
  const malformedRuntime = new FakeApprovalRuntime()
  malformedRuntime.createResult = {
    ...malformedRuntime.createResult,
    digest: `sha256:${malformedProposal.contentDigest}`,
    path: '/Users/max/outside.md',
  }
  await assert.rejects(
    executor(malformedQueue, malformedRuntime).approve(
      malformedProposal.proposalId, new AbortController().signal,
    ),
    error => expectApprovalCode(error, 'INVALID_RUNTIME_RESULT'),
  )
  assert.equal(malformedQueue.audit().at(-1)?.outcome, 'approval-failed')
})

test('the accepted runtime performs exclusive create and recovery-backed update approvals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-approval-vault-'))
  const stateRoot = await mkdtemp(join(tmpdir(), 'assistant-approval-state-'))
  await writeFile(join(root, 'existing.md'), '# Before')
  const cordis = new Context()
  const context = cordis as Context & { noteVault: NoteVaultRuntime }
  try {
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot, vaultRoot: root } as never))
    const state = context.noteVault.state
    if (!state.active) assert.fail('runtime did not activate')
    const live: ApprovalContext = {
      vaultId: state.id,
      vaultGeneration: state.generation,
      childInstanceId: 'child-runtime-12345678',
      turnId: 'turn-runtime-12345678',
      requestId: 'request-runtime-12345678',
      provider: 'test-provider',
      model: 'test-model',
      writePermission: 'propose',
      permissionEpoch: 0,
    }
    const proposals = new ProposalQueue()
    const approved = new ProposalApprovalExecutor(
      proposals,
      context.noteVault,
      () => ({ ...live }),
    )
    const created = proposals.stage({
      ...live,
      destination: 'created.md',
      operation: 'create',
      expectedTarget: { exists: false },
      content: '# Created',
    })
    assert.equal(
      (await approved.approve(created.proposalId, new AbortController().signal)).status,
      'created',
    )
    assert.equal(await readFile(join(root, 'created.md'), 'utf8'), '# Created')

    const before = await context.noteVault.openDocument(
      'existing.md',
      { id: state.id, generation: state.generation },
      new AbortController().signal,
    )
    const updated = proposals.stage({
      ...live,
      destination: 'existing.md',
      operation: 'update',
      expectedTarget: { exists: true, identity: before.revision },
      content: '# After',
    })
    const saved = await approved.approve(updated.proposalId, new AbortController().signal)
    assert.equal(saved.status, 'saved')
    assert.equal(saved.snapshotCaptured, true)
    assert.equal(await readFile(join(root, 'existing.md'), 'utf8'), '# After')
    const history = await context.noteVault.listSnapshots({
      expectedVault: { id: state.id, generation: state.generation },
      path: 'existing.md',
    }, new AbortController().signal)
    assert.equal(history.snapshots.length, 1)
    assert.equal(history.snapshots[0]?.digest, before.digest)
  } finally {
    await context.fiber.dispose()
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(stateRoot, { recursive: true, force: true }),
    ])
  }
})
