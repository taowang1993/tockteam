import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { Checkbox } from '@tockteam/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@tockteam/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@tockteam/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@tockteam/ui/popover';
import { Textarea } from '@tockteam/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@tockteam/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, Merge, ChevronLeft, ChevronRight, Copy, FileClock, FileCode2, FileText, FileDown, ExternalLink, FolderInput, FolderOpen, Globe2, Link2, ListTree, MessageSquare, Network, PanelsTopLeft, Paperclip, Pencil, Plus, Search, SlidersHorizontal, Tags, Trash2, Wrench, X, } from 'lucide-react';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from "./assistant-panel.js";
import { ExecutableBaseView } from "./base-executable-view.js";
import { executableBasePropertyIdentity } from "./base-edit.js";
import { CanvasBoard } from "./canvas-board.js";
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT, TOCKTUTOR_VAULT_ACTIONS_SLOT, } from "./native-actions.js";
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from "./review-panel.js";
import { TOCKTUTOR_WEB_VIEWER_PANEL_SLOT } from "./web-viewer-panel.js";
import { LivePreviewView, RichReadingView } from "./editor-surface.js";
import { MAX_EDITOR_SEARCH_QUERY_LENGTH } from "./editor-search.js";
import { SourceEditor } from "./source-editor.js";
import { WorkbenchUtilities } from "./utility-panel.js";
import { LinkedNotePane, LINKED_VIEW_TITLES } from "./linked-note-pane.js";
import { PaneLayoutView } from "./pane-layout.js";
import { NoteBacklinks } from "./note-backlinks.js";
import { WorkbenchVaultDialog } from "./vault-dialog.js";
import { WorkbenchGlyph } from "./workbench-glyph.js";
import { parseCanvasDocument, updateCanvasNodePosition, } from "./canvas.js";
import { projectLivePreview, replaceLivePreviewLine, } from "./live-preview.js";
import { renderMarkdownHtml } from "./rich-markdown.js";
import { parseFrontmatterProperties, setFrontmatterProperty } from "./properties.js";
import { addBookmark, editBookmark as updateBookmark, getBookmark, loadBookmarks, remapBookmarks, removeBookmark as removeStoredBookmark, saveBookmarks } from "./bookmarks.js";
import { layoutGraph, projectGraph } from "./graph.js";
import { BUILTIN_TEMPLATES, buildCaptureNote, buildJournalNote, expandTemplate, uniqueNotePath } from "./capture.js";
import { buildOrganizationProposal } from "./organize.js";
import { convertMarkdownFormats, extractSelectionToNote } from "./composer.js";
import { previewNoteMerge } from "./merge-preview.js";
import { NoteMergeReview, MergeRecoveryDialog } from "./merge-review.js";
import { appendAttachmentMarkdown, attachmentTargetPath } from "./attachments.js";
import { collectEmbedTargets, resolveEmbedGraph } from "./embeds.js";
import { createNamedWorkspace, loadTockTutorSettings, loadWorkbenchState, saveTockTutorSettings, saveWorkbenchState, } from "./settings.js";
import { applyEditorCommand, resolvePlatformEditorCommand, } from "./editor-commands.js";
import { editorStatusLabel, resolveEditorShortcut, toggleMarkdownTask, } from "./markdown.js";
import { addPaneGroup, openLinkedPane, syncLinkedViews, unlinkPane, toggleLinkedPanePin, LINKED_VIEW_KINDS, splitPaneGroup, resizePaneSplit, closeNoteTab, closePaneGroup, createWorkbenchSession, focusPaneGroup, isSafeVaultRelativePath, markTabDirty, MAX_NOTE_TABS, MAX_PANE_GROUPS, moveNoteTab, openNoteTab, renameNoteTabPath, mergeNoteTabPath, setActiveNoteTab, setNoteTabMode, setTabPinned, hydrateWorkbenchSession, } from "./session.js";
import { isNoteVaultChangeEvent } from "./vault-events.js";
const ROUTE_PREFIX = '/tocktutor';
const TREE_LIMIT = 200;
const MAX_TREE_PAGES = 100;
const MAX_TREE_CURSOR_LENGTH = 4_096;
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
const ROUTE_FLUSH_TIMEOUT_MS = 1_000;
const FINAL_DRAFT_ATTEMPTS = 3;
const pendingTockTutorRouteFlushes = new Set();
export class TockTutorRouteFlushTimeoutError extends Error {
    timeoutMs;
    constructor(timeoutMs) {
        super(`TockTutor route cleanup timed out after ${timeoutMs}ms.`);
        this.timeoutMs = timeoutMs;
        this.name = 'TockTutorRouteFlushTimeoutError';
    }
}
/** Track async route cleanup until its owning client observes the outcome. */
export function trackTockTutorRouteFlush(flush) {
    const tracked = { outcome: null, promise: Promise.resolve(flush) };
    pendingTockTutorRouteFlushes.add(tracked);
    void tracked.promise.then(() => { tracked.outcome = { kind: 'fulfilled' }; }, error => { tracked.outcome = { error, kind: 'rejected' }; });
}
/** Await route cleanup without allowing a stuck transport to block unload forever. */
export async function waitForTockTutorRouteFlushes(timeoutMs = ROUTE_FLUSH_TIMEOUT_MS) {
    const boundedTimeout = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : ROUTE_FLUSH_TIMEOUT_MS;
    const deadline = Date.now() + boundedTimeout;
    while (pendingTockTutorRouteFlushes.size > 0) {
        const pending = [...pendingTockTutorRouteFlushes];
        const settled = pending.every(flush => flush.outcome !== null);
        if (settled) {
            const failure = pending.find(flush => flush.outcome?.kind === 'rejected')?.outcome;
            for (const flush of pending)
                pendingTockTutorRouteFlushes.delete(flush);
            if (failure?.kind === 'rejected')
                throw failure.error;
            continue;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0)
            throw new TockTutorRouteFlushTimeoutError(boundedTimeout);
        let timer;
        try {
            const result = await Promise.race([
                Promise.all(pending.map(flush => flush.promise.then(() => ({ kind: 'fulfilled' }), error => ({ error, kind: 'rejected' })))).then(outcomes => ({ kind: 'settled', outcomes })),
                new Promise(resolve => {
                    timer = setTimeout(() => { resolve({ kind: 'timeout' }); }, remaining);
                }),
            ]);
            if (result.kind === 'timeout')
                throw new TockTutorRouteFlushTimeoutError(boundedTimeout);
            const failure = result.outcomes.find(outcome => outcome.kind === 'rejected');
            for (const flush of pending)
                pendingTockTutorRouteFlushes.delete(flush);
            if (failure?.kind === 'rejected')
                throw failure.error;
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
        }
    }
}
function sameVault(left, right) {
    return left !== null && left.id === right.id && left.generation === right.generation;
}
function protocolFileTarget(file) {
    const marker = file.indexOf('#');
    const path = marker < 0 ? file : file.slice(0, marker);
    const fragment = marker < 0 ? undefined : file.slice(marker);
    if (!isSafeVaultRelativePath(path) || (fragment !== undefined && (fragment.length < 2 || fragment.length > 512)))
        return null;
    return fragment === undefined ? { path } : { fragment, path };
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
function targetLine(source, fragment) {
    const block = fragment.startsWith('#^') ? fragment.slice(2) : '';
    const heading = fragment.startsWith('#') && !fragment.startsWith('#^') ? fragment.slice(1).trim() : '';
    const lines = source.split(/\n/u);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].replace(/\r$/u, '');
        if (block !== '' && new RegExp(`(?:^|\\s)\\^${escapeRegex(block)}(?:$|\\s)`, 'u').test(line))
            return index + 1;
        if (heading !== '' && new RegExp(`^#{1,6}\\s+${escapeRegex(heading)}\\s*$`, 'iu').test(line))
            return index + 1;
    }
    return null;
}
function validActiveVault(value) {
    if (!Number.isSafeInteger(value?.generation) || value.generation < 0)
        return false;
    if (value.vault === null)
        return value.name === null && value.displayPath === null;
    return value.vault.generation === value.generation
        && typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 255
        && typeof value.displayPath === 'string' && value.displayPath.length > 0 && value.displayPath.length <= 32_768;
}
function validTreeEntry(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const entry = value;
    return typeof entry.path === 'string'
        && entry.path.length > 0
        && entry.path.length <= MAX_TREE_CURSOR_LENGTH
        && isSafeVaultRelativePath(entry.path)
        && (entry.kind === 'directory' || entry.kind === 'document' || entry.kind === 'attachment');
}
function validTreePage(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const page = value;
    if (!Number.isSafeInteger(page.generation) || page.generation < 0
        || typeof page.complete !== 'boolean'
        || typeof page.truncated !== 'boolean'
        || page.complete !== !page.truncated
        || !Array.isArray(page.entries) || page.entries.length > TREE_LIMIT
        || !page.entries.every(entry => validTreeEntry(entry))
        || typeof page.scan !== 'object' || page.scan === null
        || !Number.isSafeInteger(page.scan.entries) || page.scan.entries < 0
        || !Array.isArray(page.warnings) || page.warnings.length > 100
        || !page.warnings.every(warning => typeof warning === 'string' && warning.length <= MAX_TREE_CURSOR_LENGTH))
        return false;
    if (page.cursor !== null && (typeof page.cursor !== 'string' || page.cursor.length === 0 || page.cursor.length > MAX_TREE_CURSOR_LENGTH))
        return false;
    if (page.truncated !== (page.truncationReason !== null))
        return false;
    if (page.complete && page.cursor !== null)
        return false;
    if (!page.complete && page.truncationReason === 'result-limit' && page.cursor === null)
        return false;
    return page.truncationReason === null
        || page.truncationReason === 'depth-limit'
        || page.truncationReason === 'entry-limit'
        || page.truncationReason === 'result-limit';
}
// CodeMirror normalizes line endings; route selections address the authored source.
function authoredSourceOffset(source, offset) {
    let position = offset;
    for (const match of source.matchAll(/\r\n/gu)) {
        if (match.index >= position)
            break;
        position += 1;
    }
    return position;
}
function recentSearchMatches(entries) {
    return Object.freeze(entries
        .filter((entry) => entry.kind === 'document' && /\.(?:markdown|md)$/iu.test(entry.path))
        .toSorted((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path))
        .slice(0, 100)
        .map(entry => ({ kind: 'path', line: null, path: entry.path, preview: 'Recently modified note.' })));
}
function compareSearchMatches(left, right) {
    return (right.score ?? 0) - (left.score ?? 0)
        || left.path.localeCompare(right.path)
        || (left.line ?? -1) - (right.line ?? -1)
        || (left.lineEnd ?? -1) - (right.lineEnd ?? -1)
        || left.kind.localeCompare(right.kind)
        || (left.operator ?? '').localeCompare(right.operator ?? '')
        || (left.provenance ?? '').localeCompare(right.provenance ?? '')
        || left.preview.localeCompare(right.preview)
        || (left.revision ?? '').localeCompare(right.revision ?? '');
}
function validSearchResult(value, vault) {
    const ids = new Set();
    return value?.generation === vault.generation
        && typeof value.query === 'string'
        && (value.cursor === null || typeof value.cursor === 'string')
        && (value.cursor === null || value.cursor.length > 0 && value.cursor.length <= 4_096)
        && Array.isArray(value.matches)
        && value.matches.length <= 100
        && value.matches.every(match => isSafeVaultRelativePath(match.path)
            && (match.id === undefined || typeof match.id === 'string' && match.id.length > 0 && match.id.length <= 128 && !ids.has(match.id) && (ids.add(match.id), true))
            && (match.revision === undefined || typeof match.revision === 'string' && match.revision.length > 0 && match.revision.length <= 4_096)
            && typeof match.preview === 'string'
            && match.preview.length <= 4_096
            && (match.line === null || Number.isSafeInteger(match.line) && match.line >= 1)
            && (match.lineEnd === undefined || match.lineEnd === null || Number.isSafeInteger(match.lineEnd) && match.lineEnd >= 1)
            && (match.line === null || match.lineEnd === undefined || match.lineEnd === null || match.lineEnd >= match.line)
            && (match.score === undefined || Number.isFinite(match.score)));
}
function validEntryRevision(value) {
    return typeof value === 'string' && /^(?:entry|file):[0-9a-f]{64}$/u.test(value);
}
function validTrashEntryInfo(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const entry = value;
    return Number.isSafeInteger(entry.createdAt)
        && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 255
        && (entry.kind === 'attachment' || entry.kind === 'document' || entry.kind === 'folder')
        && typeof entry.originalPath === 'string'
        && isSafeVaultRelativePath(entry.originalPath);
}
function validTrashMutationResult(value, vault, originalPath) {
    if (!validTrashEntryInfo(value) || typeof value !== 'object' || value === null)
        return false;
    const result = value;
    return result.generation === vault.generation
        && result.originalPath === originalPath
        && validEntryRevision(result.revision)
        && result.status === 'trashed';
}
function validRestoreTrashResult(value, vault, entry) {
    if (!validTrashEntryInfo(value) || typeof value !== 'object' || value === null)
        return false;
    const result = value;
    return result.generation === vault.generation
        && result.id === entry.id
        && result.kind === entry.kind
        && result.originalPath === entry.originalPath
        && result.path === entry.originalPath
        && validEntryRevision(result.revision)
        && result.status === 'restored';
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
function embedTargetSources(source, sourcePath) {
    try {
        return Object.freeze(collectEmbedTargets(source, sourcePath).map(target => target.source));
    }
    catch {
        return Object.freeze([]);
    }
}
function sameStrings(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
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
        mode: 'live-preview',
        organizationProposal: null,
        path: null,
        phase: 'loading',
        recentlyClosed: Object.freeze([]),
        recoveryOpen: false,
        revision: null,
        saveStatus: 'saved',
        searchActiveIndex: null,
        searchAnswer: { status: 'idle', answer: '', citations: [] },
        searchError: null,
        searchIntelligenceStatus: null,
        searchIntelligenceProvider: null,
        searchIntelligenceModel: null,
        searchLoading: false,
        searchMatches: Object.freeze([]),
        searchMode: 'query',
        searchPreview: null,
        searchPreviewError: null,
        searchPreviewLoading: false,
        searchCursor: null,
        searchTitleOnly: false,
        searchDirectory: '',
        searchModifiedFrom: null,
        searchModifiedTo: null,
        searchOpen: false,
        searchQuery: '',
        selectedSnapshot: null,
        selectionEnd: 0,
        selectionRequest: null,
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
        vaultDisplayPath: null,
        vaultName: null,
        warnings: Object.freeze([]),
        workspaces: Object.freeze([]),
    });
}
/** Bounded route state machine shared by the React contribution and focused tests. */
const DOCUMENT_FIELDS = ['source', 'revision', 'saveStatus', 'documentKind', 'documentUnavailable', 'draftRecovered', 'embeds', 'links', 'linksLoading', 'outline', 'baseFiles', 'message'];
const VIEW_FIELDS = ['mode', 'selectionStart', 'selectionEnd', 'selectionRequest', 'editorReset', 'localEditRevision'];
export class WorkbenchRouteController {
    remote;
    navigate;
    now;
    storage;
    snapshot = initialSnapshot();
    documents = new Map();
    documentLoads = new Map();
    documentSelections = new Map();
    linkedLoads = new Map();
    paneViews = new Map();
    paneLifetimes = new Map();
    paneLifetime = 0;
    listeners = new Set();
    disposal = null;
    vaultGeneration = 0;
    shellSession = createWorkbenchSession(ROUTE_PREFIX, null, 'pane-1');
    recentlyClosed = [];
    historyBack = [];
    historyForward = [];
    bookmarks = [];
    workspaces = [];
    operation = 0;
    recoveryOperation = 0;
    recoveryAbort = null;
    embedTargets = Object.freeze([]);
    selectionRequestId = 0;
    treeComplete = false;
    treeAbort = null;
    treeGeneration = 0;
    dispatchRevision = 0;
    operationAbort = null;
    mergeReviewAbort = null;
    pendingMerge = null;
    sidebarSearchAbort = null;
    sidebarSearchOperation = 0;
    searchTimer = null;
    searchPreviewAbort = null;
    searchPreviewOperation = 0;
    eventDispose = null;
    pendingDispatch = null;
    pendingRename = null;
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
        if (request.action === 'choose-vault' || request.vault !== undefined || request.clipboard === true || request.paneType === 'window')
            return 'failed';
        if (request.vaultId !== undefined
            && (!/^vault:[0-9a-f]{64}$/u.test(request.vaultId)
                || request.vaultGeneration !== vault.generation
                || request.vaultId !== vault.id))
            return 'stale';
        if (request.action === 'search') {
            if (request.query !== undefined && request.query.length > 1_000)
                return 'failed';
            this.openSearch(request.query ?? '');
            return 'handled';
        }
        if (request.paneType === 'split' && !await this.prepareDispatchPane())
            return 'failed';
        if (request.action === 'open') {
            if (request.file === undefined) {
                if (this.snapshot.saveStatus !== 'saved' && !await this.save())
                    return 'failed';
                if (!this.dispatchCurrent(revision, vault))
                    return 'stale';
                this.navigate(ROUTE_PREFIX);
                return 'handled';
            }
            const target = protocolFileTarget(request.file);
            if (target === null)
                return 'failed';
            const opened = await this.select(target.path, true, revision);
            if (!this.dispatchCurrent(revision, vault))
                return 'stale';
            if (!opened)
                return 'failed';
            if (target.fragment !== undefined) {
                const line = targetLine(this.snapshot.source, target.fragment);
                if (line !== null)
                    this.jumpToLine(line);
            }
            return 'handled';
        }
        if (request.action === 'daily') {
            const journal = buildJournalNote({
                folder: this.snapshot.settings?.journalFolder ?? 'Journals',
                now: this.now(),
            });
            const path = journal.path;
            const exists = this.snapshot.path === path || this.snapshot.entries.some(entry => entry.path === path);
            if (exists && request.ifExists === undefined) {
                if (request.content !== undefined)
                    return 'failed';
                if (request.silent === true)
                    return 'handled';
                const opened = await this.select(path, true, revision);
                if (!this.dispatchCurrent(revision, vault))
                    return 'stale';
                return opened ? 'handled' : 'failed';
            }
            return await this.createDispatchedDocument(path, request.content ?? journal.content, request.silent === true, revision, vault, request.ifExists);
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
        return await this.createDispatchedDocument(path, request.content ?? '', request.silent === true, revision, vault, request.ifExists);
    }
    async prepareDispatchPane() {
        if (this.snapshot.panes.length >= MAX_PANE_GROUPS)
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        const used = new Set(this.snapshot.panes.map(pane => pane.id));
        const id = Array.from({ length: MAX_PANE_GROUPS }, (_, index) => `pane-${String(index + 1)}`)
            .find(candidate => !used.has(candidate));
        if (id === undefined)
            return false;
        this.shellSession = addPaneGroup(this.shellSession, id).session;
        this.syncShell();
        return true;
    }
    async createDispatchedDocument(path, content, silent, revision, vault, ifExists) {
        if (!isSafeVaultRelativePath(path) || !/\.md$/iu.test(path) || !boundedSource(content))
            return 'failed';
        const previousPath = this.snapshot.path;
        const recoveryWasOpen = this.snapshot.recoveryOpen === true;
        if (recoveryWasOpen) {
            this.cancelRecoveryOperations();
            this.update({ selectedSnapshot: null, snapshots: Object.freeze([]) });
        }
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return 'failed';
        if (!this.dispatchCurrent(revision, vault))
            return 'stale';
        const failureFallback = `${path} could not be ${ifExists === undefined ? 'created' : 'updated'}.`;
        try {
            let result;
            let operation = 'created';
            if (ifExists !== undefined) {
                const existingResult = await this.remote.tocktutorWorkbench.openDocument(path, vault);
                let existing = null;
                try {
                    existing = remoteValue(existingResult);
                }
                catch (error) {
                    if (!(error instanceof RemoteCallError) || error.code !== 'not-found')
                        throw error;
                }
                if (existing !== null) {
                    if (existing.generation !== vault.generation || existing.path !== path)
                        return 'stale';
                    const merged = ifExists === 'overwrite' ? content
                        : content === '' ? existing.content
                            : ifExists === 'prepend' ? `${content}${content.endsWith('\n') || existing.content.startsWith('\n') ? '' : '\n'}${existing.content}`
                                : `${existing.content}${existing.content.endsWith('\n') || content.startsWith('\n') ? '' : '\n'}${content}`;
                    if (!boundedSource(merged))
                        return 'failed';
                    result = remoteValue(await this.remote.tocktutorWorkbench.saveDocument({
                        content: merged,
                        expectedRevision: existing.revision,
                        expectedVault: vault,
                        path,
                    }));
                    operation = 'updated';
                    content = merged;
                }
                else {
                    result = remoteValue(await this.remote.tocktutorWorkbench.createDocument({ content, expectedVault: vault, path }));
                }
            }
            else {
                result = remoteValue(await this.remote.tocktutorWorkbench.createDocument({ content, expectedVault: vault, path }));
            }
            if (!this.dispatchCurrent(revision, vault))
                return 'stale';
            if (result.generation !== vault.generation || result.path !== path
                || (operation === 'created' ? result.status !== 'created' : result.status !== 'saved'))
                return 'failed';
            // Keep the bounded tree snapshot in sync before recording the new tab. Workspace
            // restore filters persisted tabs against this snapshot, so a just-created note
            // must be visible before another pane or workspace can capture it.
            if (!await this.refreshTree(vault))
                return this.dispatchCurrent(revision, vault) ? 'failed' : 'stale';
            if (!this.dispatchCurrent(revision, vault))
                return 'stale';
            if (silent)
                return 'handled';
            this.update({
                documentKind: 'markdown',
                message: `${path} ${operation}.`,
                mode: this.snapshot.settings?.defaultEditingMode ?? 'live-preview',
                path,
                revision: result.revision,
                saveStatus: 'saved',
                source: content,
            });
            this.recordOpen(path, true, previousPath);
            this.navigate(routeForPath(path));
            if (recoveryWasOpen)
                void this.setRecoveryOpen(true);
            return 'handled';
        }
        catch (error) {
            if (this.dispatchCurrent(revision, vault) && !this.operationAbort?.signal.aborted) {
                this.update({ message: this.failureMessage(error, failureFallback) });
            }
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
    searchMatchIndex(match) {
        return (this.snapshot.searchMatches ?? []).findIndex(candidate => candidate.id !== undefined && match.id !== undefined
            ? candidate.id === match.id
            : candidate.path === match.path
                && candidate.kind === match.kind
                && candidate.line === match.line
                && candidate.preview === match.preview);
    }
    setSearchActiveIndex(index) {
        const matches = this.snapshot.searchMatches ?? [];
        if (!Number.isSafeInteger(index) || index < 0 || index >= matches.length)
            return false;
        this.cancelSearchPreview();
        this.update({ searchActiveIndex: index, searchPreview: null, searchPreviewError: null, searchPreviewLoading: false });
        void this.previewSearchMatch(index);
        return true;
    }
    moveSearchActive(delta) {
        const matches = this.snapshot.searchMatches ?? [];
        if (matches.length === 0 || !Number.isSafeInteger(delta) || delta === 0)
            return false;
        const current = this.snapshot.searchActiveIndex ?? 0;
        const next = (current + delta % matches.length + matches.length) % matches.length;
        return this.setSearchActiveIndex(next);
    }
    async openSearchMatch(match, newTab = false) {
        const index = this.searchMatchIndex(match);
        if (index < 0 || !validSearchResult({
            cursor: null,
            generation: this.snapshot.vault?.generation ?? -1,
            matches: [match],
            query: this.snapshot.searchQuery.trim(),
            scan: { bytes: 0, entries: 0, files: 0 },
            truncated: false,
            truncationReason: null,
            warnings: [],
        }, this.snapshot.vault ?? { generation: -1, id: '' }))
            return false;
        this.cancelSearchPreview();
        this.update({ searchActiveIndex: index, searchPreview: null, searchPreviewLoading: false });
        const opened = await this.select(match.path, true, undefined, true, newTab);
        if (!opened)
            return false;
        if (match.line !== null)
            this.jumpToMatch(match.line, match.lineEnd ?? match.line);
        return true;
    }
    async previewSearchMatch(matchOrIndex) {
        const index = typeof matchOrIndex === 'number'
            ? matchOrIndex
            : this.searchMatchIndex(matchOrIndex);
        const match = this.snapshot.searchMatches?.[index];
        const vault = this.snapshot.vault;
        if (match === undefined || vault === null || !this.snapshot.searchOpen)
            return false;
        this.update({ searchActiveIndex: index, searchPreview: null, searchPreviewError: null, searchPreviewLoading: true });
        const operation = this.nextSearchPreviewOperation();
        try {
            const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(match.path, vault, operation.signal));
            if (!this.currentSearchPreview(operation.id, vault, match.path))
                return false;
            if (opened.generation !== vault.generation
                || opened.path !== match.path
                || (match.revision !== undefined && opened.revision !== match.revision)
                || typeof opened.revision !== 'string'
                || !boundedSource(opened.content)) {
                this.update({ searchPreviewError: 'Preview is no longer current.', searchPreviewLoading: false });
                return false;
            }
            this.update({
                searchPreview: Object.freeze({
                    content: opened.content,
                    generation: opened.generation,
                    line: match.line,
                    lineEnd: match.lineEnd ?? match.line,
                    path: opened.path,
                    revision: opened.revision,
                }),
                searchPreviewError: null,
                searchPreviewLoading: false,
            });
            return true;
        }
        catch {
            if (this.currentSearchPreview(operation.id, vault, match.path)) {
                this.update({ searchPreviewError: 'Preview could not be loaded.', searchPreviewLoading: false });
            }
            return false;
        }
    }
    hideSearchPreview() {
        this.cancelSearchPreview();
        this.update({ searchPreview: null, searchPreviewError: null, searchPreviewLoading: false });
    }
    setSearchQuery(query) {
        if (query.length > 1_000)
            return;
        this.nextSearchRequest();
        const trimmed = query.trim();
        this.update({
            searchActiveIndex: null,
            searchAnswer: { status: 'idle', answer: '', citations: [] },
            searchError: null,
            searchIntelligenceStatus: null,
            searchLoading: trimmed !== '' && this.snapshot.vault !== null,
            searchMatches: trimmed === '' ? recentSearchMatches(this.snapshot.entries) : Object.freeze([]),
            searchCursor: null,
            searchPreview: null,
            searchPreviewError: null,
            searchPreviewLoading: false,
            searchQuery: query,
        });
        this.scheduleSearch();
    }
    async loadRecentSearch(vault) {
        const operation = this.nextOperation();
        const treeGeneration = this.treeGeneration;
        const initialEntries = this.snapshot.entries;
        const entriesByPath = new Map(initialEntries.map(entry => [entry.path, entry]));
        const cursors = new Set();
        let cursor = null;
        try {
            for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
                const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
                    expectedVault: vault,
                    limit: 200,
                    ...(cursor === null ? {} : { cursor }),
                }, operation.signal));
                if (!this.current(operation.id, vault) || treeGeneration !== this.treeGeneration || page.generation !== vault.generation)
                    return;
                if (this.snapshot.entries !== initialEntries)
                    break;
                for (const entry of page.entries)
                    entriesByPath.set(entry.path, entry);
                if (page.cursor === null)
                    break;
                if (cursors.has(page.cursor))
                    return;
                cursors.add(page.cursor);
                cursor = page.cursor;
            }
            if (this.current(operation.id, vault) && treeGeneration === this.treeGeneration && this.snapshot.searchOpen && this.snapshot.searchQuery.trim() === '') {
                // A tree already pending when search began can publish without changing its generation.
                const nextEntries = this.snapshot.entries === initialEntries
                    ? Object.freeze([...entriesByPath.values()])
                    : this.snapshot.entries;
                this.update({ entries: nextEntries, searchMatches: recentSearchMatches(nextEntries) });
            }
        }
        catch {
            // The initial bounded tree page remains a valid recent-notes fallback.
        }
    }
    closeSearch() {
        this.nextSearchRequest();
        this.update({ searchActiveIndex: null, searchAnswer: { status: 'idle', answer: '', citations: [] }, searchDirectory: '', searchIntelligenceStatus: null, searchLoading: false, searchMatches: Object.freeze([]), searchCursor: null, searchModifiedFrom: null, searchModifiedTo: null, searchOpen: false, searchPreview: null, searchPreviewError: null, searchPreviewLoading: false, searchQuery: '', searchTitleOnly: false });
    }
    openSidebarSearch() {
        if (this.snapshot.searchOpen && this.snapshot.searchPresentation === 'sidebar')
            return;
        this.update({ searchMode: 'query', searchDirectory: '', searchModifiedFrom: null, searchModifiedTo: null, searchTitleOnly: false });
        this.openSearch(this.snapshot.searchQuery, 'sidebar');
    }
    openSearch(query, presentation = 'dialog') {
        if (query.length > 1_000)
            return;
        if (presentation === 'sidebar' && this.snapshot.searchOpen && this.snapshot.searchPresentation !== 'sidebar')
            this.nextOperation();
        this.update({ searchPresentation: presentation });
        this.nextSearchRequest();
        const trimmed = query.trim();
        this.update({
            searchActiveIndex: null,
            searchAnswer: { status: 'idle', answer: '', citations: [] },
            searchError: null,
            searchIntelligenceStatus: null,
            searchLoading: trimmed !== '' && this.snapshot.vault !== null,
            searchMatches: trimmed === '' ? recentSearchMatches(this.snapshot.entries) : Object.freeze([]),
            searchCursor: null,
            searchOpen: true,
            searchPresentation: presentation,
            searchPreview: null,
            searchPreviewError: null,
            searchPreviewLoading: false,
            searchQuery: query,
        });
        if (trimmed === '' && this.snapshot.vault !== null && presentation === 'dialog')
            void this.loadRecentSearch(this.snapshot.vault);
        else
            this.scheduleSearch();
    }
    setSearchMode(mode) {
        this.nextOperation();
        const trimmed = this.snapshot.searchQuery.trim();
        this.update({
            searchActiveIndex: null,
            searchAnswer: { status: 'idle', answer: '', citations: [] },
            searchError: null,
            searchIntelligenceStatus: null,
            searchLoading: trimmed !== '' && this.snapshot.vault !== null,
            searchMatches: trimmed === '' ? recentSearchMatches(this.snapshot.entries) : Object.freeze([]),
            searchCursor: null,
            searchMode: mode,
            searchPreview: null,
            searchPreviewError: null,
            searchPreviewLoading: false,
        });
        this.scheduleSearch();
    }
    setSearchFilters(filters) {
        this.nextOperation();
        const trimmed = this.snapshot.searchQuery.trim();
        this.update({
            searchActiveIndex: null,
            searchAnswer: { status: 'idle', answer: '', citations: [] },
            searchDirectory: filters.directory ?? '',
            searchError: null,
            searchIntelligenceStatus: null,
            searchLoading: trimmed !== '' && this.snapshot.vault !== null,
            searchMatches: trimmed === '' ? recentSearchMatches(this.snapshot.entries) : Object.freeze([]),
            searchCursor: null,
            searchModifiedFrom: filters.modifiedFrom ?? null,
            searchModifiedTo: filters.modifiedTo ?? null,
            searchPreview: null,
            searchPreviewError: null,
            searchPreviewLoading: false,
            searchTitleOnly: filters.titleOnly === true,
        });
        this.scheduleSearch();
    }
    scheduleSearch() {
        if (this.searchTimer !== null)
            clearTimeout(this.searchTimer);
        this.searchTimer = null;
        if (this.snapshot.searchQuery.trim() === '' || this.snapshot.vault === null || !this.snapshot.searchOpen)
            return;
        const query = this.snapshot.searchQuery.trim();
        this.searchTimer = setTimeout(() => {
            this.searchTimer = null;
            if (this.snapshot.searchOpen && this.snapshot.searchQuery.trim() === query)
                void this.runSearch();
        }, 200);
    }
    async runSearch() {
        if (this.searchTimer !== null)
            clearTimeout(this.searchTimer);
        this.searchTimer = null;
        const vault = this.snapshot.vault;
        const query = this.snapshot.searchQuery.trim();
        if (vault === null || query.length === 0 || query.length > 1_000) {
            this.update({ searchError: null, searchLoading: false, searchMatches: query.length === 0 ? recentSearchMatches(this.snapshot.entries) : Object.freeze([]) });
            return false;
        }
        const mode = this.snapshot.searchMode ?? 'query';
        const operation = this.nextSearchRequest();
        this.update({ searchAnswer: { status: 'idle', answer: '', citations: [] }, searchError: null, searchIntelligenceStatus: null, searchLoading: true, searchMatches: Object.freeze([]) });
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.search({
                ...(this.snapshot.searchDirectory === undefined || this.snapshot.searchDirectory === '' ? {} : { directory: this.snapshot.searchDirectory }),
                ...(this.snapshot.searchModifiedFrom === undefined || this.snapshot.searchModifiedFrom === null ? {} : { modifiedFrom: this.snapshot.searchModifiedFrom }),
                ...(this.snapshot.searchModifiedTo === undefined || this.snapshot.searchModifiedTo === null ? {} : { modifiedTo: this.snapshot.searchModifiedTo }),
                ...(this.snapshot.searchTitleOnly === true ? { titleOnly: true } : {}),
                expectedVault: vault,
                limit: 100,
                mode,
                query,
            }, operation.signal));
            if (!this.currentSearchRequest(operation, vault))
                return false;
            if (!validSearchResult(result, vault) || result.query !== query) {
                this.update({ message: 'Search returned an invalid result.', searchError: 'Search returned an invalid result.', searchLoading: false });
                return false;
            }
            const matches = Object.freeze(result.matches.map(match => Object.freeze({ ...match })));
            this.update({
                message: result.truncated ? 'Search returned a bounded partial result.' : `${String(result.matches.length)} search results.`,
                searchActiveIndex: matches.length > 0 ? 0 : null,
                searchError: null,
                searchIntelligenceStatus: null,
                searchLoading: false,
                searchMatches: matches,
                searchPreview: null,
                searchPreviewError: null,
                searchPreviewLoading: false,
                searchCursor: result.cursor,
            });
            if (this.snapshot.searchPresentation === 'sidebar')
                return true;
            await this.enhanceSearch(operation, vault, query, mode);
            if (!this.currentSearchRequest(operation, vault))
                return false;
            const enhancedMatches = this.snapshot.searchMatches ?? matches;
            if (enhancedMatches.length > 0 && this.snapshot.searchActiveIndex === null)
                void this.previewSearchMatch(0);
            else if (matches.length > 0 && this.snapshot.searchPreview === null)
                void this.previewSearchMatch(0);
            return true;
        }
        catch {
            if (this.currentSearchRequest(operation, vault) && !operation.signal.aborted) {
                this.update({ message: 'Search could not be completed.', searchError: 'Search could not be completed.', searchLoading: false });
            }
            return false;
        }
    }
    async enhanceSearch(operation, vault, query, mode) {
        const intelligence = this.remote.tocktutorAssistant;
        if (intelligence?.searchIntelligence === undefined)
            return;
        let automatic = false;
        if (intelligence.currentSettings !== undefined) {
            try {
                const settings = remoteValue(await intelligence.currentSettings(operation.signal));
                automatic = settings.aiSearch === 'automatic';
                this.update({ searchIntelligenceProvider: settings.provider, searchIntelligenceModel: settings.model });
            }
            catch {
                return;
            }
        }
        if (mode !== 'related' && !automatic)
            return;
        const localMatches = this.snapshot.searchMatches ?? [];
        try {
            const result = remoteValue(await intelligence.searchIntelligence({
                query,
                vaultGeneration: vault.generation,
                mode: 'related',
                ...(this.snapshot.searchDirectory ? { directory: this.snapshot.searchDirectory } : {}),
                ...(this.snapshot.searchModifiedFrom == null ? {} : { modifiedFrom: this.snapshot.searchModifiedFrom }),
                ...(this.snapshot.searchModifiedTo == null ? {} : { modifiedTo: this.snapshot.searchModifiedTo }),
                ...(this.snapshot.searchTitleOnly ? { titleOnly: true } : {}),
            }, operation.signal));
            if (!this.current(operation.id, vault))
                return;
            this.update({ searchIntelligenceStatus: result.status });
            if (result.status === 'applied' && result.matches.length > 0 && validSearchResult({
                cursor: null,
                generation: vault.generation,
                matches: result.matches,
                query,
                scan: { bytes: 0, entries: 0, files: 0 },
                truncated: false,
                truncationReason: null,
                warnings: [],
            }, vault)) {
                const merged = new Map();
                for (const match of [...localMatches, ...result.matches]) {
                    const identity = JSON.stringify([
                        match.path,
                        match.kind,
                        match.line,
                        match.lineEnd ?? null,
                        match.operator ?? null,
                        match.preview,
                        match.provenance ?? null,
                        match.revision ?? null,
                    ]);
                    const previous = merged.get(identity);
                    if (previous === undefined || (match.score ?? 0) > (previous.score ?? 0))
                        merged.set(identity, match);
                }
                const matches = Object.freeze([...merged.values()]
                    .toSorted(compareSearchMatches)
                    .map(match => Object.freeze({ ...match })));
                this.update({
                    message: `${String(matches.length)} related search results.`,
                    searchActiveIndex: matches.length > 0 ? 0 : null,
                    searchMatches: matches,
                });
            }
        }
        catch {
            if (this.current(operation.id, vault) && !operation.signal.aborted)
                this.update({ searchIntelligenceStatus: 'error' });
        }
    }
    async runQuickAnswer() {
        const intelligence = this.remote.tocktutorAssistant;
        const vault = this.snapshot.vault;
        const query = this.snapshot.searchQuery.trim();
        if (intelligence?.quickAnswer === undefined || vault === null || query === '' || !this.snapshot.searchOpen) {
            this.update({ searchAnswer: { status: intelligence?.quickAnswer === undefined ? 'unavailable' : 'no-evidence', answer: '', citations: [] } });
            return false;
        }
        const mode = this.snapshot.searchMode ?? 'query';
        const matches = (this.snapshot.searchMatches ?? []).slice(0, 20);
        if (matches.length === 0) {
            this.update({ searchAnswer: { status: 'no-evidence', answer: '', citations: [] } });
            return false;
        }
        const operation = this.nextOperation();
        const candidates = matches.map((match, index) => ({
            id: `qa-${String(index + 1)}`,
            ...(match.revision === undefined ? {} : { revision: match.revision }),
            path: match.path,
            line: match.line,
            ...(match.lineEnd === undefined ? {} : { lineEnd: match.lineEnd }),
            preview: match.preview,
        }));
        this.update({ searchAnswer: { status: 'thinking', answer: '', citations: [] } });
        try {
            const result = remoteValue(await intelligence.quickAnswer({
                mode,
                query,
                vaultGeneration: vault.generation,
                ...(this.snapshot.searchDirectory ? { directory: this.snapshot.searchDirectory } : {}),
                ...(this.snapshot.searchModifiedFrom == null ? {} : { modifiedFrom: this.snapshot.searchModifiedFrom }),
                ...(this.snapshot.searchModifiedTo == null ? {} : { modifiedTo: this.snapshot.searchModifiedTo }),
                ...(this.snapshot.searchTitleOnly ? { titleOnly: true } : {}),
                candidates,
            }, operation.signal));
            if (!this.current(operation.id, vault))
                return false;
            const status = result.status === 'provider-unavailable' || result.status === 'disabled' ? 'unavailable' : result.status;
            this.update({ searchAnswer: { status, answer: result.answer, citations: result.citations } });
            return result.status === 'completed';
        }
        catch {
            if (this.current(operation.id, vault) && !operation.signal.aborted)
                this.update({ searchAnswer: { status: 'error', answer: '', citations: [] } });
            return false;
        }
    }
    cancelQuickAnswer() {
        if (this.snapshot.searchAnswer?.status !== 'thinking')
            return;
        this.nextOperation();
        this.update({ searchAnswer: { status: 'cancelled', answer: '', citations: [] } });
    }
    retryQuickAnswer() {
        return this.runQuickAnswer();
    }
    async loadMoreSearch() {
        const vault = this.snapshot.vault;
        const cursor = this.snapshot.searchCursor;
        const query = this.snapshot.searchQuery.trim();
        if (vault === null || cursor === null || query.length === 0)
            return false;
        const mode = this.snapshot.searchMode ?? 'query';
        const operation = this.nextSearchRequest();
        this.update({ searchError: null, searchLoading: true });
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.search({
                ...(cursor === null ? {} : { cursor }),
                ...(this.snapshot.searchDirectory === undefined || this.snapshot.searchDirectory === '' ? {} : { directory: this.snapshot.searchDirectory }),
                ...(this.snapshot.searchModifiedFrom === undefined || this.snapshot.searchModifiedFrom === null ? {} : { modifiedFrom: this.snapshot.searchModifiedFrom }),
                ...(this.snapshot.searchModifiedTo === undefined || this.snapshot.searchModifiedTo === null ? {} : { modifiedTo: this.snapshot.searchModifiedTo }),
                ...(this.snapshot.searchTitleOnly === true ? { titleOnly: true } : {}),
                expectedVault: vault,
                limit: 100,
                mode,
                query,
            }, operation.signal));
            if (!this.currentSearchRequest(operation, vault) || operation.signal.aborted)
                return false;
            if (!validSearchResult(result, vault) || result.query !== query || result.cursor === cursor) {
                this.update({ message: 'Search returned an invalid result.', searchError: 'Search returned an invalid result.', searchLoading: false });
                return false;
            }
            const existing = this.snapshot.searchMatches ?? [];
            const seen = new Set(existing.map(match => match.id ?? `${match.path}:${match.kind}:${String(match.line)}:${match.preview}`));
            const additions = result.matches.filter(match => {
                const id = match.id ?? `${match.path}:${match.kind}:${String(match.line)}:${match.preview}`;
                if (seen.has(id))
                    return false;
                seen.add(id);
                return true;
            });
            this.update({
                message: result.truncated ? 'Search returned a bounded partial result.' : `${String(existing.length + additions.length)} search results.`,
                searchActiveIndex: this.snapshot.searchActiveIndex ?? (existing.length + additions.length > 0 ? 0 : null),
                searchError: null,
                searchLoading: false,
                searchMatches: Object.freeze([...existing, ...additions].map(match => Object.freeze({ ...match }))),
                searchCursor: result.cursor,
            });
            return true;
        }
        catch {
            if (this.currentSearchRequest(operation, vault) && !operation.signal.aborted) {
                this.update({ message: 'Search could not be completed.', searchError: 'Search could not be completed.', searchLoading: false });
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
                ...(mode === 'local'
                    ? { depth: this.snapshot.settings?.graphDepth ?? 2, direction: 'both', path: this.snapshot.path, scope: 'local' }
                    : {
                        includeAttachments: this.snapshot.settings?.graphIncludeAttachments ?? false,
                        includeTags: this.snapshot.settings?.graphIncludeTags ?? false,
                        limit: 180,
                        scope: 'global',
                    }),
                expectedVault: vault,
            }, operation.signal));
            if (!this.current(operation.id, vault)
                || graph.generation !== vault.generation
                || !Array.isArray(graph.nodes)
                || !Array.isArray(graph.edges))
                return false;
            const projected = projectGraph(graph, { includeOrphans: this.snapshot.settings?.graphIncludeOrphans ?? true, query: '' });
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
    async openGraphNode(path, mode) {
        if (!await this.select(path))
            return false;
        return mode === 'note' ? true : await this.loadGraph('local');
    }
    async openInternalLink(target) {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.snapshot.documentKind !== 'markdown'
            || target.length === 0 || target.length > 4_096 || /[\u0000-\u001f\u007f]/u.test(target))
            return null;
        let links = this.snapshot.links;
        if (links === null || links === undefined || links.path !== path || links.generation !== vault.generation) {
            if (!await this.loadRelationships())
                return null;
            links = this.snapshot.links;
        }
        if (links === null || links === undefined)
            return null;
        const record = links.outgoingDetails.find(candidate => candidate.kind === 'wiki' && candidate.authoredTarget === target);
        if (record?.status !== 'resolved' || record.resolvedPath === null)
            return null;
        if (!await this.select(record.resolvedPath))
            return null;
        this.setMode('reading');
        return { fragment: record.fragment };
    }
    async openSmartView(kind) {
        this.openSearch('');
        if (kind === 'recent') {
            this.update({ searchMatches: recentSearchMatches(this.snapshot.entries) });
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
    documentCurrent(document, epoch = document.epoch) {
        return !this.disposed && sameVault(this.snapshot.vault, document.vault)
            && this.documents.get(document.key) === document && document.epoch === epoch;
    }
    publishDocument(document, change) {
        if (!this.documentCurrent(document))
            return;
        document.state = { ...document.state, ...change };
        if (this.activeDocument() === document)
            this.update(change);
        else
            this.update({});
    }
    hydrateDocument(document) {
        const epoch = document.epoch;
        const revision = document.state.revision;
        if (!this.documentCurrent(document) || (document.hydratedEpoch === epoch && document.hydratedRevision === revision))
            return Promise.resolve();
        if (document.hydration?.epoch === epoch && document.hydration.revision === revision)
            return document.hydration.promise;
        const promise = Promise.all(document.state.documentKind === 'markdown'
            ? [this.loadRelationships(document), this.loadEmbeds(document)]
            : document.state.documentKind === 'base' ? [this.hydrateBaseRows(document.path)] : []).then(results => {
            if (document.hydration?.promise === promise && this.documentCurrent(document, epoch) && document.state.revision === revision && results.every(Boolean)) {
                document.hydratedEpoch = epoch;
                document.hydratedRevision = revision;
            }
        }).finally(() => { if (document.hydration?.promise === promise)
            document.hydration = undefined; });
        document.hydration = { epoch, revision, promise };
        return promise;
    }
    async loadRelationships(document = this.activeDocument()) {
        if (!document || document.state.documentKind !== 'markdown' || !this.documentCurrent(document))
            return false;
        const { vault, path, epoch } = document;
        const revision = document.state.revision;
        document.relationshipsAbort?.abort();
        const abort = new AbortController();
        document.relationshipsAbort = abort;
        this.publishDocument(document, { links: null, linksLoading: true, outline: null });
        try {
            const [outlineResult, linksResult] = await Promise.all([
                this.remote.tocktutorWorkbench.outline({ expectedVault: vault, includeFootnotes: true, path }, abort.signal),
                this.remote.tocktutorWorkbench.links({ expectedVault: vault, includeUnlinked: true, path }, abort.signal),
            ]);
            const outline = remoteValue(outlineResult);
            const links = remoteValue(linksResult);
            if (!this.documentCurrent(document, epoch) || document.state.revision !== revision || abort.signal.aborted
                || outline.generation !== vault.generation || links.generation !== vault.generation
                || outline.path !== path || links.path !== path || !Array.isArray(outline.headings)
                || !Array.isArray(links.backlinkDetails) || !Array.isArray(links.outgoingDetails))
                return false;
            this.publishDocument(document, { links, outline });
            return true;
        }
        catch {
            return false;
        }
        finally {
            if (document.relationshipsAbort === abort) {
                document.relationshipsAbort = undefined;
                this.publishDocument(document, { linksLoading: false });
            }
        }
    }
    jumpToMatch(line, lineEnd) {
        if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(lineEnd) || lineEnd < line || this.snapshot.path === null)
            return false;
        const lines = this.snapshot.source.replace(/\r\n?/gu, '\n').split('\n');
        if (line > lines.length)
            return false;
        const start = lines.slice(0, line - 1).reduce((offset, current) => offset + current.length + 1, 0);
        const endLine = Math.min(lineEnd, lines.length);
        const end = start + lines.slice(line - 1, endLine).reduce((offset, current, index) => offset + current.length + (index + line < endLine ? 1 : 0), 0);
        this.setMode('source');
        this.setSelection(authoredSourceOffset(this.snapshot.source, start), authoredSourceOffset(this.snapshot.source, end));
        this.update({ selectionRequest: Object.freeze({ from: start, id: this.selectionRequestId += 1, to: end }) });
        return true;
    }
    jumpToLine(line) {
        return this.jumpToMatch(line, line);
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
    documentKey(vault, path) {
        return JSON.stringify([vault.id, vault.generation, path]);
    }
    activeDocument() {
        const { vault, path } = this.snapshot;
        return vault && path ? this.documents.get(this.documentKey(vault, path)) : undefined;
    }
    update(change) {
        if (this.disposed)
            return;
        this.snapshot = Object.freeze({ ...this.snapshot, ...change });
        const { vault, path } = this.snapshot;
        if (vault && path && this.snapshot.revision !== null) {
            const key = this.documentKey(vault, path);
            let document = this.documents.get(key);
            if (!document) {
                document = { key, vault, path, state: {}, epoch: 0, saving: null, saveAbort: null, draftTimer: null, draftFlight: null };
                this.documents.set(key, document);
            }
            const state = { ...document.state };
            for (const field of DOCUMENT_FIELDS)
                Object.assign(state, { [field]: this.snapshot[field] });
            if (state.source !== document.state.source)
                document.epoch += 1;
            document.state = state;
            const view = { ...this.paneViews.get(this.snapshot.focusedPaneId) };
            for (const field of VIEW_FIELDS)
                Object.assign(view, { [field]: this.snapshot[field] });
            this.paneViews.set(this.snapshot.focusedPaneId, view);
        }
        for (const listener of this.listeners)
            listener();
    }
    getPaneSnapshot(id) {
        const pane = this.pane(id);
        const path = pane?.activePath ?? null;
        const document = path && this.snapshot.vault ? this.documents.get(this.documentKey(this.snapshot.vault, path)) : undefined;
        const mode = pane?.tabs.find(tab => tab.path === path)?.mode ?? 'live-preview';
        const empty = pane?.linkedView ? initialSnapshot() : null;
        return { ...this.snapshot, ...(empty ? { ...Object.fromEntries(DOCUMENT_FIELDS.map(field => [field, empty[field]])), graph: null, graphLayout: [], graphMode: 'local' } : {}), source: '', revision: null, documentKind: null, documentUnavailable: false, saveStatus: 'saved',
            ...document?.state, ...this.paneViews.get(id), ...(pane?.linkedView ? this.linkedLoads.get(id)?.state : {}), localEditRevision: this.paneViews.get(id)?.localEditRevision ?? 0, mode, path, focusedPaneId: id };
    }
    paneLifetimeFor(id) { return this.paneLifetimes.get(id)?.epoch; }
    nativeNoteOwnerKey() {
        const group = this.shellSession.groups.find(group => group.id === this.snapshot.focusedPaneId);
        return `${group?.id ?? ''}:${group?.activeTabId ?? ''}:${this.paneLifetimeFor(this.snapshot.focusedPaneId) ?? ''}`;
    }
    bindPaneEdit(id) {
        const snapshot = this.getPaneSnapshot(id);
        const document = snapshot.vault && snapshot.path ? this.documents.get(this.documentKey(snapshot.vault, snapshot.path)) : undefined;
        const lifetime = this.paneLifetimes.get(id)?.epoch;
        let epoch = document?.epoch;
        return source => {
            if (!document || this.disposed || !sameVault(this.snapshot.vault, document.vault)
                || this.paneLifetimes.get(id)?.epoch !== lifetime
                || this.pane(id)?.activePath !== document.path || this.documents.get(document.key) !== document)
                return false;
            if (document.epoch !== epoch) {
                const editorReset = (this.paneViews.get(id)?.editorReset ?? 0) + 1;
                this.paneViews.set(id, { ...this.paneViews.get(id), editorReset });
                document.state = { ...document.state, message: 'This pane changed in another view. The stale edit was not applied; retry against the current text.' };
                if (this.activeDocument() === document)
                    this.update({ ...document.state, ...(this.snapshot.focusedPaneId === id ? { editorReset } : {}) });
                else
                    this.update({});
                return false;
            }
            if (!boundedSource(source))
                return false;
            if (document.state.source === source)
                return true;
            if (this.activeDocument() === document)
                this.edit(source, id);
            else {
                document.state = { ...document.state, source, saveStatus: 'unsaved', message: 'Unsaved changes.' };
                document.epoch += 1;
                this.markDocumentDirty(document.path, true);
                this.scheduleDocumentDraft(document);
            }
            epoch = document.epoch;
            return true;
        };
    }
    markDocumentDirty(path, dirty) {
        const group = this.shellSession.groups.find(group => group.tabs.some(tab => tab.path === path));
        if (group)
            this.shellSession = markTabDirty(this.shellSession, group.id, path, dirty);
        this.syncShell();
    }
    async splitPane(id, axis) {
        if (!this.pane(id)?.activePath || this.shellSession.groups.length >= MAX_PANE_GROUPS)
            return false;
        const added = splitPaneGroup(this.shellSession, id, axis);
        this.shellSession = focusPaneGroup(added.session, this.snapshot.focusedPaneId);
        this.syncShell();
        return this.focusPane(added.groupId);
    }
    async openLinkedView(id, kind) {
        if (this.disposed || this.snapshot.phase !== 'ready' || this.getPaneSnapshot(id).documentKind !== 'markdown' || this.pane(id)?.linkedView)
            return false;
        const added = openLinkedPane(this.shellSession, id, kind);
        if (added.groupId === id)
            return false;
        this.shellSession = added.session;
        this.syncShell();
        const lifetime = this.paneLifetimeFor(added.groupId);
        await this.loadLinkedView(added.groupId);
        return !this.disposed && this.paneLifetimeFor(added.groupId) === lifetime;
    }
    unlinkLinkedView(id) {
        this.shellSession = unlinkPane(this.shellSession, id);
        this.syncShell();
    }
    toggleLinkedPin(id) {
        this.shellSession = toggleLinkedPanePin(this.shellSession, id);
        this.syncShell();
    }
    bindLinkedProperty(id) {
        const edit = this.bindPaneEdit(id);
        return (key, value) => {
            const snapshot = this.getPaneSnapshot(id);
            if (!this.pane(id)?.linkedView || snapshot.documentKind !== 'markdown' || snapshot.documentUnavailable)
                return false;
            try {
                return edit(setFrontmatterProperty(snapshot.source, key, value));
            }
            catch {
                return false;
            }
        };
    }
    async saveLinkedView(id) {
        const snapshot = this.getPaneSnapshot(id);
        const lifetime = this.paneLifetimeFor(id);
        if (!this.pane(id)?.linkedView || !snapshot.vault || !snapshot.path || snapshot.documentUnavailable)
            return false;
        const document = this.documents.get(this.documentKey(snapshot.vault, snapshot.path));
        if (!document)
            return false;
        const saved = await this.saveDocumentRecord(document);
        return saved && this.documentCurrent(document) && this.paneLifetimeFor(id) === lifetime;
    }
    async navigateLinkedView(id, path) {
        const pane = this.pane(id);
        const linked = pane?.linkedView;
        const vault = this.snapshot.vault;
        const lifetime = this.paneLifetimeFor(id);
        const ownerCurrent = () => !this.disposed && this.paneLifetimeFor(id) === lifetime && vault !== null && sameVault(this.snapshot.vault, vault);
        if (!linked || !vault || !isSafeVaultRelativePath(path) || !supportedDocument(path))
            return false;
        let target = linked.sourceGroupId ? this.shellSession.groups.find(group => group.id === linked.sourceGroupId && !group.linkedView) : this.shellSession.groups.find(group => group.id === this.snapshot.focusedPaneId && !group.linkedView);
        const sourceTab = target?.tabs.find(tab => tab.id === linked.sourceTabId);
        if (linked.sourceGroupId && !sourceTab)
            return false;
        if (!target) {
            if (this.shellSession.groups.length >= MAX_PANE_GROUPS)
                return false;
            const added = addPaneGroup(this.shellSession);
            this.shellSession = added.session;
            this.syncShell();
            target = this.shellSession.groups.find(group => group.id === added.groupId);
        }
        if (!target || !await this.focusPane(target.id, sourceTab?.path, ownerCurrent))
            return false;
        if (this.disposed || this.paneLifetimeFor(id) !== lifetime || !sameVault(this.snapshot.vault, vault))
            return false;
        if (!await this.select(path, true, undefined, true, false, false, ownerCurrent))
            return false;
        return true;
    }
    async loadLinkedView(id) {
        const pane = this.pane(id);
        const path = pane?.activePath;
        const vault = this.snapshot.vault;
        if (!pane?.linkedView || !path || !vault || this.disposed)
            return false;
        this.linkedLoads.get(id)?.abort.abort();
        const load = { abort: new AbortController(), lifetime: this.paneLifetimeFor(id), state: { linkedLoading: true, linkedError: null, graph: null, graphLayout: [] } };
        this.linkedLoads.set(id, load);
        const current = () => !this.disposed && !load.abort.signal.aborted && this.linkedLoads.get(id) === load && this.paneLifetimeFor(id) === load.lifetime && sameVault(this.snapshot.vault, vault) && this.pane(id)?.activePath === path;
        this.update({});
        try {
            const retained = this.documents.get(this.documentKey(vault, path));
            if (retained?.state.documentUnavailable && retained.state.saveStatus !== 'saved') {
                const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, load.abort.signal));
                if (!current())
                    return false;
                if (opened.path !== path || opened.generation !== vault.generation)
                    throw new Error('This note is unavailable.');
                this.publishDocument(retained, { documentUnavailable: false });
            }
            const document = await this.loadPaneDocument(vault, path, false, this.operation);
            if (!current())
                return false;
            if (!document || document.state.documentUnavailable)
                throw new Error('This note is unavailable. Any local draft has been retained.');
            if (document.state.documentKind !== 'markdown')
                throw new Error('Open a Markdown note to use this linked view.');
            if (pane.linkedView.kind === 'graph') {
                const epoch = document.epoch;
                const graph = remoteValue(await this.remote.tocktutorWorkbench.graph({ expectedVault: vault, path, scope: 'local', direction: 'both', depth: this.snapshot.settings?.graphDepth ?? 2, limit: 180 }, load.abort.signal));
                if (!current())
                    return false;
                if (!this.documentCurrent(document, epoch))
                    throw new Error('This note changed while its graph was loading. Retry against the current note.');
                if (graph.generation !== vault.generation || graph.path !== path)
                    throw new Error('The graph response no longer matches this note.');
                const graphLayout = layoutGraph(projectGraph(graph, { includeOrphans: true, query: '' }), { centerForce: .1, iterations: 32, linkDistance: 120, linkForce: .08, repelForce: 1800 });
                load.state = { ...load.state, graph, graphLayout, graphMode: 'local' };
            }
            else if (pane.linkedView.kind === 'backlinks' || pane.linkedView.kind === 'outgoing-links') {
                await this.hydrateDocument(document);
                if (current() && !document.state.links)
                    throw new Error('Relationships are unavailable.');
            }
            return current();
        }
        catch (error) {
            if (current())
                load.state = { ...load.state, linkedError: this.failureMessage(error, 'This linked view is unavailable.') };
            return false;
        }
        finally {
            if (current()) {
                load.state = { ...load.state, linkedLoading: false };
                this.update({});
            }
        }
    }
    resizeSplit(path, ratio) {
        this.shellSession = resizePaneSplit(this.shellSession, path, ratio);
        this.syncShell();
    }
    shellPanes() {
        return Object.freeze(this.shellSession.groups.map(group => Object.freeze({
            ...(group.linkedView ? { linkedView: Object.freeze({ ...group.linkedView }) } : {}),
            activePath: group.linkedView?.path ?? group.tabs.find(tab => tab.id === group.activeTabId)?.path ?? null,
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
        syncLinkedViews(this.shellSession);
        for (const group of this.shellSession.groups) {
            const tab = group.tabs.find(tab => tab.id === group.activeTabId);
            const owner = JSON.stringify([this.shellSession.vault, tab?.id, tab?.path, group.linkedView]);
            if (this.paneLifetimes.get(group.id)?.owner !== owner)
                this.paneLifetimes.set(group.id, { owner, epoch: ++this.paneLifetime });
        }
        for (const id of this.paneLifetimes.keys()) {
            if (!this.shellSession.groups.some(group => group.id === id)) {
                this.paneLifetimes.delete(id);
                this.paneViews.delete(id);
            }
        }
        for (const [id, load] of this.linkedLoads) {
            if (load.lifetime !== this.paneLifetimeFor(id)) {
                load.abort.abort();
                this.linkedLoads.delete(id);
            }
        }
        this.update({
            layout: this.shellSession.layout,
            canGoBack: this.historyBack.length > 0,
            canGoForward: this.historyForward.length > 0,
            focusedPaneId: this.shellSession.focusedGroupId,
            panes: this.shellPanes(),
            recentlyClosed: Object.freeze(this.recentlyClosed.map(tab => Object.freeze({ ...tab }))),
            workspaces: Object.freeze(this.workspaces.map(workspace => Object.freeze({ ...workspace }))),
            ...change,
        });
        this.pruneDocuments();
        const vaultId = this.shellSession.vault?.id;
        if (this.storage !== null && vaultId !== undefined) {
            saveWorkbenchState(this.storage, vaultId, {
                focusMode: this.snapshot.focusMode === true,
                session: this.shellSession,
                workspaces: this.workspaces,
            });
        }
    }
    pruneDocuments() {
        for (const [key, document] of this.documents) {
            const referenced = sameVault(this.shellSession.vault, document.vault) && this.shellSession.groups.some(group => group.linkedView?.path === document.path || group.tabs.some(tab => tab.path === document.path));
            if (!referenced && (document.state.saveStatus === 'saved' || document.durableEpoch === document.epoch)
                && !this.documentLoads.has(key) && !this.documentSelections.has(key)
                && !document.saving && !document.draftFlight && document.draftTimer === null) {
                document.relationshipsAbort?.abort();
                document.embedsAbort?.abort();
                document.baseAbort?.abort();
                this.documents.delete(key);
            }
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
        this.shellSession = openNoteTab(this.shellSession, this.shellSession.focusedGroupId, path, { mode: sessionModeFromRoute(this.snapshot.mode), replaceActive: true });
        this.shellSession = markTabDirty(this.shellSession, this.shellSession.focusedGroupId, path, false);
        this.syncShell();
    }
    recordDirty(dirty) {
        const path = this.snapshot.path;
        if (path === null)
            return;
        this.markDocumentDirty(path, dirty);
    }
    scheduleDocumentDraft(document) {
        if (this.disposed)
            return;
        if (document.draftTimer !== null)
            clearTimeout(document.draftTimer);
        document.draftTimer = setTimeout(() => {
            document.draftTimer = null;
            void this.flushDocumentDraft(document).catch(error => {
                if (!this.disposed && this.activeDocument() === document)
                    this.update({ message: this.failureMessage(error, 'Draft recovery failed.') });
            });
        }, 400);
    }
    flushDocumentDraft(document) {
        if (document.draftTimer !== null)
            clearTimeout(document.draftTimer);
        document.draftTimer = null;
        const previous = document.draftFlight ?? Promise.resolve();
        const flight = previous.catch(() => undefined).then(async () => {
            if (document.state.saveStatus === 'saved')
                return;
            const source = document.state.source ?? '';
            const epoch = document.epoch;
            const revision = document.state.revision;
            let error;
            for (let attempt = 0; attempt < FINAL_DRAFT_ATTEMPTS; attempt += 1) {
                try {
                    remoteValue(await this.remote.tocktutorWorkbench.saveDraft({ content: source, expectedVault: document.vault, path: document.path, ...(revision == null ? {} : { revision }) }));
                    document.durableEpoch = epoch;
                    return;
                }
                catch (caught) {
                    error = caught;
                }
            }
            throw error;
        });
        document.draftFlight = flight;
        void flight.finally(() => { if (document.draftFlight === flight)
            document.draftFlight = null; this.pruneDocuments(); }).catch(() => undefined);
        return flight;
    }
    scheduleDraft() {
        const document = this.activeDocument();
        if (document)
            this.scheduleDocumentDraft(document);
    }
    async flushPendingDraft() {
        const results = await Promise.allSettled([...this.documents.values()].map(document => this.flushDocumentDraft(document)));
        const failed = results.filter((result) => result.status === 'rejected');
        if (failed.length === 1)
            throw failed[0].reason;
        if (failed.length)
            throw new AggregateError(failed.map(result => result.reason), 'The latest TockTutor drafts could not all be saved.');
    }
    clearDocument() {
        this.invalidateDispatch();
        this.nextOperation();
        this.embedTargets = Object.freeze([]);
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
            recoveryOpen: false,
            revision: null,
            saveStatus: 'saved',
            selectedSnapshot: null,
            selectionEnd: 0,
            selectionRequest: null,
            selectionStart: 0,
            snapshots: Object.freeze([]),
            source: '',
            trash: Object.freeze([]),
        });
    }
    recoveryIdentity() {
        const vault = this.snapshot.vault;
        if (vault === null)
            return null;
        return {
            paneId: this.snapshot.focusedPaneId,
            path: this.snapshot.path,
            revision: this.snapshot.revision,
            source: this.snapshot.source,
            vault,
        };
    }
    cancelRecoveryOperations() {
        this.recoveryAbort?.abort();
        this.recoveryAbort = null;
        this.recoveryOperation += 1;
    }
    nextRecoveryOperation() {
        this.cancelRecoveryOperations();
        const abort = new AbortController();
        this.recoveryAbort = abort;
        return { id: this.recoveryOperation, signal: abort.signal };
    }
    recoveryIdentityMatches(identity, requireRevision = true) {
        return !this.disposed
            && sameVault(this.snapshot.vault, identity.vault)
            && this.snapshot.focusedPaneId === identity.paneId
            && this.snapshot.path === identity.path
            && this.snapshot.source === identity.source
            && (!requireRevision || this.snapshot.revision === identity.revision);
    }
    recoveryCurrent(id, identity) {
        return this.recoveryOperation === id
            && this.recoveryAbort?.signal.aborted === false
            && this.recoveryIdentityMatches(identity);
    }
    cancelSearchPreview() {
        this.searchPreviewAbort?.abort();
        this.searchPreviewAbort = null;
        this.searchPreviewOperation += 1;
    }
    nextSearchPreviewOperation() {
        this.cancelSearchPreview();
        this.searchPreviewAbort = new AbortController();
        return { id: this.searchPreviewOperation, signal: this.searchPreviewAbort.signal };
    }
    currentSearchPreview(id, vault, path) {
        const active = this.snapshot.searchActiveIndex;
        return !this.disposed
            && id === this.searchPreviewOperation
            && this.searchPreviewAbort?.signal.aborted === false
            && sameVault(this.snapshot.vault, vault)
            && this.snapshot.searchOpen
            && active !== null && active !== undefined
            && this.snapshot.searchMatches?.[active]?.path === path;
    }
    nextSearchRequest() {
        this.sidebarSearchAbort?.abort();
        if (this.snapshot.searchPresentation !== 'sidebar')
            return { ...this.nextOperation(), sidebar: false };
        if (this.searchTimer !== null)
            clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.cancelSearchPreview();
        this.sidebarSearchAbort = new AbortController();
        return { id: ++this.sidebarSearchOperation, signal: this.sidebarSearchAbort.signal, sidebar: true };
    }
    currentSearchRequest(operation, vault) {
        return !this.disposed && !operation.signal.aborted && sameVault(this.snapshot.vault, vault)
            && (operation.sidebar ? operation.id === this.sidebarSearchOperation : this.current(operation.id, vault));
    }
    nextOperation() {
        if (this.snapshot.searchPresentation !== 'sidebar') {
            if (this.searchTimer !== null)
                clearTimeout(this.searchTimer);
            this.searchTimer = null;
        }
        this.cancelSearchPreview();
        this.cancelRecoveryOperations();
        this.operationAbort?.abort();
        this.operationAbort = new AbortController();
        this.operation += 1;
        return { id: this.operation, signal: this.operationAbort.signal };
    }
    cancelTreeRefresh() {
        this.treeAbort?.abort();
        this.treeAbort = null;
        this.treeGeneration += 1;
    }
    cancelEmbedOperation() {
        this.activeDocument()?.embedsAbort?.abort();
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
        try {
            await this.flushPendingDraft();
        }
        catch (error) {
            this.update({ message: this.failureMessage(error, 'Unresolved drafts prevent changing vaults.') });
            return;
        }
        if (this.disposed)
            return;
        this.cancelTreeRefresh();
        for (const load of this.linkedLoads.values())
            load.abort.abort();
        this.linkedLoads.clear();
        for (const load of this.documentLoads.values())
            load.abort.abort();
        this.documentLoads.clear();
        for (const document of this.documents.values()) {
            document.relationshipsAbort?.abort();
            document.embedsAbort?.abort();
            document.baseAbort?.abort();
            document.hydration = undefined;
            document.hydratedEpoch = undefined;
        }
        this.sidebarSearchAbort?.abort();
        if (this.searchTimer !== null)
            clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.invalidateDispatch();
        const operation = this.nextOperation();
        this.eventDispose ??= this.remote.$on('note-vault/change', event => { this.onVaultChange(event); });
        this.shellSession = createWorkbenchSession(ROUTE_PREFIX, null, 'pane-1');
        this.bookmarks = [];
        this.vaultGeneration = 0;
        this.recentlyClosed.length = 0;
        this.historyBack.length = 0;
        this.historyForward.length = 0;
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
            recentlyClosed: Object.freeze([]),
            recoveryOpen: false,
            revision: null,
            saveStatus: 'saved',
            searchAnswer: { status: 'idle', answer: '', citations: [] },
            searchError: null,
            searchIntelligenceStatus: null,
            searchLoading: false,
            searchMatches: Object.freeze([]),
            searchMode: 'query',
            searchCursor: null,
            searchOpen: false,
            searchQuery: '',
            selectedSnapshot: null,
            selectionEnd: 0,
            selectionRequest: null,
            selectionStart: 0,
            snapshots: Object.freeze([]),
            source: '',
            trash: Object.freeze([]),
            panes: this.shellPanes(),
            vault: null,
            vaultDisplayPath: null,
            vaultName: null,
            warnings: Object.freeze([]),
            mergeRecoveryPending: false,
        });
        try {
            const activeVault = remoteValue(await this.remote.tocktutorWorkbench.currentVault(operation.signal));
            if (!this.current(operation.id) || !validActiveVault(activeVault))
                return;
            this.vaultGeneration = activeVault.generation;
            const vault = activeVault.vault;
            if (vault === null || activeVault.name === null) {
                this.update({ message: 'No active TockTutor vault is available.', phase: 'inactive' });
                return;
            }
            const requestCurrent = () => this.current(operation.id) && !operation.signal.aborted
                && (this.snapshot.vault === null || sameVault(this.snapshot.vault, vault));
            const tree = await this.loadTreePages(vault, operation.signal, requestCurrent);
            if (tree === null || !requestCurrent())
                return;
            this.treeComplete = !tree.truncated;
            const openable = new Set(tree.entries.filter(entry => entry.kind === 'document' && supportedDocument(entry.path)).map(entry => entry.path));
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
                        tabs: group.tabs.filter(tab => supportedDocument(tab.path) && (tree.truncated || openable.has(tab.path))),
                    })),
                });
                this.bookmarks = loadBookmarks(this.storage, vault.id);
                this.workspaces = restored.workspaces;
                restoredFocusMode = restored.focusMode;
                settings = loadTockTutorSettings(this.storage, vault.id);
            }
            this.update({
                bookmarks: Object.freeze(this.bookmarks.map(bookmark => Object.freeze({ ...bookmark }))),
                entries: Object.freeze(tree.entries.toSorted((left, right) => left.path.localeCompare(right.path))),
                layout: this.shellSession.layout,
                focusedPaneId: this.shellSession.focusedGroupId,
                focusMode: restoredFocusMode,
                message: tree.truncated ? 'The vault tree is truncated to a bounded result.' : 'Vault ready.',
                panes: this.shellPanes(),
                phase: 'ready',
                ...(settings === undefined ? {} : { settings }),
                vault,
                vaultDisplayPath: activeVault.displayPath,
                vaultName: activeVault.name,
                warnings: tree.warnings,
                workspaces: Object.freeze(this.workspaces.map(workspace => Object.freeze({ ...workspace }))),
            });
            this.syncShell();
            const path = pathFromTockTutorLocation(this.pathname) ?? this.pane()?.activePath ?? null;
            if (path !== null && !this.pane()?.linkedView)
                await this.select(path, false, undefined, true, false, true);
            await Promise.all(this.shellSession.groups.map(group => {
                const path = group.linkedView?.path ?? group.tabs.find(tab => tab.id === group.activeTabId)?.path;
                return path ? this.loadPaneDocument(vault, path, path !== this.snapshot.path) : Promise.resolve();
            }));
            if (this.remote.tocktutorWorkbench.listMerges && this.operationAbort && !this.operationAbort.signal.aborted) {
                try {
                    await this.listMergeRecovery(this.operationAbort.signal);
                }
                catch {
                    if (!this.disposed && sameVault(this.snapshot.vault, vault))
                        this.update({ mergeRecoveryPending: true });
                }
            }
        }
        catch (error) {
            if (!this.current(operation.id) || operation.signal.aborted)
                return;
            this.update({ message: this.failureMessage(error, 'The vault could not be loaded.'), phase: 'error' });
        }
    }
    loadPaneDocument(vault, path, refresh = false, backgroundOperation) {
        const key = this.documentKey(vault, path);
        const previous = this.documents.get(key);
        refresh ||= previous?.state.documentUnavailable === true;
        if (previous?.state.revision != null && (!refresh || previous.state.saveStatus !== 'saved')) {
            if (refresh)
                this.publishDocument(previous, { message: 'External Change: Your local draft remains unsaved.' });
            void this.hydrateDocument(previous);
            return Promise.resolve(previous);
        }
        const pending = this.documentLoads.get(key);
        if (pending && !refresh)
            return pending.promise;
        // An event describes a newer disk state, not another consumer of the old read.
        pending?.abort.abort();
        const abort = new AbortController();
        const epoch = previous?.epoch;
        const current = () => !this.disposed && !abort.signal.aborted && sameVault(this.snapshot.vault, vault)
            && this.documents.get(key) === previous && previous?.epoch === epoch
            && (previous === undefined || previous.state.saveStatus === 'saved');
        const promise = (async () => {
            try {
                const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, abort.signal));
                if (!current() || opened.path !== path || opened.generation !== vault.generation || !boundedSource(opened.content))
                    return undefined;
                let content = opened.content;
                if (documentKind(path) === 'markdown') {
                    try {
                        const draft = remoteValue(await this.remote.tocktutorWorkbench.readDraft({ expectedVault: vault, path }, abort.signal));
                        if (!current() || draft.generation !== vault.generation)
                            return undefined;
                        if (draft.draft && (draft.draft.revision === undefined || draft.draft.revision === opened.revision) && boundedSource(draft.draft.content))
                            content = draft.draft.content;
                    }
                    catch {
                        if (!current())
                            return undefined;
                    }
                }
                if (!current())
                    return undefined;
                const document = previous ?? { key, vault, path, state: {}, epoch: 0, saving: null, saveAbort: null, draftTimer: null, draftFlight: null };
                document.relationshipsAbort?.abort();
                document.embedsAbort?.abort();
                document.baseAbort?.abort();
                document.hydration = undefined;
                if (document.state.source !== content || document.state.revision !== opened.revision)
                    document.epoch += 1;
                const recovered = content !== opened.content;
                if (recovered)
                    document.durableEpoch = document.epoch;
                document.state = { source: content, documentUnavailable: false, revision: opened.revision, documentKind: documentKind(path), draftRecovered: recovered, saveStatus: recovered ? 'unsaved' : 'saved', embeds: [], links: null, outline: null, baseFiles: [], message: recovered ? `${path} opened with its recovered draft.` : `${path} opened.` };
                document.hydratedEpoch = undefined;
                this.documents.set(key, document);
                if (this.activeDocument() === document)
                    this.update(document.state);
                this.markDocumentDirty(path, recovered);
                void this.hydrateDocument(document);
                return document;
            }
            catch (error) {
                if (current()) {
                    if (previous && this.shellSession.groups.some(group => group.linkedView?.path === path))
                        this.publishDocument(previous, { documentUnavailable: true });
                    const message = this.failureMessage(error, `${path} could not be loaded.`);
                    if (backgroundOperation === undefined)
                        this.update({ message });
                    else
                        this.update({ warnings: Object.freeze([...this.snapshot.warnings, message].slice(-32)) });
                }
                return undefined;
            }
        })();
        const flight = { abort, promise };
        this.documentLoads.set(key, flight);
        void promise.finally(() => {
            if (this.documentLoads.get(key) === flight)
                this.documentLoads.delete(key);
            this.pruneDocuments();
        });
        return promise;
    }
    invalidateLinkedPath(path) {
        const vault = this.snapshot.vault;
        if (!vault)
            return;
        const key = this.documentKey(vault, path);
        this.documentLoads.get(key)?.abort.abort();
        this.documentLoads.delete(key);
        const document = this.documents.get(key);
        if (document) {
            document.relationshipsAbort?.abort();
            document.hydratedEpoch = undefined;
            document.hydration = undefined;
            this.publishDocument(document, { documentUnavailable: true, links: null, outline: null });
        }
        for (const pane of this.snapshot.panes) {
            if (!pane.linkedView || pane.activePath !== path)
                continue;
            this.linkedLoads.get(pane.id)?.abort.abort();
            this.linkedLoads.set(pane.id, { abort: new AbortController(), lifetime: this.paneLifetimeFor(pane.id), state: { linkedLoading: false, linkedError: 'This note is unavailable. Any local draft has been retained.', graph: null, graphLayout: [] } });
        }
        this.update({});
    }
    refreshRelationships(vault) {
        // Cache validity is vault-wide; live query ownership stays with each represented document.
        const paths = new Set(this.snapshot.panes.filter(pane => pane.linkedView).map(pane => pane.activePath));
        const active = this.snapshot.settings?.backlinksInDocument ? this.activeDocument() : undefined;
        for (const document of this.documents.values()) {
            if (!sameVault(document.vault, vault) || document.state.documentKind !== 'markdown' || document.state.documentUnavailable)
                continue;
            if (this.pendingRename?.fromPath === document.path && sameVault(this.pendingRename.vault, vault))
                continue;
            document.hydratedEpoch = undefined;
            document.hydration = undefined;
            if (paths.has(document.path) || document === active) {
                document.relationshipsAbort?.abort();
                this.publishDocument(document, { links: null, linksLoading: false });
                void this.hydrateDocument(document);
            }
        }
    }
    onVaultChange(value) {
        if (!isNoteVaultChangeEvent(value))
            return;
        if (value.kind === 'vault') {
            const changed = value.action === 'deactivated'
                ? sameVault(this.snapshot.vault, value.vault)
                : !sameVault(this.snapshot.vault, value.vault);
            if (changed)
                void this.reload();
            return;
        }
        if (!sameVault(this.snapshot.vault, value.vault))
            return;
        // Every inventory change can affect aliases or referrers, including unopened notes.
        this.mergeReviewAbort?.abort(new Error('The vault changed. Create a new merge review.'));
        // Owned merge publications settle as one authoritative result, like an owned rename.
        if (this.pendingMerge && sameVault(this.pendingMerge.vault, value.vault)
            && (value.kind === 'tree' || this.pendingMerge.paths.has(value.path) || ('fromPath' in value && this.pendingMerge.paths.has(value.fromPath))))
            return;
        if (value.kind === 'entry'
            && value.action === 'moved'
            && this.pendingRename !== null
            && sameVault(this.pendingRename.vault, value.vault)
            && value.fromPath === this.pendingRename.fromPath
            && value.path === this.pendingRename.toPath)
            return;
        if (value.kind === 'entry' && value.action === 'moved' && supportedDocument(value.path)
            && this.shellSession.groups.some(group => group.linkedView?.path === value.fromPath)) {
            const document = this.documents.get(this.documentKey(value.vault, value.fromPath));
            if (!document || (document.state.saveStatus === 'saved' && !document.saving && !document.draftFlight)) {
                this.shellSession = renameNoteTabPath(this.shellSession, value.fromPath, value.path);
                this.workspaces = this.workspaces.map(workspace => ({ ...workspace, session: renameNoteTabPath(workspace.session, value.fromPath, value.path) }));
                this.syncShell();
            }
            else {
                // An external move cannot safely migrate an in-flight save or recovery draft.
                this.invalidateLinkedPath(value.fromPath);
            }
        }
        if (value.kind === 'entry' && value.action === 'trashed')
            this.invalidateLinkedPath(value.fromPath);
        this.refreshRelationships(value.vault);
        if (value.kind === 'tree') {
            void this.refreshTree(value.vault, true);
            return;
        }
        // Watcher echoes can precede the move result and its referrer rewrites.
        // Refresh the tree, but let the owned rename reconcile these document paths.
        if (this.pendingRename && sameVault(this.pendingRename.vault, value.vault)
            && (value.path === this.pendingRename.fromPath || value.path === this.pendingRename.toPath)) {
            void this.refreshTree(value.vault, true);
            return;
        }
        for (const document of this.documents.values()) {
            if (sameVault(document.vault, value.vault) && document.path !== this.snapshot.path
                && (document.path === value.path || ('fromPath' in value && document.path === value.fromPath))) {
                void this.loadPaneDocument(value.vault, document.path, true, this.operation);
            }
        }
        const selected = this.snapshot.path;
        if (selected !== null
            && this.snapshot.saveStatus !== 'saved'
            && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
            this.update({ message: 'External Change: The active file changed on disk. Your local draft remains unsaved.' });
            void this.refreshTree(value.vault, true);
            return;
        }
        if (selected !== null
            && this.snapshot.saveStatus === 'saved'
            && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
            const nextPath = value.path === selected ? selected : value.path;
            if (supportedDocument(nextPath)) {
                if (nextPath === selected && !('fromPath' in value)) {
                    void this.loadPaneDocument(value.vault, selected, true, this.operation);
                    return;
                }
                void this.select(nextPath, false, undefined, true, false, true);
            }
            else {
                const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, selected);
                this.shellSession = closed.session;
                this.syncShell();
                this.clearDocument();
                this.navigate(ROUTE_PREFIX, 'replace');
                void this.refreshTree(value.vault, true);
            }
        }
        else {
            void this.refreshTree(value.vault, true);
        }
    }
    async loadTreePages(vault, signal, requestCurrent) {
        const entries = new Map();
        const warnings = [];
        const cursors = new Set();
        let cursor = null;
        let scanTruncated = false;
        for (let pageIndex = 0; pageIndex < MAX_TREE_PAGES; pageIndex += 1) {
            if (!requestCurrent())
                return null;
            const result = await this.remote.tocktutorWorkbench.listTree({
                expectedVault: vault,
                limit: TREE_LIMIT,
                ...(cursor === null ? {} : { cursor }),
            }, signal);
            if (!requestCurrent())
                return null;
            const page = remoteValue(result);
            if (!validTreePage(page))
                throw new RemoteCallError('invalid-result', 'The vault tree response was invalid.');
            if (page.generation !== vault.generation)
                return null;
            for (const entry of page.entries)
                entries.set(entry.path, entry);
            for (const warning of page.warnings) {
                if (warnings.length < 32 && !warnings.includes(warning))
                    warnings.push(warning);
            }
            scanTruncated ||= page.truncationReason === 'depth-limit' || page.truncationReason === 'entry-limit';
            if (page.cursor === null) {
                return {
                    entries: Object.freeze([...entries.values()]),
                    truncated: scanTruncated,
                    warnings: Object.freeze(warnings),
                };
            }
            if (cursors.has(page.cursor))
                throw new RemoteCallError('invalid-result', 'The vault tree cursor did not advance.');
            cursors.add(page.cursor);
            cursor = page.cursor;
        }
        return {
            entries: Object.freeze([...entries.values()]),
            truncated: true,
            warnings: Object.freeze(warnings),
        };
    }
    async refreshTree(vault, background = false) {
        if (this.disposed || !sameVault(this.snapshot.vault, vault))
            return false;
        this.cancelTreeRefresh();
        const abort = new AbortController();
        this.treeAbort = abort;
        const generation = this.treeGeneration;
        const requestCurrent = () => !this.disposed && !abort.signal.aborted
            && generation === this.treeGeneration && sameVault(this.snapshot.vault, vault);
        try {
            const tree = await this.loadTreePages(vault, abort.signal, requestCurrent);
            if (tree === null || !requestCurrent())
                return false;
            this.treeComplete = !tree.truncated;
            const entries = Object.freeze(tree.entries.toSorted((left, right) => left.path.localeCompare(right.path)));
            const searchQuery = this.snapshot.searchQuery.trim();
            this.update({
                entries,
                warnings: background && tree.truncated
                    ? Object.freeze([...tree.warnings, 'The vault tree is truncated to a bounded result.'].slice(-32)) : tree.warnings,
                ...(!background && tree.truncated ? { message: 'The vault tree is truncated to a bounded result.' } : {}),
                ...(!background && this.snapshot.searchOpen ? {
                    searchActiveIndex: null,
                    searchCursor: null,
                    searchLoading: searchQuery !== '',
                    searchMatches: searchQuery === '' ? recentSearchMatches(entries) : Object.freeze([]),
                    searchPreview: null,
                    searchPreviewError: null,
                    searchPreviewLoading: false,
                } : {}),
            });
            if (!background && this.snapshot.searchOpen && searchQuery !== '')
                this.scheduleSearch();
            if (!background)
                this.refreshRelationships(vault);
            for (const pane of this.snapshot.panes) {
                if (!pane.linkedView || !pane.activePath)
                    continue;
                // The move is committed, but its response still owns path/tab reconciliation.
                if (this.pendingRename?.fromPath === pane.activePath && sameVault(this.pendingRename.vault, vault))
                    continue;
                if (!tree.truncated && !entries.some(entry => entry.path === pane.activePath && entry.kind === 'document'))
                    this.invalidateLinkedPath(pane.activePath);
                else
                    void this.loadLinkedView(pane.id);
            }
            return true;
        }
        catch (error) {
            if (requestCurrent()) {
                const message = this.failureMessage(error, 'The vault tree could not be refreshed.');
                this.update(background ? { warnings: Object.freeze([...this.snapshot.warnings, message].slice(-32)) } : { message });
            }
            return false;
        }
        finally {
            if (this.treeAbort === abort)
                this.treeAbort = null;
        }
    }
    async createManagedVault(name) {
        if (!await this.saveAll())
            return false;
        const operation = this.nextOperation();
        const expectedGeneration = this.vaultGeneration;
        try {
            const vault = remoteValue(await this.remote.tocktutorWorkbench.createManagedVault({ expectedGeneration, name }, operation.signal));
            if (!this.current(operation.id) || vault.generation < expectedGeneration)
                return false;
            await this.reload();
            return sameVault(this.snapshot.vault, vault);
        }
        catch {
            return false;
        }
    }
    async openSandboxVault() {
        if (!await this.saveAll())
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
        const identity = this.recoveryIdentity();
        if (!open || identity === null) {
            this.cancelRecoveryOperations();
            this.update({ recoveryOpen: false, selectedSnapshot: null, snapshots: Object.freeze([]), trash: Object.freeze([]) });
            return;
        }
        const selected = this.snapshot.selectedSnapshot?.snapshot.path === identity.path
            && this.snapshot.snapshots?.some(snapshot => snapshot.id === this.snapshot.selectedSnapshot?.snapshot.id && snapshot.path === identity.path) === true
            ? this.snapshot.selectedSnapshot
            : null;
        const operation = this.nextRecoveryOperation();
        this.update({ recoveryOpen: true, selectedSnapshot: selected, snapshots: Object.freeze([]) });
        try {
            const trash = remoteValue(await this.remote.tocktutorWorkbench.listTrash({ expectedVault: identity.vault }, operation.signal));
            if (!this.recoveryCurrent(operation.id, identity) || trash.generation !== identity.vault.generation || !Array.isArray(trash.entries))
                return;
            let snapshots = [];
            if (identity.path !== null) {
                const result = remoteValue(await this.remote.tocktutorWorkbench.listSnapshots({ expectedVault: identity.vault, path: identity.path }, operation.signal));
                if (!this.recoveryCurrent(operation.id, identity) || result.generation !== identity.vault.generation || !Array.isArray(result.snapshots))
                    return;
                snapshots = result.snapshots.filter(snapshot => snapshot.path === identity.path);
            }
            if (!this.recoveryCurrent(operation.id, identity))
                return;
            this.update({
                selectedSnapshot: selected !== null && snapshots.some(snapshot => snapshot.id === selected.snapshot.id) ? selected : null,
                snapshots: Object.freeze(snapshots.map(snapshot => Object.freeze({ ...snapshot }))),
                trash: Object.freeze(trash.entries.map(entry => Object.freeze({ ...entry }))),
            });
        }
        catch {
            if (this.recoveryCurrent(operation.id, identity))
                this.update({ message: 'Recovery data could not be loaded.' });
        }
    }
    async readRecoverySnapshot(snapshotId) {
        const identity = this.recoveryIdentity();
        if (identity === null || identity.path === null
            || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId && snapshot.path === identity.path) !== true)
            return false;
        const operation = this.nextRecoveryOperation();
        try {
            const snapshot = remoteValue(await this.remote.tocktutorWorkbench.readSnapshot({ expectedVault: identity.vault, path: identity.path, snapshotId }, operation.signal));
            if (!this.recoveryCurrent(operation.id, identity)
                || snapshot.generation !== identity.vault.generation
                || snapshot.snapshot.id !== snapshotId
                || snapshot.snapshot.path !== identity.path)
                return false;
            this.update({ selectedSnapshot: snapshot });
            return true;
        }
        catch {
            return false;
        }
    }
    async captureRecoverySnapshot() {
        const initial = this.recoveryIdentity();
        if (initial === null || initial.path === null)
            return false;
        const operation = this.nextRecoveryOperation();
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.captureSnapshot({
                content: initial.source,
                expectedVault: initial.vault,
                path: initial.path,
                reason: 'manual',
            }, operation.signal));
            if (!this.recoveryCurrent(operation.id, initial)
                || result.generation !== initial.vault.generation
                || result.snapshot?.path !== initial.path
                || result.snapshot === undefined)
                return false;
            await this.setRecoveryOpen(true);
            if (!this.recoveryIdentityMatches(initial))
                return false;
            return await this.readRecoverySnapshot(result.snapshot.id);
        }
        catch {
            return false;
        }
    }
    async clearRecoverySnapshots() {
        const identity = this.recoveryIdentity();
        if (identity === null || identity.path === null)
            return false;
        const operation = this.nextRecoveryOperation();
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.clearSnapshots({ expectedVault: identity.vault, path: identity.path }, operation.signal));
            if (!this.recoveryCurrent(operation.id, identity) || result.generation !== identity.vault.generation)
                return false;
            this.update({ selectedSnapshot: null, snapshots: Object.freeze([]) });
            return true;
        }
        catch {
            return false;
        }
    }
    async restoreRecoverySnapshotOverwrite(snapshotId) {
        const identity = this.recoveryIdentity();
        if (identity === null || identity.path === null || identity.revision === null || this.snapshot.saveStatus !== 'saved'
            || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId && snapshot.path === identity.path) !== true)
            return false;
        const operation = this.nextRecoveryOperation();
        try {
            const restored = remoteValue(await this.remote.tocktutorWorkbench.restoreSnapshot({
                expectedRevision: identity.revision,
                expectedVault: identity.vault,
                path: identity.path,
                snapshotId,
            }, operation.signal));
            if (!this.recoveryCurrent(operation.id, identity)
                || restored.status !== 'saved'
                || restored.generation !== identity.vault.generation
                || restored.path !== identity.path)
                return false;
            this.clearDocument();
            return await this.select(identity.path, false, undefined, true, false, true);
        }
        catch {
            return false;
        }
    }
    async restoreRecoverySnapshot(snapshotId) {
        const identity = this.recoveryIdentity();
        if (identity === null || identity.path === null
            || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId && snapshot.path === identity.path) !== true)
            return false;
        const basename = identity.path.split('/').at(-1) ?? 'Recovered.md';
        const stem = basename.replace(/\.(?:base|canvas|markdown|md)$/iu, '');
        const extension = basename.slice(stem.length) || '.md';
        const toPath = `Recovered/${stem} Recovery${extension}`;
        const operation = this.nextRecoveryOperation();
        try {
            const restored = remoteValue(await this.remote.tocktutorWorkbench.restoreSnapshotAsNew({
                expectedVault: identity.vault,
                path: identity.path,
                snapshotId,
                toPath,
            }, operation.signal));
            if (!this.recoveryCurrent(operation.id, identity)
                || restored.status !== 'created'
                || restored.generation !== identity.vault.generation
                || restored.path !== toPath)
                return false;
            this.update({ message: `${toPath} restored.` });
            await this.refreshTree(identity.vault);
            return this.recoveryIdentityMatches(identity);
        }
        catch {
            return false;
        }
    }
    async trashCurrent() {
        const initial = this.recoveryIdentity();
        const routeOperation = this.operation;
        if (initial === null || initial.path === null || initial.revision === null)
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        if (this.operation !== routeOperation || !this.recoveryIdentityMatches(initial, false))
            return false;
        const identity = this.recoveryIdentity() ?? initial;
        if (identity.path === null || identity.revision === null)
            return false;
        const operation = this.nextRecoveryOperation();
        try {
            const trashed = remoteValue(await this.remote.tocktutorWorkbench.trashEntry({ expectedRevision: identity.revision, expectedVault: identity.vault, path: identity.path }, operation.signal));
            if (!this.recoveryCurrent(operation.id, identity)
                || !validTrashMutationResult(trashed, identity.vault, identity.path))
                return false;
            this.invalidateLinkedPath(identity.path);
            const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, identity.path);
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
        const identity = this.recoveryIdentity();
        const entry = this.snapshot.trash?.find(candidate => candidate.id === id);
        if (identity === null || entry === undefined)
            return false;
        const operation = this.nextRecoveryOperation();
        try {
            const restored = remoteValue(await this.remote.tocktutorWorkbench.restoreTrash({ expectedVault: identity.vault, id }, operation.signal));
            if (!this.recoveryCurrent(operation.id, identity)
                || !validRestoreTrashResult(restored, identity.vault, entry))
                return false;
            await this.refreshTree(identity.vault);
            if (!this.recoveryIdentityMatches(identity))
                return false;
            await this.setRecoveryOpen(true);
            return this.recoveryIdentityMatches(identity);
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
    async focusPane(id, pathOverride, ownerCurrent) {
        const target = this.pane(id);
        if (target === undefined || this.snapshot.phase !== 'ready' || ownerCurrent?.() === false)
            return false;
        // Linked focus never becomes editor-navigation authority.
        if (target.linkedView)
            return true;
        const path = pathOverride ?? target.activePath;
        if (id === this.snapshot.focusedPaneId && path === this.snapshot.path && this.snapshot.revision !== null)
            return true;
        const projection = this.getPaneSnapshot(id);
        this.invalidateDispatch();
        this.nextOperation();
        this.shellSession = focusPaneGroup(this.shellSession, id);
        if (path === null)
            this.shellSession = setActiveNoteTab(this.shellSession, id, null);
        // Switch the projection atomically; never write the old source into the new document.
        this.snapshot = Object.freeze({ ...projection, focusedPaneId: id });
        this.syncShell();
        if (path === null) {
            this.navigate(ROUTE_PREFIX);
            return true;
        }
        if (projection.path === path && projection.revision !== null) {
            this.embedTargets = embedTargetSources(projection.source, path);
            const document = this.activeDocument();
            if (document)
                void this.hydrateDocument(document);
            this.navigate(routeForPath(path));
            return true;
        }
        return this.select(path, true, undefined, true, false, false, ownerCurrent);
    }
    async closePane(id) {
        if (this.snapshot.phase !== 'ready')
            return false;
        const target = this.shellSession.groups.find(group => group.id === id);
        if (target === undefined || (this.shellSession.groups.length <= 1 && !target.linkedView))
            return false;
        const lifetime = this.paneLifetimeFor(id);
        const vault = this.snapshot.vault;
        if (target.linkedView?.path && !this.shellSession.groups.some(group => group.id !== id && (group.linkedView?.path === target.linkedView.path || group.tabs.some(tab => tab.path === target.linkedView.path)))) {
            const document = vault && this.documents.get(this.documentKey(vault, target.linkedView.path));
            if (document && !await this.saveDocumentRecord(document))
                return false;
        }
        for (const tab of target.tabs) {
            if (this.shellSession.groups.some(group => group.id !== id && group.tabs.some(other => other.path === tab.path)))
                continue;
            const document = vault && this.documents.get(this.documentKey(vault, tab.path));
            if (document && !await this.saveDocumentRecord(document))
                return false;
        }
        if (this.paneLifetimeFor(id) !== lifetime || vault === null || !sameVault(this.snapshot.vault, vault) || !this.shellSession.groups.some(group => group.id === id && group.activeTabId === target.activeTabId))
            return false;
        if (this.shellSession.groups.length === 1) {
            delete target.linkedView;
            this.syncShell();
            this.clearDocument();
            this.navigate(ROUTE_PREFIX);
            return true;
        }
        const active = id === this.shellSession.focusedGroupId;
        const result = closePaneGroup(this.shellSession, id);
        if (result.closed === null)
            return false;
        this.shellSession = result.session;
        if (!active) {
            this.syncShell();
            return true;
        }
        if (this.shellSession.groups.find(group => group.id === this.shellSession.focusedGroupId)?.linkedView) {
            this.clearDocument();
            this.syncShell();
            this.navigate(ROUTE_PREFIX);
            return true;
        }
        return this.focusPane(this.shellSession.focusedGroupId);
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
        const lifetime = this.paneLifetimeFor(paneId);
        const vault = this.snapshot.vault;
        const document = vault && this.documents.get(this.documentKey(vault, path));
        const shared = this.shellSession.groups.some(group => group.id !== paneId && group.tabs.some(tab => tab.path === path));
        if (!shared && document && !await this.saveDocumentRecord(document))
            return false;
        if (this.paneLifetimeFor(paneId) !== lifetime || vault === null || !sameVault(this.snapshot.vault, vault) || this.pane(paneId)?.tabs.some(tab => tab.path === path) !== true)
            return false;
        const active = paneId === this.snapshot.focusedPaneId && path === this.snapshot.path;
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
        if (active && this.shellSession.focusedGroupId !== paneId)
            return this.focusPane(this.shellSession.focusedGroupId);
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
        this.nextOperation();
        this.update({ searchAnswer: { status: 'idle', answer: '', citations: [] }, settings });
        if (settings.backlinksInDocument)
            void this.loadRelationships();
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
    addActiveBookmark(title = noteTitle(this.snapshot.path), groupId = null) {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.storage === null || hasNoteBookmark(this.bookmarks, path))
            return false;
        try {
            const base = `note-${this.now().getTime().toString(36)}`;
            let id = base;
            let suffix = 1;
            while (bookmarkIds(this.bookmarks).has(id))
                id = `${base}-${String(suffix++)}`;
            let next = addBookmark(this.bookmarks, { id, kind: 'note', path, title });
            if (groupId)
                next = updateBookmark(next, id, title, groupId);
            if (!saveBookmarks(this.storage, vault.id, next))
                return false;
            this.bookmarks = next;
            this.update({ bookmarks: Object.freeze(next.map(bookmark => Object.freeze({ ...bookmark }))) });
            return true;
        }
        catch {
            return false;
        }
    }
    editActiveBookmark(id, title, groupId) {
        const vault = this.snapshot.vault;
        if (vault === null || this.storage === null || getBookmark(this.bookmarks, id) === null)
            return false;
        try {
            const next = updateBookmark(this.bookmarks, id, title, groupId);
            if (!saveBookmarks(this.storage, vault.id, next))
                return false;
            this.bookmarks = next;
            this.update({ bookmarks: Object.freeze(next.map(bookmark => Object.freeze({ ...bookmark }))) });
            return true;
        }
        catch {
            return false;
        }
    }
    addLinkBookmark(title, url) {
        const vault = this.snapshot.vault;
        if (vault === null || this.storage === null)
            return false;
        try {
            const base = `link-${this.now().getTime().toString(36)}`;
            let id = base;
            let suffix = 1;
            while (bookmarkIds(this.bookmarks).has(id))
                id = `${base}-${String(suffix++)}`;
            const next = addBookmark(this.bookmarks, {
                id,
                kind: 'link',
                title: title.trim().slice(0, 200) || 'Web Link',
                url,
            });
            if (!saveBookmarks(this.storage, vault.id, next))
                return false;
            this.bookmarks = next;
            this.update({ bookmarks: Object.freeze(next.map(bookmark => Object.freeze({ ...bookmark }))) });
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
        const next = removeStoredBookmark(this.bookmarks, id);
        if (next === null || !saveBookmarks(this.storage, vault.id, next))
            return false;
        this.bookmarks = next;
        this.update({ bookmarks: Object.freeze(next.map(bookmark => Object.freeze({ ...bookmark }))) });
        return true;
    }
    async openBookmark(id) {
        const bookmark = getBookmark(this.bookmarks, id);
        if (bookmark === null)
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
        if (!await this.saveAll())
            return false;
        const openable = new Set(this.snapshot.entries.filter(entry => entry.kind === 'document' && supportedDocument(entry.path)).map(entry => entry.path));
        this.shellSession = hydrateWorkbenchSession({
            ...workspace.session,
            vault,
            groups: workspace.session.groups.map(group => ({ ...group, tabs: group.tabs.filter(tab => supportedDocument(tab.path) && (!this.treeComplete || openable.has(tab.path))) })),
        });
        this.syncShell({ focusMode: workspace.focusMode });
        const path = this.pane()?.activePath ?? null;
        this.clearDocument();
        const opened = path === null || this.pane()?.linkedView ? true : await this.select(path);
        if (path === null)
            this.navigate(ROUTE_PREFIX);
        await Promise.all(this.shellSession.groups.map(group => {
            const path = group.linkedView?.path ?? group.tabs.find(tab => tab.id === group.activeTabId)?.path;
            return path ? this.loadPaneDocument(vault, path) : Promise.resolve();
        }));
        return opened;
    }
    async renameActiveTitle(title) {
        const fromPath = this.snapshot.path;
        if (fromPath === null || this.snapshot.documentKind !== 'markdown')
            return false;
        const normalized = title.trim();
        if (normalized.length === 0
            || normalized.length > 200
            || normalized === '.'
            || normalized === '..'
            || /[\\/\u0000-\u001f\u007f]/u.test(normalized))
            return false;
        const extension = fromPath.match(/\.(?:markdown|md)$/iu)?.[0];
        if (extension === undefined)
            return false;
        const directory = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
        const toPath = directory === '' ? `${normalized}${extension}` : `${directory}/${normalized}${extension}`;
        return await this.renameActivePath(toPath, 'renamed');
    }
    async moveActiveNote(folder) {
        const fromPath = this.snapshot.path;
        if (fromPath === null || this.snapshot.documentKind !== 'markdown')
            return false;
        const input = folder.trim();
        const normalized = input.replace(/\/+$/u, '');
        if ((input !== '' && normalized === '')
            || /[\u0000-\u001f\u007f]/u.test(normalized)
            || (normalized !== '' && !isSafeVaultRelativePath(normalized)))
            return false;
        const basename = fileName(fromPath);
        const toPath = normalized === '' ? basename : `${normalized}/${basename}`;
        return await this.renameActivePath(toPath, 'moved');
    }
    async renameActivePath(toPath, action) {
        const vault = this.snapshot.vault;
        const fromPath = this.snapshot.path;
        if (vault === null || fromPath === null || this.snapshot.documentKind !== 'markdown'
            || !isSafeVaultRelativePath(toPath))
            return false;
        if (toPath === fromPath)
            return true;
        const recoveryWasOpen = this.snapshot.recoveryOpen === true;
        this.cancelRecoveryOperations();
        this.update({ selectedSnapshot: null, snapshots: Object.freeze([]) });
        if (this.pendingRename !== null)
            return false;
        if (this.snapshot.entries.some(entry => entry.path === toPath)
            || this.shellSession.groups.some(group => group.tabs.some(tab => tab.path === toPath)))
            return false;
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return false;
        if (!sameVault(this.snapshot.vault, vault) || this.snapshot.path !== fromPath || this.snapshot.revision === null)
            return false;
        const operation = this.nextOperation();
        const sourceAtRename = this.snapshot.source;
        this.pendingRename = { fromPath, toPath, vault };
        this.update({ message: `${action === 'moved' ? 'Moving' : 'Renaming'} ${fromPath}.` });
        try {
            const request = {
                expectedRevision: this.snapshot.revision,
                expectedVault: vault,
                fromPath,
                toPath,
            };
            const renamed = remoteValue(await this.remote.tocktutorWorkbench.renameDocument(request, operation.signal));
            if (!this.current(operation.id, vault)
                || renamed.generation !== vault.generation
                || renamed.fromPath !== fromPath
                || renamed.path !== toPath
                || renamed.status !== 'moved'
                || !/^file:[0-9a-f]{64}$/u.test(renamed.revision))
                return false;
            this.shellSession = renameNoteTabPath(this.shellSession, fromPath, toPath);
            this.workspaces = this.workspaces.map(workspace => ({
                ...workspace,
                session: renameNoteTabPath(workspace.session, fromPath, toPath),
            }));
            for (const history of [this.historyBack, this.historyForward]) {
                for (let index = 0; index < history.length; index += 1) {
                    if (history[index] === fromPath)
                        history[index] = toPath;
                }
            }
            for (let index = 0; index < this.recentlyClosed.length; index += 1) {
                const closed = this.recentlyClosed[index];
                if (closed?.path === fromPath)
                    this.recentlyClosed[index] = { ...closed, path: toPath };
            }
            this.cancelEmbedOperation();
            this.embedTargets = embedTargetSources(this.snapshot.source, toPath);
            const bookmarks = remapBookmarks(this.bookmarks, fromPath, toPath);
            const bookmarksPersisted = this.storage === null || saveBookmarks(this.storage, vault.id, bookmarks);
            const renameWarnings = [
                ...(renamed.rewriteError === undefined || renamed.rewriteError.trim() === ''
                    ? []
                    : [`Some note links could not be updated: ${renamed.rewriteError.trim().slice(0, 240)}`]),
                ...(bookmarksPersisted ? [] : ['Bookmarks could not be saved.']),
            ];
            this.bookmarks = bookmarks;
            const message = renameWarnings.length === 0 ? `${toPath} ${action}.` : `${toPath} ${action}; ${renameWarnings.join(' ')}`;
            this.update({
                bookmarks: Object.freeze(bookmarks.map(bookmark => Object.freeze({ ...bookmark }))),
                draftRecovered: false,
                embeds: Object.freeze([]),
                links: null,
                message,
                outline: null,
                path: toPath,
                selectedSnapshot: null,
                snapshots: Object.freeze([]),
                revision: renamed.revision,
                saveStatus: this.snapshot.source === sourceAtRename ? 'saved' : 'unsaved',
                warnings: Object.freeze([...this.snapshot.warnings, ...renameWarnings].slice(-32)),
            });
            this.syncShell();
            if (this.snapshot.saveStatus !== 'saved')
                this.scheduleDraft();
            this.navigate(routeForPath(toPath), 'replace');
            await this.refreshTree(vault);
            if (renameWarnings.length > 0) {
                this.update({ warnings: Object.freeze([...this.snapshot.warnings, ...renameWarnings].slice(-32)) });
            }
            if (this.snapshot.path === toPath && this.snapshot.documentKind === 'markdown') {
                void this.loadRelationships();
                if (this.embedTargets.length > 0)
                    void this.loadEmbeds();
            }
            if (recoveryWasOpen)
                void this.setRecoveryOpen(true);
            return true;
        }
        catch (error) {
            if (this.current(operation.id, vault) && !operation.signal.aborted) {
                this.update({ message: this.failureMessage(error, `${fromPath} could not be ${action}.`) });
            }
            return false;
        }
        finally {
            if (this.pendingRename?.fromPath === fromPath && this.pendingRename.toPath === toPath)
                this.pendingRename = null;
        }
    }
    async select(path, navigate = true, dispatchRevision, recordHistory = true, newTab = false, refresh = false, ownerCurrent) {
        const activeVault = this.snapshot.vault;
        if (!supportedDocument(path) || activeVault === null || this.snapshot.phase !== 'ready' || ownerCurrent?.() === false)
            return false;
        const previousPath = this.snapshot.path;
        if (dispatchRevision === undefined)
            this.invalidateDispatch();
        else if (!this.dispatchCurrent(dispatchRevision, activeVault))
            return false;
        if (path === this.snapshot.path && !refresh && this.snapshot.revision !== null) {
            const document = this.activeDocument();
            if (document)
                void this.hydrateDocument(document);
            return true;
        }
        const recoveryWasOpen = this.snapshot.recoveryOpen === true;
        this.cancelRecoveryOperations();
        this.update({ selectedSnapshot: null, snapshots: Object.freeze([]) });
        const pane = this.pane();
        const activeTab = pane?.tabs.find(tab => tab.path === pane.activePath);
        if (pane === undefined
            || (!pane.tabs.some(tab => tab.path === path) && pane.tabs.length >= MAX_NOTE_TABS && activeTab?.pinned !== false)) {
            this.update({ message: `This pane is limited to ${String(MAX_NOTE_TABS)} note tabs.` });
            return false;
        }
        if (path !== this.snapshot.path && this.snapshot.saveStatus !== 'saved' && !await this.save()) {
            if (this.snapshot.path !== null)
                this.navigate(routeForPath(this.snapshot.path), 'replace');
            return false;
        }
        if (ownerCurrent?.() === false)
            return false;
        if (newTab && path !== this.snapshot.path && !pane.tabs.some(tab => tab.path === path)) {
            this.shellSession = openNoteTab(this.shellSession, this.shellSession.focusedGroupId, path);
            this.syncShell();
        }
        const operation = this.nextOperation();
        const sourceDocumentAtOpen = this.activeDocument();
        const key = this.documentKey(activeVault, path);
        this.documentSelections.set(key, (this.documentSelections.get(key) ?? 0) + 1);
        try {
            const document = await this.loadPaneDocument(activeVault, path, refresh);
            const sourceDraftChanged = sourceDocumentAtOpen !== document
                && sourceDocumentAtOpen !== undefined
                && this.documents.get(sourceDocumentAtOpen.key) === sourceDocumentAtOpen
                && sourceDocumentAtOpen.state.saveStatus !== 'saved';
            if (!document || ownerCurrent?.() === false || !this.current(operation.id, activeVault) || sourceDraftChanged) {
                this.pruneDocuments();
                return false;
            }
            if (this.documents.get(document.key) !== document || document.state.revision == null)
                return false;
            const mode = pane.tabs.find(tab => tab.path === path)?.mode
                ?? (documentKind(path) === 'markdown' ? this.snapshot.settings?.defaultEditingMode ?? 'live-preview' : 'reading');
            this.embedTargets = embedTargetSources(document.state.source ?? '', path);
            this.update({ ...document.state, path, mode, selectionStart: 0, selectionEnd: 0, selectionRequest: null });
            this.recordOpen(path, recordHistory, previousPath);
            this.markDocumentDirty(path, document.state.saveStatus !== 'saved');
            if (navigate)
                this.navigate(routeForPath(path));
            void this.hydrateDocument(document);
            if (recoveryWasOpen)
                void this.setRecoveryOpen(true);
            return true;
        }
        finally {
            const remaining = (this.documentSelections.get(key) ?? 1) - 1;
            if (remaining > 0)
                this.documentSelections.set(key, remaining);
            else
                this.documentSelections.delete(key);
            this.pruneDocuments();
        }
    }
    async revealActiveFile() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.snapshot.phase !== 'ready' || !isSafeVaultRelativePath(path))
            return false;
        const pane = this.snapshot.focusedPaneId;
        if (!await this.refreshTree(vault) || this.snapshot.focusedPaneId !== pane || this.snapshot.path !== path || !sameVault(this.snapshot.vault, vault))
            return false;
        const found = this.snapshot.entries.some(entry => entry.kind === 'document' && entry.path === path);
        if (!found) {
            this.update({ message: `${path} is not available in the bounded vault tree.` });
            return false;
        }
        this.syncShell({ focusMode: false, message: `Revealed ${path} in Files.` });
        return true;
    }
    edit(source, originPaneId = this.snapshot.focusedPaneId) {
        if (this.snapshot.path === null || this.snapshot.phase !== 'ready')
            return;
        if (!boundedSource(source)) {
            this.update({ message: 'The edit exceeds the bounded source limit.' });
            return;
        }
        if (source === this.snapshot.source)
            return;
        if (this.snapshot.recoveryOpen === true) {
            this.cancelRecoveryOperations();
            this.update({ selectedSnapshot: null, snapshots: Object.freeze([]) });
        }
        this.invalidateDispatch();
        const nextEmbedTargets = embedTargetSources(source, this.snapshot.path ?? undefined);
        const embedsChanged = !sameStrings(this.embedTargets, nextEmbedTargets);
        this.embedTargets = nextEmbedTargets;
        if (embedsChanged)
            this.cancelEmbedOperation();
        // Only the originating view may treat this as an undoable local command.
        const localEditRevision = (this.paneViews.get(originPaneId)?.localEditRevision ?? 0) + 1;
        if (originPaneId !== this.snapshot.focusedPaneId) {
            this.paneViews.set(originPaneId, { ...this.paneViews.get(originPaneId), localEditRevision });
        }
        this.update({
            ...(embedsChanged ? { embeds: Object.freeze([]) } : {}),
            message: 'Unsaved changes.',
            saveStatus: 'unsaved',
            ...(originPaneId === this.snapshot.focusedPaneId ? { localEditRevision } : {}),
            source,
        });
        this.recordDirty(true);
        this.scheduleDraft();
        if (embedsChanged && nextEmbedTargets.length > 0)
            void this.loadEmbeds();
    }
    setSourceEditorSelection(start, end) {
        this.setSelection(authoredSourceOffset(this.snapshot.source, start), authoredSourceOffset(this.snapshot.source, end));
    }
    setSelection(start, end) {
        if (this.snapshot.path === null || this.snapshot.mode === 'reading')
            return;
        const selectionStart = Number.isSafeInteger(start) ? Math.max(0, Math.min(start, this.snapshot.source.length)) : 0;
        const selectionEnd = Number.isSafeInteger(end) ? Math.max(selectionStart, Math.min(end, this.snapshot.source.length)) : selectionStart;
        this.update({ selectionEnd, selectionRequest: null, selectionStart });
    }
    setProperty(key, value) {
        if (this.snapshot.documentKind !== 'markdown' || this.snapshot.path === null)
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
        this.syncShell({ mode, selectionEnd: 0, selectionRequest: null, selectionStart: 0 });
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
        if (vault === null || path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode === 'reading' || end <= start)
            return false;
        const identity = this.recoveryIdentity();
        const routeOperation = this.operation;
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
            if (this.operation !== routeOperation || !this.recoveryIdentityMatches(identity)) {
                if (!this.disposed && sameVault(this.snapshot.vault, vault))
                    this.update({ message: `${destinationPath} created; the changed source was left untouched.` });
                return false;
            }
            this.edit(extraction.sourceContent);
            this.update({ message: `${destinationPath} created; save the source note to finish extraction.` });
            return true;
        }
        catch {
            return false;
        }
    }
    async createBuiltinTemplateNote(name) {
        const vault = this.snapshot.vault;
        if (vault === null)
            return false;
        const path = `${this.snapshot.settings?.templateFolder ?? 'Templates'}/${name}.md`;
        try {
            const content = expandTemplate(BUILTIN_TEMPLATES[name], { now: this.now(), title: name });
            const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({ content, expectedVault: vault, path }));
            if (created.status !== 'created' || created.path !== path || created.generation !== vault.generation)
                return false;
            await this.refreshTree(vault);
            return await this.select(path);
        }
        catch {
            return false;
        }
    }
    insertCurrentDateTime(kind) {
        if (this.snapshot.path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode === 'reading')
            return false;
        const start = this.snapshot.selectionStart ?? this.snapshot.source.length;
        const end = this.snapshot.selectionEnd ?? start;
        const value = expandTemplate(kind === 'date' ? '{{date}}' : '{{time}}', { now: this.now(), title: noteTitle(this.snapshot.path) });
        this.edit(`${this.snapshot.source.slice(0, start)}${value}${this.snapshot.source.slice(end)}`);
        this.setSelection(start + value.length, start + value.length);
        return true;
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
    async loadEmbeds(document = this.activeDocument()) {
        if (!document || document.state.documentKind !== 'markdown' || !this.documentCurrent(document))
            return false;
        const { vault, path: sourcePath, epoch } = document;
        const revision = document.state.revision;
        const source = document.state.source ?? '';
        document.embedsAbort?.abort();
        const abort = new AbortController();
        document.embedsAbort = abort;
        const current = () => this.documentCurrent(document, epoch) && document.state.revision === revision && !abort.signal.aborted;
        let targets;
        try {
            targets = collectEmbedTargets(source, sourcePath);
        }
        catch {
            document.embedsAbort = undefined;
            this.publishDocument(document, { embeds: Object.freeze([]) });
            return false;
        }
        if (this.activeDocument() === document)
            this.embedTargets = Object.freeze(targets.map(target => target.source));
        if (targets.length === 0) {
            document.embedsAbort = undefined;
            this.publishDocument(document, { embeds: Object.freeze([]) });
            return true;
        }
        try {
            const result = await resolveEmbedGraph({
                entries: this.snapshot.entries,
                isCurrent: current,
                readAttachment: async (path) => {
                    const preview = remoteValue(await this.remote.tocktutorWorkbench.previewAttachment(path, vault, abort.signal));
                    if (preview.path !== path || preview.generation !== vault.generation)
                        throw new Error('Embed attachment identity changed.');
                    return preview;
                },
                readDocument: async (path) => {
                    const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, abort.signal));
                    if (opened.path !== path || opened.generation !== vault.generation)
                        throw new Error('Embed document identity changed.');
                    return opened;
                },
                signal: abort.signal,
                source,
                sourcePath,
            });
            if (result.status !== 'ready' || !current())
                return false;
            this.publishDocument(document, {
                embeds: Object.freeze(result.embeds.map(embed => Object.freeze({
                    content: embed.content,
                    ...(embed.depth === 0 ? {} : { depth: embed.depth }),
                    ...(embed.mimeType === undefined ? {} : { mimeType: embed.mimeType }),
                    ...(embed.parentPath === undefined ? {} : { parentPath: embed.parentPath }),
                    target: Object.freeze({ ...embed.target }),
                }))),
            });
            if (result.warnings.length)
                this.update({ warnings: Object.freeze([...this.snapshot.warnings, ...result.warnings].slice(-32)) });
            return true;
        }
        catch {
            return false;
        }
        finally {
            if (document.embedsAbort === abort) {
                document.embedsAbort = undefined;
                // Coalesce edits while a read is pending into one read of the latest source.
                if (this.documentCurrent(document) && (document.epoch !== epoch || document.state.revision !== revision)
                    && this.shellSession.groups.some(group => group.tabs.some(tab => tab.path === sourcePath)))
                    void this.loadEmbeds(document);
            }
        }
    }
    async hydrateBaseRows(basePath) {
        const vault = this.snapshot.vault;
        const document = vault && this.documents.get(this.documentKey(vault, basePath));
        if (!vault || !document || document.state.documentKind !== 'base' || !this.documentCurrent(document))
            return false;
        const epoch = document.epoch;
        const revision = document.state.revision;
        document.baseAbort?.abort();
        const abort = new AbortController();
        document.baseAbort = abort;
        const entries = this.snapshot.entries.filter((entry) => entry.kind === 'document' && /\.(?:markdown|md)$/iu.test(entry.path)).slice(0, 2_000);
        const files = [];
        try {
            for (let index = 0; index < entries.length; index += 8) {
                const batch = entries.slice(index, index + 8);
                const opened = await Promise.all(batch.map(entry => this.remote.tocktutorWorkbench.openDocument(entry.path, vault, abort.signal).then(remoteValue)));
                if (!this.documentCurrent(document, epoch) || document.state.revision !== revision || abort.signal.aborted)
                    return false;
                for (let offset = 0; offset < opened.length; offset += 1) {
                    const document = opened[offset];
                    const entry = batch[offset];
                    if (document.generation !== vault.generation || document.path !== entry.path || !boundedSource(document.content))
                        return false;
                    files.push({ createdAt: entry.createdAt, modifiedAt: entry.modifiedAt, path: entry.path, revision: document.revision, sizeBytes: entry.size, source: document.content });
                }
            }
            this.publishDocument(document, { baseFiles: Object.freeze(files.map(file => Object.freeze({ ...file }))) });
            return true;
        }
        catch {
            return false;
        }
        finally {
            if (document.baseAbort === abort)
                document.baseAbort = undefined;
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
    async attachFiles(files) {
        if (files.length === 0 || files.length > 16 || this.snapshot.path === null || this.snapshot.vault === null
            || this.snapshot.revision === null || this.snapshot.documentKind !== 'markdown')
            return false;
        const path = this.snapshot.path;
        const vault = this.snapshot.vault;
        let expectedRevision = this.snapshot.revision;
        let expectedSource = this.snapshot.source;
        for (const file of files) {
            if (file.size > 25 * 1024 * 1024 || this.snapshot.path !== path || !sameVault(this.snapshot.vault, vault)
                || this.snapshot.revision !== expectedRevision || this.snapshot.source !== expectedSource)
                return false;
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (bytes.byteLength !== file.size || this.snapshot.path !== path || !sameVault(this.snapshot.vault, vault)
                || this.snapshot.revision !== expectedRevision || this.snapshot.source !== expectedSource)
                return false;
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 32_768) {
                binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
            }
            if (!await this.storeActiveAttachment(file.name, btoa(binary)))
                return false;
            expectedRevision = this.snapshot.revision;
            expectedSource = this.snapshot.source;
        }
        return true;
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
    async prepareNoteMerge(destinationPath, callerSignal) {
        callerSignal.throwIfAborted();
        const vault = this.snapshot.vault, sourcePath = this.snapshot.path;
        if (!vault || !sourcePath || this.snapshot.phase !== 'ready' || this.disposed
            || !isSafeVaultRelativePath(destinationPath) || !/\.(?:md|markdown)$/iu.test(sourcePath) || !/\.(?:md|markdown)$/iu.test(destinationPath)
            || sourcePath.normalize('NFC').toLowerCase() === destinationPath.normalize('NFC').toLowerCase())
            throw new Error('Choose two distinct Markdown notes in the current vault.');
        const read = this.remote.tocktutorWorkbench.previewMergeLinks;
        if (!read)
            throw new Error('Merge preview is unavailable.');
        const pane = this.snapshot.focusedPaneId, lifetime = this.paneLifetimeFor(pane), operation = this.nextOperation();
        const invalid = new AbortController(), signal = AbortSignal.any([callerSignal, operation.signal, invalid.signal]);
        const watched = new Map();
        for (const path of [sourcePath, destinationPath]) {
            const document = this.documents.get(this.documentKey(vault, path));
            if (document)
                watched.set(document, { epoch: document.epoch });
        }
        let saved = [];
        const current = () => this.current(operation.id, vault) && this.snapshot.phase === 'ready'
            && this.snapshot.focusedPaneId === pane && this.paneLifetimeFor(pane) === lifetime && this.snapshot.path === sourcePath
            && [...watched].every(([document, captured]) => this.documents.get(document.key) === document && document.epoch === captured.epoch
                && (captured.revision === undefined || (document.state.saveStatus === 'saved' && document.state.revision === captured.revision)))
            && saved.every(opened => {
                const document = this.documents.get(this.documentKey(vault, opened.path));
                return !document || (document.state.saveStatus === 'saved' && document.state.revision === opened.revision && document.state.source === opened.content);
            });
        const check = () => { if (!current())
            invalid.abort(new Error('The notes or their view changed. Create a new merge review.')); signal.throwIfAborted(); };
        const unsubscribe = this.subscribe(() => { if (!current())
            invalid.abort(new Error('The notes or their view changed. Create a new merge review.')); });
        signal.addEventListener('abort', () => {
            unsubscribe();
            if (this.mergeReviewAbort === invalid)
                this.mergeReviewAbort = null;
        }, { once: true });
        try {
            check();
            for (const document of watched.keys()) {
                if (!await this.saveDocumentRecord(document))
                    throw new Error('Save both notes before reviewing their merge.');
                check();
            }
            // Arm after owned draft saves; from this point the full inventory must stay current.
            this.mergeReviewAbort = invalid;
            const opened = await Promise.all([sourcePath, destinationPath].map(path => this.remote.tocktutorWorkbench.openDocument(path, vault, signal).then(remoteValue)));
            check();
            if (opened.some((document, index) => document.path !== [sourcePath, destinationPath][index] || document.generation !== vault.generation))
                throw new Error('The merge documents changed while being read.');
            const source = Object.freeze({ ...opened[0] }), destination = Object.freeze({ ...opened[1] });
            saved = [source, destination];
            check();
            let approved = null;
            const gateway = this.remote.tocktutorWorkbench;
            return { source, destination, signal,
                ...(gateway.prepareMerge && gateway.applyMerge ? { apply: async (preview, applySignal) => {
                        check();
                        applySignal.throwIfAborted();
                        if (!approved || approved.preview !== preview || this.pendingMerge)
                            throw new Error('Create a new merge preview before confirming.');
                        const id = approved.id;
                        approved = null;
                        const pending = { vault, paths: new Set([sourcePath, destinationPath, ...preview.plan.updates.map(update => update.path)]) };
                        unsubscribe();
                        this.mergeReviewAbort = null;
                        this.pendingMerge = pending;
                        let sourceReconciled = false;
                        try {
                            const result = remoteValue(await gateway.applyMerge.call(gateway, { id, expectedVault: vault, confirmed: true }, AbortSignal.any([operation.signal, applySignal])));
                            if (result.id !== id || result.generation !== vault.generation || result.sourcePath !== sourcePath || result.destinationPath !== destinationPath)
                                throw new Error('The merge returned an invalid result. Check Merge Recovery.');
                            if (this.current(operation.id, vault)) {
                                if (result.status === 'applied' && result.sourceDisposition === 'trash') {
                                    const original = this.documents.get(this.documentKey(vault, sourcePath));
                                    if (!original || original.state.saveStatus === 'saved') {
                                        this.shellSession = mergeNoteTabPath(this.shellSession, sourcePath, destinationPath);
                                        this.workspaces = this.workspaces.map(workspace => ({ ...workspace, session: mergeNoteTabPath(workspace.session, sourcePath, destinationPath) }));
                                        this.bookmarks = remapBookmarks(this.bookmarks, sourcePath, destinationPath);
                                        if (this.storage && !saveBookmarks(this.storage, vault.id, this.bookmarks))
                                            this.update({ message: 'Merge applied, but bookmarks could not be saved.' });
                                        for (const history of [this.historyBack, this.historyForward])
                                            for (let index = 0; index < history.length; index++)
                                                if (history[index] === sourcePath)
                                                    history[index] = destinationPath;
                                        this.syncShell();
                                        sourceReconciled = true;
                                        await this.select(destinationPath, true, undefined, false, false, true);
                                    }
                                }
                                if (sameVault(this.snapshot.vault, vault))
                                    this.update({ ...(result.status === 'recovery-required' ? { mergeRecoveryPending: true } : {}), message: result.status === 'applied' ? 'Merge applied. Originals remain available in Merge Recovery.' : 'Merge interrupted. Open Merge Recovery to restore originals as new notes.' });
                            }
                            return result;
                        }
                        catch (error) {
                            if (sameVault(this.snapshot.vault, vault))
                                this.update({ message: 'Merge did not finish. Check Merge Recovery before trying again.' });
                            throw error;
                        }
                        finally {
                            if (this.pendingMerge === pending)
                                this.pendingMerge = null;
                            if (sameVault(this.snapshot.vault, vault)) {
                                const refreshed = await this.refreshTree(vault);
                                if (sameVault(this.snapshot.vault, vault)) {
                                    if (!sourceReconciled && this.documents.has(this.documentKey(vault, sourcePath))) {
                                        if (refreshed && this.treeComplete) {
                                            if (!this.snapshot.entries.some(entry => entry.kind === 'document' && entry.path === sourcePath))
                                                this.invalidateLinkedPath(sourcePath);
                                        }
                                        else {
                                            // A bounded tree cannot prove absence; probe without replacing a local draft.
                                            try {
                                                remoteValue(await gateway.openDocument(sourcePath, vault, this.operationAbort?.signal));
                                            }
                                            catch (error) {
                                                if (error instanceof RemoteCallError && error.code === 'not-found' && sameVault(this.snapshot.vault, vault))
                                                    this.invalidateLinkedPath(sourcePath);
                                            }
                                        }
                                    }
                                    if (sameVault(this.snapshot.vault, vault))
                                        for (const path of pending.paths)
                                            if (this.documents.has(this.documentKey(vault, path)) && !(path === sourcePath && sourceReconciled))
                                                void this.loadPaneDocument(vault, path, true, this.operation);
                                }
                            }
                        }
                    } } : {}), preview: async (options, requestSignal) => {
                    approved = null;
                    check();
                    const previewSignal = AbortSignal.any([signal, requestSignal]);
                    const result = await previewNoteMerge({ ...options, source, destination, expectedVault: vault }, async (request, readSignal) => {
                        check();
                        const page = remoteValue(await read.call(this.remote.tocktutorWorkbench, request, readSignal));
                        check();
                        return page;
                    }, previewSignal);
                    check();
                    for (const update of result.plan.updates) {
                        const document = this.documents.get(this.documentKey(vault, update.path));
                        if (!document)
                            continue;
                        if (!update.revision || document.state.saveStatus !== 'saved' || document.state.revision !== update.revision)
                            throw new Error(`Save or reload ${update.path} before reviewing the merge.`);
                        watched.set(document, { epoch: document.epoch, revision: update.revision });
                    }
                    if (gateway.prepareMerge && (!result.plan.requiresKeepSource || result.sourceDisposition === 'keep')) {
                        const grant = remoteValue(await gateway.prepareMerge.call(gateway, { ...result.request, fingerprint: result.plan.fingerprint, sourceDisposition: result.sourceDisposition, sourceContent: result.sourceContent }, previewSignal));
                        check();
                        previewSignal.throwIfAborted();
                        if (grant.generation !== vault.generation)
                            throw new Error('The merge review changed.');
                        approved = { preview: result, id: grant.id };
                    }
                    return result;
                } };
        }
        catch (error) {
            invalid.abort(error);
            unsubscribe();
            throw error;
        }
    }
    async listMergeRecovery(signal, cursor) {
        const vault = this.snapshot.vault, list = this.remote.tocktutorWorkbench.listMerges;
        if (!vault || !list)
            throw new Error('Merge Recovery is unavailable.');
        const result = remoteValue(await list.call(this.remote.tocktutorWorkbench, { expectedVault: vault, ...(cursor ? { cursor } : {}) }, signal));
        if (!sameVault(this.snapshot.vault, vault) || result.generation !== vault.generation)
            throw new Error('The vault changed.');
        // A partial page cannot prove that all retained journals are settled.
        this.update({ mergeRecoveryPending: result.merges.some(merge => merge.status === 'recovery-required') || result.cursor !== undefined || (cursor !== undefined && this.snapshot.mergeRecoveryPending === true) });
        return result;
    }
    async recoverNoteMerge(id, signal) {
        const vault = this.snapshot.vault, recover = this.remote.tocktutorWorkbench.recoverMerge;
        if (!vault || !recover)
            throw new Error('Merge Recovery is unavailable.');
        const result = remoteValue(await recover.call(this.remote.tocktutorWorkbench, { id, expectedVault: vault }, signal));
        if (!sameVault(this.snapshot.vault, vault) || result.generation !== vault.generation)
            throw new Error('The vault changed.');
        await this.refreshTree(vault, true);
        await this.listMergeRecovery(signal);
        return result;
    }
    save() {
        const document = this.activeDocument();
        const pane = this.snapshot.focusedPaneId;
        const lifetime = this.paneLifetimeFor(pane);
        return document ? this.saveDocumentRecord(document).then(saved => saved && !this.disposed
            && this.activeDocument() === document && this.snapshot.focusedPaneId === pane && this.paneLifetimeFor(pane) === lifetime)
            : Promise.resolve(this.snapshot.saveStatus === 'saved');
    }
    async saveAll() {
        const vault = this.snapshot.vault;
        const pane = this.snapshot.focusedPaneId;
        const lifetime = this.paneLifetimeFor(pane);
        const documents = [...this.documents.values()].map(document => ({ document, epoch: document.epoch }));
        const results = await Promise.all(documents.map(({ document }) => this.saveDocumentRecord(document)));
        return results.every(Boolean) && this.documents.size === documents.length
            && documents.every(({ document, epoch }) => this.documents.get(document.key) === document && document.epoch === epoch && document.state.saveStatus === 'saved')
            && !this.disposed && (vault === null ? this.snapshot.vault === null : sameVault(this.snapshot.vault, vault))
            && this.snapshot.focusedPaneId === pane && this.paneLifetimeFor(pane) === lifetime;
    }
    saveDocumentRecord(document) {
        if (document.saving)
            return document.saving;
        if (document.state.saveStatus === 'saved')
            return Promise.resolve(true);
        const { vault, path } = document;
        const revision = document.state.revision;
        if (revision == null)
            return Promise.resolve(false);
        const source = document.state.source ?? '';
        const epoch = document.epoch;
        const abort = new AbortController();
        document.saveAbort = abort;
        document.state = { ...document.state, saveStatus: 'saving', message: `Saving ${path}.` };
        if (this.activeDocument() === document)
            this.update(document.state);
        else
            this.update({});
        const flight = this.remote.tocktutorWorkbench.saveDocument({ content: source, expectedRevision: revision, expectedVault: vault, path }, abort.signal)
            .then(async (result) => {
            const saved = remoteValue(result);
            if (saved.status !== 'saved' || saved.generation !== vault.generation || saved.path !== path)
                throw new Error('The save response did not match its document.');
            if (this.documents.get(document.key) !== document)
                return false;
            const unchanged = document.epoch === epoch;
            document.state = { ...document.state, revision: saved.revision, saveStatus: unchanged ? 'saved' : 'unsaved',
                draftRecovered: unchanged ? false : document.state.draftRecovered === true,
                message: unchanged ? `${path} saved.` : 'Newer changes remain unsaved.' };
            if (!this.disposed && this.activeDocument() === document)
                this.update(document.state);
            if (unchanged) {
                if (document.draftTimer !== null)
                    clearTimeout(document.draftTimer);
                document.draftTimer = null;
                // Serialize recovery cleanup with draft writes, then re-check newer edits.
                const cleanup = (document.draftFlight ?? Promise.resolve()).catch(() => undefined).then(async () => {
                    if (document.epoch !== epoch)
                        return;
                    remoteValue(await this.remote.tocktutorWorkbench.clearDraft({ expectedVault: vault, path }));
                });
                document.draftFlight = cleanup;
                await cleanup.catch(() => undefined);
                if (document.draftFlight === cleanup)
                    document.draftFlight = null;
            }
            else
                this.scheduleDocumentDraft(document);
            if (!this.disposed && sameVault(this.snapshot.vault, vault)) {
                if (this.activeDocument() === document)
                    this.update(document.state);
                this.markDocumentDirty(path, document.state.saveStatus !== 'saved');
                this.refreshRelationships(vault);
            }
            return unchanged && document.epoch === epoch;
        })
            .catch(error => {
            document.state = { ...document.state, saveStatus: 'save-failed', message: this.failureMessage(error, `${path} could not be saved.`) };
            if (!this.disposed && this.activeDocument() === document)
                this.update(document.state);
            else
                this.update({});
            return false;
        })
            .finally(() => { document.saving = null; document.saveAbort = null; this.pruneDocuments(); });
        document.saving = flight;
        return flight;
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
        if (this.disposal !== null)
            return this.disposal;
        const flush = Promise.all([...this.documents.values()].map(document => document.saving)).then(() => this.flushPendingDraft());
        this.settlePendingDispatch('stale');
        if (this.searchTimer !== null)
            clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.disposed = true;
        this.cancelTreeRefresh();
        this.sidebarSearchAbort?.abort();
        this.dispatchRevision += 1;
        this.operation += 1;
        this.operationAbort?.abort();
        this.cancelRecoveryOperations();
        this.cancelEmbedOperation();
        for (const load of this.linkedLoads.values())
            load.abort.abort();
        this.linkedLoads.clear();
        for (const load of this.documentLoads.values())
            load.abort.abort();
        for (const document of this.documents.values()) {
            document.relationshipsAbort?.abort();
            document.embedsAbort?.abort();
            document.baseAbort?.abort();
            if (document.draftTimer !== null)
                clearTimeout(document.draftTimer);
            document.draftTimer = null;
        }
        this.eventDispose?.();
        this.listeners.clear();
        this.disposal = flush ?? Promise.resolve();
        void this.disposal.catch(() => undefined);
        return this.disposal;
    }
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
            props.onCancel(); }, children: _jsx(DialogContent, { unstyled: true, className: "tocktutor-dispatch-dialog fixed top-1/2 left-1/2 z-[2147483647] w-[calc(100%-48px)] max-w-[480px] -translate-1/2 overflow-hidden rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-xl [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", overlayClassName: "z-[2147483646] !bg-[color-mix(in_srgb,var(--dsw-alias-label-primary,#27272a)_28%,transparent)]", showCloseButton: false, children: _jsxs("form", { className: "grid w-full gap-3.5 p-5 [&_input]:rounded-[5px] [&_input]:border [&_input]:border-[var(--tt-border)] [&_input]:bg-transparent [&_input]:p-2 [&_input]:[font:inherit] [&_label]:grid [&_label]:gap-[5px] [&_label]:font-[650] [&_textarea]:rounded-[5px] [&_textarea]:border [&_textarea]:border-[var(--tt-border)] [&_textarea]:bg-transparent [&_textarea]:p-2 [&_textarea]:[font:inherit]", onSubmit: submit, children: [_jsx("header", { children: _jsx(DialogTitle, { className: "m-0 text-[17px]", children: label }) }), props.kind === 'new' ? (_jsxs(Label, { unstyled: true, children: ["Note Path", _jsx(Input, { unstyled: true, "aria-label": "New Note Path", autoFocus: true, maxLength: 1_000, name: "path", required: true })] })) : (_jsxs(_Fragment, { children: [_jsxs(Label, { unstyled: true, children: ["Title", _jsx(Input, { unstyled: true, "aria-label": "Capture Title", autoFocus: true, maxLength: 200, name: "title", required: true })] }), _jsxs(Label, { unstyled: true, children: ["Text", _jsx(Textarea, { unstyled: true, "aria-label": "Capture Text", maxLength: 100_000, name: "text" })] })] })), _jsxs("div", { className: "tocktutor-dialog-actions flex justify-end gap-2 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit", children: [_jsx(Button, { unstyled: true, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, type: "submit", children: "Create" })] })] }) }) }));
}
function BookmarkDialog(props) {
    const initial = props.bookmarks.find(bookmark => bookmark.id === props.initialBookmarkId) ?? props.bookmarks[0];
    const [selectedId, setSelectedId] = useState(initial?.id ?? null);
    const [title, setTitle] = useState(initial?.title ?? noteTitle(props.path));
    const [groupId, setGroupId] = useState(() => {
        const group = initial === undefined ? null : props.groups.find(candidate => candidate.kind === 'group' && candidate.children.some(child => child.id === initial.id));
        return group?.id ?? '';
    });
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const selected = props.bookmarks.find(bookmark => bookmark.id === selectedId);
    const selectBookmark = (id) => {
        const next = props.bookmarks.find(bookmark => bookmark.id === id);
        if (next === undefined)
            return;
        setSelectedId(next.id);
        setTitle(next.title);
        setGroupId(props.groups.find(group => group.kind === 'group' && group.children.some(child => child.id === next.id))?.id ?? '');
        setError(null);
    };
    const submit = (event) => {
        event.preventDefault();
        if (pending)
            return;
        const normalizedTitle = title.trim();
        if (normalizedTitle.length === 0 || normalizedTitle.length > 200) {
            setError('Enter a bookmark title under 200 characters.');
            return;
        }
        const group = props.groups.find(candidate => candidate.kind === 'group' && candidate.id === groupId);
        setPending(true);
        setError(null);
        void Promise.resolve(props.onSubmit(selected?.id ?? null, normalizedTitle, group?.id ?? null))
            .then(success => {
            if (success === false)
                setError('The bookmark could not be saved.');
            else
                props.onCancel();
        }, () => { setError('The bookmark could not be saved.'); })
            .finally(() => { setPending(false); });
    };
    const remove = () => {
        if (pending || selectedId === null)
            return;
        setPending(true);
        setError(null);
        void Promise.resolve(props.onRemove(selectedId))
            .then(success => {
            if (success === false)
                setError('The bookmark could not be removed.');
            else
                props.onCancel();
        }, () => { setError('The bookmark could not be removed.'); })
            .finally(() => { setPending(false); });
    };
    const label = props.mode === 'create' ? 'Bookmark Note' : 'Edit Bookmark';
    return (_jsx(Dialog, { open: true, onOpenChange: open => { if (!open && !pending)
            props.onCancel(); }, children: _jsx(DialogContent, { unstyled: true, className: "fixed top-1/2 left-1/2 z-[2147483647] grid w-[calc(100%-48px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 gap-3.5 overflow-hidden rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 text-[var(--tt-text)] shadow-xl [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", overlayClassName: "z-[2147483646] !bg-[color-mix(in_srgb,var(--dsw-alias-label-primary,#27272a)_28%,transparent)]", showCloseButton: false, children: _jsxs("form", { className: "grid gap-3", onSubmit: submit, children: [_jsx(DialogTitle, { className: "m-0 text-[17px]", children: label }), props.bookmarks.length > 1 && (_jsxs(Label, { unstyled: true, className: "grid gap-1.5 text-sm font-[650]", children: ["Bookmark", _jsx(NativeSelect, { unstyled: true, "aria-label": "Bookmark", disabled: pending, onChange: event => { selectBookmark(event.target.value); }, value: selectedId ?? '', children: props.bookmarks.map(bookmark => _jsx(NativeSelectOption, { value: bookmark.id, children: bookmark.title }, bookmark.id)) })] })), _jsxs(Label, { unstyled: true, className: "grid gap-1.5 text-sm font-[650]", children: ["Path", _jsx(Input, { unstyled: true, "aria-label": "Bookmark Path", disabled: true, value: props.path })] }), _jsxs(Label, { unstyled: true, className: "grid gap-1.5 text-sm font-[650]", children: ["Title", _jsx(Input, { unstyled: true, "aria-label": "Bookmark Title", autoFocus: true, disabled: pending, maxLength: 200, onChange: event => { setTitle(event.target.value); setError(null); }, value: title })] }), _jsxs(Label, { unstyled: true, className: "grid gap-1.5 text-sm font-[650]", children: ["Bookmark Group", _jsxs(NativeSelect, { unstyled: true, "aria-label": "Bookmark Group", disabled: pending, onChange: event => { setGroupId(event.target.value); setError(null); }, value: groupId, children: [_jsx(NativeSelectOption, { value: "", children: "No Group" }), props.groups.filter((group) => group.kind === 'group').map(group => _jsx(NativeSelectOption, { value: group.id, children: group.title }, group.id))] })] }), error !== null && _jsx("p", { className: "m-0 text-xs text-[var(--dsw-alias-state-error-primary,#dc2626)]", role: "alert", children: error }), _jsxs("div", { className: "flex justify-end gap-2 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit", children: [props.mode === 'edit' && _jsx(Button, { unstyled: true, disabled: pending, onClick: remove, type: "button", children: "Remove" }), _jsx("span", { className: "flex-1" }), _jsx(Button, { unstyled: true, disabled: pending, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, disabled: pending, type: "submit", children: "Save" })] })] }) }) }));
}
const SEARCH_OPTIONS = [
    { description: 'match path of the file', label: 'path:', value: 'path:' },
    { description: 'match file name', label: 'file:', value: 'file:' },
    { description: 'search tags', label: 'tag:', value: 'tag:' },
    { description: 'search tasks', label: 'task:', value: 'task:' },
    { description: 'search a content block', label: 'block:', value: 'block:' },
    { description: 'search note content', label: 'content:', value: 'content:' },
    { description: 'ignore letter case', label: 'ignore-case:', value: 'ignore-case:' },
    { description: 'match letter case', label: 'match-case:', value: 'match-case:' },
    { description: 'find completed tasks', label: 'task-done:', value: 'task-done:' },
    { description: 'find incomplete tasks', label: 'task-todo:', value: 'task-todo:' },
    { description: 'search keywords on same line', label: 'line:', value: 'line:' },
    { description: 'search keywords under same heading', label: 'section:', value: 'section:' },
    { description: 'match property', label: '[property]', value: '[]' },
];
function NoteValueDialog(props) {
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const [value, setValue] = useState(props.initialValue);
    useEffect(() => {
        setValue(props.initialValue);
        setError(null);
    }, [props.initialValue]);
    const rename = props.kind === 'rename';
    const property = props.kind === 'property';
    const label = property ? 'Add Property' : rename ? 'Rename Note' : 'Move Note';
    const fieldLabel = property ? 'Property Name' : rename ? 'Note Title' : 'Note Folder';
    const failure = property ? 'That property could not be added.' : `The note could not be ${rename ? 'renamed' : 'moved'}.`;
    const submit = (event) => {
        event.preventDefault();
        if (pending)
            return;
        const validationError = props.validate?.(value);
        if (validationError) {
            setError(validationError);
            return;
        }
        setPending(true);
        setError(null);
        void Promise.resolve()
            .then(() => props.onSubmit(value))
            .then(success => {
            if (success === true)
                props.onCancel();
            else
                setError(failure);
        }, () => { setError(failure); })
            .finally(() => { setPending(false); });
    };
    return (_jsx(Dialog, { open: true, onOpenChange: open => { if (!open && !pending)
            props.onCancel(); }, children: _jsx(DialogContent, { unstyled: true, className: "fixed top-1/2 left-1/2 z-[2147483647] grid w-[calc(100%-48px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 gap-3.5 overflow-hidden rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 text-[var(--tt-text)] shadow-xl [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", overlayClassName: "z-[2147483646] !bg-[color-mix(in_srgb,var(--dsw-alias-label-primary,#27272a)_28%,transparent)]", showCloseButton: false, children: _jsxs("form", { className: "grid gap-3", onSubmit: submit, children: [_jsx(DialogTitle, { className: "m-0 text-[17px]", children: label }), _jsxs(Label, { unstyled: true, className: "grid gap-1.5 text-sm font-[650]", children: [fieldLabel, _jsx(Input, { unstyled: true, "aria-label": fieldLabel, autoFocus: true, disabled: pending, maxLength: 4_096, onChange: event => { setValue(event.target.value); setError(null); }, placeholder: props.kind === 'move' ? 'Folder/Subfolder (optional)' : undefined, value: value })] }), props.kind === 'move' && _jsx("p", { className: "m-0 text-xs text-[var(--dsw-alias-label-secondary,#71717a)]", children: "Leave the folder empty to move the note to the vault root." }), error !== null && _jsx("p", { className: "m-0 text-xs text-[var(--dsw-alias-state-error-primary,#dc2626)]", role: "alert", children: error }), _jsxs("div", { className: "flex justify-end gap-2 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit", children: [_jsx(Button, { unstyled: true, disabled: pending, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, disabled: pending, type: "submit", children: label })] })] }) }) }));
}
function NoteSearchPreview(props) {
    const html = useMemo(() => props.preview === null || props.preview === undefined
        ? ''
        : renderMarkdownHtml(props.preview.content, { externalEmbedMode: 'inert' }), [props.preview]);
    const matchedHtml = useMemo(() => {
        if (props.preview === null || props.preview === undefined || props.preview.line === null)
            return '';
        const lines = props.preview.content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
        const start = Math.max(0, props.preview.line - 1);
        const end = Math.min(lines.length, props.preview.lineEnd ?? props.preview.line);
        return renderMarkdownHtml(lines.slice(start, Math.max(start + 1, end)).join('\n'), { externalEmbedMode: 'inert' });
    }, [props.preview]);
    return (_jsx("aside", { "aria-label": "Note Preview", className: "min-h-0 p-3", role: "region", children: props.hidden ? (_jsxs("div", { className: "flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--tt-border)] px-6 text-center text-sm text-[var(--tt-muted)]", children: [_jsx("span", { children: "Preview is hidden." }), _jsx(Button, { unstyled: true, className: "rounded-md border border-[var(--tt-border)] bg-transparent px-2.5 py-1.5 text-xs hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)]", onClick: props.onShow, type: "button", children: "Show Preview" })] })) : props.path === null ? (_jsx("div", { className: "flex h-full items-center justify-center rounded-lg border border-[var(--tt-border)] px-6 text-center text-sm text-[var(--tt-muted)]", children: "Select a result to preview it." })) : (_jsxs("div", { className: "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)]", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-[var(--tt-border)] px-4 py-2", children: [_jsx("span", { className: "truncate text-xs text-[var(--tt-muted)]", children: props.path }), _jsx(Button, { unstyled: true, "aria-label": "Hide Preview", className: "shrink-0 rounded-md border-0 bg-transparent p-1 text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)]", onClick: props.onHide, type: "button", children: _jsx(X, { "aria-hidden": "true", className: "size-4" }) })] }), _jsxs("div", { className: "min-h-0 overflow-auto p-5", children: [_jsx("strong", { className: "block truncate text-xl font-semibold tracking-[-0.01em]", children: noteTitle(props.path) }), props.loading ? _jsx("p", { className: "mt-3 mb-0 text-sm text-[var(--tt-muted)]", role: "status", children: "Loading preview\u2026" })
                            : props.error !== null && props.error !== undefined ? _jsx("p", { className: "mt-3 mb-0 text-sm text-[var(--dsw-alias-state-error-primary,#dc2626)]", role: "alert", children: props.error })
                                : props.preview === null || props.preview === undefined ? _jsx("p", { className: "mt-3 mb-0 text-sm text-[var(--tt-muted)]", children: "Preview unavailable." })
                                    : _jsxs(_Fragment, { children: [props.match !== undefined && props.preview.line !== null && _jsxs("p", { className: "mt-2 mb-3 text-xs text-[var(--tt-muted)]", children: ["Match at line ", String(props.preview.line), props.preview.lineEnd !== props.preview.line ? `–${String(props.preview.lineEnd)}` : ''] }), matchedHtml !== '' && _jsx("div", { "aria-label": "Matched Lines", className: "mb-4 rounded-md border border-[var(--tt-border)] bg-[var(--tt-selected)] p-2 text-sm", dangerouslySetInnerHTML: { __html: matchedHtml } }), _jsx("div", { className: "tocktutor-search-preview prose text-sm", dangerouslySetInnerHTML: { __html: html } })] })] })] })) }));
}
function highlightSearchText(text, query) {
    const needle = query.trim().split(/\s+/u).find(token => token.length > 0 && !token.includes(':')) ?? '';
    if (needle.length === 0)
        return text;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'iu'));
    return parts.map((part, index) => index % 2 === 0 ? part : _jsx("mark", { className: "rounded-sm bg-[var(--tt-selected)] text-inherit", children: part }, `${part}:${String(index)}`));
}
function SidebarSearch(props) {
    const { snapshot } = props;
    const input = useRef(null);
    useEffect(() => { input.current?.focus(); }, []);
    const hasQuery = snapshot.searchQuery.trim() !== '';
    return _jsxs("section", { "aria-label": "Search Vault Results", className: "flex min-h-0 flex-col gap-3 px-1.5 py-2 [&_mark]:bg-[color-mix(in_srgb,var(--tt-accent)_30%,transparent)]", children: [_jsxs("form", { className: "flex items-center gap-1", onSubmit: event => { event.preventDefault(); props.onRun?.(); }, role: "search", children: [_jsx(Input, { unstyled: true, ref: input, "aria-label": "Search Vault Query", className: "min-w-0 flex-1 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] px-2 py-1.5 text-sm outline-none focus-visible:border-[var(--tt-accent)] [&::-webkit-search-cancel-button]:appearance-none", disabled: snapshot.phase !== 'ready', maxLength: 1000, onChange: event => { props.onChange?.(event.target.value); }, placeholder: "Search vault\u2026", type: "search", value: snapshot.searchQuery }), _jsx(Button, { unstyled: true, "aria-label": "Clear Vault Search", className: "shrink-0 rounded border-0 bg-transparent p-1 text-[var(--tt-muted)] hover:bg-[var(--tt-selected)]", disabled: !hasQuery, onClick: () => { props.onChange?.(''); input.current?.focus(); }, title: "Clear search", type: "button", children: _jsx(X, { "aria-hidden": "true", className: "size-4" }) })] }), _jsx(SidebarSearchResults, { snapshot: snapshot, onLoadMore: props.onLoadMore, onSelect: props.onSelect })] });
}
function SidebarSearchResults(props) {
    const { snapshot } = props;
    const matches = snapshot.searchMatches ?? [];
    const groups = new Map();
    for (const match of matches) {
        const group = groups.get(match.path) ?? [];
        group.push(match);
        groups.set(match.path, group);
    }
    return snapshot.searchLoading ? _jsx(Alert, { unstyled: true, role: "status", className: "text-xs text-[var(--tt-muted)]", children: "Searching notes\u2026" })
        : snapshot.searchError ? _jsx(Alert, { unstyled: true, role: "alert", className: "text-xs text-[var(--tt-muted)]", children: snapshot.searchError })
            : snapshot.searchQuery.trim() === '' ? _jsx("p", { className: "m-0 text-xs text-[var(--tt-muted)]", children: "Search across your vault. Open a match to read it alongside these results." })
                : _jsxs(_Fragment, { children: [_jsxs("p", { "aria-live": "polite", className: "m-0 text-xs text-[var(--tt-muted)]", children: [groups.size, " ", groups.size === 1 ? 'note' : 'notes', " \u00B7 ", matches.length, " ", matches.length === 1 ? 'match' : 'matches'] }), groups.size === 0 ? _jsx("p", { className: "m-0 text-sm text-[var(--tt-muted)]", children: "No matches found." }) : _jsx("div", { className: "flex flex-col gap-3", children: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([path, group]) => _jsxs("details", { open: true, className: "group", children: [_jsx("summary", { className: "cursor-pointer rounded px-1 py-1 text-sm hover:bg-[var(--tt-selected)] focus-visible:outline-[var(--tt-accent)]", title: path, children: _jsxs("span", { className: "inline-flex max-w-[calc(100%-18px)] items-center gap-2 align-middle", children: [_jsx("span", { className: "truncate", children: noteTitle(path) }), _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: group.length })] }) }), path.includes('/') && _jsx("p", { className: "my-0.5 truncate px-2 text-[11px] text-[var(--tt-muted)]", title: path, children: path.slice(0, path.lastIndexOf('/')) }), _jsx("div", { className: "overflow-hidden rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)]", children: group.map(match => _jsx(Button, { unstyled: true, "aria-label": `${path}, ${match.line === null ? 'title' : `line ${String(match.line)}`}: ${match.preview}`, className: "block w-full border-0 border-b border-solid border-[var(--tt-border)] bg-transparent px-2 py-2 text-left text-xs leading-relaxed last:border-b-0 hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)] focus-visible:outline-[var(--tt-accent)]", onClick: event => { void props.onSelect?.(match, event.metaKey || event.ctrlKey); }, type: "button", children: highlightSearchText(match.preview, snapshot.searchQuery) }, match.id ?? `${match.path}:${match.kind}:${String(match.line)}:${match.preview}`)) })] }, path)) }), snapshot.searchCursor && _jsx(Button, { unstyled: true, className: "rounded-md border border-[var(--tt-border)] p-2 text-xs", onClick: props.onLoadMore, type: "button", children: "Load More Results" })] });
}
function NoteSearchResultList(props) {
    const pathsByTitle = new Map();
    for (const match of props.matches) {
        const title = noteTitle(match.path);
        const paths = pathsByTitle.get(title) ?? new Set();
        paths.add(match.path);
        pathsByTitle.set(title, paths);
    }
    const groups = [...props.matches.reduce((result, match, index) => {
            const group = result.get(match.path) ?? { index, matches: [], path: match.path };
            group.matches.push({ index, match });
            result.set(match.path, group);
            return result;
        }, new Map()).values()];
    return (_jsx("div", { className: "min-h-0 overflow-auto", children: props.loading ? _jsx(Alert, { unstyled: true, className: "px-2 py-3 text-sm text-[var(--tt-muted)]", role: "status", children: "Searching notes\u2026" })
            : props.error !== null && props.error !== undefined ? _jsx(Alert, { unstyled: true, className: "px-2 py-3 text-sm text-[var(--dsw-alias-state-error-primary,#dc2626)]", role: "alert", children: props.error })
                : groups.length > 0 ? (_jsxs(_Fragment, { children: [_jsx("ul", { className: "m-0 grid list-none gap-0.5 p-0", "aria-label": props.query.trim() === '' ? 'Recent Notes' : 'Vault Search Results', id: "tocktutor-search-results", role: "listbox", children: groups.map(group => {
                                const first = group.matches[0];
                                const title = noteTitle(first.match.path);
                                const active = group.matches.some(entry => entry.index === props.previewMatchIndex);
                                return _jsx("li", { children: _jsxs(Button, { unstyled: true, "aria-current": active ? 'true' : undefined, "aria-label": `Open ${first.match.path}`, "aria-selected": active, className: "grid min-h-11 w-full grid-cols-[18px_minmax(0,1fr)] items-start gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left outline-none hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)] aria-current:bg-[var(--tt-selected)]", id: `tocktutor-search-result-${String(group.index)}`, onClick: () => {
                                            void props.onSelect(first.match);
                                        }, onFocus: () => { props.onPreview(first.index); }, onMouseEnter: () => { props.onPreview(first.index); }, role: "option", type: "button", children: [_jsx(FileText, { "aria-hidden": "true", className: "mt-0.5 text-[var(--tt-muted)]", strokeWidth: 1.6 }), _jsxs("span", { className: "min-w-0", children: [_jsx("strong", { className: "block truncate text-sm font-medium", children: pathsByTitle.get(title)?.size === 1 ? title : group.path }), group.matches.map(entry => _jsxs("span", { className: "block truncate text-xs text-[var(--tt-muted)]", children: [entry.match.line !== null && _jsxs(_Fragment, { children: [String(entry.match.line), ": "] }), entry.match.provenance !== undefined && _jsx("span", { className: "mr-1 text-[10px] tracking-wide", children: searchProvenanceLabel(entry.match.provenance) }), highlightSearchText(entry.match.preview, props.query)] }, `${entry.match.id ?? `${entry.match.kind}:${String(entry.match.line)}:${entry.match.preview}`}:${String(entry.index)}`))] })] }) }, group.path);
                            }) }), props.canLoadMore && _jsx(Button, { unstyled: true, className: "mt-2 w-full rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1.5 text-xs text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)]", disabled: props.loading, onClick: props.onLoadMore, type: "button", children: "Load More" })] })) : _jsx(Alert, { unstyled: true, className: "px-2 py-3 text-sm text-[var(--tt-muted)]", role: "status", children: props.query.trim() === '' ? 'No recent notes.' : 'No matching notes.' }) }));
}
function NoteSearchAnswer(props) {
    const answer = props.answer ?? { status: 'idle', answer: '', citations: [] };
    const citationMatch = (id) => {
        const index = Number(id.slice(3)) - 1;
        return /^qa-[1-9][0-9]*$/u.test(id) ? props.matches[index] : undefined;
    };
    return _jsxs("section", { "aria-label": "Quick Answer", className: "border-b border-[var(--tt-border)] px-3 py-2 text-sm", "aria-live": "polite", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("strong", { className: "text-xs font-semibold", children: "Quick Answer" }), answer.status === 'idle' && _jsx(Button, { unstyled: true, className: "rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs hover:bg-[var(--tt-selected)] disabled:opacity-40", disabled: props.matches.length === 0, onClick: props.onStart, type: "button", children: "Ask" }), answer.status === 'thinking' && _jsxs(_Fragment, { children: [_jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "Thinking\u2026" }), _jsx(Button, { unstyled: true, className: "ml-auto rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs hover:bg-[var(--tt-selected)]", onClick: props.onCancel, type: "button", children: "Cancel" })] }), answer.status === 'unavailable' && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "Unavailable for the current assistant provider." }), answer.status === 'no-evidence' && _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "No supporting note evidence." }), answer.status === 'cancelled' && _jsxs(_Fragment, { children: [_jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "Cancelled." }), _jsx(Button, { unstyled: true, className: "ml-auto rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs hover:bg-[var(--tt-selected)]", onClick: props.onRetry, type: "button", children: "Retry" })] }), (answer.status === 'error' || answer.status === 'invalid-output') && _jsxs(_Fragment, { children: [_jsx("span", { className: "text-xs text-[var(--dsw-alias-state-error-primary,#dc2626)]", children: "Quick Answer failed." }), _jsx(Button, { unstyled: true, className: "ml-auto rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs hover:bg-[var(--tt-selected)]", onClick: props.onRetry, type: "button", children: "Retry" })] })] }), answer.status === 'completed' && _jsxs(_Fragment, { children: [_jsx("p", { className: "mt-1.5 mb-1 whitespace-pre-wrap text-xs leading-5", children: answer.answer }), _jsx("div", { className: "flex flex-wrap gap-1", children: answer.citations.map(citation => {
                            const match = citationMatch(citation.id);
                            return match === undefined ? null : _jsxs(Button, { unstyled: true, className: "rounded border border-[var(--tt-border)] bg-transparent px-1.5 py-0.5 text-[11px] text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)]", onClick: () => { props.onSelect(match); }, type: "button", children: [citation.path, citation.line === null ? '' : `:${String(citation.line)}`] }, citation.id);
                        }) })] })] });
}
function WorkbenchNoteSearchPalette(props) {
    const { snapshot } = props;
    const matches = snapshot.searchMatches ?? [];
    const resultCount = new Set(matches.map(match => match.path)).size;
    const selectSearchMatch = async (match, newTab = false) => {
        const selected = props.onSelectSearchMatch !== undefined
            ? await props.onSelectSearchMatch(match, newTab)
            : props.onSelect(match.path);
        if (selected !== false)
            props.onClose(true);
    };
    const searchInputContainer = useRef(null);
    const searchCaret = useRef(null);
    const [searchOptionsOpen, setSearchOptionsOpen] = useState(false);
    const previewMatchIndex = snapshot.searchActiveIndex !== null && snapshot.searchActiveIndex !== undefined && matches[snapshot.searchActiveIndex] !== undefined
        ? snapshot.searchActiveIndex
        : 0;
    const previewMatch = matches[previewMatchIndex];
    const previewResultPath = previewMatch?.path ?? null;
    const [previewHidden, setPreviewHidden] = useState(false);
    useEffect(() => {
        setPreviewHidden(false);
    }, [previewResultPath, snapshot.searchQuery]);
    const insertSearchOption = (value) => {
        const input = searchInputContainer.current?.querySelector('input');
        const start = input?.selectionStart ?? snapshot.searchQuery.length;
        const end = input?.selectionEnd ?? start;
        const before = snapshot.searchQuery.slice(0, start);
        const after = snapshot.searchQuery.slice(end);
        const leadingSpace = before !== '' && !/\s$/u.test(before) ? ' ' : '';
        const trailingSpace = after !== '' && !/^\s/u.test(after) ? ' ' : '';
        const nextQuery = `${before}${leadingSpace}${value}${trailingSpace}${after}`;
        searchCaret.current = start + leadingSpace.length + (value === '[]' ? 1 : value.length);
        props.onSearchChange?.(nextQuery);
        setSearchOptionsOpen(false);
    };
    return (_jsx(Dialog, { open: true, onOpenChange: open => { if (!open)
            props.onClose(); }, children: _jsxs(DialogContent, { unstyled: true, className: "fixed top-1/2 left-1/2 z-[2147483647] grid h-[640px] max-h-[calc(100vh-48px)] w-[calc(100%-32px)] max-w-[960px] -translate-1/2 grid-rows-[56px_42px_auto_minmax(0,1fr)_40px] overflow-hidden rounded-[14px] border border-[var(--tt-border)] bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-xl outline-none [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--tockteam-shell-chrome,var(--dsw-alias-bg-base,#fff))] [--tt-selected:color-mix(in_srgb,var(--tt-text)_6%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", onCloseAutoFocus: props.onCloseAutoFocus, onOpenAutoFocus: props.onOpenAutoFocus, overlayClassName: "z-[2147483646] !bg-[color-mix(in_srgb,var(--tt-text)_28%,transparent)]", showCloseButton: false, children: [_jsx(DialogTitle, { className: "sr-only", children: "Search Notes" }), _jsxs("div", { ref: searchInputContainer, className: "flex min-w-0 items-center gap-3 px-4 text-[var(--tt-muted)] [&>svg]:size-[18px]", children: [_jsx(Search, { "aria-hidden": "true" }), _jsx(Input, { unstyled: true, "aria-activedescendant": matches[previewMatchIndex] === undefined ? undefined : `tocktutor-search-result-${String(matches.findIndex(match => match.path === matches[previewMatchIndex]?.path))}`, "aria-controls": "tocktutor-search-results", "aria-expanded": "true", "aria-label": "Search Notes Query", role: "combobox", className: "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--tt-text)] outline-none placeholder:text-[var(--tt-muted)]", maxLength: 1_000, onChange: event => { props.onSearchChange?.(event.target.value); }, onKeyDown: event => {
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    props.onSearchActiveMove?.(event.key === 'ArrowDown' ? 1 : -1);
                                    return;
                                }
                                if (event.key !== 'Enter')
                                    return;
                                event.preventDefault();
                                const active = matches[previewMatchIndex];
                                if (active !== undefined && props.onSelectSearchMatch !== undefined) {
                                    void selectSearchMatch(active, event.metaKey);
                                    return;
                                }
                                if (snapshot.searchQuery.trim() !== '')
                                    props.onRunSearch?.();
                            }, placeholder: "Search notes...", type: "search", value: snapshot.searchQuery }), _jsxs(Popover, { modal: true, open: searchOptionsOpen, onOpenChange: setSearchOptionsOpen, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Search Options", className: "flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)] data-[state=open]:bg-[var(--tt-selected)] data-[state=open]:text-[var(--tt-text)] [&_svg]:size-[15px]", type: "button", children: _jsx(SlidersHorizontal, { "aria-hidden": "true", strokeWidth: 1.75 }) }) }), _jsxs(PopoverContent, { unstyled: true, align: "end", "aria-label": "Search Options", className: "z-[2147483647] box-border flex max-h-[var(--radix-popover-content-available-height)] w-[300px] flex-col gap-2 overflow-y-auto rounded-xl border border-[var(--dsw-alias-border-l1,#e1e3e7)] bg-[var(--dsw-alias-bg-layer-1,#fff)] p-2.5 text-sm text-[var(--dsw-alias-label-primary,#27272a)] shadow-xl outline-none", onCloseAutoFocus: event => {
                                        if (searchCaret.current === null)
                                            return;
                                        event.preventDefault();
                                        const caret = searchCaret.current;
                                        searchCaret.current = null;
                                        queueMicrotask(() => {
                                            const input = searchInputContainer.current?.querySelector('input');
                                            input?.focus();
                                            input?.setSelectionRange(caret, caret);
                                        });
                                    }, role: "dialog", sideOffset: 8, children: [_jsxs(PopoverHeader, { className: "gap-0.5 px-1.5 pt-0.5", children: [_jsx(PopoverTitle, { className: "text-xs font-semibold", children: "Search Filters" }), _jsx(PopoverDescription, { className: "m-0 text-xs text-[var(--dsw-alias-label-secondary,#71717a)]", children: "Narrow local results before they are limited." })] }), _jsxs("div", { className: "grid gap-2 border-b border-[var(--dsw-alias-border-l1,#e1e3e7)] px-1.5 pb-2", children: [_jsxs(Label, { unstyled: true, className: "flex items-center justify-between gap-2 text-xs font-medium", children: ["Title Only", _jsx(Checkbox, { checked: snapshot.searchTitleOnly === true, onCheckedChange: checked => { props.onSearchFilters?.({ directory: snapshot.searchDirectory ?? '', modifiedFrom: snapshot.searchModifiedFrom ?? null, modifiedTo: snapshot.searchModifiedTo ?? null, titleOnly: checked === true }); } })] }), _jsxs(Label, { unstyled: true, className: "grid gap-1 text-xs font-medium", children: ["In Folder", _jsx(Input, { unstyled: true, "aria-label": "Search in Folder", maxLength: 1_000, onChange: event => { props.onSearchFilters?.({ directory: event.target.value, modifiedFrom: snapshot.searchModifiedFrom ?? null, modifiedTo: snapshot.searchModifiedTo ?? null, titleOnly: snapshot.searchTitleOnly ?? false }); }, placeholder: "Vault root", value: snapshot.searchDirectory ?? '' })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs(Label, { unstyled: true, className: "grid gap-1 text-xs font-medium", children: ["Modified From", _jsx(Input, { unstyled: true, "aria-label": "Modified From", onChange: event => { const value = event.target.value === '' ? null : Date.parse(event.target.value); props.onSearchFilters?.({ directory: snapshot.searchDirectory ?? '', modifiedFrom: value === null || Number.isNaN(value) ? null : value, modifiedTo: snapshot.searchModifiedTo ?? null, titleOnly: snapshot.searchTitleOnly ?? false }); }, type: "date", value: snapshot.searchModifiedFrom == null ? '' : new Date(snapshot.searchModifiedFrom).toISOString().slice(0, 10) })] }), _jsxs(Label, { unstyled: true, className: "grid gap-1 text-xs font-medium", children: ["Modified To", _jsx(Input, { unstyled: true, "aria-label": "Modified To", onChange: event => { const value = event.target.value === '' ? null : Date.parse(event.target.value) + 86_399_999; props.onSearchFilters?.({ directory: snapshot.searchDirectory ?? '', modifiedFrom: snapshot.searchModifiedFrom ?? null, modifiedTo: value === null || Number.isNaN(value) ? null : value, titleOnly: snapshot.searchTitleOnly ?? false }); }, type: "date", value: snapshot.searchModifiedTo == null ? '' : new Date(snapshot.searchModifiedTo).toISOString().slice(0, 10) })] })] })] }), (snapshot.searchMode ?? 'query') === 'query' && _jsxs(_Fragment, { children: [_jsxs(PopoverHeader, { className: "gap-0.5 px-1.5 pt-0.5", children: [_jsx(PopoverTitle, { className: "text-xs font-semibold", children: "Search Syntax" }), _jsx(PopoverDescription, { className: "m-0 text-xs text-[var(--dsw-alias-label-secondary,#71717a)]", children: "Insert an operator at the cursor." })] }), _jsx("ul", { className: "m-0 grid list-none gap-1 p-0", children: SEARCH_OPTIONS.map(option => (_jsx("li", { children: _jsxs(Button, { unstyled: true, className: "grid w-full cursor-pointer grid-cols-[76px_1fr] items-start gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus-visible:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus-visible:outline-none", onClick: () => { insertSearchOption(option.value); }, type: "button", children: [_jsx("code", { className: "font-mono text-xs font-semibold leading-4 text-[var(--dsw-alias-brand-primary,#533afd)]", children: option.label }), _jsx("span", { className: "text-xs leading-4 text-[var(--dsw-alias-label-secondary,#71717a)]", children: option.description })] }) }, option.label))) })] })] })] })] }), _jsxs("header", { className: "flex items-center justify-between gap-3 border-b border-[var(--tt-border)] px-3 text-xs font-medium text-[var(--tt-muted)]", children: [_jsxs("div", { className: "flex items-center gap-0.5", children: [_jsxs(ToggleGroup, { unstyled: true, type: "single", "aria-label": "Search Mode", className: "flex items-center gap-0.5", value: snapshot.searchMode ?? 'query', onValueChange: value => { if (value === 'query' || value === 'related')
                                        props.onSearchMode?.(value); }, children: [_jsx(ToggleGroupItem, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2.5 py-1.5 hover:bg-[var(--tt-selected)] data-[state=on]:bg-[var(--tt-selected)] data-[state=on]:text-[var(--tt-text)]", value: "query", children: "Keyword" }), _jsx(ToggleGroupItem, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2.5 py-1.5 hover:bg-[var(--tt-selected)] data-[state=on]:bg-[var(--tt-selected)] data-[state=on]:text-[var(--tt-text)]", value: "related", children: "Related" })] }), _jsx(Button, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2.5 py-1.5 hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)] disabled:opacity-40", disabled: snapshot.searchLoading === true || snapshot.searchQuery.trim() === '', onClick: props.onRunSearch, type: "button", children: snapshot.searchLoading === true ? 'Searching…' : 'Search' })] }), _jsxs(Alert, { unstyled: true, "aria-live": "polite", className: "text-xs font-normal text-[var(--tt-muted)]", role: snapshot.searchError === null || snapshot.searchError === undefined ? 'status' : 'alert', children: [snapshot.searchLoading === true ? 'Searching notes…' : snapshot.searchError ?? (snapshot.searchIntelligenceStatus !== null && snapshot.searchIntelligenceStatus !== undefined && snapshot.searchIntelligenceStatus !== 'applied' ? `AI Search ${snapshot.searchIntelligenceStatus}; showing local results.` : snapshot.searchQuery.trim() === '' ? `${String(resultCount)} recent note${resultCount === 1 ? '' : 's'}` : `${String(resultCount)} note${resultCount === 1 ? '' : 's'} · ${String(matches.length)} match${matches.length === 1 ? '' : 'es'}`), snapshot.searchIntelligenceProvider !== null && snapshot.searchIntelligenceProvider !== undefined && snapshot.searchIntelligenceModel !== null && snapshot.searchIntelligenceModel !== undefined ? ` · AI uses ${snapshot.searchIntelligenceProvider}/${snapshot.searchIntelligenceModel}` : ''] })] }), _jsx(NoteSearchAnswer, { answer: snapshot.searchAnswer, matches: matches, onCancel: () => { props.onCancelQuickAnswer?.(); }, onRetry: () => { props.onRetryQuickAnswer?.(); }, onSelect: match => { void selectSearchMatch(match); }, onStart: () => { props.onQuickAnswer?.(); } }), _jsxs("section", { className: "grid min-h-0 grid-cols-[minmax(0,3fr)_minmax(260px,2fr)] max-sm:grid-cols-1", "aria-label": "Search Results", children: [_jsxs("div", { className: "grid min-h-0 grid-rows-[36px_minmax(0,1fr)] border-r border-[var(--tt-border)] px-3 pb-3 max-sm:border-r-0", children: [_jsx("div", { className: "flex items-end px-2 pb-1 text-[11px] font-medium text-[var(--tt-muted)]", children: "Results" }), _jsx(NoteSearchResultList, { canLoadMore: snapshot.searchCursor !== null, error: snapshot.searchError, loading: snapshot.searchLoading === true, matches: matches, onLoadMore: () => { props.onLoadMoreSearch?.(); }, onPreview: choice => { props.onSearchActiveSet?.(choice); }, onSelect: selectSearchMatch, previewMatchIndex: previewMatchIndex, query: snapshot.searchQuery })] }), _jsx(NoteSearchPreview, { error: snapshot.searchPreviewError, hidden: previewHidden, loading: snapshot.searchPreviewLoading === true, match: previewMatch, onHide: () => { setPreviewHidden(true); props.onHidePreview?.(); }, onShow: () => { setPreviewHidden(false); props.onSearchActiveSet?.(previewMatchIndex); }, path: previewResultPath, preview: snapshot.searchPreview })] }), _jsxs("footer", { className: "flex flex-wrap items-center gap-3 border-t border-[var(--tt-border)] px-3 text-[11px] text-[var(--tt-muted)]", children: [_jsx(Button, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2 py-1 hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)]", onClick: props.onCommands, type: "button", children: "Commands" }), matches.length > 0 ? _jsxs(_Fragment, { children: [_jsxs("span", { className: "ml-auto flex items-center gap-1.5", children: [_jsx("kbd", { className: "font-[inherit] text-[var(--tt-text)]", children: "\u2191\u2193" }), " Navigate"] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "font-[inherit] text-[var(--tt-text)]", children: "\u21B5" }), " Open"] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "font-[inherit] text-[var(--tt-text)]", children: "\u2318\u21B5" }), " New Tab"] })] }) : _jsxs("span", { className: "ml-auto flex items-center gap-1.5", children: [_jsx("kbd", { className: "font-[inherit] text-[var(--tt-text)]", children: "\u21B5" }), " ", snapshot.searchQuery.trim() === '' ? 'Open' : 'Search'] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "font-[inherit] text-[var(--tt-text)]", children: "Esc" }), " Dismiss"] })] })] }) }));
}
function WorkbenchCommandPalette(props) {
    const [query, setQuery] = useState('');
    const editor = (command) => props.onEditorCommand === undefined
        ? undefined
        : () => { props.onEditorCommand?.(command); };
    const commands = [
        { label: 'New Note', run: props.onNewNote },
        { close: false, label: 'Search Notes', run: props.onSearch },
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
    ];
    return (_jsx(Dialog, { open: true, onOpenChange: open => { if (!open)
            props.onClose(); }, children: _jsxs(DialogContent, { unstyled: true, className: "fixed top-[42%] left-1/2 -ml-[5px] z-[2147483647] grid h-[520px] max-h-[calc(100vh-48px)] w-[calc(100%-32px)] max-w-[640px] -translate-x-1/2 -translate-y-[42%] grid-rows-[60px_minmax(0,1fr)_32px] overflow-hidden rounded-[12px] border border-border bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-xl outline-none [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--tockteam-shell-chrome,var(--dsw-alias-bg-base,#fff))] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", onCloseAutoFocus: props.onCloseAutoFocus, onOpenAutoFocus: props.onOpenAutoFocus, overlayClassName: "z-[2147483646] !bg-transparent", showCloseButton: false, children: [_jsx(DialogTitle, { className: "sr-only", children: "Command Palette" }), _jsxs(Command, { unstyled: true, className: "contents", label: "Search Commands", children: [_jsxs(Label, { unstyled: true, className: "flex min-w-0 items-center gap-3 border-b border-[var(--tt-border)] px-4 text-[var(--tt-muted)] [&>svg]:size-[18px]", children: [_jsx(Search, { "aria-hidden": "true" }), _jsx(CommandInput, { unstyled: true, "aria-label": "Search Commands", className: "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--tt-text)] outline-none placeholder:text-[var(--tt-muted)]", maxLength: 200, onValueChange: setQuery, placeholder: "Search", value: query })] }), _jsx("div", { className: "min-h-0 px-3 pb-3", children: _jsxs("section", { className: "grid h-full min-h-0 grid-rows-[42px_minmax(0,1fr)]", "aria-label": "Command Results", children: [_jsx("header", { className: "flex items-end px-2 pb-1.5 text-[11px] font-medium text-[var(--tt-muted)]", children: "Commands" }), _jsxs(CommandList, { unstyled: true, className: "overflow-auto", label: "Command Search Results", children: [_jsx(CommandEmpty, { unstyled: true, className: "px-2.5 py-2 text-sm text-[var(--tt-muted)]", children: "No matching commands." }), _jsx(CommandGroup, { unstyled: true, className: "grid auto-rows-max gap-0", children: commands.map(command => (_jsx(CommandItem, { unstyled: true, className: "box-border h-7 cursor-default rounded-md border-0 bg-transparent px-2.5 py-1 text-left text-sm text-[var(--tt-text)] outline-none hover:bg-[var(--tt-selected)] data-[selected=true]:bg-[var(--tt-selected)] data-[disabled=true]:opacity-40", disabled: command.disabled === true || command.run === undefined, onSelect: () => {
                                                        command.run?.();
                                                        if (command.close !== false)
                                                            props.onClose();
                                                    }, value: command.label, children: command.label }, command.label))) })] })] }) }), _jsxs("footer", { className: "flex items-center justify-center gap-3 px-3 text-xs text-[var(--tt-muted)]", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("kbd", { "aria-label": "Up and Down Arrows", className: "font-[inherit] font-semibold", children: "\u2191\u2193" }), " to navigate"] }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx("kbd", { "aria-label": "Enter", className: "font-[inherit] font-semibold", children: "\u21B5" }), " to use"] }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx("kbd", { "aria-label": "Escape", className: "font-[inherit] font-semibold", children: "esc" }), " to dismiss"] })] })] })] }) }));
}
function fileName(path) {
    return path.split('/').at(-1) ?? path;
}
function noteTitle(path) {
    return path === null ? 'TockTutor' : fileName(path).replace(/\.(?:base|canvas|markdown|md)$/iu, '');
}
function bookmarkIds(bookmarks) {
    const ids = new Set();
    for (const bookmark of bookmarks) {
        ids.add(bookmark.id);
        if (bookmark.kind === 'group')
            for (const child of bookmark.children)
                ids.add(child.id);
    }
    return ids;
}
function bookmarkPath(bookmark) {
    return 'path' in bookmark ? bookmark.path : null;
}
function hasNoteBookmark(bookmarks, path) {
    return bookmarks.some(bookmark => bookmark.kind === 'group'
        ? bookmark.children.some(child => bookmarkPath(child) === path && child.kind === 'note')
        : bookmark.kind === 'note' && bookmark.path === path);
}
function noteBookmarksForPath(bookmarks, path) {
    if (path === null)
        return [];
    const matches = [];
    for (const bookmark of bookmarks) {
        if (bookmark.kind === 'group') {
            matches.push(...bookmark.children.filter(child => child.kind === 'note' && child.path === path));
        }
        else if (bookmark.kind === 'note' && bookmark.path === path) {
            matches.push(bookmark);
        }
    }
    return matches;
}
function bookmarkGroups(bookmarks) {
    return bookmarks.filter(bookmark => bookmark.kind === 'group');
}
function searchProvenanceLabel(provenance) {
    return provenance === 'frontmatter' ? 'Frontmatter' : `${provenance.slice(0, 1).toUpperCase()}${provenance.slice(1)}`;
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
    return children.map(entry => entry.kind === 'directory' ? (_jsx("li", { className: "tocktutor-tree-directory", children: _jsxs("details", { className: "group/folder", "data-tree-directory": entry.path, open: true, children: [_jsxs("summary", { className: "tocktutor-tree-row grid min-h-7 w-full cursor-pointer list-none grid-cols-[12px_minmax(0,1fr)] items-center gap-[7px] rounded bg-transparent px-[5px] py-1 text-left text-[13px] font-medium text-inherit hover:bg-[var(--tt-selected)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--tt-accent)] [&::-webkit-details-marker]:hidden [&>svg]:size-3 group-open/folder:[&>svg]:rotate-90", title: entry.path, children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx("span", { className: "truncate", children: fileName(entry.path) })] }), _jsx("ul", { className: "my-0 mr-0 ml-[11px] list-none border-l border-[var(--tt-border)] py-0 pr-0 pl-1", children: _jsx(TreeEntries, { entries: props.entries, onSelect: props.onSelect, path: props.path, prefix: `${entry.path}/`, revealPath: props.revealPath }) })] }) }, entry.path)) : (_jsx("li", { children: _jsxs(Button, { unstyled: true, "aria-current": entry.path === props.path ? 'page' : undefined, "aria-label": entry.path, "data-tree-path": entry.path, className: "tocktutor-tree-row grid min-h-7 w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-[7px] rounded border-0 bg-transparent px-[5px] py-1 text-left text-[13px] font-medium text-inherit hover:bg-[var(--tt-selected)] aria-[current=page]:bg-[var(--tt-selected)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--tt-accent)]", onClick: () => { props.onSelect(entry.path); }, title: entry.path, type: "button", children: [_jsx("span", { className: "tocktutor-tree-indent w-3" }), _jsx("span", { className: "truncate", children: noteTitle(entry.path) }), /\.(?:base|canvas)$/iu.test(entry.path) && _jsx("span", { "aria-hidden": "true", className: "text-[10px] font-medium tracking-wide text-[var(--tt-muted)]", children: entry.path.split('.').at(-1)?.toUpperCase() })] }) }, entry.path)));
}
const NOTE_SUBMENU_CLASS = "z-[1002] min-w-[196px] rounded-[8px] border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] p-1.5 text-[var(--dsw-alias-label-primary,#27272a)] shadow-xl [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_[data-slot=dropdown-menu-item]]:h-[25px] [&_[data-slot=dropdown-menu-item]]:min-h-0 [&_[data-slot=dropdown-menu-item]]:py-0 [&_[data-slot=dropdown-menu-item]]:leading-[17px] [&_[data-slot=dropdown-menu-item]>svg]:size-4";
const NOTE_ACTION_CLASS = "h-[25px] min-h-0 w-full gap-2 rounded-[5px] px-2 py-0 text-[13px] leading-[17px] text-inherit focus:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus:text-inherit data-[highlighted]:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] data-[highlighted]:text-inherit [&>svg]:size-4 [&>svg]:shrink-0 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate";
function NoteFindReplaceStrip(props) {
    const findInputRef = useRef(null);
    useEffect(() => { findInputRef.current?.focus(); }, [props.mode]);
    const cappedSuffix = props.state.truncated ? '+' : '';
    const count = props.state.current === null
        ? props.state.total === 0 ? (props.query === '' ? 'Type to find' : 'No matches') : `${String(props.state.total)}${cappedSuffix} matches`
        : `${String(props.state.current + 1)} / ${String(props.state.total)}${cappedSuffix}`;
    return (_jsxs("div", { "aria-label": props.mode === 'replace' ? 'Find and Replace in Note' : 'Find in Note', className: "tocktutor-find-strip grid min-h-10 grid-cols-[minmax(120px,1fr)_auto_auto_minmax(0,auto)_auto] items-center gap-1.5 border-b border-[var(--tt-border)] bg-[var(--tt-panel)] px-2.5 py-1.5 text-xs", role: "search", children: [_jsx(Input, { "aria-label": "Find in Note", autoFocus: true, className: "h-7 min-w-0 rounded-[5px] border-[var(--tt-border)] bg-transparent px-2 text-xs", maxLength: MAX_EDITOR_SEARCH_QUERY_LENGTH + 1, onChange: event => { props.onQueryChange(event.currentTarget.value); }, onKeyDown: event => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        props.onClose();
                    }
                    else if (event.key === 'Enter') {
                        event.preventDefault();
                        props.onRequest(event.shiftKey ? 'previous' : 'next');
                    }
                }, placeholder: "Find in note\u2026", ref: findInputRef, type: "search", value: props.query }), _jsx("output", { "aria-live": "polite", className: `min-w-[4.5rem] text-center tabular-nums ${props.state.error === undefined && props.transitionNotice === undefined ? 'text-[var(--tt-muted)]' : 'text-[var(--dsw-alias-state-error-primary)]'}`, role: props.state.error === undefined && props.transitionNotice === undefined ? 'status' : 'alert', children: props.transitionNotice ?? props.state.error ?? count }), _jsxs("div", { className: "flex items-center gap-0.5", children: [_jsx(Button, { "aria-label": "Previous Match", className: "size-7", disabled: props.state.total === 0, onClick: () => { props.onRequest('previous'); }, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(ChevronLeft, { "aria-hidden": "true" }) }), _jsx(Button, { "aria-label": "Next Match", className: "size-7", disabled: props.state.total === 0, onClick: () => { props.onRequest('next'); }, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(ChevronRight, { "aria-hidden": "true" }) })] }), props.mode === 'replace' ? (_jsxs("div", { className: "flex min-w-0 items-center gap-1.5", children: [_jsx(Input, { "aria-label": "Replace in Note", className: "h-7 min-w-24 rounded-[5px] border-[var(--tt-border)] bg-transparent px-2 text-xs", maxLength: 100_000, onChange: event => { props.onReplacementChange(event.currentTarget.value); }, onKeyDown: event => {
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                event.stopPropagation();
                                props.onClose();
                            }
                            else if (event.key === 'Enter') {
                                event.preventDefault();
                                props.onRequest('replace', props.replacement);
                            }
                        }, placeholder: "Replace with\u2026", value: props.replacement }), _jsx(Button, { className: "h-7 px-2 text-xs", disabled: props.state.total === 0, onClick: () => { props.onRequest('replace', props.replacement); }, type: "button", variant: "outline", children: "Replace" }), _jsx(Button, { className: "h-7 px-2 text-xs", disabled: props.state.total === 0, onClick: () => { props.onRequest('replace-all', props.replacement); }, type: "button", variant: "outline", children: "Replace All" })] })) : _jsx("span", {}), _jsx(Button, { "aria-label": "Exit Find", className: "size-7", onClick: props.onClose, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(X, { "aria-hidden": "true" }) })] }));
}
function snapshotPalette(snapshot) {
    if (snapshot.searchOpen && snapshot.searchPresentation !== 'sidebar')
        return 'notes';
    return snapshot.commandPaletteOpen === true ? 'commands' : null;
}
function boundPaneProps(props, id) {
    const controller = props.paneController;
    const snapshot = controller.getPaneSnapshot(id);
    const lifetime = controller.paneLifetimeFor(id);
    const bound = { ...props, snapshot, nativeNoteActions: id === props.snapshot.focusedPaneId ? props.nativeNoteActions ?? null : null };
    // Delayed editor/menu callbacks may act only for the exact focused view that rendered them.
    const owns = () => {
        const current = controller.getSnapshot();
        return controller.paneLifetimeFor(id) === lifetime && current.focusedPaneId === id && current.path === snapshot.path && snapshot.vault !== null && sameVault(current.vault, snapshot.vault);
    };
    for (const name of ['onMode', 'onSelectionChange', 'onSetProperty', 'onToggleTask', 'onRenameTitle', 'onMoveNote', 'onPrepareNoteMerge', 'onAddBookmark', 'onEditBookmark', 'onRemoveBookmark', 'onRevealFile', 'onAttachFiles', 'onCanvasChange', 'onBaseEdit', 'onOpenInternalLink', 'onTrashCurrent', 'onLoadRelationships', 'onOpenRecovery']) {
        const callback = props[name];
        if (callback)
            Object.assign(bound, { [name]: (...args) => owns() ? callback(...args) : false });
    }
    return { ...bound, onEdit: controller.bindPaneEdit(id), onSplitPane: (owner, axis) => { if (owns())
            void controller.splitPane(owner, axis); } };
}
/** Semantic, authority-free view for the route state machine. */
export function TockTutorRouteView(props) {
    const { snapshot } = props;
    const active = props.active !== false;
    const ownerLifetime = props.paneController?.paneLifetimeFor(snapshot.focusedPaneId);
    const previewLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas'
        : snapshot.documentKind === 'base' ? 'Base' : 'Reading';
    const sourceLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas Source'
        : snapshot.documentKind === 'base' ? 'Base Source' : 'Markdown Source';
    const backlinkCount = snapshot.links?.backlinkDetails.length ?? 0;
    const backlinkLabel = `${String(backlinkCount)} backlink${backlinkCount === 1 ? '' : 's'}`;
    const documents = snapshot.entries.filter(entry => entry.kind === 'document' && supportedDocument(entry.path));
    const focusedPane = snapshot.panes.find(pane => pane.id === snapshot.focusedPaneId);
    const visibleTreeEntries = snapshot.entries.filter(entry => entry.kind === 'directory'
        || (entry.kind === 'document' && supportedDocument(entry.path)));
    const [localPanel, setLocalPanel] = useState(null);
    const panel = props.panePanel === undefined ? localPanel : props.panePanel;
    const setPanel = (value) => {
        const next = typeof value === 'function' ? value(panel) : value;
        if (props.onPanePanel)
            props.onPanePanel(next);
        else
            setLocalPanel(next);
    };
    const [noteAction, setNoteAction] = useState(null);
    const [bookmarkDialog, setBookmarkDialog] = useState(null);
    const [mergeOpen, setMergeOpen] = useState(false);
    const [mergeRecoveryOpen, setMergeRecoveryOpen] = useState(false);
    const [revealPath, setRevealPath] = useState(null);
    const [paletteView, setPaletteView] = useState(null);
    const [sidebarSearch, setSidebarSearch] = useState(true);
    const showSidebarSearch = sidebarSearch && snapshot.searchOpen && snapshot.searchPresentation === 'sidebar';
    const visiblePalette = paletteView ?? snapshotPalette(snapshot);
    const [assistantPanelWidth, setAssistantPanelWidth] = useState(DEFAULT_ASSISTANT_PANEL_WIDTH);
    const [baseView, setBaseView] = useState(null);
    const [baseSearches, setBaseSearches] = useState({});
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
    const [noteSearchMode, setNoteSearchMode] = useState(null);
    const [noteSearchQuery, setNoteSearchQuery] = useState('');
    const [noteSearchReplacement, setNoteSearchReplacement] = useState('');
    const [noteSearchState, setNoteSearchState] = useState({ current: null, query: '', total: 0 });
    const [noteSearchRequest, setNoteSearchRequest] = useState(null);
    const [noteSearchTransition, setNoteSearchTransition] = useState(undefined);
    const treeRef = useRef(null);
    const noteSearchOwner = JSON.stringify([snapshot.vault, snapshot.focusedPaneId, snapshot.path]);
    const noteSearchOwnerRef = useRef(noteSearchOwner);
    const noteSearchContextRef = useRef({ owner: noteSearchOwner, mode: snapshot.mode, query: noteSearchQuery, source: snapshot.source });
    useLayoutEffect(() => {
        noteSearchContextRef.current = { owner: noteSearchOwner, mode: snapshot.mode, query: noteSearchQuery, source: snapshot.source };
    }, [noteSearchOwner, snapshot.mode, noteSearchQuery, snapshot.source]);
    const consumedNoteSearchIdRef = useRef(null);
    const noteSearchRequestIdRef = useRef(0);
    const pendingNoteSearchRequestRef = useRef(null);
    const lastEditingModeRef = useRef(snapshot.mode === 'source'
        ? 'source'
        : snapshot.mode === 'live-preview'
            ? 'live-preview'
            : snapshot.settings?.defaultEditingMode === 'source' ? 'source' : 'live-preview');
    const toggleReadingView = () => { props.onMode(snapshot.mode === 'reading' ? lastEditingModeRef.current : 'reading'); };
    const activeBookmarks = noteBookmarksForPath(snapshot.bookmarks ?? [], snapshot.path);
    const bookmarkGroupOptions = bookmarkGroups(snapshot.bookmarks ?? []);
    const bookmarkActionLabel = activeBookmarks.length > 0 ? 'Edit Bookmark…' : 'Bookmark Note…';
    const nativeNoteActionAvailable = props.nativeNoteActions != null
        && !props.nativeNoteActions.disabled
        && snapshot.path !== null
        && snapshot.vault !== null
        && props.nativeNoteActions.activePath === snapshot.path
        && sameVault(props.nativeNoteActions.vault, snapshot.vault);
    const noteSearchAvailable = snapshot.documentKind === 'markdown' && snapshot.path !== null;
    const openNoteSearch = (mode) => {
        if (!noteSearchAvailable)
            return;
        setNoteSearchMode(mode);
        setNoteSearchTransition(undefined);
    };
    const closeNoteSearch = () => {
        pendingNoteSearchRequestRef.current = null;
        noteSearchRequestIdRef.current += 1;
        setNoteSearchRequest(null);
        setNoteSearchMode(null);
        setNoteSearchTransition(undefined);
        props.onFocusEditor?.();
    };
    const requestNoteSearch = (action, replacement) => {
        if (!noteSearchAvailable)
            return;
        const handoff = snapshot.mode === 'reading' && (action === 'replace' || action === 'replace-all');
        const mode = handoff ? lastEditingModeRef.current : snapshot.mode;
        const id = noteSearchRequestIdRef.current += 1;
        const owned = {
            owner: noteSearchOwner, query: noteSearchQuery, mode, source: snapshot.source,
            request: {
                action, id, ...(replacement === undefined ? {} : { replacement }),
                consume: () => {
                    const current = noteSearchContextRef.current;
                    if (consumedNoteSearchIdRef.current === id || id !== noteSearchRequestIdRef.current
                        || current.owner !== owned.owner || current.query !== owned.query
                        || current.mode !== owned.mode || current.source !== owned.source)
                        return false;
                    consumedNoteSearchIdRef.current = id;
                    setNoteSearchRequest(current => current?.request.id === id ? null : current);
                    return true;
                },
            },
        };
        if (handoff) {
            pendingNoteSearchRequestRef.current = owned;
            setNoteSearchTransition(`Switching to ${mode === 'source' ? 'Source' : 'Live Preview'} to replace.`);
            props.onMode(mode);
            return;
        }
        setNoteSearchRequest(owned);
    };
    const activeNoteSearchRequest = noteSearchRequest !== null
        && noteSearchRequest.owner === noteSearchOwner && noteSearchRequest.query === noteSearchQuery
        && noteSearchRequest.mode === snapshot.mode && noteSearchRequest.source === snapshot.source
        ? noteSearchRequest.request : null;
    const onNoteSearchState = useCallback((state) => {
        if (state.query !== noteSearchQuery)
            return;
        setNoteSearchState(current => current.current === state.current && current.error === state.error && current.query === state.query && current.total === state.total && current.truncated === state.truncated ? current : state);
        if (noteSearchTransition !== undefined && snapshot.mode !== 'reading')
            setNoteSearchTransition(undefined);
    }, [noteSearchQuery, noteSearchTransition, snapshot.mode]);
    const openBookmarkEditor = () => {
        const first = activeBookmarks[0];
        setBookmarkDialog(first === undefined ? { mode: 'create' } : { id: first.id, mode: 'edit' });
    };
    const requestReveal = () => {
        const path = snapshot.path;
        if (path === null || props.onRevealFile === undefined)
            return;
        setSidebarOpen(true);
        setSidebarSearch(false);
        void Promise.resolve(props.onRevealFile()).then(success => {
            if (success !== false && path === snapshot.path) {
                if (props.onPaneReveal)
                    props.onPaneReveal(path);
                else
                    setRevealPath(path);
            }
        });
    };
    const activePalette = useRef(visiblePalette);
    useEffect(() => { activePalette.current = visiblePalette; }, [visiblePalette]);
    const paletteOpener = useRef(null);
    const paletteNavigating = useRef(false);
    const rememberPaletteOpener = () => {
        if (paletteOpener.current?.isConnected === true)
            return;
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && activeElement !== document.body)
            paletteOpener.current = activeElement;
    };
    const restorePaletteOpener = (event) => {
        // Radix closes the old FocusScope after the next palette has mounted.
        if (activePalette.current !== null) {
            event.preventDefault();
            return;
        }
        const opener = paletteOpener.current;
        paletteOpener.current = null;
        if (paletteNavigating.current) {
            paletteNavigating.current = false;
            event.preventDefault();
            props.onFocusEditor?.();
            return;
        }
        if (opener === null || !opener.isConnected || opener.closest('[aria-hidden="true"], [inert]') !== null)
            return;
        event.preventDefault();
        opener.focus();
    };
    const openSearch = (opener) => {
        if (opener !== undefined)
            paletteOpener.current = opener;
        else
            rememberPaletteOpener();
        setPaletteView('notes');
        props.onOpenSearch?.();
    };
    useEffect(() => {
        setBaseView(null);
        setBaseSearches({});
        setRevealPath(null);
        setBookmarkDialog(null);
        setMergeOpen(false);
        setMergeRecoveryOpen(false);
    }, [snapshot.path]);
    useEffect(() => {
        if (snapshot.mode === 'source' || snapshot.mode === 'live-preview')
            lastEditingModeRef.current = snapshot.mode;
    }, [snapshot.mode]);
    useEffect(() => {
        const owner = noteSearchOwner;
        if (noteSearchOwnerRef.current === owner)
            return;
        noteSearchOwnerRef.current = owner;
        noteSearchRequestIdRef.current += 1;
        pendingNoteSearchRequestRef.current = null;
        setNoteSearchMode(null);
        setNoteSearchRequest(null);
        setNoteSearchQuery('');
        setNoteSearchReplacement('');
        setNoteSearchState({ current: null, query: '', total: 0 });
        setNoteSearchTransition(undefined);
    }, [noteSearchOwner]);
    useEffect(() => {
        if (noteSearchRequest !== null && activeNoteSearchRequest === null)
            setNoteSearchRequest(null);
    }, [noteSearchRequest, activeNoteSearchRequest]);
    useEffect(() => {
        const pending = pendingNoteSearchRequestRef.current;
        if (pending === null || snapshot.mode === 'reading')
            return;
        pendingNoteSearchRequestRef.current = null;
        if (pending.owner === noteSearchOwner && pending.query === noteSearchQuery && pending.mode === snapshot.mode && pending.source === snapshot.source)
            setNoteSearchRequest(pending);
    }, [snapshot.mode, noteSearchOwner, noteSearchQuery, snapshot.source]);
    useEffect(() => {
        if (revealPath === null)
            return;
        const path = revealPath;
        const tree = treeRef.current;
        if (tree === null)
            return;
        for (const directory of Array.from(tree.querySelectorAll('[data-tree-directory]'))) {
            const directoryPath = directory.dataset.treeDirectory;
            if (directoryPath !== undefined && path.startsWith(`${directoryPath}/`)) {
                if (directory instanceof HTMLDetailsElement)
                    directory.open = true;
            }
        }
        const timer = window.setTimeout(() => {
            const row = Array.from(tree.querySelectorAll('[data-tree-path]'))
                .find(candidate => candidate.dataset.treePath === path);
            if (row === undefined)
                return;
            row.scrollIntoView({ block: 'nearest' });
            row.focus();
            setRevealPath(null);
        }, 0);
        return () => { window.clearTimeout(timer); };
    }, [revealPath, snapshot.entries]);
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
    const titlebar = active ? (_jsxs("section", { "aria-label": "TockTutor Title Bar", className: "tocktutor-titlebar absolute top-0 right-0 left-0 z-[2147483647] grid h-[var(--tockteam-titlebar-height,40px)] grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)] border-b border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] text-[var(--tt-text)] transition-[grid-template-columns] duration-300 ease-out [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [-webkit-app-region:drag] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_button]:text-inherit [&_button]:[font:inherit] [&_button]:[-webkit-app-region:no-drag] [&_svg]:block [&_svg]:size-[18px]", style: {
            gridTemplateColumns: titlebarColumns,
            transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
        }, children: [_jsxs("div", { className: "tocktutor-titlebar-sidebar flex min-w-0 items-center justify-start gap-2 border-r border-[var(--tt-border)] pr-1 pl-[46px] [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)] [&>span]:inline-flex [&>span]:h-7 [&>span]:w-[22px] [&>span]:items-center [&>span]:justify-center [&>span]:border-0 [&>span]:bg-transparent [&>span]:p-0 [&>span]:text-[var(--tt-muted)]", children: [effectiveSidebarOpen && (_jsxs(_Fragment, { children: [_jsx(Button, { unstyled: true, "aria-label": "Show Files", "aria-pressed": !showSidebarSearch, className: "h-7 w-[22px] rounded-[5px] aria-pressed:bg-[color-mix(in_srgb,var(--tt-text)_8%,transparent)]", onClick: () => { setSidebarSearch(false); }, title: "Files", type: "button", children: _jsx(FolderOpen, { "aria-hidden": "true" }) }), _jsx(Button, { unstyled: true, "aria-label": "Search Vault", "aria-pressed": showSidebarSearch, className: "h-7 w-[22px] rounded-[5px] aria-pressed:bg-[color-mix(in_srgb,var(--tt-text)_8%,transparent)]", disabled: props.onOpenSidebarSearch === undefined, onClick: () => { setSidebarSearch(true); props.onOpenSidebarSearch?.(); }, title: "Search vault in sidebar", type: "button", children: _jsx(Search, { "aria-hidden": "true" }) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "Search Notes", className: "border-0 bg-transparent p-0", disabled: props.onOpenSearch === undefined, onClick: event => { openSearch(event.currentTarget); }, type: "button", children: _jsx(SlidersHorizontal, { "aria-hidden": "true" }) }) }) }), _jsx(TooltipContent, { children: "Search Notes" })] }), _jsx(Button, { unstyled: true, "aria-label": "Bookmark Active Note", className: "h-7 w-[22px] border-0 bg-transparent p-0", disabled: snapshot.path === null || (activeBookmarks.length === 0 ? props.onAddBookmark === undefined : props.onEditBookmark === undefined), onClick: openBookmarkEditor, type: "button", children: _jsx(WorkbenchGlyph, { kind: "bookmark" }) })] })), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-expanded": effectiveSidebarOpen, "aria-label": "Toggle Files Sidebar", className: "tocktutor-panel-icon ml-auto size-9 border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setSidebarOpen(open => !open); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel" }) }) }), _jsx(TooltipContent, { children: "Toggle Files Sidebar" })] })] }), _jsxs("div", { className: "tocktutor-titlebar-main flex min-w-0 items-center gap-1 pl-2 pr-3.5", children: [_jsxs("span", { className: "tocktutor-history mr-[18px] flex gap-[5px] px-1.5", children: [_jsx(Button, { unstyled: true, "aria-label": "Go Back", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoBack !== true, onClick: props.onBack, type: "button", children: _jsx(WorkbenchGlyph, { kind: "back" }) }), _jsx(Button, { unstyled: true, "aria-label": "Go Forward", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoForward !== true, onClick: props.onForward, type: "button", children: _jsx(WorkbenchGlyph, { kind: "forward" }) })] }), _jsx("div", { className: "tocktutor-tabs -mx-[var(--tt-tab-curve)] -mb-px flex max-w-[min(48rem,58vw)] min-w-0 self-stretch items-end gap-1 overflow-x-auto overflow-y-hidden px-[var(--tt-tab-curve)] [--tt-tab-curve:16px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", ...(focusedPane?.tabs.length ? { 'aria-label': 'Note Tabs', role: 'tablist' } : {}), children: focusedPane?.tabs.map((tab, index) => (_jsxs("div", { className: "relative z-1 -mb-px flex h-[34px] min-w-[118px] max-w-[220px] items-center gap-2 rounded-t-[5px] border border-b-0 border-transparent bg-[var(--tt-panel)] pr-2.5 pl-3 before:pointer-events-none before:absolute before:bottom-[-1px] before:left-[calc(var(--tt-tab-curve)*-1)] before:size-[var(--tt-tab-curve)] before:rounded-br-[var(--tt-tab-curve)] before:content-[''] before:[box-shadow:calc(var(--tt-tab-curve)/2)_calc(var(--tt-tab-curve)/2)_0_calc(var(--tt-tab-curve)/2)_var(--tt-panel)] after:pointer-events-none after:absolute after:right-[calc(var(--tt-tab-curve)*-1)] after:bottom-[-1px] after:size-[var(--tt-tab-curve)] after:rounded-bl-[var(--tt-tab-curve)] after:content-[''] after:[box-shadow:calc(var(--tt-tab-curve)/-2)_calc(var(--tt-tab-curve)/2)_0_calc(var(--tt-tab-curve)/2)_var(--tt-panel)] data-[active=false]:border-b data-[active=false]:border-[var(--tt-border)] data-[active=false]:bg-[color-mix(in_srgb,var(--tt-panel)_70%,transparent)] data-[active=false]:text-[var(--tt-muted)] data-[active=false]:shadow-none data-[active=false]:before:hidden data-[active=false]:after:hidden", "data-active": tab.path === focusedPane.activePath, role: "presentation", children: [_jsx(Button, { unstyled: true, "aria-selected": tab.path === focusedPane.activePath, className: "relative z-1 flex min-w-0 flex-1 items-center self-stretch border-0 bg-transparent p-0 text-left [&>span]:truncate", onClick: () => { props.onActivateTab(focusedPane.id, tab.path); }, onKeyDown: event => {
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
                                    }, "aria-controls": props.paneController ? `tocktutor-note-editor-${focusedPane.id}` : 'tocktutor-note-editor', role: "tab", tabIndex: tab.path === focusedPane.activePath ? 0 : -1, title: tab.path, type: "button", children: _jsxs("span", { children: [tab.dirty && _jsx("span", { "aria-label": "Unsaved", children: "\u2022" }), fileName(tab.path)] }) }), _jsx(Button, { unstyled: true, "aria-label": `Close ${fileName(tab.path)}`, className: "relative z-1 inline-flex size-5 shrink-0 translate-x-0.5 items-center justify-center rounded border-0 bg-transparent p-0 text-[var(--tt-muted)] [&_svg]:size-3!", onClick: () => { props.onCloseTab?.(focusedPane.id, tab.path); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] }, tab.path))) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "New Note", className: "tocktutor-new-tab border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", disabled: props.onNewNote === undefined, onClick: props.onNewNote, type: "button", children: _jsx(WorkbenchGlyph, { kind: "new" }) }) }) }), _jsx(TooltipContent, { children: "New Note" })] }), _jsx("span", { className: "tocktutor-titlebar-spacer flex-1" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-expanded": panel === 'assistant', "aria-label": "Toggle Assistant Panel", className: "tocktutor-panel-icon border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel-right" }) }) }), _jsx(TooltipContent, { children: "Toggle Assistant Panel" })] })] })] })) : null;
    const noteDialogs = _jsxs(_Fragment, { children: ["      ", noteAction !== null && snapshot.path !== null && (_jsx(NoteValueDialog, { initialValue: noteAction === 'property' ? '' : noteAction === 'rename'
                    ? noteTitle(snapshot.path)
                    : snapshot.path.includes('/') ? snapshot.path.slice(0, snapshot.path.lastIndexOf('/')) : '', kind: noteAction, onCancel: () => { setNoteAction(null); }, validate: value => {
                    if (noteAction !== 'property')
                        return null;
                    const key = value.trim();
                    if (key === '')
                        return 'Enter a property name.';
                    return parseFrontmatterProperties(snapshot.source).some(property => property.key.toLocaleLowerCase() === key.toLocaleLowerCase())
                        ? 'A property with this name already exists.' : null;
                }, onSubmit: value => noteAction === 'property'
                    ? props.onSetProperty?.(value.trim(), '') ?? false
                    : noteAction === 'rename'
                        ? props.onRenameTitle?.(value) ?? false
                        : props.onMoveNote?.(value) ?? false }, `${snapshot.path}:${noteAction}`)), mergeOpen && snapshot.path && props.onPrepareNoteMerge && _jsx(NoteMergeReview, { sourcePath: snapshot.path, paths: documents.map(entry => entry.path), onPrepare: props.onPrepareNoteMerge, onClose: () => setMergeOpen(false) }, `${snapshot.vault?.id}:${snapshot.vault?.generation}:${snapshot.path}`), mergeRecoveryOpen && props.onListMergeRecovery && props.onRecoverNoteMerge && _jsx(MergeRecoveryDialog, { onList: props.onListMergeRecovery, onRecover: props.onRecoverNoteMerge, onClose: () => setMergeRecoveryOpen(false) }, `${snapshot.vault?.id}:${snapshot.vault?.generation}`), bookmarkDialog !== null && snapshot.path !== null && (_jsx(BookmarkDialog, { bookmarks: activeBookmarks, groups: bookmarkGroupOptions, initialBookmarkId: bookmarkDialog.mode === 'edit' ? bookmarkDialog.id : null, mode: bookmarkDialog.mode, path: snapshot.path, onCancel: () => { setBookmarkDialog(null); }, onRemove: id => props.onRemoveBookmark?.(id) ?? false, onSubmit: (id, title, group) => id === null
                    ? props.onAddBookmark?.(title, group) ?? false
                    : props.onEditBookmark?.(id, title, group) ?? false }, `${snapshot.path}:${bookmarkDialog.mode}:${bookmarkDialog.mode === 'edit' ? bookmarkDialog.id : 'new'}`))] });
    const editor = (_jsxs("section", { "aria-label": "Note Editor", className: `tocktutor-editor grid h-full min-h-0 min-w-0 ${noteSearchMode === null ? 'grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)]' : 'grid-rows-[40px_auto_minmax(0,1fr)_var(--tt-footer-height)]'} overflow-hidden bg-[var(--tt-panel)]`, id: props.paneOnly ? `tocktutor-note-editor-${snapshot.focusedPaneId}` : 'tocktutor-note-editor', role: "tabpanel", children: [_jsxs("header", { className: "tocktutor-editor-header relative flex min-w-0 items-center justify-center border-b border-[var(--tt-border)] px-2.5", children: [_jsx("h2", { className: "m-0 truncate text-[13px] font-medium text-[var(--tt-muted)]", children: noteTitle(snapshot.path) }), _jsxs("div", { className: "tocktutor-editor-actions absolute right-2.5 flex items-center gap-1 [&>button]:inline-flex [&>button]:h-7 [&>button]:w-[26px] [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)]", children: [snapshot.documentKind === 'markdown' ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'reading' ? 'Switch to Editing View' : 'Switch to Reading View', disabled: snapshot.path === null, onClick: toggleReadingView, type: "button", children: snapshot.mode === 'reading' ? _jsx(Pencil, { "aria-hidden": "true" }) : _jsx(FileText, { "aria-hidden": "true" }) }) }), _jsx(TooltipContent, { children: snapshot.mode === 'reading' ? 'Switch to Editing View' : 'Switch to Reading View' })] })) : (_jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'source' ? previewLabel : sourceLabel, onClick: () => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "pencil" }) })), _jsxs(DropdownMenu, { modal: false, children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "More Note Actions", className: "inline-flex h-7 w-[26px] items-center justify-center border-0 bg-transparent p-0 text-[var(--tt-muted)]", type: "button", children: _jsx(WorkbenchGlyph, { kind: "more" }) }) }) }), _jsx(TooltipContent, { children: "More Note Actions" })] }), _jsxs(DropdownMenuContent, { align: "end", alignOffset: 26, className: "max-h-(--radix-dropdown-menu-content-available-height) w-max min-w-[196px] max-w-[min(360px,calc(100vw-16px))] overflow-y-auto rounded-[8px] border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] p-1.5 text-[var(--dsw-alias-label-primary,#27272a)] shadow-xl [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]", collisionPadding: { bottom: 8, left: 8, right: 8, top: 48 }, onCloseAutoFocus: event => {
                                            const current = props.paneController?.getSnapshot();
                                            if (current && current.focusedPaneId !== snapshot.focusedPaneId)
                                                event.preventDefault();
                                        }, portalled: false, sideOffset: 6, unstyled: true, children: [snapshot.documentKind === 'markdown' && (_jsxs(_Fragment, { children: [_jsxs(DropdownMenuCheckboxItem, { checked: snapshot.settings?.backlinksInDocument ?? false, className: NOTE_ACTION_CLASS, disabled: snapshot.settings === undefined, onSelect: () => { props.onSettingsChange?.({ backlinksInDocument: !(snapshot.settings?.backlinksInDocument ?? false) }); }, children: [_jsx(Link2, { "aria-hidden": "true" }), _jsx("span", { children: "Backlinks in Document" })] }), _jsxs(DropdownMenuGroup, { "aria-label": "Editor Mode", children: [_jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, onSelect: toggleReadingView, children: [snapshot.mode === 'reading' ? _jsx(Pencil, { "aria-hidden": "true" }) : _jsx(FileText, { "aria-hidden": "true" }), _jsx("span", { children: snapshot.mode === 'reading' ? 'Editing View' : 'Reading View' })] }), _jsxs(DropdownMenuCheckboxItem, { checked: snapshot.mode === 'source', className: NOTE_ACTION_CLASS, onSelect: () => { props.onMode(snapshot.mode === 'source' ? 'live-preview' : 'source'); }, children: [_jsx(FileCode2, { "aria-hidden": "true" }), _jsx("span", { children: "Source Mode" })] })] }), _jsx(DropdownMenuSeparator, {})] })), _jsxs(DropdownMenuGroup, { children: [_jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || snapshot.panes.length >= MAX_PANE_GROUPS || props.onSplitPane === undefined, onSelect: () => { props.onSplitPane?.(snapshot.focusedPaneId, 'horizontal'); }, children: [_jsx(PanelsTopLeft, { "aria-hidden": "true" }), _jsx("span", { children: "Split Right" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || snapshot.panes.length >= MAX_PANE_GROUPS || props.onSplitPane === undefined, onSelect: () => { props.onSplitPane?.(snapshot.focusedPaneId, 'vertical'); }, children: [_jsx(PanelsTopLeft, { "aria-hidden": "true" }), _jsx("span", { children: "Split Down" })] }), snapshot.panes.length > 1 && _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, onSelect: () => { props.onClosePane?.(snapshot.focusedPaneId); }, children: [_jsx(X, { "aria-hidden": "true" }), _jsx("span", { children: "Close Pane" })] })] }), _jsx(DropdownMenuSeparator, {}), props.nativeNoteActions != null && _jsxs(_Fragment, { children: [_jsx(DropdownMenuGroup, { children: _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: props.nativeNoteActions.disabled || snapshot.path === null || snapshot.vault === null || props.nativeNoteActions.activePath !== snapshot.path || !sameVault(props.nativeNoteActions.vault, snapshot.vault), onSelect: () => { props.nativeNoteActions?.run('open-window'); }, children: [_jsx(ExternalLink, { "aria-hidden": "true" }), _jsx("span", { children: "Open in New Window" })] }) }), _jsx(DropdownMenuSeparator, {})] }), _jsxs(DropdownMenuGroup, { children: [_jsxs(DropdownMenuItem, { "aria-label": "Rename Note", className: NOTE_ACTION_CLASS, disabled: snapshot.documentKind !== 'markdown' || props.onRenameTitle === undefined, onSelect: () => { setNoteAction('rename'); }, children: [_jsx(Pencil, { "aria-hidden": "true" }), _jsx("span", { children: "Rename Note\u2026" })] }), _jsxs(DropdownMenuItem, { "aria-label": "Move Note", className: NOTE_ACTION_CLASS, disabled: snapshot.documentKind !== 'markdown' || props.onMoveNote === undefined, onSelect: () => { setNoteAction('move'); }, children: [_jsx(FolderInput, { "aria-hidden": "true" }), _jsx("span", { children: "Move Note\u2026" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || (activeBookmarks.length === 0 ? props.onAddBookmark === undefined : props.onEditBookmark === undefined), onSelect: openBookmarkEditor, children: [_jsx(BookmarkPlus, { "aria-hidden": "true" }), _jsx("span", { children: bookmarkActionLabel })] }), props.onPrepareNoteMerge && _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || snapshot.documentKind !== 'markdown', onSelect: () => setMergeOpen(true), children: [_jsx(Merge, { "aria-hidden": "true" }), _jsx("span", { children: "Merge Entire File With\u2026" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.documentKind !== 'markdown' || snapshot.path === null || props.onSetProperty === undefined, onSelect: () => { setNoteAction('property'); }, children: [_jsx(Plus, { "aria-hidden": "true" }), _jsx("span", { children: "Add Property" })] }), props.nativeNoteActions != null && _jsxs(DropdownMenuItem, { "aria-label": "Export PDF", className: NOTE_ACTION_CLASS, disabled: props.nativeNoteActions.disabled || snapshot.path === null || snapshot.vault === null || props.nativeNoteActions.activePath !== snapshot.path || !sameVault(props.nativeNoteActions.vault, snapshot.vault), onSelect: () => { props.nativeNoteActions?.run('export-pdf'); }, children: [_jsx(FileDown, { "aria-hidden": "true" }), _jsx("span", { children: "Export PDF\u2026" })] })] }), _jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuGroup, { children: [_jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: !noteSearchAvailable, onSelect: () => { openNoteSearch('find'); }, children: [_jsx(Search, { "aria-hidden": "true" }), _jsx("span", { children: "Find\u2026" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: !noteSearchAvailable, onSelect: () => { openNoteSearch('replace'); }, children: [_jsx(Pencil, { "aria-hidden": "true" }), _jsx("span", { children: "Replace\u2026" })] })] }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuGroup, { children: _jsxs(DropdownMenuSub, { children: [_jsxs(DropdownMenuSubTrigger, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || (props.onCopyGraphPath === undefined && !nativeNoteActionAvailable), children: [_jsx(Copy, { "aria-hidden": "true" }), _jsx("span", { children: "Copy Path" })] }), _jsxs(DropdownMenuSubContent, { unstyled: true, className: NOTE_SUBMENU_CLASS, children: [_jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || props.onCopyGraphPath === undefined, onSelect: () => { if (snapshot.path !== null)
                                                                        props.onCopyGraphPath?.(snapshot.path); }, children: [_jsx(Copy, { "aria-hidden": "true" }), _jsx("span", { children: "Copy Relative Path" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: !nativeNoteActionAvailable, onSelect: () => { props.nativeNoteActions?.run('copy-absolute'); }, children: [_jsx(Copy, { "aria-hidden": "true" }), _jsx("span", { children: "Copy Absolute Path" })] })] })] }) }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuGroup, { children: _jsxs(DropdownMenuSub, { children: [_jsxs(DropdownMenuSubTrigger, { className: NOTE_ACTION_CLASS, disabled: snapshot.documentKind !== 'markdown' || !props.paneController || snapshot.panes.length >= MAX_PANE_GROUPS, children: [_jsx(Link2, { "aria-hidden": "true" }), _jsx("span", { children: "Open Linked View" })] }), _jsx(DropdownMenuSubContent, { unstyled: true, className: NOTE_SUBMENU_CLASS, collisionPadding: { top: 48, bottom: 8, left: 8, right: 8 }, children: _jsx(DropdownMenuGroup, { children: LINKED_VIEW_KINDS.map(kind => _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, onSelect: () => {
                                                                        const controller = props.paneController;
                                                                        if (controller && controller.paneLifetimeFor(snapshot.focusedPaneId) === ownerLifetime && snapshot.vault && sameVault(controller.getSnapshot().vault, snapshot.vault) && controller.getPaneSnapshot(snapshot.focusedPaneId).path === snapshot.path)
                                                                            void controller.openLinkedView(snapshot.focusedPaneId, kind);
                                                                    }, children: [kind === 'graph' ? _jsx(Network, { "aria-hidden": "true" }) : kind === 'outline' || kind === 'properties' ? _jsx(ListTree, { "aria-hidden": "true" }) : _jsx(Link2, { "aria-hidden": "true" }), _jsx("span", { children: LINKED_VIEW_TITLES[kind] })] }, kind)) }) })] }) }), _jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuGroup, { children: [props.nativeNoteActions != null && _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: !nativeNoteActionAvailable || snapshot.documentUnavailable || !['markdown', 'canvas', 'base'].includes(snapshot.documentKind ?? ''), onSelect: () => { props.nativeNoteActions?.run('open-default'); }, children: [_jsx(ExternalLink, { "aria-hidden": "true" }), _jsx("span", { children: "Open in Default App" })] }), props.nativeNoteActions != null && _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: props.nativeNoteActions.disabled || snapshot.path === null || snapshot.vault === null || props.nativeNoteActions.activePath !== snapshot.path || !sameVault(props.nativeNoteActions.vault, snapshot.vault), onSelect: () => { props.nativeNoteActions?.run('reveal'); }, children: [_jsx(FolderOpen, { "aria-hidden": "true" }), _jsx("span", { children: "Reveal in Finder" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || props.onRevealFile === undefined, onSelect: requestReveal, children: [_jsx(FolderOpen, { "aria-hidden": "true" }), _jsx("span", { children: "Reveal File in Navigation" })] })] }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuGroup, { children: [
                                                    ['recovery', 'File Recovery', FileClock],
                                                    ['outline', 'Outline', ListTree],
                                                    ['properties', 'Properties', ListTree],
                                                    ['backlinks', 'Backlinks', Link2],
                                                    ['graph', 'Graph View', Network],
                                                    ['web', 'Web Viewer', Globe2],
                                                    ['bookmarks', 'Bookmarks', BookmarkPlus],
                                                    ['tags', 'Tags', Tags],
                                                    ['attachments', 'Attachments and Embeds', Paperclip],
                                                    ['tools', 'Note Tools', Wrench],
                                                    ['workspace', 'Workspaces and Panes', PanelsTopLeft],
                                                    ['extensions', 'Reviews and Actions', MessageSquare],
                                                ].map(([view, label, Icon]) => (_jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, onSelect: () => {
                                                        setPanel(view);
                                                        if (view === 'properties' || view === 'tags')
                                                            props.onLoadFacets?.();
                                                        if (view === 'backlinks')
                                                            props.onLoadRelationships?.();
                                                        if (view === 'recovery')
                                                            props.onOpenRecovery?.();
                                                    }, children: [_jsx(Icon, { "aria-hidden": "true" }), _jsx("span", { children: label })] }, view))) }), _jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuGroup, { children: [props.onListMergeRecovery && props.onRecoverNoteMerge && _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.vault === null, onSelect: () => setMergeRecoveryOpen(true), children: [_jsx(FileClock, { "aria-hidden": "true" }), _jsx("span", { children: "Merge Recovery" })] }), _jsxs(DropdownMenuItem, { className: `${NOTE_ACTION_CLASS} text-[color:var(--dsw-alias-state-error-primary,#dc2626)]!`, disabled: snapshot.path === null || props.onTrashCurrent === undefined, onSelect: () => { props.onTrashCurrent?.(); }, children: [_jsx(Trash2, { "aria-hidden": "true" }), _jsx("span", { children: "Move File to Trash" })] })] })] })] })] })] }), noteSearchMode !== null && (_jsx(NoteFindReplaceStrip, { mode: noteSearchMode, onClose: closeNoteSearch, onQueryChange: query => {
                    pendingNoteSearchRequestRef.current = null;
                    noteSearchRequestIdRef.current += 1;
                    setNoteSearchQuery(query);
                    setNoteSearchState({ current: null, query, total: 0 });
                    setNoteSearchRequest(null);
                }, onRequest: requestNoteSearch, onReplacementChange: setNoteSearchReplacement, query: noteSearchQuery, replacement: noteSearchReplacement, state: noteSearchState, ...(noteSearchTransition === undefined ? {} : { transitionNotice: noteSearchTransition }) })), _jsxs("div", { "aria-label": "Editor Attachment Drop Zone", "data-document-backlinks": snapshot.settings?.backlinksInDocument === true, className: "tocktutor-editor-body relative min-h-0 overflow-auto data-[document-backlinks=true]:[&>section]:min-h-0", onDrop: event => {
                    if (event.dataTransfer.files.length === 0)
                        return;
                    event.preventDefault();
                    props.onAttachFiles?.(event.dataTransfer.files);
                }, onPaste: event => {
                    if (event.clipboardData.files.length === 0)
                        return;
                    props.onAttachFiles?.(event.clipboardData.files);
                }, children: [snapshot.mergeRecoveryPending && props.onListMergeRecovery && _jsxs(Alert, { children: [_jsx("p", { children: "Merge Recovery Needs Attention" }), _jsx(Button, { variant: "outline", onClick: () => setMergeRecoveryOpen(true), children: "Review Merge Recovery" })] }), snapshot.message.startsWith('This pane changed in another view.') && _jsx(Alert, { role: "alert", children: snapshot.message }), snapshot.path === null ? (_jsx(Empty, { unstyled: true, className: "tocktutor-empty absolute top-[45%] left-1/2 w-full max-w-[420px] -translate-1/2 p-8 text-center", children: _jsxs(EmptyHeader, { unstyled: true, children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Ready When You Are" }), _jsx(EmptyTitle, { unstyled: true, "aria-level": 2, className: "text-xl font-bold", role: "heading", children: "Select a Note" }), _jsx(EmptyDescription, { unstyled: true, className: "text-[var(--tt-muted)]", children: "Choose a Markdown note from the vault to read or edit its exact source." })] }) })) : props.paneOnly && snapshot.revision === null ? _jsx(Alert, { unstyled: true, children: "Loading this note\u2026" }) : snapshot.mode === 'source' ? (_jsx("div", { className: "flex h-full min-h-0 flex-col", children: _jsx(SourceEditor, { ariaLabel: sourceLabel, className: "h-full", content: snapshot.source, localEditRevision: snapshot.localEditRevision, onContentChange: props.onEdit, ...(props.onRenameTitle === undefined ? {} : { onRenameTitle: props.onRenameTitle }), ...(noteSearchMode === null ? {} : { onSearchState: onNoteSearchState }), onSelectionChange: selection => { props.onSelectionChange?.(selection.main.from, selection.main.to); }, ...(noteSearchMode === null ? {} : { searchCurrentIndex: noteSearchState.current, searchQuery: noteSearchQuery, searchRequest: activeNoteSearchRequest }), selectionRequest: snapshot.selectionRequest, ...(snapshot.embeds === undefined ? {} : { resolvedEmbeds: snapshot.embeds }), spellCheck: true, title: noteTitle(snapshot.path) }, `${snapshot.path}:${snapshot.editorReset ?? 0}`) })) : snapshot.mode === 'live-preview' && snapshot.documentKind === 'markdown' ? (_jsx(LivePreviewView, { documentKey: snapshot.path, localEditRevision: snapshot.localEditRevision, embeds: snapshot.embeds, onAddProperty: key => props.onSetProperty?.(key, '') ?? false, onEdit: props.onEdit, onEditSource: () => { props.onMode('source'); }, ...(props.onOpenExternalUrl === undefined ? {} : { onOpenExternalUrl: props.onOpenExternalUrl }), ...(noteSearchMode === null ? {} : { onSearchState: onNoteSearchState }), onSelectionChange: selection => { props.onSelectionChange?.(selection.from, selection.to); }, ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), ...(noteSearchMode === null ? {} : { searchCurrentIndex: noteSearchState.current, searchQuery: noteSearchQuery, searchRequest: activeNoteSearchRequest }), onToggleTask: props.onToggleTask, source: snapshot.source, title: noteTitle(snapshot.path) }, `${snapshot.path}:${snapshot.editorReset ?? 0}`)) : snapshot.documentKind === 'canvas' ? (_jsx(CanvasBoard, { disabled: snapshot.revision === null || props.onCanvasChange === undefined, onChange: change => { props.onCanvasChange?.(change); }, revision: snapshot.revision ?? 'unavailable', source: snapshot.source })) : snapshot.documentKind === 'base' ? (_jsx(ExecutableBaseView, { activeView: baseView, files: snapshot.baseFiles ?? [], onActiveViewChange: setBaseView, onSearchChange: (view, search) => { setBaseSearches(current => ({ ...current, [view]: search })); }, searches: baseSearches, ...(props.onBaseCopy === undefined ? {} : { onCopy: props.onBaseCopy }), ...(props.onBaseEdit === undefined ? {} : { onEdit: props.onBaseEdit }), ...(props.onBaseExport === undefined ? {} : { onExport: props.onBaseExport }), source: snapshot.source })) : snapshot.documentKind === 'markdown' ? (_jsx(RichReadingView, { embeds: snapshot.embeds, onAddProperty: key => props.onSetProperty?.(key, '') ?? false, ...(props.onOpenExternalUrl === undefined ? {} : { onOpenExternalUrl: props.onOpenExternalUrl }), ...(props.onOpenInternalLink === undefined ? {} : { onOpenInternalLink: props.onOpenInternalLink }), ...(noteSearchMode === null ? {} : { onSearchState: onNoteSearchState, searchCurrentIndex: noteSearchState.current, searchQuery: noteSearchQuery, searchRequest: activeNoteSearchRequest }), ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), onToggleTask: props.onToggleTask, source: snapshot.source, title: noteTitle(snapshot.path) }, snapshot.path)) : (_jsx(Alert, { unstyled: true, children: "Reading view is unavailable." })), snapshot.path !== null && snapshot.documentKind === 'markdown' && snapshot.settings?.backlinksInDocument && (_jsxs("section", { "aria-label": "Backlinks in Document", className: "mx-auto mt-6 w-[calc(100%-48px)] max-w-[700px] border-t border-[var(--tt-border)] py-6 text-[var(--tt-text)]", children: [_jsx("h2", { className: "mb-3 text-sm font-medium", children: "Backlinks" }), _jsx(NoteBacklinks, { links: snapshot.links?.path === snapshot.path && snapshot.links?.generation === snapshot.vault?.generation ? snapshot.links : null, loading: snapshot.linksLoading === true, onRetry: props.onLoadRelationships, onSelect: props.onSelect }, `${snapshot.vault?.id}:${snapshot.vault?.generation}:${snapshot.path}`)] }))] }), _jsxs("footer", { "aria-label": "TockTutor Status Bar", className: "tocktutor-statusbar flex min-w-0 items-center border-t border-[var(--tt-border)] px-2 text-xs text-[var(--tt-muted)]", role: "group", children: [_jsx("output", { "aria-live": "polite", className: "tocktutor-message absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]", children: snapshot.message }), props.nativeNoteActions != null && props.nativeNoteActions.message !== 'Ready.' && _jsx("output", { "aria-live": "polite", className: "mr-3 min-w-0 truncate", children: props.nativeNoteActions.message }), _jsxs("div", { className: "tocktutor-document-stats ml-auto flex items-center gap-[18px] whitespace-nowrap max-[760px]:gap-2", children: [snapshot.path !== null && (_jsxs(_Fragment, { children: [_jsx("span", { children: backlinkLabel }), _jsx("span", { children: snapshot.mode === 'reading' ? 'Reading' : snapshot.mode === 'live-preview' ? 'Live Preview' : 'Source' })] })), _jsxs("span", { children: [String(words), " words"] }), _jsxs("span", { children: [String(characters), " characters"] }), snapshot.path !== null && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Open Assistant", "aria-expanded": panel === 'assistant', onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", className: "border-0 bg-transparent px-0 py-0.5 text-[var(--tt-muted)] [&_svg]:size-[17px]", children: _jsx(WorkbenchGlyph, { kind: "chat" }) }) }), _jsx(TooltipContent, { children: "Open Assistant" })] }))] })] })] }));
    if (props.paneOnly)
        return _jsx(TooltipProvider, { children: _jsxs("div", { className: "h-full min-h-0 min-w-0", "data-pane-id": snapshot.focusedPaneId, onPointerDownCapture: () => { props.onFocusPane?.(snapshot.focusedPaneId); }, onFocusCapture: () => { props.onFocusPane?.(snapshot.focusedPaneId); }, onKeyDown: event => {
                    const primary = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? '') ? event.metaKey : event.ctrlKey;
                    if (event.defaultPrevented || !primary || event.altKey || event.shiftKey || !noteSearchAvailable)
                        return;
                    if (event.key.toLowerCase() !== 'f' && event.key.toLowerCase() !== 'h')
                        return;
                    event.preventDefault();
                    openNoteSearch(event.key.toLowerCase() === 'h' ? 'replace' : 'find');
                }, children: [noteDialogs, editor] }) });
    return (_jsx(TooltipProvider, { children: _jsxs("main", { "aria-label": "TockTutor Workbench", onKeyDown: event => {
                if (event.defaultPrevented)
                    return;
                const isMac = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? '');
                const primary = isMac ? event.metaKey : event.ctrlKey;
                if (!primary || event.altKey || event.shiftKey || !noteSearchAvailable)
                    return;
                const key = event.key.toLocaleLowerCase();
                if (key !== 'f' && key !== 'h')
                    return;
                event.preventDefault();
                openNoteSearch(key === 'h' ? 'replace' : 'find');
            }, className: "tocktutor-workbench h-full min-h-0 box-border bg-[var(--tt-bg)] pt-0 text-[var(--tt-text)] [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-bg:var(--dsw-alias-bg-base,#fff)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-footer-height:28px] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_[hidden]]:!hidden [&_button]:text-inherit [&_button]:[font:inherit] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tt-accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tt-accent)] [&_svg]:block [&_svg]:size-4 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tt-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!delay-0 motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!delay-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!delay-0 motion-reduce:[&_*::before]:!duration-0", "data-focus-mode": snapshot.focusMode === true, "data-phase": snapshot.phase, tabIndex: -1, children: [titlebar !== null && (props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget)), snapshot.dispatchDialog !== null && (_jsx(NativeDispatchDialog, { kind: snapshot.dispatchDialog, onCancel: () => { props.onCancelDispatch?.(); }, onSubmit: draft => { props.onSubmitDispatch?.(draft); } })), noteDialogs, visiblePalette === 'commands' && (_jsx(WorkbenchCommandPalette, { canGoBack: snapshot.canGoBack === true, canGoForward: snapshot.canGoForward === true, canReopen: (snapshot.recentlyClosed?.length ?? 0) > 0, editorEnabled: snapshot.documentKind === 'markdown' && snapshot.mode !== 'reading', onBack: props.onBack, onClose: () => { setPaletteView(null); props.onCloseCommandPalette?.(); }, onCloseAutoFocus: restorePaletteOpener, onOpenAutoFocus: rememberPaletteOpener, onEditorCommand: props.onEditorCommand, onForward: props.onForward, onNewNote: props.onNewNote, onReopen: props.onReopenClosedTab, onSearch: () => { openSearch(); }, onToggleFocus: props.onToggleFocusMode })), visiblePalette === 'notes' && (_jsx(WorkbenchNoteSearchPalette, { onClose: navigation => { paletteNavigating.current = navigation === true; setPaletteView(null); props.onCloseCommandPalette?.(); props.onCloseSearch?.(); }, onCloseAutoFocus: restorePaletteOpener, onCommands: () => { setPaletteView('commands'); props.onOpenCommandPalette?.(); props.onCloseSearch?.(); }, onOpenAutoFocus: rememberPaletteOpener, ...(props.onHideSearchPreview === undefined ? {} : { onHidePreview: props.onHideSearchPreview }), onLoadMoreSearch: props.onLoadMoreSearch, onQuickAnswer: props.onQuickAnswer, onCancelQuickAnswer: props.onCancelQuickAnswer, onRetryQuickAnswer: props.onRetryQuickAnswer, onRunSearch: props.onRunSearch, onSearchActiveMove: props.onSearchActiveMove, onSearchActiveSet: props.onSearchActiveSet, onSearchChange: props.onSearchChange, onSearchMode: props.onSearchMode, onSearchFilters: props.onSearchFilters, onSelect: props.onSelect, onSelectSearchMatch: props.onSelectSearchMatch, snapshot: snapshot })), _jsxs("div", { className: "tocktutor-grid relative grid h-full min-h-0 grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 ease-out", style: {
                        gridTemplateColumns: contentColumns,
                        transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
                        '--tocktutor-sidebar-width': `${String(sidebarWidth)}px`,
                    }, children: [_jsxs("aside", { "aria-hidden": !effectiveSidebarOpen, "aria-label": showSidebarSearch ? 'Vault Search' : 'Files', className: "tocktutor-sidebar grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden border-r border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] data-[open=false]:invisible data-[open=false]:[transition:visibility_0s_linear_300ms]", "data-open": effectiveSidebarOpen, ...(effectiveSidebarOpen ? {} : { inert: '' }), children: [_jsx("header", { className: "tocktutor-sidebar-header flex items-center border-b border-[var(--tt-border)] px-2.5", children: _jsx("h1", { className: "m-0 text-sm font-semibold", children: showSidebarSearch ? 'Search' : 'Files' }) }), _jsx("div", { className: "tocktutor-sidebar-content min-h-0 overflow-auto px-[5px] py-[3px]", children: showSidebarSearch ? _jsx(SidebarSearch, { snapshot: snapshot, onChange: props.onSearchChange, onRun: props.onRunSearch, onLoadMore: props.onLoadMoreSearch, onSelect: props.onSelectSearchMatch }) : _jsxs("nav", { "aria-label": "Vault Notes", ref: treeRef, children: [snapshot.phase === 'loading' && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "Loading notes\u2026" }), snapshot.phase === 'inactive' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: "No Active Vault" }), snapshot.phase === 'error' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: snapshot.message }), snapshot.phase === 'ready' && documents.length === 0 && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "No supported notes found." }), _jsx("ul", { className: "tocktutor-tree m-0 list-none p-0", children: _jsx(TreeEntries, { entries: visibleTreeEntries, onSelect: props.onSelect, path: snapshot.path, revealPath: revealPath }) })] }) }), _jsx(WorkbenchVaultDialog, { onCreateManagedVault: props.onCreateManagedVault, renderVaultActions: props.renderVaultActions, vault: snapshot.vault, vaultDisplayPath: snapshot.vaultDisplayPath ?? null, vaultName: snapshot.vaultName ?? null })] }), _jsx(Button, { unstyled: true, "aria-label": `Resize Files Sidebar, ${String(sidebarWidth)} Pixels`, className: "tocktutor-sidebar-resize absolute top-0 bottom-0 z-5 m-0 w-2 touch-none cursor-ew-resize border-0 bg-transparent p-0 outline-none after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-0.5 after:bg-transparent after:content-[''] focus-visible:after:bg-[var(--tt-accent)]", hidden: !effectiveSidebarOpen, onKeyDown: resizeSidebarWithKeyboard, onPointerDown: beginSidebarResize, style: { left: sidebarWidth - 4 }, title: "Drag or Use Left and Right Arrow Keys", type: "button" }), props.paneController && snapshot.layout ? _jsx(PaneLayoutView, { layout: snapshot.layout, onResize: (path, ratio) => { props.paneController.resizeSplit(path, ratio); }, renderPane: id => (snapshot.panes.find(pane => pane.id === id)?.linkedView ? _jsx(LinkedNotePane, { controller: props.paneController, id: id }) : _jsx(TockTutorRouteView, { ...boundPaneProps(props, id), paneOnly: true, panePanel: panel, onPanePanel: setPanel, onPaneReveal: path => { setSidebarOpen(true); setSidebarSearch(false); setRevealPath(path); } })) }) : editor, _jsxs("aside", { "aria-hidden": panel !== 'assistant', "aria-label": "Assistant Panel", className: "tocktutor-right-panel tocktutor-right-panel-assistant relative invisible grid min-w-0 w-0 translate-x-6 grid-rows-[minmax(0,1fr)] overflow-hidden border-l-0 bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:translate-x-0 data-[open=true]:overflow-visible data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(240px,calc(100vw-262px))]", "data-open": panel === 'assistant', style: { width: panel === 'assistant' ? `${String(assistantPanelWidth)}px` : '0px' }, ...(panel === 'assistant' ? {} : { inert: '' }), children: [panel === 'assistant' && (_jsx(Button, { unstyled: true, "aria-label": "Resize Assistant Panel", "aria-orientation": "vertical", "aria-valuemax": MAX_ASSISTANT_PANEL_WIDTH, "aria-valuemin": MIN_ASSISTANT_PANEL_WIDTH, "aria-valuenow": assistantPanelWidth, className: "tocktutor-assistant-resize absolute top-0 bottom-0 left-0 z-3 w-4 -translate-x-1/2 touch-none cursor-col-resize border-0 bg-transparent p-0 outline-none active:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] focus-visible:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)]", onKeyDown: resizeAssistantPanelWithKeyboard, onPointerDown: beginAssistantPanelResize, role: "separator", title: "Drag or Use Left and Right Arrow Keys", type: "button" })), _jsx("div", { className: "tocktutor-assistant-content min-h-0 min-w-[min(240px,calc(100vw-262px))] overflow-hidden border-l border-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-border)_92%)] transition-colors duration-140 ease-[cubic-bezier(.16,1,.3,1)]", children: props.assistantPanel })] }), _jsx(WorkbenchUtilities, { ...props, onClose: () => { setPanel(null); }, onOpenGraphNode: (path, mode) => {
                                const result = props.onOpenGraphNode?.(path, mode);
                                if (mode !== 'note' || result === undefined)
                                    return;
                                void Promise.resolve(result).then(success => { if (success === true)
                                    setPanel(null); });
                            }, view: panel === 'assistant' ? null : panel })] })] }) }));
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
function TockTutorWebViewerOutlet(props) {
    return props.renderSlot(TOCKTUTOR_WEB_VIEWER_PANEL_SLOT, {
        activePath: props.activePath,
        addLinkBookmark: props.addLinkBookmark,
        externalUrl: props.externalUrl,
        vault: props.vault,
        webClipFolder: props.webClipFolder,
    }, {
        fallback: _jsx(Alert, { unstyled: true, role: "status", children: "Web Viewer is unavailable." }),
    });
}
function TockTutorNativeActionsOutlet(props) {
    return props.renderSlot(TOCKTUTOR_NATIVE_ACTIONS_SLOT, {
        activePath: props.activePath,
        handleDispatch: props.handleDispatch,
        publishNoteActions: props.publishNoteActions,
        noteSource: props.noteSource,
        noteOwnerKey: props.noteOwnerKey,
        saveNote: props.saveNote,
        saveCurrent: props.saveCurrent,
        storeAudio: props.storeAudio,
        vault: props.vault,
    }, {
        fallback: _jsx(Alert, { unstyled: true, role: "status", children: "No native actions are available." }),
    });
}
function TockTutorVaultActionsOutlet(props) {
    return props.renderSlot(TOCKTUTOR_VAULT_ACTIONS_SLOT, {
        beginRename: props.beginRename,
        close: props.close,
        closeMenu: props.closeMenu,
        placement: props.placement,
        renderMenuItem: props.renderMenuItem,
        saveCurrent: props.saveCurrent,
        vault: props.vault,
        vaultName: props.vaultName,
    });
}
/** Root-scoped component contributed to TockTeam's exact Desktop route seat. */
export function TockTutorRoute(props) {
    const active = props.active !== false;
    const controller = useMemo(() => new WorkbenchRouteController(props.remote, props.navigate), [props.navigate, props.remote]);
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const root = useRef(null);
    const [externalUrl, setExternalUrl] = useState(null);
    const [nativeNoteActions, publishNoteActions] = useState(null);
    useEffect(() => {
        if (!active)
            return;
        void controller.syncLocation(props.location.pathname);
    }, [active, controller, props.location.pathname]);
    useEffect(() => () => {
        trackTockTutorRouteFlush(controller.dispose());
    }, [controller]);
    const pendingEditorFocus = useRef(null);
    const focusEditor = useCallback(() => {
        pendingEditorFocus.current?.();
        const container = root.current;
        if (!active || snapshot.path === null || container === null)
            return;
        const selector = snapshot.mode === 'source' || snapshot.mode === 'live-preview' ? '.cm-content' : '[aria-label$="View"]';
        const stop = () => {
            observer.disconnect();
            container.ownerDocument.removeEventListener('pointerdown', stop, true);
            container.ownerDocument.removeEventListener('keydown', stop, true);
            pendingEditorFocus.current = null;
        };
        const focus = () => {
            const seat = Array.from(container.querySelectorAll('[data-pane-id]')).find(node => node.dataset.paneId === snapshot.focusedPaneId) ?? container;
            const editor = seat.querySelector(selector);
            if (editor === null)
                return;
            stop();
            editor.focus();
        };
        // Both editors load asynchronously. Keep this request until their DOM is
        // ready, but never reclaim focus after the user chooses another control.
        const observer = new MutationObserver(focus);
        pendingEditorFocus.current = stop;
        observer.observe(container, { childList: true, subtree: true });
        container.ownerDocument.addEventListener('pointerdown', stop, true);
        container.ownerDocument.addEventListener('keydown', stop, true);
        focus();
    }, [active, snapshot.focusedPaneId, snapshot.mode, snapshot.path]);
    useEffect(() => {
        const focused = root.current?.ownerDocument.activeElement;
        if (!(focused instanceof HTMLElement) || focused.closest('[data-pane-id]')?.getAttribute('data-pane-id') !== snapshot.focusedPaneId)
            focusEditor();
        return () => { pendingEditorFocus.current?.(); };
    }, [focusEditor, snapshot.focusedPaneId]);
    useEffect(() => {
        if (!active || snapshot.documentKind !== 'markdown' || snapshot.path === null || snapshot.settings === undefined)
            return;
        const timer = setInterval(() => { void controller.captureRecoverySnapshot(); }, snapshot.settings.recoveryIntervalMinutes * 60_000);
        return () => { clearInterval(timer); };
    }, [controller, snapshot.documentKind, snapshot.path, snapshot.settings]);
    useEffect(() => {
        const node = root.current;
        if (node === null)
            return;
        const onKeyDown = (event) => {
            // This native listener runs before the linked leaf's delegated React handler.
            const linkedOrigin = event.target instanceof Element && event.target.closest('[data-linked-kind]') !== null;
            const isMac = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? '');
            const primary = isMac ? event.metaKey : event.ctrlKey;
            if (primary && !event.altKey && event.key.toLocaleLowerCase() === 'p') {
                event.preventDefault();
                if (!linkedOrigin)
                    controller.setCommandPaletteOpen(true);
                return;
            }
            if (primary && event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === 't') {
                event.preventDefault();
                if (!linkedOrigin)
                    void controller.reopenClosedTab();
                return;
            }
            const editorCommand = resolvePlatformEditorCommand(event, isMac);
            if (editorCommand !== null) {
                event.preventDefault();
                if (!linkedOrigin)
                    controller.runEditorCommand(editorCommand);
                return;
            }
            const shortcut = resolveEditorShortcut(event, isMac);
            if (shortcut !== 'save')
                return;
            event.preventDefault();
            if (!linkedOrigin)
                void controller.save();
        };
        node.addEventListener('keydown', onKeyDown);
        return () => { node.removeEventListener('keydown', onKeyDown); };
    }, [controller]);
    return (_jsx("div", { className: "tocktutor-root h-full min-h-0", ref: root, children: _jsx(TockTutorRouteView, { paneController: controller, onSplitPane: (id, axis) => { void controller.splitPane(id, axis); }, assistantPanel: (_jsx(TockTutorAssistantPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, ...((snapshot.selectionEnd ?? 0) > (snapshot.selectionStart ?? 0)
                    ? { selectedText: snapshot.source.slice(snapshot.selectionStart, Math.min(snapshot.selectionEnd ?? 0, (snapshot.selectionStart ?? 0) + 10_000)) }
                    : {}), vault: snapshot.vault })), nativeNoteActions: nativeNoteActions, nativeActions: (_jsx(TockTutorNativeActionsOutlet, { noteOwnerKey: controller.nativeNoteOwnerKey(), activePath: snapshot.path, noteSource: snapshot.source, saveNote: () => controller.save(), handleDispatch: event => controller.handleDispatch(event), publishNoteActions: publishNoteActions, renderSlot: props.renderSlot, saveCurrent: () => controller.saveAll(), storeAudio: (fileName, dataBase64) => controller.storeActiveAttachment(fileName, dataBase64), vault: snapshot.vault })), onActivateTab: (paneId, path) => { void controller.activateTab(paneId, path); }, onAddBookmark: (title, group) => controller.addActiveBookmark(title, group ?? null), onEditBookmark: (id, title, group) => controller.editActiveBookmark(id, title, group), onAttachFiles: files => { void controller.attachFiles(Array.from(files).slice(0, 16)); }, onApplyOrganization: () => { void controller.applyOrganization(); }, onAddPane: () => { void controller.addPane(); }, onBack: () => { void controller.goBack(); }, onBaseCopy: request => { void globalThis.navigator?.clipboard?.writeText(request.text); }, onBaseEdit: request => controller.applyBaseEdit(request), onBaseExport: request => {
                const url = URL.createObjectURL(new Blob([request.text], { type: 'text/csv;charset=utf-8' }));
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = request.filename;
                anchor.click();
                URL.revokeObjectURL(url);
            }, onCancelDispatch: () => { controller.cancelDispatchDialog(); }, onCancelOrganization: () => { controller.cancelOrganization(); }, onCanvasChange: change => { void controller.applyCanvasChange(change); }, onCaptureSnapshot: () => { void controller.captureRecoverySnapshot(); }, onClearSnapshots: () => { void controller.clearRecoverySnapshots(); }, onCloseAttachmentPreview: () => { controller.closeAttachmentPreview(); }, onCloseCommandPalette: () => { controller.setCommandPaletteOpen(false); }, onClosePane: paneId => { void controller.closePane(paneId); }, onCloseSearch: () => { controller.closeSearch(); }, onCloseTab: (paneId, path) => { void controller.closeTab(paneId, path); }, onConvertActiveNote: () => { controller.convertActiveNote(); }, onCopyGraphPath: path => { void globalThis.navigator?.clipboard?.writeText(path); }, onCreateBuiltinTemplate: name => { void controller.createBuiltinTemplateNote(name); }, onCreateManagedVault: name => { void controller.createManagedVault(name); }, onEdit: source => { controller.edit(source); }, onEditorCommand: command => { controller.runEditorCommand(command); }, onExtractSelection: () => { void controller.extractActiveSelection(); }, onFocusEditor: focusEditor, onFocusPane: paneId => { void controller.focusPane(paneId); }, onForward: () => { void controller.goForward(); }, onInsertCurrentDateTime: kind => { controller.insertCurrentDateTime(kind); }, onJumpToLine: line => { controller.jumpToLine(line); }, onLoadFacets: () => { void controller.loadFacets(); }, onLoadGraph: mode => { void controller.loadGraph(mode); }, onLoadRelationships: () => { void controller.loadRelationships(); }, onLoadWorkspace: id => { void controller.loadWorkspace(id); }, onMode: mode => { controller.setMode(mode); }, onMoveNote: folder => controller.moveActiveNote(folder), onMoveCanvas: (nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY); }, onMoveTab: (paneId, path, direction) => { controller.moveTab(paneId, path, direction); }, onNewNote: () => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }); }, onOpenBookmark: id => { void controller.openBookmark(id); }, onOpenCommandPalette: () => { controller.setCommandPaletteOpen(true); }, onOpenExternalUrl: url => { setExternalUrl(url); }, onOpenGraphNode: (path, mode) => controller.openGraphNode(path, mode), onOpenInternalLink: target => controller.openInternalLink(target), onOpenRecovery: () => { void controller.setRecoveryOpen(true); }, onOpenSearch: () => { controller.openSearch(snapshot.searchQuery); }, onOpenSidebarSearch: () => { controller.openSidebarSearch(); }, onOpenSmartView: kind => { void controller.openSmartView(kind); }, onPrepareNoteMerge: (path, signal) => controller.prepareNoteMerge(path, signal), onListMergeRecovery: (signal, cursor) => controller.listMergeRecovery(signal, cursor), onRecoverNoteMerge: (id, signal) => controller.recoverNoteMerge(id, signal), onPrepareOrganization: () => { void controller.prepareOrganization(); }, onPreviewAttachment: path => { void controller.previewAttachment(path); }, onReadSnapshot: id => { void controller.readRecoverySnapshot(id); }, onRenameTitle: title => controller.renameActiveTitle(title), onRemoveBookmark: id => controller.removeBookmark(id), onRevealFile: () => controller.revealActiveFile(), onReopenClosedTab: () => { void controller.reopenClosedTab(); }, onRestoreSnapshot: id => { void controller.restoreRecoverySnapshot(id); }, onRestoreSnapshotOverwrite: id => { void controller.restoreRecoverySnapshotOverwrite(id); }, onRestoreTrash: id => { void controller.restoreTrashEntry(id); }, onLoadMoreSearch: () => { void controller.loadMoreSearch(); }, onQuickAnswer: () => { void controller.runQuickAnswer(); }, onCancelQuickAnswer: () => { controller.cancelQuickAnswer(); }, onRetryQuickAnswer: () => { void controller.retryQuickAnswer(); }, onRunSearch: () => { void controller.runSearch(); }, onSave: () => { void controller.save(); }, onSaveWorkspace: () => { controller.saveCurrentWorkspace(); }, onSearchActiveMove: delta => { controller.moveSearchActive(delta); }, onSearchActiveSet: index => { controller.setSearchActiveIndex(index); }, onSearchChange: query => { controller.setSearchQuery(query); }, onSearchMode: mode => { controller.setSearchMode(mode); }, onSearchFilters: filters => { controller.setSearchFilters(filters); }, onSelectSearchMatch: (match, newTab) => controller.openSearchMatch(match, newTab), onHideSearchPreview: () => { controller.hideSearchPreview(); }, onSettingsChange: change => { controller.updateSettings(change); }, onSelect: path => { void controller.select(path); }, onSelectionChange: (start, end) => { controller.setSourceEditorSelection(start, end); }, onSetProperty: (key, value) => controller.setProperty(key, value), onStoreAttachment: (fileName, dataBase64) => { void controller.storeActiveAttachment(fileName, dataBase64); }, onSubmitDispatch: draft => { void controller.submitDispatchDialog(draft); }, onToggleFocusMode: () => { controller.toggleFocusMode(); }, onToggleTask: index => { controller.toggleTask(index); }, onTrashCurrent: () => { void controller.trashCurrent(); }, reviewPanel: (_jsx(TockTutorReviewPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), active: active, renderVaultActions: (placement, close, closeMenu, beginRename, renderMenuItem) => (_jsx(TockTutorVaultActionsOutlet, { beginRename: beginRename, close: close, closeMenu: closeMenu, placement: placement, renderMenuItem: renderMenuItem, renderSlot: props.renderSlot, saveCurrent: () => controller.saveAll(), vault: snapshot.vault, vaultName: snapshot.vaultName ?? null })), snapshot: snapshot, webViewerPanel: (_jsx(TockTutorWebViewerOutlet, { activePath: snapshot.path, addLinkBookmark: (title, url) => controller.addLinkBookmark(title, url), externalUrl: externalUrl, renderSlot: props.renderSlot, vault: snapshot.vault, webClipFolder: snapshot.settings?.webClipFolder ?? 'Clips' })), ...(active && typeof document !== 'undefined'
                ? { titlebarTarget: document.getElementById('tockteam-window-titlebar-slot') ?? document.body }
                : {}) }) }));
}
//# sourceMappingURL=route.js.map