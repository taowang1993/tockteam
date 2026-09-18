import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  AgentContinuationError,
  AgentContinuationRouter,
} from '../src/agent-continuation.ts'

interface RecordedDelivery {
  mode: 'followup' | 'inject' | 'steer'
  message: UserMessage
}

function fakeAgent(id = 'agent-12345678'): Agent & { deliveries: RecordedDelivery[] } {
  const deliveries: RecordedDelivery[] = []
  return {
    id,
    session: { id } as Agent['session'],
    status: 'idle',
    deliveries,
    followup(message: UserMessage) { deliveries.push({ mode: 'followup', message }) },
    inject(message: UserMessage) { deliveries.push({ mode: 'inject', message }) },
    steer(message: UserMessage) { deliveries.push({ mode: 'steer', message }) },
  } as unknown as Agent & { deliveries: RecordedDelivery[] }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof AgentContinuationError && error.code === code
}

function authorizedRouter(agents: AgentRegistry): AgentContinuationRouter {
  return new AgentContinuationRouter(agents, (id, agent) => id === agent.id)
}

async function harness() {
  const context = new Context()
  const fiber = await context.plugin(AgentRegistry)
  return { context, fiber }
}

test('routes bounded immutable messages through only the selected existing-agent primitive', async () => {
  const { context } = await harness()
  const agent = fakeAgent()
  const unregister = context.agents.register(agent)
  try {
    const router = authorizedRouter(context.agents)
    const cases = [
      { mode: 'inject', expected: 'inject' },
      { mode: 'steer', expected: 'steer' },
      { mode: 'followup', expected: 'followup' },
    ] as const
    for (const entry of cases) {
      const result = router.route({
        agentId: agent.id,
        mode: entry.mode,
        text: `Bearer top-secret /Users/max/private ${'x'.repeat(40_000)}`,
      }, new AbortController().signal)
      const delivery = agent.deliveries.at(-1)
      assert.equal(delivery?.mode, entry.expected)
      assert.equal(delivery?.message.role, 'user')
      assert.deepEqual(delivery?.message.source, {
        kind: 'plugin',
        plugin: 'tocktutor-assistant',
        form: 'notice',
        summary: 'TockTutor Assistant Continuation',
      })
      assert.ok((delivery?.message.content[0] as { text: string }).text.length <= 32_000)
      assert.doesNotMatch(JSON.stringify(delivery?.message), /top-secret|\/Users\/max/u)
      assert.equal(Object.isFrozen(delivery?.message), true)
      assert.equal(Object.isFrozen(delivery?.message.content), true)
      assert.deepEqual(result, {
        agentId: agent.id,
        messageId: delivery?.message.id,
        mode: entry.mode,
        redacted: true,
        truncated: true,
      })
    }
    assert.deepEqual(agent.deliveries.map(item => item.mode), ['inject', 'steer', 'followup'])
  } finally {
    unregister()
    await context.fiber.dispose()
  }
})

test('resolves an ambient initiator or the same explicit live identity without creating an agent', async () => {
  const { context } = await harness()
  const agent = fakeAgent()
  const unregister = context.agents.register(agent)
  let createCalls = 0
  let resumeCalls = 0
  const originalCreate = context.agents.create.bind(context.agents)
  const originalResume = context.agents.resume.bind(context.agents)
  context.agents.create = (...args) => { createCalls += 1; return originalCreate(...args) }
  context.agents.resume = (...args) => { resumeCalls += 1; return originalResume(...args) }
  try {
    const router = new AgentContinuationRouter(context.agents)
    assert.throws(
      () => router.route({ agentId: agent.id, mode: 'steer', text: 'unauthorized' }, new AbortController().signal),
      error => expectCode(error, 'IDENTITY_UNAUTHORIZED'),
    )
    context.agents.withInitiator(agent, () => {
      router.route({ mode: 'steer', text: 'continue' }, new AbortController().signal)
      router.route({ agentId: agent.id, mode: 'inject', text: 'context' }, new AbortController().signal)
    })
    assert.equal(createCalls, 0)
    assert.equal(resumeCalls, 0)
    assert.deepEqual(agent.deliveries.map(item => item.mode), ['steer', 'inject'])
  } finally {
    unregister()
    await context.fiber.dispose()
  }
})

test('rejects strict malformed, empty, oversized, and pre-aborted requests before delivery', async () => {
  const { context } = await harness()
  const agent = fakeAgent()
  const unregister = context.agents.register(agent)
  try {
    const router = new AgentContinuationRouter(context.agents)
    for (const input of [
      null,
      {},
      { agentId: agent.id, mode: 'wake', text: 'x' },
      { agentId: agent.id, mode: 'steer', text: '' },
      { agentId: agent.id, mode: 'steer', text: '   ' },
      { agentId: '/Users/max/agent', mode: 'steer', text: 'x' },
      { agentId: agent.id, mode: 'steer', text: 'x', extra: true },
      { agentId: agent.id, mode: 'steer', text: 'x'.repeat(100_001) },
    ]) {
      assert.throws(
        () => router.route(input, new AbortController().signal),
        error => expectCode(error, 'INVALID_REQUEST'),
      )
    }
    const aborted = new AbortController()
    aborted.abort('Bearer top-secret /Users/max')
    assert.throws(
      () => router.route({ agentId: agent.id, mode: 'steer', text: 'x' }, aborted.signal),
      error => expectCode(error, 'ABORTED'),
    )
    assert.equal(agent.deliveries.length, 0)
  } finally {
    unregister()
    await context.fiber.dispose()
  }
})

test('rejects confused-deputy identity mismatches and non-live retained initiators', async () => {
  const { context } = await harness()
  const first = fakeAgent('agent-first-12345678')
  const second = fakeAgent('agent-second-12345678')
  const unregisterFirst = context.agents.register(first)
  const unregisterSecond = context.agents.register(second)
  const router = new AgentContinuationRouter(context.agents)
  try {
    context.agents.withInitiator(first, () => {
      assert.throws(
        () => router.route({ agentId: second.id, mode: 'steer', text: 'x' }, new AbortController().signal),
        error => expectCode(error, 'IDENTITY_MISMATCH'),
      )
      unregisterFirst()
      assert.throws(
        () => router.route({ mode: 'steer', text: 'x' }, new AbortController().signal),
        error => expectCode(error, 'AGENT_NOT_LIVE'),
      )
    })
    assert.throws(
      () => router.route({ agentId: 'missing-agent-12345678', mode: 'steer', text: 'x' }, new AbortController().signal),
      error => expectCode(error, 'AGENT_NOT_LIVE'),
    )
    assert.equal(first.deliveries.length, 0)
    assert.equal(second.deliveries.length, 0)
  } finally {
    unregisterFirst()
    unregisterSecond()
    await context.fiber.dispose()
  }
})

test('sanitizes delivery failures and disposed registry access', async () => {
  const { context, fiber } = await harness()
  const agent = fakeAgent()
  agent.steer = () => { throw new Error('Bearer top-secret /Users/max/private') }
  const unregister = context.agents.register(agent)
  const router = authorizedRouter(context.agents)
  assert.throws(
    () => router.route({ agentId: agent.id, mode: 'steer', text: 'x' }, new AbortController().signal),
    error => expectCode(error, 'DELIVERY_FAILED') && !String(error).includes('/Users/max'),
  )
  unregister()
  await fiber.dispose()
  assert.throws(
    () => router.route({ agentId: agent.id, mode: 'steer', text: 'x' }, new AbortController().signal),
    error => expectCode(error, 'REGISTRY_UNAVAILABLE'),
  )
  await context.fiber.dispose()
})
