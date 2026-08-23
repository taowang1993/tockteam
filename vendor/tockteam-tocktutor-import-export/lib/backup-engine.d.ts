import { type AbortDesktopDestinationRequest, type AbortDesktopDestinationResult, type BeginDesktopDestinationRequest, type BeginDesktopDestinationResult, type DesktopPickerRequest, type DesktopPickerResult, type FinalizeDesktopDestinationRequest, type FinalizeDesktopDestinationResult, type LockDesktopDestinationPlanRequest, type LockDesktopDestinationPlanResult, type RevokeDesktopDestinationPlanRequest, type RevokeDesktopDestinationPlanResult, type WriteDesktopDestinationChunkRequest, type WriteDesktopDestinationChunkResult } from '@tockteam/desktop/host';
import type { AttachmentPreviewResult, ListTreeRequest, NoteVaultState, OpenDocumentResult, VaultReference, VaultTreePage } from 'tockbot-note-runtime';
import type { BackupPlanView, BackupPublishResult, BrowserOperationIdentity, ReviewBindingRequest } from './types.ts';
export type { BackupPlanView, BackupPublishResult } from './types.ts';
export interface BackupRuntimePort {
    readonly state: NoteVaultState;
    listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage>;
    openDocument(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<OpenDocumentResult>;
    previewAttachment(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentPreviewResult>;
}
export interface BackupDesktopPort {
    abortDestination(request: AbortDesktopDestinationRequest): Promise<AbortDesktopDestinationResult>;
    beginDestination(request: BeginDesktopDestinationRequest, signal: AbortSignal): Promise<BeginDesktopDestinationResult>;
    finalizeDestination(request: FinalizeDesktopDestinationRequest, signal: AbortSignal): Promise<FinalizeDesktopDestinationResult>;
    lockDestinationPlan(request: LockDesktopDestinationPlanRequest, signal: AbortSignal): Promise<LockDesktopDestinationPlanResult>;
    pick(request: DesktopPickerRequest, signal: AbortSignal): Promise<DesktopPickerResult>;
    revokeDestinationPlan(request: RevokeDesktopDestinationPlanRequest): Promise<RevokeDesktopDestinationPlanResult>;
    writeDestinationChunk(request: WriteDesktopDestinationChunkRequest, signal: AbortSignal): Promise<WriteDesktopDestinationChunkResult>;
}
export interface ReviewedBackupEngineOptions {
    desktop: BackupDesktopPort;
    now(): number;
    randomToken(): string;
    runtime: BackupRuntimePort;
}
export declare class ReviewedBackupEngine {
    private disposed;
    private readonly lifetime;
    private readonly operations;
    private readonly options;
    private readonly used;
    constructor(options: ReviewedBackupEngineOptions);
    prepare(request: {
        identity: BrowserOperationIdentity;
    }, signal: AbortSignal): Promise<BackupPlanView>;
    approve(request: ReviewBindingRequest): Promise<{
        status: 'approved';
    }>;
    commit(request: ReviewBindingRequest, signal: AbortSignal): Promise<BackupPublishResult>;
    cancel(operationId: string, sessionId: string): Promise<{
        status: 'cancelled';
    }>;
    dispose(): Promise<void>;
    private close;
    private rememberUsed;
}
//# sourceMappingURL=backup-engine.d.ts.map