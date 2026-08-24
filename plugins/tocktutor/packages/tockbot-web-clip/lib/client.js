window.__ModuleLoader__.load({ id: "tockbot-web-clip", factory: (require) => {
  const definitions = {"client-api": (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewerInputUrl = viewerInputUrl;
exports.parseReaderViewResult = parseReaderViewResult;
exports.parseViewerPageResult = parseViewerPageResult;
exports.parseClipPreview = parseClipPreview;
exports.parseClipApplyResult = parseClipApplyResult;
exports.requestViewerPage = requestViewerPage;
exports.requestReaderView = requestReaderView;
exports.requestClipPreview = requestClipPreview;
exports.requestClipApply = requestClipApply;
exports.requestClipCancel = requestClipCancel;
const viewer_ts_1 = require("viewer");
const MAX_VIEWER_HTML_CHARS = 1_000_000;
const MAX_VIEWER_RESPONSE_BYTES = 6_100_000;
const acceptedContentTypes = new Set(['application/xhtml+xml', 'text/html', 'text/plain']);
function viewerInputUrl(raw) {
    const value = raw.trim();
    if (!value || /[\u0000-\u001f\u007f]/u.test(value))
        throw new Error('Enter a public HTTP(S) URL.');
    try {
        return (0, viewer_ts_1.normalizeViewerPageUrl)(/^[a-z][a-z\d+.-]*:/iu.test(value) ? value : `https://${value}`);
    }
    catch {
        throw new Error('Enter a credential-free public HTTP(S) hostname.');
    }
}
function parseReaderViewResult(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid Reader View.');
    const input = value;
    if (typeof input.content !== 'string'
        || input.content.length > 200_000
        || typeof input.sourceUrl !== 'string'
        || typeof input.title !== 'string'
        || input.title.length > 200
        || !Array.isArray(input.warnings)
        || input.warnings.length > 8
        || input.warnings.some(warning => typeof warning !== 'string' || warning.length > 200)) {
        throw new Error('The Host returned an invalid Reader View.');
    }
    return {
        content: input.content,
        sourceUrl: viewerInputUrl(input.sourceUrl),
        title: input.title,
        warnings: input.warnings,
    };
}
function parseViewerPageResult(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid viewer page.');
    const input = value;
    if (typeof input.contentType !== 'string'
        || !acceptedContentTypes.has(input.contentType)
        || typeof input.html !== 'string'
        || input.html.length > MAX_VIEWER_HTML_CHARS
        || typeof input.title !== 'string'
        || input.title.length > 240
        || typeof input.url !== 'string')
        throw new Error('The Host returned an invalid viewer page.');
    const url = viewerInputUrl(input.url);
    return {
        contentType: input.contentType,
        html: input.html,
        title: input.title,
        url,
    };
}
function validatedClipPath(value) {
    if (typeof value !== 'string'
        || !value
        || value.length > 1024
        || value.startsWith('/')
        || value.startsWith('\\')
        || /^[A-Za-z]:/u.test(value))
        throw new Error('The Host returned an invalid clip path.');
    const parts = value.split('/');
    if (parts.some(part => (!part
        || part !== part.trim()
        || part === '.'
        || part === '..'
        || part.length > 255
        || /[:*?"<>|\\\u0000-\u001f\u007f]/u.test(part))) || !/\.(?:md|markdown)$/iu.test(value))
        throw new Error('The Host returned an invalid clip path.');
    return value;
}
function parseClipPreview(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid clip preview.');
    const input = value;
    const destination = validatedClipPath(input.destination);
    const target = input.target;
    const vault = input.vault;
    if (typeof input.contentDigest !== 'string'
        || !/^sha256:[0-9a-f]{64}$/u.test(input.contentDigest)
        || typeof input.expiresAt !== 'number'
        || !Number.isSafeInteger(input.expiresAt)
        || input.expiresAt < 0
        || typeof input.markdown !== 'string'
        || input.markdown.length > 210_000
        || new TextEncoder().encode(input.markdown).byteLength > 256 * 1024
        || input.permission !== 'user-approval-required'
        || typeof input.reviewId !== 'string'
        || !input.reviewId
        || input.reviewId.length > 128
        || typeof input.sourceUrl !== 'string'
        || typeof input.title !== 'string'
        || input.title.length > 200
        || typeof target !== 'object'
        || target === null
        || target.state !== 'absent'
        || typeof vault !== 'object'
        || vault === null
        || typeof vault.id !== 'string'
        || vault.id.length > 256
        || !Number.isSafeInteger(vault.generation)
        || (vault.generation < 0)) {
        throw new Error('The Host returned an invalid clip preview.');
    }
    return {
        contentDigest: input.contentDigest,
        destination,
        expiresAt: input.expiresAt,
        markdown: input.markdown,
        permission: 'user-approval-required',
        reviewId: input.reviewId,
        sourceUrl: viewerInputUrl(input.sourceUrl),
        target: { state: 'absent' },
        title: input.title,
        vault: {
            generation: vault.generation,
            id: vault.id,
        },
    };
}
function parseClipApplyResult(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid clip result.');
    const input = value;
    const path = validatedClipPath(input.path);
    if (input.status !== 'created'
        || typeof input.digest !== 'string'
        || !/^sha256:[0-9a-f]{64}$/u.test(input.digest)
        || typeof input.generation !== 'number'
        || !Number.isSafeInteger(input.generation)
        || input.generation < 0
        || typeof input.revision !== 'string'
        || !input.revision
        || input.revision.length > 256)
        throw new Error('The Host returned an invalid clip result.');
    return {
        digest: input.digest,
        generation: input.generation,
        path,
        revision: input.revision,
        status: 'created',
    };
}
async function responseText(response) {
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            bytes += value.byteLength;
            if (bytes > MAX_VIEWER_RESPONSE_BYTES)
                throw new Error('The Host response is too large.');
            text += decoder.decode(value, { stream: true });
        }
        return text + decoder.decode();
    }
    catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
}
async function requestApi(path, body, signal) {
    const response = await fetch(path, {
        body: JSON.stringify(body),
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal,
    });
    const raw = await responseText(response);
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error('The Host returned an invalid response.');
    }
    if (!response.ok) {
        const code = typeof value === 'object' && value !== null && typeof value.error === 'string'
            ? value.error
            : `HTTP ${String(response.status)}`;
        throw new Error(`Viewer request failed: ${code.slice(0, 80)}`);
    }
    return value;
}
async function requestViewerPage(url, signal) {
    return parseViewerPageResult(await requestApi(viewer_ts_1.WEB_CLIP_VIEWER_API_PATH, { url: viewerInputUrl(url) }, signal));
}
async function requestReaderView(url, signal) {
    return parseReaderViewResult(await requestApi(viewer_ts_1.WEB_CLIP_READER_API_PATH, { url: viewerInputUrl(url) }, signal));
}
async function requestClipPreview(url, destination, signal) {
    return parseClipPreview(await requestApi(viewer_ts_1.WEB_CLIP_REVIEW_API_PATH, {
        ...(destination?.trim() ? { destination: destination.trim() } : {}),
        url: viewerInputUrl(url),
    }, signal));
}
async function requestClipApply(approval, signal) {
    return parseClipApplyResult(await requestApi(viewer_ts_1.WEB_CLIP_APPLY_API_PATH, approval, signal));
}
async function requestClipCancel(reviewId, signal) {
    const value = await requestApi(viewer_ts_1.WEB_CLIP_CANCEL_API_PATH, { reviewId }, signal);
    if (typeof value !== 'object' || value === null || typeof value.cancelled !== 'boolean') {
        throw new Error('The Host returned an invalid clip cancellation.');
    }
    return value.cancelled;
}

},
"viewer": (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewerResultGuard = exports.defaultReaderPreferences = exports.SUPPORTED_TOCKTEAM_DESKTOP_VERSION = exports.MAX_VIEWER_STORAGE_CHARS = exports.MAX_VIEWER_BOOKMARKS = exports.MAX_VIEWER_TABS = exports.WEB_CLIP_VIEWER_API_PATH = exports.WEB_CLIP_REVIEW_API_PATH = exports.WEB_CLIP_READER_API_PATH = exports.WEB_CLIP_CANCEL_API_PATH = exports.WEB_CLIP_APPLY_API_PATH = void 0;
exports.normalizeViewerPageUrl = normalizeViewerPageUrl;
exports.createViewerState = createViewerState;
exports.addViewerTab = addViewerTab;
exports.selectViewerTab = selectViewerTab;
exports.navigateViewerTab = navigateViewerTab;
exports.moveViewerTab = moveViewerTab;
exports.closeViewerTab = closeViewerTab;
exports.addViewerBookmark = addViewerBookmark;
exports.removeViewerBookmark = removeViewerBookmark;
exports.restoreViewerState = restoreViewerState;
exports.serializeViewerState = serializeViewerState;
exports.WEB_CLIP_APPLY_API_PATH = '/web-clip/api/clip/apply';
exports.WEB_CLIP_CANCEL_API_PATH = '/web-clip/api/clip/cancel';
exports.WEB_CLIP_READER_API_PATH = '/web-clip/api/reader';
exports.WEB_CLIP_REVIEW_API_PATH = '/web-clip/api/clip/review';
exports.WEB_CLIP_VIEWER_API_PATH = '/web-clip/api/viewer';
exports.MAX_VIEWER_TABS = 20;
exports.MAX_VIEWER_BOOKMARKS = 20;
exports.MAX_VIEWER_STORAGE_CHARS = 65_536;
exports.SUPPORTED_TOCKTEAM_DESKTOP_VERSION = '0.1.6';
const MAX_VIEWER_TITLE_CHARS = 240;
const utf8 = new TextEncoder();
exports.defaultReaderPreferences = {
    appearance: 'system',
    spacing: 'md',
    textSize: 'md',
    width: 'md',
};
function normalizeViewerPageUrl(value) {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
    if ((url.protocol !== 'http:' && url.protocol !== 'https:')
        || url.username
        || url.password
        || hostname === 'localhost'
        || hostname.endsWith('.localhost')
        || hostname.endsWith('.local')
        || hostname === 'home.arpa'
        || hostname.endsWith('.home.arpa')
        || hostname.startsWith('[')
        || /^[\d.]+$/u.test(hostname)) {
        throw new Error('Viewer pages require a credential-free public HTTP(S) hostname');
    }
    url.hash = '';
    const normalized = url.toString();
    if (utf8.encode(normalized).byteLength > 4096)
        throw new Error('Viewer page URL is too long');
    return normalized;
}
function tab(id) {
    return { id: `tab-${String(id)}`, title: 'New Tab', url: null };
}
function createViewerState() {
    return {
        activeId: 'tab-1',
        bookmarks: [],
        nextBookmarkId: 1,
        nextTabId: 2,
        readerPreferences: { ...exports.defaultReaderPreferences },
        tabs: [tab(1)],
    };
}
function addViewerTab(state) {
    if (state.tabs.length >= exports.MAX_VIEWER_TABS)
        return state;
    const created = tab(state.nextTabId);
    return {
        ...state,
        activeId: created.id,
        nextTabId: state.nextTabId + 1,
        tabs: [...state.tabs, created],
    };
}
function selectViewerTab(state, id) {
    return state.tabs.some(item => item.id === id) ? { ...state, activeId: id } : state;
}
function navigateViewerTab(state, id, page) {
    const url = normalizeViewerPageUrl(page.url);
    let found = false;
    const tabs = state.tabs.map(item => {
        if (item.id !== id)
            return item;
        found = true;
        return {
            ...item,
            title: page.title.trim().slice(0, MAX_VIEWER_TITLE_CHARS) || new URL(url).hostname,
            url,
        };
    });
    return found ? { ...state, tabs } : state;
}
function moveViewerTab(state, id, rawIndex) {
    const currentIndex = state.tabs.findIndex(item => item.id === id);
    if (currentIndex < 0 || !Number.isSafeInteger(rawIndex))
        return state;
    const targetIndex = Math.max(0, Math.min(state.tabs.length - 1, rawIndex));
    if (targetIndex === currentIndex)
        return state;
    const tabs = [...state.tabs];
    const [moved] = tabs.splice(currentIndex, 1);
    if (!moved)
        return state;
    tabs.splice(targetIndex, 0, moved);
    return { ...state, tabs };
}
function closeViewerTab(state, id) {
    const index = state.tabs.findIndex(item => item.id === id);
    if (index < 0)
        return state;
    const tabs = state.tabs.filter(item => item.id !== id);
    if (tabs.length === 0) {
        const created = tab(state.nextTabId);
        return {
            ...state,
            activeId: created.id,
            nextTabId: state.nextTabId + 1,
            tabs: [created],
        };
    }
    return {
        ...state,
        activeId: state.activeId === id
            ? tabs[Math.min(index, tabs.length - 1)]?.id ?? tabs[0]?.id ?? state.activeId
            : state.activeId,
        tabs,
    };
}
function addViewerBookmark(state) {
    if (state.bookmarks.length >= exports.MAX_VIEWER_BOOKMARKS)
        return state;
    const active = state.tabs.find(item => item.id === state.activeId);
    if (!active?.url || state.bookmarks.some(item => item.url === active.url))
        return state;
    return {
        ...state,
        bookmarks: [...state.bookmarks, {
                id: `bookmark-${String(state.nextBookmarkId)}`,
                title: active.title,
                url: active.url,
            }],
        nextBookmarkId: state.nextBookmarkId + 1,
    };
}
function removeViewerBookmark(state, id) {
    const bookmarks = state.bookmarks.filter(item => item.id !== id);
    return bookmarks.length === state.bookmarks.length ? state : { ...state, bookmarks };
}
function readerPreferences(value) {
    const input = typeof value === 'object' && value !== null
        ? value
        : {};
    return {
        appearance: input.appearance === 'dark' || input.appearance === 'light'
            ? input.appearance
            : 'system',
        spacing: input.spacing === 'compact' || input.spacing === 'relaxed'
            ? input.spacing
            : 'md',
        textSize: input.textSize === 'lg' || input.textSize === 'sm'
            ? input.textSize
            : 'md',
        width: input.width === 'narrow' || input.width === 'wide'
            ? input.width
            : 'md',
    };
}
function restoreViewerState(raw) {
    if (!raw || raw.length > exports.MAX_VIEWER_STORAGE_CHARS)
        return createViewerState();
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        return createViewerState();
    }
    if (typeof value !== 'object' || value === null)
        return createViewerState();
    const input = value;
    if (input.version !== 1 || !Array.isArray(input.tabs))
        return createViewerState();
    const tabs = [];
    for (const item of input.tabs) {
        if (tabs.length >= exports.MAX_VIEWER_TABS || typeof item !== 'object' || item === null)
            continue;
        const candidate = item;
        if (candidate.url === null) {
            tabs.push(tab(tabs.length + 1));
            continue;
        }
        if (typeof candidate.url !== 'string')
            continue;
        try {
            const url = normalizeViewerPageUrl(candidate.url);
            tabs.push({
                id: `tab-${String(tabs.length + 1)}`,
                title: typeof candidate.title === 'string'
                    ? candidate.title.trim().slice(0, MAX_VIEWER_TITLE_CHARS) || new URL(url).hostname
                    : new URL(url).hostname,
                url,
            });
        }
        catch {
            // Persisted viewer state is untrusted; discard only the invalid entry.
        }
    }
    if (tabs.length === 0)
        return createViewerState();
    const bookmarks = [];
    if (Array.isArray(input.bookmarks)) {
        for (const item of input.bookmarks) {
            if (bookmarks.length >= exports.MAX_VIEWER_BOOKMARKS || typeof item !== 'object' || item === null)
                continue;
            const candidate = item;
            if (typeof candidate.url !== 'string')
                continue;
            try {
                const url = normalizeViewerPageUrl(candidate.url);
                if (bookmarks.some(bookmark => bookmark.url === url))
                    continue;
                bookmarks.push({
                    id: `bookmark-${String(bookmarks.length + 1)}`,
                    title: typeof candidate.title === 'string'
                        ? candidate.title.trim().slice(0, MAX_VIEWER_TITLE_CHARS) || new URL(url).hostname
                        : new URL(url).hostname,
                    url,
                });
            }
            catch {
                // Discard malformed bookmark entries without losing later valid values.
            }
        }
    }
    const activeIndex = Number.isSafeInteger(input.activeIndex)
        ? Math.max(0, Math.min(tabs.length - 1, input.activeIndex))
        : 0;
    return {
        activeId: tabs[activeIndex]?.id ?? tabs[0]?.id ?? 'tab-1',
        bookmarks,
        nextBookmarkId: bookmarks.length + 1,
        nextTabId: tabs.length + 1,
        readerPreferences: readerPreferences(input.readerPreferences),
        tabs,
    };
}
function serializeViewerState(state) {
    const payload = {
        activeIndex: Math.max(0, state.tabs.findIndex(item => item.id === state.activeId)),
        bookmarks: state.bookmarks.slice(0, exports.MAX_VIEWER_BOOKMARKS).map(({ title, url }) => ({ title, url })),
        readerPreferences: state.readerPreferences,
        tabs: state.tabs.slice(0, exports.MAX_VIEWER_TABS).map(({ title, url }) => ({ title, url })),
        version: 1,
    };
    let serialized = JSON.stringify(payload);
    while (serialized.length > exports.MAX_VIEWER_STORAGE_CHARS && payload.bookmarks.length > 0) {
        payload.bookmarks.pop();
        serialized = JSON.stringify(payload);
    }
    while (serialized.length > exports.MAX_VIEWER_STORAGE_CHARS && payload.tabs.length > 1) {
        payload.tabs.pop();
        payload.activeIndex = Math.min(payload.activeIndex, payload.tabs.length - 1);
        serialized = JSON.stringify(payload);
    }
    return serialized;
}
class ViewerResultGuard {
    requestId = 0;
    sessionId;
    constructor(sessionId) {
        this.sessionId = sessionId;
    }
    start(tabId, rawUrl) {
        this.requestId += 1;
        return {
            requestId: this.requestId,
            sessionId: this.sessionId,
            tabId,
            url: normalizeViewerPageUrl(rawUrl),
        };
    }
    invalidate() {
        this.requestId += 1;
    }
    accepts(token, state) {
        const active = state.tabs.find(item => item.id === state.activeId);
        return token.sessionId === this.sessionId
            && token.requestId === this.requestId
            && token.tabId === state.activeId
            && active?.url === token.url;
    }
}
exports.ViewerResultGuard = ViewerResultGuard;

},
"client": (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.apply = apply;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const client_api_ts_1 = require("client-api");
const viewer_ts_1 = require("viewer");
const VIEWER_STORAGE_KEY = 'tocktutor.webViewer.v1';
function storedViewerState() {
    try {
        return (0, viewer_ts_1.restoreViewerState)(window.localStorage.getItem(VIEWER_STORAGE_KEY));
    }
    catch {
        return (0, viewer_ts_1.restoreViewerState)(null);
    }
}
function cancelClipPreview(preview) {
    if (preview)
        void (0, client_api_ts_1.requestClipCancel)(preview.reviewId, AbortSignal.timeout(5_000)).catch(() => undefined);
}
const frameStyle = {
    border: 0,
    display: 'flex',
    flex: 1,
    minHeight: 0,
    width: '100%',
};
function WebViewer() {
    const bridge = window.dshDesktop?.webClip;
    const host = (0, react_1.useRef)(null);
    const webview = (0, react_1.useRef)(null);
    const frameId = (0, react_1.useRef)(null);
    const request = (0, react_1.useRef)(null);
    const readerRequest = (0, react_1.useRef)(null);
    const clipRequest = (0, react_1.useRef)(null);
    const clipPreviewRef = (0, react_1.useRef)(null);
    const clipApplyingRef = (0, react_1.useRef)(false);
    const activeId = (0, react_1.useRef)('tab-1');
    const navigateRef = (0, react_1.useRef)(() => { });
    const [viewer, setViewer] = (0, react_1.useState)(storedViewerState);
    const viewerRef = (0, react_1.useRef)(viewer);
    const [readerGuard] = (0, react_1.useState)(() => new viewer_ts_1.ViewerResultGuard(crypto.randomUUID()));
    const [draft, setDraft] = (0, react_1.useState)(() => viewer.tabs.find(tab => tab.id === viewer.activeId)?.url ?? '');
    const [error, setError] = (0, react_1.useState)('');
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [reader, setReader] = (0, react_1.useState)(null);
    const [readerLoading, setReaderLoading] = (0, react_1.useState)(false);
    const [clipDestination, setClipDestination] = (0, react_1.useState)('');
    const [clipPreview, setClipPreview] = (0, react_1.useState)(null);
    const [clipLoading, setClipLoading] = (0, react_1.useState)(false);
    const [clipApplying, setClipApplying] = (0, react_1.useState)(false);
    const [clipSavedPath, setClipSavedPath] = (0, react_1.useState)('');
    clipPreviewRef.current = clipPreview;
    activeId.current = viewer.activeId;
    viewerRef.current = viewer;
    const active = viewer.tabs.find(tab => tab.id === viewer.activeId);
    const navigate = (0, react_1.useCallback)((raw, tabId = activeId.current) => {
        if (clipApplyingRef.current)
            return;
        if (!bridge) {
            setError('Web Viewer is available only in TockTeam Desktop.');
            return;
        }
        let url;
        try {
            url = (0, client_api_ts_1.viewerInputUrl)(raw);
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
            return;
        }
        request.current?.abort();
        readerRequest.current?.abort();
        clipRequest.current?.abort();
        const previousPreview = clipPreviewRef.current;
        clipPreviewRef.current = null;
        cancelClipPreview(previousPreview);
        readerGuard.invalidate();
        setReader(null);
        setClipPreview(null);
        setClipLoading(false);
        setClipSavedPath('');
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setError('');
        void (0, client_api_ts_1.requestViewerPage)(url, controller.signal).then(async (page) => {
            if (controller.signal.aborted)
                return;
            const element = webview.current;
            const id = frameId.current;
            if (!element || id === null)
                throw new Error('The isolated page frame is not ready.');
            const documentUrl = await bridge.authorizeDocument(id, page.html);
            if (controller.signal.aborted)
                return;
            await element.loadURL(documentUrl);
            if (controller.signal.aborted)
                return;
            setViewer(current => {
                const next = (0, viewer_ts_1.navigateViewerTab)(current, tabId, page);
                viewerRef.current = next;
                return next;
            });
            if (activeId.current === tabId)
                setDraft(page.url);
        }).catch(nextError => {
            if (!controller.signal.aborted) {
                setError(nextError instanceof Error ? nextError.message : String(nextError));
            }
        }).finally(() => {
            if (request.current === controller) {
                request.current = null;
                setLoading(false);
            }
        });
    }, [bridge, readerGuard]);
    navigateRef.current = navigate;
    (0, react_1.useEffect)(() => {
        const container = host.current;
        if (!container || !bridge)
            return;
        const element = document.createElement('webview');
        element.setAttribute('partition', `tockteam-web-clip-${crypto.randomUUID()}`);
        element.setAttribute('src', 'about:blank');
        Object.assign(element.style, frameStyle);
        const ready = () => {
            try {
                frameId.current = element.getWebContentsId();
                const current = viewerRef.current;
                const restored = current.tabs.find(tab => tab.id === current.activeId);
                if (restored?.url)
                    navigateRef.current(restored.url, restored.id);
            }
            catch {
                setError('The isolated page frame failed to start.');
            }
        };
        element.addEventListener('dom-ready', ready);
        container.append(element);
        webview.current = element;
        return () => {
            request.current?.abort();
            readerRequest.current?.abort();
            clipRequest.current?.abort();
            const previousPreview = clipPreviewRef.current;
            cancelClipPreview(previousPreview);
            readerGuard.invalidate();
            request.current = null;
            readerRequest.current = null;
            clipRequest.current = null;
            element.removeEventListener('dom-ready', ready);
            frameId.current = null;
            webview.current = null;
            element.remove();
        };
    }, [bridge, readerGuard]);
    (0, react_1.useEffect)(() => {
        try {
            window.localStorage.setItem(VIEWER_STORAGE_KEY, (0, viewer_ts_1.serializeViewerState)(viewer));
        }
        catch {
            // Viewer persistence is best-effort; the live bounded session remains usable.
        }
    }, [viewer]);
    const invalidateClip = () => {
        if (clipApplyingRef.current)
            return;
        clipRequest.current?.abort();
        clipRequest.current = null;
        const previousPreview = clipPreviewRef.current;
        clipPreviewRef.current = null;
        cancelClipPreview(previousPreview);
        setClipPreview(null);
        setClipLoading(false);
        setClipSavedPath('');
    };
    const invalidateReader = () => {
        readerRequest.current?.abort();
        readerRequest.current = null;
        readerGuard.invalidate();
        invalidateClip();
        setReader(null);
        setReaderLoading(false);
    };
    const activate = (tab) => {
        if (clipApplyingRef.current)
            return;
        const next = (0, viewer_ts_1.selectViewerTab)(viewer, tab.id);
        viewerRef.current = next;
        setViewer(next);
        setDraft(tab.url ?? '');
        request.current?.abort();
        invalidateReader();
        if (tab.url)
            navigate(tab.url, tab.id);
    };
    const close = (id) => {
        if (clipApplyingRef.current)
            return;
        const next = (0, viewer_ts_1.closeViewerTab)(viewer, id);
        viewerRef.current = next;
        setViewer(next);
        const nextActive = next.tabs.find(tab => tab.id === next.activeId);
        setDraft(nextActive?.url ?? '');
        request.current?.abort();
        invalidateReader();
        if (nextActive?.url)
            navigate(nextActive.url, nextActive.id);
    };
    const loadReader = () => {
        if (clipApplyingRef.current)
            return;
        const current = viewerRef.current;
        const tab = current.tabs.find(item => item.id === current.activeId);
        if (!tab?.url)
            return;
        readerRequest.current?.abort();
        const controller = new AbortController();
        readerRequest.current = controller;
        const token = readerGuard.start(tab.id, tab.url);
        setReaderLoading(true);
        setError('');
        void (0, client_api_ts_1.requestReaderView)(tab.url, controller.signal).then(result => {
            if (readerGuard.accepts(token, viewerRef.current))
                setReader(result);
        }).catch(nextError => {
            if (readerGuard.accepts(token, viewerRef.current)) {
                setError(nextError instanceof Error ? nextError.message : String(nextError));
            }
        }).finally(() => {
            if (readerRequest.current === controller) {
                readerRequest.current = null;
                setReaderLoading(false);
            }
        });
    };
    const createClipPreview = () => {
        const current = viewerRef.current;
        const tab = current.tabs.find(item => item.id === current.activeId);
        if (!tab?.url)
            return;
        invalidateClip();
        const controller = new AbortController();
        clipRequest.current = controller;
        setClipLoading(true);
        setError('');
        void (0, client_api_ts_1.requestClipPreview)(tab.url, clipDestination, controller.signal).then(result => {
            if (controller.signal.aborted || activeId.current !== tab.id)
                return;
            clipPreviewRef.current = result;
            setClipPreview(result);
            setClipDestination(result.destination);
        }).catch(nextError => {
            if (!controller.signal.aborted)
                setError(nextError instanceof Error ? nextError.message : String(nextError));
        }).finally(() => {
            if (clipRequest.current === controller) {
                clipRequest.current = null;
                setClipLoading(false);
            }
        });
    };
    const applyClip = () => {
        const value = clipPreviewRef.current;
        if (!value)
            return;
        clipRequest.current?.abort();
        const controller = new AbortController();
        clipRequest.current = controller;
        clipApplyingRef.current = true;
        setClipApplying(true);
        setClipLoading(true);
        setError('');
        void (0, client_api_ts_1.requestClipApply)({
            contentDigest: value.contentDigest,
            destination: value.destination,
            expiresAt: value.expiresAt,
            permission: 'user-approved',
            reviewId: value.reviewId,
            sourceUrl: value.sourceUrl,
            target: value.target,
            vault: value.vault,
        }, controller.signal).then(result => {
            if (controller.signal.aborted)
                return;
            clipApplyingRef.current = false;
            setClipApplying(false);
            clipPreviewRef.current = null;
            setClipPreview(null);
            setClipSavedPath(result.path);
        }).catch(nextError => {
            if (!controller.signal.aborted) {
                clipApplyingRef.current = false;
                setClipApplying(false);
                cancelClipPreview(value);
                clipPreviewRef.current = null;
                setClipPreview(null);
                setError(nextError instanceof Error ? nextError.message : String(nextError));
            }
        }).finally(() => {
            if (clipRequest.current === controller) {
                clipRequest.current = null;
                clipApplyingRef.current = false;
                setClipApplying(false);
                setClipLoading(false);
            }
        });
    };
    const setReaderPreference = (key, value) => {
        setViewer(current => {
            const next = {
                ...current,
                readerPreferences: { ...current.readerPreferences, [key]: value },
            };
            viewerRef.current = next;
            return next;
        });
    };
    return ((0, jsx_runtime_1.jsxs)("section", { "aria-label": "Web Viewer", style: { display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }, children: [(0, jsx_runtime_1.jsxs)("div", { "aria-label": "Viewer Tabs", style: { display: 'flex', gap: 4, overflowX: 'auto' }, children: [viewer.tabs.map((tab, index) => ((0, jsx_runtime_1.jsxs)("span", { style: { display: 'inline-flex' }, children: [(0, jsx_runtime_1.jsx)("button", { "aria-pressed": tab.id === viewer.activeId, disabled: clipApplying, onClick: () => { activate(tab); }, type: "button", children: tab.title }), (0, jsx_runtime_1.jsx)("button", { "aria-label": `Close ${tab.title}`, disabled: clipApplying, onClick: () => { close(tab.id); }, type: "button", children: "\u00D7" }), (0, jsx_runtime_1.jsx)("button", { "aria-label": `Move ${tab.title} Left`, disabled: index === 0, onClick: () => { setViewer(current => (0, viewer_ts_1.moveViewerTab)(current, tab.id, index - 1)); }, type: "button", children: "\u2190" }), (0, jsx_runtime_1.jsx)("button", { "aria-label": `Move ${tab.title} Right`, disabled: index === viewer.tabs.length - 1, onClick: () => { setViewer(current => (0, viewer_ts_1.moveViewerTab)(current, tab.id, index + 1)); }, type: "button", children: "\u2192" })] }, tab.id))), (0, jsx_runtime_1.jsx)("button", { disabled: clipApplying, onClick: () => {
                            if (clipApplyingRef.current)
                                return;
                            request.current?.abort();
                            invalidateReader();
                            setViewer(current => {
                                const next = (0, viewer_ts_1.addViewerTab)(current);
                                viewerRef.current = next;
                                return next;
                            });
                            setDraft('');
                        }, type: "button", children: "New Tab" })] }), (0, jsx_runtime_1.jsxs)("form", { "aria-label": "Web Viewer Address", onSubmit: event => { event.preventDefault(); navigate(draft); }, style: { display: 'flex', gap: 4 }, children: [(0, jsx_runtime_1.jsx)("input", { "aria-label": "URL", disabled: clipApplying, onChange: event => { setDraft(event.currentTarget.value); }, placeholder: "https://example.com", value: draft }), (0, jsx_runtime_1.jsx)("button", { disabled: loading || clipApplying, type: "submit", children: loading ? 'Loading…' : 'Go' }), (0, jsx_runtime_1.jsx)("button", { disabled: !active?.url, onClick: () => { setViewer(current => (0, viewer_ts_1.addViewerBookmark)(current)); }, type: "button", children: "Bookmark" }), (0, jsx_runtime_1.jsx)("button", { disabled: !active?.url || readerLoading || clipApplying, onClick: () => { reader ? invalidateReader() : loadReader(); }, type: "button", children: reader ? 'Page View' : readerLoading ? 'Loading Reader…' : 'Reader View' })] }), viewer.bookmarks.length > 0 && ((0, jsx_runtime_1.jsxs)("details", { children: [(0, jsx_runtime_1.jsx)("summary", { children: "Bookmarks" }), viewer.bookmarks.map(bookmark => ((0, jsx_runtime_1.jsxs)("span", { children: [(0, jsx_runtime_1.jsx)("button", { disabled: clipApplying, onClick: () => { navigate(bookmark.url); }, type: "button", children: bookmark.title }), (0, jsx_runtime_1.jsx)("button", { "aria-label": `Remove ${bookmark.title}`, onClick: () => { setViewer(current => (0, viewer_ts_1.removeViewerBookmark)(current, bookmark.id)); }, type: "button", children: "\u00D7" })] }, bookmark.id)))] })), error && (0, jsx_runtime_1.jsx)("div", { role: "alert", children: error }), reader && ((0, jsx_runtime_1.jsxs)("article", { "aria-label": "Reader View", style: {
                    alignSelf: 'center',
                    background: viewer.readerPreferences.appearance === 'dark' ? '#171717' : viewer.readerPreferences.appearance === 'light' ? '#fff' : undefined,
                    color: viewer.readerPreferences.appearance === 'dark' ? '#f5f5f5' : viewer.readerPreferences.appearance === 'light' ? '#171717' : undefined,
                    fontSize: viewer.readerPreferences.textSize === 'sm' ? 14 : viewer.readerPreferences.textSize === 'lg' ? 18 : 16,
                    lineHeight: viewer.readerPreferences.spacing === 'compact' ? 1.4 : viewer.readerPreferences.spacing === 'relaxed' ? 1.9 : 1.65,
                    maxWidth: viewer.readerPreferences.width === 'narrow' ? 640 : viewer.readerPreferences.width === 'wide' ? 1000 : 800,
                    overflow: 'auto',
                    padding: 24,
                    width: '100%',
                }, children: [(0, jsx_runtime_1.jsxs)("div", { "aria-label": "Reader Settings", children: [(0, jsx_runtime_1.jsxs)("label", { children: ["Text Size ", (0, jsx_runtime_1.jsxs)("select", { onChange: event => { setReaderPreference('textSize', event.currentTarget.value); }, value: viewer.readerPreferences.textSize, children: [(0, jsx_runtime_1.jsx)("option", { value: "sm", children: "Small" }), (0, jsx_runtime_1.jsx)("option", { value: "md", children: "Medium" }), (0, jsx_runtime_1.jsx)("option", { value: "lg", children: "Large" })] })] }), (0, jsx_runtime_1.jsxs)("label", { children: ["Line Width ", (0, jsx_runtime_1.jsxs)("select", { onChange: event => { setReaderPreference('width', event.currentTarget.value); }, value: viewer.readerPreferences.width, children: [(0, jsx_runtime_1.jsx)("option", { value: "narrow", children: "Narrow" }), (0, jsx_runtime_1.jsx)("option", { value: "md", children: "Medium" }), (0, jsx_runtime_1.jsx)("option", { value: "wide", children: "Wide" })] })] }), (0, jsx_runtime_1.jsxs)("label", { children: ["Line Spacing ", (0, jsx_runtime_1.jsxs)("select", { onChange: event => { setReaderPreference('spacing', event.currentTarget.value); }, value: viewer.readerPreferences.spacing, children: [(0, jsx_runtime_1.jsx)("option", { value: "compact", children: "Compact" }), (0, jsx_runtime_1.jsx)("option", { value: "md", children: "Default" }), (0, jsx_runtime_1.jsx)("option", { value: "relaxed", children: "Relaxed" })] })] }), (0, jsx_runtime_1.jsxs)("label", { children: ["Appearance ", (0, jsx_runtime_1.jsxs)("select", { onChange: event => { setReaderPreference('appearance', event.currentTarget.value); }, value: viewer.readerPreferences.appearance, children: [(0, jsx_runtime_1.jsx)("option", { value: "system", children: "System" }), (0, jsx_runtime_1.jsx)("option", { value: "light", children: "Light" }), (0, jsx_runtime_1.jsx)("option", { value: "dark", children: "Dark" })] })] })] }), (0, jsx_runtime_1.jsx)("h2", { children: reader.title }), (0, jsx_runtime_1.jsxs)("section", { "aria-label": "Clip Web Page", children: [(0, jsx_runtime_1.jsxs)("label", { children: ["Clip Destination", (0, jsx_runtime_1.jsx)("input", { disabled: clipLoading || clipPreview !== null, onChange: event => { setClipDestination(event.currentTarget.value); }, placeholder: "example.md", value: clipDestination })] }), (0, jsx_runtime_1.jsx)("button", { disabled: clipLoading || clipPreview !== null, onClick: createClipPreview, type: "button", children: clipLoading && !clipPreview ? 'Generating Preview…' : 'Generate Clip Preview' }), clipPreview && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("p", { children: "Review the exact Markdown and destination before saving." }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Destination:" }), " ", clipPreview.destination] }), (0, jsx_runtime_1.jsx)("pre", { "aria-label": "Clip Markdown Preview", style: { maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }, children: clipPreview.markdown }), (0, jsx_runtime_1.jsx)("button", { disabled: clipLoading, onClick: applyClip, type: "button", children: clipLoading ? 'Saving…' : 'Save Clip' }), (0, jsx_runtime_1.jsx)("button", { disabled: clipLoading, onClick: invalidateClip, type: "button", children: "Cancel" })] })), clipSavedPath && (0, jsx_runtime_1.jsxs)("p", { role: "status", children: ["Saved clip to ", clipSavedPath, "."] })] }), reader.warnings.map(warning => (0, jsx_runtime_1.jsx)("p", { role: "status", children: warning }, warning)), (0, jsx_runtime_1.jsx)("pre", { style: { font: 'inherit', whiteSpace: 'pre-wrap' }, children: reader.content })] })), (0, jsx_runtime_1.jsx)("div", { ref: host, style: { display: reader ? 'none' : 'flex', flex: 1, minHeight: 0 } })] }));
}
exports.inject = ['desktopSidebar', 'tockTeamSurface'];
function apply(ctx) {
    const surface = ctx.get('tockTeamSurface');
    const sidebar = ctx.get('desktopSidebar');
    const desktop = window.dshDesktop;
    if (surface?.kind !== 'desktop' || !sidebar || !desktop?.webClip)
        return;
    let disposed = false;
    let remove;
    ctx.effect(() => () => {
        disposed = true;
        remove?.();
    }, 'tockbot-web-clip: Web Viewer');
    void desktop.getInfo().then(info => {
        if (disposed || info.version !== viewer_ts_1.SUPPORTED_TOCKTEAM_DESKTOP_VERSION)
            return;
        remove = sidebar.registerTab({
            id: 'web-clip',
            order: 31,
            render: () => (0, jsx_runtime_1.jsx)(WebViewer, {}),
            single: true,
            title: 'Web Viewer',
        });
    }).catch(() => undefined);
}

}};
  const cache = {};
  const localRequire = (id) => {
    if (!(id in definitions)) return require(id);
    if (!(id in cache)) {
      const module = { exports: {} };
      cache[id] = module;
      definitions[id](localRequire, module, module.exports);
    }
    return cache[id].exports;
  };
  return localRequire("client");
} });
//# sourceMappingURL=client.js.map
