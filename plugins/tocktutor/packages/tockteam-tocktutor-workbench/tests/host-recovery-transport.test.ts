import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import {
  MAX_DOCUMENT_CONTENT_BYTES,
  TockTutorWorkbenchGateway,
} from '../dist/host-read.js'
import type {
  CaptureSnapshotRequest,
  CreateDocumentRequest,
  DraftMutationResult,
  DraftRequest,
  DraftResult,
  ListSnapshotsRequest,
  ReadSnapshotRequest,
  RestoreSnapshotOverwriteRequest,
  RestoreSnapshotRequest,
  RestoreTrashRequest,
  SaveDocumentRequest,
  SaveDraftRequest,
  SnapshotContentResult,
  SnapshotListResult,
  SnapshotMutationResult,
  TrashEntryRequest,
  TrashListResult,
  TrashMutationResult,
  RestoreTrashResult,
  VaultReference,
  WriteDocumentResult,
} from '../dist/types.js'

const vault = Object.freeze({ generation: 11, id: `vault:${'1'.repeat(64)}` })
const signal = new AbortController().signal
const snapshotId = '2026-08-22T18-00-00-000Z-deadbeef'
const trashId = 'trash-123e4567-e89b-42d3-a456-426614174000'

class FakeRecoveryVault extends Service {
  readonly calls: Array<{ method: string; parameters: unknown[] }> = []
  failure: Error | null = null

  constructor(ctx: Context) {
    super(ctx, 'noteVault')
  }

  private result<T>(method: string, parameters: unknown[], value: T): Promise<T> {
    this.calls.push({ method, parameters })
    return this.failure === null ? Promise.resolve(value) : Promise.reject(this.failure)
  }

  createDocument(request: CreateDocumentRequest, operationSignal: AbortSignal): Promise<WriteDocumentResult> {
    return this.result('createDocument', [request, operationSignal], {
      digest: `sha256:${'2'.repeat(64)}`,
      generation: vault.generation,
      path: request.path,
      revision: `file:${'3'.repeat(64)}`,
      status: 'created',
    })
  }

  readDraft(request: DraftRequest, operationSignal: AbortSignal): Promise<DraftResult> {
    return this.result('readDraft', [request, operationSignal], {
      draft: { content: '# Draft\n', path: request.path, revision: `file:${'b'.repeat(64)}`, updatedAt: 3 },
      generation: vault.generation,
    })
  }

  saveDraft(request: SaveDraftRequest, operationSignal: AbortSignal): Promise<DraftMutationResult> {
    return this.result('saveDraft', [request, operationSignal], {
      generation: vault.generation,
      ok: true,
      updatedAt: 4,
    })
  }

  clearDraft(request: DraftRequest, operationSignal: AbortSignal): Promise<DraftMutationResult> {
    return this.result('clearDraft', [request, operationSignal], { generation: vault.generation, ok: true })
  }

  saveDocument(request: SaveDocumentRequest, operationSignal: AbortSignal): Promise<WriteDocumentResult> {
    return this.result('saveDocument', [request, operationSignal], {
      digest: `sha256:${'4'.repeat(64)}`,
      generation: vault.generation,
      path: request.path,
      revision: `file:${'5'.repeat(64)}`,
      snapshotId,
      status: 'saved',
    })
  }

  captureSnapshot(request: CaptureSnapshotRequest, operationSignal: AbortSignal): Promise<SnapshotMutationResult> {
    return this.result('captureSnapshot', [request, operationSignal], {
      generation: vault.generation,
      snapshot: { createdAt: 1, digest: `sha256:${'6'.repeat(64)}`, id: snapshotId, path: request.path, reason: request.reason ?? 'manual', size: request.content.length },
    })
  }

  clearSnapshots(request: ListSnapshotsRequest, operationSignal: AbortSignal): Promise<SnapshotMutationResult> {
    return this.result('clearSnapshots', [request, operationSignal], { generation: vault.generation, removed: 1 })
  }

  listSnapshots(request: ListSnapshotsRequest, operationSignal: AbortSignal): Promise<SnapshotListResult> {
    return this.result('listSnapshots', [request, operationSignal], {
      generation: vault.generation,
      snapshots: [{
        createdAt: 1,
        digest: `sha256:${'6'.repeat(64)}`,
        id: snapshotId,
        path: request.path,
        reason: 'before-save',
        size: 10,
      }],
    })
  }

  readSnapshot(request: ReadSnapshotRequest, operationSignal: AbortSignal): Promise<SnapshotContentResult> {
    return this.result('readSnapshot', [request, operationSignal], {
      content: '# Before\n',
      generation: vault.generation,
      snapshot: {
        createdAt: 1,
        digest: `sha256:${'6'.repeat(64)}`,
        id: request.snapshotId,
        path: request.path,
        reason: 'before-save',
        size: 10,
      },
    })
  }

  restoreSnapshot(request: RestoreSnapshotOverwriteRequest, operationSignal: AbortSignal): Promise<WriteDocumentResult> {
    return this.result('restoreSnapshot', [request, operationSignal], {
      digest: `sha256:${'7'.repeat(64)}`,
      generation: vault.generation,
      path: request.path,
      revision: `file:${'8'.repeat(64)}`,
      snapshotId,
      status: 'saved',
    })
  }

  restoreSnapshotAsNew(
    request: RestoreSnapshotRequest,
    operationSignal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    return this.result('restoreSnapshotAsNew', [request, operationSignal], {
      digest: `sha256:${'7'.repeat(64)}`,
      generation: vault.generation,
      path: request.toPath,
      revision: `file:${'8'.repeat(64)}`,
      status: 'created',
    })
  }

  trashEntry(request: TrashEntryRequest, operationSignal: AbortSignal): Promise<TrashMutationResult> {
    return this.result('trashEntry', [request, operationSignal], {
      createdAt: 2,
      generation: vault.generation,
      id: trashId,
      kind: 'document',
      originalPath: request.path,
      revision: `file:${'9'.repeat(64)}`,
      status: 'trashed',
    })
  }

  listTrash(
    request: { expectedVault: VaultReference },
    operationSignal: AbortSignal,
  ): Promise<TrashListResult> {
    return this.result('listTrash', [request, operationSignal], {
      entries: [{ createdAt: 2, id: trashId, kind: 'document', originalPath: 'Note.md' }],
      generation: vault.generation,
    })
  }

  restoreTrash(request: RestoreTrashRequest, operationSignal: AbortSignal): Promise<RestoreTrashResult> {
    return this.result('restoreTrash', [request, operationSignal], {
      createdAt: 2,
      generation: vault.generation,
      id: request.id,
      kind: 'document',
      originalPath: 'Note.md',
      path: request.toPath ?? 'Note.md',
      revision: `file:${'a'.repeat(64)}`,
      status: 'restored',
    })
  }
}

async function loaded() {
  const context = new Context()
  await context.plugin(FakeRecoveryVault)
  await context.plugin(TockTutorWorkbenchGateway)
  const runtime = context.get('noteVault')
  const gateway = context.get('tocktutorWorkbench')
  assert.ok(runtime instanceof FakeRecoveryVault)
  assert.ok(gateway instanceof TockTutorWorkbenchGateway)
  return { context, gateway, runtime }
}

test('delegates exact create, snapshot save, recovery, trash, and restore records', async () => {
  const state = await loaded()
  try {
    const create = { content: '# New\n', expectedVault: vault, path: 'New.md' }
    const save = {
      content: '# After\n',
      expectedRevision: `file:${'b'.repeat(64)}`,
      expectedVault: vault,
      path: 'Note.md',
    }
    const draft = { expectedVault: vault, path: 'Note.md' }
    const saveDraft = { ...draft, content: '# Draft\n', revision: `file:${'b'.repeat(64)}` }
    const listSnapshots = { expectedVault: vault, path: 'Note.md' }
    const captureSnapshot = { ...listSnapshots, content: '# Draft\n', reason: 'manual' }
    const clearSnapshots = listSnapshots
    const readSnapshot = { ...listSnapshots, snapshotId }
    const restoreSnapshot = { ...readSnapshot, toPath: 'Recovered.md' }
    const restoreSnapshotOverwrite = { ...readSnapshot, expectedRevision: `file:${'b'.repeat(64)}` }
    const trash = { expectedRevision: `file:${'c'.repeat(64)}`, expectedVault: vault, path: 'Note.md' }
    const listTrash = { expectedVault: vault }
    const restoreTrash = { expectedVault: vault, id: trashId, toPath: 'Restored.md' }

    assert.equal((await state.gateway.createDocument(create, signal)).status, 'created')
    const saved = await state.gateway.saveDocument(save, signal)
    assert.equal(saved.status, 'saved')
    if (saved.status === 'saved') assert.equal(saved.snapshotId, snapshotId)
    assert.equal((await state.gateway.readDraft(draft, signal)).draft?.content, '# Draft\n')
    assert.equal((await state.gateway.saveDraft(saveDraft, signal)).ok, true)
    assert.equal((await state.gateway.clearDraft(draft, signal)).ok, true)
    assert.equal((await state.gateway.captureSnapshot(captureSnapshot, signal)).snapshot?.id, snapshotId)
    assert.equal((await state.gateway.listSnapshots(listSnapshots, signal)).snapshots[0]?.id, snapshotId)
    assert.equal((await state.gateway.readSnapshot(readSnapshot, signal)).content, '# Before\n')
    assert.equal((await state.gateway.restoreSnapshot(restoreSnapshotOverwrite, signal)).status, 'saved')
    assert.equal((await state.gateway.restoreSnapshotAsNew(restoreSnapshot, signal)).status, 'created')
    assert.equal((await state.gateway.clearSnapshots(clearSnapshots, signal)).removed, 1)
    assert.equal((await state.gateway.trashEntry(trash, signal)).status, 'trashed')
    assert.equal((await state.gateway.listTrash(listTrash, signal)).entries[0]?.id, trashId)
    assert.equal((await state.gateway.restoreTrash(restoreTrash, signal)).status, 'restored')

    assert.deepEqual(state.runtime.calls, [
      { method: 'createDocument', parameters: [create, signal] },
      { method: 'saveDocument', parameters: [save, signal] },
      { method: 'readDraft', parameters: [draft, signal] },
      { method: 'saveDraft', parameters: [saveDraft, signal] },
      { method: 'clearDraft', parameters: [draft, signal] },
      { method: 'captureSnapshot', parameters: [captureSnapshot, signal] },
      { method: 'listSnapshots', parameters: [listSnapshots, signal] },
      { method: 'readSnapshot', parameters: [readSnapshot, signal] },
      { method: 'restoreSnapshot', parameters: [restoreSnapshotOverwrite, signal] },
      { method: 'restoreSnapshotAsNew', parameters: [restoreSnapshot, signal] },
      { method: 'clearSnapshots', parameters: [clearSnapshots, signal] },
      { method: 'trashEntry', parameters: [trash, signal] },
      { method: 'listTrash', parameters: [listTrash, signal] },
      { method: 'restoreTrash', parameters: [restoreTrash, signal] },
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('fails closed before runtime calls for excessive or unsafe recovery inputs', async () => {
  const state = await loaded()
  try {
    const validRevision = `file:${'d'.repeat(64)}`
    await assert.rejects(state.gateway.createDocument({
      content: 'x'.repeat(MAX_DOCUMENT_CONTENT_BYTES + 1), expectedVault: vault, path: 'Large.md',
    }, signal), /content/i)
    await assert.rejects(state.gateway.saveDocument({
      content: '# Save\n', expectedRevision: 'unsafe', expectedVault: vault, path: 'Note.md',
    }, signal), /revision/i)
    await assert.rejects(state.gateway.readDraft({ expectedVault: vault, path: '../escape.md' }, signal), /path/i)
    await assert.rejects(state.gateway.saveDraft({ content: 'x'.repeat(MAX_DOCUMENT_CONTENT_BYTES + 1), expectedVault: vault, path: 'Note.md' }, signal), /content/i)
    await assert.rejects(state.gateway.clearDraft({ expectedVault: vault, path: '/absolute.md' }, signal), /path/i)
    await assert.rejects(state.gateway.listSnapshots({ expectedVault: vault, path: '../escape.md' }, signal), /path/i)
    await assert.rejects(state.gateway.captureSnapshot({ content: 'x'.repeat(MAX_DOCUMENT_CONTENT_BYTES + 1), expectedVault: vault, path: 'Note.md' }, signal), /content/i)
    await assert.rejects(state.gateway.readSnapshot({
      expectedVault: vault, path: 'Note.md', snapshotId: 'unsafe',
    }, signal), /snapshot/i)
    await assert.rejects(state.gateway.restoreSnapshotAsNew({
      expectedVault: vault, path: 'Note.md', snapshotId, toPath: '/absolute.md',
    }, signal), /path/i)
    await assert.rejects(state.gateway.trashEntry({
      expectedRevision: validRevision, expectedVault: vault, path: '../escape',
    }, signal), /path/i)
    await assert.rejects(state.gateway.restoreTrash({ expectedVault: vault, id: 'unsafe' }, signal), /trash/i)
    await assert.rejects(state.gateway.restoreTrash({
      expectedVault: vault, id: trashId, toPath: '../escape.md',
    }, signal), /path/i)
    assert.equal(state.runtime.calls.length, 0)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('preserves recovery failures and forwards cancellation without translation', async () => {
  const state = await loaded()
  try {
    const failure = Object.assign(new Error('snapshot unavailable'), { code: 'recovery-unavailable' })
    state.runtime.failure = failure
    await assert.rejects(state.gateway.listSnapshots({ expectedVault: vault, path: 'Note.md' }, signal), error => error === failure)
    assert.strictEqual(state.runtime.calls[0]?.parameters[1], signal)
  } finally {
    await state.context.fiber.dispose()
  }
})
