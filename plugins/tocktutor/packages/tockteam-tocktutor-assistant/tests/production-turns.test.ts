import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { AgentContinuationRouter } from '../src/agent-continuation.ts'
import {
  ProductionAssistantTurnBinder,
  type ProductionTurnBinding,
  type ProductionTurnHost,
} from '../src/production-turns.ts'
import type { AssistantTurnLease } from '../src/turn-bindings.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

function lease(turnId: string) {
  let ended = 0
  const value: AssistantTurnLease = {
    turnId,
    addCleanup() {},
    end() { ended += 1 },
  }
  return { value, ended: () => ended }
}

function harness(bind?: ProductionTurnHost['bind'], claimSynchronously = true) {
  let delivered: UserMessage | undefined
  const removed: string[] = []
  let binder!: ProductionAssistantTurnBinder
  const agent = {
    id: 'agent-production-12345678',
    session: { id: 'agent-production-12345678' },
    status: 'running',
    options: {},
    ctx: {},
    inbox: {
      remove(messageId: string) {
        removed.push(messageId)
        return true
      },
    },
    followup(message: UserMessage) {
      delivered = message
      if (claimSynchronously) binder.onClaimed(agent as unknown as Agent, message, 3)
    },
    inject(message: UserMessage) { delivered = message },
    steer(message: UserMessage) { delivered = message },
  } as unknown as Agent
  const calls: Array<{ agent: Agent; turn: number; messageId: string; signal: AbortSignal }> = []
  const host: ProductionTurnHost = {
    async bind(subject, turn, messageId, signal) {
      calls.push({ agent: subject, turn, messageId, signal })
      return bind === undefined
        ? { lease: lease(messageId).value }
        : bind(subject, turn, messageId, signal)
    },
    requestConfig(_agent, _turn, _signal, config) {
      return { ...config, provider: 'assistant-provider', model: 'assistant-model' }
    },
  }
  binder = new ProductionAssistantTurnBinder(host)
  const router = new AgentContinuationRouter(
    { currentInitiator: () => undefined, get: (id: string) => id === agent.id ? agent : undefined } as never,
    (_id, candidate) => candidate === agent,
  )
  return {
    agent,
    binder,
    calls,
    delivered: () => delivered,
    removed,
    route(signal = new AbortController().signal) {
      return router.route(
        { agentId: agent.id, mode: 'followup', text: 'Production continuation' },
        signal,
        (subject, message) => binder.reserve(subject, message.id),
      )
    },
  }
}

test('reserves before synchronous claim, binds before entry, overrides request config, and stops exactly once', async () => {
  const activeLease = lease('production-turn-12345678')
  const h = harness(async () => ({ lease: activeLease.value }))
  const routed = h.route()
  const message = h.delivered()
  assert.ok(message)
  assert.equal(routed.messageId, message.id)

  const signal = new AbortController().signal
  const decision = await h.binder.onPreStep(
    { agent: h.agent, messages: [message], turn: 3, signal },
    () => Promise.resolve({ kind: 'enter', messages: [message] }),
  )
  assert.deepEqual(decision, { kind: 'enter', messages: [message] })
  assert.deepEqual(h.calls.map(call => ({ agent: call.agent, turn: call.turn, messageId: call.messageId })), [{
    agent: h.agent,
    turn: 3,
    messageId: message.id,
  }])
  const config = await h.binder.onRequest(
    { agent: h.agent, turn: 3, signal },
    () => Promise.resolve({ provider: 'original', model: 'original' }),
  )
  assert.deepEqual(config, { provider: 'assistant-provider', model: 'assistant-model' })
  h.binder.onTurnStopping(h.agent, 3)
  h.binder.onTurnStopping(h.agent, 3)
  assert.equal(activeLease.ended(), 1)
})

test('message replacement, abort, and disposal end a newly acquired lease before the model request', async () => {
  const replacedLease = lease('replacement-turn-12345678')
  const replaced = harness(async () => ({ lease: replacedLease.value }))
  replaced.route()
  const replacedMessage = replaced.delivered()
  assert.ok(replacedMessage)
  const replacement = { ...replacedMessage, id: 'replacement-message-12345678' } as UserMessage
  assert.deepEqual(await replaced.binder.onPreStep(
    { agent: replaced.agent, messages: [replacedMessage], turn: 3, signal: new AbortController().signal },
    (): Promise<PreStepDecision> => Promise.resolve({ kind: 'enter', messages: [replacement] }),
  ), { kind: 'reject' })
  assert.equal(replacedLease.ended(), 1)
  let requestDelegated = 0
  await assert.rejects(replaced.binder.onRequest(
    { agent: replaced.agent, turn: 3, signal: new AbortController().signal },
    () => {
      requestDelegated += 1
      return Promise.resolve({ provider: 'ordinary', model: 'ordinary' })
    },
  ), /no longer current/u)
  assert.equal(requestDelegated, 0)

  for (const action of ['abort', 'dispose'] as const) {
    const pending = deferred<ProductionTurnBinding>()
    const acquired = lease(`${action}-turn-12345678`)
    const h = harness(() => pending.promise)
    h.route()
    const message = h.delivered()
    assert.ok(message)
    const controller = new AbortController()
    const entering = h.binder.onPreStep(
      { agent: h.agent, messages: [message], turn: 3, signal: controller.signal },
      () => Promise.resolve({ kind: 'enter', messages: [message] }),
    )
    if (action === 'abort') controller.abort()
    else h.binder.dispose()
    pending.resolve({ lease: acquired.value })
    assert.deepEqual(await entering, { kind: 'reject' })
    assert.equal(acquired.ended(), 1)
  }
})

test('vault invalidation rejects claimed Assistant work without falling through to the ordinary loop', async () => {
  const activeLease = lease('vault-turn-12345678')
  const h = harness(async () => ({ lease: activeLease.value }))
  h.route()
  const message = h.delivered()
  assert.ok(message)
  h.binder.invalidateAll()

  let delegated = 0
  assert.deepEqual(await h.binder.onPreStep(
    { agent: h.agent, messages: [message], turn: 3, signal: new AbortController().signal },
    () => {
      delegated += 1
      return Promise.resolve({ kind: 'enter', messages: [message] })
    },
  ), { kind: 'reject' })
  assert.equal(delegated, 0)
  assert.equal(h.calls.length, 0)

  h.route()
  assert.ok(h.delivered())
})

test('vault invalidation removes an exact unclaimed Assistant inbox item and tombstones late claims', async () => {
  const h = harness(undefined, false)
  h.route()
  const message = h.delivered()
  assert.ok(message)
  h.binder.invalidateAll()
  assert.deepEqual(h.removed, [message.id])

  h.binder.onClaimed(h.agent, message, 3)
  assert.deepEqual(await h.binder.onPreStep(
    { agent: h.agent, messages: [message], turn: 3, signal: new AbortController().signal },
    () => Promise.resolve({ kind: 'enter', messages: [message] }),
  ), { kind: 'reject' })
})

test('vault invalidation rejects an Assistant request whose downstream config was already pending', async () => {
  const activeLease = lease('request-vault-turn-12345678')
  const h = harness(async () => ({ lease: activeLease.value }))
  h.route()
  const message = h.delivered()
  assert.ok(message)
  const signal = new AbortController().signal
  await h.binder.onPreStep(
    { agent: h.agent, messages: [message], turn: 3, signal },
    () => Promise.resolve({ kind: 'enter', messages: [message] }),
  )
  const request = deferred<LlmCallConfig>()
  const configuring = h.binder.onRequest(
    { agent: h.agent, turn: 3, signal },
    () => request.promise,
  )
  h.binder.invalidateAll()
  request.resolve({ provider: 'ordinary', model: 'ordinary' })
  await assert.rejects(configuring, /no longer current/u)
  assert.equal(activeLease.ended(), 1)
})

test('failed delivery rolls back the exact reservation', () => {
  const h = harness()
  const throwing = { ...h.agent, followup() { throw new Error('delivery failed') } } as unknown as Agent
  const router = new AgentContinuationRouter(
    { currentInitiator: () => undefined, get: () => throwing } as never,
    () => true,
  )
  assert.throws(() => router.route(
    { agentId: throwing.id, mode: 'followup', text: 'Fail' },
    new AbortController().signal,
    (agent, message) => h.binder.reserve(agent, message.id),
  ), /could not accept/u)
  h.binder.invalidateAgent(throwing)
})
