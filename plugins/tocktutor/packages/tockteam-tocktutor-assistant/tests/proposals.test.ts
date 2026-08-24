import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ProposalError,
  ProposalQueue,
  sha256,
  type ApprovalContext,
  type StageProposalInput,
} from '../src/proposals.ts'

function harness(options: { pendingLimit?: number; auditLimit?: number } = {}) {
  let now = 1_000
  let sequence = 0
  const queue = new ProposalQueue({
    clock: () => now,
    randomId: () => `opaque-${++sequence}`,
    ...options,
  })
  return {
    queue,
    advance(ms: number) { now += ms },
  }
}

const approval: ApprovalContext = {
  vaultId: 'vault-1',
  vaultGeneration: 7,
  childInstanceId: 'child-1',
  turnId: 'turn-1',
  requestId: 'request-1',
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  writePermission: 'propose',
  permissionEpoch: 4,
}

function proposal(overrides: Partial<StageProposalInput> = {}): StageProposalInput {
  return {
    vaultId: approval.vaultId,
    vaultGeneration: approval.vaultGeneration,
    destination: 'Notes/Today.md',
    operation: 'create',
    expectedTarget: { exists: false },
    content: '# Today\nprivate body',
    childInstanceId: approval.childInstanceId,
    turnId: approval.turnId,
    requestId: approval.requestId,
    provider: approval.provider,
    model: approval.model,
    writePermission: approval.writePermission,
    permissionEpoch: approval.permissionEpoch,
    expiresInMs: 60_000,
    warnings: [],
    skippedEntries: [],
    ...overrides,
  }
}

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, error => error instanceof ProposalError && error.code === code)
}

test('stages bounded create and update records without exposing full content', () => {
  const { queue } = harness()
  const create = queue.stage(proposal({ content: `# Today\n${'z'.repeat(2_000)}` }))
  const update = queue.stage(proposal({
    destination: 'Notes/Existing.md',
    operation: 'update',
    expectedTarget: { exists: true, identity: 'file-7', modifiedAt: 900 },
    source: {
      relativePath: 'Sources/Input.md',
      identity: 'source-2',
      contentDigest: sha256('source content'),
    },
    content: '# Existing\nupdated',
    warnings: ['One source section was skipped.'],
    skippedEntries: ['Sources/Skipped.md'],
  }))

  assert.equal(create.operation, 'create')
  assert.equal('token' in create, false)
  assert.equal(update.operation, 'update')
  assert.equal(update.expectedTarget.identity, 'file-7')
  assert.equal(update.source?.relativePath, 'Sources/Input.md')
  assert.equal(update.contentDigest, sha256('# Existing\nupdated'))
  assert.ok(create.preview.length <= 1_000)
  assert.doesNotMatch(JSON.stringify(queue.list()), /z{1500}/)
  assert.equal(queue.audit().filter(entry => entry.outcome === 'staged').length, 2)
})

test('rejects unsafe, oversized, or unauthorized proposal input', () => {
  const { queue } = harness()
  for (const destination of ['../secret.md', '/tmp/secret.md', 'C:\\secret.md', 'bad\0name.md']) {
    expectCode(() => queue.stage(proposal({ destination })), 'INVALID_PROPOSAL')
  }
  expectCode(() => queue.stage(proposal({ content: 'x'.repeat(1_048_577) })), 'INVALID_PROPOSAL')
  expectCode(() => queue.stage(proposal({ writePermission: 'read-only' })), 'PERMISSION_CHANGED')
  expectCode(() => queue.stage(proposal({ vaultGeneration: 0 })), 'INVALID_PROPOSAL')
  expectCode(() => queue.stage(proposal({ childInstanceId: 'child / absolute' })), 'INVALID_PROPOSAL')
  expectCode(() => queue.stage(proposal({ operation: 'update', expectedTarget: { exists: false } })), 'INVALID_PROPOSAL')
})

test('approval consumes exactly once before returning the Host-private record', async () => {
  const { queue } = harness()
  const staged = queue.stage(proposal())

  const attempts = await Promise.allSettled([
    Promise.resolve().then(() => queue.consumeForApproval(staged.proposalId, approval)),
    Promise.resolve().then(() => queue.consumeForApproval(staged.proposalId, approval)),
  ])

  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(attempts.filter(result => result.status === 'rejected').length, 1)
  const consumed = attempts.find(result => result.status === 'fulfilled')
  assert.equal(consumed?.status === 'fulfilled' ? consumed.value.content : undefined, '# Today\nprivate body')
  expectCode(() => queue.consumeForApproval(staged.proposalId, approval), 'INVALID_PROPOSAL')
  assert.equal(queue.list().length, 0)
})

test('stale approval facts fail closed and burn the token', () => {
  const cases: Array<[Partial<ApprovalContext>, string]> = [
    [{ vaultId: 'vault-2' }, 'STALE_VAULT'],
    [{ vaultGeneration: 8 }, 'STALE_VAULT'],
    [{ childInstanceId: 'child-2' }, 'CHILD_REPLACED'],
    [{ writePermission: 'read-only' }, 'PERMISSION_CHANGED'],
    [{ turnId: 'turn-2' }, 'TURN_MISMATCH'],
    [{ requestId: 'request-2' }, 'TURN_MISMATCH'],
    [{ provider: 'other-provider' }, 'PROVIDER_MISMATCH'],
    [{ model: 'other-model' }, 'PROVIDER_MISMATCH'],
  ]

  for (const [change, code] of cases) {
    const { queue } = harness()
    const staged = queue.stage(proposal())
    expectCode(() => queue.consumeForApproval(staged.proposalId, { ...approval, ...change }), code)
    expectCode(() => queue.consumeForApproval(staged.proposalId, approval), 'INVALID_PROPOSAL')
  }
})

test('hydrated stale bindings are invalidated before restored listing', () => {
  const cases: Array<[Partial<ApprovalContext>, string]> = [
    [{ vaultGeneration: 8 }, 'STALE_VAULT'],
    [{ childInstanceId: 'child-restored' }, 'CHILD_REPLACED'],
    [{ permissionEpoch: 5 }, 'PERMISSION_CHANGED'],
    [{ turnId: 'turn-restored' }, 'TURN_MISMATCH'],
    [{ requestId: 'request-restored' }, 'TURN_MISMATCH'],
    [{ provider: 'provider-restored' }, 'PROVIDER_MISMATCH'],
    [{ model: 'model-restored' }, 'PROVIDER_MISMATCH'],
  ]

  for (const [change, reason] of cases) {
    const { queue } = harness()
    queue.stage(proposal())
    const restored = ProposalQueue.hydrate(queue.serialize(), { clock: () => 1_000 })
    assert.equal(restored.invalidateMismatched({ ...approval, ...change }), 1)
    assert.deepEqual(restored.list(), [])
    assert.equal(restored.audit().at(-1)?.reason, reason)
  }
})

test('permission mode round trips cannot revive a proposal from an older permission epoch', () => {
  const { queue } = harness()
  const staged = queue.stage(proposal())
  expectCode(() => queue.consumeForApproval(staged.proposalId, {
    ...approval,
    permissionEpoch: 5,
  }), 'PERMISSION_CHANGED')
  expectCode(() => queue.consumeForApproval(staged.proposalId, approval), 'INVALID_PROPOSAL')
})

test('permission transitions invalidate pending proposals before browser review', () => {
  const { queue } = harness()
  const staged = queue.stage(proposal())
  assert.equal(queue.invalidatePermission('read-only', approval.permissionEpoch + 1), 1)
  assert.deepEqual(queue.list(), [])
  assert.equal(queue.audit().at(-1)?.reason, 'PERMISSION_CHANGED')
  expectCode(() => queue.consumeForApproval(staged.proposalId, approval), 'INVALID_PROPOSAL')
})

test('provider transitions invalidate pending proposals before browser review', () => {
  const { queue } = harness()
  queue.stage(proposal())
  assert.equal(queue.invalidateProvider('gateway-next', 'model-next'), 1)
  assert.deepEqual(queue.list(), [])
  assert.equal(queue.audit().at(-1)?.reason, 'PROVIDER_MISMATCH')
})

test('vault transitions invalidate every mismatched pending proposal at once', () => {
  const { queue } = harness()
  queue.stage(proposal({ destination: 'One.md' }))
  queue.stage(proposal({ destination: 'Two.md' }))

  assert.equal(queue.invalidateMismatched({ ...approval, vaultGeneration: 8 }), 2)
  assert.equal(queue.list().length, 0)
  assert.deepEqual(queue.audit().slice(-2).map(entry => entry.reason), ['STALE_VAULT', 'STALE_VAULT'])
})

test('vault activation invalidates old-vault proposals before browser listing', () => {
  const { queue } = harness()
  queue.stage(proposal({ destination: 'Old-Vault.md' }))
  assert.equal(queue.invalidateVault({ id: 'vault-2', generation: 8 }), 1)
  assert.deepEqual(queue.list(), [])
  assert.equal(queue.audit().at(-1)?.reason, 'STALE_VAULT')
})

test('expired tokens fail closed and cannot be replayed', () => {
  const { queue, advance } = harness()
  const staged = queue.stage(proposal({ expiresInMs: 10 }))
  advance(10)

  expectCode(() => queue.consumeForApproval(staged.proposalId, approval), 'EXPIRED')
  expectCode(() => queue.consumeForApproval(staged.proposalId, approval), 'INVALID_PROPOSAL')
})

test('expired proposals are pruned before listing and capacity checks', () => {
  const { queue, advance } = harness({ pendingLimit: 100 })
  for (let index = 0; index < 100; index += 1) {
    queue.stage(proposal({ destination: `Expired-${String(index)}.md`, expiresInMs: 10 }))
  }
  advance(10)

  assert.deepEqual(queue.list(), [])
  const fresh = queue.stage(proposal({ destination: 'Fresh.md' }))
  assert.equal(fresh.destination, 'Fresh.md')
  assert.equal(queue.list().length, 1)
  assert.equal(queue.audit().filter(entry => entry.reason === 'EXPIRED').length, 100)
})

test('rejection consumes without mutation and records only a redacted bounded reason', () => {
  const { queue } = harness()
  const staged = queue.stage(proposal())

  const rejected = queue.reject(staged.proposalId, 'No: /Users/alice/vault/Today.md TOKEN=secret-value')

  assert.equal(rejected.proposalId, staged.proposalId)
  expectCode(() => queue.reject(staged.proposalId, 'again'), 'INVALID_PROPOSAL')
  const audit = queue.audit().at(-1)
  assert.equal(audit?.outcome, 'rejected')
  assert.doesNotMatch(audit?.reason ?? '', /Users\/alice|secret-value/)
  assert.match(audit?.reason ?? '', /\[REDACTED\]/)
})

test('restored proposals are asynchronously revalidated before they can be listed', async () => {
  const { queue } = harness()
  queue.stage(proposal({ destination: 'Notes/Source-Stale.md' }))
  queue.stage(proposal({ destination: 'Notes/Target-Stale.md' }))
  const restored = ProposalQueue.hydrate(queue.serialize(), {
    clock: () => 1_000,
    randomId: (() => {
      let sequence = 100
      return () => `restored-${++sequence}`
    })(),
  })

  assert.equal(await restored.invalidateRestored(async (candidate) => {
    await Promise.resolve()
    return candidate.destination.includes('Source') ? 'SOURCE_CHANGED' : 'TARGET_CHANGED'
  }), 2)
  assert.deepEqual(restored.list(), [])
  assert.deepEqual(
    restored.audit().slice(-2).map(entry => entry.reason),
    ['SOURCE_CHANGED', 'TARGET_CHANGED'],
  )
})

test('persisted queue hydration rejects malformed, oversized, or digest-tampered data', () => {
  const { queue } = harness()
  queue.stage(proposal())
  const serialized = queue.serialize()

  assert.equal(ProposalQueue.hydrate(serialized, { clock: () => 1_000 }).list().length, 1)
  expectCode(() => ProposalQueue.hydrate('{not-json'), 'CORRUPT_QUEUE')
  expectCode(() => ProposalQueue.hydrate('x'.repeat(8 * 1024 * 1024 + 1)), 'CORRUPT_QUEUE')

  const tampered = JSON.parse(serialized) as { proposals: Array<{ content: string; hidden?: string }> }
  tampered.proposals[0]!.content = 'tampered content'
  expectCode(() => ProposalQueue.hydrate(JSON.stringify(tampered)), 'DIGEST_MISMATCH')

  const unknownField = JSON.parse(serialized) as { proposals: Array<{ hidden?: string }> }
  unknownField.proposals[0]!.hidden = 'covert content'
  expectCode(() => ProposalQueue.hydrate(JSON.stringify(unknownField)), 'CORRUPT_QUEUE')

  const distantDuration = JSON.parse(serialized) as {
    proposals: Array<{ createdAt: number; expiresAt: number }>
  }
  distantDuration.proposals[0]!.expiresAt = distantDuration.proposals[0]!.createdAt + 10 * 60_000 + 1
  expectCode(
    () => ProposalQueue.hydrate(JSON.stringify(distantDuration), { clock: () => 1_000 }),
    'CORRUPT_QUEUE',
  )

  const distantFuture = JSON.parse(serialized) as {
    proposals: Array<{ createdAt: number; expiresAt: number }>
  }
  distantFuture.proposals[0]!.createdAt = 10 * 60_000 + 1_001
  distantFuture.proposals[0]!.expiresAt = distantFuture.proposals[0]!.createdAt + 10
  expectCode(
    () => ProposalQueue.hydrate(JSON.stringify(distantFuture), { clock: () => 1_000 }),
    'CORRUPT_QUEUE',
  )
})

test('pending capacity fails closed while audit history keeps bounded newest records', () => {
  const { queue } = harness({ pendingLimit: 2, auditLimit: 3 })
  const first = queue.stage(proposal({ destination: 'One.md' }))
  const second = queue.stage(proposal({ destination: 'Two.md' }))
  expectCode(() => queue.stage(proposal({ destination: 'Three.md' })), 'QUEUE_FULL')

  queue.reject(first.proposalId, 'first')
  queue.reject(second.proposalId, 'second')

  assert.equal(queue.list().length, 0)
  assert.equal(queue.audit().length, 3)
  assert.deepEqual(queue.audit().map(entry => entry.outcome), ['staged', 'rejected', 'rejected'])
  assert.deepEqual(queue.auditStatus(), { entries: 3, dropped: 1 })
  assert.deepEqual(ProposalQueue.hydrate(queue.serialize()).auditStatus(), { entries: 3, dropped: 1 })
})
