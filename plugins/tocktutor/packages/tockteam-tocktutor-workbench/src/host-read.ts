import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { NoteVaultRuntime } from 'tockbot-note-runtime'
import { isSafeVaultRelativePath } from './session.ts'
import type {
  ActiveVaultResult,
  AttachmentMetadataResult,
  AttachmentPreviewResult,
  CreateDocumentRequest,
  CreateManagedVaultRequest,
  CaptureSnapshotRequest,
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
  RestoreSnapshotOverwriteRequest,
  RestoreSnapshotRequest,
  RestoreTrashRequest,
  RestoreTrashResult,
  SaveDocumentRequest,
  SaveDraftRequest,
  SnapshotContentResult,
  SnapshotListResult,
  SnapshotMutationResult,
  StoreAttachmentRequest,
  StoreAttachmentResult,
  TrashEntryRequest,
  TrashListResult,
  TrashMutationResult,
  VaultFacetsRequest,
  VaultFacetsResult,
  VaultGenerationRequest,
  VaultGraphRequest,
  VaultGraphResult,
  VaultLinksRequest,
  VaultLinksResult,
  VaultOutlineRequest,
  VaultOutlineResult,
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
  | 'captureSnapshot'
  | 'clearDraft'
  | 'clearSnapshots'
  | 'createDocument'
  | 'createManagedVault'
  | 'facets'
  | 'graph'
  | 'inspectAttachment'
  | 'listRecentVaults'
  | 'listSnapshots'
  | 'listTrash'
  | 'links'
  | 'listTree'
  | 'openDocument'
  | 'outline'
  | 'openSandboxVault'
  | 'previewAttachment'
  | 'readDraft'
  | 'readSnapshot'
  | 'removeRecentVault'
  | 'restoreSnapshot'
  | 'restoreSnapshotAsNew'
  | 'restoreTrash'
  | 'saveDocument'
  | 'saveDraft'
  | 'search'
  | 'state'
  | 'storeAttachment'
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

function assertAttachmentPath(value: string): void {
  if (!isSafeVaultRelativePath(value) || !/\.(?:avif|bmp|gif|ico|jpe?g|png|webp|mp3|m4a|ogg|wav|webm|mp4|mov|pdf)$/iu.test(value)) {
    throw new TypeError('Attachment path must be one accepted vault-relative media path.')
  }
}

function assertStoreAttachmentRequest(value: StoreAttachmentRequest): void {
  assertRecord(value, 'Attachment request')
  assertVaultReference(value.expectedVault)
  assertAttachmentPath(value.path)
  if (typeof value.dataBase64 !== 'string' || value.dataBase64.length > 35_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.dataBase64)) throw new TypeError('Attachment data must be bounded base64.')
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

function assertCreateManagedVaultRequest(value: CreateManagedVaultRequest): void {
  assertExpectedGeneration(value)
  if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(value.name.trim())) {
    throw new TypeError('Managed vault name is invalid.')
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

function assertGraphRequest(value: VaultGraphRequest): void {
  assertRecord(value, 'Graph request')
  assertVaultReference(value.expectedVault)
  if (value.path !== undefined) assertDocumentPath(value.path)
  if (value.scope !== undefined && value.scope !== 'local' && value.scope !== 'global') throw new TypeError('Graph scope is unsupported.')
  if (value.direction !== undefined && value.direction !== 'outgoing' && value.direction !== 'backlinks' && value.direction !== 'both') throw new TypeError('Graph direction is unsupported.')
  if (value.depth !== undefined && (!Number.isSafeInteger(value.depth) || value.depth < 1 || value.depth > 3)) throw new TypeError('Graph depth must be from 1 through 3.')
  if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 180)) throw new TypeError('Graph limit must be bounded.')
  if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH)) throw new TypeError('Graph cursor must be bounded.')
  if (value.tag !== undefined && (typeof value.tag !== 'string' || value.tag.length === 0 || value.tag.length > 256)) throw new TypeError('Graph tag must be bounded.')
  for (const option of [value.includeAttachments, value.includeTags]) {
    if (option !== undefined && typeof option !== 'boolean') throw new TypeError('Graph options must be Boolean.')
  }
}

function assertFacetsRequest(value: VaultFacetsRequest): void {
  assertRecord(value, 'Facets request')
  assertVaultReference(value.expectedVault)
  if (value.directory !== undefined) assertEntryPath(value.directory)
  if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 1_000)) throw new TypeError('Facets limit must be bounded.')
  if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH)) throw new TypeError('Facets cursor must be bounded.')
}

function assertOutlineRequest(value: VaultOutlineRequest): void {
  assertRecord(value, 'Outline request')
  assertVaultReference(value.expectedVault)
  assertDocumentPath(value.path)
  if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 1_000)) throw new TypeError('Outline limit must be bounded.')
  for (const option of [value.includeFootnotes, value.includeQueries]) {
    if (option !== undefined && typeof option !== 'boolean') throw new TypeError('Outline options must be Boolean.')
  }
}

function assertLinksRequest(value: VaultLinksRequest): void {
  assertRecord(value, 'Links request')
  assertVaultReference(value.expectedVault)
  assertDocumentPath(value.path)
  if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH)) throw new TypeError('Links cursor must be bounded.')
  if (value.includeUnlinked !== undefined && typeof value.includeUnlinked !== 'boolean') throw new TypeError('Links options must be Boolean.')
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

function assertCaptureSnapshotRequest(value: CaptureSnapshotRequest): void {
  assertSnapshotListRequest(value)
  assertContent(value.content)
  if (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.trim().length === 0 || value.reason.length > 200)) throw new TypeError('Snapshot reason must be bounded.')
}

function assertReadSnapshotRequest(value: ReadSnapshotRequest): void {
  assertSnapshotListRequest(value)
  assertSnapshotId(value.snapshotId)
}

function assertRestoreSnapshotOverwriteRequest(value: RestoreSnapshotOverwriteRequest): void {
  assertReadSnapshotRequest(value)
  assertRevision(value.expectedRevision)
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
  async createManagedVault(request: CreateManagedVaultRequest, signal: AbortSignal): Promise<VaultReference> {
    assertCreateManagedVaultRequest(request)
    signal.throwIfAborted()
    return activeReference(this.ctx.noteVault.createManagedVault(request.name, request.expectedGeneration))
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
  async inspectAttachment(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentMetadataResult> {
    assertAttachmentPath(path)
    assertVaultReference(expectedVault)
    signal.throwIfAborted()
    return this.ctx.noteVault.inspectAttachment(path, expectedVault, signal)
  }

  @Remote
  async previewAttachment(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentPreviewResult> {
    assertAttachmentPath(path)
    assertVaultReference(expectedVault)
    signal.throwIfAborted()
    const preview = await this.ctx.noteVault.previewAttachment(path, expectedVault, signal)
    const { data, ...metadata } = preview
    return { ...metadata, dataBase64: Buffer.from(data).toString('base64') }
  }

  @Remote
  async storeAttachment(request: StoreAttachmentRequest, signal: AbortSignal): Promise<StoreAttachmentResult> {
    assertStoreAttachmentRequest(request)
    signal.throwIfAborted()
    const data = Buffer.from(request.dataBase64, 'base64')
    if (data.byteLength > 25 * 1024 * 1024) throw new TypeError('Attachment data must not exceed 25 MiB.')
    return this.ctx.noteVault.storeAttachment({ data, expectedVault: request.expectedVault, path: request.path }, signal)
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
  async graph(request: VaultGraphRequest, signal: AbortSignal): Promise<VaultGraphResult> {
    assertGraphRequest(request)
    signal.throwIfAborted()
    const { expectedVault, ...args } = request
    return this.ctx.noteVault.graph(args, expectedVault, signal)
  }

  @Remote
  async facets(request: VaultFacetsRequest, signal: AbortSignal): Promise<VaultFacetsResult> {
    assertFacetsRequest(request)
    signal.throwIfAborted()
    const { expectedVault, ...args } = request
    return this.ctx.noteVault.facets(args, expectedVault, signal)
  }

  @Remote
  async outline(request: VaultOutlineRequest, signal: AbortSignal): Promise<VaultOutlineResult> {
    assertOutlineRequest(request)
    signal.throwIfAborted()
    const { expectedVault, ...args } = request
    return this.ctx.noteVault.outline(args, expectedVault, signal)
  }

  @Remote
  async links(request: VaultLinksRequest, signal: AbortSignal): Promise<VaultLinksResult> {
    assertLinksRequest(request)
    signal.throwIfAborted()
    const { expectedVault, ...args } = request
    return this.ctx.noteVault.links(args, expectedVault, signal)
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
  async captureSnapshot(request: CaptureSnapshotRequest, signal: AbortSignal): Promise<SnapshotMutationResult> {
    assertCaptureSnapshotRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.captureSnapshot(request, signal)
  }

  @Remote
  async clearSnapshots(request: ListSnapshotsRequest, signal: AbortSignal): Promise<SnapshotMutationResult> {
    assertSnapshotListRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.clearSnapshots(request, signal)
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
  async restoreSnapshot(
    request: RestoreSnapshotOverwriteRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    assertRestoreSnapshotOverwriteRequest(request)
    signal.throwIfAborted()
    return this.ctx.noteVault.restoreSnapshot(request, signal)
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
