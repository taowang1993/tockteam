import { createHash, randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  link,
  lstat,
  realpath,
  unlink,
} from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  MAX_DESKTOP_DESTINATION_CHUNK_BYTES,
  MAX_DESKTOP_GRANT_SESSION_MS,
  MAX_DESKTOP_SOURCE_DEPTH,
  MAX_DESKTOP_SOURCE_ENTRIES,
  MAX_DESKTOP_SOURCE_ENTRY_BYTES,
  MAX_DESKTOP_SOURCE_PAGE_ENTRIES,
  MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES,
  MAX_DESKTOP_SOURCE_TOTAL_BYTES,
  TockTeamDesktopGrantError,
  type BeginDesktopDestinationRequest,
  type BeginDesktopDestinationResult,
  type BeginDesktopSourceRequest,
  type BeginDesktopSourceResult,
  type DesktopCleanupEvidence,
  type DesktopDestinationPlanEntry,
  type DesktopDestinationState,
  type DesktopDestinationTarget,
  type DesktopExportPurpose,
  type DesktopGrantErrorCode,
  type DesktopPickerRequest,
  type DesktopPickerResult,
  type DesktopPrintExportRequest,
  type DesktopRelativeFilePlanEntry,
  type DesktopSafeName,
  type DesktopSafeRelativePath,
  type DesktopSelectedFilePlanEntry,
  type DesktopSourceEntry,
  type DesktopSourceFileEntry,
  type DesktopSourceLimits,
  type DesktopSourcePurpose,
  type DesktopSourceRejectionReason,
  type DesktopSourceRoot,
  type DesktopSourceSession,
  type DesktopDestinationSession,
  type NativeOperationIdentity,
  type ReadDesktopSourceRequest,
  type ReadDesktopSourceResult,
  type ListDesktopSourceRequest,
  type ListDesktopSourceResult,
  type StatDesktopSourceRequest,
  type StatDesktopSourceResult,
  type RevalidateDesktopSourceRequest,
  type RevalidateDesktopSourceResult,
  type ReleaseDesktopSourceRequest,
  type ReleaseDesktopSourceResult,
  type WriteDesktopDestinationChunkRequest,
  type WriteDesktopDestinationChunkResult,
  type FinalizeDesktopDestinationRequest,
  type FinalizeDesktopDestinationResult,
  type AbortDesktopDestinationRequest,
  type AbortDesktopDestinationResult,
} from './host-contract.ts'

export const DESKTOP_PICKER_CHANNEL_PATH = '/tockteam/desktop-picker'

const MAX_ID_BYTES = 256
const MAX_LABEL_BYTES = 512
const MAX_PUBLICATION_NAME_BYTES = 256
const MAX_SOURCE_LIMIT = 1_024 * 1024 * 1024

type Stat = Awaited<ReturnType<typeof lstat>>
type DialogKind = 'open' | 'save'

export interface DesktopPickerDialogOptions {
  kind: DialogKind
  purpose: DesktopPickerRequest['purpose']
  directory: boolean
  file: boolean
  extensions: string[]
}

export interface DesktopPickerDialogResult {
  canceled: boolean
  filePath?: string
}

export type DesktopPickerCheckpoint = 'dialog' | 'read' | 'write' | 'finalize'

export interface DesktopPickerOwnerOptions {
  isAvailable(): boolean
  showOpenDialog(options: DesktopPickerDialogOptions): Promise<DesktopPickerDialogResult>
  showSaveDialog(options: DesktopPickerDialogOptions): Promise<DesktopPickerDialogResult>
  now?: () => number
  randomId?: () => string
  onCheckpoint?: (checkpoint: DesktopPickerCheckpoint, signal: AbortSignal) => Promise<void>
}

interface ActiveVaultBoundary {
  generation: number
  id: string
  path: string
}

interface PendingVaultActivation {
  expiresAt: number
  identity: NativeOperationIdentity
  path: string
}

export interface BeginDesktopVaultActivationRequest {
  authorization: string
  identity: NativeOperationIdentity
}

export interface BeginDesktopVaultActivationResult {
  activationId: string
  canonicalPath: string
}

export interface CommitDesktopVaultActivationRequest {
  activationId: string
  generation: number
  vaultId: string
}

interface Grant {
  identity: NativeOperationIdentity
  path: string
  purpose: DesktopPickerRequest['purpose']
  label: string
  expiresAt: number
}

interface InternalSourceEntry {
  absolutePath: string
  entry: DesktopSourceEntry
  revision: string
  size: number
}

interface SourceSession {
  expiresAt: number
  identity: NativeOperationIdentity
  limits: DesktopSourceLimits
  ordered: InternalSourceEntry[]
  path: string
  purpose: DesktopSourcePurpose
  root: DesktopSourceRoot
  rootRevision: string
  cursors: Map<string, number>
  reads: Map<string, number>
}

interface DestinationEntry {
  absolutePath: string
  digest: string
  entry: DesktopDestinationPlanEntry
  offset: number
  stagedPath?: string
}

interface DestinationSession {
  expiresAt: number
  expectedState: DesktopDestinationState
  identity: NativeOperationIdentity
  label: string
  planDigest: string
  entries: DestinationEntry[]
  path: string
  purpose: DesktopExportPurpose
  stagingRevision: string | undefined
  stagingRoot: string | undefined
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!object(value)) return false
  const allowed = new Set(keys)
  return Object.keys(value).every(key => allowed.has(key))
    && keys.every(key => Object.hasOwn(value, key))
}

function noExtra(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).every(key => keys.includes(key))
}

function text(value: unknown, max = MAX_ID_BYTES): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= max
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function safeRelative(value: unknown, max = MAX_SOURCE_LIMIT): value is string {
  if (!text(value, max) || value.startsWith('/') || /^[A-Za-z]:/u.test(value) || value.includes('\\')) return false
  const parts = value.split('/')
  return parts.every(part => part.length > 0 && part !== '.' && part !== '..')
    && Buffer.byteLength(value, 'utf8') <= MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES
}

function safeName(value: unknown): value is string {
  return safeRelative(value, MAX_PUBLICATION_NAME_BYTES) && !value.includes('/')
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value)
}

function identity(value: unknown): value is NativeOperationIdentity {
  if (!exact(value, ['operationId', 'requestId', 'sessionId', 'vaultGeneration', 'vaultId', 'windowId'])) return false
  if (!text(value.operationId) || !text(value.requestId) || !text(value.windowId) || !text(value.sessionId)) return false
  if (value.vaultId !== null && !text(value.vaultId)) return false
  const generation = value.vaultGeneration
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) return false
  return generation === 0 ? value.vaultId === null : value.vaultId !== null
}

function sameIdentity(left: NativeOperationIdentity, right: NativeOperationIdentity): boolean {
  return left.operationId === right.operationId
    && left.requestId === right.requestId
    && left.windowId === right.windowId
    && left.sessionId === right.sessionId
    && left.vaultId === right.vaultId
    && left.vaultGeneration === right.vaultGeneration
}

function sameVaultBoundary(identity: NativeOperationIdentity, boundary: ActiveVaultBoundary): boolean {
  return identity.vaultGeneration === boundary.generation && identity.vaultId === boundary.id
}

function within(parent: string, candidate: string): boolean {
  const value = relative(parent, candidate)
  return value === '' || value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value)
}

function pathOverlaps(left: string, right: string): boolean {
  return within(left, right) || within(right, left)
}

function safePurpose(value: unknown): value is DesktopPickerRequest['purpose'] {
  return value === 'activate'
    || value === 'markdown-folder'
    || value === 'markdown-zip'
    || value === 'html'
    || value === 'csv'
    || value === 'apple-journal'
    || value === 'bear-backup'
    || value === 'evernote'
    || value === 'google-keep'
    || value === 'roam-research'
    || value === 'textbundle'
    || value === 'restore-backup'
    || value === 'export-html'
    || value === 'export-pdf'
    || value === 'vault-backup'
}

function sourcePurpose(value: DesktopPickerRequest['purpose']): value is DesktopSourcePurpose {
  return value !== 'activate' && value !== 'export-html' && value !== 'export-pdf' && value !== 'vault-backup'
}

function error(code: DesktopGrantErrorCode): never {
  throw new TockTeamDesktopGrantError(code)
}

function cast<T>(value: string): T {
  return value as T
}

function identityOf(stat: Stat): string {
  return `${String(stat.dev)}:${String(stat.ino)}`
}

function revisionOf(stat: Stat): string {
  return createHash('sha256')
    .update([String(stat.dev), String(stat.ino), String(stat.size), String(stat.mtimeMs), String(stat.mode)].join(':'))
    .digest('hex')
}

function kindOf(stat: Stat): 'file' | 'directory' | undefined {
  return stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : undefined
}

function labelOf(path: string): string {
  const label = basename(path)
  return text(label, MAX_LABEL_BYTES) ? label : 'selected-item'
}

function limitsOf(value: unknown): DesktopSourceLimits {
  if (!exact(value, ['maxDepth', 'maxEntries', 'maxEntryBytes', 'maxRelativePathBytes', 'maxTotalBytes'])) return error('limit-exceeded')
  const limits = value as Record<string, unknown>
  const values = [limits.maxDepth, limits.maxEntries, limits.maxEntryBytes, limits.maxRelativePathBytes, limits.maxTotalBytes]
  if (!values.every(item => Number.isSafeInteger(item) && Number(item) > 0)) return error('limit-exceeded')
  if (Number(limits.maxDepth) > MAX_DESKTOP_SOURCE_DEPTH
    || Number(limits.maxEntries) > MAX_DESKTOP_SOURCE_ENTRIES
    || Number(limits.maxEntryBytes) > MAX_DESKTOP_SOURCE_ENTRY_BYTES
    || Number(limits.maxRelativePathBytes) > MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES
    || Number(limits.maxTotalBytes) > MAX_DESKTOP_SOURCE_TOTAL_BYTES) return error('limit-exceeded')
  return {
    maxDepth: Number(limits.maxDepth),
    maxEntries: Number(limits.maxEntries),
    maxEntryBytes: Number(limits.maxEntryBytes),
    maxRelativePathBytes: Number(limits.maxRelativePathBytes),
    maxTotalBytes: Number(limits.maxTotalBytes),
  }
}

function sourceEntryKeys(value: unknown): value is Exclude<DesktopSourceEntry, { kind: 'rejected' }> {
  return object(value)
    && value.kind !== 'rejected'
    && text(value.entryId)
    && text(value.relativePath)
    && text(value.revision)
}

function targetKey(target: DesktopDestinationTarget): string {
  return target.kind === 'selected-file' ? 'selected-file' : target.relativePath
}

function stateValid(value: unknown): value is DesktopDestinationState {
  if (!object(value)) return false
  if (value.status === 'absent') return exact(value, ['status'])
  return value.status === 'existing'
    && exact(value, ['replaceAuthorized', 'revision', 'status'])
    && value.replaceAuthorized === true
    && text(value.revision)
}

function targetValid(value: unknown): value is DesktopDestinationTarget {
  return object(value) && (value.kind === 'selected-file'
    ? exact(value, ['kind'])
    : value.kind === 'relative-file' && exact(value, ['kind', 'relativePath']) && safeRelative(value.relativePath))
}

function stateEqual(left: DesktopDestinationState, right: DesktopDestinationState): boolean {
  if (left.status !== right.status) return false
  return left.status === 'absent' || right.status === 'absent'
    ? left.status === right.status
    : left.replaceAuthorized === right.replaceAuthorized && left.revision === right.revision
}

export class DesktopPickerOwner {
  private readonly options: Required<Pick<DesktopPickerOwnerOptions, 'now' | 'randomId'>> & DesktopPickerOwnerOptions
  private readonly grants = new Map<string, Grant>()
  private readonly sources = new Map<string, SourceSession>()
  private readonly destinations = new Map<string, DestinationSession>()
  private readonly consumedPickOperations = new Set<string>()
  private readonly pendingVaultActivations = new Map<string, PendingVaultActivation>()
  private readonly cleanupTasks = new Set<Promise<DesktopCleanupEvidence>>()
  private activeVault: ActiveVaultBoundary | undefined
  private disposed = false

  constructor(options: DesktopPickerOwnerOptions) {
    this.options = {
      ...options,
      now: options.now ?? (() => Date.now()),
      randomId: options.randomId ?? (() => randomBytes(24).toString('base64url')),
    }
  }

  reopen(): void {
    this.disposed = false
    this.consumedPickOperations.clear()
  }

  async pick(request: DesktopPickerRequest, signal: AbortSignal): Promise<DesktopPickerResult> {
    this.sweep()
    if (!exact(request, ['identity', 'kind', 'purpose']) || !identity(request.identity) || !safePurpose(request.purpose)) return error('unsafe-source')
    const validKind = request.kind === 'vault'
      ? request.purpose === 'activate'
      : request.kind === 'source'
        ? sourcePurpose(request.purpose)
        : request.kind === 'destination'
          ? request.purpose === 'export-html' || request.purpose === 'export-pdf' || request.purpose === 'vault-backup'
          : false
    if (!validKind) return error('purpose-mismatch')
    if (request.kind !== 'vault' && (this.activeVault === undefined || !sameVaultBoundary(request.identity, this.activeVault))) {
      return { operationId: request.identity.operationId, status: 'stale' }
    }
    if (this.consumedPickOperations.has(request.identity.operationId)) {
      return { operationId: request.identity.operationId, status: 'denied' }
    }
    this.consumedPickOperations.add(request.identity.operationId)
    if (this.disposed || !this.options.isAvailable()) return { operationId: request.identity.operationId, status: 'unavailable' }
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    const purpose = request.purpose
    const directory = purpose === 'activate'
      || purpose === 'markdown-folder'
      || purpose === 'restore-backup'
      || purpose === 'vault-backup'
      || purpose === 'html'
      || purpose === 'apple-journal'
      || purpose === 'textbundle'
    const file = purpose !== 'activate'
      && purpose !== 'markdown-folder'
      && purpose !== 'restore-backup'
      && purpose !== 'vault-backup'
    const extensions = purpose === 'export-html' ? ['html']
      : purpose === 'export-pdf' ? ['pdf']
        : purpose === 'markdown-zip' ? ['zip']
          : purpose === 'csv' ? ['csv']
            : purpose === 'bear-backup' ? ['bear2bk']
              : purpose === 'evernote' ? ['enex']
                : purpose === 'google-keep' ? ['zip']
                  : purpose === 'roam-research' ? ['json']
                    : purpose === 'textbundle' ? ['textpack', 'textbundle', 'zip']
                      : []
    const result = purpose === 'export-html' || purpose === 'export-pdf'
      ? await this.options.showSaveDialog({ kind: 'save', purpose, directory: false, file: true, extensions })
      : await this.options.showOpenDialog({ kind: 'open', purpose, directory, file, extensions })
    await this.options.onCheckpoint?.('dialog', signal)
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    if (this.disposed || !this.options.isAvailable()) return { operationId: request.identity.operationId, status: 'unavailable' }
    if (result.canceled || result.filePath === undefined) return { operationId: request.identity.operationId, status: 'cancelled' }
    const selected = purpose === 'export-html' || purpose === 'export-pdf'
      ? await this.destinationPath(result.filePath, purpose)
      : await this.selectedPath(result.filePath, { directory, file }, purpose)
    if (selected === undefined) return { operationId: request.identity.operationId, status: 'denied' }
    const authorization = this.options.randomId()
    const expiresAt = this.options.now() + MAX_DESKTOP_GRANT_SESSION_MS
    this.grants.set(authorization, {
      identity: request.identity,
      path: selected.path,
      purpose,
      label: labelOf(selected.path),
      expiresAt,
    })
    return {
      authorization: cast(authorization),
      label: cast(selected.label),
      operationId: request.identity.operationId,
      status: 'selected',
    }
  }

  async beginVaultActivation(
    request: BeginDesktopVaultActivationRequest,
    signal: AbortSignal,
  ): Promise<BeginDesktopVaultActivationResult> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['authorization', 'identity']) || !identity(request.identity) || !text(request.authorization)) return error('invalid-entry')
    this.assertAvailable()
    const grant = this.consumeGrant(request.authorization, request.identity, 'activate')
    const activationId = this.options.randomId()
    this.pendingVaultActivations.set(activationId, {
      expiresAt: this.options.now() + MAX_DESKTOP_GRANT_SESSION_MS,
      identity: request.identity,
      path: grant.path,
    })
    return { activationId, canonicalPath: grant.path }
  }

  async commitVaultActivation(request: CommitDesktopVaultActivationRequest, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['activationId', 'generation', 'vaultId'])
      || !text(request.activationId) || !text(request.vaultId)
      || !Number.isSafeInteger(request.generation) || request.generation <= 0) return error('invalid-entry')
    this.assertAvailable()
    const pending = this.pendingVaultActivations.get(request.activationId)
    if (pending === undefined) return error('replayed')
    if (pending.expiresAt <= this.options.now()) {
      this.pendingVaultActivations.delete(request.activationId)
      return error('expired')
    }
    if (request.generation <= pending.identity.vaultGeneration) return error('stale')
    await this.clearSessions()
    if (signal.aborted || !this.options.isAvailable()) return error('aborted')
    this.activeVault = { generation: request.generation, id: request.vaultId, path: pending.path }
    this.pendingVaultActivations.delete(request.activationId)
  }

  async abortVaultActivation(activationId: string): Promise<void> {
    this.pendingVaultActivations.delete(activationId)
  }

  async beginSource(request: BeginDesktopSourceRequest, signal: AbortSignal): Promise<BeginDesktopSourceResult> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['authorization', 'identity', 'limits', 'purpose']) || !identity(request.identity) || !text(request.authorization) || !sourcePurpose(request.purpose)) return error('unsafe-source')
    const limits = limitsOf(request.limits)
    this.assertAuthority(request.identity)
    const grant = this.consumeGrant(request.authorization, request.identity, request.purpose)
    if (this.activeVault !== undefined && pathOverlaps(grant.path, this.activeVault.path)) return error('unsafe-source')
    if (signal.aborted) return error('aborted')
    const stat = await this.safeLstat(grant.path)
    if (stat === undefined) return error('unsafe-source')
    const kind = kindOf(stat)
    if (kind === undefined) return error('unsafe-source')
    const rootSize = Number(stat.size)
    if (kind === 'file' && (rootSize > limits.maxEntryBytes || rootSize > limits.maxTotalBytes)) return error('limit-exceeded')
    const rootRevision = revisionOf(stat)
    const session = cast<DesktopSourceSession>(this.options.randomId())
    const source: SourceSession = {
      expiresAt: this.options.now() + MAX_DESKTOP_GRANT_SESSION_MS,
      identity: request.identity,
      limits,
      ordered: [],
      path: grant.path,
      purpose: request.purpose,
      root: kind === 'file'
        ? {
            entry: {
              entryId: cast(this.options.randomId()),
              kind: 'file',
              relativePath: cast(basename(grant.path)),
              revision: cast(rootRevision),
              size: Number(stat.size),
            },
            kind: 'file',
            revision: cast(rootRevision),
          }
        : { kind: 'directory', revision: cast(rootRevision) },
      rootRevision,
      cursors: new Map(),
      reads: new Map(),
    }
    this.sources.set(session, source)
    try {
      await this.scan(source, kind === 'file' && source.root.kind === 'file' ? source.root.entry.entryId : undefined)
      const fingerprint = await this.sourceRevision(source.path, source.limits)
      if (fingerprint === undefined) return error('unsafe-source')
      source.rootRevision = fingerprint
      source.root = source.root.kind === 'file'
        ? { ...source.root, revision: cast(fingerprint) }
        : { kind: 'directory', revision: cast(fingerprint) }
    } catch (cause) {
      this.sources.delete(session)
      if (cause instanceof TockTeamDesktopGrantError) throw cause
      return error('unsafe-source')
    }
    if (signal.aborted) {
      this.sources.delete(session)
      return error('aborted')
    }
    return { expiresAt: source.expiresAt, root: source.root, session }
  }

  async listSource(request: ListDesktopSourceRequest, signal: AbortSignal): Promise<ListDesktopSourceResult> {
    if (signal.aborted) return error('aborted')
    if (!noExtra(request, ['cursor', 'limit', 'session']) || !text(request.session)
      || request.cursor !== undefined && request.cursor !== null && !text(request.cursor)
      || !Number.isSafeInteger(request.limit) || request.limit <= 0 || request.limit > MAX_DESKTOP_SOURCE_PAGE_ENTRIES) return error('limit-exceeded')
    const source = this.source(request.session)
    let index = 0
    if (request.cursor !== undefined && request.cursor !== null) {
      const next = source.cursors.get(request.cursor)
      if (next === undefined) return error('stale')
      index = next
    }
    const page = source.ordered.slice(index, index + request.limit).map(entry => entry.entry)
    const nextIndex = index + page.length
    const complete = nextIndex >= source.ordered.length
    const cursor = complete ? null : cast<import('./host-contract.ts').DesktopSourceCursor>(this.options.randomId())
    if (cursor !== null) source.cursors.set(cursor, nextIndex)
    return {
      complete,
      cursor,
      entries: page,
      rootRevision: cast(source.rootRevision),
      scannedBytes: source.ordered.reduce((total, entry) => total + entry.size, 0),
      scannedEntries: source.ordered.length,
      truncated: source.ordered.length >= source.limits.maxEntries,
      truncationReason: source.ordered.length >= source.limits.maxEntries ? 'entry-limit' : null,
    }
  }

  async statSource(request: StatDesktopSourceRequest, signal: AbortSignal): Promise<StatDesktopSourceResult> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['entryId', 'session']) || !text(request.entryId) || !text(request.session)) return error('invalid-entry')
    const source = this.source(request.session)
    const entry = source.ordered.find(item => sourceEntryKeys(item.entry) && item.entry.entryId === request.entryId)
    if (entry === undefined || !sourceEntryKeys(entry.entry)) return error('invalid-entry')
    await this.assertUnchanged(source, entry)
    return entry.entry as StatDesktopSourceResult
  }

  async readSource(request: ReadDesktopSourceRequest, signal: AbortSignal): Promise<ReadDesktopSourceResult> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['entryId', 'expectedRevision', 'expectedSize', 'length', 'offset', 'session'])
      || !text(request.entryId) || !text(request.expectedRevision) || !text(request.session)
      || !Number.isSafeInteger(request.expectedSize) || request.expectedSize < 0) return error('invalid-entry')
    const source = this.source(request.session)
    if (!Number.isSafeInteger(request.offset) || request.offset < 0
      || !Number.isSafeInteger(request.length) || request.length <= 0
      || request.length > MAX_DESKTOP_DESTINATION_CHUNK_BYTES) return error('limit-exceeded')
    const entry = source.ordered.find(item => sourceEntryKeys(item.entry) && item.entry.entryId === request.entryId)
    if (entry === undefined || !sourceEntryKeys(entry.entry) || entry.entry.kind !== 'file') return error('invalid-entry')
    if (entry.entry.revision !== request.expectedRevision || entry.entry.size !== request.expectedSize) return error('changed')
    const nextOffset = source.reads.get(request.entryId) ?? 0
    if (request.offset !== nextOffset) return error('stale')
    await this.assertUnchanged(source, entry)
    await this.options.onCheckpoint?.('read', signal)
    if (signal.aborted) return error('aborted')
    this.assertAuthority(source.identity)
    const handle = await open(entry.absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    const opened = await handle.stat()
    if (revisionOf(opened) !== entry.revision || !opened.isFile()) {
      await handle.close()
      return error('changed')
    }
    const chunk = Buffer.alloc(Math.min(request.length, entry.entry.size - request.offset))
    let read = 0
    try {
      const result = await handle.read(chunk, 0, chunk.length, request.offset)
      read = result.bytesRead
    } finally {
      await handle.close()
    }
    if (signal.aborted) return error('aborted')
    if (read !== chunk.length) return error('changed')
    const next = request.offset + read
    source.reads.set(request.entryId, next)
    return {
      bytes: new Uint8Array(chunk),
      complete: next >= entry.entry.size,
      nextOffset: next,
      revision: cast(entry.entry.revision),
      size: entry.entry.size,
    }
  }

  async revalidateSource(request: RevalidateDesktopSourceRequest, signal: AbortSignal): Promise<RevalidateDesktopSourceResult> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['expectedRootRevision', 'session']) || !text(request.expectedRootRevision) || !text(request.session)) return error('invalid-entry')
    const source = this.source(request.session)
    const revision = await this.sourceRevision(source.path, source.limits)
    if (signal.aborted) return error('aborted')
    if (revision === undefined || revision !== request.expectedRootRevision || revision !== source.rootRevision) return error('changed')
    return { revision: cast(source.rootRevision), status: 'unchanged' }
  }

  async releaseSource(request: ReleaseDesktopSourceRequest): Promise<ReleaseDesktopSourceResult> {
    if (!exact(request, ['session']) || !text(request.session)) return error('invalid-entry')
    this.sweep()
    if (!this.sources.delete(request.session)) return { status: 'already-released' }
    return { status: 'released' }
  }

  async beginDestination(request: BeginDesktopDestinationRequest, signal: AbortSignal): Promise<BeginDesktopDestinationResult> {
    if (signal.aborted) return error('aborted')
    if (!noExtra(request, ['authorization', 'entries', 'identity', 'planDigest', 'publicationName', 'purpose', 'totalBytes']) || !identity(request.identity) || !text(request.authorization)) return error('unsafe-target')
    const purpose = request.purpose
    if (purpose !== 'export-html' && purpose !== 'export-pdf' && purpose !== 'vault-backup') return error('purpose-mismatch')
    this.assertAuthority(request.identity)
    const grant = this.consumeGrant(request.authorization, request.identity, purpose)
    if (this.activeVault !== undefined && pathOverlaps(grant.path, this.activeVault.path)) return error('unsafe-target')
    this.validateDestinationPlan(request, grant.path)
    const publishPath = purpose === 'vault-backup'
      ? join(grant.path, request.publicationName as string)
      : grant.path
    const expectedState = await this.destinationState(publishPath, purpose)
    const session = cast<DesktopDestinationSession>(this.options.randomId())
    const destination: DestinationSession = {
      expiresAt: this.options.now() + MAX_DESKTOP_GRANT_SESSION_MS,
      expectedState,
      identity: request.identity,
      label: labelOf(publishPath),
      planDigest: request.planDigest,
      entries: request.entries.map(entry => ({
        absolutePath: entry.target.kind === 'selected-file'
          ? publishPath
          : join(publishPath, entry.target.relativePath),
        digest: entry.digest,
        entry,
        offset: 0,
      })),
      path: publishPath,
      purpose,
      stagingRevision: undefined,
      stagingRoot: undefined,
    }
    this.destinations.set(session, destination)
    return { expiresAt: destination.expiresAt, expectedState, session }
  }

  async writeDestinationChunk(request: WriteDesktopDestinationChunkRequest, signal: AbortSignal): Promise<WriteDesktopDestinationChunkResult> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['bytes', 'offset', 'session', 'target']) || !text(request.session) || !targetValid(request.target)) return error('invalid-entry')
    const destination = this.destination(request.session)
    if (!(request.bytes instanceof Uint8Array) || request.bytes.length > MAX_DESKTOP_DESTINATION_CHUNK_BYTES) return error('limit-exceeded')
    const entry = destination.entries.find(item => targetKey(item.entry.target) === targetKey(request.target))
    if (entry === undefined) return error('invalid-entry')
    if (!Number.isSafeInteger(request.offset) || request.offset !== entry.offset) return error('stale')
    if (entry.offset + request.bytes.length > entry.entry.size) return error('size-mismatch')
    await this.ensureStaging(destination)
    await this.options.onCheckpoint?.('write', signal)
    this.assertAuthority(destination.identity)
    if (signal.aborted) return error('aborted')
    await this.assertStagingStable(destination)
    const staged = entry.stagedPath ?? join(destination.stagingRoot as string, request.target.kind === 'selected-file' ? 'selected-file' : request.target.relativePath)
    entry.stagedPath = staged
    await mkdir(dirname(staged), { recursive: true, mode: 0o700 })
    const handle = await open(
      staged,
      (entry.offset === 0 ? fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL : fsConstants.O_WRONLY | fsConstants.O_APPEND)
        | fsConstants.O_NOFOLLOW,
      0o600,
    )
    try {
      await handle.write(request.bytes)
    } finally {
      await handle.close()
    }
    if (signal.aborted) return error('aborted')
    entry.offset += request.bytes.length
    return { acceptedBytes: request.bytes.length, nextOffset: entry.offset }
  }

  async finalizeDestination(request: FinalizeDesktopDestinationRequest, signal: AbortSignal): Promise<FinalizeDesktopDestinationResult> {
    if (signal.aborted) return error('aborted')
    if (!exact(request, ['expectedState', 'planDigest', 'session']) || !stateValid(request.expectedState) || !digest(request.planDigest) || !text(request.session)) return error('invalid-entry')
    const destination = this.destination(request.session)
    if (request.planDigest !== destination.planDigest || !stateEqual(request.expectedState, destination.expectedState)) return error('stale')
    try {
      for (const entry of destination.entries) {
        if (entry.offset !== entry.entry.size || entry.stagedPath === undefined) return error('size-mismatch')
        const bytes = await readFile(entry.stagedPath)
        if (signal.aborted) return error('aborted')
        if (bytes.length !== entry.entry.size || createHash('sha256').update(bytes).digest('hex') !== entry.digest) return error('digest-mismatch')
      }
      const current = await this.destinationState(destination.path, destination.purpose)
      if (!stateEqual(current, destination.expectedState)) return error('changed')
      const replaced = destination.expectedState.status === 'existing'
      await this.options.onCheckpoint?.('finalize', signal)
      this.assertAuthority(destination.identity)
      if (signal.aborted) return error('aborted')
      await this.assertParentStable(destination.path)
      await this.assertStagingStable(destination)
      if (destination.purpose === 'vault-backup') {
        await mkdir(destination.path, { recursive: false, mode: 0o700 })
        if (signal.aborted || !this.options.isAvailable()) {
          await rmdir(destination.path).catch(() => {})
          return error('aborted')
        }
        try {
          await rename(destination.stagingRoot as string, destination.path)
          destination.stagingRoot = undefined
          destination.stagingRevision = undefined
        } catch (cause) {
          await rmdir(destination.path).catch(() => {})
          throw cause
        }
      } else {
        const selectedEntry = destination.entries[0]
        if (selectedEntry === undefined || selectedEntry.stagedPath === undefined) return error('invalid-entry')
        await mkdir(dirname(destination.path), { recursive: true, mode: 0o700 })
        if (destination.expectedState.status === 'absent') {
          try {
            await link(selectedEntry.stagedPath, destination.path)
            await unlink(selectedEntry.stagedPath)
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'EEXIST') return error('changed')
            throw cause
          }
        } else {
          await rename(selectedEntry.stagedPath, destination.path)
        }
      }
      await this.cleanupDestination(destination)
      this.destinations.delete(request.session)
      return {
        bytes: destination.entries.reduce((sum, entry) => sum + entry.entry.size, 0),
        cleanup: { status: 'complete' },
        entries: destination.entries.length,
        label: cast(destination.label),
        planDigest: destination.planDigest as never,
        replaced,
        status: 'published',
      }
    } catch (cause) {
      await this.cleanupDestination(destination)
      this.destinations.delete(request.session)
      if (cause instanceof TockTeamDesktopGrantError) throw cause
      return {
        cleanup: { status: 'complete' },
        failedEntries: destination.entries.length,
        published: false,
        stagedBytes: destination.entries.reduce((sum, entry) => sum + entry.offset, 0),
        stagedEntries: destination.entries.filter(entry => entry.offset > 0).length,
        status: 'partial',
      }
    }
  }

  async abortDestination(request: AbortDesktopDestinationRequest): Promise<AbortDesktopDestinationResult> {
    if (!exact(request, ['session']) || !text(request.session)) return error('invalid-entry')
    const destination = this.destinations.get(request.session)
    if (destination === undefined) return { cleanup: { status: 'complete' }, stagedBytes: 0, stagedEntries: 0, status: 'already-closed' }
    const stagedBytes = destination.entries.reduce((sum, entry) => sum + entry.offset, 0)
    const stagedEntries = destination.entries.filter(entry => entry.offset > 0).length
    await this.cleanupDestination(destination)
    this.destinations.delete(request.session)
    return { cleanup: { status: 'complete' }, stagedBytes, stagedEntries, status: 'aborted' }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.clearSessions()
    await Promise.allSettled([...this.cleanupTasks])
    this.grants.clear()
    this.pendingVaultActivations.clear()
    this.consumedPickOperations.clear()
    this.activeVault = undefined
  }

  private async destinationPath(rawPath: string, purpose: 'export-html' | 'export-pdf'): Promise<{ path: string; label: string } | undefined> {
    const selected = resolve(rawPath)
    const parent = await this.safeRealpath(dirname(selected))
    if (parent === undefined) return undefined
    const path = join(parent, basename(selected))
    const existing = await this.safeLstat(path)
    if (existing !== undefined && (!existing.isFile() || existing.isSymbolicLink())) return undefined
    const extension = extname(path).slice(1).toLowerCase()
    if (extension !== purpose.slice('export-'.length) || !safeName(basename(path))) return undefined
    return { path, label: labelOf(path) }
  }

  private async selectedPath(
    rawPath: string,
    allowed: { directory: boolean; file: boolean },
    purpose: DesktopPickerRequest['purpose'],
  ): Promise<{ path: string; label: string } | undefined> {
    const selected = resolve(rawPath)
    const stat = await this.safeLstat(selected)
    if (stat === undefined || stat.isSymbolicLink()) return undefined
    const kind = kindOf(stat)
    if (kind === undefined || kind === 'directory' && !allowed.directory || kind === 'file' && !allowed.file) return undefined
    if (kind === 'file' && !this.sourceExtensionAllowed(selected, purpose)) return undefined
    const canonical = await this.safeRealpath(selected)
    if (canonical === undefined) return undefined
    return { path: canonical, label: labelOf(canonical) }
  }

  private sourceExtensionAllowed(path: string, purpose: DesktopPickerRequest['purpose']): boolean {
    const extension = extname(path).slice(1).toLowerCase()
    if (purpose === 'markdown-zip' || purpose === 'google-keep') return extension === 'zip'
    if (purpose === 'csv') return extension === 'csv'
    if (purpose === 'bear-backup') return extension === 'bear2bk'
    if (purpose === 'evernote') return extension === 'enex'
    if (purpose === 'roam-research') return extension === 'json'
    if (purpose === 'html' || purpose === 'apple-journal') return extension === 'html' || extension === 'htm' || purpose === 'html' && extension === 'zip'
    if (purpose === 'textbundle') return extension === 'textpack' || extension === 'textbundle' || extension === 'zip'
    return true
  }

  private assertAvailable(): void {
    if (this.disposed) return error('owner-lost')
    if (!this.options.isAvailable()) return error('stale')
  }

  private assertAuthority(identity: NativeOperationIdentity): void {
    this.assertAvailable()
    if (this.activeVault === undefined || !sameVaultBoundary(identity, this.activeVault)) return error('stale')
  }

  private async clearSessions(): Promise<void> {
    for (const session of this.destinations.values()) await this.cleanupDestination(session)
    this.sources.clear()
    this.destinations.clear()
  }

  private consumeGrant(raw: string, expectedIdentity: NativeOperationIdentity, expectedPurpose: DesktopPickerRequest['purpose']): Grant {
    this.assertAvailable()
    const grant = this.grants.get(raw)
    if (grant === undefined) return error('replayed')
    if (grant.expiresAt <= this.options.now()) {
      this.grants.delete(raw)
      return error('expired')
    }
    this.sweep()
    if (!sameIdentity(grant.identity, expectedIdentity)) return error('stale')
    if (grant.purpose !== expectedPurpose) return error('purpose-mismatch')
    this.grants.delete(raw)
    return grant
  }

  private source(session: DesktopSourceSession): SourceSession {
    const source = this.sources.get(session)
    if (source === undefined) return error('closed')
    if (source.expiresAt <= this.options.now()) {
      this.sources.delete(session)
      return error('expired')
    }
    this.sweep()
    this.assertAuthority(source.identity)
    return source
  }

  private destination(session: DesktopDestinationSession): DestinationSession {
    const destination = this.destinations.get(session)
    if (destination === undefined) return error('closed')
    if (destination.expiresAt <= this.options.now()) {
      this.scheduleCleanup(destination)
      this.destinations.delete(session)
      return error('expired')
    }
    this.sweep()
    this.assertAuthority(destination.identity)
    return destination
  }

  private sweep(): void {
    const now = this.options.now()
    for (const [authorization, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(authorization)
    for (const [session, source] of this.sources) if (source.expiresAt <= now) this.sources.delete(session)
    for (const [session, destination] of this.destinations) {
      if (destination.expiresAt <= now) {
        this.scheduleCleanup(destination)
        this.destinations.delete(session)
      }
    }
  }

  private async safeLstat(path: string): Promise<Stat | undefined> {
    try { return await lstat(path) } catch { return undefined }
  }

  private async safeRealpath(path: string): Promise<string | undefined> {
    try { return await realpath(path) } catch { return undefined }
  }

  private async assertUnchanged(source: SourceSession, entry: InternalSourceEntry): Promise<void> {
    const stat = await this.safeLstat(entry.absolutePath)
    if (stat === undefined || kindOf(stat) !== entry.entry.kind || revisionOf(stat) !== entry.revision) return error('changed')
  }

  private async sourceRevision(path: string, limits: DesktopSourceLimits): Promise<string | undefined> {
    const root = await this.safeLstat(path)
    if (root === undefined || kindOf(root) === undefined || root.isSymbolicLink()) return undefined
    const hash = createHash('sha256')
    hash.update(`root:${kindOf(root)}:${revisionOf(root)}\n`)
    if (root.isFile()) return hash.digest('hex')
    let entries = 0
    let bytes = 0
    const walk = async (directory: string, relativeRoot: string, depth: number): Promise<boolean> => {
      if (depth > limits.maxDepth) return false
      const canonical = await this.safeRealpath(directory)
      if (canonical === undefined || !within(path, canonical)) return false
      const children = await readdir(directory, { withFileTypes: true })
      children.sort((left, right) => left.name.localeCompare(right.name))
      for (const child of children) {
        entries += 1
        if (entries > limits.maxEntries) return false
        const relativePath = relativeRoot === '' ? child.name : `${relativeRoot}/${child.name}`
        if (!safeRelative(relativePath, limits.maxRelativePathBytes)) return false
        const stat = await this.safeLstat(join(directory, child.name))
        if (stat === undefined) return false
        const kind = stat.isSymbolicLink() ? 'symlink' : kindOf(stat) ?? 'special'
        hash.update(`${relativePath}:${kind}:${revisionOf(stat)}\n`)
        if (stat.isFile()) {
          bytes += Number(stat.size)
          if (Number(stat.size) > limits.maxEntryBytes || bytes > limits.maxTotalBytes) return false
        } else if (stat.isDirectory() && !stat.isSymbolicLink()) {
          if (!await walk(join(directory, child.name), relativePath, depth + 1)) return false
        }
      }
      return true
    }
    return await walk(path, '', 0) ? hash.digest('hex') : undefined
  }

  private async scan(source: SourceSession, rootEntryId?: string): Promise<void> {
    const rootStat = await this.safeLstat(source.path)
    if (rootStat === undefined) return error('unsafe-source')
    if (rootEntryId !== undefined) {
      if (source.root.kind !== 'file') return error('unsafe-source')
      const fileEntry = source.root.entry
      const internal: InternalSourceEntry = {
        absolutePath: source.path,
        entry: fileEntry,
        revision: fileEntry.revision,
        size: fileEntry.size,
      }
      source.ordered.push(internal)
      return
    }
    let scannedBytes = 0
    const walk = async (directory: string, relativeRoot: string, depth: number): Promise<void> => {
      if (depth > source.limits.maxDepth) return
      const canonical = await this.safeRealpath(directory)
      if (canonical === undefined || !within(source.path, canonical)) return error('unsafe-source')
      const children = await readdir(directory, { withFileTypes: true })
      children.sort((left, right) => left.name.localeCompare(right.name))
      for (const child of children) {
        if (source.ordered.length >= source.limits.maxEntries || scannedBytes >= source.limits.maxTotalBytes) return
        const relativePath = relativeRoot === '' ? child.name : `${relativeRoot}/${child.name}`
        const stat = await this.safeLstat(join(directory, child.name))
        if (stat === undefined) continue
        const childPath = join(directory, child.name)
        const rejected = (reason: DesktopSourceRejectionReason): void => {
          source.ordered.push({
            absolutePath: childPath,
            entry: { kind: 'rejected', label: cast(labelOf(childPath)), reason },
            revision: revisionOf(stat),
            size: 0,
          })
        }
        if (!safeRelative(relativePath, source.limits.maxRelativePathBytes)) {
          rejected('invalid-name')
          continue
        }
        if (stat.isSymbolicLink()) {
          rejected('symlink')
          continue
        }
        if (stat.isFile() && stat.nlink > 1) {
          rejected('hardlink')
          continue
        }
        const kind = kindOf(stat)
        if (kind === undefined) {
          rejected('special-file')
          continue
        }
        if (kind === 'directory') {
          const entry: Extract<DesktopSourceEntry, { kind: 'directory' }> = {
            entryId: cast(this.options.randomId()),
            kind: 'directory',
            relativePath: cast(relativePath),
            revision: cast(revisionOf(stat)),
          }
          source.ordered.push({ absolutePath: childPath, entry, revision: entry.revision, size: 0 })
          if (depth < source.limits.maxDepth) await walk(childPath, relativePath, depth + 1)
          else rejected('depth-limit')
          continue
        }
        const size = Number(stat.size)
        if (size > source.limits.maxEntryBytes || scannedBytes + size > source.limits.maxTotalBytes) {
          rejected('total-bytes-limit')
          return
        }
        const entry: Extract<DesktopSourceEntry, { kind: 'file' }> = {
          entryId: cast(this.options.randomId()),
          kind: 'file',
          relativePath: cast(relativePath),
          revision: cast(revisionOf(stat)),
          size,
        }
        source.ordered.push({ absolutePath: childPath, entry, revision: String(entry.revision), size })
        scannedBytes += size
      }
    }
    await walk(source.path, '', 0)
  }

  private async destinationState(path: string, purpose: DesktopExportPurpose): Promise<DesktopDestinationState> {
    const stat = await this.safeLstat(path)
    if (stat === undefined) return { status: 'absent' }
    if (purpose === 'vault-backup' || !stat.isFile()) return error('exists')
    return { replaceAuthorized: true, revision: cast(revisionOf(stat)), status: 'existing' }
  }

  private validateDestinationPlan(request: BeginDesktopDestinationRequest, selectedPath: string): void {
    if (!digest(request.planDigest) || !Number.isSafeInteger(request.totalBytes) || request.totalBytes < 0 || request.totalBytes > MAX_DESKTOP_SOURCE_TOTAL_BYTES) return error('limit-exceeded')
    if (!Array.isArray(request.entries) || request.entries.length === 0 || request.entries.length > MAX_DESKTOP_SOURCE_ENTRIES) return error('limit-exceeded')
    let total = 0
    const keys = new Set<string>()
    for (const entry of request.entries) {
      if (!exact(entry, ['digest', 'size', 'target']) || !digest(entry.digest) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_DESKTOP_SOURCE_ENTRY_BYTES) return error('invalid-entry')
      const target = entry.target as Record<string, unknown>
      if (target.kind === 'selected-file' ? !exact(target, ['kind']) : !exact(target, ['kind', 'relativePath'])) return error('invalid-entry')
      const key = target.kind === 'selected-file' ? 'selected-file' : target.kind === 'relative-file' && safeRelative(target.relativePath) ? String(target.relativePath).toLowerCase() : undefined
      if (key === undefined || keys.has(key)) return error('unsafe-target')
      keys.add(key)
      total += entry.size
    }
    if (total !== request.totalBytes) return error('size-mismatch')
    if (request.purpose === 'export-html' || request.purpose === 'export-pdf') {
      const selectedEntry = request.entries[0]
      if (selectedEntry === undefined || selectedEntry.target.kind !== 'selected-file' || Object.hasOwn(request, 'publicationName')) return error('purpose-mismatch')
      const extension = extname(selectedPath).slice(1).toLowerCase()
      if (extension !== request.purpose.slice('export-'.length)) return error('purpose-mismatch')
    } else {
      if (!safeName(request.publicationName) || request.entries.some(entry => entry.target.kind !== 'relative-file') || !request.entries.some(entry => entry.target.kind === 'relative-file' && entry.target.relativePath.toLowerCase() === 'manifest.json')) return error('purpose-mismatch')
    }
  }

  private async assertParentStable(path: string): Promise<void> {
    const parent = dirname(path)
    const canonical = await this.safeRealpath(parent)
    if (canonical === undefined || canonical !== parent) return error('unsafe-target')
  }

  private async assertStagingStable(destination: DestinationSession): Promise<void> {
    if (destination.stagingRoot === undefined || destination.stagingRevision === undefined) return error('closed')
    const canonical = await this.safeRealpath(destination.stagingRoot)
    const stat = await this.safeLstat(destination.stagingRoot)
    if (canonical !== destination.stagingRoot || stat === undefined || !stat.isDirectory()
      || identityOf(stat) !== destination.stagingRevision) return error('unsafe-target')
  }

  private async ensureStaging(destination: DestinationSession): Promise<void> {
    if (destination.stagingRoot !== undefined) return
    const stagingRoot = join(dirname(destination.path), `.tockteam-picker-stage-${this.options.randomId()}`)
    await mkdir(stagingRoot, { recursive: false, mode: 0o700 })
    const stat = await this.safeLstat(stagingRoot)
    if (stat === undefined || !stat.isDirectory() || stat.isSymbolicLink()) return error('unsafe-target')
    destination.stagingRoot = stagingRoot
    destination.stagingRevision = identityOf(stat)
  }

  private scheduleCleanup(destination: DestinationSession): void {
    const task = this.cleanupDestination(destination)
    this.cleanupTasks.add(task)
    void task.finally(() => { this.cleanupTasks.delete(task) })
  }

  private async cleanupDestination(destination: DestinationSession): Promise<DesktopCleanupEvidence> {
    if (destination.stagingRoot === undefined) return { status: 'complete' }
    try {
      await rm(destination.stagingRoot, { recursive: true, force: true })
      destination.stagingRoot = undefined
      destination.stagingRevision = undefined
      return { status: 'complete' }
    } catch {
      return { residualLabels: destination.entries.map(entry => cast(labelOf(entry.absolutePath))), status: 'residual' }
    }
  }
}
