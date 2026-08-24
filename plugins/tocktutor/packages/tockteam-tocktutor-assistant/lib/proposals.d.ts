declare const VERSION: 1;
export type ProposalOperation = 'create' | 'update';
export type ProposalWritePermission = 'read-only' | 'propose';
export interface ExpectedTarget {
    exists: boolean;
    identity?: string;
    modifiedAt?: number;
}
export interface ProposalSource {
    relativePath: string;
    identity: string;
    contentDigest: string;
}
export interface StageProposalInput {
    vaultId: string;
    vaultGeneration: number;
    destination: string;
    operation: ProposalOperation;
    source?: ProposalSource;
    expectedTarget: ExpectedTarget;
    content: string;
    childInstanceId: string;
    turnId: string;
    requestId: string;
    provider: string;
    model: string;
    writePermission: ProposalWritePermission;
    permissionEpoch: number;
    expiresInMs?: number;
    warnings?: string[];
    skippedEntries?: string[];
}
export interface ConsumedProposal {
    version: typeof VERSION;
    proposalId: string;
    token: string;
    auditCorrelationId: string;
    createdAt: number;
    expiresAt: number;
    vaultId: string;
    vaultGeneration: number;
    destination: string;
    operation: ProposalOperation;
    source?: ProposalSource;
    expectedTarget: ExpectedTarget;
    content: string;
    contentDigest: string;
    contentBytes: number;
    contentChars: number;
    childInstanceId: string;
    turnId: string;
    requestId: string;
    provider: string;
    model: string;
    writePermission: 'propose';
    permissionEpoch: number;
    warnings: string[];
    skippedEntries: string[];
}
export interface ProposalSummary {
    version: typeof VERSION;
    proposalId: string;
    auditCorrelationId: string;
    createdAt: number;
    expiresAt: number;
    vaultId: string;
    vaultGeneration: number;
    destination: string;
    operation: ProposalOperation;
    source?: ProposalSource;
    expectedTarget: ExpectedTarget;
    contentDigest: string;
    contentBytes: number;
    contentChars: number;
    preview: string;
    childInstanceId: string;
    turnId: string;
    requestId: string;
    provider: string;
    model: string;
    writePermission: 'propose';
    permissionEpoch: number;
    warnings: string[];
    skippedEntries: string[];
}
export interface ApprovalContext {
    vaultId: string;
    vaultGeneration: number;
    childInstanceId: string;
    turnId: string;
    requestId: string;
    provider: string;
    model: string;
    writePermission: ProposalWritePermission;
    permissionEpoch: number;
}
export type AuditOutcome = 'staged' | 'approval-consumed' | 'approval-denied' | 'approval-failed' | 'applied' | 'rejected';
export interface ProposalAuditStatus {
    entries: number;
    dropped: number;
}
export interface ProposalAuditEntry {
    version: typeof VERSION;
    auditId: string;
    auditCorrelationId: string;
    proposalId: string;
    timestamp: number;
    outcome: AuditOutcome;
    vaultId: string;
    vaultGeneration: number;
    destination: string;
    operation: ProposalOperation;
    source?: ProposalSource;
    expectedTarget: ExpectedTarget;
    contentDigest: string;
    contentBytes: number;
    childInstanceId: string;
    turnId: string;
    requestId: string;
    provider: string;
    model: string;
    writePermission: 'propose';
    permissionEpoch: number;
    reason?: string;
}
export type ProposalErrorCode = 'INVALID_PROPOSAL' | 'QUEUE_FULL' | 'EXPIRED' | 'STALE_VAULT' | 'CHILD_REPLACED' | 'PERMISSION_CHANGED' | 'TURN_MISMATCH' | 'PROVIDER_MISMATCH' | 'SOURCE_CHANGED' | 'TARGET_CHANGED' | 'DIGEST_MISMATCH' | 'CORRUPT_QUEUE';
export declare class ProposalError extends Error {
    readonly code: ProposalErrorCode;
    constructor(code: ProposalErrorCode);
}
export interface ProposalQueueOptions {
    clock?: () => number;
    randomId?: () => string;
    pendingLimit?: number;
    auditLimit?: number;
}
export declare function sha256(value: string): string;
export declare class ProposalQueue {
    private readonly clock;
    private readonly randomId;
    private readonly pendingLimit;
    private readonly auditLimit;
    private readonly proposals;
    private readonly approvals;
    private audits;
    private auditDropped;
    constructor(options?: ProposalQueueOptions);
    stage(input: StageProposalInput): ProposalSummary;
    list(): ProposalSummary[];
    audit(): ProposalAuditEntry[];
    auditStatus(): ProposalAuditStatus;
    consumeForApproval(proposalId: string, context: ApprovalContext): ConsumedProposal;
    approvalIsFresh(candidate: ConsumedProposal): boolean;
    recordApprovalOutcome(candidate: ConsumedProposal, outcome: 'applied' | 'approval-failed', reason?: string): void;
    invalidateForChild(currentInstanceId: string | null): number;
    invalidateVault(current: {
        id: string;
        generation: number;
    } | null): number;
    invalidatePermission(permission: ProposalWritePermission, epoch: number): number;
    invalidateProvider(provider: string, model: string): number;
    invalidateMismatched(context: ApprovalContext): number;
    invalidateRestored(validate: (proposal: ProposalSummary) => Promise<ProposalErrorCode | undefined>): Promise<number>;
    reject(proposalId: string, reason: string): Pick<ProposalSummary, 'proposalId' | 'auditCorrelationId'>;
    serialize(): string;
    static hydrate(serialized: string, options?: ProposalQueueOptions): ProposalQueue;
    private pruneExpired;
    private take;
    private nextId;
    private appendAudit;
}
export {};
//# sourceMappingURL=proposals.d.ts.map