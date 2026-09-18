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
  readonly requests: GenerateOptions[] = []
  private readonly output: string
  constructor(output: string) { super(); this.output = output }
  override listModels(): Promise<readonly []> { return Promise.resolve([]) }
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> { return Promise.resolve({ provider, id: model, name: model }) }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
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

test('maps a stale turn binding to a cancelled search result', async () => {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['fake'], new ExpansionAdapter('{"queries":[]}'))
  try {
    const result = await expandAndSearch(
      context.llm,
      searchRequest,
      'fake',
      'model',
      async () => { throw new Error('must not search') },
      new AbortController().signal,
      () => false,
    )
    assert.equal(result.status, 'cancelled')
  } finally {
    await context.fiber.dispose()
  }
})

test('rechecks the search binding before publishing applied candidates', async () => {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['fake'], new ExpansionAdapter('{"queries":[]}'))
  let current = true
  try {
    const result = await expandAndSearch(
      context.llm,
      searchRequest,
      'fake',
      'model',
      async request => {
        current = false
        return {
          cursor: null,
          generation: 4,
          matches: [{ kind: 'content', line: 1, path: `${request.query}.md`, preview: request.query }],
          query: request.query,
          scan: { bytes: 1, entries: 1, files: 1 },
          truncated: false,
          truncationReason: null,
          warnings: [],
        }
      },
      new AbortController().signal,
      () => current,
    )
    assert.equal(result.status, 'cancelled')
    assert.deepEqual(result.matches, [])
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
      candidates: [{ id: 'qa-1', revision: 'revision:answer', path: 'Answer.md', line: 2, lineEnd: 2, preview: 'The answer.' }],
    }, 'fake', 'model', async path => ({ path, content: '# Answer\nThe checklist.\n', revision: 'revision:answer' }), new AbortController().signal)
    assert.deepEqual(result, {
      status: 'completed',
      answer: 'Use the checklist.',
      citations: [{ id: 'qa-1', path: 'Answer.md', line: 2, lineEnd: 2 }],
    })
  } finally {
    await context.fiber.dispose()
  }
})

for (const citedId of ['qa-1', 'qa-20']) {
  test(`Quick Answer admits only complete provider-visible evidence (${citedId})`, async () => {
    const context = new Context()
    await context.plugin(LlmRuntime)
    const adapter = new ExpansionAdapter(JSON.stringify({ answer: 'Use the evidence.', citations: [citedId] }))
    context.llm.registerAdapter(['fake'], adapter)
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      id: `qa-${index + 1}`, revision: 'revision:answer', path: `Note-${index + 1}.md`, line: 1, lineEnd: 1, preview: '',
    }))
    const documents = new Map(candidates.map(candidate => [candidate.path, `${'x'.repeat(1_980)} END-${candidate.id}`]))
    try {
      const result = await answerSearchQuery(context.llm, {
        query: 'where', vaultGeneration: 4, candidates,
      }, 'fake', 'model', async path => ({ path, content: documents.get(path)!, revision: 'revision:answer' }), new AbortController().signal)
      const prompt = adapter.requests[0]!.messages[0]!.content.filter(block => block.type === 'text').map(block => block.text).join('')
      assert.equal(prompt.includes('Candidate qa-20:'), false, 'late evidence does not fit the provider budget')
      assert.equal(result.status, citedId === 'qa-20' ? 'invalid-output' : 'completed')
      if (citedId === 'qa-20') assert.deepEqual(result.citations, [])
      else assert.deepEqual(result.citations, [{ id: 'qa-1', path: 'Note-1.md', line: 1, lineEnd: 1 }])
      assert.ok(prompt.length <= 8_000 + 'Current User Message:\n'.length)
      for (const candidate of candidates) {
        if (prompt.includes(`Candidate ${candidate.id}:`)) {
          assert.ok(prompt.includes(`Candidate ${candidate.id}:\n${documents.get(candidate.path)!}`), 'no evidence block is cut mid-excerpt')
        }
      }
    } finally {
      await context.fiber.dispose()
    }
  })
}

for (const includeSafeCandidate of [false, true]) {
  test(`Quick Answer excludes evidence changed by the prompt redactor (safe candidate: ${includeSafeCandidate})`, async () => {
    const context = new Context()
    await context.plugin(LlmRuntime)
    const adapter = new ExpansionAdapter('{"answer":"Use the evidence.","citations":["qa-1"]}')
    context.llm.registerAdapter(['fake'], adapter)
    const metadata = { revision: 'revision:answer', path: 'Answer.md', line: 1, preview: '' }
    try {
      const result = await answerSearchQuery(context.llm, {
        query: 'where', vaultGeneration: 4,
        candidates: [...(includeSafeCandidate ? [{ ...metadata, id: 'qa-1' }] : []), { ...metadata, id: 'api_key:privatevalue' }],
      }, 'fake', 'model', async path => ({ path, content: 'Evidence with Bearer privatevalue', revision: 'revision:answer' }), new AbortController().signal)
      assert.equal(result.status, includeSafeCandidate ? 'completed' : 'no-evidence')
      assert.equal(adapter.requests.length, includeSafeCandidate ? 1 : 0)
      if (includeSafeCandidate) {
        const prompt = JSON.stringify(adapter.requests[0]!.messages)
        assert.ok(prompt.includes('Candidate qa-1:'))
        assert.ok(prompt.includes('[REDACTED]'))
        assert.equal(prompt.includes('Candidate api_key:'), false)
        assert.equal(prompt.includes('privatevalue'), false)
      } else assert.deepEqual(result.citations, [])
    } finally {
      await context.fiber.dispose()
    }
  })
}

test('rejects unknown and duplicate Quick Answer citations from the captured candidate map', async () => {
  const context = new Context()
  await context.plugin(LlmRuntime)
  context.llm.registerAdapter(['fake'], new ExpansionAdapter('{"answer":"unsafe","citations":["qa-unknown","qa-unknown"]}'))
  try {
    const result = await answerSearchQuery(context.llm, {
      query: 'where',
      vaultGeneration: 4,
      candidates: [{ id: 'qa-1', revision: 'revision:answer', path: 'Answer.md', line: 2, lineEnd: 2, preview: 'The answer.' }],
    }, 'fake', 'model', async path => ({ path, content: '# Answer\nThe answer.\n', revision: 'revision:answer' }), new AbortController().signal)
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
