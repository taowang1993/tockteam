import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ListTreeRequest,
  NoteVaultState,
  OpenDocumentResult,
  TrashListResult,
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

class FakeTrashRuntime implements RuntimeDocumentReader {
  state: NoteVaultState = { active: true, id: binding.vaultId, generation: binding.vaultGeneration }
  calls: Array<{ request: { expectedVault: VaultReference }; signal: AbortSignal }> = []
  result: TrashListResult = { generation: binding.vaultGeneration, entries: [] }
  failure: unknown = null
  pending: Promise<TrashListResult> | null = null

  listTree(_request: ListTreeRequest, _signal: AbortSignal): Promise<VaultTreePage> {
    throw new Error('unexpected tree read')
  }

  openDocument(_path: string, _vault: VaultReference, _signal: AbortSignal): Promise<OpenDocumentResult> {
    throw new Error('unexpected document read')
  }

  async listTrash(request: { expectedVault: VaultReference }, signal: AbortSignal): Promise<TrashListResult> {
    this.calls.push({ request, signal })
    if (this.failure !== null) throw this.failure
    return this.pending ?? this.result
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof ReadToolError && error.code === code
}

async function list(
  runtime: FakeTrashRuntime,
  args: unknown,
  current: (candidate: ReadBinding) => boolean = () => true,
  signal = new AbortController().signal,
) {
  const outcome = await new PennivoReadAdapter(runtime, current).execute(
    'list_trash', args, binding, signal,
  )
  assert.equal(outcome.source, null)
  const text = outcome.result.content[0].text
  assert.ok(text.length <= 32_000)
  return JSON.parse(text) as {
    entries: Array<Record<string, unknown>>
    truncated: boolean
  }
}

test('list_trash projects only bounded relative Pennivo selection metadata newest first', async () => {
  const runtime = new FakeTrashRuntime()
  runtime.result = {
    generation: 7,
    entries: [
      { createdAt: 2_000, id: 'trash-1234567890abcdef', kind: 'document', originalPath: 'notes/a.md' },
      { createdAt: 1_000, id: 'trash-fedcba0987654321', kind: 'folder', originalPath: 'archive' },
    ],
  }

  const result = await list(runtime, {})

  assert.deepEqual(runtime.calls.map(call => call.request), [{
    expectedVault: { id: binding.vaultId, generation: binding.vaultGeneration },
  }])
  assert.deepEqual(result, {
    entries: [
      {
        trashId: 'trash-1234567890abcdef',
        originalPath: 'notes/a.md',
        deletedAtMs: 2_000,
        expiresAtMs: null,
      },
      {
        trashId: 'trash-fedcba0987654321',
        originalPath: 'archive',
        deletedAtMs: 1_000,
        expiresAtMs: null,
      },
    ],
    truncated: false,
  })
})

test('list_trash accepts only an empty object before runtime access', async () => {
  for (const args of [null, [], '', { path: 'note.md' }, { extra: true }]) {
    const runtime = new FakeTrashRuntime()
    await assert.rejects(list(runtime, args), error => expectCode(error, 'INVALID_ARGUMENTS'))
    assert.equal(runtime.calls.length, 0)
  }
})

test('list_trash bounds oversized valid histories with parseable truthful output', async () => {
  const runtime = new FakeTrashRuntime()
  runtime.result = {
    generation: 7,
    entries: Array.from({ length: 100 }, (_, index) => ({
      createdAt: 10_000 - index,
      id: `trash-${index.toString().padStart(4, '0')}-${'a'.repeat(80)}`,
      kind: 'document' as const,
      originalPath: `notes/${index.toString().padStart(4, '0')}-${'b'.repeat(80)}.md`,
    })),
  }

  const result = await list(runtime, {})
  assert.equal(result.truncated, true)
  assert.equal(result.entries.length, 50)
})

test('malformed trash metadata fails closed without leaking revisions or roots', async () => {
  const valid = { createdAt: 2_000, id: 'trash-1234567890abcdef', kind: 'document' as const, originalPath: 'a.md' }
  const malformed: TrashListResult[] = [
    { generation: 8, entries: [] },
    { generation: 7, entries: [{ ...valid, originalPath: '../outside.md' }] },
    { generation: 7, entries: [{ ...valid, originalPath: '/Users/max/a.md' }] },
    { generation: 7, entries: [{ ...valid, id: '/Users/max/trash' }] },
    { generation: 7, entries: [{ ...valid, kind: 'unknown' as never }] },
    { generation: 7, entries: [{ ...valid, createdAt: -1 }] },
    { generation: 7, entries: [valid, { ...valid, createdAt: 3_000, id: 'trash-fedcba0987654321' }] },
    { generation: 7, entries: [valid, valid] },
    { generation: 7, entries: Array.from({ length: 1_001 }, (_, index) => ({ ...valid, id: `trash-${index}` })) },
  ]
  for (const result of malformed) {
    const runtime = new FakeTrashRuntime()
    runtime.result = result
    await assert.rejects(list(runtime, {}), error => expectCode(error, 'INVALID_RESULT'))
  }
})

test('disabled recovery, abort, and late binding changes fail with sanitized results', async () => {
  const unavailable = new FakeTrashRuntime()
  unavailable.failure = Object.assign(new Error('Bearer private /Users/max/state'), {
    name: 'NoteVaultError',
    code: 'recovery-unavailable',
  })
  await assert.rejects(
    list(unavailable, {}),
    error => expectCode(error, 'READ_UNAVAILABLE') && !String(error).includes('/Users/max'),
  )

  const aborted = new AbortController()
  aborted.abort('Bearer private /Users/max')
  await assert.rejects(
    list(new FakeTrashRuntime(), {}, () => true, aborted.signal),
    error => expectCode(error, 'ABORTED'),
  )

  const late = new FakeTrashRuntime()
  let current = true
  let resolve!: (result: TrashListResult) => void
  late.pending = new Promise<TrashListResult>(accept => { resolve = accept })
  const pending = list(late, {}, () => current)
  current = false
  resolve({ generation: 7, entries: [] })
  await assert.rejects(pending, error => expectCode(error, 'STALE_CONTEXT'))
})
