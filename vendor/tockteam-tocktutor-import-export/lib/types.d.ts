import type { DesktopSourcePurpose } from '@tockteam/desktop/host';
import type { ReviewedPlanSummary, VaultBinding } from './core.ts';
export interface BrowserOperationIdentity {
    operationId: string;
    requestId: string;
    sessionId: string;
    vault: VaultBinding;
    windowId: string;
}
export type ImportInspectFormat = DesktopSourcePurpose;
export interface InspectRequest {
    format: ImportInspectFormat;
    identity: BrowserOperationIdentity;
}
export interface ReviewBindingRequest {
    operationId: string;
    planDigest: string;
    reviewToken: string;
    sessionId: string;
    vault: VaultBinding;
}
export type ReviewPlanView = ReviewedPlanSummary & {
    reviewToken: string;
};
export interface CommitEntryResult {
    destination: string;
    digest: string;
    id: string;
}
export interface CommitSkippedResult {
    destination: string;
    reason: 'cancelled' | 'exists';
}
export interface CommitFailedResult {
    destination: string;
    reason: string;
}
export interface RecoveryEvidence {
    snapshots: string[];
    status: 'not-needed' | 'required';
    trash: string[];
}
export interface CommitResult {
    committed: CommitEntryResult[];
    failed: CommitFailedResult[];
    operationId: string;
    planDigest: string;
    recovery: RecoveryEvidence;
    skipped: CommitSkippedResult[];
    status: 'committed' | 'partial';
}
export interface BackupPlanView {
    archiveDigest: string;
    createdAt: number;
    destinationLabel: string;
    entries: number;
    expiresAt: number;
    operationId: string;
    planDigest: string;
    reviewToken: string;
    totalBytes: number;
    vault: VaultBinding;
}
export type CleanupEvidenceView = {
    status: 'complete';
} | {
    residualLabels: string[];
    status: 'residual' | 'retained' | 'scrubbed';
};
export type BackupPublishResult = {
    bytes: number;
    cleanup: CleanupEvidenceView;
    label: string;
    operationId: string;
    planDigest: string;
    status: 'published';
} | {
    cleanup: CleanupEvidenceView;
    failedEntries: number;
    operationId: string;
    planDigest: string;
    stagedBytes: number;
    stagedEntries: number;
    status: 'partial';
};
export interface ReviewStatusView {
    kind: 'backup' | 'import';
    operationId: string;
    phase: 'approved' | 'pending' | 'used';
}
//# sourceMappingURL=types.d.ts.map