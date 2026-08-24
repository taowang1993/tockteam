import type { BeginDesktopSourceRequest, BeginDesktopSourceResult, DesktopPickerRequest, DesktopPickerResult, ListDesktopSourceRequest, ListDesktopSourceResult, NativeOperationIdentity, ReadDesktopSourceRequest, ReadDesktopSourceResult, ReleaseDesktopSourceRequest, ReleaseDesktopSourceResult, RevalidateDesktopSourceRequest, RevalidateDesktopSourceResult } from '@tockteam/desktop/host';
import type { CreateDocumentRequest, ListTreeRequest, NoteVaultState, StoreAttachmentRequest, VaultTreePage, WriteDocumentResult, StoreAttachmentResult } from 'tockbot-note-runtime';
import type { CommitResult, ImportInspectFormat, ReviewBindingRequest, ReviewCancellationRequest, ReviewPlanView } from './types.ts';
export type { CommitEntryResult, CommitFailedResult, CommitResult, CommitSkippedResult, ImportInspectFormat, ReviewBindingRequest, ReviewCancellationRequest, ReviewPlanView, } from './types.ts';
export interface DesktopPickerPort {
    beginSource(request: BeginDesktopSourceRequest, signal: AbortSignal): Promise<BeginDesktopSourceResult>;
    listSource(request: ListDesktopSourceRequest, signal: AbortSignal): Promise<ListDesktopSourceResult>;
    pick(request: DesktopPickerRequest, signal: AbortSignal): Promise<DesktopPickerResult>;
    readSource(request: ReadDesktopSourceRequest, signal: AbortSignal): Promise<ReadDesktopSourceResult>;
    releaseSource(request: ReleaseDesktopSourceRequest): Promise<ReleaseDesktopSourceResult>;
    revalidateSource(request: RevalidateDesktopSourceRequest, signal: AbortSignal): Promise<RevalidateDesktopSourceResult>;
}
export interface RuntimePort {
    readonly state: NoteVaultState;
    createDocument(request: CreateDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage>;
    storeAttachment(request: StoreAttachmentRequest, signal: AbortSignal): Promise<StoreAttachmentResult>;
}
export interface ClaimedInspectRequest {
    format: ImportInspectFormat;
    identity: NativeOperationIdentity;
}
export interface ReviewedOperationEngineOptions {
    now(): number;
    picker: DesktopPickerPort;
    randomToken(): string;
    runtime: RuntimePort;
}
export declare class ReviewedOperationEngine {
    private readonly cancelled;
    private readonly completed;
    private completedEvidenceBytes;
    private readonly lifetime;
    private readonly pendingCommits;
    private readonly pendingInspections;
    private readonly operations;
    private readonly options;
    private readonly used;
    private disposed;
    constructor(options: ReviewedOperationEngineOptions);
    inspect(request: ClaimedInspectRequest, signal: AbortSignal): Promise<ReviewPlanView>;
    approve(request: ReviewBindingRequest): Promise<{
        status: 'approved';
    }>;
    commit(request: ReviewBindingRequest, signal: AbortSignal): Promise<CommitResult>;
    cancel(request: ReviewCancellationRequest): Promise<{
        status: 'cancelled';
    }>;
    abandon(request: ClaimedInspectRequest): Promise<{
        status: 'cancelled';
    }>;
    private inspectOwned;
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
//# sourceMappingURL=engine.d.ts.map