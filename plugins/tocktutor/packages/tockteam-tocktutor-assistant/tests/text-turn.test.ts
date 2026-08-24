import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  isAgentLoopRequest,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import {
  AssistantTextTurnRunner,
  type AssistantTurnBinding,
  type AssistantTurnEvent,
} from '../src/text-turn.ts'

const binding: AssistantTurnBinding = {
  vaultId: 'vault:1234567890abcdef',
  vaultGeneration: 2,
  childInstanceId: 'child-1234567890abcdef',
  turnId: 'turn-1234567890abcdef',
}

class FakeAdapter extends LlmAdapter {
  calls: GenerateOptions[] = []
  chunks: StreamChunk[] = [
    { type: 'text-delta', index: 0, text: 'Hello' },
    { type: 'text-delta', index: 0, text: ' world' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  onChunk?: (chunk: StreamChunk) => void
  yielded: StreamChunk[] = []
  waitForAbort = false
  cleaned = false

  override listModels(): Promise<readonly []> {
    return Promise.resolve([])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: `Dynamic ${model}` })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    try {
      if (this.waitForAbort) {
        await new Promise<void>(resolve => {
          if (options.signal?.aborted) resolve()
          else options.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      }
      for (const chunk of this.chunks) {
        this.yielded.push(chunk)
        this.onChunk?.(chunk)
        yield chunk
      }
    } finally {
      this.cleaned = true
    }
  }
}

async function fixture(adapter = new FakeAdapter()) {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['live-provider'], adapter)
  return { adapter, context }
}

async function collect(iterable: AsyncIterable<AssistantTurnEvent>): Promise<AssistantTurnEvent[]> {
  const values: AssistantTurnEvent[] = []
  for await (const value of iterable) values.push(value)
  return values
}

test('runs one immutable bounded request through a live dynamic model without AgentLoop', async () => {
  const { adapter, context } = await fixture()
  adapter.chunks = [
    { type: 'text-delta', index: 0, text: 'Bearer top-secret /Users/max/private ' },
    { type: 'text-delta', index: 0, text: `sk_${'q'.repeat(20)} answer api_key` },
    { type: 'text-delta', index: 0, text: ' = ' },
    { type: 'text-delta', index: 0, text: 'another-secret one two three four' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  try {
    const runner = new AssistantTextTurnRunner(context.llm, () => true)
    const stream = runner.run({
      prompt: { message: 'Summarize the note' },
      provider: 'live-provider',
      model: 'unlisted-dynamic-model',
      binding,
    }, new AbortController().signal)
    const iterator = stream[Symbol.asyncIterator]()
    const first = await iterator.next()
    assert.equal(first.value?.type, 'text-delta')
    assert.equal(adapter.yielded.some(chunk => chunk.type === 'finish'), false)
    const events = [first.value!, ...await collect({ [Symbol.asyncIterator]: () => iterator })]

    assert.ok(events.slice(0, -1).every(event => event.type === 'text-delta'))
    assert.equal(events.at(-1)?.type, 'finish')
    assert.doesNotMatch(JSON.stringify(events), /top-secret|another-secret|\/Users\/max|sk_q/u)
    assert.equal(adapter.calls.length, 1)
    const request = adapter.calls[0]!
    assert.equal(request.provider, 'live-provider')
    assert.equal(request.model, 'unlisted-dynamic-model')
    assert.equal(request.maxTokens, 2_048)
    assert.equal(request.tools, undefined)
    assert.equal(request.messages.length, 1)
    assert.equal(request.messages[0]!.role, 'user')
    assert.equal(Object.isFrozen(request), true)
    assert.equal(Object.isFrozen(request.messages), true)
    assert.equal(Object.isFrozen(request.messages[0]), true)
    assert.equal(isAgentLoopRequest(request), false)
  } finally {
    await context.fiber.dispose()
  }
})

test('refuses a dormant provider but does not use the advisory model catalog as a whitelist', async () => {
  const { context } = await fixture()
  try {
    const runner = new AssistantTextTurnRunner(context.llm, () => true)
    const events = await collect(runner.run({
      prompt: { message: 'Hello' },
      provider: 'dormant-provider',
      model: 'any-model',
      binding,
    }, new AbortController().signal))
    assert.deepEqual(events, [{
      type: 'error',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The selected model provider is not active.',
    }])
  } finally {
    await context.fiber.dispose()
  }
})

test('bounds output and returns only sanitized terminal provider failures', async () => {
  const { adapter, context } = await fixture()
  try {
    adapter.chunks = [
      { type: 'text-delta', index: 0, text: 'x'.repeat(40_000) },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ]
    const runner = new AssistantTextTurnRunner(context.llm, () => true)
    const bounded = await collect(runner.run({
      prompt: { message: 'Hello' },
      provider: 'live-provider',
      model: 'model',
      binding,
    }, new AbortController().signal))
    assert.equal(bounded[0]?.type, 'text-delta')
    if (bounded[0]?.type !== 'text-delta') assert.fail('expected text')
    assert.ok(bounded[0].text.length <= 32_000)
    assert.deepEqual(bounded[1], { type: 'finish', reason: 'max-output', truncated: true })

    adapter.chunks = [{
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          code: `sk_${'z'.repeat(20)}`,
          message: 'Bearer private /Users/max/vault',
        },
      },
    }]
    const failed = await collect(runner.run({
      prompt: { message: 'Hello' },
      provider: 'live-provider',
      model: 'model',
      binding,
    }, new AbortController().signal))
    assert.deepEqual(failed, [{
      type: 'error',
      code: 'PROVIDER_ERROR',
      message: 'The model provider could not complete this turn.',
    }])
  } finally {
    await context.fiber.dispose()
  }
})

test('tool calls and malformed streams fail closed and close the iterator', async () => {
  const cases: Array<{ chunks: StreamChunk[]; code: string }> = [
    {
      chunks: [{ type: 'tool-call-delta', index: 0, id: 'call-1' as never, name: 'read_file', argumentsDelta: '{}' }],
      code: 'TOOLS_UNAVAILABLE',
    },
    {
      chunks: [{ type: 'text-delta', index: -1, text: 'bad' }],
      code: 'INVALID_STREAM',
    },
    {
      chunks: [{ type: 'text-delta', index: 0, text: 'unterminated' }],
      code: 'INVALID_STREAM',
    },
  ]
  for (const entry of cases) {
    const { adapter, context } = await fixture()
    adapter.chunks = entry.chunks
    try {
      const runner = new AssistantTextTurnRunner(context.llm, () => true)
      const events = await collect(runner.run({
        prompt: { message: 'Hello' },
        provider: 'live-provider',
        model: 'model',
        binding,
      }, new AbortController().signal))
      assert.equal(events.at(-1)?.type, 'error')
      assert.equal((events.at(-1) as { code?: string }).code, entry.code)
      assert.equal(adapter.cleaned, true)
    } finally {
      await context.fiber.dispose()
    }
  }
})

test('an abort settles a pending provider read and closes its iterator', async () => {
  const { adapter, context } = await fixture()
  adapter.waitForAbort = true
  adapter.chunks = [{
    type: 'finish',
    reason: {
      kind: 'aborted',
      failure: { code: 'ABORTED', message: 'Bearer private /Users/max' },
    },
  }]
  const abort = new AbortController()
  try {
    const runner = new AssistantTextTurnRunner(context.llm, () => true)
    const eventsPromise = collect(runner.run({
      prompt: { message: 'Hello' },
      provider: 'live-provider',
      model: 'model',
      binding,
    }, abort.signal))
    await new Promise(resolve => setTimeout(resolve, 0))
    abort.abort(`sk_${'z'.repeat(20)} /Users/max`)
    assert.deepEqual(await eventsPromise, [{
      type: 'error',
      code: 'ABORTED',
      message: 'The assistant turn was cancelled.',
    }])
    assert.equal(adapter.cleaned, true)
  } finally {
    await context.fiber.dispose()
  }
})

test('abort and changed vault/child/turn bindings suppress all buffered late output', async () => {
  for (const mode of ['abort', 'stale'] as const) {
    const { adapter, context } = await fixture()
    let current = true
    const abort = new AbortController()
    adapter.onChunk = chunk => {
      if (chunk.type !== 'text-delta') return
      if (mode === 'abort') abort.abort('Bearer private /Users/max')
      else current = false
    }
    try {
      const runner = new AssistantTextTurnRunner(context.llm, candidate => (
        current
        && candidate.vaultId === binding.vaultId
        && candidate.childInstanceId === binding.childInstanceId
        && candidate.turnId === binding.turnId
      ))
      const events = await collect(runner.run({
        prompt: { message: 'Hello' },
        provider: 'live-provider',
        model: 'model',
        binding,
      }, abort.signal))
      assert.deepEqual(events, [{
        type: 'error',
        code: mode === 'abort' ? 'ABORTED' : 'STALE_CONTEXT',
        message: mode === 'abort'
          ? 'The assistant turn was cancelled.'
          : 'The vault, child, or assistant turn changed.',
      }])
      assert.equal(adapter.cleaned, true)
    } finally {
      await context.fiber.dispose()
    }
  }
})
