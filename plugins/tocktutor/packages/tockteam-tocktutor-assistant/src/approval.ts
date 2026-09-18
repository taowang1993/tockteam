import type {
  CreateDocumentRequest,
  NoteVaultState,
  OpenDocumentResult,
  SaveDocumentRequest,
  VaultReference,
  WriteDocumentResult,
} from 'tockbot-note-runtime'
import { assertSafeRelativePath } from './context.ts'
import {
  ProposalQueue,
  type ApprovalContext,
  type ConsumedProposal,
} from './proposals.ts'

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u
const REVISION_PATTERN = /^file:[A-Za-z0-9._~-]{1,256}$/u
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u
const MAX_RUNTIME_CONTENT_CHARS = 2 * 1024 * 1024

export interface ApprovalRuntime {
  readonly state: NoteVaultState
  openDocument(
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<OpenDocumentResult>
  createDocument(request: CreateDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>
  saveDocument(request: SaveDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>
}

export type ApprovalErrorCode =
  | 'ABORTED'
  | 'CHILD_REPLACED'
  | 'CREATE_CONFLICT'
  | 'CURRENT_CONTEXT_UNAVAILABLE'
  | 'EXPIRED'
  | 'INVALID_RUNTIME_RESULT'
  | 'OUTCOME_PERSISTENCE_FAILED'
  | 'PERMISSION_CHANGED'
  | 'PROVIDER_MISMATCH'
  | 'RECOVERY_UNAVAILABLE'
  | 'RUNTIME_FAILURE'
  | 'SOURCE_CHANGED'
  | 'STALE_VAULT'
  | 'TARGET_CHANGED'
  | 'TURN_MISMATCH'
  | 'UPDATE_CONFLICT'

const ERROR_MESSAGES: Record<ApprovalErrorCode, string> = {
  ABORTED: 'The proposal approval was cancelled.',
  CHILD_REPLACED: 'The assistant tool child changed before approval.',
  CREATE_CONFLICT: 'The destination now exists.',
  CURRENT_CONTEXT_UNAVAILABLE: 'The current assistant context is unavailable.',
  EXPIRED: 'The proposal expired before approval could complete.',
  INVALID_RUNTIME_RESULT: 'The note runtime returned an invalid mutation result.',
  OUTCOME_PERSISTENCE_FAILED: 'The proposal outcome could not be persisted; refresh before retrying.',
  PERMISSION_CHANGED: 'The write permission changed before approval.',
  PROVIDER_MISMATCH: 'The provider or model changed before approval.',
  RECOVERY_UNAVAILABLE: 'Recovery could not be guaranteed, so no update was approved.',
  RUNTIME_FAILURE: 'The note runtime could not complete the approved mutation.',
  SOURCE_CHANGED: 'The proposal source changed before approval.',
  STALE_VAULT: 'The active vault changed before approval.',
  TARGET_CHANGED: 'The proposal destination changed before approval.',
  TURN_MISMATCH: 'The assistant turn changed before approval.',
  UPDATE_CONFLICT: 'The destination changed before the update could be saved.',
}

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode

  constructor(code: ApprovalErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = 'ApprovalError'
    this.code = code
  }
}

export interface ApprovalResult {
  proposalId: string
  auditCorrelationId: string
  operation: 'create' | 'update'
  path: string
  snapshotCaptured: boolean
  status: 'created' | 'saved'
}

function failure(code: ApprovalErrorCode): ApprovalError {
  return new ApprovalError(code)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isRuntimeError(error: unknown): error is Error & { code: string } {
  return error instanceof Error
    && error.name === 'NoteVaultError'
    && typeof (error as Error & { code?: unknown }).code === 'string'
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError')
}

function runtimeFailure(
  error: unknown,
  signal: AbortSignal,
  phase: 'source' | 'target' | 'create' | 'update',
): ApprovalError {
  if (isAbort(error, signal)) return failure('ABORTED')
  if (!isRuntimeError(error)) return failure('RUNTIME_FAILURE')
  switch (error.code) {
    case 'inactive':
    case 'invalid-vault':
    case 'stale-vault':
      return failure('STALE_VAULT')
    case 'recovery-unavailable':
      return failure('RECOVERY_UNAVAILABLE')
    case 'not-found':
      if (phase === 'source') return failure('SOURCE_CHANGED')
      if (phase === 'target') return failure('TARGET_CHANGED')
      return failure(phase === 'update' ? 'UPDATE_CONFLICT' : 'CREATE_CONFLICT')
    case 'exists':
      return failure(phase === 'create' ? 'CREATE_CONFLICT' : 'TARGET_CHANGED')
    case 'changed':
    case 'conflict':
      return failure(phase === 'update' ? 'UPDATE_CONFLICT' : 'TARGET_CHANGED')
    default:
      if (phase === 'source') return failure('SOURCE_CHANGED')
      if (phase === 'target') return failure('TARGET_CHANGED')
      return failure('RUNTIME_FAILURE')
  }
}

function validateDescriptor(
  value: OpenDocumentResult,
  expectedPath: string,
  expectedVault: VaultReference,
): OpenDocumentResult {
  if (
    !isPlainRecord(value)
    || typeof value.content !== 'string'
    || value.content.length > MAX_RUNTIME_CONTENT_CHARS
    || typeof value.digest !== 'string'
    || !DIGEST_PATTERN.test(value.digest)
    || value.generation !== expectedVault.generation
    || value.path !== expectedPath
    || typeof value.revision !== 'string'
    || !REVISION_PATTERN.test(value.revision)
  ) throw failure('INVALID_RUNTIME_RESULT')
  try {
    assertSafeRelativePath(value.path)
  } catch {
    throw failure('INVALID_RUNTIME_RESULT')
  }
  return value
}

function validateWriteResult(
  value: WriteDocumentResult,
  record: ConsumedProposal,
): WriteDocumentResult {
  const expectedStatus = record.operation === 'create' ? 'created' : 'saved'
  if (
    !isPlainRecord(value)
    || value.status !== expectedStatus
    || value.path !== record.destination
    || value.generation !== record.vaultGeneration
    || value.digest !== `sha256:${record.contentDigest}`
    || typeof value.revision !== 'string'
    || !REVISION_PATTERN.test(value.revision)
  ) throw failure('INVALID_RUNTIME_RESULT')
  try {
    assertSafeRelativePath(value.path)
  } catch {
    throw failure('INVALID_RUNTIME_RESULT')
  }
  if (value.status === 'saved') {
    const snapshotId: unknown = (value as unknown as Record<string, unknown>).snapshotId
    if (typeof snapshotId !== 'string' || !SNAPSHOT_ID_PATTERN.test(snapshotId)) {
      throw failure('INVALID_RUNTIME_RESULT')
    }
  } else if (Object.hasOwn(value, 'snapshotId')) {
    throw failure('INVALID_RUNTIME_RESULT')
  }
  return value
}

export class ProposalApprovalExecutor {
  private readonly proposals: ProposalQueue
  private readonly runtime: ApprovalRuntime
  private readonly currentContext: () => ApprovalContext
  private readonly persist: () => Promise<void>

  constructor(
    proposals: ProposalQueue,
    runtime: ApprovalRuntime,
    currentContext: () => ApprovalContext,
    persist: () => Promise<void> = () => Promise.resolve(),
  ) {
    this.proposals = proposals
    this.runtime = runtime
    this.currentContext = currentContext
    this.persist = persist
  }

  async approve(proposalId: string, signal: AbortSignal): Promise<ApprovalResult> {
    if (signal.aborted) throw failure('ABORTED')
    let context: ApprovalContext
    try {
      context = this.currentContext()
    } catch {
      throw failure('CURRENT_CONTEXT_UNAVAILABLE')
    }
    let record: ConsumedProposal
    try {
      record = this.proposals.consumeForApproval(proposalId, context)
    } catch (error) {
      await this.persistOutcome()
      throw error
    }
    let written: WriteDocumentResult
    try {
      await this.persist()
      const expectedVault = Object.freeze({
        id: record.vaultId,
        generation: record.vaultGeneration,
      })
      this.assertCurrent(record, signal)
      if (record.source !== undefined) {
        const source = await this.openRequired(
          record.source.relativePath, expectedVault, signal, 'source', record,
        )
        if (
          source.revision !== record.source.identity
          || source.digest !== `sha256:${record.source.contentDigest}`
        ) throw failure('SOURCE_CHANGED')
      }

      let expectedRevision: string | undefined
      if (record.operation === 'update') {
        const target = await this.openRequired(
          record.destination, expectedVault, signal, 'target', record,
        )
        if (target.revision !== record.expectedTarget.identity) throw failure('TARGET_CHANGED')
        expectedRevision = target.revision
      }

      this.assertCurrent(record, signal)
      let raw: WriteDocumentResult
      try {
        raw = record.operation === 'create'
          ? await this.runtime.createDocument(Object.freeze({
              content: record.content,
              expectedVault,
              path: record.destination,
            }), signal)
          : await this.runtime.saveDocument(Object.freeze({
              content: record.content,
              expectedRevision: expectedRevision as string,
              expectedVault,
              path: record.destination,
            }), signal)
      } catch (error) {
        throw runtimeFailure(error, signal, record.operation)
      }
      written = validateWriteResult(raw, record)
    } catch (error) {
      const sanitized = error instanceof ApprovalError ? error : failure('RUNTIME_FAILURE')
      this.proposals.recordApprovalOutcome(record, 'approval-failed', sanitized.code)
      await this.persistOutcome()
      throw sanitized
    }
    this.proposals.recordApprovalOutcome(record, 'applied')
    const result = Object.freeze({
      proposalId: record.proposalId,
      auditCorrelationId: record.auditCorrelationId,
      operation: record.operation,
      path: written.path,
      snapshotCaptured: written.status === 'saved',
      status: written.status,
    })
    await this.persistOutcome()
    return result
  }

  private async persistOutcome(): Promise<void> {
    try {
      await this.persist()
    } catch {
      throw failure('OUTCOME_PERSISTENCE_FAILED')
    }
  }

  private assertCurrent(record: ConsumedProposal, signal: AbortSignal): void {
    if (signal.aborted) throw failure('ABORTED')
    if (!this.proposals.approvalIsFresh(record)) throw failure('EXPIRED')
    let current: ApprovalContext
    let state: NoteVaultState
    try {
      current = this.currentContext()
      state = this.runtime.state
    } catch {
      throw failure('CURRENT_CONTEXT_UNAVAILABLE')
    }
    if (
      !state.active
      || state.id !== record.vaultId
      || state.generation !== record.vaultGeneration
      || current.vaultId !== record.vaultId
      || current.vaultGeneration !== record.vaultGeneration
    ) throw failure('STALE_VAULT')
    if (current.childInstanceId !== record.childInstanceId) throw failure('CHILD_REPLACED')
    if (
      current.writePermission !== record.writePermission
      || current.permissionEpoch !== record.permissionEpoch
    ) throw failure('PERMISSION_CHANGED')
    if (current.turnId !== record.turnId || current.requestId !== record.requestId) {
      throw failure('TURN_MISMATCH')
    }
    if (current.provider !== record.provider || current.model !== record.model) {
      throw failure('PROVIDER_MISMATCH')
    }
  }

  private async openRequired(
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
    phase: 'source' | 'target',
    record: ConsumedProposal,
  ): Promise<OpenDocumentResult> {
    this.assertCurrent(record, signal)
    let raw: OpenDocumentResult
    try {
      raw = await this.runtime.openDocument(path, expectedVault, signal)
    } catch (error) {
      throw runtimeFailure(error, signal, phase)
    }
    this.assertCurrent(record, signal)
    return validateDescriptor(raw, path, expectedVault)
  }

}
