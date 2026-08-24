import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { NoteVaultRuntime } from 'tockbot-note-runtime'
import { isSafeVaultRelativePath } from './session.ts'
import type {
  ActiveVaultResult,
  CreateDocumentRequest,
  ListSnapshotsRequest,
  ListTrashRequest,
  ListTreeRequest,
  OpenDocumentResult,
  ReadSnapshotRequest,
  RestoreSnapshotRequest,
  RestoreTrashRequest,
  RestoreTrashResult,
  SaveDocumentRequest,
  SnapshotContentResult,
  SnapshotListResult,
  TrashEntryRequest,
  TrashListResult,
  TrashMutationResult,
  VaultReference,
  VaultTreePage,
  WriteDocumentResult,
} from './types.ts'

export type * from './types.ts'

export const MAX_DOCUMENT_CONTENT_BYTES = 2_000_000
export const MAX_TREE_CURSOR_LENGTH = 512
export const MAX_TREE_PAGE_SIZE = 200

export type NoteVaultCapability = Pick<
  NoteVaultRuntime,
  | 'createDocument'
  | 'listSnapshots'
  | 'listTrash'
  | 'listTree'
  | 'openDocument'
  | 'readSnapshot'
  | 'restoreSnapshotAsNew'
  | 'restoreTrash'
  | 'saveDocument'
  | 'state'
  | 'trashEntry'
>

declare module '@deepseek-ai/cordis' {
  interface Context {
    tocktutorWorkbench: TockTutorWorkbenchGateway
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a bounded record.`)
  }
}

function assertVaultReference(value: VaultReference): void {
  if (
    value === null
    || typeof value !== 'object'
    || !Number.isSafeInteger(value.generation)
    || value.generation < 0
    || typeof value.id !== 'string'
    || !/^vault:[0-9a-f]{64}$/u.test(value.id)
  ) {
    throw new TypeError('Vault reference must identify one bounded active vault generation.')
  }
}

function assertEntryPath(value: string): void {
  if (!isSafeVaultRelativePath(value)) {
    throw new TypeError('Entry path must be a canonical vault-relative path.')
  }
}

function assertDocumentPath(value: string): void {
  if (!isSafeVaultRelativePath(value) || !/\.(?:base|canvas|markdown|md)$/iu.test(value)) {
    throw new TypeError('Document path must be a canonical supported vault-relative path.')
  }
}

function assertRevision(value: string): void {
  if (typeof value !== 'string' || !/^file:[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError('Expected revision must be one bounded file revision.')
  }
}

function assertContent(value: string): void {
  if (
    typeof value !== 'string'
    || new TextEncoder().encode(value).byteLength > MAX_DOCUMENT_CONTENT_BYTES
  ) {
    throw new TypeError(`Document content must not exceed ${String(MAX_DOCUMENT_CONTENT_BYTES)} bytes.`)
  }
}

function assertSnapshotId(value: string): void {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}$/iu.test(value)
  ) {
    throw new TypeError('Snapshot id must be one bounded recovery identifier.')
  }
}

function assertTrashId(value: string): void {
  if (
    typeof value !== 'string'
    || !/^trash-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new TypeError('Trash id must be one bounded recovery identifier.')
  }
}

function assertTreeRequest(value: ListTreeRequest): void {
  assertRecord(value, 'Tree request')
  assertVaultReference(value.expectedVault)
  if (
    value.cursor !== undefined
    && value.cursor !== null
    && (typeof value.cursor !== 'string'
      || value.cursor.length === 0
      || value.cursor.length > MAX_TREE_CURSOR_LENGTH)
  ) {
    throw new TypeError('Tree cursor must be null or a bounded non-empty string.')
  }
  if (
    value.limit !== undefined
    && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > MAX_TREE_PAGE_SIZE)
  ) {
    throw new TypeError(`Tree limit must be an integer from 1 through ${String(MAX_TREE_PAGE_SIZE)}.`)
  }
}

function assertCreateRequest(value: CreateDocumentRequest): void {
  assertRecord(value, 'Create request')
  assertVaultReference(value.expectedVault)
  assertDocumentPath(value.path)
  assertContent(value.content)
}

function assertSaveRequest(value: SaveDocumentRequest): void {
  assertCreateRequest(value)
  assertRevision(value.expectedRevision)
}

function assertSnapshotListRequest(value: ListSnapshotsRequest): void {
  assertRecord(value, 'Snapshot request')
  assertVaultReference(value.expectedVault)
  assertDocumentPath(value.path)
}

function assertReadSnapshotRequest(value: ReadSnapshotRequest): void {
  assertSnapshotListRequest(value)
  assertSnapshotId(value.snapshotId)
}

function assertRestoreSnapshotRequest(value: RestoreSnapshotRequest): void {
  assertReadSnapshotRequest(value)
  assertDocumentPath(value.toPath)
}

function assertTrashEntryRequest(value: TrashEntryRequest): void {
  assertRecord(value, 'Trash request')
  assertVaultReference(value.expectedVault)
  assertEntryPath(value.path)
  assertRevision(value.expectedRevision)
}

function assertListTrashRequest(value: ListTrashRequest): void {
  assertRecord(value, 'Trash list request')
  assertVaultReference(value.expectedVault)
}

function assertRestoreTrashRequest(value: RestoreTrashRequest): void {
  assertRecord(value, 'Trash restore request')
  assertVaultReference(value.expectedVault)
  assertTrashId(value.id)
  if (value.toPath !== undefined) assertEntryPath(value.toPath)
}

/** Host-only projection of accepted note-vault workbench capabilities. */
export class TockTutorWorkbenchGateway extends TypertRemoteService {
  static inject = ['noteVault']

  constructor(ctx: Context) {
    super(ctx, 'tocktutorWorkbench')
  }

  @Remote
  async currentVault(signal: AbortSignal): Promise<ActiveVaultResult> {
    signal.throwIfAborted()
    const state = this.ctx.noteVault.state
    if (!state.active) return null
    const vault = { generation: state.generation, id: state.id }
    assertVaultReference(vault)
    return vault
  }

  @Remote
  async openDocument(
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<OpenDocumentResult> {
    assertDocumentPath(path)
    assertVaultReference(expectedVault)
    signal.throwIfAborted()
    return this.ctx.noteVault.openDocument(path, expectedVault, signal)
  }

  @Remote
  async listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage> {
    assertTreeRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.listTree(request, signal)
  }

  @Remote
  async createDocument(
    request: CreateDocumentRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    assertCreateRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.createDocument(request, signal)
  }

  @Remote
  async saveDocument(
    request: SaveDocumentRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    assertSaveRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.saveDocument(request, signal)
  }

  @Remote
  async listSnapshots(
    request: ListSnapshotsRequest,
    signal: AbortSignal,
  ): Promise<SnapshotListResult> {
    assertSnapshotListRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.listSnapshots(request, signal)
  }

  @Remote
  async readSnapshot(
    request: ReadSnapshotRequest,
    signal: AbortSignal,
  ): Promise<SnapshotContentResult> {
    assertReadSnapshotRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.readSnapshot(request, signal)
  }

  @Remote
  async restoreSnapshotAsNew(
    request: RestoreSnapshotRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    assertRestoreSnapshotRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.restoreSnapshotAsNew(request, signal)
  }

  @Remote
  async trashEntry(
    request: TrashEntryRequest,
    signal: AbortSignal,
  ): Promise<TrashMutationResult> {
    assertTrashEntryRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.trashEntry(request, signal)
  }

  @Remote
  async listTrash(request: ListTrashRequest, signal: AbortSignal): Promise<TrashListResult> {
    assertListTrashRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.listTrash(request, signal)
  }

  @Remote
  async restoreTrash(
    request: RestoreTrashRequest,
    signal: AbortSignal,
  ): Promise<RestoreTrashResult> {
    assertRestoreTrashRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.restoreTrash(request, signal)
  }
}
