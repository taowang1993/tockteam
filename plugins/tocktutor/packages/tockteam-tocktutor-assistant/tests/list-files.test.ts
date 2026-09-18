import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ListTreeRequest,
  NoteVaultState,
  OpenDocumentResult,
  VaultReference,
  VaultTreePage,
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

function page(overrides: Partial<VaultTreePage> = {}): VaultTreePage {
  return {
    complete: true,
    cursor: null,
    entries: [],
    generation: binding.vaultGeneration,
    scan: { entries: 0 },
    truncated: false,
    truncationReason: null,
    warnings: [],
    ...overrides,
  }
}

class FakeTreeRuntime implements RuntimeDocumentReader {
  state: NoteVaultState = { active: true, id: binding.vaultId, generation: binding.vaultGeneration }
  calls: Array<{ request: ListTreeRequest; signal: AbortSignal }> = []
  pages: VaultTreePage[] = [page()]
  failure: unknown = null
  pending: Promise<VaultTreePage> | null = null

  openDocument(_path: string, _vault: VaultReference, _signal: AbortSignal): Promise<OpenDocumentResult> {
    throw new Error('unexpected document read')
  }

  async listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage> {
    this.calls.push({ request, signal })
    if (this.failure !== null) throw this.failure
    if (this.pending !== null) return this.pending
    return this.pages[this.calls.length - 1] ?? page()
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof ReadToolError && error.code === code
}

async function list(
  runtime: FakeTreeRuntime,
  args: unknown,
  current: (candidate: ReadBinding) => boolean = () => true,
  signal = new AbortController().signal,
) {
  const adapter = new PennivoReadAdapter(runtime, current)
  const outcome = await adapter.execute('list_files', args, binding, signal)
  assert.equal(outcome.source, null)
  assert.equal(outcome.result.content[0].type, 'text')
  return JSON.parse(outcome.result.content[0].text) as Record<string, unknown>
}

const revision = `file:${'a'.repeat(64)}`

const entries: VaultTreePage['entries'] = [
  { kind: 'directory', path: 'attachments', modifiedAt: 1, revision },
  { kind: 'directory', path: 'notes', modifiedAt: 2, revision },
  { kind: 'directory', path: 'notes/nested', modifiedAt: 3, revision },
  { kind: 'document', path: 'root.md', size: 10, createdAt: 4, modifiedAt: 5, revision },
  { kind: 'document', path: 'notes/a.md', size: 20, createdAt: 6, modifiedAt: 7, revision },
  { kind: 'document', path: 'notes/nested/b.markdown', size: 30, createdAt: 8, modifiedAt: 9, revision },
  { kind: 'document', path: 'notes/data.canvas', size: 40, createdAt: 10, modifiedAt: 11, revision },
  {
    kind: 'attachment',
    path: 'attachments/image.png',
    mediaKind: 'image',
    size: 50,
    createdAt: 12,
    modifiedAt: 13,
    revision,
  },
]

test('list_files projects root and scoped tree pages into Pennivo folder-first JSON', async () => {
  const runtime = new FakeTreeRuntime()
  runtime.pages = [page({ entries, scan: { entries: entries.length } })]

  const root = await list(runtime, {})
  assert.deepEqual(root, {
    root: '',
    recursive: false,
    entries: [
      { name: 'attachments', path: 'attachments', type: 'folder' },
      { name: 'notes', path: 'notes', type: 'folder' },
      { name: 'root.md', path: 'root.md', type: 'file', size: 10, mtimeMs: 5 },
    ],
    truncated: false,
    warnings: [],
  })

  runtime.calls = []
  const scoped = await list(runtime, { path: 'notes', recursive: true })
  assert.deepEqual(scoped, {
    root: 'notes',
    recursive: true,
    entries: [
      {
        name: 'nested',
        path: 'notes/nested',
        type: 'folder',
        children: [
          {
            name: 'b.markdown',
            path: 'notes/nested/b.markdown',
            type: 'file',
            size: 30,
            mtimeMs: 9,
          },
        ],
      },
      { name: 'a.md', path: 'notes/a.md', type: 'file', size: 20, mtimeMs: 7 },
    ],
    truncated: false,
    warnings: [],
  })
})

test('list_files follows bounded opaque cursors and binds every page to one vault', async () => {
  const runtime = new FakeTreeRuntime()
  runtime.pages = [
    page({
      complete: false,
      cursor: 'cursor-2',
      entries: entries.slice(0, 3),
      scan: { entries: entries.length },
      truncated: true,
      truncationReason: 'result-limit',
    }),
    page({ entries: entries.slice(3), scan: { entries: entries.length } }),
  ]

  const result = await list(runtime, { recursive: true })
  assert.equal((result.entries as unknown[]).length, 2)
  assert.deepEqual(runtime.calls.map(call => call.request), [
    {
      expectedVault: { id: binding.vaultId, generation: binding.vaultGeneration },
      cursor: null,
      limit: 1_000,
    },
    {
      expectedVault: { id: binding.vaultId, generation: binding.vaultGeneration },
      cursor: 'cursor-2',
      limit: 1_000,
    },
  ])
})

test('list_files stops at the adapter page cap with a truthful truncation marker', async () => {
  const runtime = new FakeTreeRuntime()
  runtime.pages = Array.from({ length: 10 }, (_, index) => page({
    complete: false,
    cursor: `cursor-${index + 1}`,
    entries: [{
      kind: 'document',
      path: `note-${index}.md`,
      size: index,
      createdAt: index,
      modifiedAt: index,
      revision,
    }],
    scan: { entries: 20_000 },
    truncated: true,
    truncationReason: 'result-limit',
  }))

  const result = await list(runtime, {})
  assert.equal(runtime.calls.length, 10)
  assert.equal(result.truncated, true)
})

test('list_files validates strict arguments before calling the runtime', async () => {
  for (const args of [
    null,
    { path: '' },
    { path: '../notes' },
    { path: '/Users/max' },
    { path: 'notes\\private' },
    { recursive: 'yes' },
    { extra: true },
  ]) {
    const runtime = new FakeTreeRuntime()
    await assert.rejects(list(runtime, args), error => expectCode(error, 'INVALID_ARGUMENTS'))
    assert.equal(runtime.calls.length, 0)
  }
})

test('list_files keeps JSON bounded, parseable, truncated, and redacted', async () => {
  const runtime = new FakeTreeRuntime()
  const many = Array.from({ length: 500 }, (_, index) => ({
    kind: 'document' as const,
    path: `notes/${index.toString().padStart(3, '0')}-${'x'.repeat(80)}.md`,
    size: index,
    createdAt: index,
    modifiedAt: index,
    revision,
  }))
  runtime.pages = [page({
    complete: false,
    entries: many,
    scan: { entries: many.length },
    truncated: true,
    truncationReason: 'entry-limit',
    warnings: ['Bearer top-secret /Users/max/private'],
  })]

  const result = await list(runtime, { recursive: true })
  const serialized = JSON.stringify(result)
  assert.ok(serialized.length <= 32_000)
  assert.equal(result.truncated, true)
  assert.doesNotMatch(serialized, /top-secret|\/Users\/max/u)
  assert.ok((result.entries as unknown[]).length < many.length)
})

test('malformed pages and repeated cursors fail closed', async () => {
  const malformed: VaultTreePage[] = [
    page({ generation: 8 }),
    page({ complete: false }),
    page({ entries: [{ kind: 'directory', path: '../outside', modifiedAt: 1, revision }] }),
    page({ entries: [{ kind: 'document', path: 'note.md', size: -1, createdAt: 1, modifiedAt: 1, revision }] }),
    page({ warnings: ['/Users/max/'.repeat(1_000)] }),
    page({ complete: false, cursor: null, truncated: true, truncationReason: 'result-limit' }),
  ]
  for (const value of malformed) {
    const runtime = new FakeTreeRuntime()
    runtime.pages = [value]
    await assert.rejects(list(runtime, {}), error => expectCode(error, 'INVALID_RESULT'))
  }

  const repeated = new FakeTreeRuntime()
  repeated.pages = [
    page({ complete: false, cursor: 'same', truncated: true, truncationReason: 'result-limit' }),
    page({ complete: false, cursor: 'same', truncated: true, truncationReason: 'result-limit' }),
  ]
  await assert.rejects(list(repeated, {}), error => expectCode(error, 'INVALID_RESULT'))
})

test('abort, runtime refusal, and late binding changes are sanitized and suppress results', async () => {
  const aborted = new AbortController()
  aborted.abort('Bearer private /Users/max')
  await assert.rejects(
    list(new FakeTreeRuntime(), {}, () => true, aborted.signal),
    error => expectCode(error, 'ABORTED') && !String(error).includes('/Users/max'),
  )

  const refused = new FakeTreeRuntime()
  refused.failure = Object.assign(new Error('Bearer private /Users/max'), {
    name: 'NoteVaultError',
    code: 'unsafe-target',
  })
  await assert.rejects(
    list(refused, {}),
    error => expectCode(error, 'READ_DENIED') && !String(error).includes('/Users/max'),
  )

  const late = new FakeTreeRuntime()
  let current = true
  let resolve!: (value: VaultTreePage) => void
  late.pending = new Promise<VaultTreePage>(accept => { resolve = accept })
  const pending = list(late, {}, () => current)
  current = false
  resolve(page({ entries }))
  await assert.rejects(pending, error => expectCode(error, 'STALE_CONTEXT'))
})
