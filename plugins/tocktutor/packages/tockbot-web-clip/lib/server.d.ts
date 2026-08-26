import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WriteDocumentResult } from 'tockbot-note-runtime';
import type { PublicTextResult } from './fetch.ts';
import type { ReaderViewResult } from './reader.ts';
import type { ClipApproval, ClipPreview } from './review.ts';
import { WEB_CLIP_APPLY_API_PATH, WEB_CLIP_CANCEL_API_PATH, WEB_CLIP_READER_API_PATH, WEB_CLIP_REVIEW_API_PATH, WEB_CLIP_VIEWER_API_PATH } from './viewer.ts';
export { WEB_CLIP_APPLY_API_PATH, WEB_CLIP_CANCEL_API_PATH, WEB_CLIP_READER_API_PATH, WEB_CLIP_REVIEW_API_PATH, WEB_CLIP_VIEWER_API_PATH, };
export interface ApiHandlerOptions {
    requestBodyTimeoutMs?: number;
}
export interface ViewerPageResult {
    contentType: PublicTextResult['contentType'];
    html: string;
    title: string;
    url: string;
}
export interface ClipReviewRequest {
    destination?: string;
    url: string;
}
export type ViewerPageLoader = (url: string, signal: AbortSignal) => Promise<ViewerPageResult>;
export type ReaderPageLoader = (url: string, signal: AbortSignal) => Promise<ReaderViewResult>;
export type ClipReviewLoader = (input: ClipReviewRequest, signal: AbortSignal) => Promise<ClipPreview>;
export type ClipApplyLoader = (approval: ClipApproval, signal: AbortSignal) => Promise<WriteDocumentResult>;
export type ClipCancelLoader = (reviewId: string) => boolean;
export declare function isTrustedDesktopRequest(request: IncomingMessage): boolean;
export declare function createViewerHandler(load: ViewerPageLoader, options?: ApiHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export declare function createReaderHandler(load: ReaderPageLoader, options?: ApiHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export declare function createClipReviewHandler(load: ClipReviewLoader, options?: ApiHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export declare function createClipApplyHandler(load: ClipApplyLoader, options?: ApiHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export declare function createClipCancelHandler(load: ClipCancelLoader, options?: ApiHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
