import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ListSnapshotsRequest,
  ListTreeRequest,
  NoteVaultState,
  OpenDocumentResult,
  SnapshotInfo,
  SnapshotListResult,
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

function snapshot(overrides: Partial<SnapshotInfo> = {}): SnapshotInfo {
  return {
    createdAt: 2_000,
    digest: `sha256:${'a'.repeat(64)}`,
    id: '2026-08-22T08-00-00-000Z-abcdef12',
    path: 'notes/a.md',
    reason: 'pre-overwrite',
    size: 42,
    ...overrides,
  }
}

class FakeSnapshotRuntime implements RuntimeDocumentReader {
  state: NoteVaultState = { active: true, id: binding.vaultId, generation: binding.vaultGeneration }
  calls: Array<{ request: ListSnapshotsRequest; signal: AbortSignal }> = []
  result: SnapshotListResult = { generation: binding.vaultGeneration, snapshots: [] }
  failure: unknown = null
  pending: Promise<SnapshotListResult> | null = null

  listTree(_request: ListTreeRequest, _signal: AbortSignal): Promise<VaultTreePage> {
    throw new Error('unexpected tree read')
  }

  openDocument(_path: string, _vault: VaultReference, _signal: AbortSignal): Promise<OpenDocumentResult> {
    throw new Error('unexpected document read')
  }

  async listSnapshots(request: ListSnapshotsRequest, signal: AbortSignal): Promise<SnapshotListResult> {
    this.calls.push({ request, signal })
    if (this.failure !== null) throw this.failure
    return this.pending ?? this.result
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof ReadToolError && error.code === code
}

async function list(
  runtime: FakeSnapshotRuntime,
  args: unknown,
  current: (candidate: ReadBinding) => boolean = () => true,
  signal = new AbortController().signal,
) {
  const adapter = new PennivoReadAdapter(runtime, current)
  const outcome = await adapter.execute('list_snapshots', args, binding, signal)
  assert.equal(outcome.source, null)
  const text = outcome.result.content[0].text
  assert.ok(text.length <= 32_000)
  return JSON.parse(text) as {
    path: string
    snapshots: Array<Record<string, unknown>>
    truncated: boolean
  }
}

test('list_snapshots projects only bounded Pennivo selection metadata newest first', async () => {
  const runtime = new FakeSnapshotRuntime()
  runtime.result = {
    generation: binding.vaultGeneration,
    snapshots: [
      snapshot(),
      snapshot({ createdAt: 1_000, id: '2026-08-22T07-00-00-000Z-12345678', size: 21 }),
    ],
  }

  const result = await list(runtime, { path: 'notes/a.md' })

  assert.deepEqual(runtime.calls.map(call => call.request), [{
    expectedVault: { id: binding.vaultId, generation: binding.vaultGeneration },
    path: 'notes/a.md',
  }])
  assert.deepEqual(result, {
    path: 'notes/a.md',
    snapshots: [
      {
        id: '2026-08-22T08-00-00-000Z-abcdef12',
        ts: 2_000,
        sizeBytes: 42,
        author: 'pre-overwrite',
        source: 'local',
      },
      {
        id: '2026-08-22T07-00-00-000Z-12345678',
        ts: 1_000,
        sizeBytes: 21,
        author: 'pre-overwrite',
        source: 'local',
      },
    ],
    truncated: false,
  })
  assert.doesNotMatch(JSON.stringify(result), /sha256:/u)
})

test('list_snapshots validates strict relative-path arguments before runtime access', async () => {
  for (const args of [
    null,
    {},
    { path: '' },
    { path: '../a.md' },
    { path: '/Users/max/a.md' },
    { path: 'C:\\a.md' },
    { path: 'notes/a.md', extra: true },
  ]) {
    const runtime = new FakeSnapshotRuntime()
    await assert.rejects(list(runtime, args), error => expectCode(error, 'INVALID_ARGUMENTS'))
    assert.equal(runtime.calls.length, 0)
  }
})

test('list_snapshots bounds a valid oversized history without cutting JSON', async () => {
  const runtime = new FakeSnapshotRuntime()
  runtime.result = {
    generation: binding.vaultGeneration,
    snapshots: Array.from({ length: 100 }, (_, index) => snapshot({
      createdAt: 10_000 - index,
      id: `2026-08-22T08-00-${index.toString().padStart(2, '0')}-000Z-${'a'.repeat(80)}`,
    })),
  }

  const result = await list(runtime, { path: 'notes/a.md' })

  assert.equal(result.truncated, true)
  assert.equal(result.snapshots.length, 50)
})

test('malformed snapshot metadata fails closed', async () => {
  const malformed: SnapshotListResult[] = [
    { generation: 8, snapshots: [] },
    { generation: 7, snapshots: [snapshot({ path: '../outside.md' })] },
    { generation: 7, snapshots: [snapshot({ digest: 'sha256:nope' })] },
    { generation: 7, snapshots: [snapshot({ id: '/Users/max/snapshot' })] },
    { generation: 7, snapshots: [snapshot({ reason: 'Bearer top-secret' })] },
    { generation: 7, snapshots: [snapshot({ size: -1 })] },
    {
      generation: 7,
      snapshots: [snapshot(), snapshot({ createdAt: 3_000, id: '2026-08-22T09-00-00-000Z-12345678' })],
    },
    { generation: 7, snapshots: [snapshot(), snapshot()] },
    { generation: 7, snapshots: Array.from({ length: 101 }, (_, index) => snapshot({ id: `snapshot-${index}` })) },
  ]
  for (const result of malformed) {
    const runtime = new FakeSnapshotRuntime()
    runtime.result = result
    await assert.rejects(
      list(runtime, { path: 'notes/a.md' }),
      error => expectCode(error, 'INVALID_RESULT'),
    )
  }
})

test('disabled recovery, abort, and late binding changes fail with sanitized results', async () => {
  const unavailable = new FakeSnapshotRuntime()
  unavailable.failure = Object.assign(new Error('Bearer private /Users/max/state'), {
    name: 'NoteVaultError',
    code: 'recovery-unavailable',
  })
  await assert.rejects(
    list(unavailable, { path: 'notes/a.md' }),
    error => expectCode(error, 'READ_UNAVAILABLE') && !String(error).includes('/Users/max'),
  )

  const aborted = new AbortController()
  aborted.abort('Bearer private /Users/max')
  await assert.rejects(
    list(new FakeSnapshotRuntime(), { path: 'notes/a.md' }, () => true, aborted.signal),
    error => expectCode(error, 'ABORTED'),
  )

  const late = new FakeSnapshotRuntime()
  let current = true
  let resolve!: (value: SnapshotListResult) => void
  late.pending = new Promise<SnapshotListResult>(accept => { resolve = accept })
  const pending = list(late, { path: 'notes/a.md' }, () => current)
  current = false
  resolve({ generation: 7, snapshots: [snapshot()] })
  await assert.rejects(pending, error => expectCode(error, 'STALE_CONTEXT'))
})
