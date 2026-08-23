export const TOCKTEAM_DESKTOP_PICKER_SERVICE = 'tockTeamDesktopPicker' as const
export const TOCKTEAM_DESKTOP_DISPATCH_SERVICE = 'tockTeamDesktopDispatch' as const
export const TOCKTEAM_DESKTOP_POPOUT_SERVICE = 'tockTeamDesktopPopOut' as const
export const TOCKTEAM_DESKTOP_MICROPHONE_SERVICE = 'tockTeamDesktopMicrophone' as const
export const TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE = 'tockTeamDesktopPrintExport' as const

/** Hard ceilings; a source request may only choose stricter positive limits. */
export const MAX_DESKTOP_SOURCE_ENTRIES = 100_000
export const MAX_DESKTOP_SOURCE_DEPTH = 128
export const MAX_DESKTOP_SOURCE_ENTRY_BYTES = 1024 * 1024 * 1024
export const MAX_DESKTOP_SOURCE_TOTAL_BYTES = 1024 * 1024 * 1024
export const MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES = 4096
export const MAX_DESKTOP_SOURCE_PAGE_ENTRIES = 256
export const MAX_DESKTOP_DESTINATION_CHUNK_BYTES = 1024 * 1024
export const MAX_DESKTOP_GRANT_SESSION_MS = 15 * 60 * 1000
export const MAX_PRINT_EXPORT_HTML_BYTES = 8 * 1024 * 1024
export const MAX_PRINT_EXPORT_TITLE_BYTES = 512
export const MAX_PRINT_EXPORT_RESOURCE_REFERENCES = 256
export const MAX_PRINT_EXPORT_RESOURCE_URL_BYTES = 2 * 1024 * 1024

export type NativeFailureStatus = 'cancelled' | 'denied' | 'stale' | 'unavailable'

export interface NativeRequestIdentity {
  requestId: string
  windowId: string
  sessionId: string
  vaultId: string | null
  vaultGeneration: number
}

export type NativeOperationIdentity = NativeRequestIdentity & {
  operationId: string
}

export type DesktopPickerIdentity = NativeOperationIdentity
export type DesktopPickerAuthorization = string & { readonly __desktopPickerAuthorization: unique symbol }
export type DesktopPickerLabel = string & { readonly __desktopPickerLabel: unique symbol }
export type DesktopSha256 = string & { readonly __desktopSha256: unique symbol }
export type DesktopSourceSession = string & { readonly __desktopSourceSession: unique symbol }
export type DesktopDestinationSession = string & { readonly __desktopDestinationSession: unique symbol }
export type DesktopSourceEntryId = string & { readonly __desktopSourceEntryId: unique symbol }
export type DesktopSourceCursor = string & { readonly __desktopSourceCursor: unique symbol }
export type DesktopOpaqueRevision = string & { readonly __desktopOpaqueRevision: unique symbol }
export type DesktopSafeRelativePath = string & { readonly __desktopSafeRelativePath: unique symbol }
export type DesktopSafeName = string & { readonly __desktopSafeName: unique symbol }

export type NativeFailureResult = {
  operationId: string
  status: NativeFailureStatus
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

export type DesktopDestinationTarget =
  | { kind: 'selected-file' }
  | { kind: 'relative-file'; relativePath: DesktopSafeRelativePath }

export interface DesktopDestinationPlanEntry {
  digest: DesktopSha256
  size: number
  target: DesktopDestinationTarget
}

export type DesktopDestinationState =
  | { status: 'absent' }
  | { replaceAuthorized: true; revision: DesktopOpaqueRevision; status: 'existing' }

/**
 * Destination policy is purpose-owned, not caller-configurable:
 * export-html/export-pdf each have exactly one selected-file entry, the matching
 * extension, and no publicationName. vault-backup has 1..100,000 normalized,
 * case-fold-unique relative-file entries, a required single-segment
 * publicationName, exactly one manifest.json, and exact entry/total sizes.
 */
export interface BeginDesktopDestinationRequest {
  authorization: DesktopPickerAuthorization
  entries: DesktopDestinationPlanEntry[]
  identity: DesktopPickerIdentity
  planDigest: DesktopSha256
  publicationName?: DesktopSafeName
  purpose: DesktopExportPurpose
  totalBytes: number
}

export interface BeginDesktopDestinationResult {
  expiresAt: number
  expectedState: DesktopDestinationState
  session: DesktopDestinationSession
}

export interface WriteDesktopDestinationChunkRequest {
  bytes: Uint8Array
  offset: number
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

export type DesktopCleanupEvidence =
  | { status: 'complete' }
  | { residualLabels: DesktopPickerLabel[]; status: 'residual' }

export type FinalizeDesktopDestinationResult =
  | {
      bytes: number
      cleanup: { status: 'complete' }
      entries: number
      label: DesktopPickerLabel
      planDigest: DesktopSha256
      replaced: boolean
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
  | 'replayed'
  | 'size-mismatch'
  | 'stale'
  | 'unsafe-source'
  | 'unsafe-target'

/**
 * A bounded path-free rejection from a picker grant/session operation.
 * Messages and other observable evidence must never contain a native path.
 */
export class TockTeamDesktopGrantError extends Error {
  readonly code: DesktopGrantErrorCode

  constructor(code: DesktopGrantErrorCode, message: string) {
    super(message)
    this.name = 'TockTeamDesktopGrantError'
    this.code = code
  }
}

/**
 * A successful pick returns one use of purpose/identity-bound authorization.
 * beginSource/beginDestination consumes it into one opaque 15-minute session.
 * Sessions, cursors, entry IDs, and revisions never resolve to native paths.
 * Source reads are sequential <=1 MiB chunks and check size/revision; destination
 * chunks stage beside the target and finalize only after plan/digest/state checks.
 * releaseSource/abortDestination deliberately remain non-cancellable so bounded,
 * idempotent cleanup runs after cancellation, window loss, owner loss, or unload.
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
  pick(request: DesktopPickerRequest, signal: AbortSignal): Promise<DesktopPickerResult>
  readSource(
    request: ReadDesktopSourceRequest,
    signal: AbortSignal,
  ): Promise<ReadDesktopSourceResult>
  releaseSource(request: ReleaseDesktopSourceRequest): Promise<ReleaseDesktopSourceResult>
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
  close(request: DesktopPopOutWindowRequest, signal: AbortSignal): Promise<DesktopPopOutCloseResult>
  closeAll(request: DesktopPopOutCloseAllRequest, signal: AbortSignal): Promise<DesktopPopOutCloseResult>
  open(request: DesktopPopOutOpenRequest, signal: AbortSignal): Promise<DesktopPopOutOpenResult>
}

export interface DesktopMicrophoneRequest {
  identity: NativeOperationIdentity
}

export type DesktopMicrophoneResult = NativeFailureResult | {
  operationId: string
  status: 'granted'
}

export interface TockTeamDesktopMicrophone {
  request(request: DesktopMicrophoneRequest, signal: AbortSignal): Promise<DesktopMicrophoneResult>
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
  | { format: 'print' }
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
  render(request: DesktopPrintExportRequest, signal: AbortSignal): Promise<DesktopPrintExportResult>
}

export interface NativeOwnerServices {
  dispatch: TockTeamDesktopDispatch
  microphone: TockTeamDesktopMicrophone
  picker: TockTeamDesktopPickerService
  popOut: TockTeamDesktopPopOut
  printExport: TockTeamDesktopPrintExport
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
