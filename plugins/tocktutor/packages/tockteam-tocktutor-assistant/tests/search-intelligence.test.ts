import assert from 'node:assert/strict'
import test from 'node:test'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { Context } from '@deepseek-ai/cordis'
import { answerSearchQuery, expandAndSearch, parseSearchExpansion } from '../src/search-intelligence.ts'

test('accepts only bounded strict query expansion JSON', () => {
  assert.deepEqual(parseSearchExpansion('{"queries":["automobile"]}'), ['automobile'])
  assert.throws(() => parseSearchExpansion('{"queries":["automobile"],"extra":true}'))
  assert.throws(() => parseSearchExpansion('```json {"queries":[]} ```'))
})

class ExpansionAdapter extends LlmAdapter {
  private readonly output: string
  constructor(output: string) { super(); this.output = output }
  override listModels(): Promise<readonly []> { return Promise.resolve([]) }
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> { return Promise.resolve({ provider, id: model, name: model }) }
  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: this.output }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const searchRequest = {
  query: 'car',
  vaultGeneration: 4,
  mode: 'related' as const,
}

test('expands a zero-overlap query and merges bounded local candidates', async () => {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['fake'], new ExpansionAdapter('{"queries":["automobile"]}'))
  try {
    const result = await expandAndSearch(context.llm, searchRequest, 'fake', 'model', async request => ({
      cursor: null,
      generation: 4,
      matches: request.query === 'automobile' ? [{ kind: 'content', line: 1, path: 'Mobility.md', preview: 'Automobile guide', score: 2 }] : [],
      query: request.query,
      scan: { bytes: 20, entries: 1, files: 1 },
      truncated: false,
      truncationReason: null,
      warnings: [],
    }), new AbortController().signal)
    assert.equal(result.status, 'applied')
    assert.equal(result.matches[0]?.path, 'Mobility.md')
  } finally {
    await context.fiber.dispose()
  }
})

test('answers from bounded excerpts and projects only captured citation metadata', async () => {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['fake'], new ExpansionAdapter('{"answer":"Use the checklist.","citations":["qa-1"]}'))
  try {
    const result = await answerSearchQuery(context.llm, {
      query: 'where',
      vaultGeneration: 4,
      candidates: [{ id: 'qa-1', path: 'Answer.md', line: 2, lineEnd: 2, preview: 'The answer.' }],
    }, 'fake', 'model', async path => ({ path, content: '# Answer\nThe checklist.\n' }), new AbortController().signal)
    assert.deepEqual(result, {
      status: 'completed',
      answer: 'Use the checklist.',
      citations: [{ id: 'qa-1', path: 'Answer.md', line: 2, lineEnd: 2 }],
    })
  } finally {
    await context.fiber.dispose()
  }
})

test('rejects unknown and duplicate Quick Answer citations from the captured candidate map', async () => {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['fake'], new ExpansionAdapter('{"answer":"unsafe","citations":["qa-unknown","qa-unknown"]}'))
  try {
    const result = await answerSearchQuery(context.llm, {
      query: 'where',
      vaultGeneration: 4,
      candidates: [{ id: 'qa-1', path: 'Answer.md', line: 2, lineEnd: 2, preview: 'The answer.' }],
    }, 'fake', 'model', async path => ({ path, content: '# Answer\nThe answer.\n' }), new AbortController().signal)
    assert.equal(result.status, 'invalid-output')
    assert.deepEqual(result.citations, [])
  } finally {
    await context.fiber.dispose()
  }
})

test('invalid output, missing provider, and cancellation preserve a non-blocking fallback', async () => {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['fake'], new ExpansionAdapter('[]'))
  try {
    const invalid = await expandAndSearch(context.llm, { ...searchRequest }, 'fake', 'model', async () => ({
      cursor: null, generation: 4, matches: [], query: 'car', scan: { bytes: 0, entries: 0, files: 0 }, truncated: false, truncationReason: null, warnings: [],
    }), new AbortController().signal)
    assert.equal(invalid.status, 'invalid-output')
    const unavailable = await expandAndSearch(undefined, searchRequest, 'fake', 'model', async () => { throw new Error('must not search') }, new AbortController().signal)
    assert.equal(unavailable.status, 'provider-unavailable')
    const aborted = new AbortController()
    aborted.abort()
    const cancelled = await expandAndSearch(context.llm, searchRequest, 'fake', 'model', async () => { throw new Error('must not search') }, aborted.signal)
    assert.equal(cancelled.status, 'cancelled')
  } finally {
    await context.fiber.dispose()
  }
})
