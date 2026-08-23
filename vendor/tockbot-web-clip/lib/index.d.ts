import { Service, type Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { WriteDocumentResult } from 'tockbot-note-runtime';
import { type PublicFetchLimits, type PublicTextResult } from './fetch.ts';
import { type ReaderViewLimits, type ReaderViewResult } from './reader.ts';
import { type ClipApproval, type ClipPreview, type ClipPreviewInput, type ClipVaultReference, type ConsumedClipCreate } from './review.ts';
import { type ViewerPageResult } from './server.ts';
export * from './fetch.ts';
export * from './reader.ts';
export * from './review.ts';
export * from './server.ts';
export * from './viewer.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        webClip: WebClipHost;
    }
}
export interface Config extends PublicFetchLimits, ReaderViewLimits {
    maxConcurrentRequests: number;
}
export type ClipRuntimeErrorCode = 'capacity' | 'runtime-result' | 'runtime-unavailable' | 'stale-vault';
export declare class ClipRuntimeError extends Error {
    readonly code: ClipRuntimeErrorCode;
    constructor(code: ClipRuntimeErrorCode, message: string);
}
export declare const Config: Schema<Config>;
export declare class WebClipHost extends Service {
    static Config: Schema<Config>;
    private readonly active;
    private activeFetches;
    private readonly clipReviews;
    private closing;
    private readonly fetchLimits;
    private readonly maxConcurrentRequests;
    private readonly readerLimits;
    private runtime;
    private runtimeEpoch;
    constructor(ctx: Context, config: Config);
    private assertOpen;
    private abortActive;
    private trackOperation;
    createClipReview(input: ClipPreviewInput): ClipPreview;
    consumeClipReview(approval: ClipApproval, currentVault: ClipVaultReference): ConsumedClipCreate;
    cancelClipReview(reviewId: string): boolean;
    private activeRuntime;
    createClipReviewFromUrl(input: {
        destination?: string;
        url: string;
    }, signal: AbortSignal): Promise<ClipPreview>;
    applyClipReview(approval: ClipApproval, signal: AbortSignal): Promise<WriteDocumentResult>;
    private applyClipReviewOnce;
    protected loadPublicText(url: string, signal: AbortSignal): Promise<PublicTextResult>;
    fetchText(url: string, options?: {
        signal?: AbortSignal;
    }): Promise<PublicTextResult>;
    readerView(url: string, options?: {
        signal?: AbortSignal;
    }): Promise<ReaderViewResult>;
    viewerPage(url: string, options?: {
        signal?: AbortSignal;
    }): Promise<ViewerPageResult>;
}
export default WebClipHost;
