import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { NoteVaultRuntime } from 'tockbot-note-runtime'
import { isSafeVaultRelativePath } from './session.ts'
import type {
  ActiveVaultResult,
  CreateDocumentRequest,
  DraftMutationResult,
  DraftRequest,
  DraftResult,
  ListSnapshotsRequest,
  ListTrashRequest,
  ListTreeRequest,
  OpenDocumentResult,
  ReadSnapshotRequest,
  RecentVaultListResult,
  RecentVaultRequest,
  RestoreSnapshotRequest,
  RestoreTrashRequest,
  RestoreTrashResult,
  SaveDocumentRequest,
  SaveDraftRequest,
  SnapshotContentResult,
  SnapshotListResult,
  TrashEntryRequest,
  TrashListResult,
  TrashMutationResult,
  VaultGenerationRequest,
  VaultReference,
  VaultSearchRequest,
  VaultSearchResult,
  VaultTreePage,
  WriteDocumentResult,
} from './types.ts'

export type * from './types.ts'

export const MAX_DOCUMENT_CONTENT_BYTES = 2_000_000
export const MAX_TREE_CURSOR_LENGTH = 512
export const MAX_TREE_PAGE_SIZE = 200

export type NoteVaultCapability = Pick<
  NoteVaultRuntime,
  | 'activateRecentVault'
  | 'clearDraft'
  | 'createDocument'
  | 'listRecentVaults'
  | 'listSnapshots'
  | 'listTrash'
  | 'listTree'
  | 'openDocument'
  | 'openSandboxVault'
  | 'readDraft'
  | 'readSnapshot'
  | 'removeRecentVault'
  | 'restoreSnapshotAsNew'
  | 'restoreTrash'
  | 'saveDocument'
  | 'saveDraft'
  | 'search'
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

function assertExpectedGeneration(value: VaultGenerationRequest): void {
  assertRecord(value, 'Vault generation request')
  if (!Number.isSafeInteger(value.expectedGeneration) || value.expectedGeneration < 0) {
    throw new TypeError('Expected vault generation must be a non-negative safe integer.')
  }
}

function assertRecentVaultRequest(value: RecentVaultRequest): void {
  assertExpectedGeneration(value)
  if (typeof value.id !== 'string' || !/^vault:[0-9a-f]{64}$/u.test(value.id)) {
    throw new TypeError('Recent vault request must identify one opaque vault.')
  }
}

function activeReference(state: NoteVaultRuntime['state']): VaultReference {
  if (!state.active) throw new TypeError('Vault activation returned no active vault.')
  const vault = { generation: state.generation, id: state.id }
  assertVaultReference(vault)
  return vault
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

function assertSearchRequest(value: VaultSearchRequest): void {
  assertRecord(value, 'Search request')
  assertVaultReference(value.expectedVault)
  if (typeof value.query !== 'string' || value.query.length > 1_000 || /[\u0000-\u001f\u007f]/u.test(value.query)) {
    throw new TypeError('Search query must be bounded text.')
  }
  if (value.mode !== undefined && value.mode !== 'literal' && value.mode !== 'query' && value.mode !== 'related') throw new TypeError('Search mode is unsupported.')
  if (value.scope !== undefined && value.scope !== 'all' && value.scope !== 'content' && value.scope !== 'path' && value.scope !== 'properties') throw new TypeError('Search scope is unsupported.')
  if (value.directory !== undefined) assertEntryPath(value.directory)
  if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 100)) throw new TypeError('Search limit must be from 1 through 100.')
  if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH)) throw new TypeError('Search cursor must be bounded.')
  for (const option of [value.caseSensitive, value.regex, value.wholeWord]) {
    if (option !== undefined && typeof option !== 'boolean') throw new TypeError('Search options must be Boolean.')
  }
}

function assertDraftRequest(value: DraftRequest): void {
  assertRecord(value, 'Draft request')
  assertVaultReference(value.expectedVault)
  assertDocumentPath(value.path)
}

function assertSaveDraftRequest(value: SaveDraftRequest): void {
  assertDraftRequest(value)
  assertContent(value.content)
  if (value.revision !== undefined) assertRevision(value.revision)
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
  async listRecentVaults(signal: AbortSignal): Promise<RecentVaultListResult> {
    signal.throwIfAborted()
    return {
      generation: this.ctx.noteVault.state.generation,
      vaults: this.ctx.noteVault.listRecentVaults(),
    }
  }

  @Remote
  async activateRecentVault(request: RecentVaultRequest, signal: AbortSignal): Promise<VaultReference> {
    assertRecentVaultRequest(request)
    signal.throwIfAborted()
    return activeReference(this.ctx.noteVault.activateRecentVault(request.id, request.expectedGeneration))
  }

  @Remote
  async removeRecentVault(request: RecentVaultRequest, signal: AbortSignal): Promise<RecentVaultListResult> {
    assertRecentVaultRequest(request)
    signal.throwIfAborted()
    return {
      generation: this.ctx.noteVault.state.generation,
      vaults: this.ctx.noteVault.removeRecentVault(request.id, request.expectedGeneration),
    }
  }

  @Remote
  async openSandboxVault(request: VaultGenerationRequest, signal: AbortSignal): Promise<VaultReference> {
    assertExpectedGeneration(request)
    signal.throwIfAborted()
    return activeReference(this.ctx.noteVault.openSandboxVault(request.expectedGeneration))
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
  async search(request: VaultSearchRequest, signal: AbortSignal): Promise<VaultSearchResult> {
    assertSearchRequest(request)
    signal.throwIfAborted()
    const { expectedVault, ...args } = request
    return this.ctx.noteVault.search(args, expectedVault, signal)
  }

  @Remote
  async readDraft(request: DraftRequest, signal: AbortSignal): Promise<DraftResult> {
    assertDraftRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.readDraft(request, signal)
  }

  @Remote
  async saveDraft(request: SaveDraftRequest, signal: AbortSignal): Promise<DraftMutationResult> {
    assertSaveDraftRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.saveDraft(request, signal)
  }

  @Remote
  async clearDraft(request: DraftRequest, signal: AbortSignal): Promise<DraftMutationResult> {
    assertDraftRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.clearDraft(request, signal)
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
