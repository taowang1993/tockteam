import { type ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TockTutorReviewPanelOwnerProps } from '@tockteam/tocktutor-workbench/client';
import type { BackupPlanView, BackupPublishResult, BrowserOperationIdentity, CommitResult, ImportInspectFormat, InspectRequest, ReviewBindingRequest, ReviewPlanView } from './types.ts';
export interface ReviewPanelNamespace {
    inspect(request: InspectRequest, signal?: AbortSignal): Promise<RemoteResult<ReviewPlanView>>;
    'approve-import'(request: ReviewBindingRequest): Promise<RemoteResult<{
        status: 'approved';
    }>>;
    'commit-import'(request: ReviewBindingRequest, signal?: AbortSignal): Promise<RemoteResult<CommitResult>>;
    'cancel-import'(operationId: string, sessionId: string): Promise<RemoteResult<{
        status: 'cancelled';
    }>>;
    'prepare-backup'(identity: BrowserOperationIdentity, signal?: AbortSignal): Promise<RemoteResult<BackupPlanView>>;
    'approve-backup'(request: ReviewBindingRequest): Promise<RemoteResult<{
        status: 'approved';
    }>>;
    'commit-backup'(request: ReviewBindingRequest, signal?: AbortSignal): Promise<RemoteResult<BackupPublishResult>>;
    'cancel-backup'(operationId: string, sessionId: string): Promise<RemoteResult<{
        status: 'cancelled';
    }>>;
}
export interface ReviewPanelRemote {
    readonly ['tocktutor-import-export']: ReviewPanelNamespace;
}
export type ReviewPanelPhase = 'approving' | 'committing' | 'complete' | 'error' | 'idle' | 'inspecting' | 'review';
export interface ReviewPanelSnapshot {
    error: string | null;
    format: ImportInspectFormat;
    kind: 'backup' | 'import';
    phase: ReviewPanelPhase;
    preview: BackupPlanView | ReviewPlanView | null;
    result: BackupPublishResult | CommitResult | null;
}
export declare class ImportExportReviewController {
    private active;
    private abort;
    private disposed;
    private readonly identity;
    private readonly listeners;
    private readonly remote;
    private revision;
    private snapshot;
    constructor(remote: ReviewPanelRemote, vault: BrowserOperationIdentity['vault'], identity?: () => BrowserOperationIdentity);
    readonly getSnapshot: () => ReviewPanelSnapshot;
    readonly subscribe: (listener: () => void) => (() => void);
    setFormat(format: ImportInspectFormat): void;
    startImport(format?: import("@tockteam/desktop/host").DesktopSourcePurpose): Promise<void>;
    startBackup(): Promise<void>;
    approveAndCommit(): Promise<void>;
    cancel(): Promise<void>;
    dispose(): void;
    private begin;
    private current;
    private fail;
    private update;
}
export declare function ImportExportReviewPanelView(props: {
    onApprove(): void;
    onCancel(): void;
    onFormat(format: ImportInspectFormat): void;
    onStart(): void;
    onStartBackup?(): void;
    snapshot: ReviewPanelSnapshot;
}): ReactNode;
export declare function ImportExportReviewPanel(props: TockTutorReviewPanelOwnerProps & {
    remote: ReviewPanelRemote;
}): ReactNode;
//# sourceMappingURL=review-panel.d.ts.map