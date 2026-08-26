import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  watch,
  writeSync,
  type FSWatcher,
} from 'node:fs'
import { copyFile, link, lstat, mkdir, open, opendir, readlink, realpath, rename, rm, symlink, unlink, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import {
  createVaultInspection,
  type VaultCanvasArgs,
  type VaultCanvasResult,
  type VaultFacetsArgs,
  type VaultFacetsResult,
  type VaultGraphArgs,
  type VaultGraphResult,
  type VaultInspection,
  type VaultInspectionInput,
  type VaultInspectionInventoryEntry,
  type VaultInspectionLimits,
  type VaultTruncationReason,
  type VaultLinksArgs,
  type VaultLinksResult,
  type VaultListArgs,
  type VaultListResult,
  type VaultOutlineArgs,
  type VaultOutlineResult,
  type VaultPathRewriteArgs,
  type VaultPathRewriteResult,
  type VaultPathRewriteUpdate,
  type VaultReadArgs,
  type VaultSearchArgs,
  type VaultSearchResult,
} from 'tockbot-note-vault/inspection'

declare module '@deepseek-ai/cordis' {
  interface Context {
    noteVault: NoteVaultRuntime
    tockTeamDesktopReveal: TockTeamDesktopReveal
    tockTeamDesktopVaultSelection: TockTeamDesktopVaultSelection
  }

  interface Events {
    'note-vault/change': (event: NoteVaultChangeEvent) => void
  }
}

const DEFAULT_MAX_READ_BYTES = 256 * 1024
const MAX_READ_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_INSPECTION_BYTES = 64 * 1024 * 1024
const DEFAULT_MAX_INSPECTION_RESULTS = 50
const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const DEFAULT_MAX_DRAFT_BYTES = 2 * 1024 * 1024
const MAX_DRAFT_BYTES = 32 * 1024 * 1024
const MAX_ATTACHMENT_BYTES = 256 * 1024 * 1024
const DEFAULT_MAX_FOLDER_BYTES = 64 * 1024 * 1024
const MAX_FOLDER_BYTES = 1024 * 1024 * 1024
const DEFAULT_MAX_TREE_DEPTH = 64
const MAX_TREE_DEPTH = 128
const DEFAULT_MAX_TREE_ENTRIES = 20_000
const MAX_TREE_ENTRIES = 100_000
const DEFAULT_MAX_TREE_RESULTS = 200
const MAX_TREE_RESULTS = 1_000
const MAX_TREE_WARNINGS = 20
const MAX_PASSIVE_BACKUP_ENTRY_BYTES = 50 * 1024 * 1024
const MAX_PASSIVE_BACKUP_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_REVEAL_PATH_BYTES = 4 * 1024
const SNAPSHOT_METADATA_MAX_BYTES = 64 * 1024
const SNAPSHOT_SCAN_LIMIT = 1_000
const NOFOLLOW = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
const POST_COMMIT_SIGNAL = new AbortController().signal

export interface Config {
  maxAttachmentBytes: number
  maxDraftBytes: number
  maxFolderBytes: number
  recentVaultLimit: number
  restoreActiveVault: boolean
  maxReadBytes: number
  maxTreeDepth: number
  maxTreeEntries: number
  maxTreeResults: number
  snapshotLimit: number
  snapshotRetentionDays: number
  stateRoot: string | null
  vaultRoot: string | null
}

export const Config: Schema<Config> = Schema.object({
  maxAttachmentBytes: Schema.natural().min(1).max(MAX_ATTACHMENT_BYTES).default(DEFAULT_MAX_ATTACHMENT_BYTES),
  maxDraftBytes: Schema.natural().min(1).max(MAX_DRAFT_BYTES).default(DEFAULT_MAX_DRAFT_BYTES),
  maxFolderBytes: Schema.natural().min(1).max(MAX_FOLDER_BYTES).default(DEFAULT_MAX_FOLDER_BYTES),
  maxReadBytes: Schema.natural().min(1).max(MAX_READ_BYTES).default(DEFAULT_MAX_READ_BYTES),
  maxTreeDepth: Schema.natural().min(1).max(MAX_TREE_DEPTH).default(DEFAULT_MAX_TREE_DEPTH),
  maxTreeEntries: Schema.natural().min(1).max(MAX_TREE_ENTRIES).default(DEFAULT_MAX_TREE_ENTRIES),
  maxTreeResults: Schema.natural().min(1).max(MAX_TREE_RESULTS).default(DEFAULT_MAX_TREE_RESULTS),
  recentVaultLimit: Schema.natural().min(1).max(100).default(20),
  restoreActiveVault: Schema.boolean().default(false),
  snapshotLimit: Schema.natural().min(1).max(100).default(20),
  snapshotRetentionDays: Schema.natural().min(1).max(3650).default(30),
  stateRoot: Schema.union([
    Schema.string().pattern(/\S/),
    Schema.const(null),
  ]).default(null),
  vaultRoot: Schema.union([
    Schema.string().pattern(/\S/),
    Schema.const(null),
  ]).default(null),
})

export type NoteVaultState = Readonly<
  | { active: false; generation: number }
  | { active: true; generation: number; id: string }
>

export interface VaultReference {
  generation: number
  id: string
}

export interface TockTeamDesktopRevealIdentity {
  dev: string
  ino: string
}

export interface TockTeamDesktopRevealInput {
  canonicalPath: string
  identity: TockTeamDesktopRevealIdentity
  kind: 'directory' | 'file'
  operationId: string
  vaultGeneration: number
  vaultId: string
}

export type TockTeamDesktopRevealStatus =
  | 'cancelled'
  | 'denied'
  | 'revealed'
  | 'stale'
  | 'unavailable'

export interface TockTeamDesktopRevealResult {
  operationId: string
  status: TockTeamDesktopRevealStatus
}

export abstract class TockTeamDesktopReveal extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tockTeamDesktopReveal')
  }

  abstract reveal(
    input: TockTeamDesktopRevealInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopRevealResult>
}

export const TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE = 'tockTeamDesktopVaultSelection' as const

export type TockTeamDesktopVaultSelectionClaim = string & {
  readonly __tockTeamDesktopVaultSelectionClaim: unique symbol
}

export interface TockTeamDesktopVaultSelectionIdentity {
  operationId: string
  requestId: string
  sessionId: string
  vaultGeneration: number
  vaultId: string | null
  windowId: string
}

export interface TockTeamDesktopVaultSelectionFileIdentity {
  dev: string
  ino: string
}

export type TockTeamDesktopVaultSelectionFailureStatus =
  | 'cancelled'
  | 'denied'
  | 'stale'
  | 'unavailable'

export interface TockTeamDesktopVaultSelectionConsumeInput {
  authorization: string
  identity: TockTeamDesktopVaultSelectionIdentity
}

export type TockTeamDesktopVaultSelectionConsumeResult =
  | {
      operationId: string
      status: TockTeamDesktopVaultSelectionFailureStatus
    }
  | {
      canonicalPath: string
      claim: TockTeamDesktopVaultSelectionClaim
      identity: TockTeamDesktopVaultSelectionFileIdentity
      operationId: string
      status: 'consumed'
    }

export interface TockTeamDesktopVaultSelectionBindInput {
  claim: TockTeamDesktopVaultSelectionClaim
  operationId: string
  vaultGeneration: number
  vaultId: string
}

export type TockTeamDesktopVaultSelectionBindResult =
  | {
      operationId: string
      status: TockTeamDesktopVaultSelectionFailureStatus
    }
  | {
      operationId: string
      status: 'bound'
    }

export interface TockTeamDesktopVaultSelectionAdoptInput {
  canonicalPath: string
  operationId: string
  vaultGeneration: number
  vaultId: string
}

export type TockTeamDesktopVaultSelectionAdoptResult =
  | {
      operationId: string
      status: TockTeamDesktopVaultSelectionFailureStatus
    }
  | {
      operationId: string
      status: 'bound'
    }

export interface TockTeamDesktopVaultSelectionReleaseInput {
  claim: TockTeamDesktopVaultSelectionClaim
  operationId: string
}

export abstract class TockTeamDesktopVaultSelection extends Service {
  constructor(ctx: Context) {
    super(ctx, TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE)
  }

  async adopt(
    input: TockTeamDesktopVaultSelectionAdoptInput,
    _signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionAdoptResult> {
    return { operationId: typeof input?.operationId === 'string' ? input.operationId : '', status: 'unavailable' }
  }

  abstract bind(
    input: TockTeamDesktopVaultSelectionBindInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionBindResult>

  abstract consume(
    input: TockTeamDesktopVaultSelectionConsumeInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionConsumeResult>

  abstract release(input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void>
}

export interface ActivateDesktopSelectionRequest {
  authorization: string
  identity: TockTeamDesktopVaultSelectionIdentity
}

export interface ActivateDesktopSelectionResult {
  operationId: string
  status: 'activated'
  vaultGeneration: number
  vaultId: string
}

export interface RevealEntryRequest {
  expectedVault: VaultReference
  path: string
}

export interface RevealEntryResult {
  generation: number
  path: string
  status: 'revealed'
}

export interface OpenDocumentResult {
  content: string
  digest: string
  generation: number
  path: string
  revision: string
}

export interface CreateDocumentRequest {
  content: string
  expectedVault: VaultReference
  path: string
}

export interface SaveDocumentRequest extends CreateDocumentRequest {
  expectedRevision: string
}

export type WriteDocumentResult = Readonly<
  | {
      digest: string
      generation: number
      path: string
      revision: string
      status: 'created'
    }
  | {
      digest: string
      generation: number
      path: string
      revision: string
      snapshotId: string
      status: 'saved'
    }
>

export interface ListTreeRequest {
  cursor?: string | null
  expectedVault: VaultReference
  limit?: number
}

export type VaultTreeEntry = Readonly<
  | { kind: 'directory'; modifiedAt: number; path: string; revision: string }
  | {
      createdAt: number
      kind: 'attachment'
      mediaKind: 'audio' | 'image' | 'pdf' | 'video'
      modifiedAt: number
      path: string
      revision: string
      size: number
    }
  | {
      createdAt: number
      kind: 'document'
      modifiedAt: number
      path: string
      revision: string
      size: number
    }
>

export type TreeTruncationReason = 'depth-limit' | 'entry-limit' | 'result-limit' | null

export interface VaultTreePage {
  complete: boolean
  cursor: string | null
  entries: VaultTreeEntry[]
  generation: number
  scan: { entries: number }
  truncated: boolean
  truncationReason: TreeTruncationReason
  warnings: string[]
}

export interface ListPassiveBackupEntriesRequest {
  expectedVault: VaultReference
}

export interface PassiveBackupEntry {
  path: string
  revision: string
  size: number
}

export interface PassiveBackupListResult {
  entries: PassiveBackupEntry[]
  generation: number
}

export interface ReadPassiveBackupEntryRequest {
  expectedRevision: string
  expectedVault: VaultReference
  path: string
}

export interface PassiveBackupContentResult extends PassiveBackupEntry {
  data: Uint8Array
  digest: string
  generation: number
}

export interface RestorePassiveBackupEntryRequest {
  data: Uint8Array
  expectedVault: VaultReference
  path: string
}

export interface PassiveBackupMutationResult extends PassiveBackupEntry {
  digest: string
  generation: number
  status: 'restored'
}

export type NoteVaultChangeEvent = Readonly<
  | { action: 'activated'; kind: 'vault'; vault: VaultReference }
  | { action: 'changed' | 'watcher-error'; kind: 'tree'; vault: VaultReference }
  | {
      action: 'created' | 'external-change' | 'external-rename' | 'stored' | 'updated'
      kind: 'entry'
      path: string
      vault: VaultReference
    }
  | {
      action: 'duplicated' | 'moved' | 'restored' | 'trashed'
      fromPath: string
      kind: 'entry'
      path: string
      vault: VaultReference
    }
>

export interface FileMutationRequest {
  expectedRevision: string
  expectedVault: VaultReference
  fromPath: string
  toPath: string
}

export interface FileMutationResult {
  fromPath: string
  generation: number
  path: string
  revision: string
  status: 'duplicated' | 'moved'
}

export type FolderMutationRequest = FileMutationRequest
export type FolderMutationResult = FileMutationResult

export interface LinkRewriteSnapshot {
  path: string
  snapshotId: string
}

export interface LinkRewriteMutationResult {
  rewriteError?: string
  rewriteSnapshots: LinkRewriteSnapshot[]
  rewrittenPaths: string[]
}

export type FileMoveWithLinkRewriteResult = FileMutationResult & LinkRewriteMutationResult
export type FolderMoveWithLinkRewriteResult = FolderMutationResult & LinkRewriteMutationResult

type BoundPathRewriteUpdate = {
  canonicalPath: string
  digest: string
  newContent: string
  originalContent: string
  postMovePath: string
  preMovePath: string
}

type SelectedPathRewrite = {
  logicalPaths: string[]
  newContent: string
  originalContent: string
  originalDigest: string
  snapshotPath: string
  writerPath: string
}

export interface AttachmentMetadataResult {
  generation: number
  mediaKind: 'audio' | 'image' | 'pdf' | 'video'
  mimeType: string
  path: string
  revision: string
  size: number
}

export interface AttachmentPreviewResult extends AttachmentMetadataResult {
  data: Uint8Array
  digest: string
}

export interface StoreAttachmentRequest {
  data: Uint8Array
  expectedVault: VaultReference
  path: string
}

export interface StoreAttachmentResult extends AttachmentMetadataResult {
  digest: string
  status: 'stored'
}

export interface SnapshotInfo {
  createdAt: number
  digest: string
  id: string
  path: string
  reason: string
  size: number
}

export interface ListSnapshotsRequest {
  expectedVault: VaultReference
  path: string
}

export interface SnapshotListResult {
  generation: number
  snapshots: SnapshotInfo[]
}

export interface ReadSnapshotRequest extends ListSnapshotsRequest {
  snapshotId: string
}

export interface CaptureSnapshotRequest extends ListSnapshotsRequest {
  content: string
  reason?: string
}

export interface RestoreSnapshotOverwriteRequest extends ReadSnapshotRequest {
  expectedRevision: string
}

export interface SnapshotContentResult {
  content: string
  generation: number
  snapshot: SnapshotInfo
}

export interface SnapshotMutationResult {
  generation: number
  removed?: number
  snapshot?: SnapshotInfo
}

export interface RestoreSnapshotRequest extends ReadSnapshotRequest {
  toPath: string
}

export interface TrashEntryRequest {
  expectedRevision: string
  expectedVault: VaultReference
  path: string
}

export interface TrashEntryInfo {
  createdAt: number
  id: string
  kind: 'attachment' | 'document' | 'folder'
  originalPath: string
}

export interface TrashMutationResult extends TrashEntryInfo {
  generation: number
  revision: string
  status: 'trashed'
}

export interface TrashListResult {
  entries: TrashEntryInfo[]
  generation: number
}

export interface RestoreTrashRequest {
  expectedVault: VaultReference
  id: string
  toPath?: string
}

export interface RestoreTrashResult extends TrashEntryInfo {
  generation: number
  path: string
  revision: string
  status: 'restored'
}

export interface RecentVaultInfo {
  id: string
  lastOpenedAt: number
}

export interface DraftRequest {
  expectedVault: VaultReference
  path: string
}

export interface SaveDraftRequest extends DraftRequest {
  content: string
  revision?: string
}

export interface DraftRecord {
  content: string
  path: string
  revision?: string
  updatedAt: number
}

export interface DraftResult {
  draft: DraftRecord | null
  generation: number
}

export interface DraftMutationResult {
  generation: number
  ok: true
  updatedAt?: number
}

export type VaultInspectionRuntimeResult<Result> = Result & { generation: number }

export type {
  VaultCanvasArgs,
  VaultCanvasResult,
  VaultFacetsArgs,
  VaultFacetsResult,
  VaultGraphArgs,
  VaultGraphResult,
  VaultLinksArgs,
  VaultLinksResult,
  VaultListArgs,
  VaultListResult,
  VaultOutlineArgs,
  VaultOutlineResult,
  VaultPathRewriteArgs,
  VaultPathRewriteResult,
  VaultPathRewriteUpdate,
  VaultReadArgs,
  VaultSearchArgs,
  VaultSearchResult,
} from 'tockbot-note-vault/inspection'

export type NoteVaultErrorCode =
  | 'cancelled'
  | 'changed'
  | 'conflict'
  | 'denied'
  | 'exists'
  | 'inactive'
  | 'invalid-content'
  | 'invalid-path'
  | 'invalid-vault'
  | 'not-found'
  | 'partial'
  | 'recovery-unavailable'
  | 'stale-vault'
  | 'too-large'
  | 'unavailable'
  | 'unsafe-target'
  | 'unsupported-type'

export class NoteVaultError extends Error {
  readonly code: NoteVaultErrorCode

  constructor(code: NoteVaultErrorCode, message: string) {
    super(message)
    this.name = 'NoteVaultError'
    this.code = code
  }
}

type FileIdentity = {
  ctimeNs: bigint
  dev: bigint
  ino: bigint
  mtimeNs: bigint
  size: bigint
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function assertInside(root: string, target: string): void {
  if (!isInside(root, target)) {
    throw new NoteVaultError('unsafe-target', 'Vault document paths must stay inside the active vault')
  }
}

function documentKind(filePath: string): 'base' | 'canvas' | 'markdown' | null {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.md' || extension === '.markdown') return 'markdown'
  if (extension === '.canvas') return 'canvas'
  if (extension === '.base') return 'base'
  return null
}

const ATTACHMENT_KINDS = new Map<string, 'audio' | 'image' | 'pdf' | 'video'>(
  Object.entries({
    audio: ['.3gp', '.flac', '.m4a', '.mp3', '.ogg', '.wav', '.weba'],
    image: ['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'],
    pdf: ['.pdf'],
    video: ['.mkv', '.mov', '.mp4', '.ogv', '.webm'],
  }).flatMap(([kind, extensions]) => extensions.map(extension => (
    [extension, kind as 'audio' | 'image' | 'pdf' | 'video']
  ))),
)

function attachmentKind(filePath: string) {
  return ATTACHMENT_KINDS.get(path.extname(filePath).toLowerCase()) ?? null
}

const ATTACHMENT_MIME_TYPES = new Map(Object.entries({
  '.3gp': 'audio/3gpp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}))

const PASSIVE_BACKUP_BASENAMES = new Set([
  'license',
  'license_foxit',
  'license_liberation',
  'license_openjpeg',
  'license_pdfjs_openjpeg',
  'license_pdfjs_qcms',
  'license_qcms',
])
const PASSIVE_BACKUP_EXTENSIONS = new Set([
  '.ani', '.avif', '.bcmap', '.bmp', '.css', '.csv', '.cur', '.eot', '.gif', '.icc',
  '.ico', '.ini', '.jpeg', '.jpg', '.json', '.lock', '.map', '.md', '.mm', '.otf',
  '.pfb', '.png', '.properties', '.toml', '.ttf', '.txt', '.webp', '.woff', '.woff2',
  '.xml', '.yaml', '.yml',
])

function passiveBackupRoot(name: string): boolean {
  return name === '.obsidian'
    || (name === name.trim()
      && name === name.normalize('NFC')
      && !/[\\/:*?"<>|\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(name)
      && /^\.obsidian-[^./\\\s][^/\\]*$/u.test(name))
}

export function isPassiveBackupPath(relativePath: string): boolean {
  if (Buffer.byteLength(relativePath, 'utf8') > MAX_REVEAL_PATH_BYTES
    || relativePath !== relativePath.normalize('NFC')) return false
  const parts = relativePath.split('/')
  if (parts.length < 2
    || !passiveBackupRoot(parts[0] ?? '')
    || parts.slice(1).some(part => part.length === 0
      || part.startsWith('.')
      || part !== part.trim()
      || /[\\:*?"<>|\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(part))) return false
  const basename = parts.at(-1)!.toLocaleLowerCase('en-US')
  return PASSIVE_BACKUP_BASENAMES.has(basename)
    || PASSIVE_BACKUP_EXTENSIONS.has(path.posix.extname(basename))
    || basename.endsWith('.d.ts')
}

function normalizePassiveBackupPath(requestedPath: string): string {
  const relativePath = normalizeEntryPath(requestedPath)
  if (relativePath !== requestedPath || relativePath !== relativePath.normalize('NFC')) {
    throw new NoteVaultError('invalid-path', 'Passive backup paths must use exact normalized vault-relative names')
  }
  if (!isPassiveBackupPath(relativePath)) {
    throw new NoteVaultError('unsupported-type', 'Passive backup supports only inert Obsidian configuration files')
  }
  return relativePath
}

function passiveBackupAliasKey(relativePath: string): string {
  return relativePath.normalize('NFKC').toLocaleLowerCase('en-US')
}

function preMoveReferrerPath(
  postMovePath: string,
  oldPath: string,
  newPath: string,
  isDirectory: boolean,
): string {
  if (isDirectory) {
    if (postMovePath === newPath) return oldPath
    if (postMovePath.startsWith(`${newPath}/`)) {
      return `${oldPath}${postMovePath.slice(newPath.length)}`
    }
    return postMovePath
  }
  if (postMovePath === newPath) return oldPath
  const oldSidecar = `${oldPath.replace(/\.md$/iu, '')}-md-images`
  const newSidecar = `${newPath.replace(/\.md$/iu, '')}-md-images`
  if (postMovePath.startsWith(`${newSidecar}/`)) {
    return `${oldSidecar}${postMovePath.slice(newSidecar.length)}`
  }
  return postMovePath
}

function normalizeEntryPath(requestedPath: string): string {
  if (
    typeof requestedPath !== 'string'
    || requestedPath.trim() === ''
    || requestedPath.includes('\0')
    || path.posix.isAbsolute(requestedPath)
    || path.win32.isAbsolute(requestedPath)
    || /^[A-Za-z]:/u.test(requestedPath)
  ) {
    throw new NoteVaultError('invalid-path', 'path must be a safe vault-relative path')
  }
  const parts = requestedPath.split(/[\\/]+/u).filter(Boolean)
  if (parts.length === 0 || parts.some(part => (
    part === '.'
    || part === '..'
    || !part.trim()
    || /[:*?"<>|\u0000-\u001f]/u.test(part)
  ))) {
    throw new NoteVaultError('invalid-path', 'path must be a safe vault-relative path')
  }
  return parts.join('/')
}

function normalizeDocumentPath(requestedPath: string): string {
  if (
    typeof requestedPath !== 'string'
    || requestedPath.trim() === ''
    || requestedPath.includes('\0')
    || path.posix.isAbsolute(requestedPath)
    || path.win32.isAbsolute(requestedPath)
    || /^[A-Za-z]:/u.test(requestedPath)
  ) {
    throw new NoteVaultError('invalid-path', 'path must be a safe vault-relative document path')
  }

  const parts = requestedPath.split(/[\\/]+/u).filter(Boolean)
  if (parts.length === 0 || parts.some(part => (
    part === '.'
    || part === '..'
    || !part.trim()
    || /[:*?"<>|\u0000-\u001f]/u.test(part)
  ))) {
    throw new NoteVaultError('invalid-path', 'path must be a safe vault-relative document path')
  }
  const normalized = parts.join('/')
  if (documentKind(normalized) === null) {
    throw new NoteVaultError('unsupported-type', 'Vault reads support Markdown, Canvas, or Base files only')
  }
  return normalized
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function sameStableFile(left: FileIdentity, right: FileIdentity): boolean {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function fileRevision(identity: FileIdentity): string {
  const value = [
    identity.dev,
    identity.ino,
    identity.size,
    identity.mtimeNs,
    identity.ctimeNs,
  ].join(':')
  return `file:${createHash('sha256').update(value).digest('hex')}`
}

function entryRevision(
  alias: boolean,
  aliasEntry: FileIdentity,
  targetEntry: FileIdentity,
): string {
  if (!alias) return fileRevision(targetEntry)
  return `entry:${createHash('sha256')
    .update(`${fileRevision(aliasEntry)}:${fileRevision(targetEntry)}`)
    .digest('hex')}`
}

async function assertNoDirectorySymlinks(root: string, candidate: string): Promise<void> {
  const relativeParent = path.relative(root, path.dirname(candidate))
  let cursor = root
  for (const part of relativeParent.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part)
    const entry = await lstat(cursor, { bigint: true })
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new NoteVaultError('unsafe-target', 'Vault document folders cannot be symbolic links')
    }
    assertInside(root, await realpath(cursor))
  }
}

type DestinationParentBinding = {
  identity: FileIdentity
  path: string
  realPath: string
}

async function bindDestinationParent(
  root: string,
  candidate: string,
): Promise<DestinationParentBinding> {
  await assertNoDirectorySymlinks(root, candidate)
  const parentPath = path.dirname(candidate)
  const identity = await lstat(parentPath, { bigint: true })
  if (!identity.isDirectory() || identity.isSymbolicLink()) {
    throw new NoteVaultError('unsafe-target', 'Vault destination folders must be regular directories')
  }
  const realPath = await realpath(parentPath)
  assertInside(root, realPath)
  return { identity, path: parentPath, realPath }
}

async function assertDestinationParentBound(
  root: string,
  binding: DestinationParentBinding,
): Promise<void> {
  const current = await lstat(binding.path, { bigint: true })
  if (
    !current.isDirectory()
    || current.isSymbolicLink()
    || !sameFileIdentity(binding.identity, current)
    || await realpath(binding.path) !== binding.realPath
  ) {
    throw new NoteVaultError('unsafe-target', 'Vault destination folder changed during the operation')
  }
  assertInside(root, binding.realPath)
}

async function assertClaimedEntryConfined(
  root: string,
  candidate: string,
  claimed: FileIdentity,
): Promise<void> {
  await assertNoDirectorySymlinks(root, candidate)
  const current = await lstat(candidate, { bigint: true })
  if (!sameStableFile(claimed, current)) {
    throw new NoteVaultError('changed', 'Vault destination changed after its exclusive claim')
  }
  assertInside(root, await realpath(candidate))
}

type DesktopVaultSelectionTarget = {
  canonicalPath: string
  identity: { dev: bigint; ino: bigint }
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key))
}

function boundedDesktopText(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxBytes
    && !value.includes('\0')
    && Buffer.byteLength(value, 'utf8') <= maxBytes
}

async function resolveDesktopVaultSelectionTarget(
  canonicalPath: string,
  expected: TockTeamDesktopVaultSelectionFileIdentity,
): Promise<DesktopVaultSelectionTarget> {
  try {
    if (
      !boundedDesktopText(canonicalPath, MAX_REVEAL_PATH_BYTES)
      || !path.isAbsolute(canonicalPath)
      || !hasExactKeys(expected, ['dev', 'ino'])
    ) throw new Error()
    const resolved = await realpath(canonicalPath)
    const entry = await lstat(canonicalPath, { bigint: true })
    if (
      resolved !== canonicalPath
      || !entry.isDirectory()
      || entry.isSymbolicLink()
      || entry.dev.toString(10) !== expected?.dev
      || entry.ino.toString(10) !== expected?.ino
    ) throw new Error()
    return { canonicalPath: resolved, identity: { dev: entry.dev, ino: entry.ino } }
  } catch {
    throw new NoteVaultError('invalid-vault', 'The selected Desktop vault is not a safe directory')
  }
}

async function assertDesktopVaultSelectionTargetBound(
  target: DesktopVaultSelectionTarget,
): Promise<void> {
  try {
    const entry = await lstat(target.canonicalPath, { bigint: true })
    if (
      !entry.isDirectory()
      || entry.isSymbolicLink()
      || entry.dev !== target.identity.dev
      || entry.ino !== target.identity.ino
      || await realpath(target.canonicalPath) !== target.canonicalPath
    ) throw new Error()
  } catch {
    throw new NoteVaultError('changed', 'The selected Desktop vault changed during activation')
  }
}

type RevealTargetBinding = {
  candidate: string
  canonicalPath: string
  identity: FileIdentity
  kind: 'directory' | 'file'
  relativePath: string
}

async function resolveRevealTarget(
  root: string,
  requestedPath: string,
): Promise<RevealTargetBinding> {
  const relativePath = normalizeEntryPath(requestedPath)
  if (Buffer.byteLength(relativePath, 'utf8') > MAX_REVEAL_PATH_BYTES) {
    throw new NoteVaultError('invalid-path', 'Vault reveal path exceeds the supported length')
  }
  const candidate = path.join(root, ...relativePath.split('/'))
  try {
    assertInside(root, candidate)
    await assertNoDirectorySymlinks(root, candidate)
    const identity = await lstat(candidate, { bigint: true })
    if (identity.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Vault reveal targets cannot be symbolic links')
    }
    const kind = identity.isFile()
      ? 'file'
      : identity.isDirectory()
        ? 'directory'
        : null
    if (kind === null) {
      throw new NoteVaultError('unsupported-type', 'Vault reveal targets must be regular files or directories')
    }
    const canonicalPath = await realpath(candidate)
    assertInside(root, canonicalPath)
    const canonicalIdentity = await lstat(canonicalPath, { bigint: true })
    if (!sameFileIdentity(identity, canonicalIdentity)) {
      throw new NoteVaultError('changed', 'Vault reveal target changed while it was being resolved')
    }
    return { candidate, canonicalPath, identity, kind, relativePath }
  } catch (error) {
    if (error instanceof NoteVaultError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NoteVaultError('not-found', 'Vault reveal target not found')
    }
    throw new NoteVaultError('unsafe-target', 'Vault reveal target could not be inspected safely')
  }
}

async function assertRevealTargetBound(
  root: string,
  target: RevealTargetBinding,
): Promise<void> {
  try {
    await assertNoDirectorySymlinks(root, target.candidate)
    const current = await lstat(target.candidate, { bigint: true })
    const currentKind = current.isFile()
      ? 'file'
      : current.isDirectory()
        ? 'directory'
        : null
    if (
      current.isSymbolicLink()
      || currentKind !== target.kind
      || !sameFileIdentity(current, target.identity)
    ) {
      throw new NoteVaultError('changed', 'Vault reveal target changed during the operation')
    }
    const currentCanonicalPath = await realpath(target.candidate)
    assertInside(root, currentCanonicalPath)
    if (currentCanonicalPath !== target.canonicalPath) {
      throw new NoteVaultError('changed', 'Vault reveal target changed during the operation')
    }
  } catch (error) {
    if (error instanceof NoteVaultError && error.code === 'changed') throw error
    throw new NoteVaultError('changed', 'Vault reveal target changed during the operation')
  }
}

async function awaitWithAbort<Result>(
  operation: Promise<Result>,
  signal: AbortSignal,
): Promise<Result> {
  signal.throwIfAborted()
  let rejectAbort: ((reason: unknown) => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const onAbort = () => rejectAbort?.(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  try {
    return await Promise.race([operation, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

async function resolveDocumentTarget(root: string, requestedPath: string) {
  const relativePath = normalizeDocumentPath(requestedPath)
  const candidate = path.join(root, ...relativePath.split('/'))
  assertInside(root, candidate)
  await assertNoDirectorySymlinks(root, candidate)

  const aliasEntry = await lstat(candidate, { bigint: true })
  const canonical = await realpath(candidate)
  assertInside(root, canonical)
  const targetEntry = await lstat(canonical, { bigint: true })
  if (!targetEntry.isFile() || targetEntry.isSymbolicLink()) {
    throw new NoteVaultError('unsafe-target', 'Vault documents must resolve to regular files')
  }

  const alias = aliasEntry.isSymbolicLink()
  if (!alias && (!aliasEntry.isFile() || !sameFileIdentity(aliasEntry, targetEntry))) {
    throw new NoteVaultError('changed', 'Vault document changed while it was being resolved')
  }
  if (alias && documentKind(relativePath) !== documentKind(canonical)) {
    throw new NoteVaultError(
      'unsupported-type',
      'Vault document aliases must target the same supported file type',
    )
  }
  return { alias, aliasEntry, candidate, canonical, relativePath, targetEntry }
}

async function readBounded(
  handle: FileHandle,
  limit: number,
  expectedSize: number,
  signal: AbortSignal,
): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let offset = 0
  let chunkSize = Math.min(limit + 1, 64 * 1024, Math.max(1, expectedSize + 1))
  while (offset <= limit) {
    signal.throwIfAborted()
    const chunk = Buffer.allocUnsafe(chunkSize)
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset)
    if (bytesRead === 0) break
    chunks.push(chunk.subarray(0, bytesRead))
    offset += bytesRead
    chunkSize = Math.min(limit + 1 - offset, 64 * 1024)
  }
  signal.throwIfAborted()
  return offset > limit ? null : Buffer.concat(chunks, offset)
}

async function readVaultDocument(
  root: string,
  requestedPath: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ content: string; digest: string; path: string; revision: string }> {
  signal.throwIfAborted()
  const target = await resolveDocumentTarget(root, requestedPath)
  signal.throwIfAborted()
  const handle = await open(target.canonical, fsConstants.O_RDONLY | NOFOLLOW)
  try {
    assertInside(root, await realpath(target.canonical))
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameStableFile(target.targetEntry, opened)) {
      throw new NoteVaultError('changed', 'Vault document changed while it was being opened')
    }
    if (opened.size > BigInt(maxBytes)) {
      throw new NoteVaultError(
        'too-large',
        `Vault document exceeds the configured ${String(maxBytes)}-byte limit`,
      )
    }

    const data = await readBounded(handle, maxBytes, Number(opened.size), signal)
    if (data === null) {
      throw new NoteVaultError(
        'too-large',
        `Vault document exceeds the configured ${String(maxBytes)}-byte limit`,
      )
    }

    const final = await handle.stat({ bigint: true })
    const currentTarget = await lstat(target.canonical, { bigint: true })
    if (
      !final.isFile()
      || !sameStableFile(opened, final)
      || !currentTarget.isFile()
      || currentTarget.isSymbolicLink()
      || !sameStableFile(opened, currentTarget)
    ) {
      throw new NoteVaultError('changed', 'Vault document changed while it was being read')
    }

    await assertNoDirectorySymlinks(root, target.candidate)
    const currentAlias = await lstat(target.candidate, { bigint: true })
    if (target.alias) {
      if (
        !currentAlias.isSymbolicLink()
        || !sameStableFile(target.aliasEntry, currentAlias)
        || await realpath(target.candidate) !== target.canonical
      ) {
        throw new NoteVaultError('changed', 'Vault document alias changed while it was being read')
      }
    } else if (
      !currentAlias.isFile()
      || currentAlias.isSymbolicLink()
      || !sameStableFile(opened, currentAlias)
    ) {
      throw new NoteVaultError('changed', 'Vault document changed while it was being read')
    }

    const finalCanonical = await realpath(target.canonical)
    assertInside(root, finalCanonical)
    if (finalCanonical !== target.canonical) {
      throw new NoteVaultError('changed', 'Vault document changed while it was being read')
    }
    signal.throwIfAborted()
    return {
      content: data.toString('utf8'),
      digest: `sha256:${createHash('sha256').update(data).digest('hex')}`,
      path: target.relativePath,
      revision: fileRevision(opened),
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
}

async function resolveAttachmentTarget(root: string, requestedPath: string) {
  const relativePath = normalizeEntryPath(requestedPath)
  const mediaKind = attachmentKind(relativePath)
  const mimeType = ATTACHMENT_MIME_TYPES.get(path.extname(relativePath).toLowerCase())
  if (mediaKind === null || mimeType === undefined) {
    throw new NoteVaultError('unsupported-type', 'Vault attachments support accepted image, audio, video, or PDF files only')
  }
  const candidate = path.join(root, ...relativePath.split('/'))
  assertInside(root, candidate)
  await assertNoDirectorySymlinks(root, candidate)
  const aliasEntry = await lstat(candidate, { bigint: true })
  const canonical = await realpath(candidate)
  assertInside(root, canonical)
  const targetEntry = await lstat(canonical, { bigint: true })
  if (!targetEntry.isFile() || targetEntry.isSymbolicLink()) {
    throw new NoteVaultError('unsafe-target', 'Vault attachments must resolve to regular files')
  }
  const alias = aliasEntry.isSymbolicLink()
  if (!alias && (!aliasEntry.isFile() || !sameFileIdentity(aliasEntry, targetEntry))) {
    throw new NoteVaultError('changed', 'Vault attachment changed while it was being resolved')
  }
  if (
    alias
    && path.extname(relativePath).toLowerCase() !== path.extname(canonical).toLowerCase()
  ) {
    throw new NoteVaultError('unsupported-type', 'Vault attachment aliases must keep the same file type')
  }
  return {
    alias,
    aliasEntry,
    candidate,
    canonical,
    mediaKind,
    mimeType,
    relativePath,
    targetEntry,
  }
}

async function inspectVaultAttachment(
  root: string,
  requestedPath: string,
  maxBytes: number,
  signal: AbortSignal,
  readData: boolean,
) {
  signal.throwIfAborted()
  const target = await resolveAttachmentTarget(root, requestedPath)
  const handle = await open(target.canonical, fsConstants.O_RDONLY | NOFOLLOW)
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameStableFile(target.targetEntry, opened)) {
      throw new NoteVaultError('changed', 'Vault attachment changed while it was being opened')
    }
    let data: Buffer | null = null
    if (readData) {
      if (opened.size > BigInt(maxBytes)) {
        throw new NoteVaultError('too-large', 'Vault attachment exceeds the configured preview limit')
      }
      data = await readBounded(handle, maxBytes, Number(opened.size), signal)
      if (data === null) {
        throw new NoteVaultError('too-large', 'Vault attachment exceeds the configured preview limit')
      }
    }
    const final = await handle.stat({ bigint: true })
    const currentTarget = await lstat(target.canonical, { bigint: true })
    if (!sameStableFile(opened, final) || !sameStableFile(opened, currentTarget)) {
      throw new NoteVaultError('changed', 'Vault attachment changed while it was being inspected')
    }
    await assertNoDirectorySymlinks(root, target.candidate)
    const currentAlias = await lstat(target.candidate, { bigint: true })
    if (target.alias) {
      if (
        !currentAlias.isSymbolicLink()
        || !sameStableFile(target.aliasEntry, currentAlias)
        || await realpath(target.candidate) !== target.canonical
      ) {
        throw new NoteVaultError('changed', 'Vault attachment alias changed while it was being inspected')
      }
    } else if (!sameStableFile(opened, currentAlias)) {
      throw new NoteVaultError('changed', 'Vault attachment changed while it was being inspected')
    }
    signal.throwIfAborted()
    return {
      data,
      mediaKind: target.mediaKind,
      mimeType: target.mimeType,
      path: target.relativePath,
      revision: entryRevision(target.alias, target.aliasEntry, opened),
      size: Number(opened.size),
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
}

type ResolvedDocumentTarget = Awaited<ReturnType<typeof resolveDocumentTarget>>

function encodeDocumentContent(content: string, maxBytes: number): Buffer {
  if (typeof content !== 'string') {
    throw new NoteVaultError('invalid-content', 'Document content must be a string')
  }
  const data = Buffer.from(content, 'utf8')
  if (data.byteLength > maxBytes) {
    throw new NoteVaultError(
      'too-large',
      `Document content exceeds the configured ${String(maxBytes)}-byte limit`,
    )
  }
  return data
}

async function resolveNewDocumentTarget(root: string, requestedPath: string) {
  const relativePath = normalizeDocumentPath(requestedPath)
  const candidate = path.join(root, ...relativePath.split('/'))
  assertInside(root, candidate)
  await assertNoDirectorySymlinks(root, candidate)
  assertInside(root, await realpath(path.dirname(candidate)))
  return { candidate, relativePath }
}

async function assertWriteTargetUnchanged(
  root: string,
  target: ResolvedDocumentTarget,
  expectedRevision: string,
): Promise<void> {
  try {
    await assertNoDirectorySymlinks(root, target.candidate)
    if (await realpath(target.candidate) !== target.canonical) throw new Error()
    const currentTarget = await lstat(target.canonical, { bigint: true })
    if (
      !currentTarget.isFile()
      || currentTarget.isSymbolicLink()
      || !sameStableFile(target.targetEntry, currentTarget)
      || fileRevision(currentTarget) !== expectedRevision
    ) throw new Error()

    const currentAlias = await lstat(target.candidate, { bigint: true })
    if (target.alias) {
      if (
        !currentAlias.isSymbolicLink()
        || !sameStableFile(target.aliasEntry, currentAlias)
        || await realpath(target.candidate) !== target.canonical
      ) throw new Error()
    } else if (
      !currentAlias.isFile()
      || currentAlias.isSymbolicLink()
      || !sameStableFile(currentTarget, currentAlias)
    ) throw new Error()
  } catch {
    throw new NoteVaultError('conflict', 'The document changed on disk before it could be saved')
  }
}

function temporaryPathFor(targetPath: string): string {
  const basename = path.basename(targetPath)
  return path.join(
    path.dirname(targetPath),
    `.${basename}.${String(process.pid)}.${Date.now().toString()}.${randomBytes(6).toString('hex')}.tmp`,
  )
}

async function bestEffortFsync(directory: string): Promise<void> {
  try {
    const handle = await open(directory, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    // Some filesystems do not support syncing directories.
  }
}

async function writeDocumentAtomic(
  targetPath: string,
  data: Buffer,
  exclusive: boolean,
  beforeCommit: () => Promise<void>,
): Promise<void> {
  const temporaryPath = temporaryPathFor(targetPath)
  let committed = false
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(data)
      await handle.sync()
    } finally {
      await handle.close()
    }

    await beforeCommit()
    if (exclusive) {
      await link(temporaryPath, targetPath)
      committed = true
      await rm(temporaryPath)
    } else {
      await rename(temporaryPath, targetPath)
      committed = true
    }
    await bestEffortFsync(path.dirname(targetPath))
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    if (committed) {
      throw new NoteVaultError('partial', 'The document was committed but cleanup did not finish')
    }
    throw error
  }
}

async function resolveFileDestination(
  root: string,
  requestedPath: string,
  source: ResolvedDocumentTarget,
) {
  const relativePath = normalizeDocumentPath(requestedPath)
  if (documentKind(relativePath) !== documentKind(source.relativePath)) {
    throw new NoteVaultError('unsupported-type', 'Source and destination must use the same document type')
  }
  const candidate = path.join(root, ...relativePath.split('/'))
  assertInside(root, candidate)
  const parentBinding = await bindDestinationParent(root, candidate)
  if (candidate === source.candidate) {
    throw new NoteVaultError('invalid-path', 'Source and destination paths must be different')
  }
  return { candidate, parentBinding, relativePath }
}

async function assertFileEntryUnchanged(
  root: string,
  target: ResolvedDocumentTarget,
  expectedRevision: string,
  afterHardLink = false,
): Promise<void> {
  if (entryRevision(target.alias, target.aliasEntry, target.targetEntry) !== expectedRevision) {
    throw new NoteVaultError('conflict', 'The source document changed before the operation')
  }
  if (!afterHardLink || target.alias) {
    await assertWriteTargetUnchanged(root, target, fileRevision(target.targetEntry))
    return
  }
  try {
    await assertNoDirectorySymlinks(root, target.candidate)
    const current = await lstat(target.candidate, { bigint: true })
    if (
      !current.isFile()
      || current.isSymbolicLink()
      || !sameFileIdentity(target.targetEntry, current)
      || target.targetEntry.size !== current.size
      || target.targetEntry.mtimeNs !== current.mtimeNs
    ) throw new Error()
  } catch {
    throw new NoteVaultError('conflict', 'The source document changed before the operation')
  }
}

async function rollbackCreatedEntry(pathToRemove: string, created: FileIdentity): Promise<boolean> {
  try {
    const current = await lstat(pathToRemove, { bigint: true })
    if (!sameStableFile(created, current)) return false
    await unlink(pathToRemove)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
  }
}

async function createMovedFileEntry(
  source: ResolvedDocumentTarget,
  destinationPath: string,
): Promise<FileIdentity> {
  if (source.alias) {
    const relativeTarget = path.relative(path.dirname(destinationPath), source.canonical)
    await symlink(relativeTarget, destinationPath, 'file')
  } else {
    await link(source.candidate, destinationPath)
  }
  return await lstat(destinationPath, { bigint: true })
}

async function createDuplicatedFileEntry(
  source: ResolvedDocumentTarget,
  destinationPath: string,
): Promise<FileIdentity> {
  if (source.alias) {
    const relativeTarget = path.relative(path.dirname(destinationPath), source.canonical)
    await symlink(relativeTarget, destinationPath, 'file')
  } else {
    await copyFile(source.canonical, destinationPath, fsConstants.COPYFILE_EXCL)
  }
  return await lstat(destinationPath, { bigint: true })
}

type FolderManifestEntry =
  | { kind: 'alias'; path: string; revision: string; sourcePath: string; targetKey: string; targetPath: string }
  | { digest: string; kind: 'file'; path: string; revision: string; size: number; sourcePath: string }
  | { kind: 'directory'; path: string; revision: string }

type FolderManifest = {
  bytes: number
  entries: FolderManifestEntry[]
  rootRevision: string
}

function supportedFileKind(filePath: string): string | null {
  const document = documentKind(filePath)
  if (document !== null) return `document:${document}`
  const attachment = attachmentKind(filePath)
  return attachment === null ? null : `attachment:${attachment}`
}

function folderTargetKey(vaultRoot: string, subtreeRoot: string, targetPath: string): string {
  if (isInside(subtreeRoot, targetPath)) {
    return `subtree:${path.relative(subtreeRoot, targetPath).split(path.sep).join('/')}`
  }
  return `vault:${path.relative(vaultRoot, targetPath).split(path.sep).join('/')}`
}

async function hashStableManifestFile(
  vaultRoot: string,
  candidate: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ digest: string; revision: string; size: number }> {
  signal.throwIfAborted()
  const entry = await lstat(candidate, { bigint: true })
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new NoteVaultError('unsafe-target', 'Folder files must be regular files')
  }
  assertInside(vaultRoot, await realpath(candidate))
  const handle = await open(candidate, fsConstants.O_RDONLY | NOFOLLOW)
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameStableFile(entry, opened)) {
      throw new NoteVaultError('changed', 'Folder file changed while it was inspected')
    }
    if (opened.size > BigInt(maxBytes)) {
      throw new NoteVaultError('too-large', 'Folder contents exceed the configured byte limit')
    }
    const digest = createHash('sha256')
    let offset = 0
    while (offset <= maxBytes) {
      signal.throwIfAborted()
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - offset))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset)
      if (bytesRead === 0) break
      digest.update(chunk.subarray(0, bytesRead))
      offset += bytesRead
    }
    if (offset > maxBytes) {
      throw new NoteVaultError('too-large', 'Folder contents exceed the configured byte limit')
    }
    const final = await handle.stat({ bigint: true })
    const current = await lstat(candidate, { bigint: true })
    if (!sameStableFile(opened, final) || !sameStableFile(opened, current)) {
      throw new NoteVaultError('changed', 'Folder file changed while it was inspected')
    }
    return {
      digest: `sha256:${digest.digest('hex')}`,
      revision: fileRevision(opened),
      size: offset,
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
}

async function buildFolderManifest(
  vaultRoot: string,
  subtreeRoot: string,
  config: TreeScanConfig & { maxBytes: number },
  signal: AbortSignal,
): Promise<FolderManifest> {
  const rootInfo = await lstat(subtreeRoot, { bigint: true })
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new NoteVaultError('unsafe-target', 'Folder operations require a regular directory')
  }
  assertInside(vaultRoot, await realpath(subtreeRoot))
  const entries: FolderManifestEntry[] = []
  let bytes = 0
  let count = 0

  const visit = async (directory: string, relativeDirectory: string, depth: number): Promise<void> => {
    signal.throwIfAborted()
    if (depth > config.maxDepth) {
      throw new NoteVaultError('too-large', 'Folder contents exceed the configured depth limit')
    }
    const before = await lstat(directory, { bigint: true })
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Folder paths cannot contain directory symbolic links')
    }
    assertInside(vaultRoot, await realpath(directory))
    const dirents = []
    const stream = await opendir(directory)
    for await (const dirent of stream) {
      signal.throwIfAborted()
      if (dirents.length >= config.maxEntries - count) {
        throw new NoteVaultError('too-large', 'Folder contents exceed the configured entry limit')
      }
      dirents.push(dirent)
    }
    dirents.sort((left, right) => compareVaultPaths(left.name, right.name))

    for (const dirent of dirents) {
      signal.throwIfAborted()
      count += 1
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${dirent.name}`
        : dirent.name
      if (relativePath.split('/').some(part => part.startsWith('.'))) {
        throw new NoteVaultError('unsafe-target', 'Hidden folder entries cannot be moved or duplicated')
      }
      const candidate = path.join(directory, dirent.name)
      const info = await lstat(candidate, { bigint: true })
      if (info.isSymbolicLink()) {
        const targetPath = await realpath(candidate)
        assertInside(vaultRoot, targetPath)
        const targetInfo = await lstat(targetPath, { bigint: true })
        if (
          !targetInfo.isFile()
          || targetInfo.isSymbolicLink()
          || supportedFileKind(relativePath) === null
          || supportedFileKind(relativePath) !== supportedFileKind(targetPath)
        ) {
          throw new NoteVaultError('unsafe-target', 'Folder file aliases must stay in-vault and keep their type')
        }
        entries.push({
          kind: 'alias',
          path: relativePath,
          revision: entryRevision(true, info, targetInfo),
          sourcePath: candidate,
          targetKey: folderTargetKey(vaultRoot, subtreeRoot, targetPath),
          targetPath,
        })
        continue
      }
      if (info.isDirectory()) {
        entries.push({ kind: 'directory', path: relativePath, revision: fileRevision(info) })
        await visit(candidate, relativePath, depth + 1)
        continue
      }
      if (!info.isFile() || supportedFileKind(relativePath) === null) {
        throw new NoteVaultError('unsupported-type', 'Folder operations support only vault documents and attachments')
      }
      const inspected = await hashStableManifestFile(
        vaultRoot,
        candidate,
        config.maxBytes - bytes,
        signal,
      )
      bytes += inspected.size
      entries.push({
        digest: inspected.digest,
        kind: 'file',
        path: relativePath,
        revision: inspected.revision,
        size: inspected.size,
        sourcePath: candidate,
      })
    }

    const after = await lstat(directory, { bigint: true })
    if (!after.isDirectory() || after.isSymbolicLink() || !sameStableFile(before, after)) {
      throw new NoteVaultError('changed', 'Folder contents changed while they were inspected')
    }
  }

  await visit(subtreeRoot, '', 1)
  const finalRoot = await lstat(subtreeRoot, { bigint: true })
  if (!sameStableFile(rootInfo, finalRoot)) {
    throw new NoteVaultError('changed', 'Folder contents changed while they were inspected')
  }
  return { bytes, entries, rootRevision: fileRevision(finalRoot) }
}

function folderManifestFingerprint(manifest: FolderManifest): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}

function folderContentFingerprint(manifest: FolderManifest): string {
  const entries = manifest.entries.map(entry => {
    if (entry.kind === 'directory') return { kind: entry.kind, path: entry.path }
    if (entry.kind === 'alias') {
      return { kind: entry.kind, path: entry.path, targetKey: entry.targetKey }
    }
    return {
      digest: entry.digest,
      kind: entry.kind,
      path: entry.path,
      size: entry.size,
    }
  })
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex')
}

async function syncCopiedFile(filePath: string): Promise<void> {
  const handle = await open(filePath, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function copyFolderManifest(
  manifest: FolderManifest,
  vaultRoot: string,
  sourceRoot: string,
  destinationRoot: string,
  signal: AbortSignal,
  assertCurrent: () => void,
  onRootCreated: () => void,
): Promise<void> {
  const rootParent = await bindDestinationParent(vaultRoot, destinationRoot)
  await mkdir(destinationRoot, { mode: 0o700 })
  onRootCreated()
  await assertDestinationParentBound(vaultRoot, rootParent)
  const rootIdentity = await lstat(destinationRoot, { bigint: true })
  if (!rootIdentity.isDirectory() || rootIdentity.isSymbolicLink()) {
    throw new NoteVaultError('unsafe-target', 'Vault destination folder claim was unsafe')
  }
  assertInside(vaultRoot, await realpath(destinationRoot))
  for (const entry of manifest.entries) {
    signal.throwIfAborted()
    assertCurrent()
    const destinationPath = path.join(destinationRoot, ...entry.path.split('/'))
    const parentBinding = await bindDestinationParent(vaultRoot, destinationPath)
    if (entry.kind === 'directory') {
      await mkdir(destinationPath, { mode: 0o700 })
      await assertDestinationParentBound(vaultRoot, parentBinding)
      const claimed = await lstat(destinationPath, { bigint: true })
      if (!claimed.isDirectory() || claimed.isSymbolicLink()) {
        throw new NoteVaultError('unsafe-target', 'Vault destination folder claim was unsafe')
      }
      assertInside(vaultRoot, await realpath(destinationPath))
      continue
    }
    if (entry.kind === 'file') {
      await copyFile(entry.sourcePath, destinationPath, fsConstants.COPYFILE_EXCL)
      const claimed = await lstat(destinationPath, { bigint: true })
      await assertDestinationParentBound(vaultRoot, parentBinding)
      await assertClaimedEntryConfined(vaultRoot, destinationPath, claimed)
      await syncCopiedFile(destinationPath)
      continue
    }
    const targetPath = isInside(sourceRoot, entry.targetPath)
      ? path.join(destinationRoot, path.relative(sourceRoot, entry.targetPath))
      : entry.targetPath
    await symlink(path.relative(path.dirname(destinationPath), targetPath), destinationPath, 'file')
    const claimed = await lstat(destinationPath, { bigint: true })
    await assertDestinationParentBound(vaultRoot, parentBinding)
    await assertClaimedEntryConfined(vaultRoot, destinationPath, claimed)
  }
  await bestEffortFsync(destinationRoot)
  await bestEffortFsync(path.dirname(destinationRoot))
}

function snapshotId(now = Date.now()): string {
  return `${new Date(now).toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`
}

function validSnapshotId(id: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}$/iu.test(id)
}

function snapshotDirectoryParts(vault: VaultReference, relativePath: string): string[] {
  return [
    'snapshots',
    createHash('sha256').update(vault.id).digest('hex'),
    createHash('sha256').update(relativePath).digest('hex'),
  ]
}

async function stateDirectory(
  stateRoot: string,
  parts: string[],
  create: boolean,
): Promise<string | null> {
  let cursor = stateRoot
  for (const part of parts) {
    cursor = path.join(cursor, part)
    if (create) {
      try {
        await mkdir(cursor, { mode: 0o700 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    let entry
    try {
      entry = await lstat(cursor)
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new NoteVaultError('recovery-unavailable', 'Snapshot storage contains an unsafe directory')
    }
    assertInside(stateRoot, await realpath(cursor))
  }
  return cursor
}

async function readStateBytes(filePath: string, maxBytes: number): Promise<Buffer> {
  const entry = await lstat(filePath, { bigint: true })
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > BigInt(maxBytes)) {
    throw new NoteVaultError('not-found', 'Snapshot record not found')
  }
  const handle = await open(filePath, fsConstants.O_RDONLY | NOFOLLOW)
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameStableFile(entry, opened)) {
      throw new NoteVaultError('not-found', 'Snapshot record not found')
    }
    const data = await readBounded(handle, maxBytes, Number(opened.size), POST_COMMIT_SIGNAL)
    if (data === null) throw new NoteVaultError('not-found', 'Snapshot record not found')
    const final = await handle.stat({ bigint: true })
    const current = await lstat(filePath, { bigint: true })
    if (!sameStableFile(opened, final) || !sameStableFile(opened, current)) {
      throw new NoteVaultError('not-found', 'Snapshot record not found')
    }
    return data
  } finally {
    await handle.close().catch(() => undefined)
  }
}

async function listSnapshotRecords(
  stateRoot: string,
  vault: VaultReference,
  relativePath: string,
  maxBodyBytes: number,
): Promise<Array<{ body: Buffer; bodyPath: string; info: SnapshotInfo; metaPath: string }>> {
  const directory = await stateDirectory(
    stateRoot,
    snapshotDirectoryParts(vault, relativePath),
    false,
  )
  if (directory === null) return []
  const names: string[] = []
  const stream = await opendir(directory)
  for await (const entry of stream) {
    if (names.length >= SNAPSHOT_SCAN_LIMIT) break
    if (entry.isFile() && entry.name.endsWith('.json')) names.push(entry.name)
  }
  const records = []
  for (const name of names.sort(compareVaultPaths)) {
    const id = name.slice(0, -'.json'.length)
    if (!validSnapshotId(id)) continue
    const metaPath = path.join(directory, name)
    try {
      const parsed = JSON.parse(
        (await readStateBytes(metaPath, SNAPSHOT_METADATA_MAX_BYTES)).toString('utf8'),
      ) as Partial<SnapshotInfo>
      if (
        parsed.id !== id
        || parsed.path !== relativePath
        || typeof parsed.createdAt !== 'number'
        || !Number.isFinite(parsed.createdAt)
        || typeof parsed.reason !== 'string'
        || parsed.reason.length === 0
        || parsed.reason.length > 200
        || typeof parsed.size !== 'number'
        || !Number.isSafeInteger(parsed.size)
        || parsed.size < 0
        || parsed.size > maxBodyBytes
        || typeof parsed.digest !== 'string'
        || !/^sha256:[0-9a-f]{64}$/u.test(parsed.digest)
      ) continue
      const bodyPath = path.join(directory, `${id}.body`)
      const body = await readStateBytes(bodyPath, maxBodyBytes)
      if (
        body.byteLength !== parsed.size
        || `sha256:${createHash('sha256').update(body).digest('hex')}` !== parsed.digest
      ) continue
      records.push({
        body,
        bodyPath,
        info: {
          createdAt: parsed.createdAt,
          digest: parsed.digest,
          id,
          path: relativePath,
          reason: parsed.reason,
          size: parsed.size,
        },
        metaPath,
      })
    } catch {
      // Persisted recovery metadata is untrusted; malformed records are ignored.
    }
  }
  return records.sort((left, right) => right.info.createdAt - left.info.createdAt)
}

async function readSnapshotRecord(
  stateRoot: string,
  vault: VaultReference,
  relativePath: string,
  id: string,
  maxBodyBytes: number,
) {
  if (!validSnapshotId(id)) throw new NoteVaultError('not-found', 'Snapshot record not found')
  const records = await listSnapshotRecords(stateRoot, vault, relativePath, maxBodyBytes)
  const record = records.find(candidate => candidate.info.id === id)
  if (record === undefined) throw new NoteVaultError('not-found', 'Snapshot record not found')
  return { body: record.body, info: record.info }
}

async function captureSnapshotRecord(
  stateRoot: string,
  vault: VaultReference,
  relativePath: string,
  content: string,
  reason: string,
  maxBodyBytes: number,
  limit: number,
  retentionDays: number,
): Promise<SnapshotInfo> {
  const body = Buffer.from(content, 'utf8')
  if (body.byteLength > maxBodyBytes) {
    throw new NoteVaultError('recovery-unavailable', 'Snapshot content exceeds the configured byte limit')
  }
  const digest = `sha256:${createHash('sha256').update(body).digest('hex')}`
  const existing = await listSnapshotRecords(stateRoot, vault, relativePath, maxBodyBytes)
  if (existing[0]?.info.digest === digest) return existing[0].info
  const directory = await stateDirectory(
    stateRoot,
    snapshotDirectoryParts(vault, relativePath),
    true,
  )
  if (directory === null) throw new NoteVaultError('recovery-unavailable', 'Snapshot storage is unavailable')
  const createdAt = Date.now()
  const id = snapshotId(createdAt)
  const info: SnapshotInfo = { createdAt, digest, id, path: relativePath, reason, size: body.byteLength }
  const bodyPath = path.join(directory, `${id}.body`)
  const metaPath = path.join(directory, `${id}.json`)
  try {
    await writeDocumentAtomic(bodyPath, body, true, async () => undefined)
    await writeDocumentAtomic(
      metaPath,
      Buffer.from(JSON.stringify(info), 'utf8'),
      true,
      async () => undefined,
    )
  } catch (error) {
    await rm(bodyPath, { force: true }).catch(() => undefined)
    await rm(metaPath, { force: true }).catch(() => undefined)
    throw error
  }

  const records = await listSnapshotRecords(stateRoot, vault, relativePath, maxBodyBytes)
  const cutoff = createdAt - retentionDays * 24 * 60 * 60_000
  for (const record of records.filter((candidate, index) => (
    index >= limit || candidate.info.createdAt < cutoff
  ))) {
    await rm(record.bodyPath, { force: true })
    await rm(record.metaPath, { force: true })
  }
  return info
}

async function draftFilePath(
  stateRoot: string,
  vault: VaultReference,
  relativePath: string,
  create: boolean,
): Promise<string | null> {
  const directory = await stateDirectory(
    stateRoot,
    ['drafts', createHash('sha256').update(vault.id).digest('hex')],
    create,
  )
  return directory === null
    ? null
    : path.join(directory, `${createHash('sha256').update(relativePath).digest('hex')}.json`)
}

async function readDraftRecord(
  stateRoot: string,
  vault: VaultReference,
  relativePath: string,
  maxBytes: number,
): Promise<DraftRecord | null> {
  const filePath = await draftFilePath(stateRoot, vault, relativePath, false)
  if (filePath === null) return null
  try {
    const parsed = JSON.parse((await readStateBytes(filePath, maxBytes)).toString('utf8')) as Partial<DraftRecord>
    const now = Date.now()
    if (
      parsed.path !== relativePath
      || typeof parsed.content !== 'string'
      || Buffer.byteLength(parsed.content, 'utf8') > maxBytes
      || typeof parsed.updatedAt !== 'number'
      || !Number.isFinite(parsed.updatedAt)
      || parsed.updatedAt < 0
      || parsed.updatedAt > now + 24 * 60 * 60_000
      || (parsed.revision !== undefined && typeof parsed.revision !== 'string')
    ) return null
    return {
      content: parsed.content,
      path: relativePath,
      ...(parsed.revision === undefined ? {} : { revision: parsed.revision }),
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

type TrashRecord = TrashEntryInfo & {
  revision: string
  trashPath: string
}

function validTrashId(id: string): boolean {
  return /^trash-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
}

async function trashMetadataDirectory(
  stateRoot: string,
  vault: VaultReference,
  create: boolean,
): Promise<string | null> {
  return await stateDirectory(
    stateRoot,
    ['trash', createHash('sha256').update(vault.id).digest('hex')],
    create,
  )
}

async function listTrashRecords(
  stateRoot: string,
  vault: VaultReference,
): Promise<Array<{ metaPath: string; record: TrashRecord }>> {
  const directory = await trashMetadataDirectory(stateRoot, vault, false)
  if (directory === null) return []
  const names: string[] = []
  const stream = await opendir(directory)
  for await (const entry of stream) {
    if (names.length >= SNAPSHOT_SCAN_LIMIT) break
    if (entry.isFile() && entry.name.endsWith('.json')) names.push(entry.name)
  }
  const records = []
  for (const name of names.sort(compareVaultPaths)) {
    const id = name.slice(0, -'.json'.length)
    if (!validTrashId(id)) continue
    const metaPath = path.join(directory, name)
    try {
      const parsed = JSON.parse(
        (await readStateBytes(metaPath, SNAPSHOT_METADATA_MAX_BYTES)).toString('utf8'),
      ) as Partial<TrashRecord>
      if (
        parsed.id !== id
        || typeof parsed.createdAt !== 'number'
        || !Number.isFinite(parsed.createdAt)
        || !['attachment', 'document', 'folder'].includes(parsed.kind ?? '')
        || typeof parsed.originalPath !== 'string'
        || normalizeEntryPath(parsed.originalPath) !== parsed.originalPath
        || typeof parsed.trashPath !== 'string'
        || normalizeEntryPath(parsed.trashPath) !== parsed.trashPath
        || !parsed.trashPath.startsWith('.trash/')
        || typeof parsed.revision !== 'string'
        || !/^(?:entry|file):[0-9a-f]{64}$/u.test(parsed.revision)
      ) continue
      records.push({ metaPath, record: parsed as TrashRecord })
    } catch {
      // Persisted trash metadata is untrusted; malformed records are ignored.
    }
  }
  return records.sort((left, right) => right.record.createdAt - left.record.createdAt)
}

async function currentTrashRevision(root: string, record: TrashRecord): Promise<string | null> {
  try {
    if (record.kind === 'document') {
      const target = await resolveDocumentTarget(root, record.trashPath)
      return entryRevision(target.alias, target.aliasEntry, target.targetEntry)
    }
    if (record.kind === 'attachment') {
      const target = await resolveAttachmentTarget(root, record.trashPath)
      return entryRevision(target.alias, target.aliasEntry, target.targetEntry)
    }
    const candidate = path.join(root, ...record.trashPath.split('/'))
    await assertNoDirectorySymlinks(root, candidate)
    const entry = await lstat(candidate, { bigint: true })
    if (!entry.isDirectory() || entry.isSymbolicLink()) return null
    assertInside(root, await realpath(candidate))
    return fileRevision(entry)
  } catch {
    return null
  }
}

async function writeTrashRecord(
  stateRoot: string,
  vault: VaultReference,
  record: TrashRecord,
): Promise<string> {
  const directory = await trashMetadataDirectory(stateRoot, vault, true)
  if (directory === null) throw new NoteVaultError('recovery-unavailable', 'Trash metadata storage is unavailable')
  const metaPath = path.join(directory, `${record.id}.json`)
  await writeDocumentAtomic(
    metaPath,
    Buffer.from(JSON.stringify(record), 'utf8'),
    true,
    async () => undefined,
  )
  return metaPath
}

function compareVaultPaths(left: string, right: string): number {
  const collated = left.localeCompare(right)
  return collated || (left < right ? -1 : left > right ? 1 : 0)
}

function appendRewriteError(current: string | undefined, detail: string): string {
  const combined = current === undefined ? detail : `${current}; ${detail}`
  return combined.length <= 240 ? combined : `${combined.slice(0, 237)}...`
}

async function inspectTreeFile(
  root: string,
  candidate: string,
  relativePath: string,
): Promise<VaultTreeEntry | null> {
  const requestedDocument = documentKind(relativePath)
  const requestedAttachment = attachmentKind(relativePath)
  if (requestedDocument === null && requestedAttachment === null) return null

  const aliasEntry = await lstat(candidate, { bigint: true })
  const canonical = await realpath(candidate)
  assertInside(root, canonical)
  const targetEntry = await lstat(canonical, { bigint: true })
  if (!targetEntry.isFile() || targetEntry.isSymbolicLink()) {
    throw new NoteVaultError('unsafe-target', 'Vault tree files must resolve to regular files')
  }

  const alias = aliasEntry.isSymbolicLink()
  if (!alias && (!aliasEntry.isFile() || !sameFileIdentity(aliasEntry, targetEntry))) {
    throw new NoteVaultError('changed', 'Vault tree file changed while it was being resolved')
  }
  if (alias && (
    requestedDocument !== documentKind(canonical)
    || requestedAttachment !== attachmentKind(canonical)
  )) {
    throw new NoteVaultError('unsupported-type', 'Vault tree aliases must target the same supported file type')
  }

  const handle = await open(canonical, fsConstants.O_RDONLY | NOFOLLOW)
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameStableFile(targetEntry, opened)) {
      throw new NoteVaultError('changed', 'Vault tree file changed while it was being inspected')
    }
    const currentTarget = await lstat(canonical, { bigint: true })
    if (
      !currentTarget.isFile()
      || currentTarget.isSymbolicLink()
      || !sameStableFile(opened, currentTarget)
    ) {
      throw new NoteVaultError('changed', 'Vault tree file changed while it was being inspected')
    }
    const currentAlias = await lstat(candidate, { bigint: true })
    if (alias) {
      if (
        !currentAlias.isSymbolicLink()
        || !sameStableFile(aliasEntry, currentAlias)
        || await realpath(candidate) !== canonical
      ) {
        throw new NoteVaultError('changed', 'Vault tree alias changed while it was being inspected')
      }
    } else if (
      !currentAlias.isFile()
      || currentAlias.isSymbolicLink()
      || !sameStableFile(opened, currentAlias)
    ) {
      throw new NoteVaultError('changed', 'Vault tree file changed while it was being inspected')
    }

    const common = {
      createdAt: Number(opened.birthtimeMs || opened.ctimeMs),
      modifiedAt: Number(opened.mtimeMs),
      path: relativePath,
      revision: entryRevision(alias, aliasEntry, opened),
      size: Number(opened.size),
    }
    return requestedDocument !== null
      ? { ...common, kind: 'document' }
      : { ...common, kind: 'attachment', mediaKind: requestedAttachment! }
  } finally {
    await handle.close().catch(() => undefined)
  }
}

type TreeScanConfig = {
  maxDepth: number
  maxEntries: number
}

async function scanVaultTree(
  root: string,
  config: TreeScanConfig,
  signal: AbortSignal,
): Promise<{
  entries: VaultTreeEntry[]
  scanned: number
  truncationReason: Exclude<TreeTruncationReason, 'result-limit'>
  warnings: string[]
}> {
  const entries: VaultTreeEntry[] = []
  const warnings: string[] = []
  let scanned = 0
  let truncationReason: 'depth-limit' | 'entry-limit' | null = null
  const warn = (message: string) => {
    if (warnings.length < MAX_TREE_WARNINGS) warnings.push(message)
  }

  const visit = async (directory: string, depth: number): Promise<boolean> => {
    signal.throwIfAborted()
    const before = await lstat(directory, { bigint: true })
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Vault tree folders cannot be symbolic links')
    }
    assertInside(root, await realpath(directory))

    const remaining = config.maxEntries - scanned
    if (remaining <= 0) {
      truncationReason = 'entry-limit'
      return false
    }
    const dirents = []
    const stream = await opendir(directory)
    for await (const entry of stream) {
      signal.throwIfAborted()
      if (dirents.length >= remaining) {
        truncationReason = 'entry-limit'
        break
      }
      dirents.push(entry)
    }
    dirents.sort((left, right) => compareVaultPaths(left.name, right.name))

    for (const dirent of dirents) {
      signal.throwIfAborted()
      if (scanned >= config.maxEntries) {
        truncationReason = 'entry-limit'
        return false
      }
      scanned += 1
      const relativePath = path.relative(root, path.join(directory, dirent.name))
        .split(path.sep).join('/')
      if (relativePath.split('/').some(part => part.startsWith('.'))) continue
      const candidate = path.join(directory, dirent.name)

      if (dirent.isSymbolicLink()) {
        if (documentKind(relativePath) === null && attachmentKind(relativePath) === null) {
          warn(`${relativePath}: symbolic link skipped`)
          continue
        }
        try {
          const entry = await inspectTreeFile(root, candidate, relativePath)
          if (entry !== null) entries.push(entry)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error
          warn(`${relativePath}: could not be inspected safely`)
        }
        continue
      }

      if (dirent.isDirectory()) {
        const info = await lstat(candidate, { bigint: true })
        if (!info.isDirectory() || info.isSymbolicLink()) {
          warn(`${relativePath}: directory changed during scan`)
          continue
        }
        assertInside(root, await realpath(candidate))
        entries.push({
          kind: 'directory',
          modifiedAt: Number(info.mtimeMs),
          path: relativePath,
          revision: fileRevision(info),
        })
        if (depth >= config.maxDepth) {
          truncationReason ??= 'depth-limit'
          warn(`${relativePath}: depth limit reached`)
        } else if (!await visit(candidate, depth + 1)) {
          return false
        }
        continue
      }

      if (dirent.isFile()) {
        try {
          const entry = await inspectTreeFile(root, candidate, relativePath)
          if (entry !== null) entries.push(entry)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error
          warn(`${relativePath}: could not be inspected safely`)
        }
      }
    }

    const after = await lstat(directory, { bigint: true })
    if (
      !after.isDirectory()
      || after.isSymbolicLink()
      || !sameStableFile(before, after)
    ) {
      throw new NoteVaultError('changed', 'Vault tree changed while it was being scanned')
    }
    assertInside(root, await realpath(directory))
    return true
  }

  await visit(root, 1)
  entries.sort((left, right) => compareVaultPaths(left.path, right.path))
  return { entries, scanned, truncationReason, warnings }
}

async function scanPassiveBackupEntries(
  root: string,
  config: TreeScanConfig,
  signal: AbortSignal,
): Promise<PassiveBackupEntry[]> {
  const output: PassiveBackupEntry[] = []
  const aliases = new Set<string>()
  let bytes = 0
  let scanned = 0

  const visit = async (directory: string, relativeDirectory: string, depth: number): Promise<void> => {
    signal.throwIfAborted()
    if (depth > config.maxDepth) {
      throw new NoteVaultError('too-large', 'Passive backup exceeds the configured depth limit')
    }
    const before = await lstat(directory, { bigint: true })
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Passive backup folders cannot be symbolic links')
    }
    assertInside(root, await realpath(directory))
    const dirents = []
    const stream = await opendir(directory)
    for await (const dirent of stream) {
      if (scanned + dirents.length >= config.maxEntries) {
        throw new NoteVaultError('too-large', 'Passive backup exceeds the configured entry limit')
      }
      dirents.push(dirent)
    }
    dirents.sort((left, right) => compareVaultPaths(left.name, right.name))

    for (const dirent of dirents) {
      signal.throwIfAborted()
      scanned += 1
      const relativePath = `${relativeDirectory}/${dirent.name}`
      const candidate = path.join(directory, dirent.name)
      const entry = await lstat(candidate, { bigint: true })
      if (entry.isSymbolicLink()) {
        throw new NoteVaultError('unsafe-target', 'Passive backup entries cannot be symbolic links')
      }
      if (entry.isDirectory()) {
        if (!dirent.name.startsWith('.')) await visit(candidate, relativePath, depth + 1)
        continue
      }
      if (!entry.isFile()) {
        if (isPassiveBackupPath(relativePath)) {
          throw new NoteVaultError('unsafe-target', 'Passive backup entries must be regular files')
        }
        continue
      }
      if (!isPassiveBackupPath(relativePath)) continue
      if (entry.nlink !== 1n) {
        throw new NoteVaultError('unsafe-target', 'Passive backup entries cannot be file aliases')
      }
      if (entry.size > BigInt(MAX_PASSIVE_BACKUP_ENTRY_BYTES)) {
        throw new NoteVaultError('too-large', 'Passive backup entry exceeds the configured byte limit')
      }
      bytes += Number(entry.size)
      if (bytes > MAX_PASSIVE_BACKUP_TOTAL_BYTES) {
        throw new NoteVaultError('too-large', 'Passive backup exceeds the configured byte limit')
      }
      assertInside(root, await realpath(candidate))
      const alias = passiveBackupAliasKey(relativePath)
      if (aliases.has(alias)) {
        throw new NoteVaultError('unsafe-target', 'Passive backup paths contain an ambiguous alias')
      }
      aliases.add(alias)
      output.push({ path: relativePath, revision: fileRevision(entry), size: Number(entry.size) })
    }

    const after = await lstat(directory, { bigint: true })
    if (!after.isDirectory() || after.isSymbolicLink() || !sameStableFile(before, after)) {
      throw new NoteVaultError('changed', 'Passive backup folders changed while they were listed')
    }
    assertInside(root, await realpath(directory))
  }

  const roots = []
  const stream = await opendir(root)
  for await (const dirent of stream) {
    if (passiveBackupRoot(dirent.name)) roots.push(dirent.name)
  }
  for (const name of roots.sort(compareVaultPaths)) {
    signal.throwIfAborted()
    scanned += 1
    if (scanned > config.maxEntries) {
      throw new NoteVaultError('too-large', 'Passive backup exceeds the configured entry limit')
    }
    const candidate = path.join(root, name)
    const entry = await lstat(candidate, { bigint: true })
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Passive backup roots must be regular directories')
    }
    await visit(candidate, name, 1)
  }
  return output.sort((left, right) => compareVaultPaths(left.path, right.path))
}

async function readPassiveBackupFile(
  root: string,
  request: ReadPassiveBackupEntryRequest,
  signal: AbortSignal,
): Promise<Omit<PassiveBackupContentResult, 'generation'>> {
  signal.throwIfAborted()
  if (NOFOLLOW === 0) {
    throw new NoteVaultError('unavailable', 'Passive backup requires no-follow file access')
  }
  const relativePath = normalizePassiveBackupPath(request.path)
  if (typeof request.expectedRevision !== 'string' || !/^file:[0-9a-f]{64}$/u.test(request.expectedRevision)) {
    throw new NoteVaultError('changed', 'Passive backup entry revision changed')
  }
  const candidate = path.join(root, ...relativePath.split('/'))
  assertInside(root, candidate)
  await assertNoDirectorySymlinks(root, candidate)
  const expected = await lstat(candidate, { bigint: true })
  if (!expected.isFile() || expected.isSymbolicLink() || expected.nlink !== 1n) {
    throw new NoteVaultError('unsafe-target', 'Passive backup entries must be unaliased regular files')
  }
  if (fileRevision(expected) !== request.expectedRevision) {
    throw new NoteVaultError('changed', 'Passive backup entry changed before it was read')
  }
  const handle = await open(candidate, fsConstants.O_RDONLY | NOFOLLOW)
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || opened.nlink !== 1n || !sameStableFile(expected, opened)) {
      throw new NoteVaultError('changed', 'Passive backup entry changed while it was opened')
    }
    if (opened.size > BigInt(MAX_PASSIVE_BACKUP_ENTRY_BYTES)) {
      throw new NoteVaultError('too-large', 'Passive backup entry exceeds the configured byte limit')
    }
    const data = await readBounded(handle, MAX_PASSIVE_BACKUP_ENTRY_BYTES, Number(opened.size), signal)
    if (data === null) throw new NoteVaultError('too-large', 'Passive backup entry exceeds the configured byte limit')
    const final = await handle.stat({ bigint: true })
    const current = await lstat(candidate, { bigint: true })
    if (!final.isFile() || final.nlink !== 1n || current.isSymbolicLink() || current.nlink !== 1n
      || !sameStableFile(opened, final) || !sameStableFile(opened, current)
      || fileRevision(final) !== request.expectedRevision) {
      throw new NoteVaultError('changed', 'Passive backup entry changed while it was read')
    }
    await assertNoDirectorySymlinks(root, candidate)
    assertInside(root, await realpath(candidate))
    signal.throwIfAborted()
    return {
      data: new Uint8Array(data),
      digest: `sha256:${createHash('sha256').update(data).digest('hex')}`,
      path: relativePath,
      revision: fileRevision(final),
      size: data.byteLength,
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
}

async function assertPassiveSiblingUnaliased(
  directory: string,
  name: string,
  maxEntries: number,
): Promise<void> {
  const expected = passiveBackupAliasKey(name)
  let scanned = 0
  const stream = await opendir(directory)
  for await (const entry of stream) {
    scanned += 1
    if (scanned > maxEntries) {
      throw new NoteVaultError('too-large', 'Passive backup destination exceeds the configured entry limit')
    }
    if (entry.name !== name && passiveBackupAliasKey(entry.name) === expected) {
      throw new NoteVaultError('exists', 'A passive backup alias already exists at that path')
    }
  }
}

async function assertPassiveDestinationUnaliased(
  root: string,
  relativePath: string,
  maxEntries: number,
): Promise<void> {
  const parts = relativePath.split('/')
  let cursor = root
  for (const [index, part] of parts.entries()) {
    await assertPassiveSiblingUnaliased(cursor, part, maxEntries)
    if (index === parts.length - 1) return
    cursor = path.join(cursor, part)
    try {
      const entry = await lstat(cursor, { bigint: true })
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new NoteVaultError('unsafe-target', 'Passive backup folders must be regular directories')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}

async function ensurePassiveBackupParent(
  root: string,
  relativePath: string,
  maxEntries: number,
): Promise<DestinationParentBinding> {
  const parts = relativePath.split('/')
  let cursor = root
  for (const part of parts.slice(0, -1)) {
    await assertPassiveSiblingUnaliased(cursor, part, maxEntries)
    cursor = path.join(cursor, part)
    try {
      await mkdir(cursor, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const entry = await lstat(cursor, { bigint: true })
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Passive backup folders must be regular directories')
    }
    assertInside(root, await realpath(cursor))
  }
  await assertPassiveSiblingUnaliased(cursor, parts.at(-1)!, maxEntries)
  return await bindDestinationParent(root, path.join(root, ...parts))
}

function treeCursorKey(
  vault: VaultReference,
  maxEntries: number,
  maxDepth: number,
): string {
  return createHash('sha256')
    .update(`${vault.id}:${String(vault.generation)}:${String(maxEntries)}:${String(maxDepth)}`)
    .digest('hex')
}

function treeFingerprint(scan: Awaited<ReturnType<typeof scanVaultTree>>): string {
  return createHash('sha256').update(JSON.stringify({
    entries: scan.entries,
    scanned: scan.scanned,
    truncationReason: scan.truncationReason,
  })).digest('hex')
}

function encodeTreeCursor(offset: number, key: string, fingerprint: string): string {
  return Buffer.from(JSON.stringify({ fingerprint, key, offset, version: 1 })).toString('base64url')
}

function decodeTreeCursor(
  cursor: string | null | undefined,
  key: string,
  maxOffset: number,
): { fingerprint: string | null; offset: number } {
  if (cursor == null) return { fingerprint: null, offset: 0 }
  try {
    if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 512) throw new Error()
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      fingerprint?: unknown
      key?: unknown
      offset?: unknown
      version?: unknown
    }
    if (
      parsed.version !== 1
      || parsed.key !== key
      || typeof parsed.fingerprint !== 'string'
      || !/^[0-9a-f]{64}$/u.test(parsed.fingerprint)
      || !Number.isInteger(parsed.offset)
      || (parsed.offset as number) < 0
      || (parsed.offset as number) > maxOffset
    ) throw new Error()
    return { fingerprint: parsed.fingerprint, offset: parsed.offset as number }
  } catch {
    throw new NoteVaultError('invalid-path', 'Invalid vault tree cursor')
  }
}

function normalizeWatcherPath(filename: string | Buffer | null): string | null | undefined {
  if (filename === null) return null
  const value = Buffer.isBuffer(filename) ? filename.toString('utf8') : filename
  if (
    value === ''
    || value.includes('\0')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^[A-Za-z]:/u.test(value)
  ) return undefined
  const parts = value.split(/[\\/]+/u).filter(Boolean)
  if (
    parts.length === 0
    || parts.some(part => part === '.' || part === '..' || part.startsWith('.'))
  ) return undefined
  return parts.join('/')
}

type PersistedRecentVault = {
  id: string
  lastOpenedAt: number
  root: string
}

function sameSyncFile(left: ReturnType<typeof fstatSync>, right: ReturnType<typeof fstatSync>): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
}

function readStateTextSync(filePath: string, maxBytes: number): string | null {
  let descriptor: number | undefined
  try {
    const entry = lstatSync(filePath)
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > maxBytes) return null
    descriptor = openSync(filePath, fsConstants.O_RDONLY | NOFOLLOW)
    const opened = fstatSync(descriptor)
    if (!opened.isFile() || !sameSyncFile(entry, opened)) return null
    const data = Buffer.alloc(opened.size)
    let offset = 0
    while (offset < data.byteLength) {
      const bytesRead = readSync(descriptor, data, offset, data.byteLength - offset, null)
      if (bytesRead === 0) return null
      offset += bytesRead
    }
    const final = fstatSync(descriptor)
    const current = lstatSync(filePath)
    if (!sameSyncFile(opened, final) || !sameSyncFile(opened, current)) return null
    return data.toString('utf8')
  } catch {
    return null
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor) } catch { /* fail-closed read cleanup */ }
    }
  }
}

function writeStateTextSync(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.${String(process.pid)}.${randomBytes(6).toString('hex')}.tmp`
  let descriptor: number | undefined
  try {
    descriptor = openSync(temporaryPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600)
    const data = Buffer.from(content, 'utf8')
    let offset = 0
    while (offset < data.byteLength) {
      const written = writeSync(descriptor, data, offset, data.byteLength - offset)
      if (written <= 0) throw new Error('state write stopped')
      offset += written
    }
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporaryPath, filePath)
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor) } catch { /* cleanup remains best effort */ }
    }
    try { unlinkSync(temporaryPath) } catch { /* renamed or never created */ }
  }
}

function vaultStateDirectorySync(stateRoot: string): string {
  const directory = path.join(stateRoot, 'vault-state')
  try {
    mkdirSync(directory, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const entry = lstatSync(directory)
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new NoteVaultError('recovery-unavailable', 'Vault state storage is unsafe')
  }
  assertInside(stateRoot, realpathSync(directory))
  return directory
}

function parsePersistedRecentVaults(value: unknown, limit: number): PersistedRecentVault[] {
  if (!Array.isArray(value)) return []
  const records: PersistedRecentVault[] = []
  const seen = new Set<string>()
  const now = Date.now()
  for (const candidate of value) {
    if (records.length >= limit) break
    if (typeof candidate !== 'object' || candidate === null) continue
    const record = candidate as { lastOpenedAt?: unknown; root?: unknown }
    if (
      typeof record.root !== 'string'
      || record.root.length === 0
      || record.root.length > 32_768
      || record.root.includes('\0')
    ) continue
    let root: string
    try { root = resolveVaultRoot(record.root) } catch { continue }
    const id = activeVaultState(root, 1)
    if (!id.active || seen.has(id.id)) continue
    seen.add(id.id)
    const timestamp = typeof record.lastOpenedAt === 'number'
      && Number.isFinite(record.lastOpenedAt)
      && record.lastOpenedAt >= 0
      && record.lastOpenedAt <= now + 24 * 60 * 60_000
      ? record.lastOpenedAt
      : 0
    records.push({ id: id.id, lastOpenedAt: timestamp, root })
  }
  return records
}

function loadPersistedRecentVaults(stateRoot: string, limit: number): PersistedRecentVault[] {
  const directory = vaultStateDirectorySync(stateRoot)
  const raw = readStateTextSync(path.join(directory, 'recent.json'), 1024 * 1024)
  if (raw === null) return []
  try { return parsePersistedRecentVaults(JSON.parse(raw), limit) } catch { return [] }
}

function loadPersistedActiveVault(stateRoot: string): string | null {
  const directory = vaultStateDirectorySync(stateRoot)
  const raw = readStateTextSync(path.join(directory, 'active'), 32_769)
  if (raw === null) return null
  const value = raw.replace(/\r?\n$/u, '')
  if (value.length === 0 || value.length > 32_768 || value.includes('\0')) return null
  try { return resolveVaultRoot(value) } catch { return null }
}

function loadLegacyRecentVaults(stateRoot: string, limit: number): PersistedRecentVault[] {
  const raw = readStateTextSync(path.join(stateRoot, 'notes-recent-vaults.json'), 1024 * 1024)
  if (raw === null) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsePersistedRecentVaults(parsed.map(candidate => typeof candidate === 'string'
      ? { lastOpenedAt: 0, root: candidate }
      : candidate), limit)
  } catch {
    return []
  }
}

function loadLegacyActiveVault(stateRoot: string): string | null {
  const raw = readStateTextSync(path.join(stateRoot, 'notes-vault-path'), 32_769)
  if (raw === null) return null
  const value = raw.replace(/\r?\n$/u, '')
  if (value.length === 0 || value.length > 32_768 || value.includes('\0')) return null
  try { return resolveVaultRoot(value) } catch { return null }
}

function loadPersistedVaultSelection(
  stateRoot: string,
  limit: number,
): { activeRoot: string; recents: PersistedRecentVault[] } | null {
  const directory = vaultStateDirectorySync(stateRoot)
  const raw = readStateTextSync(path.join(directory, 'selection.json'), 1024 * 1024)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as { activeRoot?: unknown; recents?: unknown }
    if (
      typeof parsed.activeRoot !== 'string'
      || parsed.activeRoot.length === 0
      || parsed.activeRoot.length > 32_768
      || parsed.activeRoot.includes('\0')
    ) return null
    const activeRoot = resolveVaultRoot(parsed.activeRoot)
    return {
      activeRoot,
      recents: parsePersistedRecentVaults(parsed.recents, limit),
    }
  } catch {
    return null
  }
}

function persistVaultSelection(
  stateRoot: string,
  activeRoot: string,
  recents: PersistedRecentVault[],
): void {
  const directory = vaultStateDirectorySync(stateRoot)
  writeStateTextSync(
    path.join(directory, 'selection.json'),
    `${JSON.stringify({
      activeRoot,
      recents: recents.map(record => ({
        lastOpenedAt: record.lastOpenedAt,
        root: record.root,
      })),
    }, null, 2)}\n`,
  )
  for (const legacyName of ['active', 'recent.json']) {
    try { unlinkSync(path.join(directory, legacyName)) } catch { /* absent or already migrated */ }
  }
}

function resolveStateRoot(stateRoot: string | null): string | null {
  if (stateRoot === null) return null
  try {
    try {
      if (lstatSync(stateRoot).isSymbolicLink()) throw new Error()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    mkdirSync(stateRoot, { mode: 0o700, recursive: true })
    const resolved = realpathSync(stateRoot)
    const entry = lstatSync(resolved)
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error()
    return resolved
  } catch {
    throw new NoteVaultError('invalid-vault', 'stateRoot must reference a safe directory')
  }
}

function resolveVaultRoot(vaultRoot: string): string {
  try {
    const resolved = realpathSync(vaultRoot)
    if (!lstatSync(resolved).isDirectory()) throw new Error()
    return resolved
  } catch (error) {
    if (error instanceof NoteVaultError) throw error
    throw new NoteVaultError('invalid-vault', 'vaultRoot must reference an existing directory')
  }
}

type VaultRootIdentity = { dev: bigint; ino: bigint }

type VaultRootBinding = {
  identity: VaultRootIdentity
  root: string
}

function resolveVaultRootBinding(vaultRoot: string): VaultRootBinding {
  const root = resolveVaultRoot(vaultRoot)
  const entry = lstatSync(root, { bigint: true })
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new NoteVaultError('invalid-vault', 'vaultRoot must reference a safe directory')
  }
  return { identity: { dev: entry.dev, ino: entry.ino }, root }
}

function sameVaultRootIdentity(left: VaultRootIdentity, right: VaultRootIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function activeVaultState(vaultRoot: string, generation: number): NoteVaultState {
  return Object.freeze({
    active: true,
    generation,
    id: `vault:${createHash('sha256').update(vaultRoot).digest('hex')}`,
  })
}

type ActiveDesktopSelectionClaim = {
  claim: TockTeamDesktopVaultSelectionClaim
  operationId: string
  provider: TockTeamDesktopVaultSelection
}

type ActiveDesktopSelectionOperation = {
  complete: () => void
  completion: Promise<void>
  controller: AbortController
}

type ActiveRevealOperation = {
  controller: AbortController
}

export class NoteVaultRuntime extends Service {
  static Config = Config

  private activeDesktopSelectionClaim: ActiveDesktopSelectionClaim | null = null
  private readonly activeDesktopSelectionOperations = new Set<ActiveDesktopSelectionOperation>()
  private readonly activeRevealOperations = new Set<ActiveRevealOperation>()
  private readonly desktopSelectionCleanupOperations = new Set<Promise<void>>()
  private readonly context: Context
  private currentState: NoteVaultState
  private readonly draftOperations = new Map<string, Promise<void>>()
  private readonly maxAttachmentBytes: number
  private readonly maxDraftBytes: number
  private readonly maxFolderBytes: number
  private readonly maxReadBytes: number
  private readonly maxTreeResults: number
  private readonly recentVaultLimit: number
  private recentVaults: PersistedRecentVault[]
  private readonly snapshotLimit: number
  private readonly snapshotRetentionDays: number
  private readonly stateRoot: string | null
  private readonly treeConfig: TreeScanConfig
  private vaultIdentity: VaultRootIdentity | null
  private vaultRoot: string | null
  private watcher: FSWatcher | null = null
  private watcherActive = false
  private watcherToken = 0

  constructor(ctx: Context, config: Config) {
    super(ctx, 'noteVault')
    this.context = ctx
    this.maxAttachmentBytes = config.maxAttachmentBytes
    this.maxDraftBytes = config.maxDraftBytes
    this.maxFolderBytes = config.maxFolderBytes
    this.maxReadBytes = config.maxReadBytes
    this.maxTreeResults = config.maxTreeResults
    this.recentVaultLimit = config.recentVaultLimit
    this.snapshotLimit = config.snapshotLimit
    this.snapshotRetentionDays = config.snapshotRetentionDays
    this.stateRoot = resolveStateRoot(config.stateRoot)
    this.treeConfig = {
      maxDepth: config.maxTreeDepth,
      maxEntries: config.maxTreeEntries,
    }
    const persistedSelection = this.stateRoot === null
      ? null
      : loadPersistedVaultSelection(this.stateRoot, this.recentVaultLimit)
    this.recentVaults = persistedSelection?.recents
      ?? (this.stateRoot === null
        ? []
        : (() => {
            const current = loadPersistedRecentVaults(this.stateRoot!, this.recentVaultLimit)
            return current.length > 0 ? current : loadLegacyRecentVaults(this.stateRoot!, this.recentVaultLimit)
          })())
    const initialRoot = config.vaultRoot === null && config.restoreActiveVault && this.stateRoot !== null
      ? persistedSelection?.activeRoot
        ?? loadPersistedActiveVault(this.stateRoot)
        ?? loadLegacyActiveVault(this.stateRoot)
      : config.vaultRoot
    if (initialRoot === null) {
      this.vaultIdentity = null
      this.vaultRoot = null
      this.currentState = Object.freeze({ active: false, generation: 0 })
    } else {
      const binding = resolveVaultRootBinding(initialRoot)
      this.vaultIdentity = binding.identity
      this.vaultRoot = binding.root
      this.currentState = activeVaultState(this.vaultRoot, 1)
      if (this.currentState.active) {
        const current = {
          id: this.currentState.id,
          lastOpenedAt: Date.now(),
          root: this.vaultRoot,
        }
        this.recentVaults = [
          current,
          ...this.recentVaults.filter(record => record.id !== current.id),
        ].slice(0, this.recentVaultLimit)
        if (this.stateRoot !== null) {
          persistVaultSelection(this.stateRoot, this.vaultRoot, this.recentVaults)
        }
      }
    }

    ctx.on('internal/service', (name) => {
      const operations = name === 'tockTeamDesktopReveal'
        ? this.activeRevealOperations
        : name === 'tockTeamDesktopVaultSelection'
          ? this.activeDesktopSelectionOperations
          : null
      if (operations === null) return
      for (const operation of operations) {
        if (!operation.controller.signal.aborted) {
          operation.controller.abort(new NoteVaultError(
            'unavailable',
            `The Desktop ${name === 'tockTeamDesktopReveal' ? 'reveal' : 'vault selection'} provider became unavailable`,
          ))
        }
      }
    })

    ctx.effect(() => {
      this.watcherActive = true
      if (this.currentState.active && this.vaultRoot !== null) {
        const token = this.watcherToken + 1
        this.watcher = this.openWatcher(this.vaultRoot, this.currentState, token)
        this.watcherToken = token
      }
      return async () => {
        const desktopSelectionCompletions = [...this.activeDesktopSelectionOperations]
          .map(operation => operation.completion)
        for (const operation of [
          ...this.activeDesktopSelectionOperations,
          ...this.activeRevealOperations,
        ]) {
          if (!operation.controller.signal.aborted) {
            operation.controller.abort(new NoteVaultError(
              'unavailable',
              'The note vault runtime became unavailable',
            ))
          }
        }
        this.watcherActive = false
        this.watcherToken += 1
        const watcher = this.watcher
        this.watcher = null
        watcher?.close()
        await Promise.allSettled(desktopSelectionCompletions)
        const activeSelectionClaim = this.activeDesktopSelectionClaim
        this.activeDesktopSelectionClaim = null
        if (activeSelectionClaim !== null) this.queueDesktopSelectionClaimRelease(activeSelectionClaim)
        await Promise.allSettled([...this.desktopSelectionCleanupOperations])
        await Promise.allSettled([...this.draftOperations.values()])
      }
    })
  }

  private emitVaultActivation(state: Extract<NoteVaultState, { active: true }>): void {
    try {
      this.context.emit('note-vault/change', {
        action: 'activated',
        kind: 'vault',
        vault: { id: state.id, generation: state.generation },
      })
    } catch {
      // Activation is already committed; observer failures cannot roll it back.
    }
  }

  private queueDesktopSelectionClaimRelease(selection: ActiveDesktopSelectionClaim): void {
    const cleanup = (async () => {
      try {
        await selection.provider.release({
          claim: selection.claim,
          operationId: selection.operationId,
        })
      } catch {
        // Provider loss also clears its bounded claims.
      }
    })()
    this.desktopSelectionCleanupOperations.add(cleanup)
    void cleanup.then(() => this.desktopSelectionCleanupOperations.delete(cleanup))
  }

  private openWatcher(
    root: string,
    state: Extract<NoteVaultState, { active: true }>,
    token: number,
  ): FSWatcher {
    const watcher = watch(root, {
      encoding: 'utf8',
      persistent: false,
      recursive: true,
    }, (eventType, filename) => {
      void this.emitWatcherChange(root, state, token, eventType, filename)
        .catch(() => undefined)
    })
    watcher.on('error', () => {
      if (
        this.watcherActive
        && this.watcherToken === token
        && this.currentState === state
        && this.vaultRoot === root
      ) {
        this.context.emit('note-vault/change', {
          action: 'watcher-error',
          kind: 'tree',
          vault: { id: state.id, generation: state.generation },
        })
      }
    })
    return watcher
  }

  private async emitWatcherChange(
    root: string,
    state: Extract<NoteVaultState, { active: true }>,
    token: number,
    eventType: string,
    filename: string | Buffer | null,
  ): Promise<void> {
    if (
      !this.watcherActive
      || this.watcherToken !== token
      || this.currentState !== state
      || this.vaultRoot !== root
    ) return
    try {
      this.assertActiveVaultBound(state, root)
    } catch {
      return
    }
    const relativePath = normalizeWatcherPath(filename)
    if (relativePath === undefined) return
    if (relativePath !== null) {
      const candidate = path.join(root, ...relativePath.split('/'))
      try {
        await assertNoDirectorySymlinks(root, candidate)
        const entry = await lstat(candidate)
        if (entry.isSymbolicLink()) return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return
      }
    }
    if (
      !this.watcherActive
      || this.watcherToken !== token
      || this.currentState !== state
      || this.vaultRoot !== root
    ) return
    const vault = { id: state.id, generation: state.generation }
    if (relativePath !== null) {
      this.context.emit('note-vault/change', {
        action: eventType === 'rename' ? 'external-rename' : 'external-change',
        kind: 'entry',
        path: relativePath,
        vault,
      })
    }
    this.context.emit('note-vault/change', { action: 'changed', kind: 'tree', vault })
  }

  private emitEntryChange(
    action: 'created' | 'stored' | 'updated',
    path: string,
    state: Extract<NoteVaultState, { active: true }>,
  ): void {
    const vault = { id: state.id, generation: state.generation }
    this.context.emit('note-vault/change', { action, kind: 'entry', path, vault })
    this.context.emit('note-vault/change', { action: 'changed', kind: 'tree', vault })
  }

  private emitFileMutation(
    action: 'duplicated' | 'moved' | 'restored' | 'trashed',
    fromPath: string,
    path: string,
    state: Extract<NoteVaultState, { active: true }>,
  ): void {
    const vault = { id: state.id, generation: state.generation }
    this.context.emit('note-vault/change', { action, fromPath, kind: 'entry', path, vault })
    this.context.emit('note-vault/change', { action: 'changed', kind: 'tree', vault })
  }

  get state(): NoteVaultState {
    const state = this.currentState
    const root = this.vaultRoot
    if (state.active && root !== null) {
      try { this.assertActiveVaultBound(state, root) } catch { /* return the invalidated state */ }
    }
    return this.currentState
  }

  private invalidateActiveVault(state: Extract<NoteVaultState, { active: true }>, root: string): void {
    if (this.currentState !== state || this.vaultRoot !== root) return
    const invalidated = new NoteVaultError('stale-vault', 'The active vault identity changed')
    for (const operation of [
      ...this.activeDesktopSelectionOperations,
      ...this.activeRevealOperations,
    ]) {
      if (!operation.controller.signal.aborted) operation.controller.abort(invalidated)
    }
    const activeSelectionClaim = this.activeDesktopSelectionClaim
    this.activeDesktopSelectionClaim = null
    if (activeSelectionClaim !== null) this.queueDesktopSelectionClaimRelease(activeSelectionClaim)
    this.vaultIdentity = null
    this.vaultRoot = null
    this.currentState = Object.freeze({ active: false, generation: state.generation + 1 })
    this.recentVaults = this.recentVaults.filter(record => record.id !== state.id)
    this.watcherToken += 1
    const watcher = this.watcher
    this.watcher = null
    watcher?.close()
    if (this.stateRoot !== null) {
      try { unlinkSync(path.join(vaultStateDirectorySync(this.stateRoot), 'selection.json')) } catch { /* fail closed in memory */ }
    }
  }

  private assertActiveVaultBound(
    state: Extract<NoteVaultState, { active: true }>,
    root: string,
  ): void {
    if (this.currentState !== state || this.vaultRoot !== root) {
      throw new NoteVaultError('stale-vault', 'The active vault changed before the operation could finish')
    }
    try {
      const binding = resolveVaultRootBinding(root)
      if (
        binding.root !== root
        || this.vaultIdentity === null
        || !sameVaultRootIdentity(binding.identity, this.vaultIdentity)
      ) throw new Error()
    } catch {
      this.invalidateActiveVault(state, root)
      throw new NoteVaultError('changed', 'The active vault directory changed identity')
    }
  }

  private captureExpectedVault(expectedVault: VaultReference) {
    const state = this.currentState
    const root = this.vaultRoot
    if (!state.active || root === null) {
      throw new NoteVaultError('inactive', 'No vault is active')
    }
    this.assertActiveVaultBound(state, root)
    if (
      expectedVault?.id !== state.id
      || expectedVault?.generation !== state.generation
    ) {
      throw new NoteVaultError('stale-vault', 'The active vault changed before the operation could finish')
    }
    return { root, state }
  }

  private assertCapturedVault(
    state: Extract<NoteVaultState, { active: true }>,
    root: string,
  ): void {
    this.assertActiveVaultBound(state, root)
  }

  /** Synchronize the active runtime vault into the authenticated Desktop owner before native authorization is claimed. */
  async synchronizeDesktopSelection(signal: AbortSignal): Promise<Extract<NoteVaultState, { active: true }>> {
    const state = this.currentState
    const root = this.vaultRoot
    if (!state.active || root === null) throw new NoteVaultError('inactive', 'No vault is active')
    this.assertActiveVaultBound(state, root)
    signal.throwIfAborted()
    const provider = this.context.get('tockTeamDesktopVaultSelection')
    if (provider === undefined) throw new NoteVaultError('unavailable', 'Desktop vault selection is unavailable in this runtime')
    const controller = new AbortController()
    let completeOperation: (() => void) | undefined
    const completion = new Promise<void>(resolve => { completeOperation = resolve })
    const operation = { complete: () => completeOperation?.(), completion, controller }
    const operationSignal = AbortSignal.any([signal, controller.signal])
    const operationId = randomUUID()
    this.activeDesktopSelectionOperations.add(operation)
    try {
      const result = await awaitWithAbort(provider.adopt({
        canonicalPath: root,
        operationId,
        vaultGeneration: state.generation,
        vaultId: state.id,
      }, operationSignal), operationSignal)
      operationSignal.throwIfAborted()
      this.assertCapturedVault(state, root)
      if (!hasExactKeys(result, ['operationId', 'status']) || result.operationId !== operationId) {
        throw new NoteVaultError('unavailable', 'Desktop vault synchronization returned an invalid result')
      }
      if (result.status !== 'bound') {
        const code = result.status === 'stale' ? 'stale-vault'
          : result.status === 'cancelled' || result.status === 'denied' || result.status === 'unavailable'
            ? result.status
            : 'unavailable'
        throw new NoteVaultError(code, 'Desktop vault synchronization failed')
      }
      return state
    } catch (cause) {
      operationSignal.throwIfAborted()
      this.assertCapturedVault(state, root)
      if (cause instanceof NoteVaultError) throw cause
      throw new NoteVaultError('unavailable', 'The Desktop vault synchronization provider failed')
    } finally {
      this.activeDesktopSelectionOperations.delete(operation)
      operation.complete()
    }
  }

  async activateDesktopSelection(
    request: ActivateDesktopSelectionRequest,
    signal: AbortSignal,
  ): Promise<ActivateDesktopSelectionResult> {
    const identity = request?.identity
    if (
      !hasExactKeys(request, ['authorization', 'identity'])
      || !boundedDesktopText(request.authorization, 1024)
      || !hasExactKeys(identity, [
        'operationId',
        'requestId',
        'sessionId',
        'vaultGeneration',
        'vaultId',
        'windowId',
      ])
      || !Number.isSafeInteger(identity.vaultGeneration)
      || identity.vaultGeneration < 0
      || [identity.operationId, identity.requestId, identity.sessionId, identity.windowId]
        .some(value => !boundedDesktopText(value, 512))
      || (identity.vaultId !== null && !boundedDesktopText(identity.vaultId, 512))
    ) {
      throw new NoteVaultError('denied', 'The Desktop vault selection request is invalid')
    }
    const assertExpectedState = () => {
      const state = this.currentState
      const root = this.vaultRoot
      if (state.active && root !== null) this.assertActiveVaultBound(state, root)
      if (
        state.generation !== identity.vaultGeneration
        || (state.active ? state.id : null) !== identity.vaultId
      ) throw new NoteVaultError('stale-vault', 'The active vault changed before Desktop activation')
      return state
    }
    assertExpectedState()
    signal.throwIfAborted()
    const controller = new AbortController()
    let completeOperation: (() => void) | undefined
    const completion = new Promise<void>(resolve => { completeOperation = resolve })
    const operation = {
      complete: () => completeOperation?.(),
      completion,
      controller,
    }
    const operationSignal = AbortSignal.any([signal, controller.signal])
    this.activeDesktopSelectionOperations.add(operation)
    const provider = this.context.get('tockTeamDesktopVaultSelection')
    const releaseClaim = async (value: TockTeamDesktopVaultSelectionClaim): Promise<void> => {
      if (provider === undefined) return
      try {
        await provider.release({ claim: value, operationId: identity.operationId })
      } catch {
        // The provider also clears bounded claims on owner loss; cleanup cannot override the activation result.
      }
    }
    let claim: TockTeamDesktopVaultSelectionClaim | undefined
    let activated = false
    try {
      if (provider === undefined) {
        throw new NoteVaultError('unavailable', 'Desktop vault selection is unavailable in this runtime')
      }
      let consumed: TockTeamDesktopVaultSelectionConsumeResult
      const consumeOperation = Promise.resolve().then(async () => await provider.consume({
        authorization: request.authorization,
        identity,
      }, operationSignal))
      try {
        consumed = await awaitWithAbort(consumeOperation, operationSignal)
      } catch {
        const lateCleanup = consumeOperation.then(async (late) => {
          if (late?.status === 'consumed' && boundedDesktopText(late.claim, 1024)) {
            await releaseClaim(late.claim)
          }
        }).catch(() => undefined)
        this.desktopSelectionCleanupOperations.add(lateCleanup)
        void lateCleanup.then(() => this.desktopSelectionCleanupOperations.delete(lateCleanup))
        operationSignal.throwIfAborted()
        assertExpectedState()
        throw new NoteVaultError('unavailable', 'The Desktop vault selection provider failed')
      }
      operationSignal.throwIfAborted()
      assertExpectedState()
      if (consumed?.status === 'consumed' && boundedDesktopText(consumed.claim, 1024)) {
        claim = consumed.claim
      }
      if (!hasExactKeys(
        consumed,
        consumed?.status === 'consumed'
          ? ['canonicalPath', 'claim', 'identity', 'operationId', 'status']
          : ['operationId', 'status'],
      )) {
        throw new NoteVaultError('unavailable', 'Desktop vault selection returned an invalid result')
      }
      if (consumed.status === 'consumed' && claim === undefined) {
        throw new NoteVaultError('unavailable', 'Desktop vault selection returned an invalid claim')
      }
      if (consumed?.operationId !== identity.operationId) {
        throw new NoteVaultError('unavailable', 'Desktop vault selection returned an invalid operation')
      }
      if (consumed.status !== 'consumed') {
        const status = consumed.status === 'stale' ? 'stale-vault'
          : consumed.status === 'cancelled' || consumed.status === 'denied' || consumed.status === 'unavailable'
            ? consumed.status
            : 'unavailable'
        throw new NoteVaultError(status, 'Desktop vault selection could not be consumed')
      }
      if (!hasExactKeys(consumed.identity, ['dev', 'ino'])) {
        throw new NoteVaultError('unavailable', 'Desktop vault selection returned an invalid identity')
      }
      if (claim === undefined) throw new Error('unreachable missing Desktop vault selection claim')
      const target = await resolveDesktopVaultSelectionTarget(consumed.canonicalPath, consumed.identity)
      operationSignal.throwIfAborted()
      const state = assertExpectedState()
      const nextGeneration = target.canonicalPath === this.vaultRoot
        ? state.generation
        : state.generation + 1
      const nextState = activeVaultState(target.canonicalPath, nextGeneration)
      if (!nextState.active) throw new Error('unreachable inactive vault state')
      let bound: TockTeamDesktopVaultSelectionBindResult
      try {
        bound = await awaitWithAbort(provider.bind({
          claim,
          operationId: identity.operationId,
          vaultGeneration: nextState.generation,
          vaultId: nextState.id,
        }, operationSignal), operationSignal)
      } catch {
        operationSignal.throwIfAborted()
        assertExpectedState()
        throw new NoteVaultError('unavailable', 'The Desktop vault selection provider failed')
      }
      operationSignal.throwIfAborted()
      assertExpectedState()
      if (!hasExactKeys(bound, ['operationId', 'status'])) {
        throw new NoteVaultError('unavailable', 'Desktop vault selection returned an invalid result')
      }
      if (bound.operationId !== identity.operationId) {
        throw new NoteVaultError('unavailable', 'Desktop vault selection returned an invalid operation')
      }
      if (bound.status !== 'bound') {
        const status = bound.status === 'stale' ? 'stale-vault'
          : bound.status === 'cancelled' || bound.status === 'denied' || bound.status === 'unavailable'
            ? bound.status
            : 'unavailable'
        throw new NoteVaultError(status, 'Desktop vault selection could not be bound')
      }
      await assertDesktopVaultSelectionTargetBound(target)
      operationSignal.throwIfAborted()
      const result = this.activateVault(
        target.canonicalPath,
        identity.vaultGeneration,
        target.identity,
        true,
        operation,
        false,
      )
      if (!result.active) throw new Error('unreachable inactive vault state')
      const previousSelectionClaim = this.activeDesktopSelectionClaim
      this.activeDesktopSelectionClaim = { claim, operationId: identity.operationId, provider }
      activated = true
      if (previousSelectionClaim !== null) {
        this.queueDesktopSelectionClaimRelease(previousSelectionClaim)
      }
      this.emitVaultActivation(result)
      if (this.currentState === result && this.vaultRoot === target.canonicalPath) {
        this.assertActiveVaultBound(result, target.canonicalPath)
      }
      operationSignal.throwIfAborted()
      if (
        this.currentState !== result
        || this.vaultRoot !== target.canonicalPath
        || this.vaultIdentity === null
        || !sameVaultRootIdentity(this.vaultIdentity, target.identity)
      ) {
        throw new NoteVaultError('stale-vault', 'The active vault changed during Desktop activation')
      }
      return {
        operationId: identity.operationId,
        status: 'activated',
        vaultGeneration: result.generation,
        vaultId: result.id,
      }
    } catch (error) {
      operationSignal.throwIfAborted()
      if (error instanceof NoteVaultError) throw error
      throw new NoteVaultError('unavailable', 'Desktop vault selection failed safely')
    } finally {
      if (claim !== undefined && !activated) await releaseClaim(claim)
      operation.complete()
      this.activeDesktopSelectionOperations.delete(operation)
    }
  }

  activate(vaultRoot: string, expectedGeneration: number): NoteVaultState {
    return this.activateVault(vaultRoot, expectedGeneration)
  }

  private activateVault(
    vaultRoot: string,
    expectedGeneration: number,
    expectedIdentity?: VaultRootIdentity,
    preserveDesktopSelectionClaim = false,
    excludedOperation?: ActiveDesktopSelectionOperation,
    emitActivation = true,
  ): NoteVaultState {
    if (expectedGeneration !== this.currentState.generation) {
      throw new NoteVaultError('stale-vault', 'The active vault generation changed before activation')
    }
    const binding = resolveVaultRootBinding(vaultRoot)
    if (expectedIdentity !== undefined && !sameVaultRootIdentity(binding.identity, expectedIdentity)) {
      throw new NoteVaultError('changed', 'The selected Desktop vault changed before activation')
    }
    if (
      binding.root === this.vaultRoot
      && this.vaultIdentity !== null
      && sameVaultRootIdentity(binding.identity, this.vaultIdentity)
    ) return this.currentState
    const generation = this.currentState.generation + 1
    const nextState = activeVaultState(binding.root, generation)
    if (!nextState.active) throw new Error('unreachable inactive vault state')
    const nextToken = this.watcherToken + 1
    const nextWatcher = this.watcherActive
      ? this.openWatcher(binding.root, nextState, nextToken)
      : null
    const nextRecent = [
      { id: nextState.id, lastOpenedAt: Date.now(), root: binding.root },
      ...this.recentVaults.filter(record => record.id !== nextState.id),
    ].slice(0, this.recentVaultLimit)
    try {
      if (this.stateRoot !== null) persistVaultSelection(this.stateRoot, binding.root, nextRecent)
    } catch {
      nextWatcher?.close()
      throw new NoteVaultError('recovery-unavailable', 'Could not persist the active vault selection')
    }
    for (const operation of this.activeDesktopSelectionOperations) {
      if (operation !== excludedOperation && !operation.controller.signal.aborted) {
        operation.controller.abort(new NoteVaultError(
          'stale-vault',
          'The active vault changed before Desktop activation could finish',
        ))
      }
    }
    for (const operation of this.activeRevealOperations) {
      if (!operation.controller.signal.aborted) {
        operation.controller.abort(new NoteVaultError(
          'stale-vault',
          'The active vault changed before the reveal could finish',
        ))
      }
    }
    const previousWatcher = this.watcher
    this.vaultIdentity = binding.identity
    this.vaultRoot = binding.root
    this.currentState = nextState
    this.recentVaults = nextRecent
    this.watcherToken = nextToken
    this.watcher = nextWatcher
    previousWatcher?.close()
    if (!preserveDesktopSelectionClaim) {
      const activeSelectionClaim = this.activeDesktopSelectionClaim
      this.activeDesktopSelectionClaim = null
      if (activeSelectionClaim !== null) this.queueDesktopSelectionClaimRelease(activeSelectionClaim)
    }
    if (emitActivation) this.emitVaultActivation(nextState)
    return this.currentState
  }

  listRecentVaults(): RecentVaultInfo[] {
    return this.recentVaults.map(record => ({
      id: record.id,
      lastOpenedAt: record.lastOpenedAt,
    }))
  }

  removeRecentVault(id: string, expectedGeneration: number): RecentVaultInfo[] {
    if (!/^vault:[0-9a-f]{64}$/u.test(id) || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
      throw new NoteVaultError('denied', 'Recent vault removal is invalid')
    }
    const state = this.currentState
    if (state.generation !== expectedGeneration) throw new NoteVaultError('stale-vault', 'The active vault changed before recent-vault removal')
    this.recentVaults = this.recentVaults.filter(record => record.id !== id)
    if (this.stateRoot !== null && state.active && this.vaultRoot !== null) {
      persistVaultSelection(this.stateRoot, this.vaultRoot, this.recentVaults)
    }
    return this.listRecentVaults()
  }

  openSandboxVault(expectedGeneration: number): NoteVaultState {
    if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
      throw new NoteVaultError('denied', 'Sandbox activation is invalid')
    }
    if (this.currentState.generation !== expectedGeneration) {
      throw new NoteVaultError('stale-vault', 'The active vault changed before sandbox activation')
    }
    if (this.stateRoot === null) throw new NoteVaultError('unavailable', 'Sandbox storage is unavailable')
    const root = path.join(this.stateRoot, 'TockTutor Sandbox')
    mkdirSync(root, { mode: 0o700, recursive: true })
    const welcome = path.join(root, 'Welcome.md')
    try {
      const descriptor = openSync(welcome, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600)
      try {
        const data = Buffer.from('# TockTutor Sandbox\n\nThis local demo vault preserves your edits.\n', 'utf8')
        let offset = 0
        while (offset < data.byteLength) {
          const written = writeSync(descriptor, data, offset, data.byteLength - offset)
          if (written <= 0) throw new Error('sandbox seed write stopped')
          offset += written
        }
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    return this.activate(root, expectedGeneration)
  }

  createManagedVault(name: string, expectedGeneration: number): NoteVaultState {
    if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0 || this.currentState.generation !== expectedGeneration) {
      throw new NoteVaultError('stale-vault', 'The active vault changed before managed-vault creation')
    }
    const normalized = name.trim()
    if (normalized.length === 0 || normalized.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(normalized) || normalized === '.' || normalized === '..') {
      throw new NoteVaultError('invalid-path', 'Managed vault name is invalid')
    }
    if (this.stateRoot === null) throw new NoteVaultError('unavailable', 'Managed vault storage is unavailable')
    const parent = path.join(this.stateRoot, 'TockTutor Vaults')
    mkdirSync(parent, { mode: 0o700, recursive: true })
    const root = path.join(parent, normalized)
    try {
      mkdirSync(root, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new NoteVaultError('exists', 'Managed vault already exists')
      throw error
    }
    return this.activate(root, expectedGeneration)
  }

  async revealEntry(
    request: RevealEntryRequest,
    signal: AbortSignal,
  ): Promise<RevealEntryResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    const controller = new AbortController()
    const operation = { controller }
    const operationSignal = AbortSignal.any([signal, controller.signal])
    this.activeRevealOperations.add(operation)
    try {
      const target = await resolveRevealTarget(root, request.path)
      operationSignal.throwIfAborted()
      this.assertCapturedVault(state, root)
      const provider = this.context.get('tockTeamDesktopReveal')
      if (provider === undefined) {
        throw new NoteVaultError('unavailable', 'Desktop reveal is unavailable in this runtime')
      }

      await assertRevealTargetBound(root, target)
      operationSignal.throwIfAborted()
      const operationId = randomUUID()
      let result: TockTeamDesktopRevealResult
      try {
        result = await awaitWithAbort(provider.reveal({
          canonicalPath: target.canonicalPath,
          identity: {
            dev: target.identity.dev.toString(10),
            ino: target.identity.ino.toString(10),
          },
          kind: target.kind,
          operationId,
          vaultGeneration: state.generation,
          vaultId: state.id,
        }, operationSignal), operationSignal)
      } catch {
        operationSignal.throwIfAborted()
        this.assertCapturedVault(state, root)
        throw new NoteVaultError('unavailable', 'The Desktop reveal provider failed')
      }
      operationSignal.throwIfAborted()
      this.assertCapturedVault(state, root)
      await assertRevealTargetBound(root, target)
      operationSignal.throwIfAborted()
      if (result?.operationId !== operationId) {
        throw new NoteVaultError('unavailable', 'The Desktop reveal provider returned an invalid operation')
      }
      switch (result.status) {
        case 'cancelled':
        case 'denied':
        case 'unavailable':
          throw new NoteVaultError(result.status, `Desktop reveal failed with status ${result.status}`)
        case 'stale':
          throw new NoteVaultError('stale-vault', 'Desktop reveal failed with status stale')
        case 'revealed':
          break
        default:
          throw new NoteVaultError('unavailable', 'The Desktop reveal provider returned an invalid status')
      }
      return {
        generation: state.generation,
        path: target.relativePath,
        status: 'revealed',
      }
    } catch (error) {
      operationSignal.throwIfAborted()
      this.assertCapturedVault(state, root)
      if (error instanceof NoteVaultError) throw error
      throw new NoteVaultError('unavailable', 'Desktop reveal failed safely')
    } finally {
      this.activeRevealOperations.delete(operation)
    }
  }

  activateRecentVault(id: string, expectedGeneration: number): NoteVaultState {
    const recent = this.recentVaults.find(record => record.id === id)
    if (recent === undefined) throw new NoteVaultError('not-found', 'Recent vault not found')
    return this.activate(recent.root, expectedGeneration)
  }

  private createInspection(
    expectedVault: VaultReference,
    maxResults = Math.min(DEFAULT_MAX_INSPECTION_RESULTS, this.maxTreeResults),
  ): VaultInspection {
    const input: VaultInspectionInput = {
      list: async (request, signal) => {
        let page: VaultTreePage
        try {
          page = await this.listTree({
            expectedVault,
            ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
            ...(request.limit === undefined ? {} : { limit: request.limit }),
          }, signal)
        } catch (error) {
          if (error instanceof NoteVaultError && error.code === 'stale-vault') {
            throw new Error('Vault generation changed during inspection.')
          }
          throw error
        }
        const depthLimited = page.truncationReason === 'depth-limit'
        const truncationReason: VaultTruncationReason = page.truncationReason === 'depth-limit'
          ? 'entry-limit'
          : page.truncationReason
        const entries: VaultInspectionInventoryEntry[] = []
        for (const entry of page.entries) {
          if (entry.kind === 'directory') continue
          const common = {
            createdMs: entry.createdAt,
            modifiedMs: entry.modifiedAt,
            path: entry.path,
            revision: entry.revision,
            size: entry.size,
          }
          entries.push(entry.kind === 'document'
            ? { ...common, kind: 'document' }
            : { ...common, kind: 'attachment', mediaKind: entry.mediaKind })
        }
        return {
          complete: page.complete,
          cursor: page.cursor,
          entries,
          truncated: page.truncated,
          truncationReason,
          warnings: depthLimited
            ? [...page.warnings, 'vault tree depth limit reached']
            : page.warnings,
        }
      },
      read: async (requestedPath, maxBytes, signal) => {
        let document: OpenDocumentResult
        try {
          document = await this.openDocument(requestedPath, expectedVault, signal)
        } catch (error) {
          if (error instanceof NoteVaultError && error.code === 'stale-vault') {
            throw new Error('Vault generation changed during inspection.')
          }
          throw error
        }
        if (Buffer.byteLength(document.content, 'utf8') > maxBytes) {
          throw new Error(`Vault file exceeds the configured ${String(maxBytes)}-byte limit.`)
        }
        return { content: document.content, path: document.path }
      },
    }
    const limits: VaultInspectionLimits = {
      maxReadBytes: this.maxReadBytes,
      maxSearchBytes: Math.min(
        DEFAULT_MAX_INSPECTION_BYTES,
        this.maxReadBytes * this.treeConfig.maxEntries,
      ),
      maxSearchEntries: this.treeConfig.maxEntries,
      maxSearchFileBytes: this.maxReadBytes,
      maxSearchResults: maxResults,
    }
    return createVaultInspection(input, limits)
  }

  private async runInspection<Result extends object>(
    expectedVault: VaultReference,
    signal: AbortSignal,
    operation: (inspection: VaultInspection) => Promise<Result>,
  ): Promise<VaultInspectionRuntimeResult<Result>> {
    const { root, state } = this.captureExpectedVault(expectedVault)
    signal.throwIfAborted()
    try {
      const result = await operation(this.createInspection(expectedVault))
      signal.throwIfAborted()
      this.assertCapturedVault(state, root)
      return { ...result, generation: state.generation }
    } catch (error) {
      this.assertCapturedVault(state, root)
      throw error
    }
  }

  async search(
    args: VaultSearchArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<VaultSearchResult>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.search(args, signal))
  }

  async read(
    args: VaultReadArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<Awaited<ReturnType<VaultInspection['read']>>>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.read(args, signal))
  }

  async list(
    args: VaultListArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<VaultListResult>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.list(args, signal))
  }

  async links(
    args: VaultLinksArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<VaultLinksResult>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.links(args, signal))
  }

  async outline(
    args: VaultOutlineArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<VaultOutlineResult>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.outline(args, signal))
  }

  async graph(
    args: VaultGraphArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<VaultGraphResult>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.graph(args, signal))
  }

  async canvas(
    args: VaultCanvasArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<VaultCanvasResult>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.canvas(args, signal))
  }

  async facets(
    args: VaultFacetsArgs,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultInspectionRuntimeResult<VaultFacetsResult>> {
    return await this.runInspection(expectedVault, signal, inspection => inspection.facets(args, signal))
  }

  private async runDraftOperation<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.draftOperations.get(key) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    const settled = current.then(() => undefined, () => undefined)
    this.draftOperations.set(key, settled)
    try {
      return await current
    } finally {
      if (this.draftOperations.get(key) === settled) this.draftOperations.delete(key)
    }
  }

  async saveDraft(
    request: SaveDraftRequest,
    signal: AbortSignal,
  ): Promise<DraftMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Draft storage is not configured')
    }
    const relativePath = normalizeDocumentPath(request.path)
    const filePath = await draftFilePath(
      this.stateRoot,
      { id: state.id, generation: state.generation },
      relativePath,
      true,
    )
    if (filePath === null) throw new NoteVaultError('recovery-unavailable', 'Draft storage is unavailable')
    return await this.runDraftOperation(filePath, async () => {
      signal.throwIfAborted()
      this.assertCapturedVault(state, root)
      const updatedAt = Date.now()
      const record: DraftRecord = {
        content: request.content,
        path: relativePath,
        ...(request.revision === undefined ? {} : { revision: request.revision }),
        updatedAt,
      }
      const data = Buffer.from(JSON.stringify(record), 'utf8')
      if (data.byteLength > this.maxDraftBytes) {
        throw new NoteVaultError('too-large', 'Draft exceeds the configured byte limit')
      }
      await writeDocumentAtomic(filePath, data, false, async () => {
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
      })
      return { generation: state.generation, ok: true, updatedAt }
    })
  }

  async readDraft(
    request: DraftRequest,
    signal: AbortSignal,
  ): Promise<DraftResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Draft storage is not configured')
    }
    const relativePath = normalizeDocumentPath(request.path)
    const key = await draftFilePath(
      this.stateRoot,
      { id: state.id, generation: state.generation },
      relativePath,
      false,
    ) ?? `${this.stateRoot}:${state.id}:${relativePath}`
    return await this.runDraftOperation(key, async () => {
      const draft = await readDraftRecord(
        this.stateRoot!,
        { id: state.id, generation: state.generation },
        relativePath,
        this.maxDraftBytes,
      )
      this.assertCapturedVault(state, root)
      signal.throwIfAborted()
      return { draft, generation: state.generation }
    })
  }

  async clearDraft(
    request: DraftRequest,
    signal: AbortSignal,
  ): Promise<DraftMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Draft storage is not configured')
    }
    const relativePath = normalizeDocumentPath(request.path)
    const filePath = await draftFilePath(
      this.stateRoot,
      { id: state.id, generation: state.generation },
      relativePath,
      false,
    )
    const key = filePath ?? `${this.stateRoot}:${state.id}:${relativePath}`
    return await this.runDraftOperation(key, async () => {
      signal.throwIfAborted()
      this.assertCapturedVault(state, root)
      if (filePath !== null) await rm(filePath, { force: true })
      return { generation: state.generation, ok: true }
    })
  }

  async openDocument(
    requestedPath: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<OpenDocumentResult> {
    const { root, state } = this.captureExpectedVault(expectedVault)
    let document: { content: string; digest: string; path: string; revision: string }
    try {
      document = await readVaultDocument(root, requestedPath, this.maxReadBytes, signal)
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      throw new NoteVaultError('unsafe-target', 'Vault document could not be opened safely')
    }

    this.assertCapturedVault(state, root)
    return { ...document, generation: state.generation }
  }

  async listTree(
    request: ListTreeRequest,
    signal: AbortSignal,
  ): Promise<VaultTreePage> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    const requestedLimit = request.limit ?? this.maxTreeResults
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      throw new NoteVaultError('invalid-path', 'Vault tree limit must be a positive integer')
    }
    const limit = Math.min(requestedLimit, this.maxTreeResults)
    const key = treeCursorKey(request.expectedVault, this.treeConfig.maxEntries, this.treeConfig.maxDepth)
    const cursor = decodeTreeCursor(request.cursor, key, this.treeConfig.maxEntries)
    let scan: Awaited<ReturnType<typeof scanVaultTree>>
    try {
      scan = await scanVaultTree(root, this.treeConfig, signal)
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      throw new NoteVaultError('unsafe-target', 'Vault tree could not be scanned safely')
    }
    this.assertCapturedVault(state, root)
    const fingerprint = treeFingerprint(scan)
    if (cursor.fingerprint !== null && cursor.fingerprint !== fingerprint) {
      throw new NoteVaultError('changed', 'Vault tree changed between cursor pages')
    }
    if (cursor.offset > scan.entries.length) {
      throw new NoteVaultError('invalid-path', 'Invalid vault tree cursor')
    }

    const entries = scan.entries.slice(cursor.offset, cursor.offset + limit)
    const hasMore = cursor.offset + entries.length < scan.entries.length
    const truncated = scan.truncationReason !== null || hasMore
    return {
      complete: !truncated,
      cursor: hasMore ? encodeTreeCursor(cursor.offset + entries.length, key, fingerprint) : null,
      entries,
      generation: state.generation,
      scan: { entries: scan.scanned },
      truncated,
      truncationReason: scan.truncationReason ?? (hasMore ? 'result-limit' : null),
      warnings: scan.warnings,
    }
  }

  async listPassiveBackupEntries(
    request: ListPassiveBackupEntriesRequest,
    signal: AbortSignal,
  ): Promise<PassiveBackupListResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    try {
      const entries = await scanPassiveBackupEntries(root, this.treeConfig, signal)
      this.assertCapturedVault(state, root)
      return { entries, generation: state.generation }
    } catch (error) {
      this.assertCapturedVault(state, root)
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) throw error
      throw new NoteVaultError('unsafe-target', 'Passive backup entries could not be listed safely')
    }
  }

  async readPassiveBackupEntry(
    request: ReadPassiveBackupEntryRequest,
    signal: AbortSignal,
  ): Promise<PassiveBackupContentResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    try {
      const entry = await readPassiveBackupFile(root, request, signal)
      this.assertCapturedVault(state, root)
      return { ...entry, generation: state.generation }
    } catch (error) {
      this.assertCapturedVault(state, root)
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NoteVaultError('not-found', 'Passive backup entry not found')
      }
      throw new NoteVaultError('unsafe-target', 'Passive backup entry could not be read safely')
    }
  }

  async restorePassiveBackupEntry(
    request: RestorePassiveBackupEntryRequest,
    signal: AbortSignal,
  ): Promise<PassiveBackupMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (NOFOLLOW === 0) {
      throw new NoteVaultError('unavailable', 'Passive backup requires no-follow file access')
    }
    if (!(request.data instanceof Uint8Array)) {
      throw new NoteVaultError('invalid-content', 'Passive backup data must be a byte array')
    }
    if (request.data.byteLength > MAX_PASSIVE_BACKUP_ENTRY_BYTES) {
      throw new NoteVaultError('too-large', 'Passive backup data exceeds the configured byte limit')
    }
    const relativePath = normalizePassiveBackupPath(request.path)
    const candidate = path.join(root, ...relativePath.split('/'))
    assertInside(root, candidate)
    let committed = false
    try {
      const parent = await ensurePassiveBackupParent(root, relativePath, this.treeConfig.maxEntries)
      const data = Buffer.from(request.data)
      await writeDocumentAtomic(candidate, data, true, async () => {
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
        await assertDestinationParentBound(root, parent)
        await assertPassiveDestinationUnaliased(root, relativePath, this.treeConfig.maxEntries)
      })
      committed = true
      const claimed = await lstat(candidate, { bigint: true })
      const entry = await readPassiveBackupFile(root, {
        expectedRevision: fileRevision(claimed),
        expectedVault: request.expectedVault,
        path: relativePath,
      }, POST_COMMIT_SIGNAL)
      await assertPassiveDestinationUnaliased(root, relativePath, this.treeConfig.maxEntries)
      this.assertCapturedVault(state, root)
      if (entry.digest !== `sha256:${createHash('sha256').update(data).digest('hex')}`) {
        throw new NoteVaultError('partial', 'Passive backup entry was restored with unexpected bytes')
      }
      const result: PassiveBackupMutationResult = {
        digest: entry.digest,
        generation: state.generation,
        path: entry.path,
        revision: entry.revision,
        size: entry.size,
        status: 'restored',
      }
      this.emitEntryChange('stored', result.path, state)
      return result
    } catch (error) {
      if (committed) throw new NoteVaultError('partial', 'Passive backup entry was restored but could not be inspected')
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) throw error
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteVaultError('exists', 'A passive backup entry already exists at that path')
      }
      throw new NoteVaultError('unsafe-target', 'Passive backup entry could not be restored safely')
    }
  }

  private async moveAttachmentInternal(
    request: FileMutationRequest,
    signal: AbortSignal,
  ): Promise<FileMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    const source = await resolveAttachmentTarget(root, request.fromPath)
    const toPath = normalizeEntryPath(request.toPath)
    if (
      attachmentKind(toPath) === null
      || path.extname(toPath).toLowerCase() !== path.extname(source.relativePath).toLowerCase()
    ) {
      throw new NoteVaultError('unsupported-type', 'Attachment destinations must keep the same file type')
    }
    const destinationPath = path.join(root, ...toPath.split('/'))
    assertInside(root, destinationPath)
    await assertNoDirectorySymlinks(root, destinationPath)
    assertInside(root, await realpath(path.dirname(destinationPath)))
    if (destinationPath === source.candidate) {
      throw new NoteVaultError('invalid-path', 'Source and destination paths must be different')
    }
    if (entryRevision(source.alias, source.aliasEntry, source.targetEntry) !== request.expectedRevision) {
      throw new NoteVaultError('conflict', 'The source attachment changed before the operation')
    }
    let created: FileIdentity | null = null
    try {
      created = await createMovedFileEntry(source, destinationPath)
      try {
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
        const current = await resolveAttachmentTarget(root, source.relativePath)
        const unchanged = source.alias
          ? entryRevision(current.alias, current.aliasEntry, current.targetEntry)
            === request.expectedRevision
          : sameFileIdentity(source.targetEntry, current.targetEntry)
            && source.targetEntry.size === current.targetEntry.size
            && source.targetEntry.mtimeNs === current.targetEntry.mtimeNs
        if (!unchanged) {
          throw new NoteVaultError('conflict', 'The source attachment changed before the operation')
        }
        await unlink(source.candidate)
      } catch (error) {
        if (!await rollbackCreatedEntry(destinationPath, created)) {
          throw new NoteVaultError('partial', 'Attachment move retained both source and destination')
        }
        throw error
      }
      await bestEffortFsync(path.dirname(source.candidate))
      await bestEffortFsync(path.dirname(destinationPath))
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) throw error
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteVaultError('exists', 'An attachment already exists at the destination path')
      }
      throw new NoteVaultError('unsafe-target', 'Vault attachment could not be moved safely')
    }
    const moved = await resolveAttachmentTarget(root, toPath)
    return {
      fromPath: source.relativePath,
      generation: state.generation,
      path: toPath,
      revision: entryRevision(moved.alias, moved.aliasEntry, moved.targetEntry),
      status: 'moved',
    }
  }

  private async moveFileInternal(
    request: FileMutationRequest,
    signal: AbortSignal,
    emitEvent: boolean,
  ): Promise<FileMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    let source: ResolvedDocumentTarget
    let destination: Awaited<ReturnType<typeof resolveFileDestination>>
    let created: FileIdentity | null = null
    try {
      source = await resolveDocumentTarget(root, request.fromPath)
      destination = await resolveFileDestination(root, request.toPath, source)
      await assertFileEntryUnchanged(root, source, request.expectedRevision)
      signal.throwIfAborted()
      this.assertCapturedVault(state, root)
      created = await createMovedFileEntry(source, destination.candidate)
      try {
        await assertDestinationParentBound(root, destination.parentBinding)
        await assertClaimedEntryConfined(root, destination.candidate, created)
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
        await assertFileEntryUnchanged(root, source, request.expectedRevision, !source.alias)
        await unlink(source.candidate)
      } catch (error) {
        if (!await rollbackCreatedEntry(destination.candidate, created)) {
          throw new NoteVaultError('partial', 'The file move did not finish and its destination was retained')
        }
        throw error
      }
      await bestEffortFsync(path.dirname(source.candidate))
      if (path.dirname(source.candidate) !== path.dirname(destination.candidate)) {
        await bestEffortFsync(path.dirname(destination.candidate))
      }
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteVaultError('exists', 'A file already exists at the destination path')
      }
      throw new NoteVaultError('unsafe-target', 'Vault file could not be moved safely')
    }

    try {
      const moved = await resolveDocumentTarget(root, destination.relativePath)
      const result: FileMutationResult = {
        fromPath: source.relativePath,
        generation: state.generation,
        path: destination.relativePath,
        revision: entryRevision(moved.alias, moved.aliasEntry, moved.targetEntry),
        status: 'moved',
      }
      if (emitEvent) this.emitFileMutation('moved', result.fromPath, result.path, state)
      return result
    } catch {
      throw new NoteVaultError('partial', 'The file was moved but could not be inspected')
    }
  }

  async moveFile(
    request: FileMutationRequest,
    signal: AbortSignal,
  ): Promise<FileMutationResult> {
    return await this.moveFileInternal(request, signal, true)
  }

  async duplicateFile(
    request: FileMutationRequest,
    signal: AbortSignal,
  ): Promise<FileMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    let source: ResolvedDocumentTarget
    let destination: Awaited<ReturnType<typeof resolveFileDestination>>
    let created: FileIdentity | null = null
    try {
      source = await resolveDocumentTarget(root, request.fromPath)
      destination = await resolveFileDestination(root, request.toPath, source)
      await assertFileEntryUnchanged(root, source, request.expectedRevision)
      signal.throwIfAborted()
      this.assertCapturedVault(state, root)
      created = await createDuplicatedFileEntry(source, destination.candidate)
      try {
        await assertDestinationParentBound(root, destination.parentBinding)
        await assertClaimedEntryConfined(root, destination.candidate, created)
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
        await assertFileEntryUnchanged(root, source, request.expectedRevision)
        const sourceDocument = await readVaultDocument(
          root,
          source.relativePath,
          this.maxReadBytes,
          signal,
        )
        const destinationDocument = await readVaultDocument(
          root,
          destination.relativePath,
          this.maxReadBytes,
          signal,
        )
        this.assertCapturedVault(state, root)
        if (sourceDocument.digest !== destinationDocument.digest) {
          throw new NoteVaultError('changed', 'The source document changed while it was duplicated')
        }
      } catch (error) {
        if (!await rollbackCreatedEntry(destination.candidate, created)) {
          throw new NoteVaultError(
            'partial',
            'The file duplicate did not finish and its destination was retained',
          )
        }
        throw error
      }
      await bestEffortFsync(path.dirname(destination.candidate))
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteVaultError('exists', 'A file already exists at the destination path')
      }
      throw new NoteVaultError('unsafe-target', 'Vault file could not be duplicated safely')
    }

    try {
      const duplicated = await resolveDocumentTarget(root, destination.relativePath)
      const result: FileMutationResult = {
        fromPath: source.relativePath,
        generation: state.generation,
        path: destination.relativePath,
        revision: entryRevision(duplicated.alias, duplicated.aliasEntry, duplicated.targetEntry),
        status: 'duplicated',
      }
      this.emitFileMutation('duplicated', result.fromPath, result.path, state)
      return result
    } catch {
      throw new NoteVaultError('partial', 'The file was duplicated but could not be inspected')
    }
  }

  private async mutateFolder(
    request: FolderMutationRequest,
    signal: AbortSignal,
    status: 'duplicated' | 'moved',
    emitEvent = true,
  ): Promise<FolderMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    const fromPath = normalizeEntryPath(request.fromPath)
    const toPath = normalizeEntryPath(request.toPath)
    const sourceCandidate = path.join(root, ...fromPath.split('/'))
    const destinationCandidate = path.join(root, ...toPath.split('/'))
    assertInside(root, sourceCandidate)
    assertInside(root, destinationCandidate)
    await assertNoDirectorySymlinks(root, sourceCandidate)
    await assertNoDirectorySymlinks(root, destinationCandidate)
    const sourceEntry = await lstat(sourceCandidate)
    if (sourceEntry.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Folder operations do not follow directory symbolic links')
    }
    const sourceRoot = await realpath(sourceCandidate)
    assertInside(root, sourceRoot)
    assertInside(root, await realpath(path.dirname(destinationCandidate)))
    if (isInside(sourceRoot, destinationCandidate)) {
      throw new NoteVaultError('invalid-path', 'A folder destination cannot be inside its source')
    }
    const sourceInfo = await lstat(sourceRoot, { bigint: true })
    if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Folder operations require a regular directory')
    }
    if (fileRevision(sourceInfo) !== request.expectedRevision) {
      throw new NoteVaultError('conflict', 'The source folder changed before the operation')
    }

    const manifestConfig = {
      ...this.treeConfig,
      maxBytes: this.maxFolderBytes,
    }
    const sourceManifest = await buildFolderManifest(root, sourceRoot, manifestConfig, signal)
    if (sourceManifest.rootRevision !== request.expectedRevision) {
      throw new NoteVaultError('conflict', 'The source folder changed before the operation')
    }
    const sourceFingerprint = folderManifestFingerprint(sourceManifest)
    const contentFingerprint = folderContentFingerprint(sourceManifest)
    let destinationCreated = false
    try {
      await copyFolderManifest(
        sourceManifest,
        root,
        sourceRoot,
        destinationCandidate,
        signal,
        () => this.assertCapturedVault(state, root),
        () => { destinationCreated = true },
      )
      this.assertCapturedVault(state, root)
      const verifiedSource = await buildFolderManifest(root, sourceRoot, manifestConfig, signal)
      const verifiedDestination = await buildFolderManifest(
        root,
        destinationCandidate,
        manifestConfig,
        signal,
      )
      if (
        folderManifestFingerprint(verifiedSource) !== sourceFingerprint
        || folderContentFingerprint(verifiedDestination) !== contentFingerprint
      ) {
        throw new NoteVaultError('changed', 'Folder contents changed during the operation')
      }

      if (status === 'moved') {
        const quarantinePath = temporaryPathFor(sourceRoot)
        await rename(sourceRoot, quarantinePath)
        try {
          const quarantined = await buildFolderManifest(root, quarantinePath, manifestConfig, signal)
          this.assertCapturedVault(state, root)
          if (folderContentFingerprint(quarantined) !== contentFingerprint) {
            throw new NoteVaultError('changed', 'Folder contents changed before source removal')
          }
        } catch (error) {
          try {
            await rename(quarantinePath, sourceRoot)
          } catch {
            throw new NoteVaultError(
              'partial',
              `Folder move was interrupted; partial destination ${toPath} and source recovery remain`,
            )
          }
          throw error
        }
        await rm(quarantinePath, { recursive: true })
        await bestEffortFsync(path.dirname(sourceRoot))
      }
      await bestEffortFsync(path.dirname(destinationCandidate))
    } catch (error) {
      if (destinationCreated) {
        throw new NoteVaultError(
          'partial',
          `Folder ${status === 'moved' ? 'move' : 'duplicate'} was interrupted; partial destination ${toPath} was retained`,
        )
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteVaultError('exists', 'A file or folder already exists at the destination path')
      }
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      throw new NoteVaultError('unsafe-target', 'Vault folder operation failed safely')
    }

    const destinationInfo = await lstat(destinationCandidate, { bigint: true })
    const result: FolderMutationResult = {
      fromPath,
      generation: state.generation,
      path: toPath,
      revision: fileRevision(destinationInfo),
      status,
    }
    if (emitEvent) this.emitFileMutation(status, result.fromPath, result.path, state)
    return result
  }

  async duplicateFolder(
    request: FolderMutationRequest,
    signal: AbortSignal,
  ): Promise<FolderMutationResult> {
    return await this.mutateFolder(request, signal, 'duplicated')
  }

  async moveFolder(
    request: FolderMutationRequest,
    signal: AbortSignal,
  ): Promise<FolderMutationResult> {
    return await this.mutateFolder(request, signal, 'moved')
  }

  private async completePathRewritePlan(
    args: Omit<VaultPathRewriteArgs, 'cursor'>,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<VaultPathRewriteUpdate[]> {
    const { root, state } = this.captureExpectedVault(expectedVault)
    const inspection = this.createInspection(expectedVault, this.treeConfig.maxEntries)
    const updates: VaultPathRewriteUpdate[] = []
    const seenCursors = new Set<string>()
    let cursor: string | undefined
    while (true) {
      signal.throwIfAborted()
      const page: VaultPathRewriteResult = await inspection.planPathRewrite({
        ...args,
        ...(cursor === undefined ? {} : { cursor }),
      }, signal)
      this.assertCapturedVault(state, root)
      updates.push(...page.updates)
      if (page.cursor === null) {
        if (!page.complete || page.truncated) {
          const detail = page.warnings[0] ?? 'The shared path rewrite plan was incomplete'
          throw new NoteVaultError('changed', detail)
        }
        break
      }
      if (
        page.complete
        || !page.truncated
        || page.truncationReason !== 'result-limit'
        || seenCursors.has(page.cursor)
      ) {
        throw new NoteVaultError('changed', 'The shared path rewrite cursor was inconsistent')
      }
      seenCursors.add(page.cursor)
      cursor = page.cursor
      if (updates.length > this.treeConfig.maxEntries) {
        throw new NoteVaultError('too-large', 'The shared path rewrite plan exceeded the entry limit')
      }
    }
    const seenPaths = new Set<string>()
    let updateBytes = 0
    for (const update of updates) {
      signal.throwIfAborted()
      const updatePath = normalizeDocumentPath(update.path)
      if (seenPaths.has(updatePath)) {
        throw new NoteVaultError('changed', 'The shared path rewrite plan contained duplicate updates')
      }
      seenPaths.add(updatePath)
      if (typeof update.newContent !== 'string') {
        throw new NoteVaultError('invalid-content', 'The shared path rewrite plan returned invalid content')
      }
      const bytes = Buffer.byteLength(update.newContent, 'utf8')
      if (bytes > this.maxReadBytes) {
        throw new NoteVaultError('too-large', 'A planned link rewrite exceeded the document byte limit')
      }
      updateBytes += bytes
      if (updateBytes > DEFAULT_MAX_INSPECTION_BYTES) {
        throw new NoteVaultError('too-large', 'The shared path rewrite plan exceeded the aggregate byte limit')
      }
      if (typeof update.revision !== 'string' || update.revision === '') {
        throw new NoteVaultError('changed', 'A planned link rewrite had no source revision')
      }
    }
    return updates
  }

  private async documentPathsByCanonicalTarget(
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<Map<string, string[]>> {
    const paths = new Map<string, string[]>()
    const seenCursors = new Set<string>()
    let cursor: string | null | undefined
    while (true) {
      const page = await this.listTree({
        expectedVault,
        ...(cursor === undefined ? {} : { cursor }),
      }, signal)
      for (const entry of page.entries) {
        signal.throwIfAborted()
        if (entry.kind !== 'document') continue
        const { root } = this.captureExpectedVault(expectedVault)
        const target = await resolveDocumentTarget(root, entry.path)
        const logicalPaths = paths.get(target.canonical) ?? []
        logicalPaths.push(entry.path)
        paths.set(target.canonical, logicalPaths)
      }
      if (page.cursor === null) {
        if (!page.complete || page.truncated) {
          throw new NoteVaultError('changed', 'The vault inventory was incomplete before link rewrites')
        }
        break
      }
      if (seenCursors.has(page.cursor)) {
        throw new NoteVaultError('changed', 'The vault inventory repeated a cursor')
      }
      seenCursors.add(page.cursor)
      cursor = page.cursor
    }
    for (const logicalPaths of paths.values()) logicalPaths.sort(compareVaultPaths)
    return paths
  }

  private async preparePathRewrites(
    updates: VaultPathRewriteUpdate[],
    args: Omit<VaultPathRewriteArgs, 'cursor'>,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<{ error?: string; selected: SelectedPathRewrite[] }> {
    const { root, state } = this.captureExpectedVault(expectedVault)
    const aliases = await this.documentPathsByCanonicalTarget(expectedVault, signal)
    const bound: BoundPathRewriteUpdate[] = []
    for (const update of updates) {
      signal.throwIfAborted()
      const postMovePath = normalizeDocumentPath(update.path)
      const preMovePath = normalizeDocumentPath(preMoveReferrerPath(
        postMovePath,
        args.oldPath,
        args.newPath,
        args.isDirectory,
      ))
      const target = await resolveDocumentTarget(root, preMovePath)
      await assertFileEntryUnchanged(root, target, update.revision!)
      const document = await readVaultDocument(root, preMovePath, this.maxReadBytes, signal)
      await assertFileEntryUnchanged(root, target, update.revision!)
      bound.push({
        canonicalPath: target.canonical,
        digest: document.digest,
        newContent: update.newContent,
        originalContent: document.content,
        postMovePath,
        preMovePath,
      })
    }
    this.assertCapturedVault(state, root)

    const updatesByCanonical = new Map<string, BoundPathRewriteUpdate[]>()
    for (const update of bound) {
      const group = updatesByCanonical.get(update.canonicalPath) ?? []
      group.push(update)
      updatesByCanonical.set(update.canonicalPath, group)
    }
    const selected: SelectedPathRewrite[] = []
    const skipped: string[] = []
    for (const [canonicalPath, group] of updatesByCanonical) {
      signal.throwIfAborted()
      const logicalPaths = aliases.get(canonicalPath) ?? group.map(update => update.preMovePath)
      const updateByPreMovePath = new Map(group.map(update => [update.preMovePath, update]))
      const originalContent = group[0]!.originalContent
      const desiredContents = new Set(logicalPaths.map(logicalPath => (
        updateByPreMovePath.get(logicalPath)?.newContent ?? originalContent
      )))
      let writer: BoundPathRewriteUpdate | undefined
      let rewritten: BoundPathRewriteUpdate[]
      if (desiredContents.size === 1) {
        writer = [...group].sort((left, right) => compareVaultPaths(
          left.postMovePath,
          right.postMovePath,
        ))[0]
        rewritten = group
      } else {
        const canonicalRelativePath = path.relative(root, canonicalPath).split(path.sep).join('/')
        writer = group.find(update => update.preMovePath === canonicalRelativePath)
        rewritten = writer === undefined ? [] : [writer]
        skipped.push(...group.filter(update => update !== writer).map(update => update.postMovePath))
      }
      if (writer === undefined) continue
      selected.push({
        logicalPaths: rewritten.map(update => update.postMovePath).sort(compareVaultPaths),
        newContent: writer.newContent,
        originalContent: writer.originalContent,
        originalDigest: writer.digest,
        snapshotPath: writer.preMovePath,
        writerPath: writer.postMovePath,
      })
    }
    selected.sort((left, right) => compareVaultPaths(left.writerPath, right.writerPath))
    skipped.sort(compareVaultPaths)
    const skippedSummary = skipped.length <= 10
      ? skipped.join(', ')
      : `${skipped.slice(0, 10).join(', ')} and ${String(skipped.length - 10)} more`
    const skippedError = `Skipped physically conflicting alias rewrites: ${skippedSummary}`
    return {
      ...(skipped.length === 0 ? {} : {
        error: skippedError.length <= 240 ? skippedError : `${skippedError.slice(0, 237)}...`,
      }),
      selected,
    }
  }

  private async moveWithLinkRewrite(
    request: FileMutationRequest,
    signal: AbortSignal,
    isDirectory: boolean,
  ): Promise<FileMoveWithLinkRewriteResult | FolderMoveWithLinkRewriteResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    const oldPath = isDirectory
      ? normalizeEntryPath(request.fromPath)
      : normalizeDocumentPath(request.fromPath)
    const newPath = isDirectory
      ? normalizeEntryPath(request.toPath)
      : normalizeDocumentPath(request.toPath)
    const args = { isDirectory, newPath, oldPath }
    const updates = await this.completePathRewritePlan(args, request.expectedVault, signal)
    if (updates.length > 0 && this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Recovery storage is required before applying link rewrites')
    }
    if (!isDirectory && /\.md$/iu.test(oldPath)) {
      const sidecarPath = path.join(root, ...`${oldPath.replace(/\.md$/iu, '')}-md-images`.split('/'))
      try {
        const sidecar = await lstat(sidecarPath)
        if (sidecar.isDirectory() && !sidecar.isSymbolicLink()) {
          throw new NoteVaultError(
            'unsupported-type',
            'Move with link rewrites cannot leave a Markdown sidecar folder behind',
          )
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    const prepared = updates.length === 0
      ? { selected: [] }
      : await this.preparePathRewrites(
          updates,
          args,
          request.expectedVault,
          signal,
        )
    const rewriteSnapshots: LinkRewriteSnapshot[] = []
    for (const rewrite of prepared.selected) {
      const snapshot = await this.captureRecoverySnapshot(
        rewrite.snapshotPath,
        rewrite.originalContent,
        state,
        'pre-link-rewrite',
      )
      rewriteSnapshots.push({ path: rewrite.snapshotPath, snapshotId: snapshot.id })
    }
    const normalizedRequest = {
      ...request,
      fromPath: oldPath,
      toPath: newPath,
    }
    const moved = isDirectory
      ? await this.mutateFolder(normalizedRequest, signal, 'moved')
      : await this.moveFileInternal(normalizedRequest, signal, true)
    const rewrittenPaths: string[] = []
    let rewriteError = prepared.error
    for (const rewrite of prepared.selected) {
      try {
        signal.throwIfAborted()
        const current = await this.openDocument(rewrite.writerPath, request.expectedVault, signal)
        if (current.digest !== rewrite.originalDigest) {
          throw new NoteVaultError('conflict', `Referrer ${rewrite.writerPath} changed after the move`)
        }
        const saved = await this.saveDocument({
          content: rewrite.newContent,
          expectedRevision: current.revision,
          expectedVault: request.expectedVault,
          path: rewrite.writerPath,
        }, signal)
        if (saved.status !== 'saved') throw new Error('Link rewrite did not save an existing document')
        rewrittenPaths.push(...rewrite.logicalPaths)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Could not rewrite note links'
        rewriteError = appendRewriteError(rewriteError, detail)
        break
      }
    }
    rewrittenPaths.sort(compareVaultPaths)
    let revision = moved.revision
    if (!isDirectory) {
      try {
        revision = (await this.openDocument(moved.path, request.expectedVault, signal)).revision
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Could not inspect the moved entry'
        rewriteError = appendRewriteError(rewriteError, detail)
      }
    }
    return {
      ...moved,
      revision,
      rewriteSnapshots,
      rewrittenPaths,
      ...(rewriteError === undefined ? {} : { rewriteError }),
    }
  }

  async moveFileWithLinkRewrite(
    request: FileMutationRequest,
    signal: AbortSignal,
  ): Promise<FileMoveWithLinkRewriteResult> {
    return await this.moveWithLinkRewrite(request, signal, false) as FileMoveWithLinkRewriteResult
  }

  async moveFolderWithLinkRewrite(
    request: FolderMutationRequest,
    signal: AbortSignal,
  ): Promise<FolderMoveWithLinkRewriteResult> {
    return await this.moveWithLinkRewrite(request, signal, true) as FolderMoveWithLinkRewriteResult
  }

  private async captureRecoverySnapshot(
    path: string,
    content: string,
    state: Extract<NoteVaultState, { active: true }>,
    reason: string,
  ): Promise<SnapshotInfo> {
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Recovery storage is required before overwriting documents')
    }
    try {
      return await captureSnapshotRecord(
        this.stateRoot,
        { id: state.id, generation: state.generation },
        path,
        content,
        reason,
        this.maxReadBytes,
        this.snapshotLimit,
        this.snapshotRetentionDays,
      )
    } catch (error) {
      if (error instanceof NoteVaultError) throw error
      throw new NoteVaultError('recovery-unavailable', 'Could not capture a recovery snapshot')
    }
  }

  async listSnapshots(
    request: ListSnapshotsRequest,
    signal: AbortSignal,
  ): Promise<SnapshotListResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Recovery storage is not configured')
    }
    const relativePath = normalizeDocumentPath(request.path)
    const records = await listSnapshotRecords(
      this.stateRoot,
      { id: state.id, generation: state.generation },
      relativePath,
      this.maxReadBytes,
    )
    this.assertCapturedVault(state, root)
    signal.throwIfAborted()
    return { generation: state.generation, snapshots: records.map(record => record.info) }
  }

  async readSnapshot(
    request: ReadSnapshotRequest,
    signal: AbortSignal,
  ): Promise<SnapshotContentResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Recovery storage is not configured')
    }
    const relativePath = normalizeDocumentPath(request.path)
    const record = await readSnapshotRecord(
      this.stateRoot,
      { id: state.id, generation: state.generation },
      relativePath,
      request.snapshotId,
      this.maxReadBytes,
    )
    this.assertCapturedVault(state, root)
    signal.throwIfAborted()
    return {
      content: record.body.toString('utf8'),
      generation: state.generation,
      snapshot: record.info,
    }
  }

  async captureSnapshot(
    request: CaptureSnapshotRequest,
    signal: AbortSignal,
  ): Promise<SnapshotMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    const relativePath = normalizeDocumentPath(request.path)
    const reason = request.reason?.trim() || 'manual'
    if (reason.length > 200) throw new NoteVaultError('invalid-content', 'Snapshot reason is too long')
    const snapshot = await this.captureRecoverySnapshot(relativePath, request.content, state, reason)
    this.assertCapturedVault(state, root)
    signal.throwIfAborted()
    return { generation: state.generation, snapshot }
  }

  async clearSnapshots(
    request: ListSnapshotsRequest,
    signal: AbortSignal,
  ): Promise<SnapshotMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) throw new NoteVaultError('recovery-unavailable', 'Recovery storage is not configured')
    const relativePath = normalizeDocumentPath(request.path)
    const records = await listSnapshotRecords(this.stateRoot, { id: state.id, generation: state.generation }, relativePath, this.maxReadBytes)
    for (const record of records) {
      signal.throwIfAborted()
      this.assertCapturedVault(state, root)
      await rm(record.bodyPath, { force: true })
      await rm(record.metaPath, { force: true })
    }
    this.assertCapturedVault(state, root)
    return { generation: state.generation, removed: records.length }
  }

  async restoreSnapshot(
    request: RestoreSnapshotOverwriteRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    const snapshot = await this.readSnapshot(request, signal)
    return await this.saveDocument({
      content: snapshot.content,
      expectedRevision: request.expectedRevision,
      expectedVault: request.expectedVault,
      path: request.path,
    }, signal)
  }

  async restoreSnapshotAsNew(
    request: RestoreSnapshotRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    const snapshot = await this.readSnapshot(request, signal)
    return await this.createDocument({
      content: snapshot.content,
      expectedVault: request.expectedVault,
      path: request.toPath,
    }, signal)
  }

  async trashEntry(
    request: TrashEntryRequest,
    signal: AbortSignal,
  ): Promise<TrashMutationResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Trash metadata storage is not configured')
    }
    const originalPath = normalizeEntryPath(request.path)
    if (originalPath === '.trash' || originalPath.startsWith('.trash/')) {
      throw new NoteVaultError('invalid-path', 'The vault trash cannot be moved into itself')
    }
    const sourcePath = path.join(root, ...originalPath.split('/'))
    assertInside(root, sourcePath)
    await assertNoDirectorySymlinks(root, sourcePath)
    const sourceEntry = await lstat(sourcePath)
    let kind: TrashEntryInfo['kind']
    if (sourceEntry.isDirectory() && !sourceEntry.isSymbolicLink()) {
      kind = 'folder'
    } else if (attachmentKind(originalPath) !== null) {
      kind = 'attachment'
    } else if (documentKind(originalPath) !== null) {
      kind = 'document'
    } else {
      throw new NoteVaultError(
        'unsupported-type',
        'Trash supports only vault documents, attachments, aliases, and folders',
      )
    }

    const trashRoot = path.join(root, '.trash')
    try {
      await mkdir(trashRoot, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const trashRootEntry = await lstat(trashRoot)
    if (!trashRootEntry.isDirectory() || trashRootEntry.isSymbolicLink()) {
      throw new NoteVaultError('unsafe-target', 'Vault trash must be a regular in-vault directory')
    }
    assertInside(root, await realpath(trashRoot))

    const extension = path.posix.extname(originalPath)
    const stem = path.posix.basename(originalPath, extension)
    let mutation: FileMutationResult | FolderMutationResult | null = null
    for (let index = 0; index < 1_000; index += 1) {
      const suffix = index === 0 ? '' : ` ${String(index + 1)}`
      const trashPath = `.trash/${stem}${suffix}${extension}`
      try {
        const moveRequest = {
          expectedRevision: request.expectedRevision,
          expectedVault: request.expectedVault,
          fromPath: originalPath,
          toPath: trashPath,
        }
        mutation = kind === 'folder'
          ? await this.mutateFolder(moveRequest, signal, 'moved', false)
          : kind === 'attachment'
            ? await this.moveAttachmentInternal(moveRequest, signal)
            : await this.moveFileInternal(moveRequest, signal, false)
        break
      } catch (error) {
        if (error instanceof NoteVaultError && error.code === 'exists') continue
        throw error
      }
    }
    if (mutation === null) {
      throw new NoteVaultError('exists', 'Could not find an exclusive vault trash destination')
    }

    const id = `trash-${randomUUID()}`
    const record: TrashRecord = {
      createdAt: Date.now(),
      id,
      kind,
      originalPath,
      revision: mutation.revision,
      trashPath: mutation.path,
    }
    try {
      await writeTrashRecord(
        this.stateRoot,
        { id: state.id, generation: state.generation },
        record,
      )
    } catch {
      try {
        const rollbackRequest = {
          expectedRevision: mutation.revision,
          expectedVault: request.expectedVault,
          fromPath: mutation.path,
          toPath: originalPath,
        }
        if (kind === 'folder') {
          await this.mutateFolder(rollbackRequest, POST_COMMIT_SIGNAL, 'moved', false)
        } else if (kind === 'attachment') {
          await this.moveAttachmentInternal(rollbackRequest, POST_COMMIT_SIGNAL)
        } else {
          await this.moveFileInternal(rollbackRequest, POST_COMMIT_SIGNAL, false)
        }
        throw new NoteVaultError(
          'recovery-unavailable',
          'Trash metadata could not be stored; the entry was restored',
        )
      } catch (rollbackError) {
        if (
          rollbackError instanceof NoteVaultError
          && rollbackError.code === 'recovery-unavailable'
        ) throw rollbackError
        throw new NoteVaultError(
          'partial',
          `Trash entry ${id} was retained at ${mutation.path} after metadata storage failed`,
        )
      }
    }
    const result: TrashMutationResult = {
      createdAt: record.createdAt,
      generation: state.generation,
      id,
      kind,
      originalPath,
      revision: mutation.revision,
      status: 'trashed',
    }
    this.emitFileMutation('trashed', originalPath, originalPath, state)
    return result
  }

  async listTrash(
    request: { expectedVault: VaultReference },
    signal: AbortSignal,
  ): Promise<TrashListResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null) {
      throw new NoteVaultError('recovery-unavailable', 'Trash metadata storage is not configured')
    }
    const records = await listTrashRecords(
      this.stateRoot,
      { id: state.id, generation: state.generation },
    )
    const validRecords = []
    for (const stored of records) {
      signal.throwIfAborted()
      if (await currentTrashRevision(root, stored.record) === stored.record.revision) {
        validRecords.push(stored)
      }
    }
    this.assertCapturedVault(state, root)
    signal.throwIfAborted()
    return {
      entries: validRecords.map(({ record }) => ({
        createdAt: record.createdAt,
        id: record.id,
        kind: record.kind,
        originalPath: record.originalPath,
      })),
      generation: state.generation,
    }
  }

  async restoreTrash(
    request: RestoreTrashRequest,
    signal: AbortSignal,
  ): Promise<RestoreTrashResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (this.stateRoot === null || !validTrashId(request.id)) {
      throw new NoteVaultError('not-found', 'Trash entry not found')
    }
    const records = await listTrashRecords(
      this.stateRoot,
      { id: state.id, generation: state.generation },
    )
    const stored = records.find(candidate => candidate.record.id === request.id)
    if (stored === undefined) throw new NoteVaultError('not-found', 'Trash entry not found')
    const record = stored.record
    if (await currentTrashRevision(root, record) !== record.revision) {
      throw new NoteVaultError('not-found', 'Trash entry not found')
    }
    const toPath = request.toPath === undefined
      ? record.originalPath
      : normalizeEntryPath(request.toPath)
    const moveRequest = {
      expectedRevision: record.revision,
      expectedVault: request.expectedVault,
      fromPath: record.trashPath,
      toPath,
    }
    const mutation = record.kind === 'folder'
      ? await this.mutateFolder(moveRequest, signal, 'moved', false)
      : record.kind === 'attachment'
        ? await this.moveAttachmentInternal(moveRequest, signal)
        : await this.moveFileInternal(moveRequest, signal, false)
    try {
      await rm(stored.metaPath)
    } catch {
      throw new NoteVaultError('partial', `Trash entry was restored to ${toPath} but metadata remained`)
    }
    const result: RestoreTrashResult = {
      createdAt: record.createdAt,
      generation: state.generation,
      id: record.id,
      kind: record.kind,
      originalPath: record.originalPath,
      path: mutation.path,
      revision: mutation.revision,
      status: 'restored',
    }
    this.emitFileMutation('restored', record.originalPath, result.path, state)
    return result
  }

  async inspectAttachment(
    requestedPath: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<AttachmentMetadataResult> {
    const { root, state } = this.captureExpectedVault(expectedVault)
    let attachment: Awaited<ReturnType<typeof inspectVaultAttachment>>
    try {
      attachment = await inspectVaultAttachment(
        root,
        requestedPath,
        this.maxAttachmentBytes,
        signal,
        false,
      )
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      throw new NoteVaultError('unsafe-target', 'Vault attachment could not be inspected safely')
    }
    this.assertCapturedVault(state, root)
    return {
      generation: state.generation,
      mediaKind: attachment.mediaKind,
      mimeType: attachment.mimeType,
      path: attachment.path,
      revision: attachment.revision,
      size: attachment.size,
    }
  }

  async previewAttachment(
    requestedPath: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<AttachmentPreviewResult> {
    const { root, state } = this.captureExpectedVault(expectedVault)
    let attachment: Awaited<ReturnType<typeof inspectVaultAttachment>>
    try {
      attachment = await inspectVaultAttachment(
        root,
        requestedPath,
        this.maxAttachmentBytes,
        signal,
        true,
      )
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      throw new NoteVaultError('unsafe-target', 'Vault attachment could not be previewed safely')
    }
    this.assertCapturedVault(state, root)
    if (attachment.data === null) throw new Error('unreachable attachment preview without data')
    return {
      data: attachment.data,
      digest: `sha256:${createHash('sha256').update(attachment.data).digest('hex')}`,
      generation: state.generation,
      mediaKind: attachment.mediaKind,
      mimeType: attachment.mimeType,
      path: attachment.path,
      revision: attachment.revision,
      size: attachment.size,
    }
  }

  async storeAttachment(
    request: StoreAttachmentRequest,
    signal: AbortSignal,
  ): Promise<StoreAttachmentResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    if (!(request.data instanceof Uint8Array)) {
      throw new NoteVaultError('invalid-content', 'Attachment data must be a byte array')
    }
    if (request.data.byteLength > this.maxAttachmentBytes) {
      throw new NoteVaultError('too-large', 'Attachment data exceeds the configured byte limit')
    }
    const relativePath = normalizeEntryPath(request.path)
    const mediaKind = attachmentKind(relativePath)
    const mimeType = ATTACHMENT_MIME_TYPES.get(path.extname(relativePath).toLowerCase())
    if (mediaKind === null || mimeType === undefined) {
      throw new NoteVaultError(
        'unsupported-type',
        'Vault attachments support accepted image, audio, video, or PDF files only',
      )
    }
    const candidate = path.join(root, ...relativePath.split('/'))
    assertInside(root, candidate)
    let committed = false
    try {
      await assertNoDirectorySymlinks(root, candidate)
      assertInside(root, await realpath(path.dirname(candidate)))
      const data = Buffer.from(request.data)
      await writeDocumentAtomic(candidate, data, true, async () => {
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
        await assertNoDirectorySymlinks(root, candidate)
        assertInside(root, await realpath(path.dirname(candidate)))
      })
      committed = true
      const attachment = await inspectVaultAttachment(
        root,
        relativePath,
        this.maxAttachmentBytes,
        POST_COMMIT_SIGNAL,
        false,
      )
      const result: StoreAttachmentResult = {
        digest: `sha256:${createHash('sha256').update(data).digest('hex')}`,
        generation: state.generation,
        mediaKind,
        mimeType,
        path: attachment.path,
        revision: attachment.revision,
        size: attachment.size,
        status: 'stored',
      }
      this.emitEntryChange('stored', result.path, state)
      return result
    } catch (error) {
      if (committed) {
        throw new NoteVaultError('partial', 'The attachment was stored but could not be inspected')
      }
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteVaultError('exists', 'An attachment already exists at that path')
      }
      throw new NoteVaultError('unsafe-target', 'Vault attachment could not be stored safely')
    }
  }

  async createDocument(
    request: CreateDocumentRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    const data = encodeDocumentContent(request.content, this.maxReadBytes)
    let target: Awaited<ReturnType<typeof resolveNewDocumentTarget>>
    try {
      target = await resolveNewDocumentTarget(root, request.path)
      await writeDocumentAtomic(target.candidate, data, true, async () => {
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
        await assertNoDirectorySymlinks(root, target.candidate)
        assertInside(root, await realpath(path.dirname(target.candidate)))
      })
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteVaultError('exists', 'A document already exists at that path')
      }
      throw new NoteVaultError('unsafe-target', 'Vault document could not be created safely')
    }

    try {
      const document = await readVaultDocument(root, target.relativePath, this.maxReadBytes, POST_COMMIT_SIGNAL)
      const result: WriteDocumentResult = {
        digest: document.digest,
        generation: state.generation,
        path: document.path,
        revision: document.revision,
        status: 'created',
      }
      this.emitEntryChange('created', result.path, state)
      return result
    } catch {
      throw new NoteVaultError('partial', 'The document was created but could not be inspected')
    }
  }

  async saveDocument(
    request: SaveDocumentRequest,
    signal: AbortSignal,
  ): Promise<WriteDocumentResult> {
    const { root, state } = this.captureExpectedVault(request.expectedVault)
    signal.throwIfAborted()
    const data = encodeDocumentContent(request.content, this.maxReadBytes)
    let snapshot: SnapshotInfo
    let target: ResolvedDocumentTarget
    try {
      target = await resolveDocumentTarget(root, request.path)
      if (
        typeof request.expectedRevision !== 'string'
        || fileRevision(target.targetEntry) !== request.expectedRevision
      ) {
        throw new NoteVaultError('conflict', 'The document changed on disk before it could be saved')
      }
      const current = await readVaultDocument(
        root,
        target.relativePath,
        this.maxReadBytes,
        signal,
      )
      if (current.revision !== request.expectedRevision) {
        throw new NoteVaultError('conflict', 'The document changed on disk before it could be saved')
      }
      snapshot = await this.captureRecoverySnapshot(
        target.relativePath,
        current.content,
        state,
        'save',
      )
      this.assertCapturedVault(state, root)
      await writeDocumentAtomic(target.canonical, data, false, async () => {
        signal.throwIfAborted()
        this.assertCapturedVault(state, root)
        await assertWriteTargetUnchanged(root, target, request.expectedRevision)
      })
    } catch (error) {
      if (error instanceof NoteVaultError || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NoteVaultError('conflict', 'The document changed on disk before it could be saved')
      }
      throw new NoteVaultError('unsafe-target', 'Vault document could not be saved safely')
    }

    try {
      const document = await readVaultDocument(root, target.relativePath, this.maxReadBytes, POST_COMMIT_SIGNAL)
      const result: WriteDocumentResult = {
        digest: document.digest,
        generation: state.generation,
        path: document.path,
        revision: document.revision,
        snapshotId: snapshot.id,
        status: 'saved',
      }
      this.emitEntryChange('updated', result.path, state)
      return result
    } catch {
      throw new NoteVaultError('partial', 'The document was saved but could not be inspected')
    }
  }
}

export default NoteVaultRuntime
