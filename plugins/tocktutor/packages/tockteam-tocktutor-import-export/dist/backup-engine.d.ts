import { type AbortDesktopDestinationRequest, type AbortDesktopDestinationResult, type BeginDesktopDestinationRequest, type BeginDesktopDestinationResult, type DesktopPickerRequest, type NativeOperationIdentity, type DesktopPickerResult, type FinalizeDesktopDestinationRequest, type FinalizeDesktopDestinationResult, type LockDesktopDestinationPlanRequest, type LockDesktopDestinationPlanResult, type RevokeDesktopDestinationPlanRequest, type RevokeDesktopDestinationPlanResult, type WriteDesktopDestinationChunkRequest, type WriteDesktopDestinationChunkResult } from '@tockteam/desktop/host';
import type { AttachmentPreviewResult, ListPassiveBackupEntriesRequest, ListTreeRequest, NoteVaultState, OpenDocumentResult, PassiveBackupContentResult, PassiveBackupListResult, ReadPassiveBackupEntryRequest, VaultReference, VaultTreePage } from 'tockbot-note-runtime';
import type { BackupPlanView, BackupPublishResult, ReviewBindingRequest, ReviewCancellationRequest } from './types.ts';
export type { BackupPlanView, BackupPublishResult } from './types.ts';
export interface BackupRuntimePort {
    readonly state: NoteVaultState;
    listPassiveBackupEntries(request: ListPassiveBackupEntriesRequest, signal: AbortSignal): Promise<PassiveBackupListResult>;
    listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage>;
    openDocument(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<OpenDocumentResult>;
    previewAttachment(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentPreviewResult>;
    readPassiveBackupEntry(request: ReadPassiveBackupEntryRequest, signal: AbortSignal): Promise<PassiveBackupContentResult>;
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
export interface ClaimedBackupRequest {
    identity: NativeOperationIdentity;
}
export declare class ReviewedBackupEngine {
    private disposed;
    private readonly cancelled;
    private readonly completed;
    private completedEvidenceBytes;
    private readonly lifetime;
    private readonly pendingCommits;
    private readonly pendingPreparations;
    private readonly operations;
    private readonly options;
    private readonly used;
    constructor(options: ReviewedBackupEngineOptions);
    prepare(request: ClaimedBackupRequest, signal: AbortSignal): Promise<BackupPlanView>;
    approve(request: ReviewBindingRequest): Promise<{
        status: 'approved';
    }>;
    commit(request: ReviewBindingRequest, signal: AbortSignal): Promise<BackupPublishResult>;
    cancel(request: ReviewCancellationRequest): Promise<{
        status: 'cancelled';
    }>;
    abandon(request: ClaimedBackupRequest): Promise<{
        status: 'cancelled';
    }>;
    private prepareOwned;
    private approveOwned;
    private commitOwned;
    private cancelOwned;
    dispose(): Promise<void>;
    private close;
    private scheduleExpiry;
    private rememberCancelled;
    private rememberCompleted;
    private forgetCompleted;
    private rememberUsed;
}
//# sourceMappingURL=backup-engine.d.ts.map