export declare const PLAN_SCHEMA_VERSION: 1;
export declare const MAX_PLAN_ITEMS = 5000;
export declare const MAX_PLAN_BYTES: number;
export declare const MAX_PLAN_WARNINGS = 100;
export declare const MAX_PLAN_SKIPPED = 1000;
export declare const MAX_BROWSER_LABEL_BYTES = 512;
export declare const MAX_BROWSER_PLAN_BYTES: number;
export declare const MAX_RELATIVE_PATH_BYTES = 4096;
export type ImportFormat = 'apple-journal' | 'bear-backup' | 'csv' | 'evernote' | 'google-keep' | 'html' | 'markdown-folder' | 'markdown-zip' | 'restore-backup' | 'roam-research' | 'textbundle' | 'vault-backup';
export type ImportExportErrorCode = 'aborted' | 'destination-collision' | 'expired' | 'invalid-archive' | 'invalid-manifest' | 'invalid-path' | 'invalid-plan' | 'limit-exceeded' | 'not-found' | 'replayed' | 'stale-source' | 'stale-vault' | 'unsupported-format' | 'unsupported-type';
export declare class ImportExportError extends Error {
    readonly code: ImportExportErrorCode;
    constructor(code: ImportExportErrorCode);
}
export interface VaultBinding {
    generation: number;
    id: string;
}
export interface SourceBinding {
    digest: string;
    fingerprint: string;
    format: ImportFormat;
    label: string;
    size: number;
}
export interface PlannedFile {
    bytes: Uint8Array;
    destination: string;
    kind: 'attachment' | 'document';
    sourceKey: string;
}
export interface SkippedEntry {
    label: string;
    reason: string;
}
export interface PlanItemSummary {
    destination: string;
    digest: string;
    id: string;
    kind: PlannedFile['kind'];
    size: number;
}
export interface ReviewedPlanSummary {
    collisionPolicy: 'preserve-existing';
    createdAt: number;
    expiresAt: number;
    items: PlanItemSummary[];
    operationId: string;
    planDigest: string;
    schemaVersion: typeof PLAN_SCHEMA_VERSION;
    skipped: SkippedEntry[];
    source: SourceBinding;
    totalBytes: number;
    vault: VaultBinding;
    warnings: string[];
}
export interface ReviewedPlan {
    files: PlannedFile[];
    summary: ReviewedPlanSummary;
    token: string;
}
export interface CreateReviewedPlanInput {
    createdAt: number;
    expiresAt: number;
    files: PlannedFile[];
    operationId: string;
    skipped: SkippedEntry[];
    source: SourceBinding;
    token: string;
    vault: VaultBinding;
    warnings: string[];
}
export declare function sha256(bytes: Uint8Array | string): string;
export declare function normalizeRelativePath(value: string): string;
export declare function destinationAliasKey(destination: string): string;
export declare function stableJson(value: unknown): string;
export declare function createReviewedPlan(input: CreateReviewedPlanInput): ReviewedPlan;
export declare function assertPlanContent(plan: ReviewedPlan): void;
//# sourceMappingURL=core.d.ts.map