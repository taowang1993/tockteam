export type AssistantRemotePermission = 'read-only' | 'propose'
export type AssistantAiSearchPolicy = 'off' | 'on-demand' | 'automatic'
export type AssistantRemoteTurnMode = 'followup' | 'inject' | 'steer'
export type AssistantRemoteOperation = 'create' | 'update'
export type AssistantRemoteAuditOutcome =
  | 'staged'
  | 'approval-consumed'
  | 'approval-denied'
  | 'approval-failed'
  | 'applied'
  | 'rejected'

export interface AssistantSettingsView {
  provider: string
  model: string
  writePermission: AssistantRemotePermission
  aiSearch?: AssistantAiSearchPolicy
}

export interface AssistantSearchIntelligenceRequest {
  query: string
  vaultGeneration: number
  mode: 'related'
  directory?: string
  modifiedFrom?: number
  modifiedTo?: number
  titleOnly?: boolean
}

export interface AssistantSearchIntelligenceResult {
  status: 'applied' | 'disabled' | 'provider-unavailable' | 'invalid-output' | 'error' | 'cancelled'
  matches: Array<{
    id?: string
    path: string
    kind: 'base' | 'block' | 'canvas' | 'content' | 'line' | 'path' | 'property' | 'section' | 'tag' | 'task'
    line: number | null
    preview: string
    lineEnd?: number | null
    score?: number
    operator?: 'any' | 'block' | 'content' | 'file' | 'line' | 'path' | 'property' | 'related' | 'section' | 'tag' | 'task' | 'task-done' | 'task-todo'
    provenance?: 'body' | 'canvas' | 'frontmatter' | 'path' | 'section' | 'task'
  }>
}

export interface AssistantQuickAnswerCandidate {
  id: string
  path: string
  line: number | null
  lineEnd?: number | null
  preview: string
}

export interface AssistantQuickAnswerRequest {
  query: string
  vaultGeneration: number
  candidates: AssistantQuickAnswerCandidate[]
}

export interface AssistantQuickAnswerCitation {
  id: string
  path: string
  line: number | null
  lineEnd: number | null
}

export interface AssistantQuickAnswerResult {
  status: 'completed' | 'no-evidence' | 'provider-unavailable' | 'disabled' | 'invalid-output' | 'error' | 'cancelled'
  answer: string
  citations: AssistantQuickAnswerCitation[]
}

export interface AssistantTurnRequest {
  mode: AssistantRemoteTurnMode
  text: string
}

export interface AssistantTurnResult {
  status: 'accepted'
  mode: AssistantRemoteTurnMode
  redacted: boolean
  truncated: boolean
}

export interface AssistantPageRequest {
  offset?: number
  limit?: number
}

export interface AssistantProposalView {
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
  skippedEntryCount: number
}

export interface AssistantProposalListResult {
  proposals: AssistantProposalView[]
  total: number
  nextOffset: number | null
}

export interface AssistantApprovalRequest {
  proposalId: string
}

export interface AssistantApprovalView {
  proposalId: string
  auditCorrelationId: string
  operation: AssistantRemoteOperation
  destination: string
  snapshotCaptured: boolean
  status: 'created' | 'saved'
}

export interface AssistantRejectionRequest {
  proposalId: string
  reason: string
}

export interface AssistantDecisionView {
  proposalId: string
  auditCorrelationId: string
}

export interface AssistantAuditEntryView {
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

export interface AssistantAuditResult {
  entries: AssistantAuditEntryView[]
  dropped: number
  total: number
  nextOffset: number | null
}
