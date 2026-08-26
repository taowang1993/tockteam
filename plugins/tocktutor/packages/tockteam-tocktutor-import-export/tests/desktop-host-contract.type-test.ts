import type {
  AbortDesktopDestinationRequest,
  AbortDesktopDestinationResult,
  BeginDesktopDestinationRequest,
  BeginDesktopSourceRequest,
  DesktopCallerClaimRequest,
  DesktopCallerOperation,
  DesktopDestinationPlan,
  DesktopDestinationPlanAuthorization,
  DesktopDestinationPlanEntry,
  DesktopCleanupEvidence,
  DesktopDestinationState,
  DesktopDestinationTarget,
  DesktopExportPurpose,
  DesktopGrantErrorCode,
  DesktopPickerLabel,
  DesktopPickerRequest,
  DesktopPrintExportRequest,
  DesktopSafeRelativePath,
  DesktopSourcePurpose,
  DesktopSourceRoot,
  DesktopSourceSession,
  FinalizeDesktopDestinationResult,
  LockDesktopDestinationPlanRequest,
  LockDesktopDestinationPlanResult,
  RevokeDesktopDestinationPlanRequest,
  RevokeDesktopDestinationPlanResult,
  TockTeamDesktopCaller,
  TockTeamDesktopGrantError,
  TockTeamDesktopPickerService,
  WriteDesktopDestinationChunkRequest,
  computeDesktopDestinationPlanDigest,
} from '@tockteam/desktop/host'
import type {
  BackupPrepareRequest,
  InspectRequest,
  ReviewBindingRequest,
  ReviewCancellationRequest,
} from '../src/types.ts'

// These assertions deliberately consume only the retained package export. They
// duplicate no Desktop types and keep native paths outside this package.
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false
type Assert<Condition extends true> = Condition
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value ? true : false

type ExpectedSourcePurpose =
  | 'apple-journal'
  | 'bear-backup'
  | 'csv'
  | 'evernote'
  | 'google-keep'
  | 'html'
  | 'markdown-folder'
  | 'markdown-zip'
  | 'restore-backup'
  | 'roam-research'
  | 'textbundle'
type ExpectedExportPurpose = 'export-html' | 'export-pdf' | 'vault-backup'
type ExpectedCallerOperation =
  | 'activate-vault'
  | 'reveal-entry'
  | 'popout-open'
  | 'popout-close'
  | 'popout-close-all'
  | 'microphone'
  | 'print'
  | 'export-html'
  | 'export-pdf'
  | 'import-source'
  | 'backup'
  | 'restore-backup'
type ExpectedGrantErrorCode =
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

type StaticDestination = DesktopDestinationPlan & { purpose: 'export-html' | 'export-pdf' }
type BackupDestination = DesktopDestinationPlan & { purpose: 'vault-backup' }
type PrintOnly = Extract<DesktopPrintExportRequest, { format: 'print' }>
type ManagedCleanup = Exclude<DesktopCleanupEvidence, { status: 'complete' }>

export type DesktopHostContractAssertions = [
  Assert<Equal<DesktopSourcePurpose, ExpectedSourcePurpose>>,
  Assert<Equal<DesktopExportPurpose, ExpectedExportPurpose>>,
  Assert<Equal<DesktopCallerOperation, ExpectedCallerOperation>>,
  Assert<Equal<DesktopGrantErrorCode, ExpectedGrantErrorCode>>,
  Assert<Equal<Parameters<TockTeamDesktopCaller['claim']>, [request: DesktopCallerClaimRequest, signal: AbortSignal]>>,
  Assert<Equal<HasKey<DesktopCallerClaimRequest, 'vault'>, false>>,
  Assert<Equal<HasKey<DesktopCallerClaimRequest, 'sessionId'>, false>>,
  Assert<Equal<HasKey<DesktopCallerClaimRequest, 'windowId'>, false>>,
  Assert<Equal<InspectRequest['format'], ExpectedSourcePurpose>>,
  Assert<Equal<HasKey<InspectRequest, 'identity'>, false>>,
  Assert<Equal<HasKey<InspectRequest, 'vault'>, false>>,
  Assert<Equal<HasKey<BackupPrepareRequest, 'identity'>, false>>,
  Assert<Equal<HasKey<ReviewBindingRequest, 'vault'>, false>>,
  Assert<Equal<HasKey<ReviewBindingRequest, 'sessionId'>, false>>,
  Assert<Equal<HasKey<ReviewCancellationRequest, 'sessionId'>, false>>,
  Assert<Equal<HasKey<DesktopPickerRequest, 'path'>, false>>,
  Assert<Equal<HasKey<DesktopPickerRequest, 'filters'>, false>>,
  Assert<Equal<HasKey<DesktopPickerRequest, 'options'>, false>>,
  Assert<Equal<HasKey<DesktopPickerRequest, 'suggestedName'>, false>>,
  Assert<Equal<HasKey<BeginDesktopSourceRequest, 'path'>, false>>,
  Assert<Equal<HasKey<BeginDesktopDestinationRequest, 'path'>, false>>,
  Assert<Equal<HasKey<LockDesktopDestinationPlanRequest, 'path'>, false>>,
  Assert<Equal<HasKey<DesktopDestinationTarget, 'path'>, false>>,
  Assert<Equal<string extends DesktopSafeRelativePath ? true : false, false>>,
  Assert<Equal<Parameters<TockTeamDesktopPickerService['releaseSource']>['length'], 1>>,
  Assert<Equal<Parameters<TockTeamDesktopPickerService['abortDestination']>, [request: AbortDesktopDestinationRequest]>>,
  Assert<Equal<Parameters<TockTeamDesktopPickerService['revokeDestinationPlan']>, [request: RevokeDesktopDestinationPlanRequest]>>,
  Assert<Equal<Parameters<TockTeamDesktopPickerService['lockDestinationPlan']>['length'], 2>>,
  Assert<Equal<TockTeamDesktopGrantError extends Error ? true : false, true>>,
  Assert<Equal<TockTeamDesktopGrantError['code'], ExpectedGrantErrorCode>>,
  Assert<Equal<ConstructorParameters<typeof TockTeamDesktopGrantError>, [code: DesktopGrantErrorCode]>>,
  Assert<Equal<FinalizeDesktopDestinationResult['status'], 'partial' | 'published'>>,
  Assert<Equal<DesktopCleanupEvidence['status'], 'complete' | 'scrubbed' | 'retained' | 'residual'>>,
  Assert<Equal<ManagedCleanup['status'], 'scrubbed' | 'retained' | 'residual'>>,
  Assert<Equal<ManagedCleanup['residualLabels'], DesktopPickerLabel[]>>,
  Assert<Equal<FinalizeDesktopDestinationResult['cleanup'], DesktopCleanupEvidence>>,
  Assert<Equal<AbortDesktopDestinationResult['cleanup'], DesktopCleanupEvidence>>,
  Assert<Equal<LockDesktopDestinationPlanResult['expectedState'], DesktopDestinationState>>,
  Assert<Equal<RevokeDesktopDestinationPlanResult['status'], 'already-closed' | 'revoked'>>,
  Assert<Equal<HasKey<WriteDesktopDestinationChunkRequest, 'planDigest'>, true>>,
  Assert<Equal<ReturnType<typeof computeDesktopDestinationPlanDigest>, DesktopDestinationPlanEntry['digest']>>,
  Assert<Equal<BeginDesktopDestinationRequest['authorization'], DesktopDestinationPlanAuthorization>>,
  Assert<Equal<StaticDestination['purpose'], 'export-html' | 'export-pdf'>>,
  Assert<Equal<StaticDestination['entries']['length'], 1>>,
  Assert<Equal<StaticDestination['entries'][0]['target']['kind'], 'selected-file'>>,
  Assert<Equal<HasKey<StaticDestination, 'publicationName'>, false>>,
  Assert<Equal<BackupDestination['entries']['length'], 1>>,
  Assert<Equal<BackupDestination['entries'][0]['target']['kind'], 'selected-file'>>,
  Assert<Equal<HasKey<BackupDestination, 'publicationName'>, false>>,
  Assert<Equal<Exclude<PrintOnly['authorization'], undefined>, never>>,
  Assert<Equal<Exclude<PrintOnly['purpose'], undefined>, never>>,
]

const callerClaim: DesktopCallerClaimRequest = {
  authorization: 'opaque',
  operation: 'import-source',
}
const inspectRequest: InspectRequest = { authorization: 'opaque', format: 'markdown-folder' }
const backupRequest: BackupPrepareRequest = { authorization: 'opaque' }
const reviewBinding: ReviewBindingRequest = { operationId: 'operation', planDigest: 'digest', reviewToken: 'token' }
const cancellation: ReviewCancellationRequest = { operationId: 'operation', reviewToken: 'token' }
const sourceSession = '' as DesktopSourceSession
const relativePath = '' as DesktopSafeRelativePath
const residualLabel = '' as DesktopPickerLabel

const completeCleanup: DesktopCleanupEvidence = { status: 'complete' }
const scrubbedCleanup: DesktopCleanupEvidence = {
  residualLabels: [residualLabel],
  status: 'scrubbed',
}
const retainedCleanup: DesktopCleanupEvidence = {
  residualLabels: [residualLabel],
  status: 'retained',
}
const residualCleanup: DesktopCleanupEvidence = {
  residualLabels: [residualLabel],
  status: 'residual',
}

const markdownSource: DesktopPickerRequest = {
  identity: {
    operationId: 'operation',
    requestId: 'request',
    sessionId: 'session',
    vaultGeneration: 1,
    vaultId: 'vault',
    windowId: 'window',
  },
  kind: 'source',
  purpose: 'markdown-folder',
}

const backupArtifact: BackupDestination = {
  entries: [{
    digest: '' as DesktopDestinationPlanEntry['digest'],
    size: 1,
    target: { kind: 'selected-file' },
  }],
  purpose: 'vault-backup',
  totalBytes: 1,
}

const fileRoot: DesktopSourceRoot = {
  entry: {
    entryId: '' as Extract<DesktopSourceRoot, { kind: 'file' }>['entry']['entryId'],
    kind: 'file',
    relativePath,
    revision: '' as Extract<DesktopSourceRoot, { kind: 'file' }>['revision'],
    size: 1,
  },
  kind: 'file',
  revision: '' as Extract<DesktopSourceRoot, { kind: 'file' }>['revision'],
}

const directoryRoot: DesktopSourceRoot = {
  kind: 'directory',
  revision: '' as Extract<DesktopSourceRoot, { kind: 'directory' }>['revision'],
}

// @ts-expect-error A file root always carries its opaque file entry.
const missingFileEntry: DesktopSourceRoot = { kind: 'file', revision: fileRoot.revision }
const directoryWithFileEntry: DesktopSourceRoot = {
  // @ts-expect-error A directory root cannot smuggle a file entry.
  entry: fileRoot.entry,
  kind: 'directory',
  revision: fileRoot.revision,
}
// @ts-expect-error Browser/consumer requests cannot supply native paths.
const sourceWithPath: BeginDesktopSourceRequest = { path: '/tmp/source' }
// @ts-expect-error Picker options and arbitrary filters are not part of the contract.
const pickerWithOptions: DesktopPickerRequest = { ...markdownSource, options: { filters: ['*'] } }
// @ts-expect-error Static export purposes are closed.
const arbitraryExportPurpose: DesktopExportPurpose = 'export-docx'
// @ts-expect-error Scrubbed cleanup must identify every retained zero-byte residue.
const scrubbedWithoutLabels: DesktopCleanupEvidence = { status: 'scrubbed' }
// @ts-expect-error Retained cleanup must identify every verified published alias and tombstone.
const retainedWithoutLabels: DesktopCleanupEvidence = { status: 'retained' }
// @ts-expect-error Complete cleanup cannot claim retained namespace residues.
const completeWithLabels: DesktopCleanupEvidence = { residualLabels: [residualLabel], status: 'complete' }
// @ts-expect-error Cleanup statuses are closed and cannot collapse unresolved residue into success.
const resolvedCleanup: DesktopCleanupEvidence = { residualLabels: [residualLabel], status: 'resolved' }

void backupArtifact
void backupRequest
void callerClaim
void cancellation
void completeCleanup
void completeWithLabels
void directoryRoot
void directoryWithFileEntry
void fileRoot
void inspectRequest
void markdownSource
void missingFileEntry
void relativePath
void sourceSession
void sourceWithPath
void pickerWithOptions
void arbitraryExportPurpose
void residualCleanup
void residualLabel
void reviewBinding
void retainedCleanup
void retainedWithoutLabels
void resolvedCleanup
void scrubbedCleanup
void scrubbedWithoutLabels
