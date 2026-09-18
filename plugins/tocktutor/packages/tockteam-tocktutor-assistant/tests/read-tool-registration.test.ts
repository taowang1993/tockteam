import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  registerAssistantReadTools,
  type AssistantReadToolExecutor,
} from '../src/read-tool-registration.ts'
import {
  AssistantTurnBindingRegistry,
  type AssistantTurnLease,
} from '../src/turn-bindings.ts'
import type { PennivoReadTool, ReadBinding, ReadToolOutcome } from '../src/read-tools.ts'

const allTools: PennivoReadTool[] = [
  'list_files', 'read_file', 'search', 'find_backlinks', 'get_outline',
  'list_snapshots', 'list_trash',
]

function fakeAgent(context: Context, id = 'agent-12345678'): Agent {
  return {
    id,
    ctx: context,
    session: { id } as Agent['session'],
    status: 'running',
  } as Agent
}

function bind(
  registry: AssistantTurnBindingRegistry,
  agent: Agent,
  signal = new AbortController().signal,
): AssistantTurnLease {
  return registry.begin({
    agent,
    turnId: 'turn-12345678',
    requestId: 'request-12345678',
    childInstanceId: 'child-12345678',
    vaultId: 'vault:12345678',
    vaultGeneration: 7,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    permission: 'propose',
    permissionEpoch: 3,
    allowedTools: allTools,
    signal,
  })
}

class FakeExecutor implements AssistantReadToolExecutor {
  calls: Array<{ tool: unknown; args: unknown; binding: ReadBinding; signal: AbortSignal }> = []

  async execute(
    tool: unknown,
    args: unknown,
    binding: ReadBinding,
    signal: AbortSignal,
  ): Promise<ReadToolOutcome> {
    this.calls.push({ tool, args, binding, signal })
    return {
      result: { content: [{ type: 'text', text: JSON.stringify({ tool, args }) }] },
      source: null,
      truncated: tool === 'search',
    }
  }
}

async function harness() {
  const context = new Context()
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime)
  const registry = new AssistantTurnBindingRegistry()
  const executor = new FakeExecutor()
  const agent = fakeAgent(context)
  return { agent, context, executor, registry }
}

test('registers exactly the seven supported reviewed reads through real ToolRuntime', async () => {
  const { agent, context, executor, registry } = await harness()
  const lease = bind(registry, agent)
  lease.addCleanup(registerAssistantReadTools(agent, executor, registry, allTools))
  try {
    assert.deepEqual(
      context.tools.schemas(agent).map(schema => schema.name).sort(),
      ['find_backlinks', 'get_outline', 'list_files', 'list_snapshots', 'list_trash', 'read_file', 'search'],
    )
    assert.equal(context.tools.schemas(agent).some(schema => schema.name === 'list_workspaces'), false)
    assert.equal(context.tools.schemas(agent).some(schema => /write|restore|delete/u.test(schema.name)), false)
  } finally {
    lease.end()
    registry.dispose()
    await context.fiber.dispose()
  }
})

test('resolves exact execution identity and forwards args, signal, and immutable ReadBinding', async () => {
  const { agent, context, executor, registry } = await harness()
  const lease = bind(registry, agent)
  lease.addCleanup(registerAssistantReadTools(agent, executor, registry, allTools))
  try {
    const signal = new AbortController().signal
    const result = await context.tools.execute({
      agent,
      arguments: { query: 'alpha beta', scope: 'notes' },
      callId: ToolCallId('call-search-12345678'),
      name: 'search',
      signal,
    })
    assert.equal(result.isError, false)
    if (result.isError) throw new Error('expected success')
    assert.deepEqual(result.value, {
      text: JSON.stringify({ tool: 'search', args: { query: 'alpha beta', scope: 'notes' } }),
      truncated: true,
    })
    assert.deepEqual(result.content, [{
      type: 'text',
      text: JSON.stringify({ tool: 'search', args: { query: 'alpha beta', scope: 'notes' } }),
    }])
    assert.deepEqual(executor.calls, [{
      tool: 'search',
      args: { query: 'alpha beta', scope: 'notes' },
      binding: {
        vaultId: 'vault:12345678',
        vaultGeneration: 7,
        childInstanceId: 'child-12345678',
        turnId: 'turn-12345678',
      },
      signal,
    }])
    assert.equal(Object.isFrozen(executor.calls[0]?.binding), true)
  } finally {
    lease.end()
    registry.dispose()
    await context.fiber.dispose()
  }
})

test('absent, spoofed, replayed, and ended turn calls fail through sanitized ToolRuntime results', async () => {
  const { agent, context, executor, registry } = await harness()
  const dispose = registerAssistantReadTools(agent, executor, registry, allTools)
  try {
    const call = (caller: Agent, id: string) => context.tools.execute({
      agent: caller,
      arguments: { path: 'a.md' },
      callId: ToolCallId(id),
      name: 'read_file',
      signal: new AbortController().signal,
    })
    assert.equal((await call(agent, 'call-absent-12345678')).isError, true)
    const lease = bind(registry, agent)
    assert.equal((await call(fakeAgent(context, agent.id), 'call-spoofed-12345678')).isError, true)
    assert.equal((await call(agent, 'call-replay-12345678')).isError, false)
    assert.equal((await call(agent, 'call-replay-12345678')).isError, true)
    lease.end()
    assert.equal((await call(agent, 'call-ended-12345678')).isError, true)
    for (const result of [
      await call(agent, 'call-ended-two-12345678'),
    ]) {
      assert.doesNotMatch(JSON.stringify(result), /vault:|child-|turn-|\/Users\//u)
    }
  } finally {
    dispose()
    registry.dispose()
    await context.fiber.dispose()
  }
})

test('turn end, abort, replacement, and cleanup registration races unregister every schema', async () => {
  const { agent, context, executor, registry } = await harness()
  try {
    const lifecycle = new AbortController()
    const first = bind(registry, agent, lifecycle.signal)
    first.addCleanup(registerAssistantReadTools(agent, executor, registry, allTools))
    assert.equal(context.tools.schemas(agent).length, 7)
    lifecycle.abort()
    assert.equal(context.tools.schemas(agent).length, 0)

    const second = registry.begin({
      agent,
      turnId: 'turn-second-12345678',
      requestId: 'request-second-12345678',
      childInstanceId: 'child-12345678',
      vaultId: 'vault:12345678',
      vaultGeneration: 7,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      permission: 'propose',
      permissionEpoch: 3,
      allowedTools: ['read_file'],
      signal: new AbortController().signal,
    })
    second.end()
    let disposed = 0
    second.addCleanup(() => { disposed += 1 })
    assert.equal(disposed, 1)
  } finally {
    registry.dispose()
    await context.fiber.dispose()
  }
})
