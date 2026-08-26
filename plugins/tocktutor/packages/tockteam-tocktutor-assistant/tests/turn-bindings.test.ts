import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import {
  AssistantTurnBindingError,
  AssistantTurnBindingRegistry,
} from '../src/turn-bindings.ts'

function fakeAgent(id = 'agent-12345678'): Agent {
  return {
    id,
    session: { id } as Agent['session'],
    status: 'running',
  } as Agent
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    agent: fakeAgent(),
    turnId: 'turn-12345678',
    requestId: 'request-12345678',
    childInstanceId: 'child-12345678',
    vaultId: 'vault:12345678',
    vaultGeneration: 7,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    permission: 'propose',
    permissionEpoch: 3,
    allowedTools: ['read_file', 'search'],
    signal: new AbortController().signal,
    ...overrides,
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof AssistantTurnBindingError && error.code === code
}

test('resolves one immutable allowed call to the exact Host-bound assistant turn', () => {
  const registry = new AssistantTurnBindingRegistry()
  const agent = fakeAgent()
  const lease = registry.begin(input({ agent }))
  const current = registry.current(agent)
  const resolved = registry.resolve({
    agent,
    callId: CallId('call-12345678'),
    signal: new AbortController().signal,
    tool: 'read_file',
  })

  assert.deepEqual(current, resolved)
  assert.deepEqual(resolved, {
    readBinding: {
      vaultId: 'vault:12345678',
      vaultGeneration: 7,
      childInstanceId: 'child-12345678',
      turnId: 'turn-12345678',
    },
    requestId: 'request-12345678',
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    permission: 'propose',
    permissionEpoch: 3,
  })
  assert.equal(Object.isFrozen(resolved), true)
  assert.equal(Object.isFrozen(resolved.readBinding), true)
  assert.equal(registry.isCurrent(resolved.readBinding), true)
  assert.equal(registry.agentForTurn('turn-12345678'), agent)
  assert.deepEqual(lease, {
    turnId: 'turn-12345678',
    addCleanup: lease.addCleanup,
    end: lease.end,
  })
  lease.end()
  assert.equal(registry.isCurrent(resolved.readBinding), false)
  assert.equal(registry.agentForTurn('turn-12345678'), undefined)
})

test('requires exact live agent identity, allowed tool scope, and unused call correlation', () => {
  const registry = new AssistantTurnBindingRegistry()
  const agent = fakeAgent()
  registry.begin(input({ agent }))
  assert.throws(
    () => registry.current(fakeAgent(agent.id)),
    error => expectCode(error, 'STALE_TURN'),
  )
  assert.throws(
    () => registry.resolve({ agent: fakeAgent(agent.id), callId: CallId('call-wrong-agent'), signal: new AbortController().signal, tool: 'read_file' }),
    error => expectCode(error, 'TOOL_UNAVAILABLE'),
  )
  assert.throws(
    () => registry.resolve({ agent, callId: CallId('call-denied-tool'), signal: new AbortController().signal, tool: 'get_outline' }),
    error => expectCode(error, 'TOOL_UNAVAILABLE'),
  )
  const call = { agent, callId: CallId('call-unique-12345678'), signal: new AbortController().signal, tool: 'search' }
  registry.resolve(call)
  assert.throws(() => registry.resolve(call), error => expectCode(error, 'CALL_REPLAY'))
  ;(agent as { status: string }).status = 'idle'
  assert.throws(
    () => registry.resolve({ agent, callId: CallId('call-idle-12345678'), signal: new AbortController().signal, tool: 'search' }),
    error => expectCode(error, 'STALE_TURN'),
  )
})

test('rejects malformed leases, unsafe tools, capacity overflow, and reused turn IDs', () => {
  const malformed = [
    input({ turnId: '../turn' }),
    input({ requestId: '/Users/max/request' }),
    input({ vaultGeneration: 0 }),
    input({ permission: 'write' }),
    input({ permissionEpoch: -1 }),
    input({ provider: 'unsafe provider' }),
    input({ allowedTools: ['list_workspaces'] }),
    input({ allowedTools: ['read_file', 'read_file'] }),
    input({ allowedTools: [] }),
    input({ signal: {} }),
    input({ extra: true }),
  ]
  for (const value of malformed) {
    const registry = new AssistantTurnBindingRegistry()
    assert.throws(() => registry.begin(value as never), error => expectCode(error, 'INVALID_BINDING'))
  }

  const reused = new AssistantTurnBindingRegistry()
  const first = reused.begin(input())
  first.end()
  assert.throws(() => reused.begin(input()), error => expectCode(error, 'TURN_REUSED'))

  const capacity = new AssistantTurnBindingRegistry({ maxActiveTurns: 1 })
  capacity.begin(input())
  assert.throws(
    () => capacity.begin(input({ agent: fakeAgent('agent-second-12345678'), turnId: 'turn-second-12345678' })),
    error => expectCode(error, 'CAPACITY'),
  )
})

test('accepts TockDriver staged-write aliases while keeping them out of read-only turns', () => {
  const registry = new AssistantTurnBindingRegistry()
  const agent = fakeAgent()
  const lease = registry.begin(input({
    agent,
    allowedTools: ['notes_stage_write', 'notes_organize_capture'],
  }))
  try {
    const signal = new AbortController().signal
    assert.equal(registry.resolve({
      agent,
      callId: CallId('call-notes-stage-12345678'),
      signal,
      tool: 'notes_stage_write',
    }).readBinding.vaultId, 'vault:12345678')
    assert.equal(registry.resolve({
      agent,
      callId: CallId('call-notes-organize-12345678'),
      signal,
      tool: 'notes_organize_capture',
    }).readBinding.vaultId, 'vault:12345678')
  } finally {
    lease.end()
    registry.dispose()
  }

  const readOnly = new AssistantTurnBindingRegistry()
  assert.throws(
    () => readOnly.begin(input({ permission: 'read-only', allowedTools: ['notes_stage_write'] })),
    error => expectCode(error, 'INVALID_BINDING'),
  )
  readOnly.dispose()
})

test('invalidates synchronously on every bound Host fact transition', () => {
  const scenarios: Array<(registry: AssistantTurnBindingRegistry) => void> = [
    registry => registry.invalidateChild('child-replacement-12345678'),
    registry => registry.invalidateVault({ id: 'vault:different', generation: 8 }),
    registry => registry.invalidatePermission('propose', 4),
    registry => registry.invalidateProvider(null),
    registry => registry.end('turn-12345678'),
  ]
  for (const invalidate of scenarios) {
    const registry = new AssistantTurnBindingRegistry()
    const agent = fakeAgent()
    registry.begin(input({ agent }))
    invalidate(registry)
    assert.throws(
      () => registry.resolve({ agent, callId: CallId('call-after-change'), signal: new AbortController().signal, tool: 'read_file' }),
      error => expectCode(error, 'TOOL_UNAVAILABLE'),
    )
  }
})

test('lifecycle abort, turn replacement, call abort, and registry disposal fail closed', () => {
  const registry = new AssistantTurnBindingRegistry()
  const agent = fakeAgent()
  const lifecycle = new AbortController()
  const oldLease = registry.begin(input({ agent, signal: lifecycle.signal }))
  lifecycle.abort('Bearer top-secret /Users/max')
  assert.equal(registry.activeCount, 0)

  const replacement = registry.begin(input({
    agent,
    turnId: 'turn-replacement-12345678',
    requestId: 'request-replacement-12345678',
    signal: new AbortController().signal,
  }))
  oldLease.end()
  assert.equal(registry.activeCount, 1)

  const aborted = new AbortController()
  aborted.abort('Bearer top-secret /Users/max')
  assert.throws(
    () => registry.resolve({ agent, callId: CallId('call-aborted-12345678'), signal: aborted.signal, tool: 'read_file' }),
    error => expectCode(error, 'ABORTED'),
  )
  replacement.end()
  registry.dispose()
  assert.equal(registry.activeCount, 0)
  assert.throws(() => registry.begin(input({ turnId: 'turn-third-12345678' })), error => expectCode(error, 'DISPOSED'))
})
