export const WEB_CLIP_APPLY_API_PATH = '/web-clip/api/clip/apply';
export const WEB_CLIP_CANCEL_API_PATH = '/web-clip/api/clip/cancel';
export const WEB_CLIP_READER_API_PATH = '/web-clip/api/reader';
export const WEB_CLIP_REVIEW_API_PATH = '/web-clip/api/clip/review';
export const WEB_CLIP_VIEWER_API_PATH = '/web-clip/api/viewer';
export const MAX_VIEWER_TABS = 20;
export const MAX_VIEWER_BOOKMARKS = 20;
export const MAX_VIEWER_STORAGE_CHARS = 65_536;
export const SUPPORTED_TOCKTEAM_DESKTOP_VERSION = '0.1.6';
const MAX_VIEWER_TITLE_CHARS = 240;
const utf8 = new TextEncoder();
export const defaultReaderPreferences = {
    appearance: 'system',
    spacing: 'md',
    textSize: 'md',
    width: 'md',
};
export function normalizeViewerPageUrl(value) {
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
export function createViewerState() {
    return {
        activeId: 'tab-1',
        bookmarks: [],
        nextBookmarkId: 1,
        nextTabId: 2,
        readerPreferences: { ...defaultReaderPreferences },
        tabs: [tab(1)],
    };
}
export function addViewerTab(state) {
    if (state.tabs.length >= MAX_VIEWER_TABS)
        return state;
    const created = tab(state.nextTabId);
    return {
        ...state,
        activeId: created.id,
        nextTabId: state.nextTabId + 1,
        tabs: [...state.tabs, created],
    };
}
export function selectViewerTab(state, id) {
    return state.tabs.some(item => item.id === id) ? { ...state, activeId: id } : state;
}
export function navigateViewerTab(state, id, page) {
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
export function moveViewerTab(state, id, rawIndex) {
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
export function closeViewerTab(state, id) {
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
export function addViewerBookmark(state) {
    if (state.bookmarks.length >= MAX_VIEWER_BOOKMARKS)
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
export function removeViewerBookmark(state, id) {
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
export function restoreViewerState(raw) {
    if (!raw || raw.length > MAX_VIEWER_STORAGE_CHARS)
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
        if (tabs.length >= MAX_VIEWER_TABS || typeof item !== 'object' || item === null)
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
            if (bookmarks.length >= MAX_VIEWER_BOOKMARKS || typeof item !== 'object' || item === null)
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
export function serializeViewerState(state) {
    const payload = {
        activeIndex: Math.max(0, state.tabs.findIndex(item => item.id === state.activeId)),
        bookmarks: state.bookmarks.slice(0, MAX_VIEWER_BOOKMARKS).map(({ title, url }) => ({ title, url })),
        readerPreferences: state.readerPreferences,
        tabs: state.tabs.slice(0, MAX_VIEWER_TABS).map(({ title, url }) => ({ title, url })),
        version: 1,
    };
    let serialized = JSON.stringify(payload);
    while (serialized.length > MAX_VIEWER_STORAGE_CHARS && payload.bookmarks.length > 0) {
        payload.bookmarks.pop();
        serialized = JSON.stringify(payload);
    }
    while (serialized.length > MAX_VIEWER_STORAGE_CHARS && payload.tabs.length > 1) {
        payload.tabs.pop();
        payload.activeIndex = Math.min(payload.activeIndex, payload.tabs.length - 1);
        serialized = JSON.stringify(payload);
    }
    return serialized;
}
export class ViewerResultGuard {
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
