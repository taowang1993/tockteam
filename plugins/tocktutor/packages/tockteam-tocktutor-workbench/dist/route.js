import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { Checkbox } from '@tockteam/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@tockteam/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { Textarea } from '@tockteam/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, ChevronLeft, ChevronRight, Ellipsis, FileText, Folder, MessageSquare, Music, PanelLeft, PanelRight, PanelTop, Pencil, Plus, Search, Upload, X, } from 'lucide-react';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from "./assistant-panel.js";
import { ExecutableBaseView } from "./base-executable-view.js";
import { executableBasePropertyIdentity } from "./base-edit.js";
import { CanvasBoard } from "./canvas-board.js";
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT, } from "./native-actions.js";
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from "./review-panel.js";
import { parseCanvasDocument, updateCanvasNodePosition, } from "./canvas.js";
import { projectLivePreview, replaceLivePreviewLine, } from "./live-preview.js";
import { renderMarkdownHtml } from "./rich-markdown.js";
import { parseFrontmatterProperties, setFrontmatterProperty } from "./properties.js";
import { addBookmark, loadBookmarks, saveBookmarks } from "./bookmarks.js";
import { layoutGraph, projectGraph } from "./graph.js";
import { buildCaptureNote, buildJournalNote, uniqueNotePath } from "./capture.js";
import { buildOrganizationProposal } from "./organize.js";
import { convertMarkdownFormats, extractSelectionToNote } from "./composer.js";
import { appendAttachmentMarkdown, attachmentTargetPath } from "./attachments.js";
import { collectEmbedTargets, resolveNoteEmbedFragment } from "./embeds.js";
import { createNamedWorkspace, loadTockTutorSettings, loadWorkbenchState, saveTockTutorSettings, saveWorkbenchState, } from "./settings.js";
import { applyEditorCommand, resolvePlatformEditorCommand, } from "./editor-commands.js";
import { editorStatusLabel, resolveEditorShortcut, toggleMarkdownTask, } from "./markdown.js";
import { addPaneGroup, closeNoteTab, createWorkbenchSession, focusPaneGroup, isSafeVaultRelativePath, markTabDirty, MAX_NOTE_TABS, MAX_PANE_GROUPS, moveNoteTab, openNoteTab, setActiveNoteTab, setNoteTabMode, setTabPinned, hydrateWorkbenchSession, } from "./session.js";
import { isNoteVaultChangeEvent } from "./vault-events.js";
const ROUTE_PREFIX = '/tocktutor';
const TREE_LIMIT = 200;
const DEFAULT_SIDEBAR_WIDTH = 280;
const COLLAPSED_TITLEBAR_SIDEBAR_WIDTH = 84;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_ASSISTANT_PANEL_WIDTH = 300;
const MIN_ASSISTANT_PANEL_WIDTH = 240;
const MAX_ASSISTANT_PANEL_WIDTH = 720;
const clampAssistantPanelWidth = (width) => Math.min(MAX_ASSISTANT_PANEL_WIDTH, Math.max(MIN_ASSISTANT_PANEL_WIDTH, width));
export const MAX_ROUTE_SOURCE_BYTES = 2_000_000;
class RemoteCallError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function remoteValue(result) {
    if (result.ok)
        return result.value;
    throw new RemoteCallError(result.error.code, result.error.message);
}
function sameVault(left, right) {
    return left !== null && left.id === right.id && left.generation === right.generation;
}
function validRecentVaults(value) {
    return Number.isSafeInteger(value?.generation)
        && value.generation >= 0
        && Array.isArray(value.vaults)
        && value.vaults.length <= 20
        && value.vaults.every(vault => /^vault:[0-9a-f]{64}$/u.test(vault.id)
            && Number.isFinite(vault.lastOpenedAt)
            && vault.lastOpenedAt >= 0);
}
function validSearchResult(value, vault) {
    return value?.generation === vault.generation
        && typeof value.query === 'string'
        && Array.isArray(value.matches)
        && value.matches.length <= 100
        && value.matches.every(match => isSafeVaultRelativePath(match.path)
            && typeof match.preview === 'string'
            && match.preview.length <= 4_096
            && (match.line === null || Number.isSafeInteger(match.line)));
}
function documentKind(path) {
    if (!isSafeVaultRelativePath(path))
        return null;
    if (/\.(?:markdown|md)$/iu.test(path))
        return 'markdown';
    if (/\.canvas$/iu.test(path))
        return 'canvas';
    if (/\.base$/iu.test(path))
        return 'base';
    return null;
}
function supportedDocument(path) {
    return documentKind(path) !== null;
}
function routeModeFromSession(mode) {
    return mode === 'wysiwyg' ? 'live-preview' : mode;
}
function sessionModeFromRoute(mode) {
    return mode === 'live-preview' ? 'wysiwyg' : mode;
}
function boundedSource(source) {
    return new TextEncoder().encode(source).byteLength <= MAX_ROUTE_SOURCE_BYTES;
}
function defaultWorkbenchStorage() {
    try {
        return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
    }
    catch {
        return null;
    }
}
export function pathFromTockTutorLocation(pathname) {
    if (pathname === ROUTE_PREFIX || pathname === `${ROUTE_PREFIX}/`)
        return null;
    if (!pathname.startsWith(`${ROUTE_PREFIX}/`))
        return null;
    try {
        const path = pathname.slice(ROUTE_PREFIX.length + 1)
            .split('/')
            .map(segment => decodeURIComponent(segment))
            .join('/');
        return supportedDocument(path) ? path : null;
    }
    catch {
        return null;
    }
}
function routeForPath(path) {
    return `${ROUTE_PREFIX}/${path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
}
function initialSnapshot() {
    return Object.freeze({
        attachmentPreview: null,
        baseFiles: Object.freeze([]),
        bookmarks: Object.freeze([]),
        canGoBack: false,
        canGoForward: false,
        commandPaletteOpen: false,
        dispatchDialog: null,
        documentKind: null,
        draftRecovered: false,
        embeds: Object.freeze([]),
        entries: Object.freeze([]),
        facets: null,
        focusedPaneId: 'pane-1',
        focusMode: false,
        graph: null,
        graphLayout: Object.freeze([]),
        graphMode: 'global',
        links: null,
        message: 'Loading the active vault.',
        outline: null,
        mode: 'source',
        organizationProposal: null,
        path: null,
        phase: 'loading',
        recentVaults: Object.freeze([]),
        recentlyClosed: Object.freeze([]),
        recoveryOpen: false,
        revision: null,
        saveStatus: 'saved',
        searchLoading: false,
        searchMatches: Object.freeze([]),
        searchMode: 'query',
        searchOpen: false,
        searchQuery: '',
        selectedSnapshot: null,
        selectionEnd: 0,
        selectionStart: 0,
        snapshots: Object.freeze([]),
        source: '',
        trash: Object.freeze([]),
        panes: Object.freeze([Object.freeze({
                activePath: null,
                id: 'pane-1',
                tabs: Object.freeze([]),
            })]),
        vault: null,
        warnings: Object.freeze([]),
        workspaces: Object.freeze([]),
    });
}
/** Bounded route state machine shared by the React contribution and focused tests. */
export class WorkbenchRouteController {
    remote;
    navigate;
    now;
    storage;
    snapshot = initialSnapshot();
    listeners = new Set();
    vaultGeneration = 0;
    shellSession = createWorkbenchSession(ROUTE_PREFIX, null, 'pane-1');
    recentlyClosed = [];
    historyBack = [];
    historyForward = [];
    bookmarks = [];
    workspaces = [];
    operation = 0;
    dispatchRevision = 0;
    operationAbort = null;
    saveAbort = null;
    saving = null;
    draftAbort = null;
    draftTimer = null;
    eventDispose = null;
    pendingDispatch = null;
    pathname = ROUTE_PREFIX;
    started = false;
    disposed = false;
    constructor(remote, navigate, now = () => new Date(), storage = defaultWorkbenchStorage()) {
        this.remote = remote;
        this.navigate = navigate;
        this.now = now;
        this.storage = storage;
    }
    getSnapshot = () => this.snapshot;
    async handleDispatch(event) {
        const vault = this.snapshot.vault;
        if (this.disposed || this.snapshot.phase !== 'ready' || vault === null)
            return 'stale';
        const revision = this.dispatchRevision;
        if (event.operationId.length === 0 || event.operationId.length > 256
            || /[\u0000-\u001f\u007f]/u.test(event.operationId))
            return 'failed';
        if (event.kind === 'quick-action') {
            if (event.action === 'new' || event.action === 'capture') {
                return await this.openDispatchDialog(event.action, event.operationId, revision, vault);
            }
            if (event.action === 'search') {
                this.openSearch('');
                return 'handled';
            }
        }
        const request = event.kind === 'protocol'
            ? event.request
            : event.action === 'daily' ? { action: 'daily' } : undefined;
        if (request === undefined)
            return 'failed';
        if (request.action === 'choose-vault' || request.vault !== undefined || request.paneType === 'window')
            return 'failed';
        if (request.action === 'search') {
            if (request.query !== undefined && request.query.length > 1_000)
                return 'failed';
            this.openSearch(request.query ?? '');
            return 'handled';
        }
        if (request.action === 'open') {
            if (request.file === undefined) {
                if (this.snapshot.saveStatus !== 'saved' && !await this.save())
                    return 'failed';
                if (!this.dispatchCurrent(revision, vault))
                    return 'stale';
                this.navigate(ROUTE_PREFIX);
                return 'handled';
            }
            const opened = await this.select(request.file, true, revision);
            if (!this.dispatchCurrent(revision, vault))
                return 'stale';
            return opened ? 'handled' : 'failed';
        }
        if (request.action === 'daily') {
            const journal = buildJournalNote({
                folder: this.snapshot.settings?.journalFolder ?? 'Journals',
                now: this.now(),
            });
            const path = journal.path;
            const exists = this.snapshot.path === path || this.snapshot.entries.some(entry => entry.path === path);
            if (exists) {
                if (request.content !== undefined || request.ifExists !== undefined)
                    return 'failed';
                if (request.silent === true)
                    return 'handled';
                const opened = await this.select(path, true, revision);
                if (!this.dispatchCurrent(revision, vault))
                    return 'stale';
                return opened ? 'handled' : 'failed';
            }
            return await this.createDispatchedDocument(path, request.content ?? journal.content, request.silent === true, revision, vault);
        }
        if (request.action === 'unique') {
            const existing = new Set(this.snapshot.entries.filter(entry => entry.kind === 'document').map(entry => entry.path));
            if (this.snapshot.path !== null)
                existing.add(this.snapshot.path);
            return await this.createDispatchedDocument(uniqueNotePath(this.now(), existing), request.content ?? '', request.silent === true, revision, vault);
        }
        if (request.action !== 'new')
            return 'failed';
        const path = request.file ?? (request.name === undefined
            ? undefined
            : /\.md$/iu.test(request.name) ? request.name : `${request.name}.md`);
        if (path === undefined || !isSafeVaultRelativePath(path) || !/\.md$/iu.test(path))
            return 'failed';
        return await this.createDispatchedDocument(path, request.content ?? '', request.silent === true, revision, vault);
    }
    async createDispatchedDocument(path, content, silent, revision, vault) {
        if (!isSafeVaultRelativePath(path) || !/\.md$/iu.test(path) || !boundedSource(content))
            return 'failed';
        const previousPath = this.snapshot.path;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return 'failed';
        if (!this.dispatchCurrent(revision, vault))
            return 'stale';
        try {
            const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({
                content,
                expectedVault: vault,
                path,
            }));
            if (!this.dispatchCurrent(revision, vault))
                return 'stale';
            if (created.generation !== vault.generation || created.path !== path || created.status !== 'created')
                return 'failed';
            if (silent)
                return 'handled';
            this.update({
                documentKind: 'markdown',
                message: `${path} created.`,
                mode: 'source',
                path,
                revision: created.revision,
                saveStatus: 'saved',
                source: content,
            });
            this.recordOpen(path, true, previousPath);
            this.navigate(routeForPath(path));
            return 'handled';
        }
        catch {
            return this.dispatchCurrent(revision, vault) ? 'failed' : 'stale';
        }
    }
    openDispatchDialog(kind, operationId, revision, vault) {
        this.settlePendingDispatch('stale');
        this.update({ dispatchDialog: kind });
        return new Promise(resolve => {
            this.pendingDispatch = { kind, operationId, resolve, revision, submitting: false, vault };
        });
    }
    async submitDispatchDialog(draft) {
        const pending = this.pendingDispatch;
        if (pending === null || pending.submitting)
            return;
        pending.submitting = true;
        let path;
        let content;
        if (pending.kind === 'new') {
            path = draft.path?.trim() ?? '';
            content = '';
        }
        else {
            const title = draft.title?.trim() ?? '';
            const text = draft.text ?? '';
            if (title.length === 0 || title.length > 200 || text.length > 100_000) {
                this.settlePendingDispatch('failed');
                return;
            }
            try {
                const capture = buildCaptureNote({
                    body: text,
                    existing: new Set(this.snapshot.entries.filter(entry => entry.kind === 'document').map(entry => entry.path)),
                    now: this.now(),
                    title,
                });
                path = capture.path;
                content = capture.content;
            }
            catch {
                this.settlePendingDispatch('failed');
                return;
            }
        }
        const result = await this.createDispatchedDocument(path, content, false, pending.revision, pending.vault);
        if (this.pendingDispatch === pending)
            this.settlePendingDispatch(result);
    }
    cancelDispatchDialog() {
        this.settlePendingDispatch('failed');
    }
    setSearchQuery(query) {
        if (query.length <= 1_000)
            this.update({ searchQuery: query });
    }
    closeSearch() {
        this.update({ searchLoading: false, searchMatches: Object.freeze([]), searchOpen: false, searchQuery: '' });
    }
    openSearch(query) {
        this.update({ searchMatches: Object.freeze([]), searchOpen: true, searchQuery: query });
    }
    setSearchMode(mode) {
        this.update({ searchMode: mode });
    }
    async runSearch() {
        const vault = this.snapshot.vault;
        const query = this.snapshot.searchQuery.trim();
        if (vault === null || query.length === 0 || query.length > 1_000) {
            this.update({ searchMatches: Object.freeze([]) });
            return false;
        }
        const mode = this.snapshot.searchMode ?? 'query';
        const operation = this.nextOperation();
        this.update({ searchLoading: true });
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.search({
                expectedVault: vault,
                limit: 100,
                mode,
                query,
            }, operation.signal));
            if (!this.current(operation.id, vault) || !validSearchResult(result, vault))
                return false;
            this.update({
                message: result.truncated ? 'Search returned a bounded partial result.' : `${String(result.matches.length)} search results.`,
                searchLoading: false,
                searchMatches: Object.freeze(result.matches.map(match => Object.freeze({ ...match }))),
            });
            return true;
        }
        catch {
            if (this.current(operation.id, vault) && !operation.signal.aborted) {
                this.update({ message: 'Search could not be completed.', searchLoading: false });
            }
            return false;
        }
    }
    async loadFacets() {
        const vault = this.snapshot.vault;
        if (vault === null)
            return false;
        const operation = this.nextOperation();
        try {
            const facets = remoteValue(await this.remote.tocktutorWorkbench.facets({ expectedVault: vault, limit: 1_000 }, operation.signal));
            if (!this.current(operation.id, vault)
                || facets.generation !== vault.generation
                || !Array.isArray(facets.tags)
                || !Array.isArray(facets.properties)
                || facets.tags.length > 1_000
                || facets.properties.length > 1_000)
                return false;
            this.update({ facets });
            return true;
        }
        catch {
            return false;
        }
    }
    async loadGraph(mode) {
        const vault = this.snapshot.vault;
        if (vault === null || (mode === 'local' && this.snapshot.path === null))
            return false;
        const operation = this.nextOperation();
        try {
            const graph = remoteValue(await this.remote.tocktutorWorkbench.graph({
                ...(mode === 'local' ? { depth: 2 } : {}),
                direction: 'both',
                expectedVault: vault,
                includeAttachments: false,
                includeTags: false,
                limit: 180,
                ...(mode === 'local' && this.snapshot.path !== null ? { path: this.snapshot.path } : {}),
                scope: mode,
            }, operation.signal));
            if (!this.current(operation.id, vault)
                || graph.generation !== vault.generation
                || !Array.isArray(graph.nodes)
                || !Array.isArray(graph.edges))
                return false;
            const projected = projectGraph(graph, { includeOrphans: true, query: '' });
            const graphLayout = layoutGraph(projected, {
                centerForce: 0.1,
                iterations: 32,
                linkDistance: 120,
                linkForce: 0.08,
                repelForce: 1_800,
            });
            this.update({ graph, graphLayout: Object.freeze(graphLayout.map(node => Object.freeze(node))), graphMode: mode });
            return true;
        }
        catch {
            return false;
        }
    }
    async openSmartView(kind) {
        this.openSearch('');
        if (kind === 'recent') {
            const matches = this.snapshot.entries
                .filter((entry) => entry.kind === 'document' && /\.(?:markdown|md)$/iu.test(entry.path))
                .toSorted((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path))
                .slice(0, 100)
                .map(entry => ({ kind: 'path', line: null, path: entry.path, preview: 'Recently modified note.' }));
            this.update({ searchMatches: Object.freeze(matches) });
            return true;
        }
        if (kind === 'tags')
            return await this.loadFacets();
        const query = kind === 'tasks' ? 'task:todo'
            : kind === 'journals' ? 'path:Journals'
                : kind === 'favorites' ? '[favorite:true]'
                    : '[kind:collection]';
        this.setSearchQuery(query);
        this.setSearchMode('query');
        return await this.runSearch();
    }
    async loadRelationships() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.snapshot.documentKind !== 'markdown')
            return false;
        const operation = this.nextOperation();
        try {
            const [outlineResult, linksResult] = await Promise.all([
                this.remote.tocktutorWorkbench.outline({ expectedVault: vault, includeFootnotes: true, path }, operation.signal),
                this.remote.tocktutorWorkbench.links({ expectedVault: vault, includeUnlinked: true, path }, operation.signal),
            ]);
            const outline = remoteValue(outlineResult);
            const links = remoteValue(linksResult);
            if (!this.current(operation.id, vault)
                || this.snapshot.path !== path
                || outline.generation !== vault.generation
                || links.generation !== vault.generation
                || outline.path !== path
                || links.path !== path
                || !Array.isArray(outline.headings)
                || !Array.isArray(links.backlinkDetails)
                || !Array.isArray(links.outgoingDetails))
                return false;
            this.update({ links, outline });
            return true;
        }
        catch {
            return false;
        }
    }
    jumpToLine(line) {
        if (!Number.isSafeInteger(line) || line < 1 || this.snapshot.path === null)
            return false;
        let offset = 0;
        for (let current = 1; current < line; current += 1) {
            const next = this.snapshot.source.indexOf('\n', offset);
            if (next < 0)
                return false;
            offset = next + 1;
        }
        this.setMode('source');
        this.setSelection(offset, offset);
        return true;
    }
    settlePendingDispatch(result) {
        const pending = this.pendingDispatch;
        if (pending === null)
            return;
        this.pendingDispatch = null;
        this.update({ dispatchDialog: null });
        pending.resolve(result);
    }
    dispatchCurrent(revision, vault) {
        return !this.disposed && revision === this.dispatchRevision && sameVault(this.snapshot.vault, vault);
    }
    invalidateDispatch() {
        this.dispatchRevision += 1;
        this.settlePendingDispatch('stale');
    }
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    update(change) {
        if (this.disposed)
            return;
        this.snapshot = Object.freeze({ ...this.snapshot, ...change });
        for (const listener of this.listeners)
            listener();
    }
    shellPanes() {
        return Object.freeze(this.shellSession.groups.map(group => Object.freeze({
            activePath: group.tabs.find(tab => tab.id === group.activeTabId)?.path ?? null,
            id: group.id,
            tabs: Object.freeze(group.tabs.map(tab => Object.freeze({
                dirty: tab.dirty,
                mode: routeModeFromSession(tab.mode),
                path: tab.path,
                pinned: tab.pinned,
            }))),
        })));
    }
    syncShell(change = {}) {
        this.update({
            canGoBack: this.historyBack.length > 0,
            canGoForward: this.historyForward.length > 0,
            focusedPaneId: this.shellSession.focusedGroupId,
            panes: this.shellPanes(),
            recentlyClosed: Object.freeze(this.recentlyClosed.map(tab => Object.freeze({ ...tab }))),
            workspaces: Object.freeze(this.workspaces.map(workspace => Object.freeze({ ...workspace }))),
            ...change,
        });
        const vaultId = this.shellSession.vault?.id;
        if (this.storage !== null && vaultId !== undefined) {
            saveWorkbenchState(this.storage, vaultId, {
                focusMode: this.snapshot.focusMode === true,
                session: this.shellSession,
                workspaces: this.workspaces,
            });
        }
    }
    pane(id = this.snapshot.focusedPaneId) {
        return this.snapshot.panes.find(candidate => candidate.id === id);
    }
    recordOpen(path, recordHistory = true, previous = this.snapshot.path) {
        if (recordHistory && previous !== null && previous !== path) {
            this.historyBack.push(previous);
            if (this.historyBack.length > MAX_NOTE_TABS * MAX_PANE_GROUPS)
                this.historyBack.shift();
            this.historyForward.length = 0;
        }
        this.shellSession = openNoteTab(this.shellSession, this.shellSession.focusedGroupId, path, { mode: sessionModeFromRoute(this.snapshot.mode) });
        this.shellSession = markTabDirty(this.shellSession, this.shellSession.focusedGroupId, path, false);
        this.syncShell();
    }
    recordDirty(dirty) {
        const path = this.snapshot.path;
        if (path === null)
            return;
        this.shellSession = markTabDirty(this.shellSession, this.shellSession.focusedGroupId, path, dirty);
        this.syncShell();
    }
    scheduleDraft() {
        if (this.draftTimer !== null)
            clearTimeout(this.draftTimer);
        this.draftAbort?.abort();
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        const revision = this.snapshot.revision;
        const content = this.snapshot.source;
        if (vault === null || path === null)
            return;
        const abort = new AbortController();
        this.draftAbort = abort;
        this.draftTimer = setTimeout(() => {
            this.draftTimer = null;
            void this.remote.tocktutorWorkbench.saveDraft({
                content,
                expectedVault: vault,
                path,
                ...(revision === null ? {} : { revision }),
            }, abort.signal).catch(() => undefined).finally(() => {
                if (this.draftAbort === abort)
                    this.draftAbort = null;
            });
        }, 400);
    }
    clearDocument() {
        this.invalidateDispatch();
        this.nextOperation();
        this.update({
            baseFiles: Object.freeze([]),
            documentKind: null,
            draftRecovered: false,
            embeds: Object.freeze([]),
            links: null,
            message: 'Select a note from the vault.',
            organizationProposal: null,
            outline: null,
            path: null,
            revision: null,
            saveStatus: 'saved',
            source: '',
        });
    }
    nextOperation() {
        this.operationAbort?.abort();
        this.operationAbort = new AbortController();
        this.operation += 1;
        return { id: this.operation, signal: this.operationAbort.signal };
    }
    current(id, vault) {
        return !this.disposed
            && id === this.operation
            && (vault === undefined || sameVault(this.snapshot.vault, vault));
    }
    async syncLocation(pathname) {
        this.pathname = pathname;
        if (!this.started) {
            this.started = true;
            await this.reload();
            return;
        }
        const path = pathFromTockTutorLocation(pathname);
        if (this.snapshot.phase !== 'ready' || path === this.snapshot.path)
            return;
        if (path !== null) {
            await this.select(path, false);
            return;
        }
        if (this.snapshot.saveStatus !== 'saved' && !await this.save()) {
            if (this.snapshot.path !== null)
                this.navigate(routeForPath(this.snapshot.path), 'replace');
            return;
        }
        this.shellSession = setActiveNoteTab(this.shellSession, this.shellSession.focusedGroupId, null);
        this.syncShell();
        this.clearDocument();
    }
    async reload() {
        this.invalidateDispatch();
        const operation = this.nextOperation();
        this.shellSession = createWorkbenchSession(ROUTE_PREFIX, null, 'pane-1');
        this.bookmarks = [];
        this.vaultGeneration = 0;
        this.recentlyClosed.length = 0;
        this.historyBack.length = 0;
        this.historyForward.length = 0;
        this.eventDispose?.();
        this.eventDispose = null;
        this.update({
            baseFiles: Object.freeze([]),
            bookmarks: Object.freeze([]),
            canGoBack: false,
            canGoForward: false,
            dispatchDialog: null,
            documentKind: null,
            draftRecovered: false,
            embeds: Object.freeze([]),
            entries: Object.freeze([]),
            facets: null,
            focusedPaneId: 'pane-1',
            graph: null,
            graphLayout: Object.freeze([]),
            graphMode: 'global',
            links: null,
            message: 'Loading the active vault.',
            organizationProposal: null,
            outline: null,
            path: null,
            phase: 'loading',
            recentVaults: Object.freeze([]),
            recentlyClosed: Object.freeze([]),
            revision: null,
            saveStatus: 'saved',
            searchLoading: false,
            searchMatches: Object.freeze([]),
            searchMode: 'query',
            searchOpen: false,
            searchQuery: '',
            selectionEnd: 0,
            selectionStart: 0,
            source: '',
            panes: this.shellPanes(),
            vault: null,
            warnings: Object.freeze([]),
        });
        try {
            const recent = remoteValue(await this.remote.tocktutorWorkbench.listRecentVaults(operation.signal));
            if (!this.current(operation.id) || !validRecentVaults(recent))
                return;
            this.vaultGeneration = recent.generation;
            const recentVaults = Object.freeze(recent.vaults.map(vault => Object.freeze({ ...vault })));
            const vault = remoteValue(await this.remote.tocktutorWorkbench.currentVault(operation.signal));
            if (!this.current(operation.id))
                return;
            if (vault === null) {
                this.update({ message: 'No active TockTutor vault is available.', phase: 'inactive', recentVaults });
                return;
            }
            if (vault.generation !== recent.generation)
                return await this.reload();
            const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
                expectedVault: vault,
                limit: TREE_LIMIT,
            }, operation.signal));
            if (!this.current(operation.id) || page.generation !== vault.generation)
                return;
            const openable = new Set(page.entries.filter(entry => entry.kind === 'document' && supportedDocument(entry.path)).map(entry => entry.path));
            let settings;
            let restoredFocusMode = false;
            if (this.storage === null) {
                this.shellSession = createWorkbenchSession(ROUTE_PREFIX, vault, 'pane-1');
                this.bookmarks = [];
                this.workspaces = [];
            }
            else {
                const restored = loadWorkbenchState(this.storage, vault.id);
                this.shellSession = hydrateWorkbenchSession({
                    ...restored.session,
                    vault,
                    groups: restored.session.groups.map(group => ({
                        ...group,
                        tabs: group.tabs.filter(tab => openable.has(tab.path)),
                    })),
                });
                this.bookmarks = loadBookmarks(this.storage, vault.id);
                this.workspaces = restored.workspaces;
                restoredFocusMode = restored.focusMode;
                settings = loadTockTutorSettings(this.storage, vault.id);
            }
            this.update({
                bookmarks: Object.freeze(this.bookmarks.map(bookmark => Object.freeze({ ...bookmark }))),
                entries: Object.freeze(page.entries.toSorted((left, right) => left.path.localeCompare(right.path))),
                focusedPaneId: this.shellSession.focusedGroupId,
                focusMode: restoredFocusMode,
                message: page.truncated ? 'The vault tree is truncated to a bounded result.' : 'Vault ready.',
                panes: this.shellPanes(),
                phase: 'ready',
                recentVaults,
                ...(settings === undefined ? {} : { settings }),
                vault,
                warnings: Object.freeze(page.warnings),
                workspaces: Object.freeze(this.workspaces.map(workspace => Object.freeze({ ...workspace }))),
            });
            this.eventDispose = this.remote.$on('note-vault/change', event => { this.onVaultChange(event); });
            const path = pathFromTockTutorLocation(this.pathname) ?? this.pane()?.activePath ?? null;
            if (path !== null)
                await this.select(path, false);
        }
        catch (error) {
            if (!this.current(operation.id) || operation.signal.aborted)
                return;
            this.update({ message: this.failureMessage(error, 'The vault could not be loaded.'), phase: 'error' });
        }
    }
    onVaultChange(value) {
        if (!isNoteVaultChangeEvent(value))
            return;
        if (value.action === 'activated') {
            if (!sameVault(this.snapshot.vault, value.vault))
                void this.reload();
            return;
        }
        if (!sameVault(this.snapshot.vault, value.vault))
            return;
        if (value.kind === 'tree') {
            void this.refreshTree(value.vault);
            return;
        }
        const selected = this.snapshot.path;
        if (selected !== null
            && this.snapshot.saveStatus !== 'saved'
            && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
            this.update({ message: 'External Change: The active file changed on disk. Your local draft remains unsaved.' });
            void this.refreshTree(value.vault);
            return;
        }
        if (selected !== null
            && this.snapshot.saveStatus === 'saved'
            && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
            const nextPath = value.path === selected ? selected : value.path;
            if (supportedDocument(nextPath)) {
                void this.select(nextPath, false);
            }
            else {
                const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, selected);
                this.shellSession = closed.session;
                this.syncShell();
                this.clearDocument();
                this.navigate(ROUTE_PREFIX, 'replace');
                void this.refreshTree(value.vault);
            }
        }
        else {
            void this.refreshTree(value.vault);
        }
    }
    async refreshTree(vault) {
        const operation = this.nextOperation();
        try {
            const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
                expectedVault: vault,
                limit: TREE_LIMIT,
            }, operation.signal));
            if (!this.current(operation.id, vault) || page.generation !== vault.generation)
                return;
            this.update({
                entries: Object.freeze(page.entries.toSorted((left, right) => left.path.localeCompare(right.path))),
                warnings: Object.freeze(page.warnings),
            });
        }
        catch (error) {
            if (this.current(operation.id, vault) && !operation.signal.aborted) {
                this.update({ message: this.failureMessage(error, 'The vault tree could not be refreshed.') });
            }
        }
    }
    async activateRecentVault(id) {
        if (!/^vault:[0-9a-f]{64}$/u.test(id) || this.snapshot.recentVaults?.some(vault => vault.id === id) !== true)
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        const operation = this.nextOperation();
        const expectedGeneration = this.vaultGeneration;
        try {
            const vault = remoteValue(await this.remote.tocktutorWorkbench.activateRecentVault({
                expectedGeneration,
                id,
            }, operation.signal));
            if (!this.current(operation.id) || vault.generation < expectedGeneration || vault.id !== id)
                return false;
            await this.reload();
            return sameVault(this.snapshot.vault, vault);
        }
        catch {
            return false;
        }
    }
    async removeRecentVault(id) {
        if (!/^vault:[0-9a-f]{64}$/u.test(id) || this.snapshot.recentVaults?.some(vault => vault.id === id) !== true)
            return false;
        const operation = this.nextOperation();
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.removeRecentVault({
                expectedGeneration: this.vaultGeneration,
                id,
            }, operation.signal));
            if (!this.current(operation.id) || !validRecentVaults(result) || result.generation !== this.vaultGeneration)
                return false;
            this.update({ recentVaults: Object.freeze(result.vaults.map(vault => Object.freeze({ ...vault }))) });
            return true;
        }
        catch {
            return false;
        }
    }
    async openSandboxVault() {
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        const operation = this.nextOperation();
        const expectedGeneration = this.vaultGeneration;
        try {
            const vault = remoteValue(await this.remote.tocktutorWorkbench.openSandboxVault({ expectedGeneration }, operation.signal));
            if (!this.current(operation.id) || vault.generation < expectedGeneration)
                return false;
            await this.reload();
            return sameVault(this.snapshot.vault, vault);
        }
        catch {
            return false;
        }
    }
    async setRecoveryOpen(open) {
        this.update({ recoveryOpen: open, selectedSnapshot: open ? this.snapshot.selectedSnapshot ?? null : null });
        if (!open)
            return;
        const vault = this.snapshot.vault;
        if (vault === null)
            return;
        const path = this.snapshot.path;
        const operation = this.nextOperation();
        try {
            const trash = remoteValue(await this.remote.tocktutorWorkbench.listTrash({ expectedVault: vault }, operation.signal));
            if (!this.current(operation.id, vault) || trash.generation !== vault.generation || !Array.isArray(trash.entries))
                return;
            let snapshots = [];
            if (path !== null) {
                const result = remoteValue(await this.remote.tocktutorWorkbench.listSnapshots({ expectedVault: vault, path }, operation.signal));
                if (!this.current(operation.id, vault) || result.generation !== vault.generation || !Array.isArray(result.snapshots))
                    return;
                snapshots = result.snapshots;
            }
            this.update({
                snapshots: Object.freeze(snapshots.map(snapshot => Object.freeze({ ...snapshot }))),
                trash: Object.freeze(trash.entries.map(entry => Object.freeze({ ...entry }))),
            });
        }
        catch {
            if (this.current(operation.id, vault) && !operation.signal.aborted)
                this.update({ message: 'Recovery data could not be loaded.' });
        }
    }
    async readRecoverySnapshot(snapshotId) {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId) !== true)
            return false;
        const operation = this.nextOperation();
        try {
            const snapshot = remoteValue(await this.remote.tocktutorWorkbench.readSnapshot({ expectedVault: vault, path, snapshotId }, operation.signal));
            if (!this.current(operation.id, vault) || snapshot.generation !== vault.generation || snapshot.snapshot.id !== snapshotId)
                return false;
            this.update({ selectedSnapshot: snapshot });
            return true;
        }
        catch {
            return false;
        }
    }
    async restoreRecoverySnapshot(snapshotId) {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId) !== true)
            return false;
        const basename = path.split('/').at(-1) ?? 'Recovered.md';
        const stem = basename.replace(/\.(?:base|canvas|markdown|md)$/iu, '');
        const extension = basename.slice(stem.length) || '.md';
        const toPath = `Recovered/${stem} Recovery${extension}`;
        try {
            const restored = remoteValue(await this.remote.tocktutorWorkbench.restoreSnapshotAsNew({
                expectedVault: vault,
                path,
                snapshotId,
                toPath,
            }));
            if (restored.status !== 'created' || restored.generation !== vault.generation || restored.path !== toPath)
                return false;
            this.update({ message: `${toPath} restored.` });
            await this.refreshTree(vault);
            return true;
        }
        catch {
            return false;
        }
    }
    async trashCurrent() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        const revision = this.snapshot.revision;
        if (vault === null || path === null || revision === null)
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        try {
            remoteValue(await this.remote.tocktutorWorkbench.trashEntry({ expectedRevision: revision, expectedVault: vault, path }));
            const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, path);
            this.shellSession = closed.session;
            this.syncShell();
            this.clearDocument();
            this.navigate(ROUTE_PREFIX);
            await this.setRecoveryOpen(true);
            return true;
        }
        catch {
            return false;
        }
    }
    async restoreTrashEntry(id) {
        const vault = this.snapshot.vault;
        if (vault === null || this.snapshot.trash?.some(entry => entry.id === id) !== true)
            return false;
        try {
            remoteValue(await this.remote.tocktutorWorkbench.restoreTrash({ expectedVault: vault, id }));
            await this.setRecoveryOpen(true);
            await this.refreshTree(vault);
            return true;
        }
        catch {
            return false;
        }
    }
    async addPane() {
        if (this.snapshot.phase !== 'ready' || this.snapshot.panes.length >= MAX_PANE_GROUPS)
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        const used = new Set(this.snapshot.panes.map(pane => pane.id));
        let id = '';
        for (let index = 1; index <= MAX_PANE_GROUPS; index += 1) {
            const candidate = `pane-${String(index)}`;
            if (!used.has(candidate)) {
                id = candidate;
                break;
            }
        }
        if (id === '')
            return false;
        const added = addPaneGroup(this.shellSession, id);
        this.shellSession = added.session;
        this.syncShell();
        this.clearDocument();
        this.navigate(ROUTE_PREFIX);
        return true;
    }
    async focusPane(id, pathOverride) {
        const target = this.pane(id);
        if (target === undefined || this.snapshot.phase !== 'ready')
            return false;
        const path = pathOverride ?? target.activePath;
        if (id === this.snapshot.focusedPaneId && path === this.snapshot.path)
            return true;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        this.shellSession = focusPaneGroup(this.shellSession, id);
        if (path === null)
            this.shellSession = setActiveNoteTab(this.shellSession, id, null);
        this.syncShell();
        this.clearDocument();
        if (path === null) {
            this.navigate(ROUTE_PREFIX);
            return true;
        }
        return this.select(path);
    }
    async activateTab(paneId, path) {
        const pane = this.pane(paneId);
        if (pane === undefined || !pane.tabs.some(tab => tab.path === path))
            return false;
        return this.focusPane(paneId, path);
    }
    togglePinTab(paneId, path) {
        if (this.pane(paneId)?.tabs.some(tab => tab.path === path) !== true)
            return;
        this.shellSession = setTabPinned(this.shellSession, paneId, path);
        this.syncShell();
    }
    moveTab(paneId, path, direction) {
        this.shellSession = moveNoteTab(this.shellSession, paneId, path, direction);
        this.syncShell();
    }
    async closeTab(paneId, path) {
        const pane = this.pane(paneId);
        const tab = pane?.tabs.find(candidate => candidate.path === path);
        if (tab === undefined)
            return false;
        const active = paneId === this.snapshot.focusedPaneId && path === this.snapshot.path;
        if (active && this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        const result = closeNoteTab(this.shellSession, paneId, path);
        if (result.closed === null)
            return false;
        this.shellSession = result.session;
        this.recentlyClosed.splice(0, this.recentlyClosed.length, {
            dirty: false,
            mode: routeModeFromSession(result.closed.mode),
            path: result.closed.path,
            pinned: result.closed.pinned,
        }, ...this.recentlyClosed.filter(candidate => candidate.path !== result.closed?.path));
        this.recentlyClosed.length = Math.min(this.recentlyClosed.length, MAX_NOTE_TABS);
        this.syncShell();
        if (!active)
            return true;
        this.clearDocument();
        if (result.nextPath === null) {
            this.navigate(ROUTE_PREFIX);
            return true;
        }
        return await this.select(result.nextPath);
    }
    async reopenClosedTab() {
        const candidate = this.recentlyClosed.shift();
        if (candidate === undefined)
            return false;
        this.shellSession = openNoteTab(this.shellSession, this.shellSession.focusedGroupId, candidate.path, {
            ...(candidate.mode === undefined ? {} : { mode: sessionModeFromRoute(candidate.mode) }),
            ...(candidate.pinned === undefined ? {} : { pinned: candidate.pinned }),
        });
        this.syncShell();
        if (await this.select(candidate.path))
            return true;
        const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, candidate.path);
        this.shellSession = closed.session;
        this.recentlyClosed.unshift(candidate);
        this.syncShell();
        return false;
    }
    async goBack() {
        const target = this.historyBack.at(-1);
        const current = this.snapshot.path;
        if (target === undefined || current === null)
            return false;
        if (!await this.select(target, true, undefined, false))
            return false;
        this.historyBack.pop();
        this.historyForward.push(current);
        this.syncShell();
        return true;
    }
    async goForward() {
        const target = this.historyForward.at(-1);
        const current = this.snapshot.path;
        if (target === undefined || current === null)
            return false;
        if (!await this.select(target, true, undefined, false))
            return false;
        this.historyForward.pop();
        this.historyBack.push(current);
        this.syncShell();
        return true;
    }
    setCommandPaletteOpen(open) {
        this.update({ commandPaletteOpen: open });
    }
    toggleFocusMode() {
        this.syncShell({ focusMode: this.snapshot.focusMode !== true });
    }
    updateSettings(change) {
        const vault = this.snapshot.vault;
        if (vault === null || this.storage === null)
            return false;
        const settings = saveTockTutorSettings(this.storage, vault.id, change);
        this.update({ settings });
        return true;
    }
    saveCurrentWorkspace(name) {
        if (this.snapshot.vault === null || this.storage === null)
            return false;
        const next = createNamedWorkspace(this.workspaces, name ?? `Workspace ${String(this.workspaces.length + 1)}`, this.shellSession, this.now().getTime(), this.snapshot.focusMode === true);
        if (next.length === this.workspaces.length)
            return false;
        this.workspaces = next;
        this.syncShell();
        return true;
    }
    addActiveBookmark() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.storage === null)
            return false;
        try {
            this.bookmarks = addBookmark(this.bookmarks, {
                id: `note-${this.now().getTime().toString(36)}`,
                kind: 'note',
                path,
                title: noteTitle(path),
            });
            if (!saveBookmarks(this.storage, vault.id, this.bookmarks))
                return false;
            this.update({ bookmarks: Object.freeze(this.bookmarks.map(bookmark => Object.freeze({ ...bookmark }))) });
            return true;
        }
        catch {
            return false;
        }
    }
    removeBookmark(id) {
        const vault = this.snapshot.vault;
        if (vault === null || this.storage === null)
            return false;
        const next = this.bookmarks.filter(bookmark => bookmark.id !== id);
        if (next.length === this.bookmarks.length || !saveBookmarks(this.storage, vault.id, next))
            return false;
        this.bookmarks = next;
        this.update({ bookmarks: Object.freeze(next.map(bookmark => Object.freeze({ ...bookmark }))) });
        return true;
    }
    async openBookmark(id) {
        const bookmark = this.bookmarks.find(candidate => candidate.id === id);
        if (bookmark === undefined)
            return false;
        if (bookmark.kind === 'note' || bookmark.kind === 'heading' || bookmark.kind === 'block') {
            if (!await this.select(bookmark.path))
                return false;
            if (bookmark.kind === 'heading')
                this.jumpToLine(bookmark.line);
            return true;
        }
        if (bookmark.kind === 'folder') {
            this.openSearch(`path:${bookmark.path}`);
            return await this.runSearch();
        }
        if (bookmark.kind === 'search') {
            this.openSearch(bookmark.query);
            return await this.runSearch();
        }
        if (bookmark.kind === 'graph')
            return false;
        if (bookmark.kind === 'link')
            return false;
        return false;
    }
    async loadWorkspace(id) {
        const workspace = this.workspaces.find(candidate => candidate.id === id);
        const vault = this.snapshot.vault;
        if (workspace === undefined || vault === null)
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        const openable = new Set(this.snapshot.entries.filter(entry => entry.kind === 'document' && supportedDocument(entry.path)).map(entry => entry.path));
        this.shellSession = hydrateWorkbenchSession({
            ...workspace.session,
            vault,
            groups: workspace.session.groups.map(group => ({ ...group, tabs: group.tabs.filter(tab => openable.has(tab.path)) })),
        });
        this.syncShell({ focusMode: workspace.focusMode });
        const path = this.pane()?.activePath ?? null;
        this.clearDocument();
        if (path === null) {
            this.navigate(ROUTE_PREFIX);
            return true;
        }
        return await this.select(path);
    }
    async select(path, navigate = true, dispatchRevision, recordHistory = true) {
        const activeVault = this.snapshot.vault;
        if (!supportedDocument(path) || activeVault === null || this.snapshot.phase !== 'ready')
            return false;
        const previousPath = this.snapshot.path;
        if (dispatchRevision === undefined)
            this.invalidateDispatch();
        else if (!this.dispatchCurrent(dispatchRevision, activeVault))
            return false;
        if (path === this.snapshot.path)
            return true;
        const pane = this.pane();
        if (pane === undefined
            || (!pane.tabs.some(tab => tab.path === path) && pane.tabs.length >= MAX_NOTE_TABS)) {
            this.update({ message: `This pane is limited to ${String(MAX_NOTE_TABS)} note tabs.` });
            return false;
        }
        if (this.snapshot.saveStatus !== 'saved' && !await this.save()) {
            if (this.snapshot.path !== null)
                this.navigate(routeForPath(this.snapshot.path), 'replace');
            return false;
        }
        const vault = activeVault;
        const operation = this.nextOperation();
        this.update({ message: `Opening ${path}.` });
        try {
            const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, operation.signal));
            if (!this.current(operation.id, vault)
                || opened.generation !== vault.generation
                || opened.path !== path)
                return false;
            if (!boundedSource(opened.content)) {
                this.update({ message: `${path} exceeds the editor size limit.` });
                return false;
            }
            let content = opened.content;
            let draftRecovered = false;
            if (documentKind(path) === 'markdown') {
                try {
                    const draft = remoteValue(await this.remote.tocktutorWorkbench.readDraft({ expectedVault: vault, path }, operation.signal));
                    if (!this.current(operation.id, vault) || draft.generation !== vault.generation)
                        return false;
                    if (draft.draft !== null
                        && (draft.draft.revision === undefined || draft.draft.revision === opened.revision)
                        && boundedSource(draft.draft.content)) {
                        content = draft.draft.content;
                        draftRecovered = content !== opened.content;
                    }
                }
                catch {
                    if (!this.current(operation.id, vault) || operation.signal.aborted)
                        return false;
                }
            }
            const mode = pane.tabs.find(tab => tab.path === path)?.mode ?? this.snapshot.mode;
            this.update({
                documentKind: documentKind(path),
                draftRecovered,
                message: draftRecovered ? `${path} opened with its recovered draft.` : `${path} opened.`,
                mode,
                path,
                revision: opened.revision,
                saveStatus: draftRecovered ? 'unsaved' : 'saved',
                selectionEnd: 0,
                selectionStart: 0,
                source: content,
            });
            this.recordOpen(path, recordHistory, previousPath);
            if (draftRecovered)
                this.recordDirty(true);
            if (navigate)
                this.navigate(routeForPath(path));
            if (documentKind(path) === 'markdown') {
                void (async () => {
                    if (await this.loadRelationships())
                        await this.loadEmbeds();
                })();
            }
            else if (documentKind(path) === 'base')
                void this.hydrateBaseRows(path);
            return true;
        }
        catch (error) {
            if (this.current(operation.id, vault) && !operation.signal.aborted) {
                this.update({ message: this.failureMessage(error, `${path} could not be opened.`) });
            }
            return false;
        }
    }
    edit(source) {
        if (this.snapshot.path === null || this.snapshot.phase !== 'ready')
            return;
        if (!boundedSource(source)) {
            this.update({ message: 'The edit exceeds the bounded source limit.' });
            return;
        }
        if (source === this.snapshot.source)
            return;
        this.invalidateDispatch();
        this.update({
            message: 'Unsaved changes.',
            saveStatus: 'unsaved',
            source,
        });
        this.recordDirty(true);
        this.scheduleDraft();
    }
    setSelection(start, end) {
        if (this.snapshot.path === null)
            return;
        const selectionStart = Number.isSafeInteger(start) ? Math.max(0, Math.min(start, this.snapshot.source.length)) : 0;
        const selectionEnd = Number.isSafeInteger(end) ? Math.max(selectionStart, Math.min(end, this.snapshot.source.length)) : selectionStart;
        this.update({ selectionEnd, selectionStart });
    }
    setProperty(key, value) {
        if (this.snapshot.documentKind !== 'markdown' || this.snapshot.path === null || this.snapshot.mode === 'reading')
            return false;
        try {
            const source = setFrontmatterProperty(this.snapshot.source, key, value);
            if (source === this.snapshot.source)
                return false;
            this.edit(source);
            return true;
        }
        catch {
            return false;
        }
    }
    runEditorCommand(command) {
        if (this.snapshot.path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode === 'reading')
            return;
        const result = applyEditorCommand(this.snapshot.source, command, this.snapshot.selectionStart ?? this.snapshot.source.length, this.snapshot.selectionEnd ?? this.snapshot.source.length);
        if (result.source === this.snapshot.source)
            return;
        this.edit(result.source);
        this.update({ selectionEnd: result.selectionEnd, selectionStart: result.selectionStart });
    }
    setMode(mode) {
        if (this.snapshot.path === null)
            return;
        if (mode === 'live-preview' && this.snapshot.documentKind !== 'markdown')
            return;
        this.shellSession = setNoteTabMode(this.shellSession, this.shellSession.focusedGroupId, this.snapshot.path, sessionModeFromRoute(mode));
        this.syncShell({ mode });
    }
    toggleTask(index) {
        if (this.snapshot.documentKind !== 'markdown')
            return;
        const source = toggleMarkdownTask(this.snapshot.source, index);
        if (source !== this.snapshot.source)
            this.edit(source);
    }
    moveCanvasNode(nodeId, deltaX, deltaY) {
        if (this.snapshot.documentKind !== 'canvas')
            return;
        const parsed = parseCanvasDocument(this.snapshot.source);
        if (parsed.status !== 'ready')
            return;
        const node = parsed.document.nodes.find(candidate => candidate.id === nodeId);
        if (node === undefined)
            return;
        try {
            this.edit(updateCanvasNodePosition(this.snapshot.source, nodeId, node.x + deltaX, node.y + deltaY));
        }
        catch {
            this.update({ message: 'The Canvas node could not be moved within the bounded workspace.' });
        }
    }
    convertActiveNote() {
        if (this.snapshot.documentKind !== 'markdown' || this.snapshot.path === null || this.snapshot.mode === 'reading')
            return false;
        try {
            const source = convertMarkdownFormats(this.snapshot.source, { deprecatedProperties: true, roamBear: true });
            if (source === this.snapshot.source)
                return false;
            this.edit(source);
            return true;
        }
        catch {
            return false;
        }
    }
    async extractActiveSelection() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        const start = this.snapshot.selectionStart ?? 0;
        const end = this.snapshot.selectionEnd ?? 0;
        if (vault === null || path === null || this.snapshot.documentKind !== 'markdown' || end <= start)
            return false;
        const destinationPath = `Extracted/${noteTitle(path)} Extract.md`;
        try {
            const extraction = extractSelectionToNote({
                destinationPath,
                destinationTitle: `${noteTitle(path)} Extract`,
                end,
                leftover: 'link',
                source: this.snapshot.source,
                sourceTitle: noteTitle(path),
                start,
            });
            const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({
                content: extraction.destinationContent,
                expectedVault: vault,
                path: destinationPath,
            }));
            if (created.status !== 'created' || created.generation !== vault.generation || created.path !== destinationPath)
                return false;
            this.edit(extraction.sourceContent);
            this.update({ message: `${destinationPath} created; save the source note to finish extraction.` });
            return true;
        }
        catch {
            return false;
        }
    }
    async prepareOrganization() {
        const path = this.snapshot.path;
        if (path === null || !/^Inbox\/.+\.md$/iu.test(path))
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        try {
            const title = noteTitle(path);
            const proposal = buildOrganizationProposal({
                captures: [{ content: this.snapshot.source, path }],
                now: this.now(),
                title: `${title} Review`,
            });
            this.update({ organizationProposal: proposal });
            return true;
        }
        catch {
            return false;
        }
    }
    cancelOrganization() {
        this.update({ organizationProposal: null });
    }
    async applyOrganization() {
        const proposal = this.snapshot.organizationProposal;
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (proposal === null || proposal === undefined || vault === null || path === null || proposal.captures[0] !== path)
            return false;
        let current;
        try {
            current = buildOrganizationProposal({
                captures: [{ content: this.snapshot.source, path }],
                now: this.now(),
                title: proposal.title,
            });
        }
        catch {
            return false;
        }
        if (current.id !== proposal.id || current.destination !== proposal.destination)
            return false;
        try {
            const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({
                content: proposal.content,
                expectedVault: vault,
                path: proposal.destination,
            }));
            if (created.status !== 'created' || created.generation !== vault.generation || created.path !== proposal.destination)
                return false;
            this.update({ message: `${proposal.destination} created.`, organizationProposal: null });
            await this.refreshTree(vault);
            return true;
        }
        catch {
            return false;
        }
    }
    async loadEmbeds() {
        const vault = this.snapshot.vault;
        const sourcePath = this.snapshot.path;
        if (vault === null || sourcePath === null || this.snapshot.documentKind !== 'markdown')
            return false;
        let targets;
        try {
            targets = collectEmbedTargets(this.snapshot.source);
        }
        catch {
            return false;
        }
        if (targets.length === 0) {
            this.update({ embeds: Object.freeze([]) });
            return true;
        }
        const entries = this.snapshot.entries;
        const resolved = [];
        let aggregate = 0;
        const operation = this.nextOperation();
        try {
            for (const target of targets) {
                const candidates = entries.filter(entry => entry.path === target.path || entry.path.split('/').at(-1)?.toLocaleLowerCase() === target.path.split('/').at(-1)?.toLocaleLowerCase());
                if (candidates.length !== 1)
                    continue;
                const path = candidates[0].path;
                if (target.kind === 'media') {
                    const preview = remoteValue(await this.remote.tocktutorWorkbench.previewAttachment(path, vault, operation.signal));
                    if (!this.current(operation.id, vault) || this.snapshot.path !== sourcePath || preview.path !== path || preview.generation !== vault.generation)
                        return false;
                    aggregate += preview.dataBase64.length;
                    if (aggregate > 64 * 1024 * 1024)
                        break;
                    resolved.push({ content: preview.dataBase64, mimeType: preview.mimeType, target: { ...target, path } });
                }
                else {
                    const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, operation.signal));
                    if (!this.current(operation.id, vault) || this.snapshot.path !== sourcePath || opened.path !== path || opened.generation !== vault.generation)
                        return false;
                    aggregate += opened.content.length;
                    if (aggregate > 25 * 1024 * 1024)
                        break;
                    const content = target.kind === 'note' ? resolveNoteEmbedFragment(opened.content, target.fragment) : opened.content;
                    if (content !== null)
                        resolved.push({ content, target: { ...target, path } });
                }
            }
            this.update({ embeds: Object.freeze(resolved.map(embed => Object.freeze({ ...embed, target: Object.freeze({ ...embed.target }) }))) });
            return true;
        }
        catch {
            return false;
        }
    }
    async hydrateBaseRows(basePath) {
        const vault = this.snapshot.vault;
        if (vault === null || this.snapshot.path !== basePath || this.snapshot.documentKind !== 'base')
            return false;
        const entries = this.snapshot.entries.filter((entry) => entry.kind === 'document' && /\.(?:markdown|md)$/iu.test(entry.path)).slice(0, 2_000);
        const operation = this.nextOperation();
        const files = [];
        try {
            for (let index = 0; index < entries.length; index += 8) {
                const batch = entries.slice(index, index + 8);
                const opened = await Promise.all(batch.map(entry => this.remote.tocktutorWorkbench.openDocument(entry.path, vault, operation.signal).then(remoteValue)));
                if (!this.current(operation.id, vault) || this.snapshot.path !== basePath)
                    return false;
                for (let offset = 0; offset < opened.length; offset += 1) {
                    const document = opened[offset];
                    const entry = batch[offset];
                    if (document.generation !== vault.generation || document.path !== entry.path || !boundedSource(document.content))
                        return false;
                    files.push({ createdAt: entry.createdAt, modifiedAt: entry.modifiedAt, path: entry.path, revision: document.revision, sizeBytes: entry.size, source: document.content });
                }
            }
            this.update({ baseFiles: Object.freeze(files.map(file => Object.freeze({ ...file }))) });
            return true;
        }
        catch {
            return false;
        }
    }
    async applyBaseEdit(request) {
        const vault = this.snapshot.vault;
        const basePath = this.snapshot.path;
        if (vault === null || basePath === null || this.snapshot.documentKind !== 'base')
            return false;
        const operation = this.operation;
        try {
            const current = remoteValue(await this.remote.tocktutorWorkbench.openDocument(request.path, vault));
            if (current.generation !== vault.generation || current.path !== request.path || current.revision !== request.expectedRevision || current.content !== request.previousSource)
                return false;
            const property = parseFrontmatterProperties(current.content).find(entry => entry.key === request.property);
            if (property === undefined || executableBasePropertyIdentity(property.key, property.value) !== request.expectedPropertyIdentity)
                return false;
            const saved = remoteValue(await this.remote.tocktutorWorkbench.saveDocument({ content: request.source, expectedRevision: request.expectedRevision, expectedVault: vault, path: request.path }));
            if (saved.status !== 'saved' || saved.generation !== vault.generation || saved.path !== request.path)
                return false;
            if (this.operation !== operation || !sameVault(this.snapshot.vault, vault) || this.snapshot.path !== basePath)
                return true;
            this.update({ baseFiles: Object.freeze((this.snapshot.baseFiles ?? []).map(file => file.path === request.path ? Object.freeze({ ...file, revision: saved.revision, source: request.source }) : file)) });
            return true;
        }
        catch {
            return false;
        }
    }
    async storeActiveAttachment(fileName, dataBase64) {
        const vault = this.snapshot.vault;
        const notePath = this.snapshot.path;
        const source = this.snapshot.source;
        const revision = this.snapshot.revision;
        if (vault === null || notePath === null || revision === null || this.snapshot.documentKind !== 'markdown' || dataBase64.length > 35_000_000)
            return false;
        let path;
        try {
            path = attachmentTargetPath(this.snapshot.settings?.attachmentFolder ?? 'Attachments', fileName, new Set(this.snapshot.entries.filter(entry => entry.kind === 'attachment').map(entry => entry.path)));
        }
        catch {
            return false;
        }
        const operation = this.operation;
        try {
            const stored = remoteValue(await this.remote.tocktutorWorkbench.storeAttachment({ dataBase64, expectedVault: vault, path }));
            if (stored.status !== 'stored' || stored.generation !== vault.generation || stored.path !== path)
                return false;
            if (this.operation !== operation || !sameVault(this.snapshot.vault, vault) || this.snapshot.path !== notePath || this.snapshot.source !== source || this.snapshot.revision !== revision)
                return false;
            this.edit(appendAttachmentMarkdown(source, `![[${path}]]`));
            const saved = await this.save();
            if (saved)
                await this.refreshTree(vault);
            return saved;
        }
        catch {
            return false;
        }
    }
    async previewAttachment(path) {
        const vault = this.snapshot.vault;
        if (vault === null || this.snapshot.entries.some(entry => entry.kind === 'attachment' && entry.path === path) !== true)
            return false;
        const operation = this.nextOperation();
        try {
            const preview = remoteValue(await this.remote.tocktutorWorkbench.previewAttachment(path, vault, operation.signal));
            if (!this.current(operation.id, vault) || preview.generation !== vault.generation || preview.path !== path || preview.dataBase64.length > 35_000_000)
                return false;
            this.update({ attachmentPreview: preview });
            return true;
        }
        catch {
            return false;
        }
    }
    closeAttachmentPreview() {
        this.update({ attachmentPreview: null });
    }
    async applyCanvasChange(change) {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null
            || path === null
            || this.snapshot.documentKind !== 'canvas'
            || this.snapshot.revision !== change.expectedRevision
            || this.snapshot.source !== change.previousSource)
            return false;
        const operation = this.operation;
        this.edit(change.source);
        const saved = await this.save();
        if (saved)
            return true;
        if (this.operation !== operation
            || !sameVault(this.snapshot.vault, vault)
            || this.snapshot.path !== path
            || this.snapshot.source !== change.source)
            return false;
        this.update({
            message: 'The Canvas change failed and its previous preview was restored.',
            saveStatus: 'save-failed',
            source: change.previousSource,
        });
        this.recordDirty(false);
        return false;
    }
    save() {
        if (this.saving !== null)
            return this.saving;
        if (this.snapshot.saveStatus === 'saved')
            return Promise.resolve(true);
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        const revision = this.snapshot.revision;
        if (vault === null || path === null || revision === null)
            return Promise.resolve(false);
        const source = this.snapshot.source;
        const abort = new AbortController();
        this.saveAbort?.abort();
        this.saveAbort = abort;
        this.update({ message: `Saving ${path}.`, saveStatus: 'saving' });
        const request = {
            content: source,
            expectedRevision: revision,
            expectedVault: vault,
            path,
        };
        this.saving = this.remote.tocktutorWorkbench.saveDocument(request, abort.signal)
            .then(result => {
            const saved = remoteValue(result);
            if (this.disposed || !sameVault(this.snapshot.vault, vault) || this.snapshot.path !== path)
                return false;
            if (saved.status !== 'saved' || saved.generation !== vault.generation || saved.path !== path) {
                throw new RemoteCallError('invalid-result', 'The save response did not match the active note.');
            }
            const unchanged = this.snapshot.source === source;
            this.update({
                draftRecovered: unchanged ? false : this.snapshot.draftRecovered === true,
                message: unchanged ? `${path} saved.` : 'Newer changes remain unsaved.',
                revision: saved.revision,
                saveStatus: unchanged ? 'saved' : 'unsaved',
            });
            this.recordDirty(!unchanged);
            if (unchanged) {
                if (this.draftTimer !== null)
                    clearTimeout(this.draftTimer);
                this.draftTimer = null;
                this.draftAbort?.abort();
                this.draftAbort = null;
                void this.remote.tocktutorWorkbench.clearDraft({ expectedVault: vault, path }).catch(() => undefined);
            }
            return unchanged;
        })
            .catch(error => {
            if (!this.disposed && !abort.signal.aborted && sameVault(this.snapshot.vault, vault) && this.snapshot.path === path) {
                this.update({
                    message: this.failureMessage(error, `${path} could not be saved.`),
                    saveStatus: 'save-failed',
                });
            }
            return false;
        })
            .finally(() => {
            if (this.saveAbort === abort)
                this.saveAbort = null;
            this.saving = null;
        });
        return this.saving;
    }
    failureMessage(error, fallback) {
        if (error instanceof RemoteCallError) {
            if (error.code === 'conflict' || error.code === 'changed') {
                return 'Save Conflict: The note changed outside this editor. Your source remains unsaved.';
            }
            return error.message || fallback;
        }
        return error instanceof Error && error.message !== '' ? error.message : fallback;
    }
    dispose() {
        if (this.disposed)
            return;
        this.settlePendingDispatch('stale');
        this.disposed = true;
        this.dispatchRevision += 1;
        this.operation += 1;
        this.operationAbort?.abort();
        this.saveAbort?.abort();
        this.draftAbort?.abort();
        if (this.draftTimer !== null)
            clearTimeout(this.draftTimer);
        this.eventDispose?.();
        this.listeners.clear();
    }
}
function RichReadingView(props) {
    const html = useMemo(() => {
        const warning = /<\/?(?:script|style|iframe|object|embed|form|svg|link|meta)\b/iu.test(props.source)
            ? '<p class="tocktutor-warning" role="note">Unsafe HTML is inert in Reading view.</p>'
            : '';
        return `${warning}${renderMarkdownHtml(props.source)}`;
    }, [props.source]);
    const onClick = (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.taskIndex !== undefined) {
            const index = Number(target.dataset.taskIndex);
            if (Number.isSafeInteger(index) && index >= 0)
                props.onToggleTask(index);
            return;
        }
        if (target instanceof HTMLAnchorElement)
            event.preventDefault();
    };
    return (_jsx("article", { "aria-label": "Reading View", className: "tocktutor-reading mx-auto min-h-full w-[calc(100%-48px)] max-w-3xl pt-[18px] pb-[72px] [&_.callout]:my-4 [&_.callout]:rounded-md [&_.footnotes]:mt-8 [&_.math-display]:my-4 [&_.mermaid]:my-4 [&_.task-list]:pl-5 [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[30px] [&_h1]:leading-tight [&_h1]:font-[650] [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_mark]:bg-[color-mix(in_srgb,#fde047_55%,transparent)] [&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--tt-border)] [&_td]:p-2 [&_th]:border [&_th]:border-[var(--tt-border)] [&_th]:p-2", dangerouslySetInnerHTML: { __html: html }, onClick: onClick, tabIndex: -1 }));
}
function LivePreviewView(props) {
    const projection = useMemo(() => projectLivePreview(props.source), [props.source]);
    const [folded, setFolded] = useState(() => new Set());
    useEffect(() => {
        if (projection.status !== 'ready') {
            setFolded(new Set());
            return;
        }
        setFolded(new Set(projection.lines.filter(line => line.folded === true).map(line => line.index)));
    }, [props.documentKey]);
    if (projection.status !== 'ready')
        return _jsx(Alert, { unstyled: true, children: projection.reason });
    const hidden = new Set();
    for (const line of projection.lines) {
        if (!folded.has(line.index) || line.foldEndLine === undefined)
            continue;
        for (let index = line.index + 1; index <= line.foldEndLine; index += 1)
            hidden.add(index);
    }
    const toggleFold = (index) => {
        setFolded(current => {
            const next = new Set(current);
            if (next.has(index))
                next.delete(index);
            else
                next.add(index);
            return next;
        });
    };
    return (_jsx("section", { "aria-label": "Live Preview", className: "mx-auto grid min-h-full w-[calc(100%-32px)] max-w-3xl content-start gap-0.5 py-6", tabIndex: -1, children: projection.lines.map(line => hidden.has(line.index) ? null : (_jsxs("div", { className: "group flex min-h-7 items-start gap-2 rounded px-1.5 py-0.5 data-[kind=callout]:border-l-4 data-[kind=callout]:border-[var(--tt-accent)] data-[kind=callout]:bg-[var(--tt-selected)] data-[kind=code]:bg-[color-mix(in_srgb,var(--tt-text)_5%,var(--tt-panel))] data-[kind=comment]:text-[var(--tt-muted)] data-[kind=heading]:font-semibold data-[kind=property]:text-[var(--tt-muted)]", "data-kind": line.kind, children: [line.foldEndLine !== undefined ? (_jsx(Button, { unstyled: true, "aria-expanded": !folded.has(line.index), "aria-label": `${folded.has(line.index) ? 'Expand' : 'Collapse'} Line ${String(line.index + 1)}`, className: "mt-1 size-5 shrink-0 rounded border-0 bg-transparent p-0 text-[var(--tt-muted)]", onClick: () => { toggleFold(line.index); }, type: "button", children: _jsx(ChevronRight, { "aria-hidden": "true", className: folded.has(line.index) ? '' : 'rotate-90' }) })) : _jsx("span", { className: "w-5 shrink-0" }), line.kind === 'task' && line.taskIndex !== undefined && (_jsx(Checkbox, { "aria-label": `Mark Task on Line ${String(line.index + 1)} as ${line.checked === true ? 'Incomplete' : 'Complete'}`, checked: line.checked === true, className: "mt-1.5", onCheckedChange: () => { props.onToggleTask(line.taskIndex); } })), _jsx(Textarea, { unstyled: true, "aria-label": `Live Preview Line ${String(line.index + 1)}`, className: "min-h-7 flex-1 resize-none overflow-hidden border-0 bg-transparent px-1 py-0.5 text-inherit outline-none [font:inherit]", onChange: event => { props.onEdit(replaceLivePreviewLine(props.source, line.index, event.target.value)); }, rows: 1, spellCheck: line.kind !== 'code', value: line.content })] }, line.index))) }));
}
function NativeDispatchDialog(props) {
    const submit = (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        props.onSubmit(props.kind === 'new'
            ? { path: String(form.get('path') ?? '') }
            : {
                text: String(form.get('text') ?? ''),
                title: String(form.get('title') ?? ''),
            });
    };
    const label = props.kind === 'new' ? 'New Note' : 'Quick Capture';
    return (_jsx(Dialog, { open: true, onOpenChange: open => { if (!open)
            props.onCancel(); }, children: _jsx(DialogContent, { unstyled: true, className: "tocktutor-dispatch-dialog fixed top-1/2 left-1/2 z-50 w-[calc(100%-48px)] max-w-[480px] -translate-1/2", showCloseButton: false, children: _jsxs("form", { className: "grid w-full gap-3.5 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 [&_input]:rounded-[5px] [&_input]:border [&_input]:border-[var(--tt-border)] [&_input]:p-2 [&_input]:[font:inherit] [&_label]:grid [&_label]:gap-[5px] [&_label]:font-[650] [&_textarea]:rounded-[5px] [&_textarea]:border [&_textarea]:border-[var(--tt-border)] [&_textarea]:p-2 [&_textarea]:[font:inherit]", onSubmit: submit, children: [_jsx("header", { children: _jsx(DialogTitle, { className: "m-0 text-[17px]", children: label }) }), props.kind === 'new' ? (_jsxs(Label, { unstyled: true, children: ["Note Path", _jsx(Input, { unstyled: true, "aria-label": "New Note Path", autoFocus: true, maxLength: 1_000, name: "path", required: true })] })) : (_jsxs(_Fragment, { children: [_jsxs(Label, { unstyled: true, children: ["Title", _jsx(Input, { unstyled: true, "aria-label": "Capture Title", autoFocus: true, maxLength: 200, name: "title", required: true })] }), _jsxs(Label, { unstyled: true, children: ["Text", _jsx(Textarea, { unstyled: true, "aria-label": "Capture Text", maxLength: 100_000, name: "text" })] })] })), _jsxs("div", { className: "tocktutor-dialog-actions flex justify-end gap-2 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit", children: [_jsx(Button, { unstyled: true, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, type: "submit", children: "Create" })] })] }) }) }));
}
function WorkbenchCommandPalette(props) {
    const [query, setQuery] = useState('');
    const editor = (command) => props.onEditorCommand === undefined
        ? undefined
        : () => { props.onEditorCommand?.(command); };
    const commands = [
        { label: 'New Note', run: props.onNewNote },
        { label: 'Search Notes', run: props.onSearch },
        { label: 'Toggle Focus Mode', run: props.onToggleFocus },
        { disabled: !props.canGoBack, label: 'Go Back', run: props.onBack },
        { disabled: !props.canGoForward, label: 'Go Forward', run: props.onForward },
        { disabled: !props.canReopen, label: 'Reopen Closed Note', run: props.onReopen },
        { disabled: !props.editorEnabled, label: 'Bold Text', run: editor('bold') },
        { disabled: !props.editorEnabled, label: 'Italic Text', run: editor('italic') },
        { disabled: !props.editorEnabled, label: 'Strikethrough Text', run: editor('strikethrough') },
        { disabled: !props.editorEnabled, label: 'Highlight Text', run: editor('highlight') },
        { disabled: !props.editorEnabled, label: 'Add Internal Link', run: editor('link') },
        { disabled: !props.editorEnabled, label: 'Insert Table', run: editor('insert-table') },
        { disabled: !props.editorEnabled, label: 'Insert Tip Callout', run: editor('callout-tip') },
        { disabled: !props.editorEnabled, label: 'Delete Current Line', run: editor('delete-line') },
    ].filter(command => command.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return (_jsx(Dialog, { open: true, onOpenChange: open => { if (!open)
            props.onClose(); }, children: _jsxs(DialogContent, { unstyled: true, className: "fixed top-[18%] left-1/2 z-50 w-[calc(100%-32px)] max-w-xl -translate-x-1/2 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-3 shadow-xl", showCloseButton: false, children: [_jsx(DialogTitle, { className: "mb-2 text-sm font-semibold", children: "Command Palette" }), _jsx(Input, { unstyled: true, "aria-label": "Search Commands", autoFocus: true, className: "w-full rounded border border-[var(--tt-border)] px-2 py-1.5", maxLength: 200, onChange: event => { setQuery(event.target.value); }, placeholder: "Search commands", value: query }), _jsxs("div", { className: "mt-2 grid max-h-80 gap-1 overflow-auto", role: "listbox", children: [commands.map(command => (_jsx(Button, { unstyled: true, className: "rounded border-0 bg-transparent px-2 py-1.5 text-left hover:bg-[var(--tt-selected)] disabled:opacity-50", disabled: command.disabled === true || command.run === undefined, onClick: () => {
                                command.run?.();
                                props.onClose();
                            }, role: "option", type: "button", children: command.label }, command.label))), commands.length === 0 && _jsx(Alert, { unstyled: true, role: "status", children: "No matching commands." })] })] }) }));
}
const WORKBENCH_GLYPHS = {
    back: ChevronLeft,
    bookmark: Bookmark,
    chat: MessageSquare,
    close: X,
    collapse: ChevronRight,
    document: FileText,
    folder: Folder,
    forward: ChevronRight,
    more: Ellipsis,
    new: Plus,
    panel: PanelLeft,
    'panel-right': PanelRight,
    pencil: Pencil,
    search: Search,
};
function WorkbenchGlyph({ kind }) {
    const Glyph = WORKBENCH_GLYPHS[kind];
    return _jsx(Glyph, { "aria-hidden": "true" });
}
function fileName(path) {
    return path.split('/').at(-1) ?? path;
}
function noteTitle(path) {
    return path === null ? 'TockTutor' : fileName(path).replace(/\.(?:base|canvas|markdown|md)$/iu, '');
}
function TreeEntries(props) {
    const prefix = props.prefix ?? '';
    const children = props.entries
        .filter(entry => entry.path.startsWith(prefix)
        && !entry.path.slice(prefix.length).includes('/')
        && (entry.kind === 'directory' || entry.kind === 'document'))
        .toSorted((left, right) => {
        if (left.kind !== right.kind)
            return left.kind === 'directory' ? -1 : 1;
        return left.path.localeCompare(right.path, undefined, { sensitivity: 'base' });
    });
    return children.map(entry => entry.kind === 'directory' ? (_jsxs("li", { className: "tocktutor-tree-directory", role: "treeitem", "aria-expanded": "true", children: [_jsxs("div", { className: "tocktutor-tree-row grid min-h-8 w-full grid-cols-[12px_16px_minmax(0,1fr)_16px] items-center gap-[7px] overflow-hidden rounded bg-transparent px-[5px] py-1 text-left font-medium text-inherit hover:bg-[color-mix(in_srgb,var(--tt-text)_5%,transparent)] [&>span:not(.tocktutor-tree-indent)]:truncate [&>svg:first-child]:size-3 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-3.5 [&>svg:last-child]:text-[var(--tt-muted)] [&>svg:last-child]:opacity-80", title: entry.path, children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx(WorkbenchGlyph, { kind: "folder" }), _jsx("span", { children: fileName(entry.path) }), _jsx(WorkbenchGlyph, { kind: "more" })] }), _jsx("ul", { className: "m-0 list-none p-0 pl-4", role: "group", children: _jsx(TreeEntries, { entries: props.entries, onSelect: props.onSelect, path: props.path, prefix: `${entry.path}/` }) })] }, entry.path)) : (_jsx("li", { role: "treeitem", "aria-selected": entry.path === props.path, children: _jsxs(Button, { unstyled: true, "aria-current": entry.path === props.path ? 'page' : undefined, className: "tocktutor-tree-row grid min-h-8 w-full grid-cols-[12px_16px_minmax(0,1fr)_16px] items-center gap-[7px] overflow-hidden rounded border-0 bg-transparent px-[5px] py-1 text-left font-medium text-inherit hover:bg-[color-mix(in_srgb,var(--tt-text)_5%,transparent)] aria-current:bg-[var(--tt-selected)] aria-current:[&>svg:last-child]:text-[var(--tt-text)] [&>span:not(.tocktutor-tree-indent)]:truncate [&>svg:first-child]:size-3 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-3.5 [&>svg:last-child]:text-[var(--tt-muted)] [&>svg:last-child]:opacity-80", onClick: () => { props.onSelect(entry.path); }, title: entry.path, type: "button", children: [_jsx("span", { className: "tocktutor-tree-indent w-3" }), _jsx(WorkbenchGlyph, { kind: "document" }), _jsx("span", { children: fileName(entry.path) }), _jsx(WorkbenchGlyph, { kind: "more" })] }) }, entry.path)));
}
/** Semantic, authority-free view for the route state machine. */
export function TockTutorRouteView(props) {
    const { snapshot } = props;
    const previewLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas'
        : snapshot.documentKind === 'base' ? 'Base' : 'Reading';
    const sourceLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas Source'
        : snapshot.documentKind === 'base' ? 'Base Source' : 'Markdown Source';
    const query = snapshot.searchQuery.trim().toLocaleLowerCase();
    const activeProperties = snapshot.documentKind === 'markdown' ? parseFrontmatterProperties(snapshot.source) : [];
    const documents = snapshot.entries.filter(entry => entry.kind === 'document'
        && supportedDocument(entry.path)
        && (query === '' || entry.path.toLocaleLowerCase().includes(query)));
    const focusedPane = snapshot.panes.find(pane => pane.id === snapshot.focusedPaneId);
    const visibleTreeEntries = query === ''
        ? snapshot.entries.filter(entry => entry.kind === 'directory'
            || (entry.kind === 'document' && supportedDocument(entry.path)))
        : snapshot.entries.filter(entry => entry.kind === 'directory'
            ? documents.some(document => document.path.startsWith(`${entry.path}/`))
            : documents.includes(entry));
    const [panel, setPanel] = useState(null);
    const [assistantPanelWidth, setAssistantPanelWidth] = useState(DEFAULT_ASSISTANT_PANEL_WIDTH);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
    const effectiveSidebarOpen = sidebarOpen && snapshot.focusMode !== true;
    const previousSidebarOpen = useRef(effectiveSidebarOpen);
    const shouldAnimateSidebarColumns = previousSidebarOpen.current !== effectiveSidebarOpen;
    const contentColumns = `${String(effectiveSidebarOpen ? sidebarWidth : 0)}px minmax(0, 1fr) auto auto`;
    const titlebarColumns = `${String(effectiveSidebarOpen ? sidebarWidth : COLLAPSED_TITLEBAR_SIDEBAR_WIDTH)}px minmax(0, 1fr)`;
    useEffect(() => {
        previousSidebarOpen.current = effectiveSidebarOpen;
    }, [effectiveSidebarOpen]);
    const resizeSidebar = (width) => {
        setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)));
    };
    const beginSidebarResize = (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = sidebarWidth;
        const move = (next) => { resizeSidebar(startWidth + next.clientX - startX); };
        const finish = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
    };
    const resizeSidebarWithKeyboard = (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
            return;
        event.preventDefault();
        resizeSidebar(sidebarWidth + (event.key === 'ArrowLeft' ? -10 : 10));
    };
    const resizeAssistantPanel = (width) => {
        setAssistantPanelWidth(clampAssistantPanelWidth(width));
    };
    const beginAssistantPanelResize = (event) => {
        event.preventDefault();
        const handle = event.currentTarget;
        const panelElement = handle.parentElement;
        if (panelElement === null)
            return;
        const startX = event.clientX;
        const startWidth = assistantPanelWidth;
        let frame = 0;
        let width = startWidth;
        panelElement.style.transitionDuration = '0ms';
        const render = () => {
            frame = 0;
            panelElement.style.width = `${String(width)}px`;
            handle.setAttribute('aria-valuenow', String(width));
        };
        const move = (next) => {
            width = clampAssistantPanelWidth(startWidth + startX - next.clientX);
            if (frame === 0)
                frame = requestAnimationFrame(render);
        };
        const finish = () => {
            if (frame !== 0)
                cancelAnimationFrame(frame);
            render();
            resizeAssistantPanel(width);
            panelElement.style.removeProperty('transition-duration');
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
    };
    const resizeAssistantPanelWithKeyboard = (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
            return;
        event.preventDefault();
        resizeAssistantPanel(assistantPanelWidth + (event.key === 'ArrowLeft' ? 10 : -10));
    };
    const words = snapshot.source.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    const characters = snapshot.source.length;
    const titlebar = (_jsxs("section", { "aria-label": "TockTutor Title Bar", className: "tocktutor-titlebar absolute top-0 right-0 left-0 z-[2147483647] grid h-[var(--tockteam-titlebar-height,40px)] grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)] border-b border-[var(--tt-tab-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] text-[var(--tt-text)] transition-[grid-template-columns] duration-300 ease-out [--tt-accent:var(--dsw-alias-accent-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-fg-muted,#71717a)] [--tt-panel:var(--dsw-alias-bg-elevated,#fff)] [--tt-tab-border:#d1d5db] [--tt-text:var(--dsw-alias-fg-primary,#27272a)] [-webkit-app-region:drag] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_button]:text-inherit [&_button]:[font:inherit] [&_button]:[-webkit-app-region:no-drag] [&_svg]:block [&_svg]:size-[18px]", style: {
            gridTemplateColumns: titlebarColumns,
            transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
        }, children: [_jsxs("div", { className: "tocktutor-titlebar-sidebar flex min-w-0 items-center justify-start gap-2 border-r border-[var(--tt-border)] pr-2 pl-[46px] [&>button]:inline-flex [&>button]:h-7 [&>button]:w-[22px] [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)] [&>span]:inline-flex [&>span]:h-7 [&>span]:w-[22px] [&>span]:items-center [&>span]:justify-center [&>span]:border-0 [&>span]:bg-transparent [&>span]:p-0 [&>span]:text-[var(--tt-muted)]", children: [effectiveSidebarOpen && (_jsxs(_Fragment, { children: [_jsx("span", { className: "tocktutor-titlebar-document rounded-[5px] bg-[color-mix(in_srgb,var(--tt-text)_8%,transparent)] text-[var(--tt-text)]", children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "Search Notes", className: "border-0 bg-transparent p-0", disabled: props.onOpenSearch === undefined, onClick: props.onOpenSearch, type: "button", children: _jsx(WorkbenchGlyph, { kind: "search" }) }) }) }), _jsx(TooltipContent, { children: "Search Notes" })] }), _jsx(Button, { unstyled: true, "aria-label": "Bookmark Active Note", className: "border-0 bg-transparent p-0", disabled: snapshot.path === null || props.onAddBookmark === undefined, onClick: props.onAddBookmark, type: "button", children: _jsx(WorkbenchGlyph, { kind: "bookmark" }) })] })), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-expanded": effectiveSidebarOpen, "aria-label": "Toggle Files Sidebar", className: "tocktutor-panel-icon ml-auto border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setSidebarOpen(open => !open); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel" }) }) }), _jsx(TooltipContent, { children: "Toggle Files Sidebar" })] })] }), _jsxs("div", { className: "tocktutor-titlebar-main flex min-w-0 items-center gap-1 px-2", children: [_jsxs("span", { className: "tocktutor-history mr-[18px] flex gap-[5px] px-1.5", children: [_jsx(Button, { unstyled: true, "aria-label": "Go Back", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoBack !== true, onClick: props.onBack, type: "button", children: _jsx(WorkbenchGlyph, { kind: "back" }) }), _jsx(Button, { unstyled: true, "aria-label": "Go Forward", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoForward !== true, onClick: props.onForward, type: "button", children: _jsx(WorkbenchGlyph, { kind: "forward" }) })] }), _jsx("div", { className: "tocktutor-tabs -mx-[calc(var(--tt-tab-curve)*2)] -mb-px flex min-w-0 self-stretch items-end gap-1 overflow-visible px-[calc(var(--tt-tab-curve)*2)] [--tt-tab-curve:10px]", ...(focusedPane?.tabs.length ? { 'aria-label': 'Note Tabs', role: 'tablist' } : {}), children: focusedPane?.tabs.map((tab, index) => (_jsxs("div", { className: "relative", role: "presentation", children: [_jsx(Button, { unstyled: true, "aria-selected": tab.path === focusedPane.activePath, className: "relative z-1 -mb-px flex h-[30px] min-w-[118px] max-w-[220px] items-center gap-3 rounded-t-[10px] border border-b-0 border-[var(--tt-tab-border)] bg-[var(--tt-panel)] px-2.5 shadow-[inset_0_1px_0_rgb(255_255_255_/_18%)] aria-[selected=false]:mb-0.5 aria-[selected=false]:border-b aria-[selected=false]:bg-[color-mix(in_srgb,var(--tt-panel)_70%,transparent)] aria-[selected=false]:text-[var(--tt-muted)] aria-[selected=false]:shadow-none aria-selected:before:pointer-events-none aria-selected:before:absolute aria-selected:before:bottom-[-1px] aria-selected:before:left-[calc(var(--tt-tab-curve)*-2)] aria-selected:before:h-[calc(var(--tt-tab-curve)*2)] aria-selected:before:w-[calc(var(--tt-tab-curve)*2)] aria-selected:before:rounded-full aria-selected:before:content-[''] aria-selected:before:[clip-path:inset(50%_calc(var(--tt-tab-curve)*-1)_0_50%)] aria-selected:before:[box-shadow:inset_0_0_0_1px_var(--tt-tab-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] aria-selected:after:pointer-events-none aria-selected:after:absolute aria-selected:after:right-[calc(var(--tt-tab-curve)*-2)] aria-selected:after:bottom-[-1px] aria-selected:after:h-[calc(var(--tt-tab-curve)*2)] aria-selected:after:w-[calc(var(--tt-tab-curve)*2)] aria-selected:after:rounded-full aria-selected:after:content-[''] aria-selected:after:[clip-path:inset(50%_50%_0_calc(var(--tt-tab-curve)*-1))] aria-selected:after:[box-shadow:inset_0_0_0_1px_var(--tt-tab-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] [&>span]:truncate [&_svg]:ml-auto [&_svg]:size-3.5", onClick: () => { props.onActivateTab(focusedPane.id, tab.path); }, onKeyDown: event => {
                                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                                            return;
                                        event.preventDefault();
                                        const offset = event.key === 'ArrowLeft' ? -1 : 1;
                                        if (event.altKey) {
                                            props.onMoveTab?.(focusedPane.id, tab.path, offset);
                                            return;
                                        }
                                        const next = focusedPane.tabs[(index + offset + focusedPane.tabs.length) % focusedPane.tabs.length];
                                        if (next !== undefined)
                                            props.onActivateTab(focusedPane.id, next.path);
                                    }, "aria-controls": "tocktutor-note-editor", role: "tab", tabIndex: tab.path === focusedPane.activePath ? 0 : -1, title: tab.path, type: "button", children: _jsxs("span", { children: [tab.dirty && _jsx("span", { "aria-label": "Unsaved", children: "\u2022" }), tab.pinned === true && _jsx("span", { "aria-label": "Pinned", children: "\u25C6" }), fileName(tab.path)] }) }), _jsxs("span", { className: "absolute top-1/2 right-1 z-2 flex -translate-y-1/2 gap-0.5", children: [_jsx(Button, { unstyled: true, "aria-label": `${tab.pinned === true ? 'Unpin' : 'Pin'} ${fileName(tab.path)}`, className: "rounded border-0 bg-transparent p-0.5 text-[var(--tt-muted)]", onClick: () => { props.onTogglePinTab?.(focusedPane.id, tab.path); }, type: "button", children: _jsx(Bookmark, { "aria-hidden": "true" }) }), _jsx(Button, { unstyled: true, "aria-label": `Close ${fileName(tab.path)}`, className: "rounded border-0 bg-transparent p-0.5 text-[var(--tt-muted)]", onClick: () => { props.onCloseTab?.(focusedPane.id, tab.path); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] })] }, tab.path))) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "Command Palette", className: "border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", disabled: props.onOpenCommandPalette === undefined, onClick: props.onOpenCommandPalette, type: "button", children: _jsx(WorkbenchGlyph, { kind: "search" }) }) }) }), _jsx(TooltipContent, { children: "Command Palette" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "New Note", className: "tocktutor-new-tab border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", disabled: props.onNewNote === undefined, onClick: props.onNewNote, type: "button", children: _jsx(WorkbenchGlyph, { kind: "new" }) }) }) }), _jsx(TooltipContent, { children: "New Note" })] }), _jsx("span", { className: "tocktutor-titlebar-spacer flex-1" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-expanded": panel === 'assistant', "aria-label": "Toggle Assistant Panel", className: "tocktutor-panel-icon border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel-right" }) }) }), _jsx(TooltipContent, { children: "Toggle Assistant Panel" })] })] })] }));
    return (_jsx(TooltipProvider, { children: _jsxs("main", { "aria-label": "TockTutor Workbench", className: "tocktutor-workbench h-full min-h-0 box-border bg-[var(--tt-bg)] pt-0 text-[var(--tt-text)] [--tt-accent:var(--dsw-alias-accent-primary,#533afd)] [--tt-bg:var(--dsw-alias-bg-base,#fff)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-footer-height:28px] [--tt-muted:var(--dsw-alias-fg-muted,#71717a)] [--tt-panel:var(--dsw-alias-bg-elevated,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-fg-primary,#27272a)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_[hidden]]:!hidden [&_button]:text-inherit [&_button]:[font:inherit] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tt-accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tt-accent)] [&_svg]:block [&_svg]:size-4 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tt-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!delay-0 motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!delay-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!delay-0 motion-reduce:[&_*::before]:!duration-0", "data-focus-mode": snapshot.focusMode === true, "data-phase": snapshot.phase, tabIndex: -1, children: [props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget), snapshot.dispatchDialog !== null && (_jsx(NativeDispatchDialog, { kind: snapshot.dispatchDialog, onCancel: () => { props.onCancelDispatch?.(); }, onSubmit: draft => { props.onSubmitDispatch?.(draft); } })), snapshot.commandPaletteOpen === true && (_jsx(WorkbenchCommandPalette, { canGoBack: snapshot.canGoBack === true, canGoForward: snapshot.canGoForward === true, canReopen: (snapshot.recentlyClosed?.length ?? 0) > 0, editorEnabled: snapshot.documentKind === 'markdown' && snapshot.mode !== 'reading', onBack: props.onBack, onClose: () => { props.onCloseCommandPalette?.(); }, onEditorCommand: props.onEditorCommand, onForward: props.onForward, onNewNote: props.onNewNote, onReopen: props.onReopenClosedTab, onSearch: props.onOpenSearch, onToggleFocus: props.onToggleFocusMode })), _jsxs("div", { className: "tocktutor-grid relative grid h-full min-h-0 grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 ease-out", style: {
                        gridTemplateColumns: contentColumns,
                        transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
                    }, children: [_jsxs("aside", { "aria-hidden": !effectiveSidebarOpen, "aria-label": "Files", className: "tocktutor-sidebar grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden border-r border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] data-[open=false]:invisible data-[open=false]:[transition:visibility_0s_linear_300ms]", "data-open": effectiveSidebarOpen, ...(effectiveSidebarOpen ? {} : { inert: '' }), children: [_jsxs("header", { className: "tocktutor-sidebar-header flex items-center gap-2.5 border-b border-[var(--tt-border)] px-2.5 [&_svg]:size-3.5", children: [_jsx("h1", { className: "mr-auto my-0 text-sm font-semibold", children: "Files" }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(WorkbenchGlyph, { kind: "more" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(Upload, { "aria-hidden": "true" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(WorkbenchGlyph, { kind: "folder" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(PanelTop, { "aria-hidden": "true" }) })] }), _jsxs("div", { className: "tocktutor-sidebar-content min-h-0 overflow-auto px-[5px] py-[3px]", children: [snapshot.searchOpen && (_jsxs("section", { "aria-label": "Search Notes", className: "tocktutor-search mb-2 border-b border-[var(--tt-border)] px-[3px] pb-2", children: [_jsx(Label, { unstyled: true, className: "mb-[5px] block text-xs font-semibold", htmlFor: "tocktutor-search-query", children: "Search Notes" }), _jsxs("div", { className: "flex gap-1", children: [_jsx(Input, { unstyled: true, "aria-label": "Search Notes Query", autoFocus: true, className: "w-full min-w-0 rounded-[5px] border border-[var(--tt-border)] px-[7px] py-[5px] [font:inherit]", id: "tocktutor-search-query", maxLength: 1_000, onChange: event => { props.onSearchChange?.(event.target.value); }, type: "search", value: snapshot.searchQuery }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Close Search", className: "w-7 rounded-[5px] border border-[var(--tt-border)] bg-transparent", onClick: () => { props.onCloseSearch?.(); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) }) }), _jsx(TooltipContent, { children: "Close Search" })] })] }), _jsxs("div", { className: "mt-1 flex gap-1", children: [_jsx(Button, { unstyled: true, "aria-pressed": (snapshot.searchMode ?? 'query') === 'query', className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs aria-pressed:border-[var(--tt-accent)]", onClick: () => { props.onSearchMode?.('query'); }, type: "button", children: "Keyword" }), _jsx(Button, { unstyled: true, "aria-pressed": snapshot.searchMode === 'related', className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs aria-pressed:border-[var(--tt-accent)]", onClick: () => { props.onSearchMode?.('related'); }, type: "button", children: "Related" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.searchLoading === true || snapshot.searchQuery.trim() === '', onClick: props.onRunSearch, type: "button", children: snapshot.searchLoading === true ? 'Searching…' : 'Search' })] }), _jsx(Alert, { unstyled: true, "aria-live": "polite", className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", role: "status", children: (snapshot.searchMatches?.length ?? 0) > 0 ? `${String(snapshot.searchMatches?.length ?? 0)} vault results.` : `${String(documents.length)} matching note paths.` }), (snapshot.searchMatches?.length ?? 0) > 0 && (_jsx("ul", { className: "m-0 grid list-none gap-1 p-0", "aria-label": "Vault Search Results", children: snapshot.searchMatches?.map((match, index) => (_jsx("li", { children: _jsxs(Button, { unstyled: true, className: "w-full rounded border border-[var(--tt-border)] bg-transparent p-1.5 text-left", onClick: () => { props.onSelect(match.path); }, type: "button", children: [_jsxs("strong", { className: "block truncate text-xs", children: [match.path, match.line === null ? '' : `:${String(match.line)}`] }), _jsx("span", { className: "block truncate text-xs text-[var(--tt-muted)]", children: match.preview })] }) }, `${match.path}-${String(match.line ?? 0)}-${String(index)}`))) }))] })), _jsxs("nav", { "aria-label": "Vault Notes", children: [snapshot.phase === 'loading' && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "Loading notes\u2026" }), snapshot.phase === 'inactive' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: "No Active Vault" }), snapshot.phase === 'error' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: snapshot.message }), snapshot.phase === 'ready' && documents.length === 0 && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "No supported notes found." }), _jsx("ul", { className: "tocktutor-tree m-0 list-none p-0", role: visibleTreeEntries.length > 0 ? 'tree' : undefined, children: _jsx(TreeEntries, { entries: visibleTreeEntries, onSelect: props.onSelect, path: snapshot.path }) })] })] }), _jsxs(Button, { unstyled: true, "aria-expanded": panel === 'utilities', className: "tocktutor-vault-switcher grid grid-cols-[14px_minmax(0,1fr)_16px] items-center gap-1.5 border-0 border-t border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] px-2.5 text-left [&>span]:truncate [&_svg]:size-[13px]", onClick: () => { setPanel(current => current === 'utilities' ? null : 'utilities'); }, type: "button", children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx("span", { children: snapshot.vault === null ? 'Choose Vault' : 'TockTutor Vault' }), _jsx(WorkbenchGlyph, { kind: "more" })] })] }), _jsx(Button, { unstyled: true, "aria-label": `Resize Files Sidebar, ${String(sidebarWidth)} Pixels`, className: "tocktutor-sidebar-resize absolute top-0 bottom-0 z-5 m-0 w-2 touch-none cursor-ew-resize border-0 bg-transparent p-0 outline-none after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-0.5 after:bg-transparent after:content-[''] focus-visible:after:bg-[var(--tt-accent)]", hidden: !effectiveSidebarOpen, onKeyDown: resizeSidebarWithKeyboard, onPointerDown: beginSidebarResize, style: { left: sidebarWidth - 4 }, title: "Drag or Use Left and Right Arrow Keys", type: "button" }), _jsxs("section", { "aria-label": "Note Editor", className: "tocktutor-editor grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden bg-[var(--tt-panel)]", id: "tocktutor-note-editor", role: "tabpanel", children: [_jsxs("header", { className: "tocktutor-editor-header relative flex min-w-0 items-center justify-center border-b border-[var(--tt-border)] px-2.5", children: [_jsx("h2", { className: "m-0 truncate text-[13px] font-medium text-[var(--tt-muted)]", children: noteTitle(snapshot.path) }), _jsxs("div", { className: "tocktutor-editor-actions absolute right-2.5 flex items-center gap-1 [&_button]:inline-flex [&_button]:h-7 [&_button]:w-[26px] [&_button]:items-center [&_button]:justify-center [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[var(--tt-muted)] [&_span]:inline-flex [&_span]:h-7 [&_span]:w-[26px] [&_span]:items-center [&_span]:justify-center [&_span]:border-0 [&_span]:bg-transparent [&_span]:p-0 [&_span]:text-[var(--tt-muted)]", children: [snapshot.documentKind === 'markdown' ? (_jsx("span", { "aria-label": "Editor Mode", className: "flex", role: "group", children: ['reading', 'live-preview', 'source'].map(mode => (_jsx(Button, { unstyled: true, "aria-label": mode === 'reading' ? 'Reading' : mode === 'live-preview' ? 'Live Preview' : 'Source', "aria-pressed": snapshot.mode === mode, className: "w-auto! px-1.5! aria-pressed:text-[var(--tt-accent)]", onClick: () => { props.onMode(mode); }, type: "button", children: mode === 'reading' ? _jsx(FileText, { "aria-hidden": "true" }) : mode === 'live-preview' ? _jsx(Pencil, { "aria-hidden": "true" }) : _jsx(WorkbenchGlyph, { kind: "document" }) }, mode))) })) : (_jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'source' ? previewLabel : sourceLabel, onClick: () => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "pencil" }) })), _jsx("span", { children: _jsx(Music, { "aria-hidden": "true" }) }), _jsx("span", { children: _jsx(Folder, { "aria-hidden": "true" }) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "More Note Actions", "aria-expanded": panel === 'utilities', onClick: () => { setPanel(current => current === 'utilities' ? null : 'utilities'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "more" }) }) }), _jsx(TooltipContent, { children: "More Note Actions" })] })] })] }), _jsx("div", { className: "tocktutor-editor-body relative min-h-0 overflow-auto", children: snapshot.path === null ? (_jsx(Empty, { unstyled: true, className: "tocktutor-empty absolute top-[45%] left-1/2 w-full max-w-[420px] -translate-1/2 p-8 text-center", children: _jsxs(EmptyHeader, { unstyled: true, children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Ready When You Are" }), _jsx(EmptyTitle, { unstyled: true, "aria-level": 2, className: "text-xl font-bold", role: "heading", children: "Select a Note" }), _jsx(EmptyDescription, { unstyled: true, className: "text-[var(--tt-muted)]", children: "Choose a Markdown note from the vault to read or edit its exact source." })] }) })) : snapshot.mode === 'source' ? (_jsx(Textarea, { unstyled: true, "aria-label": sourceLabel, className: "h-full min-h-0 w-full resize-none border-0 bg-[var(--tt-panel)] px-[max(28px,calc((100%-768px)/2))] py-9 text-[var(--tt-text)] outline-none [tab-size:2] [font:14px/1.65_ui-monospace,SFMono-Regular,Consolas,monospace]", onChange: (event) => { props.onEdit(event.target.value); }, onSelect: event => { props.onSelectionChange?.(event.currentTarget.selectionStart, event.currentTarget.selectionEnd); }, spellCheck: "true", value: snapshot.source })) : snapshot.mode === 'live-preview' && snapshot.documentKind === 'markdown' ? (_jsx(LivePreviewView, { documentKey: snapshot.path, onEdit: props.onEdit, onToggleTask: props.onToggleTask, source: snapshot.source })) : snapshot.documentKind === 'canvas' ? (_jsx(CanvasBoard, { disabled: snapshot.revision === null || props.onCanvasChange === undefined, onChange: change => { props.onCanvasChange?.(change); }, revision: snapshot.revision ?? 'unavailable', source: snapshot.source })) : snapshot.documentKind === 'base' ? (_jsx(ExecutableBaseView, { files: snapshot.baseFiles ?? [], ...(props.onBaseCopy === undefined ? {} : { onCopy: props.onBaseCopy }), ...(props.onBaseEdit === undefined ? {} : { onEdit: props.onBaseEdit }), ...(props.onBaseExport === undefined ? {} : { onExport: props.onBaseExport }), source: snapshot.source })) : snapshot.documentKind === 'markdown' ? (_jsx(RichReadingView, { onToggleTask: props.onToggleTask, source: snapshot.source })) : (_jsx(Alert, { unstyled: true, children: "Reading view is unavailable." })) }), _jsxs("footer", { "aria-label": "TockTutor Status Bar", className: "tocktutor-statusbar flex min-w-0 items-center border-t border-[var(--tt-border)] px-2 text-xs text-[var(--tt-muted)]", role: "group", children: [_jsx("output", { "aria-live": "polite", className: "tocktutor-message absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]", children: snapshot.message }), snapshot.path !== null && (_jsxs("div", { className: "ml-auto flex items-center gap-[18px] whitespace-nowrap max-[760px]:gap-2", children: [_jsx("span", { children: "0 Backlinks" }), _jsx("span", { children: snapshot.mode === 'reading' ? 'Reading' : snapshot.mode === 'live-preview' ? 'Live Preview' : 'Source' }), _jsxs("span", { children: [String(words), " Words"] }), _jsxs("span", { children: [String(characters), " Characters"] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Open Assistant", "aria-expanded": panel === 'assistant', onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", className: "border-0 bg-transparent px-0 py-0.5 text-[var(--tt-muted)] [&_svg]:size-[17px]", children: _jsx(WorkbenchGlyph, { kind: "chat" }) }) }), _jsx(TooltipContent, { children: "Open Assistant" })] })] }))] })] }), _jsxs("aside", { "aria-hidden": panel !== 'assistant', "aria-label": "Assistant Panel", className: "tocktutor-right-panel tocktutor-right-panel-assistant relative invisible grid min-w-0 w-0 translate-x-6 grid-rows-[minmax(0,1fr)] overflow-hidden border-l-0 bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:translate-x-0 data-[open=true]:overflow-visible data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(240px,calc(100vw-262px))]", "data-open": panel === 'assistant', style: { width: panel === 'assistant' ? `${String(assistantPanelWidth)}px` : '0px' }, ...(panel === 'assistant' ? {} : { inert: '' }), children: [panel === 'assistant' && (_jsx(Button, { unstyled: true, "aria-label": "Resize Assistant Panel", "aria-orientation": "vertical", "aria-valuemax": MAX_ASSISTANT_PANEL_WIDTH, "aria-valuemin": MIN_ASSISTANT_PANEL_WIDTH, "aria-valuenow": assistantPanelWidth, className: "tocktutor-assistant-resize absolute top-0 bottom-0 left-0 z-3 w-4 -translate-x-1/2 touch-none cursor-col-resize border-0 bg-transparent p-0 outline-none before:absolute before:top-1/2 before:left-1/2 before:h-10 before:w-2 before:-translate-1/2 before:rounded-full before:border before:border-[color-mix(in_srgb,var(--tt-text)_32%,var(--tt-border)_68%)] before:bg-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-panel))] before:shadow-[0_4px_12px_-7px_color-mix(in_srgb,var(--tt-text)_42%,transparent),0_0_0_1px_color-mix(in_srgb,var(--tt-panel)_82%,transparent)] before:transition-colors before:duration-140 before:ease-[cubic-bezier(.16,1,.3,1)] before:content-[''] hover:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] active:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] focus-visible:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] hover:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] active:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] focus-visible:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)]", onKeyDown: resizeAssistantPanelWithKeyboard, onPointerDown: beginAssistantPanelResize, role: "separator", title: "Drag or Use Left and Right Arrow Keys", type: "button" })), _jsx("div", { className: "tocktutor-assistant-content min-h-0 min-w-[min(240px,calc(100vw-262px))] overflow-hidden border-l border-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-border)_92%)] transition-colors duration-140 ease-[cubic-bezier(.16,1,.3,1)]", children: props.assistantPanel })] }), _jsxs("aside", { "aria-hidden": panel !== 'utilities', "aria-label": "Workbench Utilities", className: "tocktutor-right-panel invisible grid min-w-0 w-0 translate-x-6 grid-rows-[40px_minmax(0,1fr)] overflow-auto border-l border-[var(--tt-border)] bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:w-[min(360px,calc(100vw-262px))] data-[open=true]:translate-x-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(360px,calc(100vw-262px))]", "data-open": panel === 'utilities', ...(panel === 'utilities' ? {} : { inert: '' }), children: [_jsxs("header", { className: "flex items-center justify-between border-b border-[var(--tt-border)] px-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "More Options" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Close More Options", className: "border-0 bg-transparent p-[5px]", onClick: () => { setPanel(null); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) }) }), _jsx(TooltipContent, { children: "Close More Options" })] })] }), _jsxs("section", { "aria-label": "Vaults", className: "border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "m-0 text-sm", children: "Vaults" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: props.onOpenSandboxVault, type: "button", children: "Open Sandbox Vault" })] }), _jsxs("div", { className: "mt-2 grid gap-1.5", children: [(snapshot.recentVaults ?? []).map((vault, index) => (_jsxs("div", { className: "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1", children: [_jsxs("span", { className: "truncate text-xs", title: vault.id, children: ["Recent Vault ", String(index + 1), snapshot.vault?.id === vault.id ? ' · Active' : ''] }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.vault?.id === vault.id, onClick: () => { props.onActivateRecentVault?.(vault.id); }, type: "button", children: "Open" }), _jsx(Button, { unstyled: true, "aria-label": `Remove Recent Vault ${String(index + 1)}`, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: () => { props.onRemoveRecentVault?.(vault.id); }, type: "button", children: "Remove" })] }, vault.id))), (snapshot.recentVaults?.length ?? 0) === 0 && _jsx(Alert, { unstyled: true, role: "status", children: "No recent vaults." })] })] }), _jsxs("section", { "aria-label": "File Recovery", className: "border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "m-0 text-sm", children: "File Recovery" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: props.onOpenRecovery, type: "button", children: "Refresh" })] }), snapshot.draftRecovered === true && _jsx(Alert, { unstyled: true, className: "mt-2", role: "status", children: "A local draft was recovered for this note." }), _jsx("div", { className: "mt-2 flex gap-2", children: _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.path === null, onClick: props.onTrashCurrent, type: "button", children: "Move Current File to Trash" }) }), _jsx("h3", { className: "mt-3 mb-1 text-xs", children: "Snapshots" }), _jsxs("div", { className: "grid gap-1", children: [(snapshot.snapshots ?? []).map((snapshotEntry, index) => (_jsxs("div", { className: "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1", children: [_jsxs("span", { className: "truncate text-xs", children: ["Snapshot ", String(index + 1), " \u00B7 ", snapshotEntry.reason] }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: () => { props.onReadSnapshot?.(snapshotEntry.id); }, type: "button", children: "Preview" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: () => { props.onRestoreSnapshot?.(snapshotEntry.id); }, type: "button", children: "Restore as New" })] }, snapshotEntry.id))), (snapshot.snapshots?.length ?? 0) === 0 && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "No snapshots for the active file." })] }), snapshot.selectedSnapshot !== null && snapshot.selectedSnapshot !== undefined && (_jsx("pre", { "aria-label": "Snapshot Preview", className: "mt-2 max-h-32 overflow-auto rounded border border-[var(--tt-border)] p-2 text-xs", children: snapshot.selectedSnapshot.content })), _jsx("h3", { className: "mt-3 mb-1 text-xs", children: "Trash" }), _jsxs("div", { className: "grid gap-1", children: [(snapshot.trash ?? []).map((entry, index) => (_jsxs("div", { className: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1", children: [_jsx("span", { className: "truncate text-xs", children: entry.originalPath }), _jsx(Button, { unstyled: true, "aria-label": `Restore Trash Entry ${String(index + 1)}`, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: () => { props.onRestoreTrash?.(entry.id); }, type: "button", children: "Restore" })] }, entry.id))), (snapshot.trash?.length ?? 0) === 0 && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "Trash is empty." })] })] }), _jsxs("section", { "aria-label": "Graph View", className: "border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "m-0 text-sm", children: "Graph View" }), _jsxs("span", { className: "flex gap-1", children: [_jsx(Button, { unstyled: true, "aria-pressed": snapshot.graphMode === 'global', className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: () => { props.onLoadGraph?.('global'); }, type: "button", children: "Global" }), _jsx(Button, { unstyled: true, "aria-pressed": snapshot.graphMode === 'local', className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.path === null, onClick: () => { props.onLoadGraph?.('local'); }, type: "button", children: "Local" })] })] }), (snapshot.graphLayout?.length ?? 0) > 0 ? (_jsxs(_Fragment, { children: [_jsxs("svg", { "aria-label": `${snapshot.graphMode === 'local' ? 'Local' : 'Global'} Graph Canvas`, className: "mt-2 h-48 w-full rounded border border-[var(--tt-border)]", role: "img", viewBox: "0 0 400 240", children: [(snapshot.graph?.edges ?? []).map((edge, index) => {
                                                            const source = snapshot.graphLayout?.find(node => node.path === edge.sourcePath);
                                                            const target = snapshot.graphLayout?.find(node => node.path === edge.targetPath);
                                                            return source === undefined || target === undefined ? null : _jsx("line", { stroke: "currentColor", strokeOpacity: "0.35", x1: 200 + source.x / 5, x2: 200 + target.x / 5, y1: 120 + source.y / 5, y2: 120 + target.y / 5 }, `${edge.sourcePath}-${edge.targetPath}-${String(index)}`);
                                                        }), snapshot.graphLayout?.map(node => _jsx("circle", { cx: 200 + node.x / 5, cy: 120 + node.y / 5, fill: node.path === snapshot.graph?.path ? 'var(--tt-accent)' : 'var(--tt-muted)', r: "5", children: _jsx("title", { children: node.path }) }, node.path))] }), _jsx("div", { className: "mt-1 grid max-h-28 gap-1 overflow-auto", children: snapshot.graphLayout?.map(node => _jsx(Button, { unstyled: true, className: "truncate rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs", onClick: () => { props.onSelect(node.path); }, type: "button", children: node.path }, node.path)) })] })) : _jsx("span", { className: "mt-2 block text-xs text-[var(--tt-muted)]", children: "Open Global or Local Graph." })] }), _jsxs("section", { "aria-label": "Bookmarks", className: "border-t border-[var(--tt-border)] p-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "Bookmarks" }), _jsxs("div", { className: "mt-2 grid gap-1", children: [(snapshot.bookmarks ?? []).map(bookmark => (_jsxs("div", { className: "grid grid-cols-[minmax(0,1fr)_auto] gap-1", children: [_jsxs(Button, { unstyled: true, className: "truncate rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs", onClick: () => { props.onOpenBookmark?.(bookmark.id); }, type: "button", children: [bookmark.title, " \u00B7 ", bookmark.kind, bookmark.missing === true ? ' · Missing' : ''] }), _jsx(Button, { unstyled: true, "aria-label": `Remove Bookmark ${bookmark.title}`, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", onClick: () => { props.onRemoveBookmark?.(bookmark.id); }, type: "button", children: "Remove" })] }, bookmark.id))), (snapshot.bookmarks?.length ?? 0) === 0 && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "No bookmarks." })] })] }), _jsxs("section", { "aria-label": "Smart Views and Tags", className: "border-t border-[var(--tt-border)] p-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "Smart Views and Tags" }), _jsx("div", { className: "mt-2 grid grid-cols-2 gap-1", children: ['recent', 'tasks', 'journals', 'favorites', 'collections', 'tags'].map(kind => (_jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs", onClick: () => { props.onOpenSmartView?.(kind); }, type: "button", children: kind[0].toLocaleUpperCase() + kind.slice(1) }, kind))) }), (snapshot.facets?.tags.length ?? 0) > 0 && (_jsx("div", { className: "mt-2 grid gap-1", "aria-label": "Tags", children: snapshot.facets?.tags.map(tag => (_jsxs(Button, { unstyled: true, className: "rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs", onClick: () => { props.onSearchChange?.(`tag:${tag.tag}`); props.onRunSearch?.(); }, type: "button", children: ["#", tag.tag, " \u00B7 ", String(tag.count)] }, tag.tag.toLocaleLowerCase()))) }))] }), _jsxs("section", { "aria-label": "Properties", className: "border-t border-[var(--tt-border)] p-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "Properties" }), _jsx("h3", { className: "mt-2 mb-1 text-xs", children: "File" }), _jsxs("div", { className: "grid gap-1", children: [activeProperties.map(property => (_jsxs(Label, { unstyled: true, className: "grid grid-cols-[minmax(80px,.4fr)_minmax(0,1fr)] items-center gap-2 text-xs", children: [_jsxs("span", { className: "truncate", children: [property.key, " \u00B7 ", property.type] }), property.type === 'checkbox' ? (_jsx(Checkbox, { "aria-label": `${property.key} Property`, checked: property.value === true, onCheckedChange: checked => { props.onSetProperty?.(property.key, checked === true); } })) : (_jsx(Input, { unstyled: true, "aria-label": `${property.key} Property`, className: "min-w-0 rounded border border-[var(--tt-border)] bg-transparent p-1", defaultValue: Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? ''), onBlur: event => { props.onSetProperty?.(property.key, property.type === 'list' ? event.target.value.split(',').map(value => value.trim()).filter(Boolean) : property.type === 'number' && Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : event.target.value); } }))] }, property.key))), activeProperties.length === 0 && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "No file properties." })] }), _jsx("h3", { className: "mt-2 mb-1 text-xs", children: "All" }), _jsx("div", { className: "grid gap-1", children: (snapshot.facets?.properties ?? []).map(property => _jsxs(Button, { unstyled: true, className: "rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs", onClick: () => { props.onSearchChange?.(`[${property.key}]`); props.onRunSearch?.(); }, type: "button", children: [property.key, " \u00B7 ", String(property.count), " \u00B7 ", property.types.join(', ')] }, property.key.toLocaleLowerCase())) })] }), _jsxs("section", { "aria-label": "Note Relationships", className: "border-t border-[var(--tt-border)] p-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "Outline and Relationships" }), _jsx("h3", { className: "mt-2 mb-1 text-xs", children: "Outline" }), _jsxs("div", { className: "grid gap-1", children: [(snapshot.outline?.headings ?? []).map((heading) => (_jsxs(Button, { unstyled: true, className: "rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs", onClick: () => { props.onJumpToLine?.(heading.line); }, type: "button", children: ['·'.repeat(Math.max(1, heading.level)), " ", heading.text] }, `${heading.line}-${heading.selector}`))), (snapshot.outline?.headings.length ?? 0) === 0 && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "No headings." })] }), _jsx("h3", { className: "mt-2 mb-1 text-xs", children: "Footnotes" }), (snapshot.outline?.footnotes ?? []).map(footnote => _jsx(Button, { unstyled: true, className: "block w-full rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs", onClick: () => { props.onJumpToLine?.(footnote.line); }, type: "button", children: footnote.content }, `${footnote.line}-${footnote.ordinal}`)), _jsx("h3", { className: "mt-2 mb-1 text-xs", children: "Backlinks" }), (snapshot.links?.backlinkDetails ?? []).map((link, index) => _jsxs(Button, { unstyled: true, className: "block w-full rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs", onClick: () => { props.onSelect(link.sourcePath); }, type: "button", children: [link.sourcePath, ":", String(link.line)] }, `${link.sourcePath}-${String(link.line)}-${String(index)}`)), _jsx("h3", { className: "mt-2 mb-1 text-xs", children: "Outgoing Links" }), (snapshot.links?.outgoingDetails ?? []).map((link, index) => _jsx(Button, { unstyled: true, className: "block w-full rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs", disabled: link.resolvedPath === null, onClick: () => { if (link.resolvedPath !== null)
                                                props.onSelect(link.resolvedPath); }, type: "button", children: link.displayText || link.authoredTarget }, `${link.authoredTarget}-${String(link.line)}-${String(index)}`)), (snapshot.links?.unlinkedMentions ?? []).map((mention, index) => _jsxs("span", { className: "block text-xs text-[var(--tt-muted)]", children: ["Mention: ", mention.matchedText] }, `${mention.sourcePath}-${String(mention.line)}-${String(index)}`))] }), _jsxs("section", { "aria-label": "Resolved Embeds", className: "border-t border-[var(--tt-border)] p-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "Resolved Embeds" }), _jsxs("div", { className: "mt-2 grid gap-2", children: [(snapshot.embeds ?? []).map((embed, index) => (_jsxs("article", { className: "overflow-auto rounded border border-[var(--tt-border)] p-2", children: [_jsxs("strong", { className: "block truncate text-xs", children: [embed.target.path, embed.target.fragment === null ? '' : `#${embed.target.fragment}`] }), embed.target.kind === 'media' && embed.mimeType?.startsWith('image/') && _jsx("img", { alt: embed.target.display ?? embed.target.path, className: "mt-1 max-h-48 max-w-full", src: `data:${embed.mimeType};base64,${embed.content}` }), embed.target.kind === 'media' && embed.mimeType?.startsWith('audio/') && _jsx("audio", { className: "mt-1 w-full", controls: true, src: `data:${embed.mimeType};base64,${embed.content}` }), embed.target.kind === 'media' && embed.mimeType?.startsWith('video/') && _jsx("video", { className: "mt-1 max-h-48 max-w-full", controls: true, src: `data:${embed.mimeType};base64,${embed.content}` }), embed.target.kind === 'media' && embed.mimeType === 'application/pdf' && _jsx("iframe", { className: "mt-1 h-48 w-full", sandbox: "", src: `data:${embed.mimeType};base64,${embed.content}`, title: embed.target.path }), embed.target.kind === 'note' && _jsx("div", { className: "prose text-xs", dangerouslySetInnerHTML: { __html: renderMarkdownHtml(embed.content) } }), embed.target.kind === 'canvas' && _jsx(CanvasBoard, { disabled: true, onChange: () => { }, revision: "embedded", source: embed.content }), embed.target.kind === 'base' && _jsx(ExecutableBaseView, { files: snapshot.baseFiles ?? [], source: embed.content })] }, `${embed.target.path}-${String(index)}`))), (snapshot.embeds?.length ?? 0) === 0 && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "No resolved embeds." })] })] }), _jsxs("section", { "aria-label": "Attachments", className: "border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "m-0 text-sm", children: "Attachments" }), _jsxs(Label, { unstyled: true, className: "cursor-pointer rounded border border-[var(--tt-border)] px-2 py-1 text-xs", children: ["Add Files", _jsx("input", { className: "sr-only", type: "file", accept: "image/*,audio/*,video/*,application/pdf", onChange: event => {
                                                                const file = event.target.files?.[0];
                                                                if (file === undefined)
                                                                    return;
                                                                const reader = new FileReader();
                                                                reader.addEventListener('load', () => {
                                                                    const value = typeof reader.result === 'string' ? reader.result.split(',', 2)[1] : undefined;
                                                                    if (value !== undefined)
                                                                        props.onStoreAttachment?.(file.name, value);
                                                                }, { once: true });
                                                                reader.readAsDataURL(file);
                                                                event.target.value = '';
                                                            } })] })] }), _jsx("div", { className: "mt-2 grid gap-1", children: snapshot.entries.filter(entry => entry.kind === 'attachment').map(entry => _jsx(Button, { unstyled: true, className: "truncate rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs", onClick: () => { props.onPreviewAttachment?.(entry.path); }, type: "button", children: entry.path }, entry.path)) }), snapshot.attachmentPreview !== null && snapshot.attachmentPreview !== undefined && (_jsxs("div", { className: "mt-2 rounded border border-[var(--tt-border)] p-2", children: [_jsxs("div", { className: "flex justify-between gap-2", children: [_jsx("strong", { className: "truncate text-xs", children: snapshot.attachmentPreview.path }), _jsx(Button, { unstyled: true, "aria-label": "Close Attachment Preview", className: "border-0 bg-transparent", onClick: props.onCloseAttachmentPreview, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] }), snapshot.attachmentPreview.mediaKind === 'image' && _jsx("img", { alt: snapshot.attachmentPreview.path, className: "mt-2 max-h-48 max-w-full", src: `data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}` }), snapshot.attachmentPreview.mediaKind === 'audio' && _jsx("audio", { className: "mt-2 w-full", controls: true, src: `data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}` }), snapshot.attachmentPreview.mediaKind === 'video' && _jsx("video", { className: "mt-2 max-h-48 max-w-full", controls: true, src: `data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}` }), snapshot.attachmentPreview.mediaKind === 'pdf' && _jsx("iframe", { className: "mt-2 h-48 w-full", sandbox: "", src: `data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}`, title: snapshot.attachmentPreview.path })] }))] }), _jsxs("section", { "aria-label": "Note Composer and Format Converter", className: "border-t border-[var(--tt-border)] p-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "Note Composer and Format Converter" }), _jsxs("div", { className: "mt-2 flex gap-1", children: [_jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading' || (snapshot.selectionEnd ?? 0) <= (snapshot.selectionStart ?? 0), onClick: props.onExtractSelection, type: "button", children: "Extract Selection" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading', onClick: props.onConvertActiveNote, type: "button", children: "Convert Formats" })] })] }), _jsxs("section", { "aria-label": "Capture Organization", className: "border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "m-0 text-sm", children: "Capture Organization" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.path === null || !/^Inbox\/.+\.md$/iu.test(snapshot.path), onClick: props.onPrepareOrganization, type: "button", children: "Prepare Review" })] }), snapshot.organizationProposal !== null && snapshot.organizationProposal !== undefined && (_jsxs("div", { className: "mt-2 rounded border border-[var(--tt-border)] p-2 text-xs", children: [_jsx("strong", { className: "block", children: snapshot.organizationProposal.title }), _jsx("span", { className: "block truncate", children: snapshot.organizationProposal.destination }), _jsx("pre", { className: "max-h-32 overflow-auto whitespace-pre-wrap", children: snapshot.organizationProposal.content }), _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1", onClick: props.onCancelOrganization, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1", onClick: props.onApplyOrganization, type: "button", children: "Approve and Create" })] })] }))] }), _jsxs("section", { "aria-label": "TockTutor Settings", className: "border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "m-0 text-sm", children: "Settings and Workspaces" }), _jsx(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs", disabled: snapshot.settings === undefined, onClick: props.onSaveWorkspace, type: "button", children: "Save Workspace" })] }), _jsxs("div", { className: "mt-2 grid gap-2 text-xs", children: [_jsxs(Label, { unstyled: true, className: "flex items-center justify-between gap-2", children: ["Page Preview", _jsx(Checkbox, { checked: snapshot.settings?.pagePreview ?? true, disabled: snapshot.settings === undefined, onCheckedChange: checked => { props.onSettingsChange?.({ pagePreview: checked === true }); } })] }), _jsxs(Label, { unstyled: true, className: "flex items-center justify-between gap-2", children: ["Backlinks in Document", _jsx(Checkbox, { checked: snapshot.settings?.backlinksInDocument ?? false, disabled: snapshot.settings === undefined, onCheckedChange: checked => { props.onSettingsChange?.({ backlinksInDocument: checked === true }); } })] }), _jsxs(Label, { unstyled: true, className: "grid gap-1", children: ["Default Editing Mode", _jsxs("select", { className: "rounded border border-[var(--tt-border)] bg-transparent p-1", disabled: snapshot.settings === undefined, onChange: event => { props.onSettingsChange?.({ defaultEditingMode: event.target.value === 'source' ? 'source' : 'live-preview' }); }, value: snapshot.settings?.defaultEditingMode ?? 'live-preview', children: [_jsx("option", { value: "live-preview", children: "Live Preview" }), _jsx("option", { value: "source", children: "Source" })] })] })] }), _jsxs("div", { className: "mt-2 grid gap-1", children: [(snapshot.workspaces ?? []).map(workspace => (_jsxs(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs", onClick: () => { props.onLoadWorkspace?.(workspace.id); }, type: "button", children: ["Load ", workspace.name] }, workspace.id))), (snapshot.workspaces?.length ?? 0) === 0 && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "No saved workspaces." })] })] }), _jsxs("section", { "aria-label": "Pane Groups", className: "tocktutor-pane-groups border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "tocktutor-pane-heading flex items-center justify-between", children: [_jsx("h2", { className: "m-0 text-sm", children: "Pane Groups" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "Add Pane", className: "size-[26px] rounded border border-[var(--tt-border)] bg-transparent", disabled: snapshot.panes.length >= MAX_PANE_GROUPS, onClick: props.onAddPane, type: "button", children: _jsx(WorkbenchGlyph, { kind: "new" }) }) }) }), _jsx(TooltipContent, { children: "Add Pane" })] })] }), _jsx("div", { className: "tocktutor-pane-list mt-2 grid grid-cols-2 gap-1.5", children: snapshot.panes.map((pane, index) => (_jsxs(Button, { unstyled: true, "aria-pressed": pane.id === snapshot.focusedPaneId, className: "overflow-hidden rounded-[5px] border border-[var(--tt-border)] bg-transparent p-1.5 text-left aria-pressed:border-[var(--tt-accent)] [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-[var(--tt-muted)] [&_span]:block [&_span]:truncate", onClick: () => { props.onFocusPane(pane.id); }, title: pane.activePath ?? `Pane ${String(index + 1)}`, type: "button", children: [_jsxs("span", { children: ["Pane ", String(index + 1)] }), _jsx("small", { children: pane.activePath ?? 'Empty' })] }, pane.id))) })] }), _jsxs("section", { "aria-label": "Shared Review Panel", className: "tocktutor-review border-t border-[var(--tt-border)] p-3", children: [_jsx("header", { children: _jsx("h2", { className: "m-0 text-sm", children: "Reviews" }) }), _jsx("div", { className: "tocktutor-review-content min-h-0 overflow-auto text-xs text-[var(--tt-muted)]", children: props.reviewPanel ?? _jsx(Alert, { unstyled: true, role: "status", children: "No review workflow is active." }) })] }), _jsxs("section", { "aria-label": "Native Actions", className: "tocktutor-native-actions border-t border-[var(--tt-border)] p-3", children: [_jsx("header", { children: _jsx("h2", { className: "m-0 text-sm", children: "Native Actions" }) }), _jsx("div", { className: "tocktutor-native-actions-content min-h-0 overflow-auto text-xs text-[var(--tt-muted)]", children: props.nativeActions ?? _jsx(Alert, { unstyled: true, role: "status", children: "No native actions are available." }) })] })] })] })] }) }));
}
function TockTutorAssistantPanelOutlet(props) {
    return props.renderSlot(TOCKTUTOR_ASSISTANT_PANEL_SLOT, {
        activePath: props.activePath,
        ...(props.selectedText === undefined ? {} : { selectedText: props.selectedText }),
        vault: props.vault,
    });
}
function TockTutorReviewPanelOutlet(props) {
    return props.renderSlot(TOCKTUTOR_REVIEW_PANEL_SLOT, {
        activePath: props.activePath,
        vault: props.vault,
    }, {
        fallback: _jsx(Alert, { unstyled: true, role: "status", children: "No review workflow is active." }),
    });
}
function TockTutorNativeActionsOutlet(props) {
    return props.renderSlot(TOCKTUTOR_NATIVE_ACTIONS_SLOT, {
        activePath: props.activePath,
        handleDispatch: props.handleDispatch,
        saveCurrent: props.saveCurrent,
        vault: props.vault,
    }, {
        fallback: _jsx(Alert, { unstyled: true, role: "status", children: "No native actions are available." }),
    });
}
/** Root-scoped component contributed to TockTeam's exact Desktop route seat. */
export function TockTutorRoute(props) {
    const controller = useMemo(() => new WorkbenchRouteController(props.remote, props.navigate), [props.navigate, props.remote]);
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const root = useRef(null);
    useEffect(() => {
        void controller.syncLocation(props.location.pathname);
    }, [controller, props.location.pathname]);
    useEffect(() => () => { controller.dispose(); }, [controller]);
    useEffect(() => {
        if (snapshot.path === null)
            return;
        root.current?.querySelector(snapshot.mode === 'source' ? 'textarea' : '[aria-label$="View"]')?.focus();
    }, [snapshot.mode, snapshot.path]);
    useEffect(() => {
        if (snapshot.searchOpen)
            root.current?.querySelector('[aria-label="Search Notes Query"]')?.focus();
    }, [snapshot.searchOpen]);
    useEffect(() => {
        const node = root.current;
        if (node === null)
            return;
        const onKeyDown = (event) => {
            const isMac = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? '');
            const primary = isMac ? event.metaKey : event.ctrlKey;
            if (primary && !event.altKey && event.key.toLocaleLowerCase() === 'p') {
                event.preventDefault();
                controller.setCommandPaletteOpen(true);
                return;
            }
            if (primary && event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === 't') {
                event.preventDefault();
                void controller.reopenClosedTab();
                return;
            }
            const editorCommand = resolvePlatformEditorCommand(event, isMac);
            if (editorCommand !== null) {
                event.preventDefault();
                controller.runEditorCommand(editorCommand);
                return;
            }
            const shortcut = resolveEditorShortcut(event, isMac);
            if (shortcut !== 'save')
                return;
            event.preventDefault();
            void controller.save();
        };
        node.addEventListener('keydown', onKeyDown);
        return () => { node.removeEventListener('keydown', onKeyDown); };
    }, [controller]);
    return (_jsx("div", { className: "tocktutor-root h-full min-h-0", ref: root, children: _jsx(TockTutorRouteView, { assistantPanel: (_jsx(TockTutorAssistantPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, ...((snapshot.selectionEnd ?? 0) > (snapshot.selectionStart ?? 0)
                    ? { selectedText: snapshot.source.slice(snapshot.selectionStart, Math.min(snapshot.selectionEnd ?? 0, (snapshot.selectionStart ?? 0) + 10_000)) }
                    : {}), vault: snapshot.vault })), nativeActions: (_jsx(TockTutorNativeActionsOutlet, { activePath: snapshot.path, handleDispatch: event => controller.handleDispatch(event), renderSlot: props.renderSlot, saveCurrent: () => controller.save(), vault: snapshot.vault })), onActivateRecentVault: id => { void controller.activateRecentVault(id); }, onActivateTab: (paneId, path) => { void controller.activateTab(paneId, path); }, onAddBookmark: () => { controller.addActiveBookmark(); }, onApplyOrganization: () => { void controller.applyOrganization(); }, onAddPane: () => { void controller.addPane(); }, onBack: () => { void controller.goBack(); }, onBaseCopy: request => { void globalThis.navigator?.clipboard?.writeText(request.text); }, onBaseEdit: request => { void controller.applyBaseEdit(request); }, onBaseExport: request => {
                const url = URL.createObjectURL(new Blob([request.text], { type: 'text/csv;charset=utf-8' }));
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = request.filename;
                anchor.click();
                URL.revokeObjectURL(url);
            }, onCancelDispatch: () => { controller.cancelDispatchDialog(); }, onCancelOrganization: () => { controller.cancelOrganization(); }, onCanvasChange: change => { void controller.applyCanvasChange(change); }, onCloseAttachmentPreview: () => { controller.closeAttachmentPreview(); }, onCloseCommandPalette: () => { controller.setCommandPaletteOpen(false); }, onCloseSearch: () => { controller.closeSearch(); }, onCloseTab: (paneId, path) => { void controller.closeTab(paneId, path); }, onConvertActiveNote: () => { controller.convertActiveNote(); }, onEdit: source => { controller.edit(source); }, onEditorCommand: command => { controller.runEditorCommand(command); }, onExtractSelection: () => { void controller.extractActiveSelection(); }, onFocusPane: paneId => { void controller.focusPane(paneId); }, onForward: () => { void controller.goForward(); }, onJumpToLine: line => { controller.jumpToLine(line); }, onLoadGraph: mode => { void controller.loadGraph(mode); }, onLoadWorkspace: id => { void controller.loadWorkspace(id); }, onMode: mode => { controller.setMode(mode); }, onMoveCanvas: (nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY); }, onMoveTab: (paneId, path, direction) => { controller.moveTab(paneId, path, direction); }, onNewNote: () => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }); }, onOpenBookmark: id => { void controller.openBookmark(id); }, onOpenCommandPalette: () => { controller.setCommandPaletteOpen(true); }, onOpenRecovery: () => { void controller.setRecoveryOpen(true); }, onOpenSandboxVault: () => { void controller.openSandboxVault(); }, onOpenSearch: () => { controller.openSearch(''); }, onOpenSmartView: kind => { void controller.openSmartView(kind); }, onPrepareOrganization: () => { void controller.prepareOrganization(); }, onPreviewAttachment: path => { void controller.previewAttachment(path); }, onReadSnapshot: id => { void controller.readRecoverySnapshot(id); }, onRemoveBookmark: id => { controller.removeBookmark(id); }, onRemoveRecentVault: id => { void controller.removeRecentVault(id); }, onReopenClosedTab: () => { void controller.reopenClosedTab(); }, onRestoreSnapshot: id => { void controller.restoreRecoverySnapshot(id); }, onRestoreTrash: id => { void controller.restoreTrashEntry(id); }, onRunSearch: () => { void controller.runSearch(); }, onSave: () => { void controller.save(); }, onSaveWorkspace: () => { controller.saveCurrentWorkspace(); }, onSearchChange: query => { controller.setSearchQuery(query); }, onSearchMode: mode => { controller.setSearchMode(mode); }, onSettingsChange: change => { controller.updateSettings(change); }, onSelect: path => { void controller.select(path); }, onSelectionChange: (start, end) => { controller.setSelection(start, end); }, onSetProperty: (key, value) => { controller.setProperty(key, value); }, onStoreAttachment: (fileName, dataBase64) => { void controller.storeActiveAttachment(fileName, dataBase64); }, onSubmitDispatch: draft => { void controller.submitDispatchDialog(draft); }, onToggleFocusMode: () => { controller.toggleFocusMode(); }, onTogglePinTab: (paneId, path) => { controller.togglePinTab(paneId, path); }, onToggleTask: index => { controller.toggleTask(index); }, onTrashCurrent: () => { void controller.trashCurrent(); }, reviewPanel: (_jsx(TockTutorReviewPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), snapshot: snapshot, ...(typeof document === 'undefined'
                ? {}
                : { titlebarTarget: document.getElementById('tockteam-window-titlebar-slot') ?? document.body }) }) }));
}
//# sourceMappingURL=route.js.map