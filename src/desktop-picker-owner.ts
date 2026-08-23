import { createHash, randomBytes } from 'node:crypto'
import {
  constants as fsConstants,
  linkSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs'
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  chmod,
  link,
  lstat,
  realpath,
  unlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
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
  computeDesktopDestinationPlanDigest,
  type BeginDesktopDestinationRequest,
  type BeginDesktopDestinationResult,
  type BeginDesktopSourceRequest,
  type BeginDesktopSourceResult,
  type DesktopCleanupEvidence,
  type DesktopDestinationPlan,
  type DesktopDestinationPlanAuthorization,
  type DesktopDestinationPlanEntry,
  type DesktopDestinationState,
  type DesktopDestinationTarget,
  type DesktopExportPurpose,
  type DesktopGrantErrorCode,
  type DesktopPickerLabel,
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
  type LockDesktopDestinationPlanRequest,
  type LockDesktopDestinationPlanResult,
  type ListDesktopSourceResult,
  type StatDesktopSourceRequest,
  type StatDesktopSourceResult,
  type TockTeamDesktopVaultSelectionBindInput,
  type TockTeamDesktopVaultSelectionBindResult,
  type TockTeamDesktopVaultSelectionClaim,
  type TockTeamDesktopVaultSelectionConsumeInput,
  type TockTeamDesktopVaultSelectionConsumeResult,
  type TockTeamDesktopVaultSelectionReleaseInput,
  type RevalidateDesktopSourceRequest,
  type RevalidateDesktopSourceResult,
  type ReleaseDesktopSourceRequest,
  type ReleaseDesktopSourceResult,
  type RevokeDesktopDestinationPlanRequest,
  type RevokeDesktopDestinationPlanResult,
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

export type DesktopPickerCheckpoint =
  | 'dialog'
  | 'read'
  | 'write'
  | 'finalize'
  | 'journal-prepared'
  | 'backup-moved'
  | 'backup-verified'
  | 'target-published'
  | 'journal-published'
  | 'backup-removed'
  | 'journal-removed'

export interface DesktopPickerOwnerOptions {
  isAvailable(): boolean
  showOpenDialog(options: DesktopPickerDialogOptions): Promise<DesktopPickerDialogResult>
  showSaveDialog(options: DesktopPickerDialogOptions): Promise<DesktopPickerDialogResult>
  now?: () => number
  randomId?: () => string
  onCheckpoint?: (checkpoint: DesktopPickerCheckpoint, signal: AbortSignal) => Promise<void>
  recoveryRoot?: string
}

interface ActiveVaultBoundary {
  claim: string
  dev: string
  generation: number
  id: string
  ino: string
  path: string
}

interface PendingVaultSelectionClaim {
  bound: { generation: number; id: string } | undefined
  dev: string
  expiresAt: number
  identity: NativeOperationIdentity
  ino: string
  path: string
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
  ancestors: Array<{ identity: string; path: string }>
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

interface ExistingDestinationSnapshot {
  contentDigest: string
  identity: string
  path: string
  revision: string
  size: number
}

interface LockedDestinationPlan {
  entries: DesktopDestinationPlanEntry[]
  expectedState: DesktopDestinationState
  expiresAt: number
  identity: NativeOperationIdentity
  journalPath: string | undefined
  label: string
  parentIdentity: string
  path: string
  planDigest: string
  publicationName: string | undefined
  purpose: DesktopExportPurpose
  snapshot: ExistingDestinationSnapshot | undefined
  totalBytes: number
}

interface DestinationRecoveryRecord {
  backupPath: string | null
  commitPath: string | null
  destinationPath: string
  newDigest: string
  newSize: number
  oldDigest: string | null
  oldIdentity: string | null
  oldSize: number | null
  parentIdentity: string
  snapshotPath: string | null
  state: 'locked' | 'prepared' | 'moved' | 'published'
  version: 1
}

interface DestinationEntry {
  absolutePath: string
  digest: string
  entry: DesktopDestinationPlanEntry
  handle: Awaited<ReturnType<typeof open>> | undefined
  offset: number
  stagedPath?: string
}

interface DestinationSession {
  expiresAt: number
  expectedState: DesktopDestinationState
  identity: NativeOperationIdentity
  journalPath: string | undefined
  label: string
  planDigest: string
  entries: DestinationEntry[]
  parentIdentity: string
  path: string
  publicationName: string | undefined
  purpose: DesktopExportPurpose
  recoveryPaths: string[]
  snapshot: ExistingDestinationSnapshot | undefined
  totalBytes: number
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
  return value.vaultId === null || generation > 0
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

async function abortableDialog(
  promise: Promise<DesktopPickerDialogResult>,
  signal: AbortSignal,
): Promise<DesktopPickerDialogResult | undefined> {
  if (signal.aborted) return undefined
  let abort!: () => void
  const aborted = new Promise<undefined>(resolve => { abort = () => resolve(undefined) })
  signal.addEventListener('abort', abort, { once: true })
  try {
    return await Promise.race([promise, aborted])
  } finally {
    signal.removeEventListener('abort', abort)
    void promise.catch(() => undefined)
  }
}

function identityOf(stat: Stat): string {
  return `${String(stat.dev)}:${String(stat.ino)}`
}

function revisionOf(stat: Stat): string {
  return createHash('sha256')
    .update([
      String(stat.dev), String(stat.ino), String(stat.size),
      String(stat.mtimeMs), String(stat.ctimeMs), String(stat.mode),
    ].join(':'))
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

function destinationPlanOf(input: DesktopDestinationPlan): DesktopDestinationPlan {
  return (Object.hasOwn(input, 'publicationName')
    ? {
        entries: input.entries,
        publicationName: input.publicationName,
        purpose: input.purpose,
        totalBytes: input.totalBytes,
      }
    : {
        entries: input.entries,
        purpose: input.purpose,
        totalBytes: input.totalBytes,
      }) as DesktopDestinationPlan
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
  private readonly destinationPlans = new Map<string, LockedDestinationPlan>()
  private readonly consumedPickOperations = new Set<string>()
  private readonly vaultSelectionClaims = new Map<string, PendingVaultSelectionClaim>()
  private readonly cleanupTasks = new Set<Promise<unknown>>()
  private readonly closedDestinations = new Map<string, AbortDesktopDestinationResult>()
  private activeVault: ActiveVaultBoundary | undefined
  private disposed = false
  private expiryTimer: NodeJS.Timeout | undefined
  private readonly recoveryRoot: string
  private readonly recoveryReady: Promise<void>
  private readonly recoveryBlockedDestinations = new Set<string>()
  private recoveryCorrupt = false

  constructor(options: DesktopPickerOwnerOptions) {
    this.options = {
      ...options,
      now: options.now ?? (() => Date.now()),
      randomId: options.randomId ?? (() => randomBytes(24).toString('base64url')),
    }
    this.recoveryRoot = resolve(options.recoveryRoot
      ?? process.env.DSH_DESKTOP_PICKER_RECOVERY_ROOT
      ?? join(realpathSync(tmpdir()), `tockteam-desktop-picker-recovery-${randomBytes(12).toString('base64url')}`))
    this.recoveryReady = this.recoverRegistered()
  }

  async ready(): Promise<void> {
    await this.recoveryReady
  }

  matchesActiveIdentity(identity: NativeOperationIdentity): boolean {
    try {
      this.assertAuthority(identity)
      return true
    } catch {
      return false
    }
  }

  nativeIdentity(
    operationId: string,
    requestId: string,
    windowId: string,
    sessionId: string,
  ): NativeOperationIdentity {
    return {
      operationId,
      requestId,
      sessionId,
      vaultGeneration: this.activeVault?.generation ?? 0,
      vaultId: this.activeVault?.id ?? null,
      windowId,
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
    const result = await abortableDialog(
      purpose === 'export-html' || purpose === 'export-pdf'
        ? this.options.showSaveDialog({ kind: 'save', purpose, directory: false, file: true, extensions })
        : this.options.showOpenDialog({ kind: 'open', purpose, directory, file, extensions }),
      signal,
    )
    await this.options.onCheckpoint?.('dialog', signal)
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    if (this.disposed || !this.options.isAvailable()) return { operationId: request.identity.operationId, status: 'unavailable' }
    if (result === undefined || result.canceled || result.filePath === undefined) return { operationId: request.identity.operationId, status: 'cancelled' }
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
    this.scheduleExpiry()
    return {
      authorization: cast(authorization),
      label: cast(selected.label),
      operationId: request.identity.operationId,
      status: 'selected',
    }
  }

  async consumeVaultSelection(
    request: TockTeamDesktopVaultSelectionConsumeInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
    const operationId = identity(request?.identity) ? request.identity.operationId : ''
    if (signal.aborted) return { operationId, status: 'cancelled' }
    try {
      if (!exact(request, ['authorization', 'identity']) || !identity(request.identity) || !text(request.authorization)) {
        return { operationId, status: 'denied' }
      }
      this.assertAvailable()
      const grant = this.consumeGrant(request.authorization, request.identity, 'activate')
      const canonicalPath = await this.safeRealpath(grant.path)
      const stat = canonicalPath === undefined ? undefined : await this.safeLstat(canonicalPath)
      if (signal.aborted) return { operationId, status: 'cancelled' }
      if (canonicalPath === undefined || stat === undefined || !stat.isDirectory() || stat.isSymbolicLink()) {
        return { operationId, status: 'denied' }
      }
      const claim = this.options.randomId()
      const dev = String(stat.dev)
      const ino = String(stat.ino)
      if (!/^\d+$/u.test(dev) || !/^\d+$/u.test(ino)) return { operationId, status: 'unavailable' }
      this.vaultSelectionClaims.set(claim, {
        bound: undefined,
        dev,
        expiresAt: this.options.now() + MAX_DESKTOP_GRANT_SESSION_MS,
        identity: request.identity,
        ino,
        path: canonicalPath,
      })
      this.scheduleExpiry()
      return { canonicalPath, claim: cast<TockTeamDesktopVaultSelectionClaim>(claim), identity: { dev, ino }, operationId, status: 'consumed' }
    } catch (cause) {
      const status = cause instanceof TockTeamDesktopGrantError && cause.code === 'stale'
        ? 'stale'
        : signal.aborted ? 'cancelled' : 'unavailable'
      return { operationId, status }
    }
  }

  async bindVaultSelection(
    request: TockTeamDesktopVaultSelectionBindInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionBindResult> {
    const operationId = typeof request?.operationId === 'string' ? request.operationId.slice(0, MAX_ID_BYTES) : ''
    if (signal.aborted) return { operationId, status: 'cancelled' }
    if (!exact(request, ['claim', 'operationId', 'vaultGeneration', 'vaultId'])
      || !text(request.claim) || !text(request.operationId) || !text(request.vaultId)
      || !Number.isSafeInteger(request.vaultGeneration) || request.vaultGeneration < 0) {
      return { operationId, status: 'denied' }
    }
    const claim = this.vaultSelectionClaims.get(request.claim)
    if (claim === undefined || claim.identity.operationId !== request.operationId) return { operationId, status: 'stale' }
    if (claim.expiresAt <= this.options.now()) {
      this.vaultSelectionClaims.delete(request.claim)
      return { operationId, status: 'stale' }
    }
    try {
      this.assertAvailable()
      const canonicalPath = await this.safeRealpath(claim.path)
      const stat = canonicalPath === undefined ? undefined : await this.safeLstat(canonicalPath)
      if (signal.aborted) return { operationId, status: 'cancelled' }
      if (canonicalPath !== claim.path || stat === undefined || !stat.isDirectory()
        || String(stat.dev) !== claim.dev || String(stat.ino) !== claim.ino) return { operationId, status: 'stale' }
      const cleanup = await this.clearSessions()
      if (cleanup.status !== 'complete') return { operationId, status: 'unavailable' }
      if (signal.aborted || !this.options.isAvailable()) return { operationId, status: 'cancelled' }
      this.activeVault = {
        claim: request.claim,
        dev: claim.dev,
        generation: request.vaultGeneration,
        id: request.vaultId,
        ino: claim.ino,
        path: claim.path,
      }
      claim.bound = { generation: request.vaultGeneration, id: request.vaultId }
      return { operationId, status: 'bound' }
    } catch {
      return { operationId, status: signal.aborted ? 'cancelled' : 'unavailable' }
    }
  }

  async releaseVaultSelection(request: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
    if (!exact(request, ['claim', 'operationId']) || !text(request.claim) || !text(request.operationId)) return
    const claim = this.vaultSelectionClaims.get(request.claim)
    if (claim === undefined || claim.identity.operationId !== request.operationId) return
    this.vaultSelectionClaims.delete(request.claim)
    if (claim.bound !== undefined && this.activeVault?.claim === request.claim
      && this.activeVault.id === claim.bound.id
      && this.activeVault.generation === claim.bound.generation) {
      await this.clearSessions()
      this.grants.clear()
      this.destinationPlans.clear()
      this.activeVault = undefined
    }
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
    if (kind === undefined || kind === 'file' && stat.nlink > 1) return error('unsafe-source')
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
    this.scheduleExpiry()
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
    let afterOpened: Stat | undefined
    try {
      const result = await handle.read(chunk, 0, chunk.length, request.offset)
      read = result.bytesRead
      afterOpened = await handle.stat()
    } finally {
      await handle.close()
    }
    if (signal.aborted) return error('aborted')
    const afterRead = await this.safeLstat(entry.absolutePath)
    if (afterOpened === undefined || revisionOf(afterOpened) !== entry.revision
      || afterRead === undefined || revisionOf(afterRead) !== entry.revision) return error('changed')
    this.assertAuthority(source.identity)
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

  revokeGrant(authorization: string): void {
    this.grants.delete(authorization)
  }

  async releaseSource(request: ReleaseDesktopSourceRequest): Promise<ReleaseDesktopSourceResult> {
    if (!exact(request, ['session']) || !text(request.session)) return error('invalid-entry')
    this.sweep()
    if (!this.sources.delete(request.session)) return { status: 'already-released' }
    return { status: 'released' }
  }

  async lockDestinationPlan(
    request: LockDesktopDestinationPlanRequest,
    signal: AbortSignal,
  ): Promise<LockDesktopDestinationPlanResult> {
    if (signal.aborted) return error('aborted')
    if (!noExtra(request, ['entries', 'identity', 'planDigest', 'publicationName', 'purpose', 'selectionAuthorization', 'totalBytes'])
      || !identity(request.identity) || !text(request.selectionAuthorization) || !digest(request.planDigest)) return error('unsafe-target')
    this.assertAuthority(request.identity)
    const grant = this.consumeGrant(request.selectionAuthorization, request.identity, request.purpose)
    await this.recoverParent(dirname(grant.path))
    const computed = computeDesktopDestinationPlanDigest(destinationPlanOf(request))
    if (computed !== request.planDigest) return error('digest-mismatch')
    if (this.activeVault !== undefined && pathOverlaps(grant.path, this.activeVault.path)) return error('unsafe-target')
    this.validateDestinationPlan(request, grant.path)
    const path = request.purpose === 'vault-backup'
      ? join(grant.path, request.publicationName as string)
      : grant.path
    const selectedEntry = request.entries[0]
    if (selectedEntry === undefined) return error('invalid-entry')
    const parent = dirname(path)
    const parentStat = await this.safeLstat(parent)
    if (parentStat === undefined || !parentStat.isDirectory() || parentStat.isSymbolicLink()
      || await this.safeRealpath(parent) !== parent) return error('unsafe-target')
    const parentIdentity = identityOf(parentStat)
    const captured = await this.captureDestination(
      path,
      request.purpose,
      selectedEntry.digest,
      request.totalBytes,
      parentIdentity,
    )
    const expectedState = captured.expectedState
    const authorization = cast<DesktopDestinationPlanAuthorization>(this.options.randomId())
    const expiresAt = this.options.now() + MAX_DESKTOP_GRANT_SESSION_MS
    this.destinationPlans.set(authorization, {
      entries: request.entries.map(entry => structuredClone(entry)),
      expectedState,
      expiresAt,
      identity: request.identity,
      journalPath: captured.journalPath,
      label: labelOf(path),
      parentIdentity,
      path,
      planDigest: request.planDigest,
      publicationName: request.publicationName,
      purpose: request.purpose,
      snapshot: captured.snapshot,
      totalBytes: request.totalBytes,
    })
    this.scheduleExpiry()
    return { authorization, expectedState, expiresAt }
  }

  async revokeDestinationPlan(
    request: RevokeDesktopDestinationPlanRequest,
  ): Promise<RevokeDesktopDestinationPlanResult> {
    if (!exact(request, ['authorization']) || !text(request.authorization)) return error('invalid-entry')
    const plan = this.destinationPlans.get(request.authorization)
    if (plan === undefined) return { status: 'already-closed' }
    this.destinationPlans.delete(request.authorization)
    await this.cleanupLockedPlan(plan)
    return { status: 'revoked' }
  }

  async beginDestination(request: BeginDesktopDestinationRequest, signal: AbortSignal): Promise<BeginDesktopDestinationResult> {
    if (signal.aborted) return error('aborted')
    if (!noExtra(request, ['authorization', 'entries', 'identity', 'planDigest', 'publicationName', 'purpose', 'totalBytes'])
      || !identity(request.identity) || !text(request.authorization) || !digest(request.planDigest)) return error('unsafe-target')
    this.assertAuthority(request.identity)
    const locked = this.destinationPlans.get(request.authorization)
    if (locked === undefined) return error('replayed')
    let computed: string
    try {
      computed = computeDesktopDestinationPlanDigest(destinationPlanOf(request))
    } catch (cause) {
      this.destinationPlans.delete(request.authorization)
      await this.cleanupLockedPlan(locked)
      throw cause
    }
    if (computed !== request.planDigest) {
      this.destinationPlans.delete(request.authorization)
      await this.cleanupLockedPlan(locked)
      return error('digest-mismatch')
    }
    if (locked.expiresAt <= this.options.now()) {
      this.destinationPlans.delete(request.authorization)
      return error('expired')
    }
    if (!sameIdentity(locked.identity, request.identity) || locked.planDigest !== request.planDigest
      || locked.purpose !== request.purpose || locked.publicationName !== request.publicationName
      || locked.totalBytes !== request.totalBytes) {
      this.destinationPlans.delete(request.authorization)
      await this.cleanupLockedPlan(locked)
      return error('stale')
    }
    this.destinationPlans.delete(request.authorization)
    this.assertDestinationParent(locked.path, locked.parentIdentity)
    let currentState: DesktopDestinationState
    try {
      currentState = await this.destinationState(locked.path, locked.purpose)
    } catch (cause) {
      await this.cleanupLockedPlan(locked)
      throw cause
    }
    if (signal.aborted) {
      await this.cleanupLockedPlan(locked)
      return error('aborted')
    }
    if (!stateEqual(currentState, locked.expectedState)) {
      await this.cleanupLockedPlan(locked)
      return error('changed')
    }
    const session = cast<DesktopDestinationSession>(this.options.randomId())
    const destination: DestinationSession = {
      expiresAt: this.options.now() + MAX_DESKTOP_GRANT_SESSION_MS,
      expectedState: locked.expectedState,
      identity: request.identity,
      journalPath: locked.journalPath,
      label: locked.label,
      planDigest: locked.planDigest,
      entries: locked.entries.map(entry => ({
        absolutePath: entry.target.kind === 'selected-file'
          ? locked.path
          : join(locked.path, entry.target.relativePath),
        digest: entry.digest,
        entry,
        handle: undefined,
        offset: 0,
      })),
      parentIdentity: locked.parentIdentity,
      path: locked.path,
      publicationName: locked.publicationName,
      purpose: locked.purpose,
      recoveryPaths: [],
      snapshot: locked.snapshot,
      totalBytes: locked.totalBytes,
      stagingRevision: undefined,
      stagingRoot: undefined,
    }
    this.destinations.set(session, destination)
    this.scheduleExpiry()
    return { expiresAt: destination.expiresAt, expectedState: destination.expectedState, session }
  }

  async writeDestinationChunk(request: WriteDesktopDestinationChunkRequest, signal: AbortSignal): Promise<WriteDesktopDestinationChunkResult> {
    if (!exact(request, ['bytes', 'offset', 'planDigest', 'session', 'target']) || !text(request.session)
      || !digest(request.planDigest) || !targetValid(request.target)) return error('invalid-entry')
    const destination = this.destination(request.session)
    if (signal.aborted) {
      await this.closeDestination(request.session, destination)
      return error('aborted')
    }
    if (request.planDigest !== destination.planDigest) {
      await this.closeDestination(request.session, destination)
      return error('digest-mismatch')
    }
    if (!(request.bytes instanceof Uint8Array) || request.bytes.length > MAX_DESKTOP_DESTINATION_CHUNK_BYTES) {
      await this.closeDestination(request.session, destination)
      return error('limit-exceeded')
    }
    const entry = destination.entries.find(item => targetKey(item.entry.target) === targetKey(request.target))
    if (entry === undefined) {
      await this.closeDestination(request.session, destination)
      return error('invalid-entry')
    }
    if (!Number.isSafeInteger(request.offset) || request.offset !== entry.offset) {
      await this.closeDestination(request.session, destination)
      return error('stale')
    }
    if (entry.offset + request.bytes.length > entry.entry.size) {
      await this.closeDestination(request.session, destination)
      return error('size-mismatch')
    }
    await this.ensureStaging(destination)
    await this.options.onCheckpoint?.('write', signal)
    try {
      this.assertAuthority(destination.identity)
      if (signal.aborted) return error('aborted')
      await this.assertStagingStable(destination)
    } catch (cause) {
      await this.closeDestination(request.session, destination)
      throw cause
    }
    const staged = entry.stagedPath ?? join(destination.stagingRoot as string, request.target.kind === 'selected-file' ? 'selected-file' : request.target.relativePath)
    entry.stagedPath = staged
    await mkdir(dirname(staged), { recursive: true, mode: 0o700 })
    try {
      const handle = entry.handle ?? await open(
        staged,
        fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
        0o600,
      )
      entry.handle = handle
      const stat = await handle.stat()
      if (!stat.isFile() || Number(stat.size) !== entry.offset) return error('changed')
      await handle.write(request.bytes, 0, request.bytes.length, entry.offset)
    } catch (cause) {
      await this.closeDestination(request.session, destination)
      throw cause
    }
    if (signal.aborted) {
      await this.closeDestination(request.session, destination)
      return error('aborted')
    }
    entry.offset += request.bytes.length
    return { acceptedBytes: request.bytes.length, nextOffset: entry.offset }
  }

  async finalizeDestination(request: FinalizeDesktopDestinationRequest, signal: AbortSignal): Promise<FinalizeDesktopDestinationResult> {
    if (!exact(request, ['expectedState', 'planDigest', 'session']) || !stateValid(request.expectedState) || !digest(request.planDigest) || !text(request.session)) return error('invalid-entry')
    const destination = this.destination(request.session)
    if (signal.aborted) {
      await this.closeDestination(request.session, destination)
      return error('aborted')
    }
    if (request.planDigest !== destination.planDigest || !stateEqual(request.expectedState, destination.expectedState)) {
      await this.closeDestination(request.session, destination)
      return error('stale')
    }
    const planEntries = destination.entries.map(entry => entry.entry)
    const recomputed = computeDesktopDestinationPlanDigest((destination.publicationName === undefined
      ? {
          entries: planEntries,
          purpose: destination.purpose,
          totalBytes: destination.totalBytes,
        }
      : {
          entries: planEntries,
          publicationName: destination.publicationName,
          purpose: destination.purpose,
          totalBytes: destination.totalBytes,
        }) as unknown as DesktopDestinationPlan)
    if (recomputed !== destination.planDigest) {
      await this.closeDestination(request.session, destination)
      return error('digest-mismatch')
    }
    try {
      for (const entry of destination.entries) {
        if (entry.offset !== entry.entry.size || entry.stagedPath === undefined || entry.handle === undefined) return error('size-mismatch')
        await entry.handle.sync()
        const stagedStat = await entry.handle.stat()
        if (!stagedStat.isFile() || Number(stagedStat.size) !== entry.entry.size) return error('size-mismatch')
        const bytes = Buffer.alloc(entry.entry.size)
        const { bytesRead } = await entry.handle.read(bytes, 0, bytes.length, 0)
        if (signal.aborted) return error('aborted')
        if (bytesRead !== entry.entry.size || createHash('sha256').update(bytes).digest('hex') !== entry.digest) return error('digest-mismatch')
      }
      const current = await this.destinationState(destination.path, destination.purpose)
      if (!stateEqual(current, destination.expectedState)) return error('changed')
      const replaced = destination.expectedState.status === 'existing'
      await this.options.onCheckpoint?.('finalize', signal)
      this.assertAuthority(destination.identity)
      if (signal.aborted) return error('aborted')
      const commitState = await this.destinationState(destination.path, destination.purpose)
      if (!stateEqual(commitState, destination.expectedState)) return error('changed')
      this.assertDestinationParent(destination.path, destination.parentIdentity)
      await this.assertStagingStable(destination)
      for (const entry of destination.entries) {
        await entry.handle?.close()
        entry.handle = undefined
      }
      if (destination.purpose === 'vault-backup') {
        this.assertDestinationParent(destination.path, destination.parentIdentity)
        mkdirSync(destination.path, { recursive: false, mode: 0o700 })
        if (signal.aborted || !this.options.isAvailable()) {
          try { rmdirSync(destination.path) } catch { /* recovery handles residue */ }
          return error('aborted')
        }
        try {
          this.assertDestinationParent(destination.path, destination.parentIdentity)
          renameSync(destination.stagingRoot as string, destination.path)
          destination.stagingRoot = undefined
          destination.stagingRevision = undefined
        } catch (cause) {
          try { rmdirSync(destination.path) } catch { /* recovery handles residue */ }
          throw cause
        }
      } else {
        const selectedEntry = destination.entries[0]
        if (selectedEntry === undefined || selectedEntry.stagedPath === undefined) return error('invalid-entry')
        this.assertDestinationParent(destination.path, destination.parentIdentity)
        const commitPath = join(dirname(destination.path), `.tockteam-picker-commit-${this.options.randomId()}`)
        this.assertDestinationParent(destination.path, destination.parentIdentity)
        renameSync(selectedEntry.stagedPath, commitPath)
        selectedEntry.stagedPath = commitPath
        const stagedDirectory = destination.stagingRoot
        if (stagedDirectory === undefined) return error('closed')
        await rmdir(stagedDirectory)
        destination.stagingRoot = commitPath
        destination.stagingRevision = undefined
        if (destination.expectedState.status === 'absent') {
          try {
            this.assertDestinationParent(destination.path, destination.parentIdentity)
            linkSync(commitPath, destination.path)
            unlinkSync(commitPath)
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'EEXIST') return error('changed')
            throw cause
          }
        } else {
          const snapshot = destination.snapshot
          if (snapshot === undefined) return error('stale')
          const backupPath = join(dirname(destination.path), `.tockteam-picker-backup-${this.options.randomId()}`)
          await this.writeRecoveryJournal(destination, backupPath, commitPath, 'prepared')
          await this.options.onCheckpoint?.('journal-prepared', signal)
          this.assertDestinationParent(destination.path, destination.parentIdentity)
          renameSync(destination.path, backupPath)
          await this.writeRecoveryJournal(destination, backupPath, commitPath, 'moved')
          await this.options.onCheckpoint?.('backup-moved', signal)
          destination.recoveryPaths.push(backupPath)
          if (!await this.verifySnapshot(backupPath, snapshot)) {
            await this.restoreBackup(destination, backupPath)
            return error('changed')
          }
          await this.options.onCheckpoint?.('backup-verified', signal)
          try {
            this.assertDestinationParent(destination.path, destination.parentIdentity)
            linkSync(commitPath, destination.path)
            unlinkSync(commitPath)
            await this.options.onCheckpoint?.('target-published', signal)
          } catch (cause) {
            await this.restoreBackup(destination, backupPath)
            if ((cause as NodeJS.ErrnoException).code === 'EEXIST') return error('changed')
            throw cause
          }
          await this.syncDirectory(dirname(destination.path))
          await this.writeRecoveryJournal(destination, backupPath, commitPath, 'published')
          await this.options.onCheckpoint?.('journal-published', signal)
          this.assertDestinationParent(destination.path, destination.parentIdentity)
          unlinkSync(backupPath)
          destination.recoveryPaths = destination.recoveryPaths.filter(path => path !== backupPath)
          this.unlinkArtifact(snapshot.path, '.tockteam-picker-snapshot-')
          await this.syncDirectory(dirname(destination.path))
          await this.options.onCheckpoint?.('backup-removed', signal)
          if (destination.journalPath !== undefined) {
            this.unlinkArtifact(destination.journalPath, 'destination-')
            await this.syncDirectory(this.recoveryRoot)
            await this.options.onCheckpoint?.('journal-removed', signal)
          }
          destination.journalPath = undefined
          destination.snapshot = undefined
        }
        destination.stagingRoot = undefined
      }
      await this.syncDirectory(dirname(destination.path))
      const cleanup = await this.cleanupDestination(destination)
      if (cleanup.status !== 'complete') return error('owner-lost')
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
      const closed = await this.closeDestination(request.session, destination)
      if (cause instanceof TockTeamDesktopGrantError) throw cause
      return {
        cleanup: closed.cleanup,
        failedEntries: destination.entries.length,
        published: false,
        stagedBytes: closed.stagedBytes,
        stagedEntries: closed.stagedEntries,
        status: 'partial',
      }
    }
  }

  async abortDestination(request: AbortDesktopDestinationRequest): Promise<AbortDesktopDestinationResult> {
    if (!exact(request, ['session']) || !text(request.session)) return error('invalid-entry')
    const destination = this.destinations.get(request.session)
    if (destination !== undefined) return await this.closeDestination(request.session, destination)
    const closed = this.closedDestinations.get(request.session)
    if (closed === undefined) return error('closed')
    return { ...closed, status: 'already-closed' }
  }

  async disposeProvider(): Promise<{ cleanup: DesktopCleanupEvidence }> {
    await this.recoveryReady
    const residualLabels: DesktopPickerLabel[] = []
    for (const [session, destination] of [...this.destinations]) {
      const result = await this.closeDestination(session, destination)
      if (result.cleanup.status === 'residual') residualLabels.push(...result.cleanup.residualLabels)
    }
    for (const [authorization, plan] of [...this.destinationPlans]) {
      try {
        await this.cleanupLockedPlan(plan)
        this.destinationPlans.delete(authorization)
      } catch {
        residualLabels.push(cast(plan.label))
      }
    }
    for (const result of await Promise.allSettled([...this.cleanupTasks])) {
      if (result.status === 'rejected') residualLabels.push(cast(labelOf(this.recoveryRoot)))
      else if (typeof result.value === 'object' && result.value !== null
        && 'status' in result.value && result.value.status === 'residual'
        && 'residualLabels' in result.value && Array.isArray(result.value.residualLabels)) {
        residualLabels.push(...result.value.residualLabels as DesktopPickerLabel[])
      }
    }
    this.grants.clear()
    this.sources.clear()
    this.vaultSelectionClaims.clear()
    this.consumedPickOperations.clear()
    this.activeVault = undefined
    return { cleanup: residualLabels.length === 0 ? { status: 'complete' } : { residualLabels, status: 'residual' } }
  }

  async dispose(): Promise<void> {
    await this.recoveryReady
    this.disposed = true
    if (this.expiryTimer !== undefined) clearTimeout(this.expiryTimer)
    this.expiryTimer = undefined
    const cleanup = await this.clearSessions()
    await Promise.allSettled([...this.destinationPlans.values()].map(plan => this.cleanupLockedPlan(plan)))
    await Promise.allSettled([...this.cleanupTasks])
    this.grants.clear()
    this.destinationPlans.clear()
    this.vaultSelectionClaims.clear()
    this.consumedPickOperations.clear()
    this.activeVault = undefined
    if (cleanup.status !== 'complete') throw new Error('TockTeam Desktop picker cleanup was incomplete')
  }

  private async destinationPath(rawPath: string, purpose: 'export-html' | 'export-pdf'): Promise<{ path: string; label: string } | undefined> {
    const selected = resolve(rawPath)
    if (await this.hasUnsafeSymlinkAncestor(dirname(selected))) return undefined
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
    if (await this.hasUnsafeSymlinkAncestor(selected)) return undefined
    const stat = await this.safeLstat(selected)
    if (stat === undefined || stat.isSymbolicLink()) return undefined
    const kind = kindOf(stat)
    if (kind === undefined || kind === 'directory' && !allowed.directory || kind === 'file' && !allowed.file) return undefined
    if (kind === 'file' && !this.sourceExtensionAllowed(selected, purpose)) return undefined
    const canonical = await this.safeRealpath(selected)
    if (canonical === undefined) return undefined
    const canonicalStat = await this.safeLstat(canonical)
    if (canonicalStat === undefined || identityOf(canonicalStat) !== identityOf(stat)
      || kindOf(canonicalStat) !== kind) return undefined
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
    const boundary = this.activeVault
    if (boundary === undefined || !sameVaultBoundary(identity, boundary)) return error('stale')
    try {
      if (realpathSync(boundary.path) !== boundary.path) return error('stale')
      const stat = lstatSync(boundary.path)
      if (!stat.isDirectory() || stat.isSymbolicLink()
        || String(stat.dev) !== boundary.dev || String(stat.ino) !== boundary.ino) return error('stale')
    } catch (cause) {
      if (cause instanceof TockTeamDesktopGrantError) throw cause
      return error('stale')
    }
  }

  private async clearSessions(): Promise<DesktopCleanupEvidence> {
    const residualLabels: DesktopPickerLabel[] = []
    for (const [session, destination] of [...this.destinations]) {
      const result = await this.closeDestination(session, destination)
      if (result.cleanup.status === 'residual') residualLabels.push(...result.cleanup.residualLabels)
    }
    for (const [authorization, plan] of [...this.destinationPlans]) {
      await this.cleanupLockedPlan(plan)
      this.destinationPlans.delete(authorization)
    }
    this.sources.clear()
    return residualLabels.length === 0 ? { status: 'complete' } : { residualLabels, status: 'residual' }
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

  private scheduleExpiry(): void {
    if (this.disposed) return
    if (this.expiryTimer !== undefined) clearTimeout(this.expiryTimer)
    const expiries = [
      ...[...this.grants.values()].map(value => value.expiresAt),
      ...[...this.sources.values()].map(value => value.expiresAt),
      ...[...this.destinationPlans.values()].map(value => value.expiresAt),
      ...[...this.destinations.values()].map(value => value.expiresAt),
      ...[...this.vaultSelectionClaims.values()].map(value => value.expiresAt),
    ]
    if (expiries.length === 0) {
      this.expiryTimer = undefined
      return
    }
    const delay = Math.max(0, Math.min(...expiries) - this.options.now())
    this.expiryTimer = setTimeout(() => { void this.expire() }, delay)
    this.expiryTimer.unref()
  }

  private async expire(): Promise<void> {
    this.expiryTimer = undefined
    const now = this.options.now()
    for (const [authorization, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(authorization)
    for (const [session, source] of this.sources) if (source.expiresAt <= now) this.sources.delete(session)
    for (const [authorization, plan] of this.destinationPlans) {
      if (plan.expiresAt <= now) {
        this.destinationPlans.delete(authorization)
        await this.cleanupLockedPlan(plan)
      }
    }
    for (const [claim, selection] of this.vaultSelectionClaims) if (selection.expiresAt <= now) this.vaultSelectionClaims.delete(claim)
    for (const [session, destination] of this.destinations) {
      if (destination.expiresAt <= now) await this.closeDestination(session, destination)
    }
    this.scheduleExpiry()
  }

  private sweep(): void {
    const now = this.options.now()
    for (const [authorization, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(authorization)
    for (const [session, source] of this.sources) if (source.expiresAt <= now) this.sources.delete(session)
    for (const [authorization, plan] of this.destinationPlans) {
      if (plan.expiresAt <= now) {
        this.destinationPlans.delete(authorization)
        this.scheduleLockedPlanCleanup(plan)
      }
    }
    for (const [claim, selection] of this.vaultSelectionClaims) if (selection.expiresAt <= now) this.vaultSelectionClaims.delete(claim)
    for (const [session, destination] of this.destinations) {
      if (destination.expiresAt <= now) {
        this.scheduleCleanup(destination)
        this.destinations.delete(session)
      }
    }
  }

  private async hasUnsafeSymlinkAncestor(path: string): Promise<boolean> {
    const absolute = resolve(path)
    const { root } = parse(absolute)
    const segments = absolute.slice(root.length).split(sep).filter(Boolean)
    let current = root
    for (const segment of segments) {
      current = join(current, segment)
      const stat = await this.safeLstat(current)
      if (stat?.isSymbolicLink()) return true
    }
    return false
  }

  private async safeLstat(path: string): Promise<Stat | undefined> {
    try { return await lstat(path) } catch { return undefined }
  }

  private async safeRealpath(path: string): Promise<string | undefined> {
    try { return await realpath(path) } catch { return undefined }
  }

  private async assertUnchanged(source: SourceSession, entry: InternalSourceEntry): Promise<void> {
    for (const ancestor of entry.ancestors) {
      const canonical = await this.safeRealpath(ancestor.path)
      const stat = await this.safeLstat(ancestor.path)
      if (canonical === undefined || !within(source.path, canonical) && ancestor.path !== dirname(source.path)
        || stat === undefined || !stat.isDirectory() || identityOf(stat) !== ancestor.identity) return error('changed')
    }
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
      const parent = dirname(source.path)
      const parentStat = await this.safeLstat(parent)
      if (parentStat === undefined || !parentStat.isDirectory()) return error('unsafe-source')
      const internal: InternalSourceEntry = {
        absolutePath: source.path,
        ancestors: [{ identity: identityOf(parentStat), path: parent }],
        entry: fileEntry,
        revision: fileEntry.revision,
        size: fileEntry.size,
      }
      source.ordered.push(internal)
      return
    }
    let scannedBytes = 0
    const walk = async (
      directory: string,
      relativeRoot: string,
      depth: number,
      ancestors: Array<{ identity: string; path: string }>,
    ): Promise<void> => {
      if (depth > source.limits.maxDepth) return
      const canonical = await this.safeRealpath(directory)
      const directoryStat = await this.safeLstat(directory)
      if (canonical === undefined || !within(source.path, canonical)
        || directoryStat === undefined || !directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return error('unsafe-source')
      const currentAncestors = [...ancestors, { identity: identityOf(directoryStat), path: directory }]
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
            ancestors: currentAncestors,
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
          source.ordered.push({ absolutePath: childPath, ancestors: currentAncestors, entry, revision: entry.revision, size: 0 })
          if (depth < source.limits.maxDepth) await walk(childPath, relativePath, depth + 1, currentAncestors)
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
        source.ordered.push({ absolutePath: childPath, ancestors: currentAncestors, entry, revision: String(entry.revision), size })
        scannedBytes += size
      }
    }
    await walk(source.path, '', 0, [])
  }

  private unlinkArtifact(path: string, prefix: string): void {
    try {
      const stat = lstatSync(path)
      if (!stat.isFile() || stat.isSymbolicLink() || !basename(path).startsWith(prefix)) {
        return error('recovery-required')
      }
      unlinkSync(path)
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return
      if (cause instanceof TockTeamDesktopGrantError) throw cause
      return error('recovery-required')
    }
  }

  private async syncDirectory(path: string): Promise<void> {
    const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    try { await handle.sync() } finally { await handle.close() }
  }

  private validRecoveryRecord(value: unknown): value is DestinationRecoveryRecord {
    if (!exact(value, [
      'backupPath', 'commitPath', 'destinationPath', 'newDigest', 'newSize',
      'oldDigest', 'oldIdentity', 'oldSize', 'parentIdentity', 'snapshotPath', 'state', 'version',
    ]) || value.version !== 1 || typeof value.destinationPath !== 'string'
      || !isAbsolute(value.destinationPath) || resolve(value.destinationPath) !== value.destinationPath
      || typeof value.newDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(value.newDigest)
      || !Number.isSafeInteger(value.newSize) || Number(value.newSize) < 0
      || value.backupPath !== null && typeof value.backupPath !== 'string'
      || value.commitPath !== null && typeof value.commitPath !== 'string'
      || value.snapshotPath !== null && typeof value.snapshotPath !== 'string'
      || value.oldDigest !== null && (typeof value.oldDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(value.oldDigest))
      || value.oldIdentity !== null && typeof value.oldIdentity !== 'string'
      || typeof value.parentIdentity !== 'string' || value.parentIdentity.length === 0
      || value.oldSize !== null && (!Number.isSafeInteger(value.oldSize) || Number(value.oldSize) < 0)
      || [value.oldDigest, value.oldIdentity, value.oldSize].some(item => item === null)
        && [value.oldDigest, value.oldIdentity, value.oldSize].some(item => item !== null)
      || value.state !== 'locked' && value.state !== 'prepared'
        && value.state !== 'moved' && value.state !== 'published') return false
    const parent = dirname(value.destinationPath)
    const roles: Array<[string | null, string]> = [
      [value.backupPath, '.tockteam-picker-backup-'],
      [value.commitPath, '.tockteam-picker-commit-'],
      [value.snapshotPath, '.tockteam-picker-snapshot-'],
    ]
    const paths = roles.flatMap(([path]) => path === null ? [] : [path])
    return !basename(value.destinationPath).startsWith('.tockteam-picker-')
      && new Set([value.destinationPath, ...paths]).size === 1 + paths.length
      && roles.every(([path, prefix]) => path === null
        || isAbsolute(path) && resolve(path) === path && dirname(path) === parent && basename(path).startsWith(prefix))
  }

  private async ensureRecoveryRoot(): Promise<void> {
    await mkdir(this.recoveryRoot, { recursive: true, mode: 0o700 })
    const canonical = await this.safeRealpath(this.recoveryRoot)
    const stat = await this.safeLstat(this.recoveryRoot)
    if (canonical !== this.recoveryRoot || stat === undefined || !stat.isDirectory() || stat.isSymbolicLink()
      || typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
      return error('recovery-required')
    }
    await chmod(this.recoveryRoot, 0o700)
  }

  private unlinkRecoveryRecordArtifacts(
    value: DestinationRecoveryRecord,
    includeBackup: boolean,
  ): void {
    if (includeBackup && value.backupPath !== null) this.unlinkArtifact(value.backupPath, '.tockteam-picker-backup-')
    if (value.commitPath !== null) this.unlinkArtifact(value.commitPath, '.tockteam-picker-commit-')
    if (value.snapshotPath !== null) this.unlinkArtifact(value.snapshotPath, '.tockteam-picker-snapshot-')
  }

  private async recoverRegistered(): Promise<void> {
    await this.ensureRecoveryRoot()
    const entries = await readdir(this.recoveryRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('destination-') || !entry.name.endsWith('.json')) continue
      const journalPath = join(this.recoveryRoot, entry.name)
      let value: unknown
      try {
        const handle = await open(journalPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
        try {
          const journalStat = await handle.stat()
          if (!journalStat.isFile() || Number(journalStat.size) > 64 * 1024
            || (Number(journalStat.mode) & 0o777) !== 0o600
            || typeof process.getuid === 'function' && journalStat.uid !== process.getuid()) {
            this.recoveryCorrupt = true
            continue
          }
          value = JSON.parse(await handle.readFile('utf8')) as unknown
        } finally {
          await handle.close()
        }
      } catch {
        this.recoveryCorrupt = true
        continue
      }
      if (!this.validRecoveryRecord(value)) {
        this.recoveryCorrupt = true
        continue
      }
      const parent = dirname(value.destinationPath)
      try {
        this.assertDestinationParent(value.destinationPath, value.parentIdentity)
      } catch {
        this.recoveryBlockedDestinations.add(value.destinationPath)
        continue
      }
      const hasOld = value.oldDigest !== null && value.oldIdentity !== null && value.oldSize !== null
      const destinationNew = await this.verifyRecordedFile(value.destinationPath, value.newSize, value.newDigest)
      const destinationOld = hasOld
        && await this.verifyRecordedFile(value.destinationPath, value.oldSize as number, value.oldDigest as string, value.oldIdentity as string)
      const backupOld = hasOld && value.backupPath !== null
        && await this.verifyRecordedFile(value.backupPath, value.oldSize as number, value.oldDigest as string, value.oldIdentity as string)
      const snapshotOld = hasOld && value.snapshotPath !== null
        && await this.verifyRecordedFile(value.snapshotPath, value.oldSize as number, value.oldDigest as string)
      const commitNew = value.commitPath !== null
        && await this.verifyRecordedFile(value.commitPath, value.newSize, value.newDigest)
      const destinationExists = await this.safeLstat(value.destinationPath) !== undefined
      const backupExists = value.backupPath !== null && await this.safeLstat(value.backupPath) !== undefined

      if (destinationNew && backupOld && snapshotOld) {
        this.unlinkRecoveryRecordArtifacts(value, true)
        await this.syncDirectory(parent)
      } else if (destinationNew && !backupExists) {
        this.unlinkRecoveryRecordArtifacts(value, false)
        await this.syncDirectory(parent)
      } else if (!destinationExists && backupOld && snapshotOld && value.backupPath !== null) {
        this.assertDestinationParent(value.destinationPath, value.parentIdentity)
        linkSync(value.backupPath, value.destinationPath)
        await this.syncDirectory(parent)
        if (!await this.verifyRecordedFile(value.destinationPath, value.oldSize as number, value.oldDigest as string, value.oldIdentity as string)) {
          this.recoveryBlockedDestinations.add(value.destinationPath)
          continue
        }
        this.unlinkArtifact(value.backupPath, '.tockteam-picker-backup-')
        this.unlinkRecoveryRecordArtifacts(value, false)
        await this.syncDirectory(parent)
      } else if ((destinationOld && snapshotOld && !backupExists
          && (value.commitPath === null || commitNew))
        || (!hasOld && value.state === 'locked' && value.backupPath === null && value.commitPath === null)) {
        this.unlinkRecoveryRecordArtifacts(value, false)
        await this.syncDirectory(parent)
      } else {
        this.recoveryBlockedDestinations.add(value.destinationPath)
        continue
      }
      this.unlinkArtifact(journalPath, 'destination-')
      await this.syncDirectory(this.recoveryRoot)
    }
  }

  private async recoverParent(parent: string): Promise<void> {
    await this.recoveryReady
    if (this.recoveryCorrupt) return error('recovery-required')
    if ([...this.recoveryBlockedDestinations].some(path => dirname(path) === parent)) return error('recovery-required')
  }

  private async writeRecoveryRecord(
    journalPath: string | undefined,
    record: DestinationRecoveryRecord,
  ): Promise<string> {
    await this.ensureRecoveryRoot()
    const path = journalPath ?? join(this.recoveryRoot, `destination-${this.options.randomId()}.json`)
    const temporary = `${path}.tmp-${this.options.randomId()}`
    const handle = await open(
      temporary,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    )
    try {
      await handle.writeFile(JSON.stringify(record), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
    await this.syncDirectory(this.recoveryRoot)
    return path
  }

  private async writeRecoveryJournal(
    destination: DestinationSession,
    backupPath: string,
    commitPath: string,
    state: 'prepared' | 'moved' | 'published',
  ): Promise<void> {
    destination.journalPath = await this.writeRecoveryRecord(destination.journalPath, {
      backupPath,
      commitPath,
      destinationPath: destination.path,
      newDigest: destination.entries[0]?.digest ?? '',
      newSize: destination.totalBytes,
      oldDigest: destination.snapshot?.contentDigest ?? null,
      oldIdentity: destination.snapshot?.identity ?? null,
      oldSize: destination.snapshot?.size ?? null,
      parentIdentity: destination.parentIdentity,
      snapshotPath: destination.snapshot?.path ?? null,
      state,
      version: 1,
    })
  }

  private async verifyRecordedFile(
    path: string,
    size: number,
    digest: string,
    identity?: string,
  ): Promise<boolean> {
    try {
      const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || Number(stat.size) !== size
          || identity !== undefined && identityOf(stat) !== identity) return false
        const hash = createHash('sha256')
        const buffer = Buffer.alloc(MAX_DESKTOP_DESTINATION_CHUNK_BYTES)
        let offset = 0
        while (offset < size) {
          const length = Math.min(buffer.length, size - offset)
          const result = await handle.read(buffer, 0, length, offset)
          if (result.bytesRead !== length) return false
          hash.update(buffer.subarray(0, length))
          offset += length
        }
        return hash.digest('hex') === digest
      } finally {
        await handle.close()
      }
    } catch {
      return false
    }
  }

  private async verifySnapshot(path: string, snapshot: ExistingDestinationSnapshot): Promise<boolean> {
    return await this.verifyRecordedFile(path, snapshot.size, snapshot.contentDigest, snapshot.identity)
      && (await this.safeLstat(path))?.isFile() === true
  }

  private async restoreBackup(
    destination: DestinationSession,
    backupPath: string,
  ): Promise<boolean> {
    try {
      this.assertDestinationParent(destination.path, destination.parentIdentity)
      linkSync(backupPath, destination.path)
      await this.syncDirectory(dirname(destination.path))
      if (destination.snapshot === undefined
        || !await this.verifySnapshot(destination.path, destination.snapshot)) {
        if (!destination.recoveryPaths.includes(backupPath)) destination.recoveryPaths.push(backupPath)
        return false
      }
      this.assertDestinationParent(destination.path, destination.parentIdentity)
      unlinkSync(backupPath)
      await this.syncDirectory(dirname(destination.path))
      destination.recoveryPaths = destination.recoveryPaths.filter(path => path !== backupPath)
      return true
    } catch {
      if (!destination.recoveryPaths.includes(backupPath)) destination.recoveryPaths.push(backupPath)
      return false
    }
  }

  private async captureDestination(
    path: string,
    purpose: DesktopExportPurpose,
    newDigest: string,
    newSize: number,
    parentIdentity: string,
  ): Promise<{
    expectedState: DesktopDestinationState
    journalPath: string | undefined
    snapshot: ExistingDestinationSnapshot | undefined
  }> {
    const stat = await this.safeLstat(path)
    if (stat === undefined) return { expectedState: { status: 'absent' }, journalPath: undefined, snapshot: undefined }
    if (purpose === 'vault-backup' || !stat.isFile() || stat.isSymbolicLink()
      || await this.hasUnsafeSymlinkAncestor(path)) return error('exists')
    if (Number(stat.size) > MAX_DESKTOP_SOURCE_TOTAL_BYTES) return error('limit-exceeded')
    const source = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    const snapshotPath = join(dirname(path), `.tockteam-picker-snapshot-${this.options.randomId()}`)
    let journalPath: string | undefined
    let snapshot: Awaited<ReturnType<typeof open>> | undefined
    try {
      const before = await source.stat()
      if (!before.isFile() || identityOf(before) !== identityOf(stat)) return error('changed')
      const oldHash = createHash('sha256')
      const buffer = Buffer.alloc(MAX_DESKTOP_DESTINATION_CHUNK_BYTES)
      let offset = 0
      while (offset < Number(before.size)) {
        const length = Math.min(buffer.length, Number(before.size) - offset)
        const read = await source.read(buffer, 0, length, offset)
        if (read.bytesRead !== length) return error('changed')
        oldHash.update(buffer.subarray(0, length))
        offset += length
      }
      const contentDigest = oldHash.digest('hex')
      const afterHash = await source.stat()
      const current = await this.safeLstat(path)
      if (revisionOf(afterHash) !== revisionOf(before) || current === undefined
        || identityOf(current) !== identityOf(before) || revisionOf(current) !== revisionOf(before)) return error('changed')
      journalPath = await this.writeRecoveryRecord(undefined, {
        backupPath: null,
        commitPath: null,
        destinationPath: path,
        newDigest,
        newSize,
        oldDigest: contentDigest,
        oldIdentity: identityOf(before),
        oldSize: Number(before.size),
        parentIdentity,
        snapshotPath,
        state: 'locked',
        version: 1,
      })
      snapshot = await open(
        snapshotPath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
        0o600,
      )
      offset = 0
      while (offset < Number(before.size)) {
        const length = Math.min(buffer.length, Number(before.size) - offset)
        const read = await source.read(buffer, 0, length, offset)
        if (read.bytesRead !== length) return error('changed')
        await snapshot.write(buffer, 0, length, offset)
        offset += length
      }
      await snapshot.sync()
      const afterCopy = await source.stat()
      const currentAfterCopy = await this.safeLstat(path)
      if (revisionOf(afterCopy) !== revisionOf(before) || currentAfterCopy === undefined
        || identityOf(currentAfterCopy) !== identityOf(before)
        || revisionOf(currentAfterCopy) !== revisionOf(before)) return error('changed')
      const revision = revisionOf(before)
      return {
        expectedState: { replaceAuthorized: true, revision: cast(revision), status: 'existing' },
        journalPath,
        snapshot: {
          contentDigest,
          identity: identityOf(before),
          path: snapshotPath,
          revision,
          size: Number(before.size),
        },
      }
    } catch (cause) {
      await Promise.allSettled([
        rm(snapshotPath, { force: true }),
        ...(journalPath === undefined ? [] : [rm(journalPath, { force: true })]),
      ])
      await this.syncDirectory(dirname(path)).catch(() => {})
      if (journalPath !== undefined) await this.syncDirectory(this.recoveryRoot).catch(() => {})
      throw cause
    } finally {
      await Promise.allSettled([source.close(), ...(snapshot === undefined ? [] : [snapshot.close()])])
    }
  }

  private async destinationState(path: string, purpose: DesktopExportPurpose): Promise<DesktopDestinationState> {
    const stat = await this.safeLstat(path)
    if (stat === undefined) return { status: 'absent' }
    if (purpose === 'vault-backup' || !stat.isFile()) return error('exists')
    return { replaceAuthorized: true, revision: cast(revisionOf(stat)), status: 'existing' }
  }

  private validateDestinationPlan(
    request: DesktopDestinationPlan & { planDigest: import('./host-contract.ts').DesktopSha256 },
    selectedPath: string,
  ): void {
    if (computeDesktopDestinationPlanDigest(destinationPlanOf(request)) !== request.planDigest) return error('digest-mismatch')
    if (request.purpose === 'export-html' || request.purpose === 'export-pdf') {
      const extension = extname(selectedPath).slice(1).toLowerCase()
      if (extension !== request.purpose.slice('export-'.length)) return error('purpose-mismatch')
    }
  }

  private assertDestinationParent(path: string, expectedIdentity: string): void {
    const parent = dirname(path)
    try {
      const stat = lstatSync(parent)
      if (realpathSync(parent) !== parent || !stat.isDirectory() || stat.isSymbolicLink()
        || identityOf(stat) !== expectedIdentity) return error('unsafe-target')
    } catch (cause) {
      if (cause instanceof TockTeamDesktopGrantError) throw cause
      return error('unsafe-target')
    }
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

  private async cleanupLockedPlan(plan: LockedDestinationPlan): Promise<void> {
    if (plan.snapshot !== undefined) {
      this.unlinkArtifact(plan.snapshot.path, '.tockteam-picker-snapshot-')
      await this.syncDirectory(dirname(plan.snapshot.path))
    }
    if (plan.journalPath !== undefined) {
      this.unlinkArtifact(plan.journalPath, 'destination-')
      await this.syncDirectory(this.recoveryRoot)
    }
  }

  private scheduleLockedPlanCleanup(plan: LockedDestinationPlan): void {
    const task = this.cleanupLockedPlan(plan)
    this.cleanupTasks.add(task)
    void task.finally(() => { this.cleanupTasks.delete(task) })
  }

  private async closeDestination(
    session: string,
    destination: DestinationSession,
  ): Promise<AbortDesktopDestinationResult> {
    const stagedBytes = destination.entries.reduce((sum, entry) => sum + entry.offset, 0)
    const stagedEntries = destination.entries.filter(entry => entry.offset > 0).length
    const cleanup = await this.cleanupDestination(destination)
    this.destinations.delete(session)
    const result: AbortDesktopDestinationResult = { cleanup, stagedBytes, stagedEntries, status: 'aborted' }
    this.closedDestinations.set(session, result)
    if (this.closedDestinations.size > 1024) {
      const oldest = this.closedDestinations.keys().next().value as string | undefined
      if (oldest !== undefined) this.closedDestinations.delete(oldest)
    }
    return result
  }

  private scheduleCleanup(destination: DestinationSession): void {
    const task = this.cleanupDestination(destination)
    this.cleanupTasks.add(task)
    void task.finally(() => { this.cleanupTasks.delete(task) })
  }

  private async cleanupDestination(destination: DestinationSession): Promise<DesktopCleanupEvidence> {
    const residualLabels: DesktopPickerLabel[] = destination.recoveryPaths.map(path => cast(labelOf(path)))
    for (const entry of destination.entries) {
      if (entry.handle === undefined) continue
      try {
        await entry.handle.truncate(0)
        await entry.handle.sync()
        await entry.handle.close()
        entry.handle = undefined
      } catch {
        residualLabels.push(cast(labelOf(entry.absolutePath)))
      }
    }
    if (destination.stagingRoot !== undefined) {
      const stagingRoot = destination.stagingRoot
      try {
        this.assertDestinationParent(destination.path, destination.parentIdentity)
        await this.assertStagingStable(destination)
        const stagedDirectories = new Set<string>()
        for (const entry of destination.entries) {
          if (entry.stagedPath === undefined) continue
          this.unlinkArtifact(entry.stagedPath, basename(entry.stagedPath))
          for (let directory = dirname(entry.stagedPath); directory !== stagingRoot; directory = dirname(directory)) {
            if (!directory.startsWith(`${stagingRoot}${sep}`)) throw new TockTeamDesktopGrantError('recovery-required')
            stagedDirectories.add(directory)
          }
        }
        for (const directory of [...stagedDirectories].sort((left, right) => right.length - left.length)) await rmdir(directory)
        await rmdir(stagingRoot)
        await this.syncDirectory(dirname(stagingRoot))
        destination.stagingRoot = undefined
        destination.stagingRevision = undefined
      } catch {
        residualLabels.push(cast(labelOf(stagingRoot)))
      }
    }
    if (residualLabels.length === 0 && destination.snapshot !== undefined) {
      const snapshotPath = destination.snapshot.path
      try {
        this.unlinkArtifact(snapshotPath, '.tockteam-picker-snapshot-')
        await this.syncDirectory(dirname(snapshotPath))
        destination.snapshot = undefined
      } catch {
        residualLabels.push(cast(labelOf(snapshotPath)))
      }
    }
    if (residualLabels.length === 0 && destination.journalPath !== undefined) {
      const journalPath = destination.journalPath
      try {
        this.unlinkArtifact(journalPath, 'destination-')
        await this.syncDirectory(this.recoveryRoot)
        destination.journalPath = undefined
      } catch {
        residualLabels.push(cast(labelOf(journalPath)))
      }
    }
    return residualLabels.length === 0
      ? { status: 'complete' }
      : { residualLabels, status: 'residual' }
  }
}
