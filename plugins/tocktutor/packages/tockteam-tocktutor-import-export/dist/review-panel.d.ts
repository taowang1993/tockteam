import { type ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TockTutorDesktopCallerBridge } from '@tockteam/desktop/client';
import type { TockTutorReviewPanelOwnerProps } from '@tockteam/tocktutor-workbench/client';
import type { BackupPlanView, BackupPrepareRequest, BackupPublishResult, CommitResult, ImportInspectFormat, InspectRequest, ReviewBindingRequest, ReviewCancellationRequest, ReviewPlanView } from './types.ts';
export interface ReviewPanelNamespace {
    inspect(request: InspectRequest, signal?: AbortSignal): Promise<RemoteResult<ReviewPlanView>>;
    'abandon-import'(request: InspectRequest, signal?: AbortSignal): Promise<RemoteResult<{
        status: 'cancelled';
    }>>;
    'approve-import'(request: ReviewBindingRequest): Promise<RemoteResult<{
        status: 'approved';
    }>>;
    'commit-import'(request: ReviewBindingRequest, signal?: AbortSignal): Promise<RemoteResult<CommitResult>>;
    'cancel-import'(request: ReviewCancellationRequest): Promise<RemoteResult<{
        status: 'cancelled';
    }>>;
    'prepare-backup'(request: BackupPrepareRequest, signal?: AbortSignal): Promise<RemoteResult<BackupPlanView>>;
    'abandon-backup'(request: BackupPrepareRequest, signal?: AbortSignal): Promise<RemoteResult<{
        status: 'cancelled';
    }>>;
    'approve-backup'(request: ReviewBindingRequest): Promise<RemoteResult<{
        status: 'approved';
    }>>;
    'commit-backup'(request: ReviewBindingRequest, signal?: AbortSignal): Promise<RemoteResult<BackupPublishResult>>;
    'cancel-backup'(request: ReviewCancellationRequest): Promise<RemoteResult<{
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
type DesktopCallerAuthorizer = Pick<TockTutorDesktopCallerBridge, 'authorize'>;
export declare class ImportExportReviewController {
    private abort;
    private approvedOperationId;
    private authoritativeCommit;
    private readonly bridge;
    private disposed;
    private readonly listeners;
    private readonly remote;
    private retryStart;
    private revision;
    private snapshot;
    constructor(remote: ReviewPanelRemote, bridge?: DesktopCallerAuthorizer);
    readonly getSnapshot: () => ReviewPanelSnapshot;
    readonly subscribe: (listener: () => void) => (() => void);
    setFormat(format: ImportInspectFormat): void;
    startImport(format?: "apple-journal" | "bear-backup" | "csv" | "evernote" | "google-keep" | "html" | "markdown-folder" | "markdown-zip" | "restore-backup" | "roam-research" | "textbundle"): Promise<void>;
    startBackup(): Promise<void>;
    approveAndCommit(): Promise<void>;
    cancel(): Promise<void>;
    dispose(): void;
    private authorize;
    private canStart;
    private abandonRetry;
    private cancelPreview;
    private commitReviewed;
    private begin;
    private current;
    private startAuthorization;
    private fail;
    private update;
}
export declare const IMPORT_CHOOSER_DELEGATIONS: readonly [{
    readonly format: "markdown-folder";
    readonly id: "craft-folder";
    readonly label: "Craft Markdown Folder";
}, {
    readonly format: "markdown-zip";
    readonly id: "craft-zip";
    readonly label: "Craft Markdown ZIP";
}, {
    readonly format: "html";
    readonly id: "notion-html";
    readonly label: "Notion HTML Export";
}, {
    readonly format: "markdown-folder";
    readonly id: "apple-notes-folder";
    readonly label: "Apple Notes Markdown Folder";
}, {
    readonly format: "markdown-zip";
    readonly id: "apple-notes-zip";
    readonly label: "Apple Notes Markdown ZIP";
}, {
    readonly format: "html";
    readonly id: "apple-notes-html";
    readonly label: "Apple Notes HTML Export";
}];
export declare function ImportExportReviewPanelView(props: {
    onApprove(): void;
    onCancel(): void;
    onFormat(format: ImportInspectFormat): void;
    onStart(format?: ImportInspectFormat): void;
    onStartBackup?(): void;
    snapshot: ReviewPanelSnapshot;
}): ReactNode;
export declare function ImportExportReviewPanel(props: TockTutorReviewPanelOwnerProps & {
    remote: ReviewPanelRemote;
}): ReactNode;
export {};
//# sourceMappingURL=review-panel.d.ts.map