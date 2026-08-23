import type { CreateDocumentRequest, NoteVaultState, OpenDocumentResult, SaveDocumentRequest, VaultReference, WriteDocumentResult } from 'tockbot-note-runtime';
import { ProposalQueue, type ApprovalContext } from './proposals.ts';
export interface ApprovalRuntime {
    readonly state: NoteVaultState;
    openDocument(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<OpenDocumentResult>;
    createDocument(request: CreateDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    saveDocument(request: SaveDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
}
export type ApprovalErrorCode = 'ABORTED' | 'CHILD_REPLACED' | 'CREATE_CONFLICT' | 'CURRENT_CONTEXT_UNAVAILABLE' | 'EXPIRED' | 'INVALID_RUNTIME_RESULT' | 'OUTCOME_PERSISTENCE_FAILED' | 'PERMISSION_CHANGED' | 'PROVIDER_MISMATCH' | 'RECOVERY_UNAVAILABLE' | 'RUNTIME_FAILURE' | 'SOURCE_CHANGED' | 'STALE_VAULT' | 'TARGET_CHANGED' | 'TURN_MISMATCH' | 'UPDATE_CONFLICT';
export declare class ApprovalError extends Error {
    readonly code: ApprovalErrorCode;
    constructor(code: ApprovalErrorCode);
}
export interface ApprovalResult {
    proposalId: string;
    auditCorrelationId: string;
    operation: 'create' | 'update';
    path: string;
    snapshotCaptured: boolean;
    status: 'created' | 'saved';
}
export declare class ProposalApprovalExecutor {
    private readonly proposals;
    private readonly runtime;
    private readonly currentContext;
    private readonly persist;
    constructor(proposals: ProposalQueue, runtime: ApprovalRuntime, currentContext: () => ApprovalContext, persist?: () => Promise<void>);
    approve(proposalId: string, signal: AbortSignal): Promise<ApprovalResult>;
    private persistOutcome;
    private assertCurrent;
    private openRequired;
}
//# sourceMappingURL=approval.d.ts.map