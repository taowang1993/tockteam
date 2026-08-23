import { createHash } from 'node:crypto'

export interface NativeRequestIdentity {
  requestId: string
  windowId: string
  sessionId: string
  vaultId: string | null
  vaultGeneration: number
}

export type TockTutorProtocolRequest = {
  action: 'open' | 'new' | 'daily' | 'unique' | 'search' | 'choose-vault'
  vault?: string
  file?: string
  name?: string
  content?: string
  query?: string
  clipboard?: true
  ifExists?: 'prepend' | 'append' | 'overwrite'
  silent?: true
  paneType?: 'tab' | 'split' | 'window'
  xSuccess?: string
  xError?: string
}

export const TOCKTEAM_DESKTOP_PICKER_SERVICE = 'tockTeamDesktopPicker' as const
export const TOCKTEAM_DESKTOP_DISPATCH_SERVICE = 'tockTeamDesktopDispatch' as const
export const TOCKTEAM_DESKTOP_POPOUT_SERVICE = 'tockTeamDesktopPopOut' as const
export const TOCKTEAM_DESKTOP_MICROPHONE_SERVICE = 'tockTeamDesktopMicrophone' as const
export const TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE = 'tockTeamDesktopPrintExport' as const
export const TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE = 'tockTeamDesktopVaultSelection' as const

/** Hard ceilings; a source request may only choose stricter positive limits. */
export const MAX_DESKTOP_SOURCE_ENTRIES = 100_000
export const MAX_DESKTOP_SOURCE_DEPTH = 128
export const MAX_DESKTOP_SOURCE_ENTRY_BYTES = 1024 * 1024 * 1024
export const MAX_DESKTOP_SOURCE_TOTAL_BYTES = 1024 * 1024 * 1024
export const MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES = 4096
export const MAX_DESKTOP_SOURCE_PAGE_ENTRIES = 256
export const MAX_DESKTOP_DESTINATION_CHUNK_BYTES = 1024 * 1024
export const MAX_DESKTOP_GRANT_SESSION_MS = 15 * 60 * 1000
export const DESKTOP_DESTINATION_PLAN_VERSION = 1 as const
export const MAX_PRINT_EXPORT_HTML_BYTES = 8 * 1024 * 1024
export const MAX_PRINT_EXPORT_TITLE_BYTES = 512
export const MAX_PRINT_EXPORT_RESOURCE_REFERENCES = 256
export const MAX_PRINT_EXPORT_RESOURCE_URL_BYTES = 2 * 1024 * 1024

export type NativeFailureStatus = 'cancelled' | 'denied' | 'stale' | 'unavailable'

export type NativeOperationIdentity = NativeRequestIdentity & {
  operationId: string
}

export type NativeFailureResult = {
  operationId: string
  status: NativeFailureStatus
}

export type DesktopPickerIdentity = NativeOperationIdentity
export type DesktopPickerAuthorization = string & {
  readonly __desktopPickerAuthorization: unique symbol
}
export type DesktopPickerLabel = string & {
  readonly __desktopPickerLabel: unique symbol
}
export type DesktopSha256 = string & {
  readonly __desktopSha256: unique symbol
}
export type DesktopDestinationPlanAuthorization = string & {
  readonly __desktopDestinationPlanAuthorization: unique symbol
}
export type DesktopSourceSession = string & {
  readonly __desktopSourceSession: unique symbol
}
export type DesktopDestinationSession = string & {
  readonly __desktopDestinationSession: unique symbol
}
export type DesktopSourceEntryId = string & {
  readonly __desktopSourceEntryId: unique symbol
}
export type DesktopSourceCursor = string & {
  readonly __desktopSourceCursor: unique symbol
}
export type DesktopOpaqueRevision = string & {
  readonly __desktopOpaqueRevision: unique symbol
}
export type DesktopSafeRelativePath = string & {
  readonly __desktopSafeRelativePath: unique symbol
}
export type TockTeamDesktopVaultSelectionClaim = string & {
  readonly __tockTeamDesktopVaultSelectionClaim: unique symbol
}

export type DesktopSourcePurpose =
  | 'markdown-folder'
  | 'markdown-zip'
  | 'html'
  | 'csv'
  | 'apple-journal'
  | 'bear-backup'
  | 'evernote'
  | 'google-keep'
  | 'roam-research'
  | 'textbundle'
  | 'restore-backup'

export type DesktopExportPurpose = 'export-html' | 'export-pdf' | 'vault-backup'

export type DesktopPickerRequest = { identity: DesktopPickerIdentity } & (
  | { kind: 'vault'; purpose: 'activate' }
  | { kind: 'source'; purpose: DesktopSourcePurpose }
  | { kind: 'destination'; purpose: DesktopExportPurpose }
)

export type DesktopPickerResult = NativeFailureResult | {
  authorization: DesktopPickerAuthorization
  label: DesktopPickerLabel
  operationId: string
  status: 'selected'
}

export interface DesktopSourceLimits {
  maxDepth: number
  maxEntries: number
  maxEntryBytes: number
  maxRelativePathBytes: number
  maxTotalBytes: number
}

export type DesktopSourceRejectionReason =
  | 'depth-limit'
  | 'entry-limit'
  | 'hardlink'
  | 'invalid-name'
  | 'special-file'
  | 'symlink'
  | 'total-bytes-limit'

export type DesktopSourceEntry =
  | {
      entryId: DesktopSourceEntryId
      kind: 'directory'
      relativePath: DesktopSafeRelativePath
      revision: DesktopOpaqueRevision
    }
  | {
      entryId: DesktopSourceEntryId
      kind: 'file'
      relativePath: DesktopSafeRelativePath
      revision: DesktopOpaqueRevision
      size: number
    }
  | {
      kind: 'rejected'
      label: DesktopPickerLabel
      reason: DesktopSourceRejectionReason
    }

export type DesktopSourceFileEntry = Extract<DesktopSourceEntry, { kind: 'file' }>

export type DesktopSourceRoot =
  | {
      entry: DesktopSourceFileEntry
      kind: 'file'
      revision: DesktopOpaqueRevision
    }
  | {
      kind: 'directory'
      revision: DesktopOpaqueRevision
    }

export interface BeginDesktopSourceRequest {
  authorization: DesktopPickerAuthorization
  identity: DesktopPickerIdentity
  limits: DesktopSourceLimits
  purpose: DesktopSourcePurpose
}

export interface BeginDesktopSourceResult {
  expiresAt: number
  root: DesktopSourceRoot
  session: DesktopSourceSession
}

export interface ListDesktopSourceRequest {
  cursor?: DesktopSourceCursor | null
  limit: number
  session: DesktopSourceSession
}

export interface ListDesktopSourceResult {
  complete: boolean
  cursor: DesktopSourceCursor | null
  entries: DesktopSourceEntry[]
  rootRevision: DesktopOpaqueRevision
  scannedBytes: number
  scannedEntries: number
  truncated: boolean
  truncationReason: 'depth-limit' | 'entry-limit' | 'total-bytes-limit' | null
}

export interface StatDesktopSourceRequest {
  entryId: DesktopSourceEntryId
  session: DesktopSourceSession
}

export type StatDesktopSourceResult = Exclude<DesktopSourceEntry, { kind: 'rejected' }>

export interface ReadDesktopSourceRequest {
  entryId: DesktopSourceEntryId
  expectedRevision: DesktopOpaqueRevision
  expectedSize: number
  length: number
  offset: number
  session: DesktopSourceSession
}

export interface ReadDesktopSourceResult {
  bytes: Uint8Array
  complete: boolean
  nextOffset: number
  revision: DesktopOpaqueRevision
  size: number
}

export interface RevalidateDesktopSourceRequest {
  expectedRootRevision: DesktopOpaqueRevision
  session: DesktopSourceSession
}

export interface RevalidateDesktopSourceResult {
  revision: DesktopOpaqueRevision
  status: 'unchanged'
}

export interface ReleaseDesktopSourceRequest {
  session: DesktopSourceSession
}

export interface ReleaseDesktopSourceResult {
  status: 'released' | 'already-released'
}

export type DesktopDestinationTarget = { kind: 'selected-file' }

export interface DesktopDestinationPlanEntry {
  digest: DesktopSha256
  size: number
  target: DesktopDestinationTarget
}

export type DesktopSelectedFilePlanEntry = Omit<DesktopDestinationPlanEntry, 'target'> & {
  target: Extract<DesktopDestinationTarget, { kind: 'selected-file' }>
}

/** Desktop destinations are create-only; callers must choose a new filename. */
export type DesktopDestinationState = { status: 'absent' }

/**
 * Destination policy is purpose-owned, not caller-configurable. Every purpose
 * publishes one opaque selected file with an exact digest and size. The
 * Import/Export owner, not Desktop, owns the versioned vault-backup archive
 * codec and its normalized nested manifest.
 */
export type DesktopDestinationPlan =
  | {
      entries: readonly [DesktopSelectedFilePlanEntry]
      publicationName?: never
      purpose: 'export-html' | 'export-pdf'
      totalBytes: number
    }
  | {
      entries: readonly [DesktopSelectedFilePlanEntry]
      publicationName?: never
      purpose: 'vault-backup'
      totalBytes: number
    }

function hasExactKeys(value: object, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value)
  return required.every(key => Object.hasOwn(value, key))
    && keys.every(key => required.includes(key) || optional.includes(key))
}

function isSafeInteger(value: unknown, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= 0
    && value <= maximum
}

/** Validate and hash the exact ordered destination plan reviewed by the user. */
export function computeDesktopDestinationPlanDigest(input: DesktopDestinationPlan): DesktopSha256 {
  if (typeof input !== 'object' || input === null
    || !hasExactKeys(input, ['entries', 'purpose', 'totalBytes'], ['publicationName'])
    || !Array.isArray(input.entries)) throw new TockTeamDesktopGrantError('invalid-entry')
  if (input.purpose !== 'export-html' && input.purpose !== 'export-pdf' && input.purpose !== 'vault-backup') {
    throw new TockTeamDesktopGrantError('purpose-mismatch')
  }
  const entries = input.entries as readonly DesktopDestinationPlanEntry[]
  if (entries.length === 0 || entries.length > MAX_DESKTOP_SOURCE_ENTRIES) {
    throw new TockTeamDesktopGrantError('limit-exceeded')
  }
  if (!isSafeInteger(input.totalBytes, MAX_DESKTOP_SOURCE_TOTAL_BYTES)) {
    throw new TockTeamDesktopGrantError('limit-exceeded')
  }

  let totalBytes = 0
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null
      || !hasExactKeys(entry, ['digest', 'size', 'target'])) {
      throw new TockTeamDesktopGrantError('invalid-entry')
    }
    if (!/^[0-9a-f]{64}$/u.test(entry.digest)) {
      throw new TockTeamDesktopGrantError('digest-mismatch')
    }
    if (!isSafeInteger(entry.size, MAX_DESKTOP_SOURCE_ENTRY_BYTES)) {
      throw new TockTeamDesktopGrantError('limit-exceeded')
    }
    totalBytes += entry.size
    if (totalBytes > MAX_DESKTOP_SOURCE_TOTAL_BYTES) {
      throw new TockTeamDesktopGrantError('limit-exceeded')
    }
    if (typeof entry.target !== 'object' || entry.target === null) {
      throw new TockTeamDesktopGrantError('unsafe-target')
    }
    if (entry.target.kind !== 'selected-file' || !hasExactKeys(entry.target, ['kind'])) {
      throw new TockTeamDesktopGrantError('unsafe-target')
    }
  }
  if (totalBytes !== input.totalBytes) throw new TockTeamDesktopGrantError('size-mismatch')

  if (entries.length !== 1
    || entries[0]?.target.kind !== 'selected-file'
    || Object.hasOwn(input, 'publicationName')) {
    throw new TockTeamDesktopGrantError('purpose-mismatch')
  }

  const canonical = [
    'tockteam-destination-plan',
    DESKTOP_DESTINATION_PLAN_VERSION,
    input.purpose,
    input.publicationName ?? null,
    input.totalBytes,
    entries.map(entry => [
      entry.target.kind,
      null,
      entry.size,
      entry.digest,
    ]),
  ]
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex') as DesktopSha256
}

type DesktopDestinationPlanRequestBase = {
  identity: DesktopPickerIdentity
  planDigest: DesktopSha256
}

export type LockDesktopDestinationPlanRequest = DesktopDestinationPlan & DesktopDestinationPlanRequestBase & {
  selectionAuthorization: DesktopPickerAuthorization
}

export interface LockDesktopDestinationPlanResult {
  authorization: DesktopDestinationPlanAuthorization
  expectedState: DesktopDestinationState
  expiresAt: number
}

export interface RevokeDesktopDestinationPlanRequest {
  authorization: DesktopDestinationPlanAuthorization
}

export interface RevokeDesktopDestinationPlanResult {
  status: 'revoked' | 'already-closed'
}

export type BeginDesktopDestinationRequest = DesktopDestinationPlan & DesktopDestinationPlanRequestBase & {
  authorization: DesktopDestinationPlanAuthorization
}

export interface BeginDesktopDestinationResult {
  expiresAt: number
  expectedState: DesktopDestinationState
  session: DesktopDestinationSession
}

export interface WriteDesktopDestinationChunkRequest {
  bytes: Uint8Array
  offset: number
  planDigest: DesktopSha256
  session: DesktopDestinationSession
  target: DesktopDestinationTarget
}

export interface WriteDesktopDestinationChunkResult {
  acceptedBytes: number
  nextOffset: number
}

export interface FinalizeDesktopDestinationRequest {
  expectedState: DesktopDestinationState
  planDigest: DesktopSha256
  session: DesktopDestinationSession
}

/**
 * `complete` means no managed artifact was created. `scrubbed` retains only
 * exact-fd-zeroed payload residue and a resolved tombstone. `retained` also
 * retains the verified published staging alias. `residual` requires reviewed
 * recovery. No status claims namespace deletion. After restart, only a stable,
 * strictly valid resolved tombstone is nonblocking; unresolved or mismatched
 * evidence requires reviewed manual recovery.
 */
export type DesktopCleanupEvidence =
  | { status: 'complete' }
  | { residualLabels: DesktopPickerLabel[]; status: 'scrubbed' | 'retained' | 'residual' }

export type FinalizeDesktopDestinationResult =
  | {
      bytes: number
      cleanup: DesktopCleanupEvidence
      entries: number
      label: DesktopPickerLabel
      planDigest: DesktopSha256
      status: 'published'
    }
  | {
      cleanup: DesktopCleanupEvidence
      failedEntries: number
      published: false
      stagedBytes: number
      stagedEntries: number
      status: 'partial'
    }

export interface AbortDesktopDestinationRequest {
  session: DesktopDestinationSession
}

/**
 * Owners retain a bounded closed-session tombstone after drift or failed cleanup
 * so a later idempotent abort can return staging and residual-cleanup evidence.
 */
export interface AbortDesktopDestinationResult {
  cleanup: DesktopCleanupEvidence
  stagedBytes: number
  stagedEntries: number
  status: 'aborted' | 'already-closed'
}

export type DesktopGrantErrorCode =
  | 'aborted'
  | 'changed'
  | 'closed'
  | 'digest-mismatch'
  | 'exists'
  | 'expired'
  | 'invalid-entry'
  | 'limit-exceeded'
  | 'owner-lost'
  | 'purpose-mismatch'
  | 'recovery-required'
  | 'replayed'
  | 'size-mismatch'
  | 'stale'
  | 'unsafe-source'
  | 'unsafe-target'

const DESKTOP_GRANT_ERROR_MESSAGES: Record<DesktopGrantErrorCode, string> = {
  aborted: 'The Desktop grant operation was aborted.',
  changed: 'The selected item changed.',
  closed: 'The Desktop grant session is closed.',
  'digest-mismatch': 'The content digest did not match.',
  exists: 'The destination already exists.',
  expired: 'The Desktop grant expired.',
  'invalid-entry': 'The selected entry is invalid.',
  'limit-exceeded': 'A Desktop grant limit was exceeded.',
  'owner-lost': 'The Desktop owner is unavailable.',
  'purpose-mismatch': 'The Desktop grant purpose did not match.',
  'recovery-required': 'Desktop destination recovery requires user action.',
  replayed: 'The Desktop grant was already consumed.',
  'size-mismatch': 'The content size did not match.',
  stale: 'The Desktop grant is stale.',
  'unsafe-source': 'The selected source is unsafe.',
  'unsafe-target': 'The selected destination is unsafe.',
}

/** A code-only path-free rejection from a picker grant/session operation. */
export class TockTeamDesktopGrantError extends Error {
  readonly code: DesktopGrantErrorCode

  constructor(code: DesktopGrantErrorCode) {
    const normalized = Object.hasOwn(DESKTOP_GRANT_ERROR_MESSAGES, code)
      ? code
      : 'owner-lost'
    super(DESKTOP_GRANT_ERROR_MESSAGES[normalized])
    this.name = 'TockTeamDesktopGrantError'
    this.code = normalized
  }
}

/**
 * A successful pick returns one use of purpose/identity-bound authorization.
 * beginSource consumes a source grant directly. Destinations first consume their
 * selection through lockDestinationPlan, bind the exact reviewed plan and target
 * state to a fresh Host-private authorization, then begin staging after approval.
 * Sessions, cursors, entry IDs, revisions, and plan authorizations never resolve
 * to native paths. Source reads are sequential <=1 MiB chunks and check
 * size/revision; destination chunks repeat the plan digest and finalize only after
 * plan/digest/state checks. releaseSource, revokeDestinationPlan, and
 * abortDestination deliberately remain non-cancellable so bounded, idempotent
 * cleanup runs after cancellation, window loss, owner loss, or unload.
 */
export interface TockTeamDesktopPickerService {
  abortDestination(request: AbortDesktopDestinationRequest): Promise<AbortDesktopDestinationResult>
  beginDestination(
    request: BeginDesktopDestinationRequest,
    signal: AbortSignal,
  ): Promise<BeginDesktopDestinationResult>
  beginSource(
    request: BeginDesktopSourceRequest,
    signal: AbortSignal,
  ): Promise<BeginDesktopSourceResult>
  finalizeDestination(
    request: FinalizeDesktopDestinationRequest,
    signal: AbortSignal,
  ): Promise<FinalizeDesktopDestinationResult>
  listSource(
    request: ListDesktopSourceRequest,
    signal: AbortSignal,
  ): Promise<ListDesktopSourceResult>
  lockDestinationPlan(
    request: LockDesktopDestinationPlanRequest,
    signal: AbortSignal,
  ): Promise<LockDesktopDestinationPlanResult>
  pick(request: DesktopPickerRequest, signal: AbortSignal): Promise<DesktopPickerResult>
  readSource(
    request: ReadDesktopSourceRequest,
    signal: AbortSignal,
  ): Promise<ReadDesktopSourceResult>
  releaseSource(request: ReleaseDesktopSourceRequest): Promise<ReleaseDesktopSourceResult>
  revokeDestinationPlan(
    request: RevokeDesktopDestinationPlanRequest,
  ): Promise<RevokeDesktopDestinationPlanResult>
  revalidateSource(
    request: RevalidateDesktopSourceRequest,
    signal: AbortSignal,
  ): Promise<RevalidateDesktopSourceResult>
  statSource(
    request: StatDesktopSourceRequest,
    signal: AbortSignal,
  ): Promise<StatDesktopSourceResult>
  writeDestinationChunk(
    request: WriteDesktopDestinationChunkRequest,
    signal: AbortSignal,
  ): Promise<WriteDesktopDestinationChunkResult>
}

export type TockTeamDesktopPicker = TockTeamDesktopPickerService

export type TockTeamDesktopVaultSelectionIdentity = DesktopPickerIdentity

/** Unsigned base-10 bigint strings captured from the selected directory. */
export interface TockTeamDesktopVaultSelectionFileIdentity {
  dev: string
  ino: string
}

export type TockTeamDesktopVaultSelectionFailureStatus = NativeFailureStatus

export interface TockTeamDesktopVaultSelectionConsumeInput {
  authorization: string
  identity: TockTeamDesktopVaultSelectionIdentity
}

export type TockTeamDesktopVaultSelectionConsumeResult = {
  operationId: string
  status: TockTeamDesktopVaultSelectionFailureStatus
} | {
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

export type TockTeamDesktopVaultSelectionBindResult = {
  operationId: string
  status: TockTeamDesktopVaultSelectionFailureStatus
} | {
  operationId: string
  status: 'bound'
}

export interface TockTeamDesktopVaultSelectionReleaseInput {
  claim: TockTeamDesktopVaultSelectionClaim
  operationId: string
}

/**
 * Host-only two-phase handoff consumed by Runtime 0.1.2. canonicalPath must
 * never cross a browser/preload boundary. release is deliberately no-signal,
 * bounded, idempotent best-effort cleanup and has no result to branch on.
 */
export interface TockTeamDesktopVaultSelection {
  bind(
    input: TockTeamDesktopVaultSelectionBindInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionBindResult>
  consume(
    input: TockTeamDesktopVaultSelectionConsumeInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionConsumeResult>
  release(input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void>
}

export type DesktopQuickAction = 'new' | 'daily' | 'capture' | 'search'

export type DesktopDispatchEvent = {
  action: DesktopQuickAction
  identity: NativeOperationIdentity
  kind: 'quick-action'
} | {
  identity: NativeOperationIdentity
  kind: 'protocol'
  request: TockTutorProtocolRequest
}

export interface DesktopDispatchCompletionRequest {
  operationId: string
  status: 'handled' | 'failed' | 'stale'
}

export type DesktopDispatchCompletionResult = NativeFailureResult | {
  operationId: string
  status: 'handled'
}

export interface TockTeamDesktopDispatch {
  complete(
    request: DesktopDispatchCompletionRequest,
    signal: AbortSignal,
  ): Promise<DesktopDispatchCompletionResult>
  subscribe(listener: (event: DesktopDispatchEvent) => void): () => void
}

export interface DesktopPopOutOpenRequest {
  identity: NativeOperationIdentity
  relativePath: string
}

export interface DesktopPopOutWindowRequest {
  identity: NativeOperationIdentity
  windowId: string
}

export interface DesktopPopOutCloseAllRequest {
  identity: NativeOperationIdentity
}

export type DesktopPopOutOpenResult = NativeFailureResult | {
  operationId: string
  status: 'opened' | 'focused'
  windowId: string
}

export type DesktopPopOutCloseResult = NativeFailureResult | {
  operationId: string
  status: 'closed'
}

export interface TockTeamDesktopPopOut {
  close(
    request: DesktopPopOutWindowRequest,
    signal: AbortSignal,
  ): Promise<DesktopPopOutCloseResult>
  closeAll(
    request: DesktopPopOutCloseAllRequest,
    signal: AbortSignal,
  ): Promise<DesktopPopOutCloseResult>
  open(
    request: DesktopPopOutOpenRequest,
    signal: AbortSignal,
  ): Promise<DesktopPopOutOpenResult>
}

export interface DesktopMicrophoneRequest {
  identity: NativeOperationIdentity
}

export type DesktopMicrophoneResult = NativeFailureResult | {
  operationId: string
  status: 'granted'
}

export interface TockTeamDesktopMicrophone {
  request(
    request: DesktopMicrophoneRequest,
    signal: AbortSignal,
  ): Promise<DesktopMicrophoneResult>
}

type DesktopPrintExportBaseRequest = {
  html: string
  identity: NativeOperationIdentity
  title: string
}

/**
 * Print has no destination capability. Static export requires an exact matching
 * picker authorization. The owner validates exact keys and UTF-8 byte limits,
 * re-sanitizes HTML, caps reviewed data-image resources, and renders in an
 * isolated no-network/no-file/no-blob document before any native effect.
 */
export type DesktopPrintExportRequest = DesktopPrintExportBaseRequest & (
  | { authorization?: never; format: 'print'; purpose?: never }
  | {
      authorization: DesktopPickerAuthorization
      format: 'html'
      purpose: 'export-html'
    }
  | {
      authorization: DesktopPickerAuthorization
      format: 'pdf'
      purpose: 'export-pdf'
    }
)

export type DesktopPrintExportResult = NativeFailureResult | {
  label?: DesktopPickerLabel
  operationId: string
  status: 'printed' | 'exported'
}

export interface TockTeamDesktopPrintExport {
  render(
    request: DesktopPrintExportRequest,
    signal: AbortSignal,
  ): Promise<DesktopPrintExportResult>
}

export interface NativeOwnerServices {
  dispatch: TockTeamDesktopDispatch
  microphone: TockTeamDesktopMicrophone
  picker: TockTeamDesktopPickerService
  popOut: TockTeamDesktopPopOut
  printExport: TockTeamDesktopPrintExport
  vaultSelection: TockTeamDesktopVaultSelection
}

export interface NativeOwnerLifetime {
  readonly active: number
  dispose(): Promise<void>
  run<Result>(
    operation: (signal: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>
}

/** Own pending adapter calls and settle all of them before plugin unload returns. */
export function createNativeOwnerLifetime(): NativeOwnerLifetime {
  const lifetime = new AbortController()
  const pending = new Set<Promise<unknown>>()
  let disposed = false

  return {
    get active(): number {
      return pending.size
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      lifetime.abort()
      await Promise.allSettled([...pending])
    },
    run<Result>(
      operation: (signal: AbortSignal) => Promise<Result>,
      signal?: AbortSignal,
    ): Promise<Result> {
      if (disposed) return Promise.reject(new Error('native owner lifetime is disposed'))
      const combined = signal === undefined
        ? lifetime.signal
        : AbortSignal.any([lifetime.signal, signal])
      let task: Promise<Result>
      try {
        task = Promise.resolve(operation(combined))
      } catch (error) {
        task = Promise.reject(error)
      }
      pending.add(task)
      void task.then(
        () => { pending.delete(task) },
        () => { pending.delete(task) },
      )
      return task
    },
  }
}
