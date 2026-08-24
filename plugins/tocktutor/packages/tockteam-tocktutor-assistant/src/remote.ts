import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, RemoteScope, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { assertSafeRelativePath, redactBoundaryText } from './context.ts'
import type {
  AssistantApprovalRequest,
  AssistantApprovalView,
  AssistantAuditEntryView,
  AssistantAuditResult,
  AssistantDecisionView,
  AssistantPageRequest,
  AssistantProposalListResult,
  AssistantProposalView,
  AssistantRejectionRequest,
  AssistantRemoteAuditOutcome,
  AssistantRemoteOperation,
  AssistantSettingsView,
  AssistantTurnRequest,
  AssistantTurnResult,
} from './remote-types.ts'

export type * from './remote-types.ts'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const MAX_TURN_CHARS = 32_000
const MAX_REASON_CHARS = 500
const MAX_PREVIEW_CHARS = 1_000
const MAX_WARNING_CHARS = 500
const MAX_PROPOSALS = 100
const MAX_AUDIT_ENTRIES = 500
const MAX_WARNINGS = 20
const MAX_HOST_SKIPPED_ENTRIES = 100
const MAX_SKIPPED_ENTRIES = 20
const MAX_PAGE_SIZE = 20
const MAX_REMOTE_RESULT_BYTES = 256 * 1024
const MAX_BOUNDARY_INPUT_CHARS = 100_000

interface HostProposal {
  proposalId: string
  auditCorrelationId: string
  createdAt: number
  expiresAt: number
  destination: string
  operation: AssistantRemoteOperation
  contentBytes: number
  contentChars: number
  preview: string
  warnings: string[]
  skippedEntries: string[]
}

interface HostApprovalResult {
  proposalId: string
  auditCorrelationId: string
  operation: AssistantRemoteOperation
  path: string
  snapshotCaptured: boolean
  status: 'created' | 'saved'
}

interface HostAuditEntry {
  auditId: string
  auditCorrelationId: string
  proposalId: string
  timestamp: number
  outcome: AssistantRemoteAuditOutcome
  destination: string
  operation: AssistantRemoteOperation
  contentBytes: number
  reason?: string
}

/** Narrow structural seam from the Remote gateway to the Host-private service. */
export interface AssistantRemoteHost {
  currentSettings(): AssistantSettingsView
  saveSettings(settings: AssistantSettingsView): Promise<void>
  continueBoundAgent(agent: Agent, request: AssistantTurnRequest, signal: AbortSignal): {
    mode: AssistantTurnResult['mode']
    redacted: boolean
    truncated: boolean
  }
  listProposals(): Promise<HostProposal[]>
  approveProposal(proposalId: string, signal: AbortSignal): Promise<HostApprovalResult>
  rejectProposal(proposalId: string, reason: string): Promise<AssistantDecisionView>
  proposalAudit(): Promise<HostAuditEntry[]>
  proposalAuditStatus(): Promise<{ entries: number; dropped: number }>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tocktutorAssistant: TockTutorAssistantGateway
  }
}

function failure(label: string): TypeError {
  return new TypeError(`${label} is invalid or exceeds its boundary.`)
}

function assertPlainRecord(
  value: unknown,
  allowed: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw failure(label)
  const prototype = Object.getPrototypeOf(value) as unknown
  if (prototype !== Object.prototype && prototype !== null) throw failure(label)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Object.keys(descriptors)
  const accepted = new Set(allowed)
  if (
    keys.some(key => !accepted.has(key))
    || keys.some(key => !Object.hasOwn(descriptors[key] ?? {}, 'value'))
  ) throw failure(label)
}

function opaqueId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) throw failure(label)
  return value
}

function route(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length > maximum
    || !IDENTIFIER_PATTERN.test(value)
  ) throw failure(label)
  return value
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw failure(label)
  return value as number
}

function safeRelativePath(value: unknown, label: string): string {
  if (typeof value !== 'string') throw failure(label)
  try {
    assertSafeRelativePath(value, label)
  } catch {
    throw failure(label)
  }
  return value
}

function boundaryText(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length > MAX_BOUNDARY_INPUT_CHARS
    || maximum < 0
  ) throw failure(label)
  const redacted = redactBoundaryText(value)
  if (redacted.length <= maximum) return redacted
  return maximum === 0 ? '' : maximum === 1 ? '…' : `${redacted.slice(0, maximum - 1)}…`
}

function checkSignal(signal: AbortSignal): void {
  if (!signal.aborted) return
  const error = new Error('The assistant Remote request was cancelled.')
  error.name = 'AbortError'
  throw error
}

function settingsView(value: unknown, label = 'Settings result'): AssistantSettingsView {
  assertPlainRecord(value, ['provider', 'model', 'writePermission'], label)
  const provider = route(value.provider, 128, label)
  const model = route(value.model, 256, label)
  if (value.writePermission !== 'read-only' && value.writePermission !== 'propose') {
    throw failure(label)
  }
  return { provider, model, writePermission: value.writePermission }
}

function turnRequest(value: unknown): AssistantTurnRequest {
  assertPlainRecord(value, ['mode', 'text'], 'Turn request')
  if (
    (value.mode !== 'followup' && value.mode !== 'inject' && value.mode !== 'steer')
    || typeof value.text !== 'string'
    || value.text.length < 1
    || value.text.length > MAX_TURN_CHARS
    || !value.text.trim()
    || value.text.includes('\0')
  ) throw failure('Turn request')
  return { mode: value.mode, text: value.text }
}

function turnResult(value: unknown, request: AssistantTurnRequest): AssistantTurnResult {
  assertPlainRecord(value, ['agentId', 'messageId', 'mode', 'redacted', 'truncated'], 'Turn result')
  if (
    value.mode !== request.mode
    || typeof value.redacted !== 'boolean'
    || typeof value.truncated !== 'boolean'
  ) throw failure('Turn result')
  return {
    status: 'accepted',
    mode: request.mode,
    redacted: value.redacted,
    truncated: value.truncated,
  }
}

function pageRequest(value: unknown): Required<AssistantPageRequest> {
  assertPlainRecord(value, ['offset', 'limit'], 'Page request')
  const offset = value.offset === undefined ? 0 : safeInteger(value.offset, 'Page request')
  const limit = value.limit === undefined ? MAX_PAGE_SIZE : safeInteger(value.limit, 'Page request')
  if (limit < 1 || limit > MAX_PAGE_SIZE) throw failure('Page request')
  return { offset, limit }
}

function approvalRequest(value: unknown): AssistantApprovalRequest {
  assertPlainRecord(value, ['proposalId'], 'Approval request')
  return { proposalId: opaqueId(value.proposalId, 'Approval request') }
}

function rejectionRequest(value: unknown): AssistantRejectionRequest {
  assertPlainRecord(value, ['proposalId', 'reason'], 'Rejection request')
  if (typeof value.reason !== 'string' || value.reason.length > MAX_REASON_CHARS) {
    throw failure('Rejection request')
  }
  return {
    proposalId: opaqueId(value.proposalId, 'Rejection request'),
    reason: boundaryText(value.reason, MAX_REASON_CHARS, 'Rejection request'),
  }
}

function operation(value: unknown, label: string): AssistantRemoteOperation {
  if (value !== 'create' && value !== 'update') throw failure(label)
  return value
}

function proposalView(value: unknown): AssistantProposalView {
  assertPlainRecord(value, [
    'version', 'proposalId', 'auditCorrelationId', 'createdAt', 'expiresAt',
    'vaultId', 'vaultGeneration', 'destination', 'operation', 'source', 'expectedTarget',
    'contentDigest', 'contentBytes', 'contentChars', 'preview', 'childInstanceId',
    'turnId', 'requestId', 'provider', 'model', 'writePermission', 'permissionEpoch',
    'warnings', 'skippedEntries',
  ], 'Proposal result')
  if (
    !Array.isArray(value.warnings)
    || value.warnings.length > MAX_WARNINGS
    || safeInteger(value.permissionEpoch, 'Proposal result') < 0
  ) throw failure('Proposal result')
  if (!Array.isArray(value.skippedEntries) || value.skippedEntries.length > MAX_HOST_SKIPPED_ENTRIES) {
    throw failure('Proposal result')
  }
  const warnings = value.warnings.map(entry => boundaryText(entry, MAX_WARNING_CHARS, 'Proposal result'))
  const skippedEntryCount = value.skippedEntries.length
  const skippedEntries = value.skippedEntries
    .slice(0, MAX_SKIPPED_ENTRIES)
    .map(entry => safeRelativePath(entry, 'Proposal result'))
  const createdAt = safeInteger(value.createdAt, 'Proposal result')
  const expiresAt = safeInteger(value.expiresAt, 'Proposal result')
  if (expiresAt <= createdAt) throw failure('Proposal result')
  return {
    proposalId: opaqueId(value.proposalId, 'Proposal result'),
    auditCorrelationId: opaqueId(value.auditCorrelationId, 'Proposal result'),
    createdAt,
    expiresAt,
    destination: safeRelativePath(value.destination, 'Proposal result'),
    operation: operation(value.operation, 'Proposal result'),
    contentBytes: safeInteger(value.contentBytes, 'Proposal result'),
    contentChars: safeInteger(value.contentChars, 'Proposal result'),
    preview: boundaryText(value.preview, MAX_PREVIEW_CHARS, 'Proposal result'),
    warnings,
    skippedEntries,
    skippedEntryCount,
  }
}

function approvalView(value: unknown): AssistantApprovalView {
  assertPlainRecord(value, [
    'proposalId', 'auditCorrelationId', 'operation', 'path', 'snapshotCaptured', 'status',
  ], 'Approval result')
  const acceptedOperation = operation(value.operation, 'Approval result')
  if (
    typeof value.snapshotCaptured !== 'boolean'
    || (acceptedOperation === 'create' && value.status !== 'created')
    || (acceptedOperation === 'update' && value.status !== 'saved')
  ) throw failure('Approval result')
  return {
    proposalId: opaqueId(value.proposalId, 'Approval result'),
    auditCorrelationId: opaqueId(value.auditCorrelationId, 'Approval result'),
    operation: acceptedOperation,
    destination: safeRelativePath(value.path, 'Approval result'),
    snapshotCaptured: value.snapshotCaptured,
    status: acceptedOperation === 'create' ? 'created' : 'saved',
  }
}

function decisionView(value: unknown, label: string): AssistantDecisionView {
  assertPlainRecord(value, ['proposalId', 'auditCorrelationId'], label)
  return {
    proposalId: opaqueId(value.proposalId, label),
    auditCorrelationId: opaqueId(value.auditCorrelationId, label),
  }
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function auditEntryView(value: unknown): AssistantAuditEntryView {
  assertPlainRecord(value, [
    'version', 'auditId', 'auditCorrelationId', 'proposalId', 'timestamp', 'outcome',
    'vaultId', 'vaultGeneration', 'destination', 'operation', 'source', 'expectedTarget',
    'contentDigest', 'contentBytes', 'childInstanceId', 'turnId', 'requestId', 'provider',
    'model', 'writePermission', 'permissionEpoch', 'reason',
  ], 'Audit result')
  if (
    ![
      'staged',
      'approval-consumed',
      'approval-denied',
      'approval-failed',
      'applied',
      'rejected',
    ].includes(value.outcome as string)
    || safeInteger(value.permissionEpoch, 'Audit result') < 0
  ) throw failure('Audit result')
  return {
    auditId: opaqueId(value.auditId, 'Audit result'),
    auditCorrelationId: opaqueId(value.auditCorrelationId, 'Audit result'),
    proposalId: opaqueId(value.proposalId, 'Audit result'),
    timestamp: safeInteger(value.timestamp, 'Audit result'),
    outcome: value.outcome as AssistantRemoteAuditOutcome,
    destination: safeRelativePath(value.destination, 'Audit result'),
    operation: operation(value.operation, 'Audit result'),
    contentBytes: safeInteger(value.contentBytes, 'Audit result'),
    ...value.reason === undefined
      ? {}
      : { reason: boundaryText(value.reason, MAX_REASON_CHARS, 'Audit result') },
  }
}

/** Browser-safe Remote gateway over the Host-owned assistant service. */
export class TockTutorAssistantGateway extends TypertRemoteService {
  static inject = ['noteAssistant']
  private readonly assistant: AssistantRemoteHost

  constructor(ctx: Context) {
    super(ctx, 'tocktutorAssistant')
    const assistant = ctx.get('noteAssistant') as unknown
    if (assistant === undefined || assistant === null || typeof assistant !== 'object') {
      throw failure('Assistant service')
    }
    this.assistant = assistant as AssistantRemoteHost
    installRemoteMethods(this)
  }

  async currentSettings(signal: AbortSignal): Promise<AssistantSettingsView> {
    checkSignal(signal)
    const result = settingsView(this.assistant.currentSettings())
    checkSignal(signal)
    return result
  }

  async saveSettings(
    request: AssistantSettingsView,
    signal: AbortSignal,
  ): Promise<AssistantSettingsView> {
    const settings = settingsView(request, 'Settings request')
    checkSignal(signal)
    await this.assistant.saveSettings(settings)
    return settingsView(this.assistant.currentSettings())
  }

  async continueTurn(
    request: AssistantTurnRequest,
    signal: AbortSignal,
  ): Promise<AssistantTurnResult> {
    const accepted = turnRequest(request)
    checkSignal(signal)
    const agent = (this.ctx as Context & { agent?: Agent }).agent
    if (agent === undefined) throw failure('Agent scope')
    const result = turnResult(this.assistant.continueBoundAgent(agent, accepted, signal), accepted)
    checkSignal(signal)
    return result
  }

  async listProposals(
    request: AssistantPageRequest,
    signal: AbortSignal,
  ): Promise<AssistantProposalListResult> {
    const page = pageRequest(request)
    checkSignal(signal)
    const pending = await this.assistant.listProposals()
    if (!Array.isArray(pending) || pending.length > MAX_PROPOSALS) throw failure('Proposal result')
    const total = pending.length
    const proposals: AssistantProposalView[] = []
    for (const candidate of pending.slice(page.offset, page.offset + page.limit)) {
      const projected = proposalView(candidate)
      const end = page.offset + proposals.length + 1
      const nextOffset = end < total ? end : null
      const result = { proposals: [...proposals, projected], total, nextOffset }
      if (encodedBytes(result) > MAX_REMOTE_RESULT_BYTES) break
      proposals.push(projected)
    }
    if (proposals.length === 0 && page.offset < total) throw failure('Proposal result')
    const end = Math.min(total, page.offset + proposals.length)
    const result = { proposals, total, nextOffset: end < total ? end : null }
    checkSignal(signal)
    return result
  }

  async approveProposal(
    request: AssistantApprovalRequest,
    signal: AbortSignal,
  ): Promise<AssistantApprovalView> {
    const accepted = approvalRequest(request)
    checkSignal(signal)
    return approvalView(await this.assistant.approveProposal(accepted.proposalId, signal))
  }

  async rejectProposal(
    request: AssistantRejectionRequest,
    signal: AbortSignal,
  ): Promise<AssistantDecisionView> {
    const accepted = rejectionRequest(request)
    checkSignal(signal)
    return decisionView(
      await this.assistant.rejectProposal(accepted.proposalId, accepted.reason),
      'Rejection result',
    )
  }

  async audit(
    request: AssistantPageRequest,
    signal: AbortSignal,
  ): Promise<AssistantAuditResult> {
    const page = pageRequest(request)
    checkSignal(signal)
    const entries = await this.assistant.proposalAudit()
    const status = await this.assistant.proposalAuditStatus()
    if (!Array.isArray(entries) || entries.length > MAX_AUDIT_ENTRIES) throw failure('Audit result')
    assertPlainRecord(status, ['entries', 'dropped'], 'Audit result')
    const declaredEntries = safeInteger(status.entries, 'Audit result')
    const dropped = safeInteger(status.dropped, 'Audit result')
    if (declaredEntries !== entries.length) throw failure('Audit result')
    const total = entries.length
    const projected: AssistantAuditEntryView[] = []
    for (const candidate of entries.slice(page.offset, page.offset + page.limit)) {
      const entry = auditEntryView(candidate)
      const end = page.offset + projected.length + 1
      const nextOffset = end < total ? end : null
      const result = { entries: [...projected, entry], dropped, total, nextOffset }
      if (encodedBytes(result) > MAX_REMOTE_RESULT_BYTES) break
      projected.push(entry)
    }
    if (projected.length === 0 && page.offset < total) throw failure('Audit result')
    const end = Math.min(total, page.offset + projected.length)
    const result = { entries: projected, dropped, total, nextOffset: end < total ? end : null }
    checkSignal(signal)
    return result
  }
}

type AssistantRemoteMethod =
  | 'currentSettings'
  | 'saveSettings'
  | 'continueTurn'
  | 'listProposals'
  | 'approveProposal'
  | 'rejectProposal'
  | 'audit'

const REMOTE_METHODS: readonly AssistantRemoteMethod[] = [
  'currentSettings',
  'saveSettings',
  'continueTurn',
  'listProposals',
  'approveProposal',
  'rejectProposal',
  'audit',
]

function installRemoteMethods(instance: TockTutorAssistantGateway): void {
  type Initializer = (this: TockTutorAssistantGateway) => void
  type RuntimeRemote = (
    method: (...args: never[]) => unknown,
    context: {
      name: string
      private: boolean
      static: boolean
      addInitializer(initializer: Initializer): void
    },
  ) => void
  const runtimeRemote = Remote as unknown as RuntimeRemote
  const scopedRemote = RemoteScope('agent') as unknown as RuntimeRemote
  for (const name of REMOTE_METHODS) {
    const mark = name === 'continueTurn' ? scopedRemote : runtimeRemote
    mark(
      TockTutorAssistantGateway.prototype[name] as (...args: never[]) => unknown,
      {
        name,
        private: false,
        static: false,
        addInitializer(initializer) { initializer.call(instance) },
      },
    )
  }
}
