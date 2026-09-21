import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { Checkbox } from '@tockteam/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@tockteam/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@tockteam/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@tockteam/ui/popover';
import { Textarea } from '@tockteam/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@tockteam/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, ChevronLeft, ChevronRight, FileClock, FileCode2, FileText, FolderInput, Globe2, Link2, ListTree, MessageSquare, Network, PanelsTopLeft, Paperclip, Pencil, Plus, Search, SlidersHorizontal, Tags, Trash2, Wrench, X, } from 'lucide-react';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from "./assistant-panel.js";
import { ExecutableBaseView } from "./base-executable-view.js";
import { executableBasePropertyIdentity } from "./base-edit.js";
import { CanvasBoard } from "./canvas-board.js";
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT, TOCKTUTOR_VAULT_ACTIONS_SLOT, } from "./native-actions.js";
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from "./review-panel.js";
import { TOCKTUTOR_WEB_VIEWER_PANEL_SLOT } from "./web-viewer-panel.js";
import { LivePreviewView, RichReadingView } from "./editor-surface.js";
import { SourceEditor } from "./source-editor.js";
import { WorkbenchUtilities } from "./utility-panel.js";
import { WorkbenchVaultDialog } from "./vault-dialog.js";
import { WorkbenchGlyph } from "./workbench-glyph.js";
import { parseCanvasDocument, updateCanvasNodePosition, } from "./canvas.js";
import { projectLivePreview, replaceLivePreviewLine, } from "./live-preview.js";
import { renderMarkdownHtml } from "./rich-markdown.js";
import { parseFrontmatterProperties, setFrontmatterProperty } from "./properties.js";
import { addBookmark, loadBookmarks, remapBookmarks, saveBookmarks } from "./bookmarks.js";
import { layoutGraph, projectGraph } from "./graph.js";
import { BUILTIN_TEMPLATES, buildCaptureNote, buildJournalNote, expandTemplate, uniqueNotePath } from "./capture.js";
import { buildOrganizationProposal } from "./organize.js";
import { convertMarkdownFormats, extractSelectionToNote } from "./composer.js";
import { appendAttachmentMarkdown, attachmentTargetPath } from "./attachments.js";
import { collectEmbedTargets, resolveEmbedGraph } from "./embeds.js";
import { createNamedWorkspace, loadTockTutorSettings, loadWorkbenchState, saveTockTutorSettings, saveWorkbenchState, } from "./settings.js";
import { applyEditorCommand, resolvePlatformEditorCommand, } from "./editor-commands.js";
import { editorStatusLabel, resolveEditorShortcut, toggleMarkdownTask, } from "./markdown.js";
import { addPaneGroup, closeNoteTab, closePaneGroup, createWorkbenchSession, focusPaneGroup, isSafeVaultRelativePath, markTabDirty, MAX_NOTE_TABS, MAX_PANE_GROUPS, moveNoteTab, openNoteTab, renameNoteTabPath, setActiveNoteTab, setNoteTabMode, setTabPinned, hydrateWorkbenchSession, } from "./session.js";
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
export class WorkbenchRouteController {
    remote;
    navigate;
    now;
    storage;
    snapshot = initialSnapshot();
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
    embedOperation = 0;
    embedTargets = Object.freeze([]);
    selectionRequestId = 0;
    treeComplete = false;
    dispatchRevision = 0;
    operationAbort = null;
    searchTimer = null;
    searchPreviewAbort = null;
    searchPreviewOperation = 0;
    embedAbort = null;
    saveAbort = null;
    saving = null;
    draftAbort = null;
    draftFlush = null;
    draftTimer = null;
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
        this.nextOperation();
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
        const entriesByPath = new Map(this.snapshot.entries.map(entry => [entry.path, entry]));
        const cursors = new Set();
        let cursor = null;
        try {
            for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
                const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
                    expectedVault: vault,
                    limit: 200,
                    ...(cursor === null ? {} : { cursor }),
                }, operation.signal));
                if (!this.current(operation.id, vault) || page.generation !== vault.generation)
                    return;
                for (const entry of page.entries)
                    entriesByPath.set(entry.path, entry);
                if (page.cursor === null)
                    break;
                if (cursors.has(page.cursor))
                    return;
                cursors.add(page.cursor);
                cursor = page.cursor;
            }
            if (this.current(operation.id, vault) && this.snapshot.searchOpen && this.snapshot.searchQuery.trim() === '') {
                const nextEntries = Object.freeze([...entriesByPath.values()]);
                this.update({ entries: nextEntries, searchMatches: recentSearchMatches(nextEntries) });
            }
        }
        catch {
            // The initial bounded tree page remains a valid recent-notes fallback.
        }
    }
    closeSearch() {
        this.nextOperation();
        this.update({ searchActiveIndex: null, searchAnswer: { status: 'idle', answer: '', citations: [] }, searchDirectory: '', searchIntelligenceStatus: null, searchLoading: false, searchMatches: Object.freeze([]), searchCursor: null, searchModifiedFrom: null, searchModifiedTo: null, searchOpen: false, searchPreview: null, searchPreviewError: null, searchPreviewLoading: false, searchQuery: '', searchTitleOnly: false });
    }
    openSearch(query) {
        if (query.length > 1_000)
            return;
        this.nextOperation();
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
            searchPreview: null,
            searchPreviewError: null,
            searchPreviewLoading: false,
            searchQuery: query,
        });
        if (trimmed === '' && this.snapshot.vault !== null)
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
        const operation = this.nextOperation();
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
            if (!this.current(operation.id, vault))
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
            await this.enhanceSearch(operation, vault, query, mode);
            if (!this.current(operation.id, vault))
                return false;
            const enhancedMatches = this.snapshot.searchMatches ?? matches;
            if (enhancedMatches.length > 0 && this.snapshot.searchActiveIndex === null)
                void this.previewSearchMatch(0);
            else if (matches.length > 0 && this.snapshot.searchPreview === null)
                void this.previewSearchMatch(0);
            return true;
        }
        catch {
            if (this.current(operation.id, vault) && !operation.signal.aborted) {
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
        const operation = this.nextOperation();
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
            if (!this.current(operation.id, vault) || operation.signal.aborted)
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
            if (this.current(operation.id, vault) && !operation.signal.aborted) {
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
    async loadRelationships() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.snapshot.documentKind !== 'markdown')
            return false;
        this.update({ links: null, outline: null });
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
        this.shellSession = openNoteTab(this.shellSession, this.shellSession.focusedGroupId, path, { mode: sessionModeFromRoute(this.snapshot.mode), replaceActive: true });
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
    persistDraft(request, abort, final = false) {
        const flush = final
            ? this.persistFinalDraft(request, abort)
            : Promise.resolve()
                .then(() => this.remote.tocktutorWorkbench.saveDraft(request, abort.signal))
                .then(result => { remoteValue(result); })
                .catch(() => undefined);
        this.draftFlush = flush;
        void flush.then(() => {
            if (this.draftFlush === flush)
                this.draftFlush = null;
            if (this.draftAbort === abort)
                this.draftAbort = null;
        }, () => {
            if (this.draftFlush === flush)
                this.draftFlush = null;
            if (this.draftAbort === abort)
                this.draftAbort = null;
        });
        return flush;
    }
    async persistFinalDraft(request, abort) {
        let lastError;
        for (let attempt = 0; attempt < FINAL_DRAFT_ATTEMPTS; attempt += 1) {
            try {
                const result = await this.remote.tocktutorWorkbench.saveDraft(request, abort.signal);
                remoteValue(result);
                return;
            }
            catch (error) {
                lastError = error;
                if (abort.signal.aborted)
                    break;
            }
        }
        throw lastError instanceof Error ? lastError : new Error('The latest TockTutor draft could not be saved.');
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
            this.persistDraft({
                content,
                expectedVault: vault,
                path,
                ...(revision === null ? {} : { revision }),
            }, abort);
        }, 400);
    }
    flushPendingDraft() {
        if (this.draftTimer !== null) {
            clearTimeout(this.draftTimer);
            this.draftTimer = null;
        }
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null || this.snapshot.saveStatus === 'saved')
            return null;
        this.draftAbort?.abort();
        const abort = new AbortController();
        this.draftAbort = abort;
        return this.persistDraft({
            content: this.snapshot.source,
            expectedVault: vault,
            path,
            ...(this.snapshot.revision === null ? {} : { revision: this.snapshot.revision }),
        }, abort, true);
    }
    clearDocument() {
        this.invalidateDispatch();
        this.nextOperation();
        this.cancelEmbedOperation();
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
    nextOperation() {
        if (this.searchTimer !== null)
            clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.cancelSearchPreview();
        this.cancelRecoveryOperations();
        this.operationAbort?.abort();
        this.operationAbort = new AbortController();
        this.operation += 1;
        return { id: this.operation, signal: this.operationAbort.signal };
    }
    cancelEmbedOperation() {
        this.embedAbort?.abort();
        this.embedAbort = null;
        this.embedOperation += 1;
    }
    nextEmbedOperation() {
        this.cancelEmbedOperation();
        this.embedAbort = new AbortController();
        return { id: this.embedOperation, signal: this.embedAbort.signal };
    }
    currentEmbed(id, vault, path) {
        return !this.disposed && id === this.embedOperation && sameVault(this.snapshot.vault, vault) && this.snapshot.path === path;
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
            const tree = await this.loadTreePages(vault, operation);
            if (tree === null)
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
        if (value.kind === 'entry'
            && value.action === 'moved'
            && this.pendingRename !== null
            && sameVault(this.pendingRename.vault, value.vault)
            && value.fromPath === this.pendingRename.fromPath
            && value.path === this.pendingRename.toPath)
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
    async loadTreePages(vault, operation) {
        const entries = new Map();
        const warnings = [];
        const cursors = new Set();
        let cursor = null;
        let scanTruncated = false;
        for (let pageIndex = 0; pageIndex < MAX_TREE_PAGES; pageIndex += 1) {
            const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
                expectedVault: vault,
                limit: TREE_LIMIT,
                ...(cursor === null ? {} : { cursor }),
            }, operation.signal));
            if (!this.current(operation.id) || (this.snapshot.vault !== null && !sameVault(this.snapshot.vault, vault)))
                return null;
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
    async refreshTree(vault) {
        const operation = this.nextOperation();
        try {
            const tree = await this.loadTreePages(vault, operation);
            if (tree === null)
                return false;
            this.treeComplete = !tree.truncated;
            const entries = Object.freeze(tree.entries.toSorted((left, right) => left.path.localeCompare(right.path)));
            const searchQuery = this.snapshot.searchQuery.trim();
            this.update({
                entries,
                warnings: tree.warnings,
                message: tree.truncated ? 'The vault tree is truncated to a bounded result.' : this.snapshot.message,
                ...(this.snapshot.searchOpen ? {
                    searchActiveIndex: null,
                    searchCursor: null,
                    searchLoading: searchQuery !== '',
                    searchMatches: searchQuery === '' ? recentSearchMatches(entries) : Object.freeze([]),
                    searchPreview: null,
                    searchPreviewError: null,
                    searchPreviewLoading: false,
                } : {}),
            });
            if (this.snapshot.searchOpen && searchQuery !== '')
                this.scheduleSearch();
            return true;
        }
        catch (error) {
            if (this.current(operation.id, vault) && !operation.signal.aborted) {
                this.update({ message: this.failureMessage(error, 'The vault tree could not be refreshed.') });
            }
            return false;
        }
    }
    async createManagedVault(name) {
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
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
            return await this.select(identity.path, false);
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
    async closePane(id) {
        if (this.snapshot.phase !== 'ready' || this.shellSession.groups.length <= 1)
            return false;
        const target = this.shellSession.groups.find(group => group.id === id);
        if (target === undefined)
            return false;
        if (target.tabs.some(tab => tab.dirty)) {
            const active = id === this.shellSession.focusedGroupId && target.tabs.some(tab => tab.path === this.snapshot.path);
            if (!active) {
                this.update({ message: 'Save the pane before closing it.' });
                return false;
            }
            if (this.snapshot.saveStatus !== 'saved' && !await this.save())
                return false;
        }
        const active = id === this.shellSession.focusedGroupId;
        const result = closePaneGroup(this.shellSession, id);
        if (result.closed === null)
            return false;
        this.shellSession = result.session;
        this.syncShell();
        if (!active)
            return true;
        this.clearDocument();
        const nextPath = this.pane()?.activePath ?? null;
        if (nextPath === null) {
            this.navigate(ROUTE_PREFIX);
            return true;
        }
        return await this.select(nextPath);
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
        this.nextOperation();
        this.update({ searchAnswer: { status: 'idle', answer: '', citations: [] }, settings });
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
    addLinkBookmark(title, url) {
        const vault = this.snapshot.vault;
        if (vault === null || this.storage === null)
            return false;
        try {
            this.bookmarks = addBookmark(this.bookmarks, {
                id: `link-${this.now().getTime().toString(36)}`,
                kind: 'link',
                title: title.trim().slice(0, 200) || 'Web Link',
                url,
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
            groups: workspace.session.groups.map(group => ({ ...group, tabs: group.tabs.filter(tab => supportedDocument(tab.path) && (!this.treeComplete || openable.has(tab.path))) })),
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
    async select(path, navigate = true, dispatchRevision, recordHistory = true, newTab = false) {
        const activeVault = this.snapshot.vault;
        if (!supportedDocument(path) || activeVault === null || this.snapshot.phase !== 'ready')
            return false;
        const previousPath = this.snapshot.path;
        if (dispatchRevision === undefined)
            this.invalidateDispatch();
        else if (!this.dispatchCurrent(dispatchRevision, activeVault))
            return false;
        if (path === this.snapshot.path && navigate)
            return true;
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
        if (this.snapshot.saveStatus !== 'saved' && !await this.save()) {
            if (this.snapshot.path !== null)
                this.navigate(routeForPath(this.snapshot.path), 'replace');
            return false;
        }
        if (newTab && path !== this.snapshot.path && !pane.tabs.some(tab => tab.path === path)) {
            this.shellSession = openNoteTab(this.shellSession, this.shellSession.focusedGroupId, path);
            this.syncShell();
        }
        const vault = activeVault;
        const operation = this.nextOperation();
        const sourceAtOpen = this.snapshot.source;
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
            if (this.snapshot.source !== sourceAtOpen)
                return false;
            const mode = pane.tabs.find(tab => tab.path === path)?.mode
                ?? (documentKind(path) === 'markdown' ? this.snapshot.settings?.defaultEditingMode ?? 'live-preview' : 'reading');
            this.cancelEmbedOperation();
            this.embedTargets = embedTargetSources(content, path);
            this.update({
                documentKind: documentKind(path),
                embeds: Object.freeze([]),
                draftRecovered,
                message: draftRecovered ? `${path} opened with its recovered draft.` : `${path} opened.`,
                mode,
                path,
                revision: opened.revision,
                saveStatus: draftRecovered ? 'unsaved' : 'saved',
                selectionEnd: 0,
                selectionRequest: null,
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
                    if (await this.loadRelationships() && this.snapshot.path === path && this.snapshot.source === content)
                        await this.loadEmbeds();
                })();
            }
            else if (documentKind(path) === 'base')
                void this.hydrateBaseRows(path);
            if (recoveryWasOpen)
                void this.setRecoveryOpen(true);
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
        this.update({
            ...(embedsChanged ? { embeds: Object.freeze([]) } : {}),
            message: 'Unsaved changes.',
            saveStatus: 'unsaved',
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
        if (this.snapshot.path === null || this.snapshot.mode !== 'source')
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
        if (this.snapshot.path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode !== 'source')
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
        if (vault === null || path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode !== 'source' || end <= start)
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
        if (this.snapshot.path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode !== 'source')
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
    async loadEmbeds() {
        const vault = this.snapshot.vault;
        const sourcePath = this.snapshot.path;
        if (vault === null || sourcePath === null || this.snapshot.documentKind !== 'markdown')
            return false;
        const source = this.snapshot.source;
        let targets;
        try {
            targets = collectEmbedTargets(source, sourcePath);
        }
        catch {
            this.cancelEmbedOperation();
            this.update({ embeds: Object.freeze([]) });
            return false;
        }
        this.embedTargets = Object.freeze(targets.map(target => target.source));
        if (targets.length === 0) {
            this.cancelEmbedOperation();
            this.update({ embeds: Object.freeze([]) });
            return true;
        }
        const operation = this.nextEmbedOperation();
        try {
            const result = await resolveEmbedGraph({
                entries: this.snapshot.entries,
                isCurrent: () => this.currentEmbed(operation.id, vault, sourcePath),
                readAttachment: async (path) => {
                    const preview = remoteValue(await this.remote.tocktutorWorkbench.previewAttachment(path, vault, operation.signal));
                    if (preview.path !== path || preview.generation !== vault.generation)
                        throw new Error('Embed attachment identity changed.');
                    return preview;
                },
                readDocument: async (path) => {
                    const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, operation.signal));
                    if (opened.path !== path || opened.generation !== vault.generation)
                        throw new Error('Embed document identity changed.');
                    return opened;
                },
                signal: operation.signal,
                source,
                sourcePath,
            });
            if (result.status !== 'ready' || !this.currentEmbed(operation.id, vault, sourcePath))
                return false;
            this.update({
                embeds: Object.freeze(result.embeds.map(embed => Object.freeze({
                    content: embed.content,
                    ...(embed.depth === 0 ? {} : { depth: embed.depth }),
                    ...(embed.mimeType === undefined ? {} : { mimeType: embed.mimeType }),
                    ...(embed.parentPath === undefined ? {} : { parentPath: embed.parentPath }),
                    target: Object.freeze({ ...embed.target }),
                }))),
                warnings: Object.freeze([...this.snapshot.warnings, ...result.warnings].slice(-32)),
            });
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
        if (this.snapshot.recoveryOpen === true) {
            this.cancelRecoveryOperations();
            this.update({ message: `Saving ${path}.`, saveStatus: 'saving', selectedSnapshot: null, snapshots: Object.freeze([]) });
        }
        else {
            this.update({ message: `Saving ${path}.`, saveStatus: 'saving' });
        }
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
        if (this.disposal !== null)
            return this.disposal;
        const flush = this.flushPendingDraft();
        this.settlePendingDispatch('stale');
        if (this.searchTimer !== null)
            clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.disposed = true;
        this.dispatchRevision += 1;
        this.operation += 1;
        this.operationAbort?.abort();
        this.cancelRecoveryOperations();
        this.cancelEmbedOperation();
        this.saveAbort?.abort();
        if (this.draftAbort === null)
            this.draftTimer = null;
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
function NotePathDialog(props) {
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const [value, setValue] = useState(props.initialValue);
    useEffect(() => {
        setValue(props.initialValue);
        setError(null);
    }, [props.initialValue]);
    const rename = props.kind === 'rename';
    const label = rename ? 'Rename Note' : 'Move Note';
    const submit = (event) => {
        event.preventDefault();
        if (pending)
            return;
        setPending(true);
        setError(null);
        void Promise.resolve()
            .then(() => props.onSubmit(value))
            .then(success => {
            if (success === true)
                props.onCancel();
            else
                setError(`The note could not be ${rename ? 'renamed' : 'moved'}.`);
        }, () => { setError(`The note could not be ${rename ? 'renamed' : 'moved'}.`); })
            .finally(() => { setPending(false); });
    };
    return (_jsx(Dialog, { open: true, onOpenChange: open => { if (!open && !pending)
            props.onCancel(); }, children: _jsx(DialogContent, { unstyled: true, className: "fixed top-1/2 left-1/2 z-[2147483647] grid w-[calc(100%-48px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 gap-3.5 overflow-hidden rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 text-[var(--tt-text)] shadow-xl [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", overlayClassName: "z-[2147483646] !bg-[color-mix(in_srgb,var(--dsw-alias-label-primary,#27272a)_28%,transparent)]", showCloseButton: false, children: _jsxs("form", { className: "grid gap-3", onSubmit: submit, children: [_jsx(DialogTitle, { className: "m-0 text-[17px]", children: label }), _jsxs(Label, { unstyled: true, className: "grid gap-1.5 text-sm font-[650]", children: [rename ? 'Note Title' : 'Note Folder', _jsx(Input, { unstyled: true, "aria-label": rename ? 'Note Title' : 'Note Folder', autoFocus: true, disabled: pending, maxLength: 4_096, onChange: event => { setValue(event.target.value); setError(null); }, placeholder: rename ? undefined : 'Folder/Subfolder (optional)', value: value })] }), !rename && _jsx("p", { className: "m-0 text-xs text-[var(--dsw-alias-label-secondary,#71717a)]", children: "Leave the folder empty to move the note to the vault root." }), error !== null && _jsx("p", { className: "m-0 text-xs text-[var(--dsw-alias-state-error-primary,#dc2626)]", role: "alert", children: error }), _jsxs("div", { className: "flex justify-end gap-2 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit", children: [_jsx(Button, { unstyled: true, disabled: pending, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, disabled: pending, type: "submit", children: label })] })] }) }) }));
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
            props.onClose(); }, children: _jsxs(DialogContent, { unstyled: true, className: "fixed top-[42%] left-1/2 -ml-[5px] z-[2147483647] grid h-[520px] max-h-[calc(100vh-48px)] w-[calc(100%-32px)] max-w-[640px] -translate-x-1/2 -translate-y-[42%] grid-rows-[60px_minmax(0,1fr)_44px] overflow-hidden rounded-[12px] border border-border bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-xl outline-none [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--tockteam-shell-chrome,var(--dsw-alias-bg-base,#fff))] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", onCloseAutoFocus: props.onCloseAutoFocus, onOpenAutoFocus: props.onOpenAutoFocus, overlayClassName: "z-[2147483646] !bg-transparent", showCloseButton: false, children: [_jsx(DialogTitle, { className: "sr-only", children: "Command Palette" }), _jsxs(Command, { unstyled: true, className: "contents", label: "Search Commands", children: [_jsxs(Label, { unstyled: true, className: "flex min-w-0 items-center gap-3 border-b border-[var(--tt-border)] px-4 text-[var(--tt-muted)] [&>svg]:size-[18px]", children: [_jsx(Search, { "aria-hidden": "true" }), _jsx(CommandInput, { unstyled: true, "aria-label": "Search Commands", className: "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--tt-text)] outline-none placeholder:text-[var(--tt-muted)]", maxLength: 200, onValueChange: setQuery, placeholder: "Search", value: query })] }), _jsx("div", { className: "min-h-0 px-3 pb-3", children: _jsxs("section", { className: "grid h-full min-h-0 grid-rows-[42px_minmax(0,1fr)]", "aria-label": "Command Results", children: [_jsx("header", { className: "flex items-end px-2 pb-1.5 text-[11px] font-medium text-[var(--tt-muted)]", children: "Commands" }), _jsxs(CommandList, { unstyled: true, className: "overflow-auto", label: "Command Search Results", children: [_jsx(CommandEmpty, { unstyled: true, className: "px-2.5 py-2 text-sm text-[var(--tt-muted)]", children: "No matching commands." }), _jsx(CommandGroup, { unstyled: true, className: "grid auto-rows-max gap-0", children: commands.map(command => (_jsx(CommandItem, { unstyled: true, className: "box-border h-7 cursor-default rounded-md border-0 bg-transparent px-2.5 py-1 text-left text-sm text-[var(--tt-text)] outline-none hover:bg-[var(--tt-selected)] data-[selected=true]:bg-[var(--tt-selected)] data-[disabled=true]:opacity-40", disabled: command.disabled === true || command.run === undefined, onSelect: () => {
                                                        command.run?.();
                                                        if (command.close !== false)
                                                            props.onClose();
                                                    }, value: command.label, children: command.label }, command.label))) })] })] }) }), _jsxs("footer", { className: "flex items-center gap-5 border-t border-[var(--tt-border)] px-4 text-xs text-[var(--tt-muted)]", children: [_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm", children: "Enter" }), " Run"] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm", children: "Esc" }), " Dismiss"] })] })] })] }) }));
}
function fileName(path) {
    return path.split('/').at(-1) ?? path;
}
function noteTitle(path) {
    return path === null ? 'TockTutor' : fileName(path).replace(/\.(?:base|canvas|markdown|md)$/iu, '');
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
    return children.map(entry => entry.kind === 'directory' ? (_jsx("li", { className: "tocktutor-tree-directory", children: _jsxs("details", { className: "group", open: true, children: [_jsxs("summary", { className: "tocktutor-tree-row grid min-h-8 w-full cursor-pointer list-none grid-cols-[12px_16px_minmax(0,1fr)_16px] items-center gap-[7px] overflow-hidden rounded bg-transparent px-[5px] py-1 text-left font-medium text-inherit hover:bg-[color-mix(in_srgb,var(--tt-text)_5%,transparent)] [&::-webkit-details-marker]:hidden [&>span:not(.tocktutor-tree-indent)]:truncate [&>svg:first-child]:size-3 [&>svg:first-child]:transition-transform group-open:[&>svg:first-child]:rotate-90 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-3.5 [&>svg:last-child]:text-[var(--tt-muted)] [&>svg:last-child]:opacity-80", title: entry.path, children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx(WorkbenchGlyph, { kind: "folder" }), _jsx("span", { children: fileName(entry.path) }), _jsx(WorkbenchGlyph, { kind: "more" })] }), _jsx("ul", { className: "m-0 list-none p-0 pl-4", children: _jsx(TreeEntries, { entries: props.entries, onSelect: props.onSelect, path: props.path, prefix: `${entry.path}/` }) })] }) }, entry.path)) : (_jsx("li", { children: _jsxs(Button, { unstyled: true, "aria-current": entry.path === props.path ? 'page' : undefined, className: "tocktutor-tree-row grid min-h-8 w-full grid-cols-[12px_16px_minmax(0,1fr)_16px] items-center gap-[7px] overflow-hidden rounded border-0 bg-transparent px-[5px] py-1 text-left font-medium text-inherit hover:bg-[color-mix(in_srgb,var(--tt-text)_5%,transparent)] aria-current:bg-[var(--tt-selected)] aria-current:[&>svg:last-child]:text-[var(--tt-text)] [&>span:not(.tocktutor-tree-indent)]:truncate [&>svg:first-child]:size-3 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-3.5 [&>svg:last-child]:text-[var(--tt-muted)] [&>svg:last-child]:opacity-80", onClick: () => { props.onSelect(entry.path); }, title: entry.path, type: "button", children: [_jsx("span", { className: "tocktutor-tree-indent w-3" }), _jsx(WorkbenchGlyph, { kind: "document" }), _jsx("span", { children: fileName(entry.path) }), _jsx(WorkbenchGlyph, { kind: "more" })] }) }, entry.path)));
}
const NOTE_ACTION_CLASS = "min-h-7 w-full gap-2 rounded-[5px] px-2 py-1 text-[13px] text-inherit focus:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus:text-inherit data-[highlighted]:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] data-[highlighted]:text-inherit [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate";
/** Semantic, authority-free view for the route state machine. */
export function TockTutorRouteView(props) {
    const { snapshot } = props;
    const active = props.active !== false;
    const previewLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas'
        : snapshot.documentKind === 'base' ? 'Base' : 'Reading';
    const sourceLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas Source'
        : snapshot.documentKind === 'base' ? 'Base Source' : 'Markdown Source';
    const query = snapshot.searchQuery.trim().toLocaleLowerCase();
    const backlinkCount = snapshot.links?.backlinkDetails.length ?? 0;
    const backlinkLabel = `${String(backlinkCount)} backlink${backlinkCount === 1 ? '' : 's'}`;
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
    const [noteAction, setNoteAction] = useState(null);
    const [paletteView, setPaletteView] = useState(null);
    const visiblePalette = paletteView ?? (snapshot.searchOpen ? 'notes' : snapshot.commandPaletteOpen === true ? 'commands' : null);
    const [assistantPanelWidth, setAssistantPanelWidth] = useState(DEFAULT_ASSISTANT_PANEL_WIDTH);
    const [baseView, setBaseView] = useState(null);
    const [baseSearches, setBaseSearches] = useState({});
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
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
    }, [snapshot.path]);
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
        }, children: [_jsxs("div", { className: "tocktutor-titlebar-sidebar flex min-w-0 items-center justify-start gap-2 border-r border-[var(--tt-border)] pr-1 pl-[46px] [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)] [&>span]:inline-flex [&>span]:h-7 [&>span]:w-[22px] [&>span]:items-center [&>span]:justify-center [&>span]:border-0 [&>span]:bg-transparent [&>span]:p-0 [&>span]:text-[var(--tt-muted)]", children: [effectiveSidebarOpen && (_jsxs(_Fragment, { children: [_jsx("span", { className: "tocktutor-titlebar-document rounded-[5px] bg-[color-mix(in_srgb,var(--tt-text)_8%,transparent)] text-[var(--tt-text)]", children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "Search Notes", className: "border-0 bg-transparent p-0", disabled: props.onOpenSearch === undefined, onClick: event => { openSearch(event.currentTarget); }, type: "button", children: _jsx(Search, { "aria-hidden": "true" }) }) }) }), _jsx(TooltipContent, { children: "Search Notes" })] }), _jsx(Button, { unstyled: true, "aria-label": "Bookmark Active Note", className: "h-7 w-[22px] border-0 bg-transparent p-0", disabled: snapshot.path === null || props.onAddBookmark === undefined, onClick: props.onAddBookmark, type: "button", children: _jsx(WorkbenchGlyph, { kind: "bookmark" }) })] })), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-expanded": effectiveSidebarOpen, "aria-label": "Toggle Files Sidebar", className: "tocktutor-panel-icon ml-auto size-9 border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setSidebarOpen(open => !open); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel" }) }) }), _jsx(TooltipContent, { children: "Toggle Files Sidebar" })] })] }), _jsxs("div", { className: "tocktutor-titlebar-main flex min-w-0 items-center gap-1 pl-2 pr-3.5", children: [_jsxs("span", { className: "tocktutor-history mr-[18px] flex gap-[5px] px-1.5", children: [_jsx(Button, { unstyled: true, "aria-label": "Go Back", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoBack !== true, onClick: props.onBack, type: "button", children: _jsx(WorkbenchGlyph, { kind: "back" }) }), _jsx(Button, { unstyled: true, "aria-label": "Go Forward", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoForward !== true, onClick: props.onForward, type: "button", children: _jsx(WorkbenchGlyph, { kind: "forward" }) })] }), _jsx("div", { className: "tocktutor-tabs -mx-[var(--tt-tab-curve)] -mb-px flex max-w-[min(48rem,58vw)] min-w-0 self-stretch items-end gap-1 overflow-x-auto overflow-y-hidden px-[var(--tt-tab-curve)] [--tt-tab-curve:16px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", ...(focusedPane?.tabs.length ? { 'aria-label': 'Note Tabs', role: 'tablist' } : {}), children: focusedPane?.tabs.map((tab, index) => (_jsxs("div", { className: "relative z-1 -mb-px flex h-[34px] min-w-[118px] max-w-[220px] items-center gap-2 rounded-t-[5px] border border-b-0 border-transparent bg-[var(--tt-panel)] pr-2.5 pl-3 before:pointer-events-none before:absolute before:bottom-[-1px] before:left-[calc(var(--tt-tab-curve)*-1)] before:size-[var(--tt-tab-curve)] before:rounded-br-[var(--tt-tab-curve)] before:content-[''] before:[box-shadow:calc(var(--tt-tab-curve)/2)_calc(var(--tt-tab-curve)/2)_0_calc(var(--tt-tab-curve)/2)_var(--tt-panel)] after:pointer-events-none after:absolute after:right-[calc(var(--tt-tab-curve)*-1)] after:bottom-[-1px] after:size-[var(--tt-tab-curve)] after:rounded-bl-[var(--tt-tab-curve)] after:content-[''] after:[box-shadow:calc(var(--tt-tab-curve)/-2)_calc(var(--tt-tab-curve)/2)_0_calc(var(--tt-tab-curve)/2)_var(--tt-panel)] data-[active=false]:border-b data-[active=false]:border-[var(--tt-border)] data-[active=false]:bg-[color-mix(in_srgb,var(--tt-panel)_70%,transparent)] data-[active=false]:text-[var(--tt-muted)] data-[active=false]:shadow-none data-[active=false]:before:hidden data-[active=false]:after:hidden", "data-active": tab.path === focusedPane.activePath, role: "presentation", children: [_jsx(Button, { unstyled: true, "aria-selected": tab.path === focusedPane.activePath, className: "relative z-1 flex min-w-0 flex-1 items-center self-stretch border-0 bg-transparent p-0 text-left [&>span]:truncate", onClick: () => { props.onActivateTab(focusedPane.id, tab.path); }, onKeyDown: event => {
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
                                    }, "aria-controls": "tocktutor-note-editor", role: "tab", tabIndex: tab.path === focusedPane.activePath ? 0 : -1, title: tab.path, type: "button", children: _jsxs("span", { children: [tab.dirty && _jsx("span", { "aria-label": "Unsaved", children: "\u2022" }), fileName(tab.path)] }) }), _jsx(Button, { unstyled: true, "aria-label": `Close ${fileName(tab.path)}`, className: "relative z-1 inline-flex size-5 shrink-0 translate-x-0.5 items-center justify-center rounded border-0 bg-transparent p-0 text-[var(--tt-muted)] [&_svg]:size-3!", onClick: () => { props.onCloseTab?.(focusedPane.id, tab.path); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] }, tab.path))) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "New Note", className: "tocktutor-new-tab border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", disabled: props.onNewNote === undefined, onClick: props.onNewNote, type: "button", children: _jsx(WorkbenchGlyph, { kind: "new" }) }) }) }), _jsx(TooltipContent, { children: "New Note" })] }), _jsx("span", { className: "tocktutor-titlebar-spacer flex-1" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-expanded": panel === 'assistant', "aria-label": "Toggle Assistant Panel", className: "tocktutor-panel-icon border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel-right" }) }) }), _jsx(TooltipContent, { children: "Toggle Assistant Panel" })] })] })] })) : null;
    return (_jsx(TooltipProvider, { children: _jsxs("main", { "aria-label": "TockTutor Workbench", className: "tocktutor-workbench h-full min-h-0 box-border bg-[var(--tt-bg)] pt-0 text-[var(--tt-text)] [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-bg:var(--dsw-alias-bg-base,#fff)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-footer-height:28px] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_[hidden]]:!hidden [&_button]:text-inherit [&_button]:[font:inherit] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tt-accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tt-accent)] [&_svg]:block [&_svg]:size-4 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tt-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!delay-0 motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!delay-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!delay-0 motion-reduce:[&_*::before]:!duration-0", "data-focus-mode": snapshot.focusMode === true, "data-phase": snapshot.phase, tabIndex: -1, children: [titlebar !== null && (props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget)), snapshot.dispatchDialog !== null && (_jsx(NativeDispatchDialog, { kind: snapshot.dispatchDialog, onCancel: () => { props.onCancelDispatch?.(); }, onSubmit: draft => { props.onSubmitDispatch?.(draft); } })), noteAction !== null && snapshot.path !== null && (_jsx(NotePathDialog, { initialValue: noteAction === 'rename'
                        ? noteTitle(snapshot.path)
                        : snapshot.path.includes('/') ? snapshot.path.slice(0, snapshot.path.lastIndexOf('/')) : '', kind: noteAction, onCancel: () => { setNoteAction(null); }, onSubmit: value => noteAction === 'rename'
                        ? props.onRenameTitle?.(value) ?? false
                        : props.onMoveNote?.(value) ?? false })), visiblePalette === 'commands' && (_jsx(WorkbenchCommandPalette, { canGoBack: snapshot.canGoBack === true, canGoForward: snapshot.canGoForward === true, canReopen: (snapshot.recentlyClosed?.length ?? 0) > 0, editorEnabled: snapshot.documentKind === 'markdown' && snapshot.mode !== 'reading', onBack: props.onBack, onClose: () => { setPaletteView(null); props.onCloseCommandPalette?.(); }, onCloseAutoFocus: restorePaletteOpener, onOpenAutoFocus: rememberPaletteOpener, onEditorCommand: props.onEditorCommand, onForward: props.onForward, onNewNote: props.onNewNote, onReopen: props.onReopenClosedTab, onSearch: () => { openSearch(); }, onToggleFocus: props.onToggleFocusMode })), visiblePalette === 'notes' && (_jsx(WorkbenchNoteSearchPalette, { onClose: navigation => { paletteNavigating.current = navigation === true; setPaletteView(null); props.onCloseCommandPalette?.(); props.onCloseSearch?.(); }, onCloseAutoFocus: restorePaletteOpener, onCommands: () => { setPaletteView('commands'); props.onOpenCommandPalette?.(); props.onCloseSearch?.(); }, onOpenAutoFocus: rememberPaletteOpener, ...(props.onHideSearchPreview === undefined ? {} : { onHidePreview: props.onHideSearchPreview }), onLoadMoreSearch: props.onLoadMoreSearch, onQuickAnswer: props.onQuickAnswer, onCancelQuickAnswer: props.onCancelQuickAnswer, onRetryQuickAnswer: props.onRetryQuickAnswer, onRunSearch: props.onRunSearch, onSearchActiveMove: props.onSearchActiveMove, onSearchActiveSet: props.onSearchActiveSet, onSearchChange: props.onSearchChange, onSearchMode: props.onSearchMode, onSearchFilters: props.onSearchFilters, onSelect: props.onSelect, onSelectSearchMatch: props.onSelectSearchMatch, snapshot: snapshot })), _jsxs("div", { className: "tocktutor-grid relative grid h-full min-h-0 grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 ease-out", style: {
                        gridTemplateColumns: contentColumns,
                        transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
                        '--tocktutor-sidebar-width': `${String(sidebarWidth)}px`,
                    }, children: [_jsxs("aside", { "aria-hidden": !effectiveSidebarOpen, "aria-label": "Files", className: "tocktutor-sidebar grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden border-r border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] data-[open=false]:invisible data-[open=false]:[transition:visibility_0s_linear_300ms]", "data-open": effectiveSidebarOpen, ...(effectiveSidebarOpen ? {} : { inert: '' }), children: [_jsx("header", { className: "tocktutor-sidebar-header flex items-center border-b border-[var(--tt-border)] px-2.5", children: _jsx("h1", { className: "m-0 text-sm font-semibold", children: "Files" }) }), _jsx("div", { className: "tocktutor-sidebar-content min-h-0 overflow-auto px-[5px] py-[3px]", children: _jsxs("nav", { "aria-label": "Vault Notes", children: [snapshot.phase === 'loading' && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "Loading notes\u2026" }), snapshot.phase === 'inactive' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: "No Active Vault" }), snapshot.phase === 'error' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: snapshot.message }), snapshot.phase === 'ready' && documents.length === 0 && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "No supported notes found." }), _jsx("ul", { className: "tocktutor-tree m-0 list-none p-0", children: _jsx(TreeEntries, { entries: visibleTreeEntries, onSelect: props.onSelect, path: snapshot.path }) })] }) }), _jsx(WorkbenchVaultDialog, { onCreateManagedVault: props.onCreateManagedVault, renderVaultActions: props.renderVaultActions, vault: snapshot.vault, vaultDisplayPath: snapshot.vaultDisplayPath ?? null, vaultName: snapshot.vaultName ?? null })] }), _jsx(Button, { unstyled: true, "aria-label": `Resize Files Sidebar, ${String(sidebarWidth)} Pixels`, className: "tocktutor-sidebar-resize absolute top-0 bottom-0 z-5 m-0 w-2 touch-none cursor-ew-resize border-0 bg-transparent p-0 outline-none after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-0.5 after:bg-transparent after:content-[''] focus-visible:after:bg-[var(--tt-accent)]", hidden: !effectiveSidebarOpen, onKeyDown: resizeSidebarWithKeyboard, onPointerDown: beginSidebarResize, style: { left: sidebarWidth - 4 }, title: "Drag or Use Left and Right Arrow Keys", type: "button" }), _jsxs("section", { "aria-label": "Note Editor", className: "tocktutor-editor grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden bg-[var(--tt-panel)]", id: "tocktutor-note-editor", role: "tabpanel", children: [_jsxs("header", { className: "tocktutor-editor-header relative flex min-w-0 items-center justify-center border-b border-[var(--tt-border)] px-2.5", children: [_jsx("h2", { className: "m-0 truncate text-[13px] font-medium text-[var(--tt-muted)]", children: noteTitle(snapshot.path) }), _jsxs("div", { className: "tocktutor-editor-actions absolute right-2.5 flex items-center gap-1 [&>button]:inline-flex [&>button]:h-7 [&>button]:w-[26px] [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)]", children: [snapshot.documentKind === 'markdown' ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'reading' ? 'Switch to Live Preview' : 'Switch to Reading View', disabled: snapshot.path === null, onClick: () => { props.onMode(snapshot.mode === 'reading' ? 'live-preview' : 'reading'); }, type: "button", children: snapshot.mode === 'reading' ? _jsx(Pencil, { "aria-hidden": "true" }) : _jsx(FileText, { "aria-hidden": "true" }) }) }), _jsx(TooltipContent, { children: snapshot.mode === 'reading' ? 'Switch to Live Preview' : 'Switch to Reading View' })] })) : (_jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'source' ? previewLabel : sourceLabel, onClick: () => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "pencil" }) })), _jsxs(DropdownMenu, { modal: false, children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "More Note Actions", className: "inline-flex h-7 w-[26px] items-center justify-center border-0 bg-transparent p-0 text-[var(--tt-muted)]", type: "button", children: _jsx(WorkbenchGlyph, { kind: "more" }) }) }) }), _jsx(TooltipContent, { children: "More Note Actions" })] }), _jsxs(DropdownMenuContent, { align: "end", alignOffset: 26, className: "w-[260px] rounded-[8px] border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] p-1.5 text-[var(--dsw-alias-label-primary,#27272a)] shadow-xl [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]", portalled: false, sideOffset: 6, unstyled: true, children: [snapshot.documentKind === 'markdown' && (_jsxs(_Fragment, { children: [_jsx(DropdownMenuRadioGroup, { "aria-label": "Editor Mode", value: snapshot.mode, children: [
                                                                                ['reading', 'Reading View', FileText],
                                                                                ['live-preview', 'Live Preview', Pencil],
                                                                                ['source', 'Source Mode', FileCode2],
                                                                            ].map(([mode, label, Icon]) => (_jsxs(DropdownMenuRadioItem, { className: NOTE_ACTION_CLASS, onSelect: () => { props.onMode(mode); }, value: mode, children: [_jsx(Icon, { "aria-hidden": "true" }), _jsx("span", { children: label })] }, mode))) }), _jsx(DropdownMenuSeparator, {})] })), _jsxs(DropdownMenuGroup, { children: [_jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.documentKind !== 'markdown' || props.onRenameTitle === undefined, onSelect: () => { setNoteAction('rename'); }, children: [_jsx(Pencil, { "aria-hidden": "true" }), _jsx("span", { children: "Rename Note" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.documentKind !== 'markdown' || props.onMoveNote === undefined, onSelect: () => { setNoteAction('move'); }, children: [_jsx(FolderInput, { "aria-hidden": "true" }), _jsx("span", { children: "Move Note" })] })] }), _jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuGroup, { children: [_jsxs(DropdownMenuCheckboxItem, { checked: snapshot.settings?.backlinksInDocument ?? false, className: NOTE_ACTION_CLASS, disabled: snapshot.settings === undefined, onSelect: () => { props.onSettingsChange?.({ backlinksInDocument: !(snapshot.settings?.backlinksInDocument ?? false) }); }, children: [_jsx(Link2, { "aria-hidden": "true" }), _jsx("span", { children: "Backlinks in Document" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || props.onAddBookmark === undefined, onSelect: () => { props.onAddBookmark?.(); }, children: [_jsx(BookmarkPlus, { "aria-hidden": "true" }), _jsx("span", { children: "Bookmark Note" })] })] }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuGroup, { children: [
                                                                        ['recovery', 'File Recovery', FileClock],
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
                                                                        }, children: [_jsx(Icon, { "aria-hidden": "true" }), _jsx("span", { children: label })] }, view))) }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuGroup, { children: _jsxs(DropdownMenuItem, { className: `${NOTE_ACTION_CLASS} text-[var(--dsw-alias-state-error-primary,#dc2626)]`, disabled: snapshot.path === null || props.onTrashCurrent === undefined, onSelect: () => { props.onTrashCurrent?.(); }, children: [_jsx(Trash2, { "aria-hidden": "true" }), _jsx("span", { children: "Move File to Trash" })] }) })] })] })] })] }), _jsx("div", { "aria-label": "Editor Attachment Drop Zone", className: "tocktutor-editor-body relative min-h-0 overflow-auto [&_.ProseMirror]:mx-auto [&_.ProseMirror]:min-h-full [&_.ProseMirror]:w-[calc(100%-48px)] [&_.ProseMirror]:max-w-3xl [&_.ProseMirror]:pt-[18px] [&_.ProseMirror]:pb-[72px] [&_.ProseMirror]:outline-none", onDrop: event => {
                                        if (event.dataTransfer.files.length === 0)
                                            return;
                                        event.preventDefault();
                                        props.onAttachFiles?.(event.dataTransfer.files);
                                    }, onPaste: event => {
                                        if (event.clipboardData.files.length === 0)
                                            return;
                                        props.onAttachFiles?.(event.clipboardData.files);
                                    }, children: snapshot.path === null ? (_jsx(Empty, { unstyled: true, className: "tocktutor-empty absolute top-[45%] left-1/2 w-full max-w-[420px] -translate-1/2 p-8 text-center", children: _jsxs(EmptyHeader, { unstyled: true, children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Ready When You Are" }), _jsx(EmptyTitle, { unstyled: true, "aria-level": 2, className: "text-xl font-bold", role: "heading", children: "Select a Note" }), _jsx(EmptyDescription, { unstyled: true, className: "text-[var(--tt-muted)]", children: "Choose a Markdown note from the vault to read or edit its exact source." })] }) })) : snapshot.mode === 'source' ? (_jsx("div", { className: "flex h-full min-h-0 flex-col", children: _jsx(SourceEditor, { ariaLabel: sourceLabel, className: "h-full", content: snapshot.source, onContentChange: props.onEdit, ...(props.onRenameTitle === undefined ? {} : { onRenameTitle: props.onRenameTitle }), onSelectionChange: selection => { props.onSelectionChange?.(selection.main.from, selection.main.to); }, selectionRequest: snapshot.selectionRequest, ...(snapshot.embeds === undefined ? {} : { resolvedEmbeds: snapshot.embeds }), spellCheck: true, title: noteTitle(snapshot.path) }, snapshot.path) })) : snapshot.mode === 'live-preview' && snapshot.documentKind === 'markdown' ? (_jsx(LivePreviewView, { documentKey: snapshot.path, embeds: snapshot.embeds, onAddProperty: key => props.onSetProperty?.(key, '') ?? false, onEdit: props.onEdit, onEditSource: () => { props.onMode('source'); }, onOpenExternalUrl: props.onOpenExternalUrl, onSelectionChange: selection => { props.onSelectionChange?.(selection.from, selection.to); }, onSetProperty: props.onSetProperty, onToggleTask: props.onToggleTask, source: snapshot.source, title: noteTitle(snapshot.path) })) : snapshot.documentKind === 'canvas' ? (_jsx(CanvasBoard, { disabled: snapshot.revision === null || props.onCanvasChange === undefined, onChange: change => { props.onCanvasChange?.(change); }, revision: snapshot.revision ?? 'unavailable', source: snapshot.source })) : snapshot.documentKind === 'base' ? (_jsx(ExecutableBaseView, { activeView: baseView, files: snapshot.baseFiles ?? [], onActiveViewChange: setBaseView, onSearchChange: (view, search) => { setBaseSearches(current => ({ ...current, [view]: search })); }, searches: baseSearches, ...(props.onBaseCopy === undefined ? {} : { onCopy: props.onBaseCopy }), ...(props.onBaseEdit === undefined ? {} : { onEdit: props.onBaseEdit }), ...(props.onBaseExport === undefined ? {} : { onExport: props.onBaseExport }), source: snapshot.source })) : snapshot.documentKind === 'markdown' ? (_jsx(RichReadingView, { embeds: snapshot.embeds, onAddProperty: key => props.onSetProperty?.(key, '') ?? false, onOpenExternalUrl: props.onOpenExternalUrl, onOpenInternalLink: props.onOpenInternalLink, onSetProperty: props.onSetProperty, onToggleTask: props.onToggleTask, source: snapshot.source, title: noteTitle(snapshot.path) }, snapshot.path)) : (_jsx(Alert, { unstyled: true, children: "Reading view is unavailable." })) }), _jsxs("footer", { "aria-label": "TockTutor Status Bar", className: "tocktutor-statusbar flex min-w-0 items-center border-t border-[var(--tt-border)] px-2 text-xs text-[var(--tt-muted)]", role: "group", children: [_jsx("output", { "aria-live": "polite", className: "tocktutor-message absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]", children: snapshot.message }), _jsxs("div", { className: "tocktutor-document-stats ml-auto flex items-center gap-[18px] whitespace-nowrap max-[760px]:gap-2", children: [snapshot.path !== null && (_jsxs(_Fragment, { children: [_jsx("span", { children: backlinkLabel }), _jsx("span", { children: snapshot.mode === 'reading' ? 'Reading' : snapshot.mode === 'live-preview' ? 'Live Preview' : 'Source' })] })), _jsxs("span", { children: [String(words), " words"] }), _jsxs("span", { children: [String(characters), " characters"] }), snapshot.path !== null && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Open Assistant", "aria-expanded": panel === 'assistant', onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", className: "border-0 bg-transparent px-0 py-0.5 text-[var(--tt-muted)] [&_svg]:size-[17px]", children: _jsx(WorkbenchGlyph, { kind: "chat" }) }) }), _jsx(TooltipContent, { children: "Open Assistant" })] }))] })] })] }), _jsxs("aside", { "aria-hidden": panel !== 'assistant', "aria-label": "Assistant Panel", className: "tocktutor-right-panel tocktutor-right-panel-assistant relative invisible grid min-w-0 w-0 translate-x-6 grid-rows-[minmax(0,1fr)] overflow-hidden border-l-0 bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:translate-x-0 data-[open=true]:overflow-visible data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(240px,calc(100vw-262px))]", "data-open": panel === 'assistant', style: { width: panel === 'assistant' ? `${String(assistantPanelWidth)}px` : '0px' }, ...(panel === 'assistant' ? {} : { inert: '' }), children: [panel === 'assistant' && (_jsx(Button, { unstyled: true, "aria-label": "Resize Assistant Panel", "aria-orientation": "vertical", "aria-valuemax": MAX_ASSISTANT_PANEL_WIDTH, "aria-valuemin": MIN_ASSISTANT_PANEL_WIDTH, "aria-valuenow": assistantPanelWidth, className: "tocktutor-assistant-resize absolute top-0 bottom-0 left-0 z-3 w-4 -translate-x-1/2 touch-none cursor-col-resize border-0 bg-transparent p-0 outline-none active:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] focus-visible:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)]", onKeyDown: resizeAssistantPanelWithKeyboard, onPointerDown: beginAssistantPanelResize, role: "separator", title: "Drag or Use Left and Right Arrow Keys", type: "button" })), _jsx("div", { className: "tocktutor-assistant-content min-h-0 min-w-[min(240px,calc(100vw-262px))] overflow-hidden border-l border-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-border)_92%)] transition-colors duration-140 ease-[cubic-bezier(.16,1,.3,1)]", children: props.assistantPanel })] }), _jsx(WorkbenchUtilities, { ...props, onClose: () => { setPanel(null); }, onOpenGraphNode: (path, mode) => {
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
        const selector = snapshot.mode === 'source' ? '.cm-content' : snapshot.mode === 'live-preview' ? '.ProseMirror' : '[aria-label$="View"]';
        const stop = () => {
            observer.disconnect();
            container.ownerDocument.removeEventListener('pointerdown', stop, true);
            container.ownerDocument.removeEventListener('keydown', stop, true);
            pendingEditorFocus.current = null;
        };
        const focus = () => {
            const editor = container.querySelector(selector);
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
    }, [active, snapshot.mode, snapshot.path]);
    useEffect(() => {
        focusEditor();
        return () => { pendingEditorFocus.current?.(); };
    }, [focusEditor]);
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
                    : {}), vault: snapshot.vault })), nativeActions: (_jsx(TockTutorNativeActionsOutlet, { activePath: snapshot.path, handleDispatch: event => controller.handleDispatch(event), renderSlot: props.renderSlot, saveCurrent: () => controller.save(), storeAudio: (fileName, dataBase64) => controller.storeActiveAttachment(fileName, dataBase64), vault: snapshot.vault })), onActivateTab: (paneId, path) => { void controller.activateTab(paneId, path); }, onAddBookmark: () => { controller.addActiveBookmark(); }, onAttachFiles: files => { void controller.attachFiles(Array.from(files).slice(0, 16)); }, onApplyOrganization: () => { void controller.applyOrganization(); }, onAddPane: () => { void controller.addPane(); }, onBack: () => { void controller.goBack(); }, onBaseCopy: request => { void globalThis.navigator?.clipboard?.writeText(request.text); }, onBaseEdit: request => controller.applyBaseEdit(request), onBaseExport: request => {
                const url = URL.createObjectURL(new Blob([request.text], { type: 'text/csv;charset=utf-8' }));
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = request.filename;
                anchor.click();
                URL.revokeObjectURL(url);
            }, onCancelDispatch: () => { controller.cancelDispatchDialog(); }, onCancelOrganization: () => { controller.cancelOrganization(); }, onCanvasChange: change => { void controller.applyCanvasChange(change); }, onCaptureSnapshot: () => { void controller.captureRecoverySnapshot(); }, onClearSnapshots: () => { void controller.clearRecoverySnapshots(); }, onCloseAttachmentPreview: () => { controller.closeAttachmentPreview(); }, onCloseCommandPalette: () => { controller.setCommandPaletteOpen(false); }, onClosePane: paneId => { void controller.closePane(paneId); }, onCloseSearch: () => { controller.closeSearch(); }, onCloseTab: (paneId, path) => { void controller.closeTab(paneId, path); }, onConvertActiveNote: () => { controller.convertActiveNote(); }, onCopyGraphPath: path => { void globalThis.navigator?.clipboard?.writeText(path); }, onCreateBuiltinTemplate: name => { void controller.createBuiltinTemplateNote(name); }, onCreateManagedVault: name => { void controller.createManagedVault(name); }, onEdit: source => { controller.edit(source); }, onEditorCommand: command => { controller.runEditorCommand(command); }, onExtractSelection: () => { void controller.extractActiveSelection(); }, onFocusEditor: focusEditor, onFocusPane: paneId => { void controller.focusPane(paneId); }, onForward: () => { void controller.goForward(); }, onInsertCurrentDateTime: kind => { controller.insertCurrentDateTime(kind); }, onJumpToLine: line => { controller.jumpToLine(line); }, onLoadFacets: () => { void controller.loadFacets(); }, onLoadGraph: mode => { void controller.loadGraph(mode); }, onLoadRelationships: () => { void controller.loadRelationships(); }, onLoadWorkspace: id => { void controller.loadWorkspace(id); }, onMode: mode => { controller.setMode(mode); }, onMoveNote: folder => controller.moveActiveNote(folder), onMoveCanvas: (nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY); }, onMoveTab: (paneId, path, direction) => { controller.moveTab(paneId, path, direction); }, onNewNote: () => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }); }, onOpenBookmark: id => { void controller.openBookmark(id); }, onOpenCommandPalette: () => { controller.setCommandPaletteOpen(true); }, onOpenExternalUrl: url => { setExternalUrl(url); }, onOpenGraphNode: (path, mode) => controller.openGraphNode(path, mode), onOpenInternalLink: target => controller.openInternalLink(target), onOpenRecovery: () => { void controller.setRecoveryOpen(true); }, onOpenSearch: () => { controller.openSearch(''); }, onOpenSmartView: kind => { void controller.openSmartView(kind); }, onPrepareOrganization: () => { void controller.prepareOrganization(); }, onPreviewAttachment: path => { void controller.previewAttachment(path); }, onReadSnapshot: id => { void controller.readRecoverySnapshot(id); }, onRenameTitle: title => controller.renameActiveTitle(title), onRemoveBookmark: id => { controller.removeBookmark(id); }, onReopenClosedTab: () => { void controller.reopenClosedTab(); }, onRestoreSnapshot: id => { void controller.restoreRecoverySnapshot(id); }, onRestoreSnapshotOverwrite: id => { void controller.restoreRecoverySnapshotOverwrite(id); }, onRestoreTrash: id => { void controller.restoreTrashEntry(id); }, onLoadMoreSearch: () => { void controller.loadMoreSearch(); }, onQuickAnswer: () => { void controller.runQuickAnswer(); }, onCancelQuickAnswer: () => { controller.cancelQuickAnswer(); }, onRetryQuickAnswer: () => { void controller.retryQuickAnswer(); }, onRunSearch: () => { void controller.runSearch(); }, onSave: () => { void controller.save(); }, onSaveWorkspace: () => { controller.saveCurrentWorkspace(); }, onSearchActiveMove: delta => { controller.moveSearchActive(delta); }, onSearchActiveSet: index => { controller.setSearchActiveIndex(index); }, onSearchChange: query => { controller.setSearchQuery(query); }, onSearchMode: mode => { controller.setSearchMode(mode); }, onSearchFilters: filters => { controller.setSearchFilters(filters); }, onSelectSearchMatch: (match, newTab) => controller.openSearchMatch(match, newTab), onHideSearchPreview: () => { controller.hideSearchPreview(); }, onSettingsChange: change => { controller.updateSettings(change); }, onSelect: path => { void controller.select(path); }, onSelectionChange: (start, end) => { controller.setSourceEditorSelection(start, end); }, onSetProperty: (key, value) => controller.setProperty(key, value), onStoreAttachment: (fileName, dataBase64) => { void controller.storeActiveAttachment(fileName, dataBase64); }, onSubmitDispatch: draft => { void controller.submitDispatchDialog(draft); }, onToggleFocusMode: () => { controller.toggleFocusMode(); }, onToggleTask: index => { controller.toggleTask(index); }, onTrashCurrent: () => { void controller.trashCurrent(); }, reviewPanel: (_jsx(TockTutorReviewPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), active: active, renderVaultActions: (placement, close, closeMenu, beginRename, renderMenuItem) => (_jsx(TockTutorVaultActionsOutlet, { beginRename: beginRename, close: close, closeMenu: closeMenu, placement: placement, renderMenuItem: renderMenuItem, renderSlot: props.renderSlot, saveCurrent: () => controller.save(), vault: snapshot.vault, vaultName: snapshot.vaultName ?? null })), snapshot: snapshot, webViewerPanel: (_jsx(TockTutorWebViewerOutlet, { activePath: snapshot.path, addLinkBookmark: (title, url) => controller.addLinkBookmark(title, url), externalUrl: externalUrl, renderSlot: props.renderSlot, vault: snapshot.vault, webClipFolder: snapshot.settings?.webClipFolder ?? 'Clips' })), ...(active && typeof document !== 'undefined'
                ? { titlebarTarget: document.getElementById('tockteam-window-titlebar-slot') ?? document.body }
                : {}) }) }));
}
//# sourceMappingURL=route.js.map