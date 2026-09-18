export declare const MAX_PENDING_CLIP_REVIEWS = 16;
export declare const MAX_CLIP_CONTENT_CHARS = 200000;
export declare const MAX_CLIP_MARKDOWN_CHARS = 210000;
export declare const MAX_CLIP_MARKDOWN_BYTES: number;
export declare const MAX_CLIP_DESTINATION_CHARS = 1024;
export type ClipReviewErrorCode = 'capacity' | 'expired' | 'input' | 'mismatch' | 'missing';
export declare class ClipReviewError extends Error {
    readonly code: ClipReviewErrorCode;
    constructor(code: ClipReviewErrorCode, message: string);
}
export interface ClipVaultReference {
    generation: number;
    id: string;
}
export interface ClipPreviewInput {
    capturedAt: Date;
    content: string;
    destination?: string;
    sourceUrl: string;
    title: string;
    vault: ClipVaultReference;
}
export interface ClipTargetIdentity {
    state: 'absent';
}
export interface ClipPreview {
    contentDigest: string;
    destination: string;
    expiresAt: number;
    markdown: string;
    permission: 'user-approval-required';
    reviewId: string;
    sourceUrl: string;
    target: Readonly<ClipTargetIdentity>;
    title: string;
    vault: Readonly<ClipVaultReference>;
}
export interface ClipApproval {
    contentDigest: string;
    destination: string;
    expiresAt: number;
    permission: 'user-approved';
    reviewId: string;
    sourceUrl: string;
    target: ClipTargetIdentity;
    vault: ClipVaultReference;
}
export interface ConsumedClipCreate {
    content: string;
    contentDigest: string;
    expectedVault: Readonly<ClipVaultReference>;
    path: string;
    sourceUrl: string;
    target: Readonly<ClipTargetIdentity>;
}
export interface ClipReviewStoreOptions {
    createId?: () => string;
    maxPending?: number;
    now?: () => number;
    ttlMs?: number;
}
export declare function normalizeClipDestination(value: string): string;
export declare function buildClipMarkdown(input: {
    capturedAt: Date;
    content: string;
    sourceUrl: string;
    title: string;
}): string;
export declare class ClipReviewStore {
    private readonly createId;
    private readonly maxPending;
    private readonly now;
    private readonly pending;
    private readonly ttlMs;
    constructor(options?: ClipReviewStoreOptions);
    private purgeExpired;
    create(input: ClipPreviewInput): ClipPreview;
    consume(approval: ClipApproval, currentVault: ClipVaultReference): ConsumedClipCreate;
    cancel(reviewId: string): boolean;
    dispose(): void;
}
