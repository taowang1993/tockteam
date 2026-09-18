import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, {
  Config as RuntimeConfig,
  type ListTreeRequest,
  type NoteVaultState,
  type OpenDocumentResult,
  type VaultReference,
  type VaultSearchArgs,
  type VaultSearchResult,
  type VaultTreePage,
  type VaultInspectionRuntimeResult,
} from 'tockbot-note-runtime'
import {
  PennivoReadAdapter,
  ReadToolError,
  type ReadBinding,
  type RuntimeDocumentReader,
} from '../src/read-tools.ts'

const binding: ReadBinding = {
  vaultId: 'vault:1234567890abcdef',
  vaultGeneration: 7,
  childInstanceId: 'child-1234567890abcdef',
  turnId: 'turn-1234567890abcdef',
}

type SearchPage = VaultInspectionRuntimeResult<VaultSearchResult>

function page(overrides: Partial<SearchPage> = {}): SearchPage {
  return {
    cursor: null,
    generation: binding.vaultGeneration,
    matches: [],
    query: 'content:alpha content:beta',
    scan: { bytes: 100, entries: 2, files: 2 },
    truncated: false,
    truncationReason: null,
    warnings: [],
    ...overrides,
  }
}

class FakeSearchRuntime implements RuntimeDocumentReader {
  state: NoteVaultState = { active: true, id: binding.vaultId, generation: binding.vaultGeneration }
  calls: Array<{ args: VaultSearchArgs; vault: VaultReference; signal: AbortSignal }> = []
  pages: SearchPage[] = [page()]
  failure: unknown = null
  pending: Promise<SearchPage> | null = null

  listTree(_request: ListTreeRequest, _signal: AbortSignal): Promise<VaultTreePage> {
    throw new Error('unexpected tree read')
  }

  openDocument(_path: string, _vault: VaultReference, _signal: AbortSignal): Promise<OpenDocumentResult> {
    throw new Error('unexpected document read')
  }

  async search(
    args: VaultSearchArgs,
    vault: VaultReference,
    signal: AbortSignal,
  ): Promise<SearchPage> {
    this.calls.push({ args, vault, signal })
    if (this.failure !== null) throw this.failure
    return this.pending ?? this.pages[this.calls.length - 1] ?? page()
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof ReadToolError && error.code === code
}

async function search(
  runtime: RuntimeDocumentReader,
  args: unknown,
  current: (candidate: ReadBinding) => boolean = () => true,
  signal = new AbortController().signal,
) {
  const outcome = await new PennivoReadAdapter(runtime, current).execute('search', args, binding, signal)
  assert.equal(outcome.source, null)
  assert.ok(outcome.result.content[0].text.length <= 32_000)
  return {
    outcome,
    payload: JSON.parse(outcome.result.content[0].text) as Record<string, unknown>,
  }
}

test('search maps strict Pennivo options to paged runtime query search and returns relative Markdown matches', async () => {
  const runtime = new FakeSearchRuntime()
  runtime.pages = [
    page({
      cursor: 'cursor-next-12345678',
      matches: [
        { path: 'board.canvas', kind: 'canvas', line: null, preview: 'alpha beta' },
        { path: 'notes/a.md', kind: 'line', line: 3, preview: 'alpha beta first' },
      ],
      truncated: true,
      truncationReason: 'result-limit',
    }),
    page({
      matches: [{ path: 'notes/b.markdown', kind: 'content', line: 8, preview: 'second alpha beta' }],
    }),
  ]

  const { outcome, payload } = await search(runtime, {
    query: 'alpha beta',
    scope: 'notes',
    caseSensitive: true,
    wholeWord: true,
    regex: false,
  })

  assert.deepEqual(runtime.calls.map(call => ({ args: call.args, vault: call.vault })), [
    {
      args: {
        query: 'content:alpha content:beta', mode: 'query', directory: 'notes', caseSensitive: true,
        wholeWord: true, regex: false, limit: 200,
      },
      vault: { id: binding.vaultId, generation: binding.vaultGeneration },
    },
    {
      args: {
        query: 'content:alpha content:beta', mode: 'query', directory: 'notes', caseSensitive: true,
        wholeWord: true, regex: false, limit: 200, cursor: 'cursor-next-12345678',
      },
      vault: { id: binding.vaultId, generation: binding.vaultGeneration },
    },
  ])
  assert.deepEqual(payload, {
    query: 'alpha beta',
    scope: 'notes',
    matchCount: 2,
    capped: false,
    files: [
      { path: 'notes/a.md', matchCount: 1, lines: [{ line: 3, snippet: 'alpha beta first' }] },
      { path: 'notes/b.markdown', matchCount: 1, lines: [{ line: 8, snippet: 'second alpha beta' }] },
    ],
    matches: [
      { path: 'notes/a.md', line: 3, preview: 'alpha beta first' },
      { path: 'notes/b.markdown', line: 8, preview: 'second alpha beta' },
    ],
  })
  assert.equal(outcome.truncated, false)
})

test('search preserves Pennivo content-term semantics instead of runtime query operators', async () => {
  const runtime = new FakeSearchRuntime()
  runtime.pages = [page({
    query: 'content:OR content:tag:foo content:-draft',
    matches: [{ path: 'notes/a.md', kind: 'content', line: 2, preview: 'OR tag:foo -draft' }],
  })]
  const { payload } = await search(runtime, { query: 'OR tag:foo -draft' })
  assert.equal(runtime.calls[0]?.args.query, 'content:OR content:tag:foo content:-draft')
  assert.equal(payload.query, 'OR tag:foo -draft')

  const short = new FakeSearchRuntime()
  const empty = await search(short, { query: 'x' })
  assert.equal(short.calls.length, 0)
  assert.deepEqual(empty.payload, {
    query: 'x', scope: '', matchCount: 0, capped: false, files: [], matches: [],
  })
})

test('search rejects malformed options and unsafe scope before runtime access', async () => {
  for (const args of [
    null,
    {},
    { query: '' },
    { query: 'a'.repeat(513) },
    { query: 'alpha', scope: '' },
    { query: 'alpha', scope: '../notes' },
    { query: 'alpha', scope: '/Users/max/notes' },
    { query: 'alpha', caseSensitive: 'yes' },
    { query: 'alpha', extra: true },
  ]) {
    const runtime = new FakeSearchRuntime()
    await assert.rejects(search(runtime, args), error => expectCode(error, 'INVALID_ARGUMENTS'))
    assert.equal(runtime.calls.length, 0)
  }
})

test('search bounds returned matches as complete JSON and reports truthful capping', async () => {
  const runtime = new FakeSearchRuntime()
  runtime.pages = [page({
    matches: Array.from({ length: 200 }, (_, index) => ({
      path: `notes/${index.toString().padStart(3, '0')}-${'p'.repeat(200)}.md`,
      kind: 'line' as const,
      line: index + 1,
      preview: `alpha beta ${'q'.repeat(225)}`,
    })),
  })]
  const { outcome, payload } = await search(runtime, { query: 'alpha beta' })
  assert.equal(outcome.truncated, true)
  assert.equal(payload.capped, true)
  assert.ok((payload.matches as unknown[]).length < 200)
  assert.doesNotThrow(() => JSON.stringify(payload))
})

test('search rejects malformed runtime pages, duplicate cursors, and unsafe model-visible metadata', async () => {
  const malformed: SearchPage[][] = [
    [page({ generation: 8 })],
    [page({ query: 'different' })],
    [page({ matches: [{ path: '/Users/max/a.md', kind: 'line', line: 1, preview: 'alpha' }] })],
    [page({ matches: [{ path: 'a.md', kind: 'line', line: 0, preview: 'alpha' }] })],
    [page({ matches: [{ path: 'a.md', kind: 'unknown' as never, line: 1, preview: 'alpha' }] })],
    [page({ matches: [{ path: 'a.md', kind: 'line', line: 1, preview: 'x'.repeat(241) }] })],
    [page({ cursor: 'repeat-12345678', truncated: true, truncationReason: 'result-limit' }), page({ cursor: 'repeat-12345678', truncated: true, truncationReason: 'result-limit' })],
  ]
  for (const pages of malformed) {
    const runtime = new FakeSearchRuntime()
    runtime.pages = pages
    await assert.rejects(search(runtime, { query: 'alpha beta' }), error => expectCode(error, 'INVALID_RESULT'))
  }
})

test('search sanitizes runtime failures, cancellation, and late vault/child/turn changes', async () => {
  const failed = new FakeSearchRuntime()
  failed.failure = new Error('Bearer top-secret /Users/max/private')
  await assert.rejects(
    search(failed, { query: 'alpha beta' }),
    error => expectCode(error, 'RUNTIME_FAILURE') && !String(error).includes('/Users/max'),
  )

  const aborted = new AbortController()
  aborted.abort('Bearer top-secret /Users/max')
  await assert.rejects(
    search(new FakeSearchRuntime(), { query: 'alpha beta' }, () => true, aborted.signal),
    error => expectCode(error, 'ABORTED'),
  )

  const late = new FakeSearchRuntime()
  let current = true
  let resolve!: (result: SearchPage) => void
  late.pending = new Promise<SearchPage>(accept => { resolve = accept })
  const pending = search(late, { query: 'alpha beta' }, () => current)
  current = false
  resolve(page({ matches: [{ path: 'a.md', kind: 'line', line: 1, preview: 'alpha beta' }] }))
  await assert.rejects(pending, error => expectCode(error, 'STALE_CONTEXT'))
})

test('search uses the real noteVault inspection seam without exposing vault roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-search-vault-'))
  const stateRoot = await mkdtemp(join(tmpdir(), 'assistant-search-state-'))
  const context = new Context()
  try {
    await writeFile(join(root, 'alpha.md'), '# Alpha\nsecret-token-42 alpha beta\n', 'utf8')
    await writeFile(join(root, 'ignored.txt'), 'secret-token-42 alpha beta\n', 'utf8')
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot, vaultRoot: root } as never))
    const runtime = context.get('noteVault') as unknown as NoteVaultRuntime
    const state = runtime.state
    assert.equal(state.active, true)
    if (!state.active) throw new Error('expected active vault')
    const realBinding: ReadBinding = {
      ...binding,
      vaultId: state.id,
      vaultGeneration: state.generation,
    }
    const adapter = new PennivoReadAdapter(runtime, candidate => (
      candidate.vaultId === state.id && candidate.vaultGeneration === state.generation
    ))
    const outcome = await adapter.execute('search', { query: 'secret-token-42 alpha' }, realBinding, new AbortController().signal)
    const text = outcome.result.content[0].text
    assert.match(text, /alpha\.md/u)
    assert.match(text, /secret-token-42/u)
    assert.doesNotMatch(text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
    assert.doesNotMatch(text, /ignored\.txt/u)
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(stateRoot, { recursive: true, force: true })
  }
})
