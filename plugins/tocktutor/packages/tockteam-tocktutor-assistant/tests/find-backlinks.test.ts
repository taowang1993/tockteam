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
  type VaultInspectionRuntimeResult,
  type VaultLinksArgs,
  type VaultLinksResult,
  type VaultReference,
  type VaultTreePage,
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

type LinksPage = VaultInspectionRuntimeResult<VaultLinksResult>

function page(overrides: Partial<LinksPage> = {}): LinksPage {
  return {
    backlinkDetails: [],
    backlinks: [],
    cursor: null,
    generation: binding.vaultGeneration,
    outgoing: [],
    outgoingDetails: [],
    path: 'notes/target.md',
    scan: { bytes: 100, entries: 2, files: 2 },
    tagRelations: [],
    truncated: false,
    truncationReason: null,
    warnings: [],
    ...overrides,
  }
}

function backlink(sourcePath: string, line: number) {
  return {
    authoredTarget: 'target.md',
    displayText: 'Target',
    fragment: null,
    kind: 'markdown' as const,
    line,
    normalizedTarget: 'target.md',
    resolvedPath: 'notes/target.md',
    sourcePath,
    status: 'resolved' as const,
  }
}

class FakeLinksRuntime implements RuntimeDocumentReader {
  state: NoteVaultState = { active: true, id: binding.vaultId, generation: binding.vaultGeneration }
  calls: Array<{ args: VaultLinksArgs; vault: VaultReference; signal: AbortSignal }> = []
  pages: LinksPage[] = [page()]
  failure: unknown = null
  pending: Promise<LinksPage> | null = null

  listTree(_request: ListTreeRequest, _signal: AbortSignal): Promise<VaultTreePage> {
    throw new Error('unexpected tree read')
  }

  openDocument(_path: string, _vault: VaultReference, _signal: AbortSignal): Promise<OpenDocumentResult> {
    throw new Error('unexpected document read')
  }

  async links(args: VaultLinksArgs, vault: VaultReference, signal: AbortSignal): Promise<LinksPage> {
    this.calls.push({ args, vault, signal })
    if (this.failure !== null) throw this.failure
    return this.pending ?? this.pages[this.calls.length - 1] ?? page()
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof ReadToolError && error.code === code
}

async function find(
  runtime: RuntimeDocumentReader,
  args: unknown,
  current: (candidate: ReadBinding) => boolean = () => true,
  signal = new AbortController().signal,
) {
  const outcome = await new PennivoReadAdapter(runtime, current).execute('find_backlinks', args, binding, signal)
  assert.equal(outcome.source, null)
  assert.ok(outcome.result.content[0].text.length <= 32_000)
  return {
    outcome,
    payload: JSON.parse(outcome.result.content[0].text) as Record<string, unknown>,
  }
}

test('find_backlinks pages the runtime and projects only resolved Markdown backlink fields', async () => {
  const runtime = new FakeLinksRuntime()
  runtime.pages = [
    page({
      backlinkDetails: [backlink('notes/a.md', 3)],
      backlinks: ['notes/a.md'],
      cursor: 'links-next-12345678',
      outgoing: ['notes/other.md'],
      outgoingDetails: [{ ...backlink('notes/target.md', 1), resolvedPath: 'notes/other.md' }],
      tagRelations: [{ tag: 'private', paths: ['notes/a.md'] }],
      truncated: true,
      truncationReason: 'result-limit',
    }),
    page({
      backlinkDetails: [{ ...backlink('notes/b.markdown', 9), authoredTarget: '../target.md', displayText: '' }],
      backlinks: ['notes/b.markdown'],
    }),
  ]

  const { outcome, payload } = await find(runtime, { path: 'notes/target.md' })

  assert.deepEqual(runtime.calls.map(call => ({ args: call.args, vault: call.vault })), [
    {
      args: { path: 'notes/target.md' },
      vault: { id: binding.vaultId, generation: binding.vaultGeneration },
    },
    {
      args: { path: 'notes/target.md', cursor: 'links-next-12345678' },
      vault: { id: binding.vaultId, generation: binding.vaultGeneration },
    },
  ])
  assert.deepEqual(payload, {
    path: 'notes/target.md',
    count: 2,
    capped: false,
    backlinks: [
      { path: 'notes/a.md', line: 3, linkText: 'Target', url: 'target.md' },
      { path: 'notes/b.markdown', line: 9, linkText: '', url: '../target.md' },
    ],
  })
  assert.equal(outcome.truncated, false)
  assert.doesNotMatch(JSON.stringify(payload), /other\.md|private|resolvedPath|normalizedTarget/u)
})

test('find_backlinks rejects malformed and unsafe arguments before runtime access', async () => {
  for (const args of [null, {}, { path: '' }, { path: '../target.md' }, { path: '/Users/max/target.md' }, { path: 'target.md', extra: true }]) {
    const runtime = new FakeLinksRuntime()
    await assert.rejects(find(runtime, args), error => expectCode(error, 'INVALID_ARGUMENTS'))
    assert.equal(runtime.calls.length, 0)
  }
})

test('find_backlinks bounds valid records as parseable JSON and reports capping', async () => {
  const runtime = new FakeLinksRuntime()
  runtime.pages = [page({
    backlinkDetails: Array.from({ length: 200 }, (_, index) => ({
      ...backlink(`notes/${index.toString().padStart(3, '0')}-${'p'.repeat(120)}.md`, index + 1),
      displayText: 'q'.repeat(200),
    })),
  })]
  const { outcome, payload } = await find(runtime, { path: 'notes/target.md' })
  assert.equal(outcome.truncated, true)
  assert.equal(payload.capped, true)
  assert.equal(payload.count, 200)
  assert.ok((payload.backlinks as unknown[]).length < 200)
})

test('find_backlinks rejects malformed link pages and cursor cycles', async () => {
  const malformed: LinksPage[][] = [
    [page({ generation: 8 })],
    [page({ path: 'other.md' })],
    [page({ backlinkDetails: [backlink('/Users/max/a.md', 1)] })],
    [page({ backlinkDetails: [{ ...backlink('a.md', 1), resolvedPath: '../target.md' }] })],
    [page({ backlinkDetails: [{ ...backlink('a.md', 1), status: 'unresolved' }] })],
    [page({ backlinkDetails: [backlink('a.md', 0)] })],
    [page({ backlinkDetails: [{ ...backlink('a.md', 1), displayText: 'x'.repeat(1_025) }] })],
    [page({ cursor: 'repeat-12345678', truncated: true, truncationReason: 'result-limit' }), page({ cursor: 'repeat-12345678', truncated: true, truncationReason: 'result-limit' })],
  ]
  for (const pages of malformed) {
    const runtime = new FakeLinksRuntime()
    runtime.pages = pages
    await assert.rejects(find(runtime, { path: 'notes/target.md' }), error => expectCode(error, 'INVALID_RESULT'))
  }
})

test('find_backlinks sanitizes runtime failure, cancellation, and late binding changes', async () => {
  const failed = new FakeLinksRuntime()
  failed.failure = new Error('Bearer top-secret /Users/max/private')
  await assert.rejects(
    find(failed, { path: 'notes/target.md' }),
    error => expectCode(error, 'RUNTIME_FAILURE') && !String(error).includes('/Users/max'),
  )
  const aborted = new AbortController()
  aborted.abort('Bearer top-secret /Users/max')
  await assert.rejects(
    find(new FakeLinksRuntime(), { path: 'notes/target.md' }, () => true, aborted.signal),
    error => expectCode(error, 'ABORTED'),
  )
  const late = new FakeLinksRuntime()
  let current = true
  let resolve!: (result: LinksPage) => void
  late.pending = new Promise<LinksPage>(accept => { resolve = accept })
  const pending = find(late, { path: 'notes/target.md' }, () => current)
  current = false
  resolve(page({ backlinkDetails: [backlink('notes/a.md', 1)] }))
  await assert.rejects(pending, error => expectCode(error, 'STALE_CONTEXT'))
})

test('find_backlinks uses the real noteVault links seam and omits absolute links and roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-links-vault-'))
  const stateRoot = await mkdtemp(join(tmpdir(), 'assistant-links-state-'))
  const context = new Context()
  try {
    await writeFile(join(root, 'target.md'), '# Target\n', 'utf8')
    await writeFile(join(root, 'source.md'), '[Target](target.md)\n[Outside](/Users/max/target.md)\n', 'utf8')
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot, vaultRoot: root } as never))
    const runtime = context.get('noteVault') as unknown as NoteVaultRuntime
    const state = runtime.state
    assert.equal(state.active, true)
    if (!state.active) throw new Error('expected active vault')
    const realBinding: ReadBinding = { ...binding, vaultId: state.id, vaultGeneration: state.generation }
    const adapter = new PennivoReadAdapter(runtime, candidate => (
      candidate.vaultId === state.id && candidate.vaultGeneration === state.generation
    ))
    const outcome = await adapter.execute('find_backlinks', { path: 'target.md' }, realBinding, new AbortController().signal)
    const text = outcome.result.content[0].text
    assert.match(text, /source\.md/u)
    assert.match(text, /target\.md/u)
    assert.doesNotMatch(text, /\/Users\/max/u)
    assert.doesNotMatch(text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(stateRoot, { recursive: true, force: true })
  }
})
