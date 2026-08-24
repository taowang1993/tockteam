export type AssistantRemotePermission = 'read-only' | 'propose';
export type AssistantRemoteTurnMode = 'followup' | 'inject' | 'steer';
export type AssistantRemoteOperation = 'create' | 'update';
export type AssistantRemoteAuditOutcome = 'staged' | 'approval-consumed' | 'approval-denied' | 'approval-failed' | 'applied' | 'rejected';
export interface AssistantSettingsView {
    provider: string;
    model: string;
    writePermission: AssistantRemotePermission;
}
export interface AssistantTurnRequest {
    mode: AssistantRemoteTurnMode;
    text: string;
}
export interface AssistantTurnResult {
    status: 'accepted';
    mode: AssistantRemoteTurnMode;
    redacted: boolean;
    truncated: boolean;
}
export interface AssistantPageRequest {
    offset?: number;
    limit?: number;
}
export interface AssistantProposalView {
    proposalId: string;
    auditCorrelationId: string;
    createdAt: number;
    expiresAt: number;
    destination: string;
    operation: AssistantRemoteOperation;
    contentBytes: number;
    contentChars: number;
    preview: string;
    warnings: string[];
    skippedEntries: string[];
    skippedEntryCount: number;
}
export interface AssistantProposalListResult {
    proposals: AssistantProposalView[];
    total: number;
    nextOffset: number | null;
}
export interface AssistantApprovalRequest {
    proposalId: string;
}
export interface AssistantApprovalView {
    proposalId: string;
    auditCorrelationId: string;
    operation: AssistantRemoteOperation;
    destination: string;
    snapshotCaptured: boolean;
    status: 'created' | 'saved';
}
export interface AssistantRejectionRequest {
    proposalId: string;
    reason: string;
}
export interface AssistantDecisionView {
    proposalId: string;
    auditCorrelationId: string;
}
export interface AssistantAuditEntryView {
    auditId: string;
    auditCorrelationId: string;
    proposalId: string;
    timestamp: number;
    outcome: AssistantRemoteAuditOutcome;
    destination: string;
    operation: AssistantRemoteOperation;
    contentBytes: number;
    reason?: string;
}
export interface AssistantAuditResult {
    entries: AssistantAuditEntryView[];
    dropped: number;
    total: number;
    nextOffset: number | null;
}
//# sourceMappingURL=remote-types.d.ts.map