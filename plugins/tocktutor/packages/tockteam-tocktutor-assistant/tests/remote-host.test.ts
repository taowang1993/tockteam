import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import {
  TockTutorAssistantGateway,
  type AssistantRemoteHost,
} from '../lib/remote.js'
import type {
  AssistantAuditResult,
  AssistantProposalListResult,
} from '../lib/remote-types.js'

function proposalFixture(index = 0, skippedEntries = ['Notes/Skipped.md']) {
  return {
    version: 1 as const,
    proposalId: `proposal-${String(index)}-safe`,
    auditCorrelationId: `audit-correlation-${String(index)}-safe`,
    createdAt: 10 + index,
    expiresAt: 1_000 + index,
    vaultId: 'private-vault',
    vaultGeneration: 7,
    destination: `Notes/Safe-${String(index)}.md`,
    operation: 'create' as const,
    expectedTarget: { exists: false },
    contentDigest: 'a'.repeat(64),
    contentBytes: 24,
    contentChars: 24,
    preview: 'Bearer super-secret /Users/max/private',
    childInstanceId: 'private-child',
    turnId: 'private-turn',
    requestId: 'private-request',
    provider: 'private-provider',
    model: 'private-model',
    writePermission: 'propose' as const,
    permissionEpoch: 4,
    warnings: ['token=super-secret'],
    skippedEntries,
  }
}

function auditFixture(index = 0) {
  return {
    version: 1 as const,
    auditId: `audit-${String(index)}-safe`,
    auditCorrelationId: `audit-correlation-${String(index)}-safe`,
    proposalId: `proposal-${String(index)}-safe`,
    timestamp: 30 + index,
    outcome: 'rejected' as const,
    vaultId: 'private-vault',
    vaultGeneration: 7,
    destination: `Notes/Safe-${String(index)}.md`,
    operation: 'create' as const,
    expectedTarget: { exists: false },
    contentDigest: 'a'.repeat(64),
    contentBytes: 24,
    childInstanceId: 'private-child',
    turnId: 'private-turn',
    requestId: 'private-request',
    provider: 'private-provider',
    model: 'private-model',
    writePermission: 'propose' as const,
    permissionEpoch: 4,
    reason: 'password=hunter2 /Users/max/private',
  }
}

class FakeAssistant extends Service implements AssistantRemoteHost {
  readonly calls: Array<{ agent?: Agent; method: string; value?: unknown; signal?: AbortSignal }> = []
  settings = { provider: 'provider-safe', model: 'model-safe', writePermission: 'propose' as const }
  saveBarrier: Promise<void> | null = null
  proposals = [proposalFixture()]
  audits = [auditFixture()]

  constructor(ctx: Context) {
    super(ctx, 'noteAssistant')
  }

  currentSettings() {
    return { ...this.settings }
  }

  async saveSettings(value: typeof this.settings): Promise<void> {
    this.calls.push({ method: 'saveSettings', value })
    this.settings = { ...value }
    if (this.saveBarrier !== null) await this.saveBarrier
  }

  continueBoundAgent(agent: Agent, value: unknown, signal: AbortSignal) {
    this.calls.push({ agent, method: 'continueBoundAgent', value, signal })
    return {
      agentId: 'agent-safe',
      messageId: 'message-safe',
      mode: 'followup' as const,
      redacted: false,
      truncated: false,
    }
  }

  async listProposals() {
    return this.proposals
  }

  async approveProposal(proposalId: string, signal: AbortSignal) {
    this.calls.push({ method: 'approveProposal', value: proposalId, signal })
    return {
      proposalId: 'proposal-safe',
      auditCorrelationId: 'audit-correlation-safe',
      operation: 'create' as const,
      path: 'Notes/Safe.md',
      snapshotCaptured: false,
      status: 'created' as const,
    }
  }

  async rejectProposal(proposalId: string, reason: string) {
    this.calls.push({ method: 'rejectProposal', value: { proposalId, reason } })
    return { proposalId: 'proposal-safe', auditCorrelationId: 'audit-correlation-safe' }
  }

  async proposalAudit() {
    return this.audits
  }

  async proposalAuditStatus() {
    return { entries: this.audits.length, dropped: 2 }
  }
}

async function loaded(): Promise<{
  agent: Agent
  context: Context
  gateway: TockTutorAssistantGateway
  scopedGateway: TockTutorAssistantGateway
  host: FakeAssistant
  gatewayFiber: Awaited<ReturnType<Context['plugin']>>
}> {
  const context = new Context()
  await context.plugin(FakeAssistant)
  const gatewayFiber = await context.plugin(TockTutorAssistantGateway)
  const gateway = context.get('tocktutorAssistant')
  const scope = context.extend()
  const agent = {
    id: 'agent-scoped-safe',
    ctx: scope,
    session: { id: 'agent-scoped-safe' },
    status: 'running',
  } as unknown as Agent
  Object.defineProperty(scope, 'agent', { configurable: true, value: agent })
  const scopedGateway = scope.get('tocktutorAssistant')
  const host = context.get('noteAssistant')
  assert.ok(gateway instanceof TockTutorAssistantGateway)
  assert.ok(scopedGateway instanceof TockTutorAssistantGateway)
  assert.ok(host instanceof FakeAssistant)
  return { agent, context, gateway, scopedGateway, host, gatewayFiber }
}

function serialized(value: unknown): string {
  return JSON.stringify(value)
}

test('registers only bounded settings, turn, proposal, decision, and audit Remote methods', async () => {
  const state = await loaded()
  try {
    assert.deepEqual(remoteMethods(state.gateway), [
      { invocation: { kind: 'direct' }, method: 'currentSettings' },
      { invocation: { kind: 'direct' }, method: 'saveSettings' },
      { invocation: { context: 'agent', kind: 'context' }, method: 'continueTurn' },
      { invocation: { kind: 'direct' }, method: 'listProposals' },
      { invocation: { kind: 'direct' }, method: 'approveProposal' },
      { invocation: { kind: 'direct' }, method: 'rejectProposal' },
      { invocation: { kind: 'direct' }, method: 'audit' },
    ])

    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.currentSettings(signal), {
      provider: 'provider-safe',
      model: 'model-safe',
      writePermission: 'propose',
    })
    await assert.rejects(
      state.gateway.continueTurn({ mode: 'followup', text: 'Hello' }, signal),
      /agent scope/i,
    )
    const turn = await state.scopedGateway.continueTurn({ mode: 'followup', text: 'Hello' }, signal)
    assert.deepEqual(turn, {
      status: 'accepted',
      mode: 'followup',
      redacted: false,
      truncated: false,
    })
    assert.doesNotMatch(serialized(turn), /agentId|messageId|agent-scoped-safe|message-safe/u)
    const continuation = state.host.calls.find(call => call.method === 'continueBoundAgent')
    assert.equal(continuation?.agent, state.agent)
    assert.deepEqual(continuation?.value, { mode: 'followup', text: 'Hello' })

    const proposals: AssistantProposalListResult = await state.gateway.listProposals({}, signal)
    assert.deepEqual({ total: proposals.total, nextOffset: proposals.nextOffset }, { total: 1, nextOffset: null })
    assert.equal(proposals.proposals.length, 1)
    assert.equal(proposals.proposals[0]!.skippedEntryCount, 1)
    assert.match(proposals.proposals[0]!.preview, /\[REDACTED\]/u)
    assert.match(proposals.proposals[0]!.warnings[0]!, /\[REDACTED\]/u)
    const proposalWire = serialized(proposals)
    assert.doesNotMatch(proposalWire, /private-|contentDigest|vaultId|childInstanceId|turnId|requestId/u)

    assert.deepEqual(await state.gateway.approveProposal({ proposalId: 'proposal-safe' }, signal), {
      proposalId: 'proposal-safe',
      auditCorrelationId: 'audit-correlation-safe',
      operation: 'create',
      destination: 'Notes/Safe.md',
      snapshotCaptured: false,
      status: 'created',
    })
    assert.deepEqual(await state.gateway.rejectProposal({
      proposalId: 'proposal-safe',
      reason: 'password=hunter2 /Users/max/private',
    }, signal), {
      proposalId: 'proposal-safe',
      auditCorrelationId: 'audit-correlation-safe',
    })
    const rejection = state.host.calls.find(call => call.method === 'rejectProposal')
    assert.match(serialized(rejection?.value), /\[REDACTED\]/u)
    assert.doesNotMatch(serialized(rejection?.value), /hunter2|\/Users\/max/u)

    const audit: AssistantAuditResult = await state.gateway.audit({}, signal)
    assert.deepEqual({ entries: audit.entries.length, dropped: audit.dropped }, { entries: 1, dropped: 2 })
    assert.match(audit.entries[0]!.reason!, /\[REDACTED\]/u)
    const auditWire = serialized(audit)
    assert.doesNotMatch(auditWire, /hunter2|\/Users\/max|private-|contentDigest|vaultId|childInstanceId|turnId|requestId/u)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('rejects malformed, unknown, oversized, unsafe, and cancelled browser payloads before delegation', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    await assert.rejects(state.gateway.saveSettings({
      provider: 'provider-safe',
      model: 'model-safe',
      writePermission: 'read-only',
      unknown: true,
    } as never, signal), /settings request/i)
    await assert.rejects(state.scopedGateway.continueTurn({ mode: 'followup', text: 'x'.repeat(32_001) }, signal), /turn request/i)
    await assert.rejects(state.scopedGateway.continueTurn({ mode: 'followup', text: 'ok', unknown: true } as never, signal), /turn request/i)
    await assert.rejects(state.gateway.listProposals({ limit: 21 }, signal), /page request/i)
    await assert.rejects(state.gateway.audit({ offset: -1 }, signal), /page request/i)
    await assert.rejects(state.gateway.approveProposal({ proposalId: '../unsafe' }, signal), /approval request/i)
    await assert.rejects(state.gateway.rejectProposal({ proposalId: 'proposal-safe', reason: 'x'.repeat(501) }, signal), /rejection request/i)

    const aborted = new AbortController()
    aborted.abort(new Error('cancelled'))
    await assert.rejects(state.gateway.currentSettings(aborted.signal), error => error instanceof Error && error.name === 'AbortError')
    assert.deepEqual(state.host.calls, [])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('returns committed settings when cancellation arrives after the persistence commit point', async () => {
  const state = await loaded()
  try {
    let release!: () => void
    state.host.saveBarrier = new Promise<void>(resolve => { release = resolve })
    const controller = new AbortController()
    const saving = state.gateway.saveSettings({
      provider: 'provider-next',
      model: 'model-next',
      writePermission: 'read-only',
    }, controller.signal)
    await Promise.resolve()
    controller.abort(new Error('late cancellation'))
    release()
    assert.deepEqual(await saving, {
      provider: 'provider-next',
      model: 'model-next',
      writePermission: 'read-only',
    })
  } finally {
    await state.context.fiber.dispose()
  }
})

test('paginates aggregate output under one encoded byte ceiling', async () => {
  const state = await loaded()
  try {
    const longPath = `Notes/${'x'.repeat(4_080)}.md`
    const skipped = Array.from({ length: 100 }, () => longPath)
    state.host.proposals = Array.from({ length: 100 }, (_, index) => proposalFixture(index, skipped))
    state.host.audits = Array.from({ length: 100 }, (_, index) => auditFixture(index))
    const signal = new AbortController().signal

    const proposals = await state.gateway.listProposals({ limit: 20 }, signal)
    assert.equal(proposals.total, 100)
    assert.ok(proposals.proposals.length > 0)
    assert.equal(proposals.nextOffset, proposals.proposals.length)
    assert.equal(proposals.proposals[0]!.skippedEntries.length, 20)
    assert.equal(proposals.proposals[0]!.skippedEntryCount, 100)
    assert.ok(new TextEncoder().encode(JSON.stringify(proposals)).byteLength <= 256 * 1024)

    const audit = await state.gateway.audit({ limit: 20 }, signal)
    assert.equal(audit.total, 100)
    assert.equal(audit.entries.length, 20)
    assert.equal(audit.nextOffset, 20)
    assert.ok(new TextEncoder().encode(JSON.stringify(audit)).byteLength <= 256 * 1024)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('withdraws the gateway with its owning fiber and retains no Host-private capability', async () => {
  const state = await loaded()
  await state.gatewayFiber.dispose()
  assert.equal(state.context.get('tocktutorAssistant'), undefined)
  assert.ok(state.context.get('noteAssistant') instanceof FakeAssistant)
  assert.equal('noteVault' in state.gateway, false)
  assert.equal('subprocess' in state.gateway, false)
  await state.context.fiber.dispose()
})
