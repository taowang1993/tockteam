import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  registerAssistantWriteTools,
  type AssistantProposalStager,
} from '../src/write-tool-registration.ts'
import type { StageProposalInput } from '../src/proposals.ts'
import type { AssistantReadToolExecutor } from '../src/read-tool-registration.ts'
import type { ReadBinding, ReadToolOutcome } from '../src/read-tools.ts'
import { AssistantTurnBindingRegistry } from '../src/turn-bindings.ts'

function fakeAgent(context: Context, requestedId = 'agent-write-12345678'): Agent {
  const id = requestedId
  return { id, ctx: context, options: {}, session: { id }, status: 'running' } as unknown as Agent
}

class FakeReader implements AssistantReadToolExecutor {
  calls = 0
  content = 'private old content'
  source: ReadToolOutcome['source'] = {
    path: 'notes/a.md',
    digest: `sha256:${'a'.repeat(64)}`,
    revision: `file:${'b'.repeat(64)}`,
    generation: 7,
  }

  async execute(
    _tool: unknown,
    args: unknown,
    _binding: ReadBinding,
    _signal: AbortSignal,
  ): Promise<ReadToolOutcome> {
    this.calls += 1
    const path = typeof args === 'object' && args !== null && 'path' in args && typeof args.path === 'string'
      ? args.path
      : this.source?.path
    return {
      result: { content: [{ type: 'text', text: this.content }] },
      source: this.source === null || path === undefined ? null : { ...this.source, path },
      truncated: false,
    }
  }
}

class FakeStager implements AssistantProposalStager {
  inputs: StageProposalInput[] = []

  async stage(input: StageProposalInput) {
    this.inputs.push(input)
    return {
      proposalId: 'proposal-12345678',
      auditCorrelationId: 'audit-correlation-12345678',
      operation: input.operation,
      destination: input.destination,
    }
  }
}

async function harness(permission: 'read-only' | 'propose' = 'propose') {
  const context = new Context()
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime)
  const turns = new AssistantTurnBindingRegistry()
  const agent = fakeAgent(context)
  const signal = new AbortController().signal
  const lease = turns.begin({
    agent,
    turnId: 'turn-write-12345678',
    requestId: 'request-write-12345678',
    childInstanceId: 'child-write-12345678',
    vaultId: 'vault:write-12345678',
    vaultGeneration: 7,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    permission,
    permissionEpoch: 4,
    allowedTools: permission === 'propose' ? ['create_file', 'write_file'] : ['read_file'],
    signal,
  })
  const reader = new FakeReader()
  const stager = new FakeStager()
  if (permission === 'propose') {
    lease.addCleanup(registerAssistantWriteTools(agent, reader, stager, turns, ['create_file', 'write_file']))
  }
  return { agent, context, lease, reader, stager, turns }
}

async function driverHarness() {
  const context = new Context()
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime)
  const turns = new AssistantTurnBindingRegistry()
  const agent = fakeAgent(context, 'agent-driver-12345678')
  const signal = new AbortController().signal
  const lease = turns.begin({
    agent,
    turnId: 'turn-driver-12345678',
    requestId: 'request-driver-12345678',
    childInstanceId: 'child-driver-12345678',
    vaultId: 'vault:write-12345678',
    vaultGeneration: 7,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    permission: 'propose',
    permissionEpoch: 4,
    allowedTools: ['notes_stage_write', 'notes_organize_capture'],
    signal,
  })
  const reader = new FakeReader()
  const stager = new FakeStager()
  lease.addCleanup(registerAssistantWriteTools(
    agent,
    reader,
    stager,
    turns,
    ['notes_stage_write', 'notes_organize_capture'],
  ))
  return { agent, context, lease, reader, stager, turns }
}

test('create_file stages one bounded proposal and returns no approval secret or content', async () => {
  const { agent, context, lease, reader, stager, turns } = await harness()
  try {
    const result = await context.tools.execute({
      agent,
      arguments: { path: 'notes/new.md', content: '# Private Draft' },
      callId: CallId('call-create-12345678'),
      name: 'create_file',
      signal: new AbortController().signal,
    })
    assert.equal(result.isError, false)
    assert.equal(reader.calls, 0)
    assert.deepEqual(stager.inputs, [{
      vaultId: 'vault:write-12345678',
      vaultGeneration: 7,
      destination: 'notes/new.md',
      operation: 'create',
      expectedTarget: { exists: false },
      content: '# Private Draft',
      childInstanceId: 'child-write-12345678',
      turnId: 'turn-write-12345678',
      requestId: 'request-write-12345678',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
      permissionEpoch: 4,
    }])
    assert.doesNotMatch(JSON.stringify(result), /Private Draft|token|digest|revision|vault:write/u)
    assert.match(JSON.stringify(result), /proposal-12345678|notes\/new\.md|staged/u)
  } finally {
    lease.end()
    turns.dispose()
    await context.fiber.dispose()
  }
})

test('write_file reads current identity then stages an update without mutating', async () => {
  const { agent, context, lease, reader, stager, turns } = await harness()
  try {
    const signal = new AbortController().signal
    const result = await context.tools.execute({
      agent,
      arguments: { path: 'notes/a.md', content: '# Replacement' },
      callId: CallId('call-update-12345678'),
      name: 'write_file',
      signal,
    })
    assert.equal(result.isError, false)
    assert.equal(reader.calls, 1)
    assert.deepEqual(stager.inputs[0], {
      vaultId: 'vault:write-12345678',
      vaultGeneration: 7,
      destination: 'notes/a.md',
      operation: 'update',
      source: {
        relativePath: 'notes/a.md',
        identity: `file:${'b'.repeat(64)}`,
        contentDigest: 'a'.repeat(64),
      },
      expectedTarget: { exists: true, identity: `file:${'b'.repeat(64)}` },
      content: '# Replacement',
      childInstanceId: 'child-write-12345678',
      turnId: 'turn-write-12345678',
      requestId: 'request-write-12345678',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
      permissionEpoch: 4,
    })
    assert.doesNotMatch(JSON.stringify(result), /Replacement|sha256|file:/u)
  } finally {
    lease.end()
    turns.dispose()
    await context.fiber.dispose()
  }
})

test('TockDriver writes stage redacted proposals and organize Inbox captures through the same queue', async () => {
  const { agent, context, lease, reader, stager, turns } = await driverHarness()
  try {
    assert.deepEqual(context.tools.schemas(agent).map(schema => schema.name), [
      'notes_stage_write',
      'notes_organize_capture',
    ])
    const staged = await context.tools.execute({
      agent,
      arguments: {
        vaultId: 'vault:write-12345678',
        path: 'notes/new.md',
        content: '# Private TockDriver Draft',
        operation: 'create',
      },
      callId: CallId('call-driver-stage-12345678'),
      name: 'notes_stage_write',
      signal: new AbortController().signal,
    })
    assert.equal(staged.isError, false)
    assert.equal(reader.calls, 0)
    assert.equal(stager.inputs.length, 1)
    assert.deepEqual(stager.inputs[0], {
      vaultId: 'vault:write-12345678',
      vaultGeneration: 7,
      destination: 'notes/new.md',
      operation: 'create',
      expectedTarget: { exists: false },
      content: '# Private TockDriver Draft',
      childInstanceId: 'child-driver-12345678',
      turnId: 'turn-driver-12345678',
      requestId: 'request-driver-12345678',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
      permissionEpoch: 4,
    })
    assert.doesNotMatch(JSON.stringify(staged), /Private TockDriver Draft|digest|revision|child-driver|turn-driver/u)
    assert.match(JSON.stringify(staged), /pending_review|tockdriver-notes|notes\/new\.md/u)

    reader.content = '# Inbox Title\n\nShip the review flow.\n'
    reader.source = {
      path: 'Inbox/capture.md',
      digest: `sha256:${'c'.repeat(64)}`,
      revision: `file:${'d'.repeat(64)}`,
      generation: 7,
    }
    const organized = await context.tools.execute({
      agent,
      arguments: { vaultId: 'vault:write-12345678', path: 'Inbox/capture.md' },
      callId: CallId('call-driver-organize-12345678'),
      name: 'notes_organize_capture',
      signal: new AbortController().signal,
    })
    assert.equal(organized.isError, false)
    assert.equal(reader.calls, 1)
    assert.equal(stager.inputs.length, 2)
    const organizedInput = stager.inputs[1]
    assert.ok(organizedInput)
    assert.equal(organizedInput.operation, 'create')
    assert.match(organizedInput.destination, /^Organized\/\d{4}-\d{2}-\d{2}-inbox-title\.md$/u)
    assert.match(organizedInput.content, /Organized from \[Inbox\/capture\.md\]/u)
    assert.match(organizedInput.content, /Ship the review flow/u)
    assert.equal(organizedInput.source?.relativePath, 'Inbox/capture.md')
    assert.doesNotMatch(JSON.stringify(organized), /Ship the review flow|file:|sha256:/u)
  } finally {
    lease.end()
    turns.dispose()
    await context.fiber.dispose()
  }
})

test('writes stay absent for read-only turns and fail closed on missing identity or lifecycle end', async () => {
  const readOnly = await harness('read-only')
  try {
    assert.equal(readOnly.context.tools.schemas(readOnly.agent).some(tool => tool.name === 'create_file'), false)
  } finally {
    readOnly.lease.end()
    readOnly.turns.dispose()
    await readOnly.context.fiber.dispose()
  }

  const active = await harness()
  try {
    active.reader.source = null
    const missing = await active.context.tools.execute({
      agent: active.agent,
      arguments: { path: 'notes/missing.md', content: 'x' },
      callId: CallId('call-missing-12345678'),
      name: 'write_file',
      signal: new AbortController().signal,
    })
    assert.equal(missing.isError, true)
    assert.equal(active.stager.inputs.length, 0)
    active.lease.end()
    assert.deepEqual(active.context.tools.schemas(active.agent), [])
  } finally {
    active.turns.dispose()
    await active.context.fiber.dispose()
  }
})
