import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { Checkbox } from '@tockteam/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@tockteam/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { Textarea } from '@tockteam/ui/textarea';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Ellipsis, FileText, Folder, MessageSquare, Music, PanelLeft, PanelRight, PanelTop, Pencil, Plus, Search, Upload, X, } from 'lucide-react';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from "./assistant-panel.js";
import { projectBase } from "./base.js";
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT, } from "./native-actions.js";
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from "./review-panel.js";
import { parseCanvasDocument, projectCanvas, updateCanvasNodePosition, } from "./canvas.js";
import { editorStatusLabel, projectReading, resolveEditorShortcut, toggleMarkdownTask, } from "./markdown.js";
import { isSafeVaultRelativePath, MAX_NOTE_TABS, MAX_PANE_GROUPS, } from "./session.js";
import { isNoteVaultChangeEvent } from "./vault-events.js";
const ROUTE_PREFIX = '/tocktutor';
const TREE_LIMIT = 200;
const DEFAULT_SIDEBAR_WIDTH = 280;
const COLLAPSED_TITLEBAR_SIDEBAR_WIDTH = 84;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_ASSISTANT_PANEL_WIDTH = 420;
const MIN_ASSISTANT_PANEL_WIDTH = 240;
const MAX_ASSISTANT_PANEL_WIDTH = 720;
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
function boundedSource(source) {
    return new TextEncoder().encode(source).byteLength <= MAX_ROUTE_SOURCE_BYTES;
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
function padded(value) {
    return String(value).padStart(2, '0');
}
function dateStamp(value) {
    return `${String(value.getFullYear())}-${padded(value.getMonth() + 1)}-${padded(value.getDate())}`;
}
function minuteStamp(value) {
    return `${dateStamp(value).replaceAll('-', '')}${padded(value.getHours())}${padded(value.getMinutes())}`;
}
function initialSnapshot() {
    return Object.freeze({
        dispatchDialog: null,
        documentKind: null,
        entries: Object.freeze([]),
        focusedPaneId: 'pane-1',
        message: 'Loading the active vault.',
        mode: 'source',
        path: null,
        phase: 'loading',
        revision: null,
        saveStatus: 'saved',
        searchOpen: false,
        searchQuery: '',
        source: '',
        panes: Object.freeze([Object.freeze({
                activePath: null,
                id: 'pane-1',
                tabs: Object.freeze([]),
            })]),
        vault: null,
        warnings: Object.freeze([]),
    });
}
/** Bounded route state machine shared by the React contribution and focused tests. */
export class WorkbenchRouteController {
    remote;
    navigate;
    now;
    snapshot = initialSnapshot();
    listeners = new Set();
    operation = 0;
    dispatchRevision = 0;
    operationAbort = null;
    saveAbort = null;
    saving = null;
    eventDispose = null;
    pendingDispatch = null;
    pathname = ROUTE_PREFIX;
    started = false;
    disposed = false;
    constructor(remote, navigate, now = () => new Date()) {
        this.remote = remote;
        this.navigate = navigate;
        this.now = now;
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
            const day = dateStamp(this.now());
            const path = `Journals/${day}.md`;
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
            return await this.createDispatchedDocument(path, request.content ?? `---\njournal-date: ${day}\n---\n# ${day}\n`, request.silent === true, revision, vault);
        }
        if (request.action === 'unique') {
            return await this.createDispatchedDocument(`${minuteStamp(this.now())}-${crypto.randomUUID()}.md`, request.content ?? '', request.silent === true, revision, vault);
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
            this.recordOpen(path);
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
            const text = draft.text?.trim() ?? '';
            const slug = title.normalize('NFKD')
                .replace(/[\u0300-\u036f]/gu, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/gu, '-')
                .replace(/^-|-$/gu, '')
                .slice(0, 80);
            if (title.length === 0 || title.length > 200 || text.length > 100_000 || slug.length === 0) {
                this.settlePendingDispatch('failed');
                return;
            }
            path = `Inbox/${dateStamp(this.now())}-${slug}.md`;
            content = `# ${title}\n\n${text}`;
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
        this.update({ searchOpen: false, searchQuery: '' });
    }
    openSearch(query) {
        this.update({ searchOpen: true, searchQuery: query });
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
    pane(id = this.snapshot.focusedPaneId) {
        return this.snapshot.panes.find(candidate => candidate.id === id);
    }
    replacePane(id, replace) {
        this.update({
            panes: Object.freeze(this.snapshot.panes.map(pane => pane.id === id
                ? Object.freeze(replace(pane))
                : pane)),
        });
    }
    recordOpen(path) {
        const pane = this.pane();
        if (pane === undefined)
            return;
        const existing = pane.tabs.find(tab => tab.path === path);
        const tabs = existing === undefined
            ? [...pane.tabs, Object.freeze({ dirty: false, path })]
            : pane.tabs.map(tab => tab.path === path ? Object.freeze({ ...tab, dirty: false }) : tab);
        this.replacePane(pane.id, current => ({
            ...current,
            activePath: path,
            tabs: Object.freeze(tabs),
        }));
    }
    recordDirty(dirty) {
        const pane = this.pane();
        const path = this.snapshot.path;
        if (pane === undefined || path === null)
            return;
        this.replacePane(pane.id, current => ({
            ...current,
            tabs: Object.freeze(current.tabs.map(tab => tab.path === path
                ? Object.freeze({ ...tab, dirty })
                : tab)),
        }));
    }
    clearDocument() {
        this.invalidateDispatch();
        this.nextOperation();
        this.update({
            documentKind: null,
            message: 'Select a note from the vault.',
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
        const pane = this.pane();
        if (pane !== undefined) {
            this.replacePane(pane.id, current => ({ ...current, activePath: null }));
        }
        this.clearDocument();
    }
    async reload() {
        this.invalidateDispatch();
        const operation = this.nextOperation();
        this.eventDispose?.();
        this.eventDispose = null;
        this.update({
            dispatchDialog: null,
            documentKind: null,
            entries: Object.freeze([]),
            focusedPaneId: 'pane-1',
            message: 'Loading the active vault.',
            path: null,
            phase: 'loading',
            revision: null,
            saveStatus: 'saved',
            searchOpen: false,
            searchQuery: '',
            source: '',
            panes: Object.freeze([Object.freeze({
                    activePath: null,
                    id: 'pane-1',
                    tabs: Object.freeze([]),
                })]),
            vault: null,
            warnings: Object.freeze([]),
        });
        try {
            const vault = remoteValue(await this.remote.tocktutorWorkbench.currentVault(operation.signal));
            if (!this.current(operation.id))
                return;
            if (vault === null) {
                this.update({ message: 'No active TockTutor vault is available.', phase: 'inactive' });
                return;
            }
            const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
                expectedVault: vault,
                limit: TREE_LIMIT,
            }, operation.signal));
            if (!this.current(operation.id) || page.generation !== vault.generation)
                return;
            this.update({
                entries: Object.freeze(page.entries.toSorted((left, right) => left.path.localeCompare(right.path))),
                message: page.truncated ? 'The vault tree is truncated to a bounded result.' : 'Vault ready.',
                phase: 'ready',
                vault,
                warnings: Object.freeze(page.warnings),
            });
            this.eventDispose = this.remote.$on('note-vault/change', event => { this.onVaultChange(event); });
            const path = pathFromTockTutorLocation(this.pathname);
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
            && this.snapshot.saveStatus === 'saved'
            && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
            const nextPath = value.path === selected ? selected : value.path;
            if (supportedDocument(nextPath)) {
                void this.select(nextPath, false);
            }
            else {
                const pane = this.pane();
                if (pane !== undefined) {
                    this.replacePane(pane.id, current => ({
                        ...current,
                        activePath: null,
                        tabs: Object.freeze(current.tabs.filter(tab => tab.path !== selected)),
                    }));
                }
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
        this.update({
            focusedPaneId: id,
            panes: Object.freeze([...this.snapshot.panes, Object.freeze({
                    activePath: null,
                    id,
                    tabs: Object.freeze([]),
                })]),
        });
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
        this.update({ focusedPaneId: id });
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
    async select(path, navigate = true, dispatchRevision) {
        const activeVault = this.snapshot.vault;
        if (!supportedDocument(path) || activeVault === null || this.snapshot.phase !== 'ready')
            return false;
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
            this.update({
                documentKind: documentKind(path),
                message: `${path} opened.`,
                path,
                revision: opened.revision,
                saveStatus: 'saved',
                source: opened.content,
            });
            this.recordOpen(path);
            if (navigate)
                this.navigate(routeForPath(path));
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
    }
    setMode(mode) {
        if (this.snapshot.path !== null)
            this.update({ mode });
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
                message: unchanged ? `${path} saved.` : 'Newer changes remain unsaved.',
                revision: saved.revision,
                saveStatus: unchanged ? 'saved' : 'unsaved',
            });
            this.recordDirty(!unchanged);
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
        this.eventDispose?.();
        this.listeners.clear();
    }
}
function ReadingBlockView(props) {
    const { block } = props;
    switch (block.kind) {
        case 'heading': {
            const Tag = `h${String(block.level)}`;
            return _jsxs(Tag, { children: [block.level === 1 && _jsx(ChevronDown, { "aria-hidden": "true" }), block.text] });
        }
        case 'paragraph': return _jsx("p", { children: block.text });
        case 'code': return _jsx("pre", { children: _jsx("code", { children: block.text }) });
        case 'task': return (_jsxs(Label, { unstyled: true, className: "tocktutor-task my-2 flex items-start gap-2", children: [_jsx(Checkbox, { "aria-label": `Mark ${block.text} as ${block.checked ? 'incomplete' : 'complete'}`, checked: block.checked, onCheckedChange: () => { props.onToggleTask(block.index); } }), _jsx("span", { children: block.text })] }));
    }
}
function CanvasView(props) {
    const projection = projectCanvas(parseCanvasDocument(props.source));
    if (projection.status !== 'ready')
        return _jsx(Alert, { unstyled: true, children: projection.reason });
    return (_jsxs("section", { "aria-label": "Canvas View", className: "tocktutor-projection min-h-0 overflow-auto p-6", tabIndex: -1, children: [_jsxs("header", { children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Canvas" }), _jsxs("h3", { className: "mt-0 mb-[18px] text-[17px]", children: [projection.nodes.length, " Nodes \u00B7 ", projection.edges.length, " Edges"] })] }), _jsx("div", { className: "tocktutor-canvas-grid grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3", children: projection.nodes.map(node => {
                    const label = node.text ?? node.file ?? `${node.type} node`;
                    return (_jsxs("article", { className: "tocktutor-canvas-node min-w-0 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-bg)] p-3.5 [&>h4]:mt-0 [&>h4]:mb-2 [&>h4]:text-sm [&>h4]:[overflow-wrap:anywhere] [&>p:not(.tocktutor-kicker)]:text-xs [&>p:not(.tocktutor-kicker)]:text-[var(--tt-muted)]", children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: node.type }), _jsx("h4", { children: label }), _jsxs("p", { children: ["Position ", String(node.x), ", ", String(node.y)] }), !node.supported && _jsx("p", { role: "note", children: "Unsupported node fields remain inert." }), _jsxs("fieldset", { className: "tocktutor-node-actions mt-2.5 flex gap-1 border-0 p-0 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit", children: [_jsxs("legend", { className: "tocktutor-visually-hidden absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]", children: ["Move ", label] }), _jsx(Button, { unstyled: true, "aria-label": `Move ${label} left`, onClick: () => { props.onMove(node.id, -20, 0); }, type: "button", children: _jsx(ArrowLeft, { "aria-hidden": "true" }) }), _jsx(Button, { unstyled: true, "aria-label": `Move ${label} up`, onClick: () => { props.onMove(node.id, 0, -20); }, type: "button", children: _jsx(ArrowUp, { "aria-hidden": "true" }) }), _jsx(Button, { unstyled: true, "aria-label": `Move ${label} down`, onClick: () => { props.onMove(node.id, 0, 20); }, type: "button", children: _jsx(ArrowDown, { "aria-hidden": "true" }) }), _jsx(Button, { unstyled: true, "aria-label": `Move ${label} right`, onClick: () => { props.onMove(node.id, 20, 0); }, type: "button", children: _jsx(ArrowRight, { "aria-hidden": "true" }) })] })] }, node.id));
                }) })] }));
}
function BaseView(props) {
    const projection = projectBase(props.source);
    if (projection.status !== 'ready')
        return _jsx(Alert, { unstyled: true, children: projection.reason });
    return (_jsxs("section", { "aria-label": "Base View", className: "tocktutor-projection min-h-0 overflow-auto p-6", tabIndex: -1, children: [_jsxs("header", { children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Base" }), _jsxs("h3", { className: "mt-0 mb-[18px] text-[17px]", children: [projection.views.length, " Views"] })] }), _jsx("div", { className: "tocktutor-base-grid grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3", children: projection.views.map((view, index) => (_jsxs("article", { className: "tocktutor-base-view min-w-0 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-bg)] p-3.5 [&>h4]:mt-0 [&>h4]:mb-2 [&>h4]:text-sm [&>h4]:[overflow-wrap:anywhere] [&>p:not(.tocktutor-kicker)]:text-xs [&>p:not(.tocktutor-kicker)]:text-[var(--tt-muted)]", children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: view.type || 'Unknown Type' }), _jsx("h4", { children: view.name }), _jsx("dl", { className: "m-0", children: Object.entries(view.fields).map(([field, value]) => (_jsxs("div", { className: "grid grid-cols-[minmax(72px,.35fr)_minmax(0,1fr)] gap-2 border-t border-[var(--tt-border)] py-[7px]", children: [_jsx("dt", { className: "text-[var(--tt-muted)]", children: field }), _jsx("dd", { className: "m-0 [overflow-wrap:anywhere]", children: value || '—' })] }, field))) }), view.warnings.map(warning => _jsx("p", { role: "note", children: warning }, warning))] }, `${view.name}-${String(index)}`))) })] }));
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
    const reading = snapshot.path === null
        || snapshot.mode !== 'reading'
        || snapshot.documentKind !== 'markdown'
        ? null
        : projectReading(snapshot.source);
    const previewLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas'
        : snapshot.documentKind === 'base' ? 'Base' : 'Reading';
    const sourceLabel = snapshot.documentKind === 'canvas'
        ? 'Canvas Source'
        : snapshot.documentKind === 'base' ? 'Base Source' : 'Markdown Source';
    const query = snapshot.searchQuery.trim().toLocaleLowerCase();
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
    const previousSidebarOpen = useRef(sidebarOpen);
    const shouldAnimateSidebarColumns = previousSidebarOpen.current !== sidebarOpen;
    const contentColumns = `${String(sidebarOpen ? sidebarWidth : 0)}px minmax(0, 1fr) auto auto`;
    const titlebarColumns = `${String(sidebarOpen ? sidebarWidth : COLLAPSED_TITLEBAR_SIDEBAR_WIDTH)}px minmax(0, 1fr)`;
    useEffect(() => {
        previousSidebarOpen.current = sidebarOpen;
    }, [sidebarOpen]);
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
        setAssistantPanelWidth(Math.min(MAX_ASSISTANT_PANEL_WIDTH, Math.max(MIN_ASSISTANT_PANEL_WIDTH, width)));
    };
    const beginAssistantPanelResize = (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = assistantPanelWidth;
        const move = (next) => { resizeAssistantPanel(startWidth + startX - next.clientX); };
        const finish = () => {
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
        }, children: [_jsxs("div", { className: "tocktutor-titlebar-sidebar flex min-w-0 items-center justify-start gap-2 border-r border-[var(--tt-border)] pr-2 pl-[46px] [&>button]:inline-flex [&>button]:h-7 [&>button]:w-[22px] [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)] [&>span]:inline-flex [&>span]:h-7 [&>span]:w-[22px] [&>span]:items-center [&>span]:justify-center [&>span]:border-0 [&>span]:bg-transparent [&>span]:p-0 [&>span]:text-[var(--tt-muted)]", children: [sidebarOpen && (_jsxs(_Fragment, { children: [_jsx("span", { className: "tocktutor-titlebar-document rounded-[5px] bg-[color-mix(in_srgb,var(--tt-text)_8%,transparent)] text-[var(--tt-text)]", children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsx(Button, { unstyled: true, "aria-label": "Search Notes", disabled: props.onOpenSearch === undefined, onClick: props.onOpenSearch, type: "button", children: _jsx(WorkbenchGlyph, { kind: "search" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "bookmark" }) })] })), _jsx(Button, { unstyled: true, "aria-expanded": sidebarOpen, "aria-label": "Toggle Files Sidebar", className: "tocktutor-panel-icon ml-auto border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setSidebarOpen(open => !open); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel" }) })] }), _jsxs("div", { className: "tocktutor-titlebar-main flex min-w-0 items-center gap-1 px-2", children: [_jsxs("span", { className: "tocktutor-history mr-[18px] flex gap-[5px] px-1.5 text-[color-mix(in_srgb,var(--tt-muted)_45%,transparent)]", children: [_jsx(WorkbenchGlyph, { kind: "back" }), _jsx(WorkbenchGlyph, { kind: "forward" })] }), _jsx("div", { "aria-label": "Note Tabs", className: "tocktutor-tabs -mx-[calc(var(--tt-tab-curve)*2)] -mb-px flex min-w-0 self-stretch items-end gap-1 overflow-visible px-[calc(var(--tt-tab-curve)*2)] [--tt-tab-curve:10px]", role: "tablist", children: focusedPane?.tabs.map((tab, index) => (_jsxs(Button, { unstyled: true, "aria-selected": tab.path === focusedPane.activePath, className: "relative z-1 -mb-px flex h-[30px] min-w-[118px] max-w-[220px] items-center gap-3 rounded-t-[10px] border border-b-0 border-[var(--tt-tab-border)] bg-[var(--tt-panel)] px-2.5 shadow-[inset_0_1px_0_rgb(255_255_255_/_18%)] aria-[selected=false]:mb-0.5 aria-[selected=false]:border-b aria-[selected=false]:bg-[color-mix(in_srgb,var(--tt-panel)_70%,transparent)] aria-[selected=false]:text-[var(--tt-muted)] aria-[selected=false]:shadow-none aria-selected:before:pointer-events-none aria-selected:before:absolute aria-selected:before:bottom-[-1px] aria-selected:before:left-[calc(var(--tt-tab-curve)*-2)] aria-selected:before:h-[calc(var(--tt-tab-curve)*2)] aria-selected:before:w-[calc(var(--tt-tab-curve)*2)] aria-selected:before:rounded-full aria-selected:before:content-[''] aria-selected:before:[clip-path:inset(50%_calc(var(--tt-tab-curve)*-1)_0_50%)] aria-selected:before:[box-shadow:inset_0_0_0_1px_var(--tt-tab-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] aria-selected:after:pointer-events-none aria-selected:after:absolute aria-selected:after:right-[calc(var(--tt-tab-curve)*-2)] aria-selected:after:bottom-[-1px] aria-selected:after:h-[calc(var(--tt-tab-curve)*2)] aria-selected:after:w-[calc(var(--tt-tab-curve)*2)] aria-selected:after:rounded-full aria-selected:after:content-[''] aria-selected:after:[clip-path:inset(50%_50%_0_calc(var(--tt-tab-curve)*-1))] aria-selected:after:[box-shadow:inset_0_0_0_1px_var(--tt-tab-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] [&>span]:truncate [&_svg]:ml-auto [&_svg]:size-3.5", onClick: () => { props.onActivateTab(focusedPane.id, tab.path); }, onKeyDown: event => {
                                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                                    return;
                                event.preventDefault();
                                const offset = event.key === 'ArrowLeft' ? -1 : 1;
                                const next = focusedPane.tabs[(index + offset + focusedPane.tabs.length) % focusedPane.tabs.length];
                                if (next !== undefined)
                                    props.onActivateTab(focusedPane.id, next.path);
                            }, "aria-controls": "tocktutor-note-editor", role: "tab", tabIndex: tab.path === focusedPane.activePath ? 0 : -1, title: tab.path, type: "button", children: [_jsxs("span", { children: [tab.dirty && _jsx("span", { "aria-label": "Unsaved", children: "\u2022" }), fileName(tab.path)] }), tab.path === focusedPane.activePath && _jsx(WorkbenchGlyph, { kind: "close" })] }, tab.path))) }), _jsx(Button, { unstyled: true, "aria-label": "New Note", className: "tocktutor-new-tab border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", disabled: props.onNewNote === undefined, onClick: props.onNewNote, type: "button", children: _jsx(WorkbenchGlyph, { kind: "new" }) }), _jsx("span", { className: "tocktutor-titlebar-spacer flex-1" }), _jsx(Button, { unstyled: true, "aria-expanded": panel === 'assistant', "aria-label": "Toggle Assistant Panel", className: "tocktutor-panel-icon border-0 bg-transparent p-1.5 text-[var(--tt-muted)]", onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "panel-right" }) })] })] }));
    return (_jsxs("main", { "aria-label": "TockTutor Workbench", className: "tocktutor-workbench h-full min-h-0 box-border bg-[var(--tt-bg)] pt-0 text-[var(--tt-text)] [--tt-accent:var(--dsw-alias-accent-primary,#533afd)] [--tt-bg:var(--dsw-alias-bg-base,#fff)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-footer-height:28px] [--tt-muted:var(--dsw-alias-fg-muted,#71717a)] [--tt-panel:var(--dsw-alias-bg-elevated,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-fg-primary,#27272a)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_[hidden]]:!hidden [&_button]:text-inherit [&_button]:[font:inherit] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tt-accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tt-accent)] [&_svg]:block [&_svg]:size-4 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tt-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!delay-0 motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!delay-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!delay-0 motion-reduce:[&_*::before]:!duration-0", "data-phase": snapshot.phase, tabIndex: -1, children: [props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget), snapshot.dispatchDialog !== null && (_jsx(NativeDispatchDialog, { kind: snapshot.dispatchDialog, onCancel: () => { props.onCancelDispatch?.(); }, onSubmit: draft => { props.onSubmitDispatch?.(draft); } })), _jsxs("div", { className: "tocktutor-grid relative grid h-full min-h-0 grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 ease-out", style: {
                    gridTemplateColumns: contentColumns,
                    transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
                }, children: [_jsxs("aside", { "aria-hidden": !sidebarOpen, "aria-label": "Files", className: "tocktutor-sidebar grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden border-r border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] data-[open=false]:invisible data-[open=false]:[transition:visibility_0s_linear_300ms]", "data-open": sidebarOpen, ...(sidebarOpen ? {} : { inert: '' }), children: [_jsxs("header", { className: "tocktutor-sidebar-header flex items-center gap-2.5 border-b border-[var(--tt-border)] px-2.5 [&_svg]:size-3.5", children: [_jsx("h1", { className: "mr-auto my-0 text-sm font-semibold", children: "Files" }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(WorkbenchGlyph, { kind: "more" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(Upload, { "aria-hidden": "true" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(WorkbenchGlyph, { kind: "folder" }) }), _jsx("span", { className: "inline-flex items-center justify-center text-sm text-[var(--tt-muted)]", children: _jsx(PanelTop, { "aria-hidden": "true" }) })] }), _jsxs("div", { className: "tocktutor-sidebar-content min-h-0 overflow-auto px-[5px] py-[3px]", children: [snapshot.searchOpen && (_jsxs("section", { "aria-label": "Search Notes", className: "tocktutor-search mb-2 border-b border-[var(--tt-border)] px-[3px] pb-2", children: [_jsx(Label, { unstyled: true, className: "mb-[5px] block text-xs font-semibold", htmlFor: "tocktutor-search-query", children: "Search Notes" }), _jsxs("div", { className: "flex gap-1", children: [_jsx(Input, { unstyled: true, "aria-label": "Search Notes Query", autoFocus: true, className: "w-full min-w-0 rounded-[5px] border border-[var(--tt-border)] px-[7px] py-[5px] [font:inherit]", id: "tocktutor-search-query", maxLength: 1_000, onChange: event => { props.onSearchChange?.(event.target.value); }, type: "search", value: snapshot.searchQuery }), _jsx(Button, { unstyled: true, "aria-label": "Close Search", className: "w-7 rounded-[5px] border border-[var(--tt-border)] bg-transparent", onClick: () => { props.onCloseSearch?.(); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] }), _jsxs(Alert, { unstyled: true, "aria-live": "polite", className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", role: "status", children: [documents.length, " matching notes."] })] })), _jsxs("nav", { "aria-label": "Vault Notes", children: [snapshot.phase === 'loading' && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "Loading notes\u2026" }), snapshot.phase === 'inactive' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "No Active Vault" }), snapshot.phase === 'error' && _jsx(Alert, { unstyled: true, className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: snapshot.message }), snapshot.phase === 'ready' && documents.length === 0 && _jsx("p", { className: "mx-1 my-[7px] text-xs text-[var(--tt-muted)]", children: "No supported notes found." }), _jsx("ul", { className: "tocktutor-tree m-0 list-none p-0", role: "tree", children: _jsx(TreeEntries, { entries: visibleTreeEntries, onSelect: props.onSelect, path: snapshot.path }) })] })] }), _jsxs(Button, { unstyled: true, "aria-expanded": panel === 'utilities', className: "tocktutor-vault-switcher grid grid-cols-[14px_minmax(0,1fr)_16px] items-center gap-1.5 border-0 border-t border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] px-2.5 text-left [&>span]:truncate [&_svg]:size-[13px]", onClick: () => { setPanel(current => current === 'utilities' ? null : 'utilities'); }, type: "button", children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx("span", { children: snapshot.vault === null ? 'Choose Vault' : 'TockTutor Vault' }), _jsx(WorkbenchGlyph, { kind: "more" })] })] }), _jsx(Button, { unstyled: true, "aria-label": `Resize Files Sidebar, ${String(sidebarWidth)} Pixels`, className: "tocktutor-sidebar-resize absolute top-0 bottom-0 z-5 m-0 w-2 touch-none cursor-ew-resize border-0 bg-transparent p-0 outline-none after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-0.5 after:bg-transparent after:content-[''] focus-visible:after:bg-[var(--tt-accent)]", hidden: !sidebarOpen, onKeyDown: resizeSidebarWithKeyboard, onPointerDown: beginSidebarResize, style: { left: sidebarWidth - 4 }, title: "Drag or Use Left and Right Arrow Keys", type: "button" }), _jsxs("section", { "aria-label": "Note Editor", className: "tocktutor-editor grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden bg-[var(--tt-panel)]", id: "tocktutor-note-editor", role: "tabpanel", children: [_jsxs("header", { className: "tocktutor-editor-header relative flex min-w-0 items-center justify-center border-b border-[var(--tt-border)] px-2.5", children: [_jsx("h2", { className: "m-0 truncate text-[13px] font-medium text-[var(--tt-muted)]", children: noteTitle(snapshot.path) }), _jsxs("div", { className: "tocktutor-editor-actions absolute right-2.5 flex items-center gap-1 [&_button]:inline-flex [&_button]:h-7 [&_button]:w-[26px] [&_button]:items-center [&_button]:justify-center [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[var(--tt-muted)] [&_span]:inline-flex [&_span]:h-7 [&_span]:w-[26px] [&_span]:items-center [&_span]:justify-center [&_span]:border-0 [&_span]:bg-transparent [&_span]:p-0 [&_span]:text-[var(--tt-muted)]", children: [_jsx(Button, { unstyled: true, "aria-label": snapshot.mode === 'source' ? previewLabel : sourceLabel, onClick: () => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "pencil" }) }), _jsx("span", { children: _jsx(Music, { "aria-hidden": "true" }) }), _jsx("span", { children: _jsx(Folder, { "aria-hidden": "true" }) }), _jsx(Button, { unstyled: true, "aria-label": "More Note Actions", "aria-expanded": panel === 'utilities', onClick: () => { setPanel(current => current === 'utilities' ? null : 'utilities'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "more" }) })] })] }), _jsx("div", { className: "tocktutor-editor-body relative min-h-0 overflow-auto", children: snapshot.path === null ? (_jsx(Empty, { unstyled: true, className: "tocktutor-empty absolute top-[45%] left-1/2 w-full max-w-[420px] -translate-1/2 p-8 text-center", children: _jsxs(EmptyHeader, { unstyled: true, children: [_jsx("p", { className: "tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Ready When You Are" }), _jsx(EmptyTitle, { unstyled: true, "aria-level": 2, className: "text-xl font-bold", role: "heading", children: "Select a Note" }), _jsx(EmptyDescription, { unstyled: true, className: "text-[var(--tt-muted)]", children: "Choose a Markdown note from the vault to read or edit its exact source." })] }) })) : snapshot.mode === 'source' ? (_jsx(Textarea, { unstyled: true, "aria-label": sourceLabel, className: "h-full min-h-0 w-full resize-none border-0 bg-[var(--tt-panel)] px-[max(28px,calc((100%-768px)/2))] py-9 text-[var(--tt-text)] outline-none [tab-size:2] [font:14px/1.65_ui-monospace,SFMono-Regular,Consolas,monospace]", onChange: (event) => { props.onEdit(event.target.value); }, spellCheck: "true", value: snapshot.source })) : snapshot.documentKind === 'canvas' ? (_jsx(CanvasView, { onMove: props.onMoveCanvas, source: snapshot.source })) : snapshot.documentKind === 'base' ? (_jsx(BaseView, { source: snapshot.source })) : reading?.status === 'ready' ? (_jsxs("article", { "aria-label": "Reading View", className: "tocktutor-reading mx-auto min-h-full w-[calc(100%-48px)] max-w-3xl pt-[18px] pb-[72px] [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[30px] [&_h1]:leading-tight [&_h1]:font-[650] [&_h1>svg]:mr-1.5 [&_h1>svg]:ml-[-20px] [&_h1>svg]:inline-block [&_h1>svg]:size-3.5 [&_h1>svg]:-translate-y-[3px] [&_h1>svg]:text-[color-mix(in_srgb,var(--tt-muted)_45%,transparent)] [&_h2]:mt-0 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:font-[650] [&_h3]:mt-0 [&_h3]:mb-4 [&_h3]:text-xl [&_h3]:leading-tight [&_h3]:font-[650] [&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3", tabIndex: -1, children: [reading.warnings.map(warning => _jsx("p", { className: "tocktutor-warning border-l-[3px] border-[#b7791f] pl-2.5 text-[var(--tt-muted)]", role: "note", children: warning }, warning)), reading.blocks.map((block, index) => (_jsx(ReadingBlockView, { block: block, onToggleTask: props.onToggleTask }, `${block.kind}-${String(index)}`)))] })) : (_jsx(Alert, { unstyled: true, children: reading?.reason ?? 'Reading view is unavailable.' })) }), _jsxs("footer", { "aria-label": "TockTutor Status Bar", className: "tocktutor-statusbar flex min-w-0 items-center border-t border-[var(--tt-border)] px-2 text-xs text-[var(--tt-muted)]", children: [_jsx("output", { "aria-live": "polite", className: "tocktutor-message absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]", children: snapshot.message }), snapshot.path !== null && (_jsxs("div", { className: "ml-auto flex items-center gap-[18px] whitespace-nowrap max-[760px]:gap-2", children: [_jsx("span", { children: "0 Backlinks" }), _jsx("span", { children: snapshot.mode === 'reading' ? 'Live Preview' : 'Source' }), _jsxs("span", { children: [String(words), " Words"] }), _jsxs("span", { children: [String(characters), " Characters"] }), _jsx(Button, { unstyled: true, "aria-label": "Open Assistant", "aria-expanded": panel === 'assistant', onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", className: "border-0 bg-transparent px-0 py-0.5 text-[var(--tt-muted)] [&_svg]:size-[17px]", children: _jsx(WorkbenchGlyph, { kind: "chat" }) })] }))] })] }), _jsxs("aside", { "aria-hidden": panel !== 'assistant', "aria-label": "Assistant Panel", className: "tocktutor-right-panel tocktutor-right-panel-assistant relative invisible grid min-w-0 w-0 translate-x-6 grid-rows-[minmax(0,1fr)] overflow-hidden border-l-0 bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:translate-x-0 data-[open=true]:overflow-visible data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(360px,calc(100vw-262px))]", "data-open": panel === 'assistant', style: { width: panel === 'assistant' ? `${String(assistantPanelWidth)}px` : '0px' }, ...(panel === 'assistant' ? {} : { inert: '' }), children: [panel === 'assistant' && (_jsx(Button, { unstyled: true, "aria-label": "Resize Assistant Panel", "aria-orientation": "vertical", "aria-valuemax": MAX_ASSISTANT_PANEL_WIDTH, "aria-valuemin": MIN_ASSISTANT_PANEL_WIDTH, "aria-valuenow": assistantPanelWidth, className: "tocktutor-assistant-resize absolute top-0 bottom-0 left-0 z-3 w-4 -translate-x-1/2 touch-none cursor-col-resize border-0 bg-transparent p-0 outline-none before:absolute before:top-1/2 before:left-1/2 before:h-10 before:w-2 before:-translate-1/2 before:rounded-full before:border before:border-[color-mix(in_srgb,var(--tt-text)_32%,var(--tt-border)_68%)] before:bg-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-panel))] before:shadow-[0_4px_12px_-7px_color-mix(in_srgb,var(--tt-text)_42%,transparent),0_0_0_1px_color-mix(in_srgb,var(--tt-panel)_82%,transparent)] before:transition-colors before:duration-140 before:ease-[cubic-bezier(.16,1,.3,1)] before:content-[''] hover:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] active:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] focus-visible:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] hover:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] active:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] focus-visible:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)]", onKeyDown: resizeAssistantPanelWithKeyboard, onPointerDown: beginAssistantPanelResize, role: "separator", title: "Drag or Use Left and Right Arrow Keys", type: "button" })), _jsx("div", { className: "tocktutor-assistant-content min-h-0 min-w-[min(240px,calc(100vw-262px))] overflow-hidden border-l border-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-border)_92%)] transition-colors duration-140 ease-[cubic-bezier(.16,1,.3,1)]", children: props.assistantPanel })] }), _jsxs("aside", { "aria-hidden": panel !== 'utilities', "aria-label": "Workbench Utilities", className: "tocktutor-right-panel invisible grid min-w-0 w-0 translate-x-6 grid-rows-[40px_minmax(0,1fr)] overflow-auto border-l border-[var(--tt-border)] bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:w-[min(360px,calc(100vw-262px))] data-[open=true]:translate-x-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(360px,calc(100vw-262px))]", "data-open": panel === 'utilities', ...(panel === 'utilities' ? {} : { inert: '' }), children: [_jsxs("header", { className: "flex items-center justify-between border-b border-[var(--tt-border)] px-3", children: [_jsx("h2", { className: "m-0 text-sm", children: "More Options" }), _jsx(Button, { unstyled: true, "aria-label": "Close More Options", className: "border-0 bg-transparent p-[5px]", onClick: () => { setPanel(null); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] }), _jsxs("section", { "aria-label": "Pane Groups", className: "tocktutor-pane-groups border-t border-[var(--tt-border)] p-3", children: [_jsxs("div", { className: "tocktutor-pane-heading flex items-center justify-between", children: [_jsx("h2", { className: "m-0 text-sm", children: "Pane Groups" }), _jsx(Button, { unstyled: true, "aria-label": "Add Pane", className: "size-[26px] rounded border border-[var(--tt-border)] bg-transparent", disabled: snapshot.panes.length >= MAX_PANE_GROUPS, onClick: props.onAddPane, type: "button", children: _jsx(WorkbenchGlyph, { kind: "new" }) })] }), _jsx("div", { className: "tocktutor-pane-list mt-2 grid grid-cols-2 gap-1.5", children: snapshot.panes.map((pane, index) => (_jsxs(Button, { unstyled: true, "aria-pressed": pane.id === snapshot.focusedPaneId, className: "overflow-hidden rounded-[5px] border border-[var(--tt-border)] bg-transparent p-1.5 text-left aria-pressed:border-[var(--tt-accent)] [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-[var(--tt-muted)] [&_span]:block [&_span]:truncate", onClick: () => { props.onFocusPane(pane.id); }, title: pane.activePath ?? `Pane ${String(index + 1)}`, type: "button", children: [_jsxs("span", { children: ["Pane ", String(index + 1)] }), _jsx("small", { children: pane.activePath ?? 'Empty' })] }, pane.id))) })] }), _jsxs("section", { "aria-label": "Shared Review Panel", className: "tocktutor-review border-t border-[var(--tt-border)] p-3", children: [_jsx("header", { children: _jsx("h2", { className: "m-0 text-sm", children: "Reviews" }) }), _jsx("div", { className: "tocktutor-review-content min-h-0 overflow-auto text-xs text-[var(--tt-muted)]", children: props.reviewPanel ?? _jsx(Alert, { unstyled: true, role: "status", children: "No review workflow is active." }) })] }), _jsxs("section", { "aria-label": "Native Actions", className: "tocktutor-native-actions border-t border-[var(--tt-border)] p-3", children: [_jsx("header", { children: _jsx("h2", { className: "m-0 text-sm", children: "Native Actions" }) }), _jsx("div", { className: "tocktutor-native-actions-content min-h-0 overflow-auto text-xs text-[var(--tt-muted)]", children: props.nativeActions ?? _jsx(Alert, { unstyled: true, role: "status", children: "No native actions are available." }) })] })] })] })] }));
}
function TockTutorAssistantPanelOutlet(props) {
    return props.renderSlot(TOCKTUTOR_ASSISTANT_PANEL_SLOT, {
        activePath: props.activePath,
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
            const shortcut = resolveEditorShortcut(event, /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? ''));
            if (shortcut !== 'save')
                return;
            event.preventDefault();
            void controller.save();
        };
        node.addEventListener('keydown', onKeyDown);
        return () => { node.removeEventListener('keydown', onKeyDown); };
    }, [controller]);
    return (_jsx("div", { className: "tocktutor-root h-full min-h-0", ref: root, children: _jsx(TockTutorRouteView, { assistantPanel: (_jsx(TockTutorAssistantPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), nativeActions: (_jsx(TockTutorNativeActionsOutlet, { activePath: snapshot.path, handleDispatch: event => controller.handleDispatch(event), renderSlot: props.renderSlot, vault: snapshot.vault })), onActivateTab: (paneId, path) => { void controller.activateTab(paneId, path); }, onAddPane: () => { void controller.addPane(); }, onCancelDispatch: () => { controller.cancelDispatchDialog(); }, onCloseSearch: () => { controller.closeSearch(); }, onEdit: source => { controller.edit(source); }, onFocusPane: paneId => { void controller.focusPane(paneId); }, onMode: mode => { controller.setMode(mode); }, onMoveCanvas: (nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY); }, onNewNote: () => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }); }, onOpenSearch: () => { controller.openSearch(''); }, onSave: () => { void controller.save(); }, onSearchChange: query => { controller.setSearchQuery(query); }, onSelect: path => { void controller.select(path); }, onSubmitDispatch: draft => { void controller.submitDispatchDialog(draft); }, onToggleTask: index => { controller.toggleTask(index); }, reviewPanel: (_jsx(TockTutorReviewPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), snapshot: snapshot, ...(typeof document === 'undefined'
                ? {}
                : { titlebarTarget: document.getElementById('tockteam-window-titlebar-slot') ?? document.body }) }) }));
}
//# sourceMappingURL=route.js.map