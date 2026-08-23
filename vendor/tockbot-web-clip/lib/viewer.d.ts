export declare const WEB_CLIP_APPLY_API_PATH = "/web-clip/api/clip/apply";
export declare const WEB_CLIP_CANCEL_API_PATH = "/web-clip/api/clip/cancel";
export declare const WEB_CLIP_READER_API_PATH = "/web-clip/api/reader";
export declare const WEB_CLIP_REVIEW_API_PATH = "/web-clip/api/clip/review";
export declare const WEB_CLIP_VIEWER_API_PATH = "/web-clip/api/viewer";
export declare const MAX_VIEWER_TABS = 20;
export declare const MAX_VIEWER_BOOKMARKS = 20;
export declare const MAX_VIEWER_STORAGE_CHARS = 65536;
export declare const SUPPORTED_TOCKTEAM_DESKTOP_VERSION = "0.1.6";
export interface ReaderPreferences {
    appearance: 'dark' | 'light' | 'system';
    spacing: 'compact' | 'md' | 'relaxed';
    textSize: 'lg' | 'md' | 'sm';
    width: 'md' | 'narrow' | 'wide';
}
export declare const defaultReaderPreferences: Readonly<ReaderPreferences>;
export interface ViewerTab {
    id: string;
    title: string;
    url: string | null;
}
export interface ViewerBookmark {
    id: string;
    title: string;
    url: string;
}
export interface ViewerState {
    activeId: string;
    bookmarks: ViewerBookmark[];
    nextBookmarkId: number;
    nextTabId: number;
    readerPreferences: ReaderPreferences;
    tabs: ViewerTab[];
}
export interface ValidatedViewerPage {
    title: string;
    url: string;
}
export declare function normalizeViewerPageUrl(value: string): string;
export declare function createViewerState(): ViewerState;
export declare function addViewerTab(state: ViewerState): ViewerState;
export declare function selectViewerTab(state: ViewerState, id: string): ViewerState;
export declare function navigateViewerTab(state: ViewerState, id: string, page: ValidatedViewerPage): ViewerState;
export declare function moveViewerTab(state: ViewerState, id: string, rawIndex: number): ViewerState;
export declare function closeViewerTab(state: ViewerState, id: string): ViewerState;
export declare function addViewerBookmark(state: ViewerState): ViewerState;
export declare function removeViewerBookmark(state: ViewerState, id: string): ViewerState;
export declare function restoreViewerState(raw: string | null): ViewerState;
export declare function serializeViewerState(state: ViewerState): string;
export interface ViewerResultToken {
    requestId: number;
    sessionId: string;
    tabId: string;
    url: string;
}
export declare class ViewerResultGuard {
    private requestId;
    private readonly sessionId;
    constructor(sessionId: string);
    start(tabId: string, rawUrl: string): ViewerResultToken;
    invalidate(): void;
    accepts(token: ViewerResultToken, state: ViewerState): boolean;
}
