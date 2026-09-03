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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, ChevronLeft, ChevronRight, Ellipsis, FileClock, FileCode2, FileText, Globe2, Link2, ListTree, MessageSquare, Network, PanelLeft, PanelRight, PanelsTopLeft, PanelTop, Paperclip, Pencil, Plus, Search, SlidersHorizontal, Tags, Trash2, Upload, Wrench, X, } from 'lucide-react';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from "./assistant-panel.js";
import { ExecutableBaseView } from "./base-executable-view.js";
import { executableBasePropertyIdentity } from "./base-edit.js";
import { CanvasBoard } from "./canvas-board.js";
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT, } from "./native-actions.js";
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
import { addBookmark, loadBookmarks, saveBookmarks } from "./bookmarks.js";
import { layoutGraph, projectGraph } from "./graph.js";
import { BUILTIN_TEMPLATES, buildCaptureNote, buildJournalNote, expandTemplate, uniqueNotePath } from "./capture.js";
import { buildOrganizationProposal } from "./organize.js";
import { convertMarkdownFormats, extractSelectionToNote } from "./composer.js";
import { appendAttachmentMarkdown, attachmentTargetPath } from "./attachments.js";
import { collectEmbedTargets, resolveEmbedGraph } from "./embeds.js";
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
function embedTargetSources(source) {
    try {
        return Object.freeze(collectEmbedTargets(source).map(target => target.source));
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
    disposal = null;
    vaultGeneration = 0;
    shellSession = createWorkbenchSession(ROUTE_PREFIX, null, 'pane-1');
    recentlyClosed = [];
    historyBack = [];
    historyForward = [];
    bookmarks = [];
    workspaces = [];
    operation = 0;
    embedOperation = 0;
    embedTargets = Object.freeze([]);
    dispatchRevision = 0;
    operationAbort = null;
    embedAbort = null;
    saveAbort = null;
    saving = null;
    draftAbort = null;
    draftFlush = null;
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
        if (this.snapshot.saveStatus !== 'saved' && !await this.save())
            return 'failed';
        if (!this.dispatchCurrent(revision, vault))
            return 'stale';
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
                ...(mode === 'local' ? { depth: this.snapshot.settings?.graphDepth ?? 2 } : {}),
                direction: 'both',
                expectedVault: vault,
                includeAttachments: this.snapshot.settings?.graphIncludeAttachments ?? false,
                includeTags: this.snapshot.settings?.graphIncludeTags ?? false,
                limit: 180,
                ...(mode === 'local' && this.snapshot.path !== null ? { path: this.snapshot.path } : {}),
                scope: mode,
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
    async captureRecoverySnapshot() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null)
            return false;
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.captureSnapshot({
                content: this.snapshot.source,
                expectedVault: vault,
                path,
                reason: 'manual',
            }));
            if (result.generation !== vault.generation || result.snapshot?.path !== path)
                return false;
            await this.setRecoveryOpen(true);
            return true;
        }
        catch {
            return false;
        }
    }
    async clearRecoverySnapshots() {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        if (vault === null || path === null)
            return false;
        try {
            const result = remoteValue(await this.remote.tocktutorWorkbench.clearSnapshots({ expectedVault: vault, path }));
            if (result.generation !== vault.generation)
                return false;
            this.update({ selectedSnapshot: null, snapshots: Object.freeze([]) });
            return true;
        }
        catch {
            return false;
        }
    }
    async restoreRecoverySnapshotOverwrite(snapshotId) {
        const vault = this.snapshot.vault;
        const path = this.snapshot.path;
        const revision = this.snapshot.revision;
        if (vault === null || path === null || revision === null || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId) !== true)
            return false;
        try {
            const restored = remoteValue(await this.remote.tocktutorWorkbench.restoreSnapshot({
                expectedRevision: revision,
                expectedVault: vault,
                path,
                snapshotId,
            }));
            if (restored.status !== 'saved' || restored.generation !== vault.generation || restored.path !== path)
                return false;
            this.clearDocument();
            return await this.select(path, false);
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
            const mode = pane.tabs.find(tab => tab.path === path)?.mode
                ?? (documentKind(path) === 'markdown' ? this.snapshot.settings?.defaultEditingMode ?? 'live-preview' : 'source');
            this.cancelEmbedOperation();
            this.embedTargets = embedTargetSources(content);
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
        const nextEmbedTargets = embedTargetSources(source);
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
    async loadEmbeds() {
        const vault = this.snapshot.vault;
        const sourcePath = this.snapshot.path;
        if (vault === null || sourcePath === null || this.snapshot.documentKind !== 'markdown')
            return false;
        const source = this.snapshot.source;
        let targets;
        try {
            targets = collectEmbedTargets(source);
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
        if (this.disposal !== null)
            return this.disposal;
        const flush = this.flushPendingDraft();
        this.settlePendingDispatch('stale');
        this.disposed = true;
        this.dispatchRevision += 1;
        this.operation += 1;
        this.operationAbort?.abort();
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
            props.onCancel(); }, children: _jsx(DialogContent, { unstyled: true, className: "tocktutor-dispatch-dialog fixed top-1/2 left-1/2 z-[2147483647] w-[calc(100%-48px)] max-w-[480px] -translate-1/2", overlayClassName: "z-[2147483646]", showCloseButton: false, children: _jsxs("form", { className: "grid w-full gap-3.5 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 [&_input]:rounded-[5px] [&_input]:border [&_input]:border-[var(--tt-border)] [&_input]:p-2 [&_input]:[font:inherit] [&_label]:grid [&_label]:gap-[5px] [&_label]:font-[650] [&_textarea]:rounded-[5px] [&_textarea]:border [&_textarea]:border-[var(--tt-border)] [&_textarea]:p-2 [&_textarea]:[font:inherit]", onSubmit: submit, children: [_jsx("header", { children: _jsx(DialogTitle, { className: "m-0 text-[17px]", children: label }) }), props.kind === 'new' ? (_jsxs(Label, { unstyled: true, children: ["Note Path", _jsx(Input, { unstyled: true, "aria-label": "New Note Path", autoFocus: true, maxLength: 1_000, name: "path", required: true })] })) : (_jsxs(_Fragment, { children: [_jsxs(Label, { unstyled: true, children: ["Title", _jsx(Input, { unstyled: true, "aria-label": "Capture Title", autoFocus: true, maxLength: 200, name: "title", required: true })] }), _jsxs(Label, { unstyled: true, children: ["Text", _jsx(Textarea, { unstyled: true, "aria-label": "Capture Text", maxLength: 100_000, name: "text" })] })] })), _jsxs("div", { className: "tocktutor-dialog-actions flex justify-end gap-2 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit", children: [_jsx(Button, { unstyled: true, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, type: "submit", children: "Create" })] })] }) }) }));
}
const SEARCH_OPTIONS = [
    { description: 'match path of the file', label: 'path:', value: 'path:' },
    { description: 'match file name', label: 'file:', value: 'file:' },
    { description: 'search for tags', label: 'tag:', value: 'tag:' },
    { description: 'search keywords on same line', label: 'line:', value: 'line:' },
    { description: 'search keywords under same heading', label: 'section:', value: 'section:' },
    { description: 'match property', label: '[property]', value: '[]' },
];
function NoteSearchPreview(props) {
    return (_jsx("aside", { "aria-label": "Note Preview", className: "min-h-0 p-3 max-sm:hidden", role: "region", children: props.path === null ? (_jsx("div", { className: "flex h-full items-center justify-center rounded-lg border border-[var(--tt-border)] px-6 text-center text-sm text-[var(--tt-muted)]", children: "Select a result to preview it." })) : (_jsxs("div", { className: "h-full overflow-hidden rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)]", children: [_jsx("div", { className: "h-20 border-b border-[var(--tt-border)] bg-[var(--tt-selected)]" }), _jsxs("div", { className: "p-5", children: [_jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: "Note" }), _jsx("strong", { className: "mt-1 block truncate text-xl font-semibold tracking-[-0.01em]", children: noteTitle(props.path) }), props.match === undefined ? (_jsx("p", { className: "mt-3 mb-0 truncate text-sm leading-5 text-[var(--tt-muted)]", children: props.path })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "mt-3 mb-0 text-sm leading-5 text-[var(--tt-text)]", children: props.match.preview }), _jsxs("p", { className: "mt-2 mb-0 truncate text-xs text-[var(--tt-muted)]", children: [props.match.path, props.match.line === null ? '' : `:${String(props.match.line)}`] })] }))] })] })) }));
}
function NoteSearchResultList(props) {
    return (_jsx("div", { className: "min-h-0 overflow-auto", children: props.matches.length > 0 ? (_jsx("ul", { className: "m-0 grid list-none gap-0.5 p-0", "aria-label": "Vault Search Results", children: props.matches.map((match, index) => (_jsx("li", { children: _jsxs(Button, { unstyled: true, "aria-current": props.previewMatchIndex === index ? 'true' : undefined, "aria-label": `Open ${match.path}`, className: "grid min-h-11 w-full grid-cols-[18px_minmax(0,1fr)] items-start gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left outline-none hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)] aria-current:bg-[var(--tt-selected)]", onClick: () => { props.onSelect(match.path); props.onClose(); }, onFocus: () => { props.onPreview(index); }, onMouseEnter: () => { props.onPreview(index); }, type: "button", children: [_jsx(FileText, { "aria-hidden": "true", className: "mt-0.5 text-[var(--tt-muted)]", strokeWidth: 1.6 }), _jsxs("span", { className: "min-w-0", children: [_jsx("strong", { className: "block truncate text-sm font-medium", children: noteTitle(match.path) }), _jsx("span", { className: "block truncate text-xs text-[var(--tt-muted)]", children: match.preview })] })] }) }, `${match.kind}:${match.path}:${String(match.line ?? 0)}:${match.preview}`))) })) : props.pathResults.length > 0 ? (_jsx("ul", { className: "m-0 grid list-none gap-0.5 p-0", "aria-label": "Matching Note Paths", children: props.pathResults.map(path => (_jsx("li", { children: _jsxs(Button, { unstyled: true, "aria-current": props.previewResultPath === path ? 'true' : undefined, "aria-label": `Open ${path}`, className: "grid min-h-9 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm outline-none hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)] aria-current:bg-[var(--tt-selected)]", onClick: () => { props.onSelect(path); props.onClose(); }, onFocus: () => { props.onPreview(path); }, onMouseEnter: () => { props.onPreview(path); }, type: "button", children: [_jsx(FileText, { "aria-hidden": "true", className: "text-[var(--tt-muted)]", strokeWidth: 1.6 }), _jsx("span", { className: "truncate", children: path })] }) }, path))) })) : _jsx(Alert, { unstyled: true, className: "px-2 py-3 text-sm text-[var(--tt-muted)]", role: "status", children: props.query.trim() === '' ? 'Type to search notes.' : 'No matching notes.' }) }));
}
function WorkbenchNoteSearchPalette(props) {
    const { snapshot } = props;
    const matches = snapshot.searchMatches ?? [];
    const pathResults = snapshot.searchQuery.trim() === '' || matches.length > 0 ? [] : props.notePaths.slice(0, 100);
    const searchInputContainer = useRef(null);
    const searchCaret = useRef(null);
    const [searchOptionsOpen, setSearchOptionsOpen] = useState(false);
    const [previewChoice, setPreviewChoice] = useState(null);
    const previewMatchIndex = typeof previewChoice === 'number' && matches[previewChoice] !== undefined ? previewChoice : 0;
    const previewMatch = matches[previewMatchIndex];
    const previewResultPath = previewMatch?.path ?? pathResults.find(path => path === previewChoice) ?? pathResults[0] ?? null;
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
            props.onClose(); }, children: _jsxs(DialogContent, { unstyled: true, className: "fixed top-1/2 left-1/2 z-[2147483647] grid h-[640px] max-h-[calc(100vh-48px)] w-[calc(100%-32px)] max-w-[960px] -translate-1/2 grid-rows-[56px_42px_minmax(0,1fr)_40px] overflow-hidden rounded-[14px] border border-border bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-[0_18px_48px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.08)] outline-none [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-text)_6%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", overlayClassName: "z-[2147483646] !bg-transparent", showCloseButton: false, children: [_jsx(DialogTitle, { className: "sr-only", children: "Search Notes" }), _jsxs("div", { ref: searchInputContainer, className: "flex min-w-0 items-center gap-3 px-4 text-[var(--tt-muted)] [&>svg]:size-[18px]", children: [_jsx(Search, { "aria-hidden": "true" }), _jsx(Input, { unstyled: true, "aria-label": "Search Notes Query", autoFocus: true, className: "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--tt-text)] outline-none placeholder:text-[var(--tt-muted)]", maxLength: 1_000, onChange: event => { props.onSearchChange?.(event.target.value); }, onKeyDown: event => {
                                if (event.key !== 'Enter' || snapshot.searchQuery.trim() === '')
                                    return;
                                event.preventDefault();
                                props.onRunSearch?.();
                            }, placeholder: "Search notes...", type: "search", value: snapshot.searchQuery }), (snapshot.searchMode ?? 'query') === 'query' && (_jsxs(Popover, { open: searchOptionsOpen, onOpenChange: setSearchOptionsOpen, children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Search Options", className: "flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)] data-[state=open]:bg-[var(--tt-selected)] data-[state=open]:text-[var(--tt-text)] [&_svg]:size-[15px]", type: "button", children: _jsx(SlidersHorizontal, { "aria-hidden": "true", strokeWidth: 1.75 }) }) }) }), _jsx(TooltipContent, { children: "Search Options" })] }), _jsxs(PopoverContent, { unstyled: true, align: "end", "aria-label": "Search Options", className: "z-[2147483647] box-border flex w-[300px] flex-col gap-2 rounded-xl border border-[var(--dsw-alias-border-l1,#e1e3e7)] bg-[var(--dsw-alias-bg-layer-1,#fff)] p-2.5 text-sm text-[var(--dsw-alias-label-primary,#27272a)] shadow-xl outline-none", onCloseAutoFocus: event => {
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
                                    }, role: "dialog", sideOffset: 8, children: [_jsxs(PopoverHeader, { className: "gap-0.5 px-1.5 pt-0.5", children: [_jsx(PopoverTitle, { className: "text-xs font-semibold", children: "Search syntax" }), _jsx(PopoverDescription, { className: "m-0 text-xs text-[var(--dsw-alias-label-secondary,#71717a)]", children: "Insert an operator at the cursor." })] }), _jsx("ul", { className: "m-0 grid list-none gap-1 p-0", children: SEARCH_OPTIONS.map(option => (_jsx("li", { children: _jsxs(Button, { unstyled: true, className: "grid w-full cursor-pointer grid-cols-[76px_1fr] items-start gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus-visible:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus-visible:outline-none", onClick: () => { insertSearchOption(option.value); }, type: "button", children: [_jsx("code", { className: "font-mono text-xs font-semibold leading-4 text-[var(--dsw-alias-brand-primary,#533afd)]", children: option.label }), _jsx("span", { className: "text-xs leading-4 text-[var(--dsw-alias-label-secondary,#71717a)]", children: option.description })] }) }, option.label))) })] })] }))] }), _jsxs("header", { className: "flex items-center justify-between gap-3 border-b border-[var(--tt-border)] px-3 text-xs font-medium text-[var(--tt-muted)]", children: [_jsxs("div", { className: "flex items-center gap-0.5", children: [_jsxs(ToggleGroup, { unstyled: true, type: "single", "aria-label": "Search Mode", className: "flex items-center gap-0.5", value: snapshot.searchMode ?? 'query', onValueChange: value => { if (value === 'query' || value === 'related')
                                        props.onSearchMode?.(value); }, children: [_jsx(ToggleGroupItem, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2.5 py-1.5 hover:bg-[var(--tt-selected)] data-[state=on]:bg-[var(--tt-selected)] data-[state=on]:text-[var(--tt-text)]", value: "query", children: "Keyword" }), _jsx(ToggleGroupItem, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2.5 py-1.5 hover:bg-[var(--tt-selected)] data-[state=on]:bg-[var(--tt-selected)] data-[state=on]:text-[var(--tt-text)]", value: "related", children: "Related" })] }), _jsx(Button, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2.5 py-1.5 hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)] disabled:opacity-40", disabled: snapshot.searchLoading === true || snapshot.searchQuery.trim() === '', onClick: props.onRunSearch, type: "button", children: snapshot.searchLoading === true ? 'Searching…' : 'Search' })] }), _jsx(Alert, { unstyled: true, "aria-live": "polite", className: "text-xs font-normal text-[var(--tt-muted)]", role: "status", children: matches.length > 0 ? `${String(matches.length)} vault results` : `${String(pathResults.length)} matching note paths` })] }), _jsxs("section", { className: "grid min-h-0 grid-cols-[minmax(0,3fr)_minmax(260px,2fr)] max-sm:grid-cols-1", "aria-label": "Search Results", children: [_jsxs("div", { className: "grid min-h-0 grid-rows-[36px_minmax(0,1fr)] border-r border-[var(--tt-border)] px-3 pb-3 max-sm:border-r-0", children: [_jsx("div", { className: "flex items-end px-2 pb-1 text-[11px] font-medium text-[var(--tt-muted)]", children: "Results" }), _jsx(NoteSearchResultList, { matches: matches, onClose: props.onClose, onPreview: setPreviewChoice, onSelect: props.onSelect, pathResults: pathResults, previewMatchIndex: previewMatchIndex, previewResultPath: previewResultPath, query: snapshot.searchQuery })] }), _jsx(NoteSearchPreview, { match: previewMatch, path: previewResultPath })] }), _jsxs("footer", { className: "flex items-center gap-4 border-t border-[var(--tt-border)] px-3 text-[11px] text-[var(--tt-muted)]", children: [_jsx(Button, { unstyled: true, className: "rounded-md border-0 bg-transparent px-2 py-1 hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)]", onClick: props.onCommands, type: "button", children: "Commands" }), _jsxs("span", { className: "ml-auto flex items-center gap-1.5", children: [_jsx("kbd", { className: "font-[inherit] text-[var(--tt-text)]", children: "\u21B5" }), " Search"] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "font-[inherit] text-[var(--tt-text)]", children: "Esc" }), " Dismiss"] })] })] }) }));
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
            props.onClose(); }, children: _jsxs(DialogContent, { unstyled: true, className: "fixed top-1/2 left-1/2 z-[2147483647] grid h-[600px] max-h-[calc(100vh-48px)] w-[calc(100%-32px)] max-w-[900px] -translate-1/2 grid-rows-[60px_minmax(0,1fr)_44px] overflow-hidden rounded-[14px] border border-border bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-xl outline-none [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)]", overlayClassName: "z-[2147483646] !bg-transparent", showCloseButton: false, children: [_jsx(DialogTitle, { className: "sr-only", children: "Command Palette" }), _jsxs(Command, { unstyled: true, className: "contents", label: "Search Commands", children: [_jsxs(Label, { unstyled: true, className: "flex min-w-0 items-center gap-3 border-b border-[var(--tt-border)] px-4 text-[var(--tt-muted)] [&>svg]:size-[18px]", children: [_jsx(Search, { "aria-hidden": "true" }), _jsx(CommandInput, { unstyled: true, "aria-label": "Search Commands", autoFocus: true, className: "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--tt-text)] outline-none placeholder:text-[var(--tt-muted)]", maxLength: 200, onValueChange: setQuery, placeholder: "Search", value: query })] }), _jsxs("div", { className: "grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(240px,32%)] gap-6 px-4 pb-4 max-sm:grid-cols-1", children: [_jsxs("section", { className: "grid min-h-0 grid-rows-[52px_minmax(0,1fr)]", "aria-label": "Command Results", children: [_jsxs("header", { className: "flex items-center justify-between gap-3 text-xs font-medium text-[var(--tt-muted)]", children: [_jsx("span", { children: "Search Results" }), _jsx("span", { children: "Best Matches" })] }), _jsxs(CommandList, { unstyled: true, className: "overflow-auto", label: "Command Search Results", children: [_jsx(CommandEmpty, { unstyled: true, className: "px-2.5 py-2 text-sm text-[var(--tt-muted)]", children: "No matching commands." }), _jsx(CommandGroup, { unstyled: true, className: "grid auto-rows-max gap-1", children: commands.map(command => (_jsx(CommandItem, { unstyled: true, className: "min-h-9 cursor-default rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm text-[var(--tt-text)] outline-none hover:bg-[var(--tt-selected)] data-[selected=true]:bg-[var(--tt-selected)] data-[disabled=true]:opacity-40", disabled: command.disabled === true || command.run === undefined, onSelect: () => {
                                                            command.run?.();
                                                            if (command.close !== false)
                                                                props.onClose();
                                                        }, value: command.label, children: command.label }, command.label))) })] })] }), _jsx("section", { className: "mt-[52px] min-h-0 rounded-xl border border-[var(--tt-border)] p-5 max-sm:hidden", "aria-label": "Command Preview", children: _jsxs("div", { className: "flex h-full flex-col justify-center gap-2", children: [_jsx("strong", { className: "text-sm font-semibold", children: "Command Preview" }), _jsx("p", { className: "m-0 text-sm leading-5 text-[var(--tt-muted)]", children: "Choose a command to run it in TockTutor." })] }) })] }), _jsxs("footer", { className: "flex items-center gap-5 border-t border-[var(--tt-border)] px-4 text-xs text-[var(--tt-muted)]", children: [_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm", children: "Enter" }), " Run"] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("kbd", { className: "rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm", children: "Esc" }), " Dismiss"] })] })] })] }) }));
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
    const [paletteView, setPaletteView] = useState(null);
    const visiblePalette = paletteView ?? (snapshot.searchOpen ? 'notes' : snapshot.commandPaletteOpen === true ? 'commands' : null);
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
    const titlebar = active ? (_jsxs("section", { "aria-label": "TockTutor Title Bar", className: "tocktutor-titlebar absolute top-0 right-0 left-0 z-[2147483647] grid h-[var(--tockteam-titlebar-height,40px)] grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)] border-b border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] text-[var(--tt-text)] transition-[grid-template-columns] duration-300 ease-out [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [-webkit-app-region:drag] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_button]:text-inherit [&_button]:[font:inherit] [&_button]:[-webkit-app-region:no-drag] [&_svg]:block [&_svg]:size-[18px]", style: {
            gridTemplateColumns: titlebarColumns,
            transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
        }, children: [_jsxs("div", { className: "tocktutor-titlebar-sidebar flex min-w-0 items-center justify-start gap-2 border-r border-[var(--tt-border)] pr-1 pl-[46px] [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)] [&>span]:inline-flex [&>span]:h-7 [&>span]:w-[22px] [&>span]:items-center [&>span]:justify-center [&>span]:border-0 [&>span]:bg-transparent [&>span]:p-0 [&>span]:text-[var(--tt-muted)]", children: [effectiveSidebarOpen && (_jsxs(_Fragment, { children: [_jsx("span", { className: "tocktutor-titlebar-document rounded-[5px] bg-[color-mix(in_srgb,var(--tt-text)_8%,transparent)] text-[var(--tt-text)]", children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { unstyled: true, "aria-label": "Search Notes", className: "border-0 bg-transparent p-0", disabled: props.onOpenSearch === undefined, onClick: props.onOpenSearch, type: "button", children: _jsx(Search, { "aria-hidden": "true" }) }) }) }), _jsx(TooltipContent, { children: "Search Notes" })] }), _jsx(Button, { unstyled: true, "aria-label": "Bookmark Active Note", className: "h-7 w-[22px] border-0 bg-transparent p-0", disabled: snapshot.path === null || props.onAddBookmark === undefined, onClick: props.onAddBookmark, type: "button", children: _jsx(WorkbenchGlyph, { kind: "bookmark" }) })] })), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-expanded": effectiveSidebarOpen, "aria-label": "Toggle Files Sidebar", className: "tocktutor-panel-icon ml-auto size-9 border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setSidebarOpen(open => !open); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel" }) }) }), _jsx(TooltipContent, { children: "Toggle Files Sidebar" })] })] }), _jsxs("div", { className: "tocktutor-titlebar-main flex min-w-0 items-center gap-1 pl-2 pr-3.5", children: [_jsxs("span", { className: "tocktutor-history mr-[18px] flex gap-[5px] px-1.5", children: [_jsx(Button, { unstyled: true, "aria-label": "Go Back", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoBack !== true, onClick: props.onBack, type: "button", children: _jsx(WorkbenchGlyph, { kind: "back" }) }), _jsx(Button, { unstyled: true, "aria-label": "Go Forward", className: "border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35", disabled: snapshot.canGoForward !== true, onClick: props.onForward, type: "button", children: _jsx(WorkbenchGlyph, { kind: "forward" }) })] }), _jsx("div", { className: "tocktutor-tabs -mx-[calc(var(--tt-tab-curve)*2)] -mb-px flex max-w-[min(48rem,58vw)] min-w-0 self-stretch items-end gap-1 overflow-x-auto overflow-y-hidden px-[calc(var(--tt-tab-curve)*2)] [--tt-tab-curve:8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", ...(focusedPane?.tabs.length ? { 'aria-label': 'Note Tabs', role: 'tablist' } : {}), children: focusedPane?.tabs.map((tab, index) => (_jsxs("div", { className: "relative z-1 -mb-px flex h-[34px] min-w-[118px] max-w-[220px] items-center gap-2 rounded-t-[5px] border border-b-0 border-[var(--tt-border)] bg-[var(--tt-panel)] pr-2.5 pl-3 before:pointer-events-none before:absolute before:bottom-[-1px] before:left-[calc(var(--tt-tab-curve)*-2)] before:h-[calc(var(--tt-tab-curve)*2)] before:w-[calc(var(--tt-tab-curve)*2)] before:rounded-full before:content-[''] before:[clip-path:inset(50%_calc(var(--tt-tab-curve)*-1)_0_50%)] before:[box-shadow:inset_0_0_0_1px_var(--tt-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] after:pointer-events-none after:absolute after:right-[calc(var(--tt-tab-curve)*-2)] after:bottom-[-1px] after:h-[calc(var(--tt-tab-curve)*2)] after:w-[calc(var(--tt-tab-curve)*2)] after:rounded-full after:content-[''] after:[clip-path:inset(50%_50%_0_calc(var(--tt-tab-curve)*-1))] after:[box-shadow:inset_0_0_0_1px_var(--tt-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] data-[active=false]:border-b data-[active=false]:bg-[color-mix(in_srgb,var(--tt-panel)_70%,transparent)] data-[active=false]:text-[var(--tt-muted)] data-[active=false]:shadow-none data-[active=false]:before:hidden data-[active=false]:after:hidden", "data-active": tab.path === focusedPane.activePath, role: "presentation", children: [_jsx(Button, { unstyled: true, "aria-selected": tab.path === focusedPane.activePath, className: "relative z-1 flex min-w-0 flex-1 items-center self-stretch border-0 bg-transparent p-0 text-left [&>span]:truncate", onClick: () => { props.onActivateTab(focusedPane.id, tab.path); }, onKeyDown: event => {
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
    return (_jsx(TooltipProvider, { children: _jsxs("main", { "aria-label": "TockTutor Workbench", className: "tocktutor-workbench h-full min-h-0 box-border bg-[var(--tt-bg)] pt-0 text-[var(--tt-text)] [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-bg:var(--dsw-alias-bg-base,#fff)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-footer-height:28px] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_[hidden]]:!hidden [&_button]:text-inherit [&_button]:[font:inherit] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tt-accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tt-accent)] [&_svg]:block [&_svg]:size-4 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tt-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!delay-0 motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!delay-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!delay-0 motion-reduce:[&_*::before]:!duration-0", "data-focus-mode": snapshot.focusMode === true, "data-phase": snapshot.phase, tabIndex: -1, children: [titlebar !== null && (props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget)), snapshot.dispatchDialog !== null && (_jsx(NativeDispatchDialog, { kind: snapshot.dispatchDialog, onCancel: () => { props.onCancelDispatch?.(); }, onSubmit: draft => { props.onSubmitDispatch?.(draft); } })), visiblePalette === 'commands' && (_jsx(WorkbenchCommandPalette, { canGoBack: snapshot.canGoBack === true, canGoForward: snapshot.canGoForward === true, canReopen: (snapshot.recentlyClosed?.length ?? 0) > 0, editorEnabled: snapshot.documentKind === 'markdown' && snapshot.mode !== 'reading', onBack: props.onBack, onClose: () => { setPaletteView(null); props.onCloseCommandPalette?.(); }, onEditorCommand: props.onEditorCommand, onForward: props.onForward, onNewNote: props.onNewNote, onReopen: props.onReopenClosedTab, onSearch: () => { setPaletteView('notes'); props.onOpenSearch?.(); }, onToggleFocus: props.onToggleFocusMode })), visiblePalette === 'notes' && (_jsx(WorkbenchNoteSearchPalette, { notePaths: documents.map(document => document.path), onClose: () => { setPaletteView(null); props.onCloseCommandPalette?.(); props.onCloseSearch?.(); }, onCommands: () => { setPaletteView('commands'); props.onOpenCommandPalette?.(); props.onCloseSearch?.(); }, onRunSearch: props.onRunSearch, onSearchChange: props.onSearchChange, onSearchMode: props.onSearchMode, onSelect: props.onSelect, snapshot: snapshot })), _jsxs("div", { className: "tocktutor-grid relative grid h-full min-h-0 grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 ease-out", style: {
                        gridTemplateColumns: contentColumns,
                        transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
                    }, children: [_jsxs("aside", { "aria-hidden": !effectiveSidebarOpen, "aria-label": "Files", className: "tocktutor-sidebar grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden border-r border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] data-[open=false]:invisible data-[open=false]:[transition:visibility_0s_linear_300ms]", "data-open": effectiveSidebarOpen, ...(effectiveSidebarOpen ? {} : { inert: '' }), children: [_jsxs("header", { className: "tocktutor-sidebar-header flex items-center gap-2.5 border-b border-[var(--tt-border)] px-2.5 [&_svg]:size-3.5", children: [_jsx("h1", { className: "mr-auto my-0 text-sm font-semibold", children: "Files" }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(WorkbenchGlyph, { kind: "more" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(Upload, { "aria-hidden": "true" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(WorkbenchGlyph, { kind: "folder" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(PanelTop, { "aria-hidden": "true" }) })] }), _jsx("div", { className: "tocktutor-sidebar-content min-h-0 overflow-auto px-[5px] py-[3px]", children: _jsxs("nav", { "aria-label": "Vault Notes", children: [snapshot.phase === 'loading' && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "Loading notes\u2026" }), snapshot.phase === 'inactive' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: "No Active Vault" }), snapshot.phase === 'error' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]", children: snapshot.message }), snapshot.phase === 'ready' && documents.length === 0 && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "No supported notes found." }), _jsx("ul", { className: "tocktutor-tree m-0 list-none p-0", role: visibleTreeEntries.length > 0 ? 'tree' : undefined, children: _jsx(TreeEntries, { entries: visibleTreeEntries, onSelect: props.onSelect, path: snapshot.path }) })] }) }), _jsx(WorkbenchVaultDialog, { onActivateRecentVault: props.onActivateRecentVault, onCreateManagedVault: props.onCreateManagedVault, onRemoveRecentVault: props.onRemoveRecentVault, recentVaults: snapshot.recentVaults ?? [], vault: snapshot.vault })] }), _jsx(Button, { unstyled: true, "aria-label": `Resize Files Sidebar, ${String(sidebarWidth)} Pixels`, className: "tocktutor-sidebar-resize absolute top-0 bottom-0 z-5 m-0 w-2 touch-none cursor-ew-resize border-0 bg-transparent p-0 outline-none after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-0.5 after:bg-transparent after:content-[''] focus-visible:after:bg-[var(--tt-accent)]", hidden: !effectiveSidebarOpen, onKeyDown: resizeSidebarWithKeyboard, onPointerDown: beginSidebarResize, style: { left: sidebarWidth - 4 }, title: "Drag or Use Left and Right Arrow Keys", type: "button" }), _jsxs("section", { "aria-label": "Note Editor", className: "tocktutor-editor grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden bg-[var(--tt-panel)]", id: "tocktutor-note-editor", role: "tabpanel", children: [_jsxs("header", { className: "tocktutor-editor-header relative flex min-w-0 items-center justify-center border-b border-[var(--tt-border)] px-2.5", children: [_jsx("h2", { className: "m-0 truncate text-[13px] font-medium text-[var(--tt-muted)]", children: noteTitle(snapshot.path) }), _jsxs("div", { className: "tocktutor-editor-actions absolute right-2.5 flex items-center gap-1 [&>button]:inline-flex [&>button]:h-7 [&>button]:w-[26px] [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)]", children: [snapshot.documentKind === 'markdown' ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'reading' ? 'Switch to Live Preview' : 'Switch to Reading View', disabled: snapshot.path === null, onClick: () => { props.onMode(snapshot.mode === 'reading' ? 'live-preview' : 'reading'); }, type: "button", children: snapshot.mode === 'reading' ? _jsx(Pencil, { "aria-hidden": "true" }) : _jsx(FileText, { "aria-hidden": "true" }) }) }), _jsx(TooltipContent, { children: snapshot.mode === 'reading' ? 'Switch to Live Preview' : 'Switch to Reading View' })] })) : (_jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'source' ? previewLabel : sourceLabel, onClick: () => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "pencil" }) })), _jsxs(DropdownMenu, { modal: false, children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "More Note Actions", className: "inline-flex h-7 w-[26px] items-center justify-center border-0 bg-transparent p-0 text-[var(--tt-muted)]", type: "button", children: _jsx(WorkbenchGlyph, { kind: "more" }) }) }) }), _jsx(TooltipContent, { children: "More Note Actions" })] }), _jsxs(DropdownMenuContent, { align: "end", className: "w-[260px] rounded-[8px] border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,Canvas))] p-1.5 text-[var(--dsw-alias-label-primary,#27272a)] shadow-xl [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]", portalled: false, sideOffset: 6, unstyled: true, children: [snapshot.documentKind === 'markdown' && (_jsxs(_Fragment, { children: [_jsx(DropdownMenuRadioGroup, { "aria-label": "Editor Mode", value: snapshot.mode, children: [
                                                                                ['reading', 'Reading view', FileText],
                                                                                ['live-preview', 'Live Preview', Pencil],
                                                                                ['source', 'Source mode', FileCode2],
                                                                            ].map(([mode, label, Icon]) => (_jsxs(DropdownMenuRadioItem, { className: NOTE_ACTION_CLASS, onSelect: () => { props.onMode(mode); }, value: mode, children: [_jsx(Icon, { "aria-hidden": "true" }), _jsx("span", { children: label })] }, mode))) }), _jsx(DropdownMenuSeparator, {})] })), _jsxs(DropdownMenuGroup, { children: [_jsxs(DropdownMenuCheckboxItem, { checked: snapshot.settings?.backlinksInDocument ?? false, className: NOTE_ACTION_CLASS, disabled: snapshot.settings === undefined, onSelect: () => { props.onSettingsChange?.({ backlinksInDocument: !(snapshot.settings?.backlinksInDocument ?? false) }); }, children: [_jsx(Link2, { "aria-hidden": "true" }), _jsx("span", { children: "Backlinks in document" })] }), _jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, disabled: snapshot.path === null || props.onAddBookmark === undefined, onSelect: () => { props.onAddBookmark?.(); }, children: [_jsx(BookmarkPlus, { "aria-hidden": "true" }), _jsx("span", { children: "Bookmark note" })] })] }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuGroup, { children: [
                                                                        ['recovery', 'File recovery', FileClock],
                                                                        ['note-info', 'Properties and links', ListTree],
                                                                        ['graph', 'Graph view', Network],
                                                                        ['web', 'Web viewer', Globe2],
                                                                        ['library', 'Bookmarks and tags', Tags],
                                                                        ['attachments', 'Attachments and embeds', Paperclip],
                                                                        ['tools', 'Note tools', Wrench],
                                                                        ['workspace', 'Workspaces and panes', PanelsTopLeft],
                                                                        ['extensions', 'Reviews and actions', MessageSquare],
                                                                    ].map(([view, label, Icon]) => (_jsxs(DropdownMenuItem, { className: NOTE_ACTION_CLASS, onSelect: () => { setPanel(view); }, children: [_jsx(Icon, { "aria-hidden": "true" }), _jsx("span", { children: label })] }, view))) }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuGroup, { children: _jsxs(DropdownMenuItem, { className: `${NOTE_ACTION_CLASS} text-[var(--dsw-alias-state-error-primary,#dc2626)]`, disabled: snapshot.path === null || props.onTrashCurrent === undefined, onSelect: () => { props.onTrashCurrent?.(); }, children: [_jsx(Trash2, { "aria-hidden": "true" }), _jsx("span", { children: "Move file to trash" })] }) })] })] })] })] }), _jsx("div", { "aria-label": "Editor Attachment Drop Zone", className: "tocktutor-editor-body relative min-h-0 overflow-auto [&_.ProseMirror]:mx-auto [&_.ProseMirror]:min-h-full [&_.ProseMirror]:w-[calc(100%-48px)] [&_.ProseMirror]:max-w-3xl [&_.ProseMirror]:pt-[18px] [&_.ProseMirror]:pb-[72px] [&_.ProseMirror]:outline-none", onDrop: event => {
                                        if (event.dataTransfer.files.length === 0)
                                            return;
                                        event.preventDefault();
                                        props.onAttachFiles?.(event.dataTransfer.files);
                                    }, onPaste: event => {
                                        if (event.clipboardData.files.length === 0)
                                            return;
                                        props.onAttachFiles?.(event.clipboardData.files);
                                    }, children: snapshot.path === null ? (_jsx(Empty, { unstyled: true, className: "tocktutor-empty absolute top-[45%] left-1/2 w-full max-w-[420px] -translate-1/2 p-8 text-center", children: _jsxs(EmptyHeader, { unstyled: true, children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Ready When You Are" }), _jsx(EmptyTitle, { unstyled: true, "aria-level": 2, className: "text-xl font-bold", role: "heading", children: "Select a Note" }), _jsx(EmptyDescription, { unstyled: true, className: "text-[var(--tt-muted)]", children: "Choose a Markdown note from the vault to read or edit its exact source." })] }) })) : snapshot.mode === 'source' ? (_jsx("div", { className: "flex h-full min-h-0 flex-col", children: _jsx(SourceEditor, { ariaLabel: sourceLabel, className: "h-full", content: snapshot.source, onContentChange: props.onEdit, onSelectionChange: selection => { props.onSelectionChange?.(selection.main.from, selection.main.to); }, ...(snapshot.embeds === undefined ? {} : { resolvedEmbeds: snapshot.embeds }), spellCheck: true }, snapshot.path) })) : snapshot.mode === 'live-preview' && snapshot.documentKind === 'markdown' ? (_jsx(LivePreviewView, { documentKey: snapshot.path, embeds: snapshot.embeds, onEdit: props.onEdit, onOpenExternalUrl: props.onOpenExternalUrl, onSelectionChange: selection => { props.onSelectionChange?.(selection.from, selection.to); }, onToggleTask: props.onToggleTask, source: snapshot.source })) : snapshot.documentKind === 'canvas' ? (_jsx(CanvasBoard, { disabled: snapshot.revision === null || props.onCanvasChange === undefined, onChange: change => { props.onCanvasChange?.(change); }, revision: snapshot.revision ?? 'unavailable', source: snapshot.source })) : snapshot.documentKind === 'base' ? (_jsx(ExecutableBaseView, { files: snapshot.baseFiles ?? [], ...(props.onBaseCopy === undefined ? {} : { onCopy: props.onBaseCopy }), ...(props.onBaseEdit === undefined ? {} : { onEdit: props.onBaseEdit }), ...(props.onBaseExport === undefined ? {} : { onExport: props.onBaseExport }), source: snapshot.source })) : snapshot.documentKind === 'markdown' ? (_jsx(RichReadingView, { embeds: snapshot.embeds, onOpenExternalUrl: props.onOpenExternalUrl, onToggleTask: props.onToggleTask, source: snapshot.source })) : (_jsx(Alert, { unstyled: true, children: "Reading view is unavailable." })) }), _jsxs("footer", { "aria-label": "TockTutor Status Bar", className: "tocktutor-statusbar flex min-w-0 items-center border-t border-[var(--tt-border)] px-2 text-xs text-[var(--tt-muted)]", role: "group", children: [_jsx("output", { "aria-live": "polite", className: "tocktutor-message absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]", children: snapshot.message }), _jsxs("div", { className: "tocktutor-document-stats ml-auto flex items-center gap-[18px] whitespace-nowrap max-[760px]:gap-2", children: [snapshot.path !== null && (_jsxs(_Fragment, { children: [_jsx("span", { children: "0 backlinks" }), _jsx("span", { children: snapshot.mode === 'reading' ? 'Reading' : snapshot.mode === 'live-preview' ? 'Live Preview' : 'Source' })] })), _jsxs("span", { children: [String(words), " words"] }), _jsxs("span", { children: [String(characters), " characters"] }), snapshot.path !== null && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { unstyled: true, "aria-label": "Open Assistant", "aria-expanded": panel === 'assistant', onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", className: "border-0 bg-transparent px-0 py-0.5 text-[var(--tt-muted)] [&_svg]:size-[17px]", children: _jsx(WorkbenchGlyph, { kind: "chat" }) }) }), _jsx(TooltipContent, { children: "Open Assistant" })] }))] })] })] }), _jsxs("aside", { "aria-hidden": panel !== 'assistant', "aria-label": "Assistant Panel", className: "tocktutor-right-panel tocktutor-right-panel-assistant relative invisible grid min-w-0 w-0 translate-x-6 grid-rows-[minmax(0,1fr)] overflow-hidden border-l-0 bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:translate-x-0 data-[open=true]:overflow-visible data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(240px,calc(100vw-262px))]", "data-open": panel === 'assistant', style: { width: panel === 'assistant' ? `${String(assistantPanelWidth)}px` : '0px' }, ...(panel === 'assistant' ? {} : { inert: '' }), children: [panel === 'assistant' && (_jsx(Button, { unstyled: true, "aria-label": "Resize Assistant Panel", "aria-orientation": "vertical", "aria-valuemax": MAX_ASSISTANT_PANEL_WIDTH, "aria-valuemin": MIN_ASSISTANT_PANEL_WIDTH, "aria-valuenow": assistantPanelWidth, className: "tocktutor-assistant-resize absolute top-0 bottom-0 left-0 z-3 w-4 -translate-x-1/2 touch-none cursor-col-resize border-0 bg-transparent p-0 outline-none before:absolute before:top-1/2 before:left-1/2 before:h-10 before:w-2 before:-translate-1/2 before:rounded-full before:border before:border-[color-mix(in_srgb,var(--tt-text)_32%,var(--tt-border)_68%)] before:bg-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-panel))] before:shadow-[0_4px_12px_-7px_color-mix(in_srgb,var(--tt-text)_42%,transparent),0_0_0_1px_color-mix(in_srgb,var(--tt-panel)_82%,transparent)] before:transition-colors before:duration-140 before:ease-[cubic-bezier(.16,1,.3,1)] before:content-[''] hover:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] active:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] focus-visible:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] hover:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] active:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] focus-visible:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)]", onKeyDown: resizeAssistantPanelWithKeyboard, onPointerDown: beginAssistantPanelResize, role: "separator", title: "Drag or Use Left and Right Arrow Keys", type: "button" })), _jsx("div", { className: "tocktutor-assistant-content min-h-0 min-w-[min(240px,calc(100vw-262px))] overflow-hidden border-l border-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-border)_92%)] transition-colors duration-140 ease-[cubic-bezier(.16,1,.3,1)]", children: props.assistantPanel })] }), _jsx(WorkbenchUtilities, { ...props, activeProperties: activeProperties, onClose: () => { setPanel(null); }, view: panel === 'assistant' ? null : panel })] })] }) }));
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
    useEffect(() => {
        if (!active || snapshot.path === null)
            return;
        root.current?.querySelector(snapshot.mode === 'source' ? '.cm-content' : snapshot.mode === 'live-preview' ? '.ProseMirror' : '[aria-label$="View"]')?.focus();
    }, [active, snapshot.mode, snapshot.path]);
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
                    : {}), vault: snapshot.vault })), nativeActions: (_jsx(TockTutorNativeActionsOutlet, { activePath: snapshot.path, handleDispatch: event => controller.handleDispatch(event), renderSlot: props.renderSlot, saveCurrent: () => controller.save(), storeAudio: (fileName, dataBase64) => controller.storeActiveAttachment(fileName, dataBase64), vault: snapshot.vault })), onActivateRecentVault: id => { void controller.activateRecentVault(id); }, onActivateTab: (paneId, path) => { void controller.activateTab(paneId, path); }, onAddBookmark: () => { controller.addActiveBookmark(); }, onAttachFiles: files => { void controller.attachFiles(Array.from(files).slice(0, 16)); }, onApplyOrganization: () => { void controller.applyOrganization(); }, onAddPane: () => { void controller.addPane(); }, onBack: () => { void controller.goBack(); }, onBaseCopy: request => { void globalThis.navigator?.clipboard?.writeText(request.text); }, onBaseEdit: request => { void controller.applyBaseEdit(request); }, onBaseExport: request => {
                const url = URL.createObjectURL(new Blob([request.text], { type: 'text/csv;charset=utf-8' }));
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = request.filename;
                anchor.click();
                URL.revokeObjectURL(url);
            }, onCancelDispatch: () => { controller.cancelDispatchDialog(); }, onCancelOrganization: () => { controller.cancelOrganization(); }, onCanvasChange: change => { void controller.applyCanvasChange(change); }, onCaptureSnapshot: () => { void controller.captureRecoverySnapshot(); }, onClearSnapshots: () => { void controller.clearRecoverySnapshots(); }, onCloseAttachmentPreview: () => { controller.closeAttachmentPreview(); }, onCloseCommandPalette: () => { controller.setCommandPaletteOpen(false); }, onCloseSearch: () => { controller.closeSearch(); }, onCloseTab: (paneId, path) => { void controller.closeTab(paneId, path); }, onConvertActiveNote: () => { controller.convertActiveNote(); }, onCopyGraphPath: path => { void globalThis.navigator?.clipboard?.writeText(path); }, onCreateBuiltinTemplate: name => { void controller.createBuiltinTemplateNote(name); }, onCreateManagedVault: name => { void controller.createManagedVault(name); }, onEdit: source => { controller.edit(source); }, onEditorCommand: command => { controller.runEditorCommand(command); }, onExtractSelection: () => { void controller.extractActiveSelection(); }, onFocusPane: paneId => { void controller.focusPane(paneId); }, onForward: () => { void controller.goForward(); }, onInsertCurrentDateTime: kind => { controller.insertCurrentDateTime(kind); }, onJumpToLine: line => { controller.jumpToLine(line); }, onLoadGraph: mode => { void controller.loadGraph(mode); }, onLoadWorkspace: id => { void controller.loadWorkspace(id); }, onMode: mode => { controller.setMode(mode); }, onMoveCanvas: (nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY); }, onMoveTab: (paneId, path, direction) => { controller.moveTab(paneId, path, direction); }, onNewNote: () => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }); }, onOpenBookmark: id => { void controller.openBookmark(id); }, onOpenCommandPalette: () => { controller.setCommandPaletteOpen(true); }, onOpenExternalUrl: url => { setExternalUrl(url); }, onOpenGraphNode: (path, mode) => { void controller.openGraphNode(path, mode); }, onOpenRecovery: () => { void controller.setRecoveryOpen(true); }, onOpenSearch: () => { controller.openSearch(''); }, onOpenSmartView: kind => { void controller.openSmartView(kind); }, onPrepareOrganization: () => { void controller.prepareOrganization(); }, onPreviewAttachment: path => { void controller.previewAttachment(path); }, onReadSnapshot: id => { void controller.readRecoverySnapshot(id); }, onRemoveBookmark: id => { controller.removeBookmark(id); }, onRemoveRecentVault: id => { void controller.removeRecentVault(id); }, onReopenClosedTab: () => { void controller.reopenClosedTab(); }, onRestoreSnapshot: id => { void controller.restoreRecoverySnapshot(id); }, onRestoreSnapshotOverwrite: id => { void controller.restoreRecoverySnapshotOverwrite(id); }, onRestoreTrash: id => { void controller.restoreTrashEntry(id); }, onRunSearch: () => { void controller.runSearch(); }, onSave: () => { void controller.save(); }, onSaveWorkspace: () => { controller.saveCurrentWorkspace(); }, onSearchChange: query => { controller.setSearchQuery(query); }, onSearchMode: mode => { controller.setSearchMode(mode); }, onSettingsChange: change => { controller.updateSettings(change); }, onSelect: path => { void controller.select(path); }, onSelectionChange: (start, end) => { controller.setSelection(start, end); }, onSetProperty: (key, value) => { controller.setProperty(key, value); }, onStoreAttachment: (fileName, dataBase64) => { void controller.storeActiveAttachment(fileName, dataBase64); }, onSubmitDispatch: draft => { void controller.submitDispatchDialog(draft); }, onToggleFocusMode: () => { controller.toggleFocusMode(); }, onToggleTask: index => { controller.toggleTask(index); }, onTrashCurrent: () => { void controller.trashCurrent(); }, reviewPanel: (_jsx(TockTutorReviewPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), active: active, snapshot: snapshot, webViewerPanel: (_jsx(TockTutorWebViewerOutlet, { activePath: snapshot.path, addLinkBookmark: (title, url) => controller.addLinkBookmark(title, url), externalUrl: externalUrl, renderSlot: props.renderSlot, vault: snapshot.vault, webClipFolder: snapshot.settings?.webClipFolder ?? 'Clips' })), ...(active && typeof document !== 'undefined'
                ? { titlebarTarget: document.getElementById('tockteam-window-titlebar-slot') ?? document.body }
                : {}) }) }));
}
//# sourceMappingURL=route.js.map