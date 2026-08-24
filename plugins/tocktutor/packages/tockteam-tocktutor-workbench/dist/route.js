import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, } from 'react';
import { createPortal } from 'react-dom';
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
        if (request.action === 'choose-vault' || request.paneType === 'window')
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
            const opened = await this.select(request.file);
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
                const opened = await this.select(path);
                if (!this.dispatchCurrent(revision, vault))
                    return 'stale';
                return opened ? 'handled' : 'failed';
            }
            return await this.createDispatchedDocument(path, request.content ?? `---\njournal-date: ${day}\n---\n# ${day}\n`, request.silent === true, revision, vault);
        }
        if (request.action === 'unique') {
            return await this.createDispatchedDocument(`${minuteStamp(this.now())}.md`, request.content ?? '', request.silent === true, revision, vault);
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
        this.dispatchRevision += 1;
        this.settlePendingDispatch('stale');
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
            void this.select(value.path === selected ? selected : value.path, false);
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
    async select(path, navigate = true) {
        if (!supportedDocument(path) || this.snapshot.vault === null || this.snapshot.phase !== 'ready')
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
        const vault = this.snapshot.vault;
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
        this.update({
            message: source === this.snapshot.source ? this.snapshot.message : 'Unsaved changes.',
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
            return _jsx(Tag, { children: block.text });
        }
        case 'paragraph': return _jsx("p", { children: block.text });
        case 'code': return _jsx("pre", { children: _jsx("code", { children: block.text }) });
        case 'task': return (_jsxs("label", { className: "tocktutor-task", children: [_jsx("input", { "aria-label": `Mark ${block.text} as ${block.checked ? 'incomplete' : 'complete'}`, checked: block.checked, onChange: () => { props.onToggleTask(block.index); }, type: "checkbox" }), _jsx("span", { children: block.text })] }));
    }
}
function CanvasView(props) {
    const projection = projectCanvas(parseCanvasDocument(props.source));
    if (projection.status !== 'ready')
        return _jsx("p", { role: "alert", children: projection.reason });
    return (_jsxs("section", { "aria-label": "Canvas View", className: "tocktutor-projection", tabIndex: -1, children: [_jsxs("header", { children: [_jsx("p", { className: "tocktutor-kicker", children: "Canvas" }), _jsxs("h3", { children: [projection.nodes.length, " Nodes \u00B7 ", projection.edges.length, " Edges"] })] }), _jsx("div", { className: "tocktutor-canvas-grid", children: projection.nodes.map(node => {
                    const label = node.text ?? node.file ?? `${node.type} node`;
                    return (_jsxs("article", { className: "tocktutor-canvas-node", children: [_jsx("p", { className: "tocktutor-kicker", children: node.type }), _jsx("h4", { children: label }), _jsxs("p", { children: ["Position ", String(node.x), ", ", String(node.y)] }), !node.supported && _jsx("p", { role: "note", children: "Unsupported node fields remain inert." }), _jsxs("fieldset", { className: "tocktutor-node-actions", children: [_jsxs("legend", { className: "tocktutor-visually-hidden", children: ["Move ", label] }), _jsx("button", { "aria-label": `Move ${label} left`, onClick: () => { props.onMove(node.id, -20, 0); }, type: "button", children: "\u2190" }), _jsx("button", { "aria-label": `Move ${label} up`, onClick: () => { props.onMove(node.id, 0, -20); }, type: "button", children: "\u2191" }), _jsx("button", { "aria-label": `Move ${label} down`, onClick: () => { props.onMove(node.id, 0, 20); }, type: "button", children: "\u2193" }), _jsx("button", { "aria-label": `Move ${label} right`, onClick: () => { props.onMove(node.id, 20, 0); }, type: "button", children: "\u2192" })] })] }, node.id));
                }) })] }));
}
function BaseView(props) {
    const projection = projectBase(props.source);
    if (projection.status !== 'ready')
        return _jsx("p", { role: "alert", children: projection.reason });
    return (_jsxs("section", { "aria-label": "Base View", className: "tocktutor-projection", tabIndex: -1, children: [_jsxs("header", { children: [_jsx("p", { className: "tocktutor-kicker", children: "Base" }), _jsxs("h3", { children: [projection.views.length, " Views"] })] }), _jsx("div", { className: "tocktutor-base-grid", children: projection.views.map((view, index) => (_jsxs("article", { className: "tocktutor-base-view", children: [_jsx("p", { className: "tocktutor-kicker", children: view.type || 'Unknown Type' }), _jsx("h4", { children: view.name }), _jsx("dl", { children: Object.entries(view.fields).map(([field, value]) => (_jsxs("div", { children: [_jsx("dt", { children: field }), _jsx("dd", { children: value || '—' })] }, field))) }), view.warnings.map(warning => _jsx("p", { role: "note", children: warning }, warning))] }, `${view.name}-${String(index)}`))) })] }));
}
function NativeDispatchDialog(props) {
    const dialog = useRef(null);
    useEffect(() => {
        const node = dialog.current;
        if (node === null)
            return;
        node.showModal();
        return () => { if (node.open)
            node.close(); };
    }, []);
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
    return (_jsx("dialog", { "aria-label": label, "aria-modal": "true", className: "tocktutor-dispatch-dialog", onCancel: event => { event.preventDefault(); props.onCancel(); }, ref: dialog, children: _jsxs("form", { onSubmit: submit, children: [_jsx("header", { children: _jsx("h2", { children: label }) }), props.kind === 'new' ? (_jsxs("label", { children: ["Note Path", _jsx("input", { "aria-label": "New Note Path", autoFocus: true, maxLength: 1_000, name: "path", required: true })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { children: ["Title", _jsx("input", { "aria-label": "Capture Title", autoFocus: true, maxLength: 200, name: "title", required: true })] }), _jsxs("label", { children: ["Text", _jsx("textarea", { "aria-label": "Capture Text", maxLength: 100_000, name: "text" })] })] })), _jsxs("div", { className: "tocktutor-dialog-actions", children: [_jsx("button", { onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx("button", { type: "submit", children: "Create" })] })] }) }));
}
function WorkbenchGlyph({ kind }) {
    const paths = {
        back: _jsx("path", { d: "m15 18-6-6 6-6" }),
        bookmark: _jsx("path", { d: "M6 3h12v18l-6-4-6 4Z" }),
        chat: _jsx(_Fragment, { children: _jsx("path", { d: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" }) }),
        close: _jsxs(_Fragment, { children: [_jsx("path", { d: "m8 8 8 8" }), _jsx("path", { d: "m16 8-8 8" })] }),
        collapse: _jsx("path", { d: "m9 18 6-6-6-6" }),
        document: _jsxs(_Fragment, { children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }), _jsx("path", { d: "M14 2v6h6" }), _jsx("path", { d: "M9 13h6" })] }),
        folder: _jsx("path", { d: "M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }),
        forward: _jsx("path", { d: "m9 18 6-6-6-6" }),
        more: _jsxs(_Fragment, { children: [_jsx("circle", { cx: "5", cy: "12", r: "1", fill: "currentColor", stroke: "none" }), _jsx("circle", { cx: "12", cy: "12", r: "1", fill: "currentColor", stroke: "none" }), _jsx("circle", { cx: "19", cy: "12", r: "1", fill: "currentColor", stroke: "none" })] }),
        new: _jsxs(_Fragment, { children: [_jsx("path", { d: "M12 5v14" }), _jsx("path", { d: "M5 12h14" })] }),
        panel: _jsxs(_Fragment, { children: [_jsx("rect", { height: "18", rx: "2", width: "18", x: "3", y: "3" }), _jsx("path", { d: "M15 3v18" })] }),
        pencil: _jsxs(_Fragment, { children: [_jsx("path", { d: "M12 20h9" }), _jsx("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" })] }),
        search: _jsxs(_Fragment, { children: [_jsx("circle", { cx: "11", cy: "11", r: "7" }), _jsx("path", { d: "m20 20-4-4" })] }),
    };
    return (_jsx("svg", { "aria-hidden": "true", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.7", viewBox: "0 0 24 24", children: paths[kind] }));
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
    return children.map(entry => entry.kind === 'directory' ? (_jsxs("li", { className: "tocktutor-tree-directory", role: "treeitem", "aria-expanded": "true", children: [_jsxs("div", { className: "tocktutor-tree-row", title: entry.path, children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx(WorkbenchGlyph, { kind: "folder" }), _jsx("span", { children: fileName(entry.path) }), _jsx(WorkbenchGlyph, { kind: "more" })] }), _jsx("ul", { role: "group", children: _jsx(TreeEntries, { entries: props.entries, onSelect: props.onSelect, path: props.path, prefix: `${entry.path}/` }) })] }, entry.path)) : (_jsx("li", { role: "treeitem", "aria-selected": entry.path === props.path, children: _jsxs("button", { "aria-current": entry.path === props.path ? 'page' : undefined, className: "tocktutor-tree-row", onClick: () => { props.onSelect(entry.path); }, title: entry.path, type: "button", children: [_jsx("span", { className: "tocktutor-tree-indent" }), _jsx(WorkbenchGlyph, { kind: "document" }), _jsx("span", { children: fileName(entry.path) }), _jsx(WorkbenchGlyph, { kind: "more" })] }) }, entry.path)));
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
    const words = snapshot.source.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    const characters = snapshot.source.length;
    const titlebar = (_jsxs("header", { "aria-label": "TockTutor Title Bar", className: "tocktutor-titlebar", children: [_jsxs("div", { className: "tocktutor-titlebar-sidebar", children: [_jsx("span", { className: "tocktutor-titlebar-document", children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "document" }) }), _jsx("button", { "aria-label": "Search Notes", disabled: props.onOpenSearch === undefined, onClick: props.onOpenSearch, type: "button", children: _jsx(WorkbenchGlyph, { kind: "search" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "bookmark" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "panel" }) })] }), _jsxs("div", { className: "tocktutor-titlebar-main", children: [_jsxs("span", { className: "tocktutor-history", children: [_jsx(WorkbenchGlyph, { kind: "back" }), _jsx(WorkbenchGlyph, { kind: "forward" })] }), _jsx("div", { "aria-label": "Note Tabs", className: "tocktutor-tabs", role: "tablist", children: focusedPane?.tabs.map((tab, index) => (_jsxs("button", { "aria-selected": tab.path === focusedPane.activePath, onClick: () => { props.onActivateTab(focusedPane.id, tab.path); }, onKeyDown: event => {
                                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                                    return;
                                event.preventDefault();
                                const offset = event.key === 'ArrowLeft' ? -1 : 1;
                                const next = focusedPane.tabs[(index + offset + focusedPane.tabs.length) % focusedPane.tabs.length];
                                if (next !== undefined)
                                    props.onActivateTab(focusedPane.id, next.path);
                            }, "aria-controls": "tocktutor-note-editor", role: "tab", tabIndex: tab.path === focusedPane.activePath ? 0 : -1, title: tab.path, type: "button", children: [_jsxs("span", { children: [tab.dirty && _jsx("span", { "aria-label": "Unsaved", children: "\u2022" }), fileName(tab.path)] }), tab.path === focusedPane.activePath && _jsx(WorkbenchGlyph, { kind: "close" })] }, tab.path))) }), _jsx("button", { "aria-label": "New Note", className: "tocktutor-new-tab", disabled: props.onNewNote === undefined, onClick: props.onNewNote, type: "button", children: _jsx(WorkbenchGlyph, { kind: "new" }) }), _jsx("span", { className: "tocktutor-titlebar-spacer" }), _jsx("span", { className: "tocktutor-panel-icon", children: _jsx(WorkbenchGlyph, { kind: "panel" }) })] })] }));
    return (_jsxs("main", { "aria-label": "TockTutor Workbench", className: "tocktutor-workbench", "data-phase": snapshot.phase, tabIndex: -1, children: [_jsx("style", { children: ROUTE_CSS }), props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget), snapshot.dispatchDialog !== null && (_jsx(NativeDispatchDialog, { kind: snapshot.dispatchDialog, onCancel: () => { props.onCancelDispatch?.(); }, onSubmit: draft => { props.onSubmitDispatch?.(draft); } })), _jsxs("div", { className: "tocktutor-grid", children: [_jsxs("aside", { "aria-label": "Files", className: "tocktutor-sidebar", children: [_jsxs("header", { className: "tocktutor-sidebar-header", children: [_jsx("h1", { children: "Files" }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "more" }) }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "panel" }) }), _jsx("span", { children: "\u21A5" }), _jsx("span", { children: _jsx(WorkbenchGlyph, { kind: "folder" }) }), _jsx("span", { children: "\u25AD" })] }), _jsxs("div", { className: "tocktutor-sidebar-content", children: [snapshot.searchOpen && (_jsxs("section", { "aria-label": "Search Notes", className: "tocktutor-search", children: [_jsx("label", { htmlFor: "tocktutor-search-query", children: "Search Notes" }), _jsxs("div", { children: [_jsx("input", { "aria-label": "Search Notes Query", autoFocus: true, id: "tocktutor-search-query", maxLength: 1_000, onChange: event => { props.onSearchChange?.(event.target.value); }, type: "search", value: snapshot.searchQuery }), _jsx("button", { "aria-label": "Close Search", onClick: () => { props.onCloseSearch?.(); }, type: "button", children: "\u00D7" })] }), _jsxs("p", { "aria-live": "polite", role: "status", children: [documents.length, " matching notes."] })] })), _jsxs("nav", { "aria-label": "Vault Notes", children: [snapshot.phase === 'loading' && _jsx("p", { children: "Loading notes\u2026" }), snapshot.phase === 'inactive' && _jsx("p", { role: "alert", children: "No Active Vault" }), snapshot.phase === 'error' && _jsx("p", { role: "alert", children: snapshot.message }), snapshot.phase === 'ready' && documents.length === 0 && _jsx("p", { children: "No supported notes found." }), _jsx("ul", { className: "tocktutor-tree", role: "tree", children: _jsx(TreeEntries, { entries: visibleTreeEntries, onSelect: props.onSelect, path: snapshot.path }) })] })] }), _jsxs("button", { "aria-expanded": panel === 'utilities', className: "tocktutor-vault-switcher", onClick: () => { setPanel(current => current === 'utilities' ? null : 'utilities'); }, type: "button", children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx("span", { children: snapshot.vault === null ? 'Choose Vault' : 'TockTutor Vault' }), _jsx(WorkbenchGlyph, { kind: "more" })] })] }), _jsxs("section", { "aria-label": "Note Editor", className: "tocktutor-editor", id: "tocktutor-note-editor", role: "tabpanel", children: [_jsxs("header", { className: "tocktutor-editor-header", children: [_jsx("h2", { children: noteTitle(snapshot.path) }), _jsxs("div", { className: "tocktutor-editor-actions", children: [_jsx("button", { "aria-label": snapshot.mode === 'source' ? previewLabel : sourceLabel, onClick: () => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "pencil" }) }), _jsx("span", { "aria-hidden": "true", children: "\u2669" }), _jsx("span", { "aria-hidden": "true", children: "\u25B1" }), _jsx("button", { "aria-label": "More Note Actions", "aria-expanded": panel === 'utilities', onClick: () => { setPanel(current => current === 'utilities' ? null : 'utilities'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "more" }) })] })] }), _jsx("div", { className: "tocktutor-editor-body", children: snapshot.path === null ? (_jsxs("div", { className: "tocktutor-empty", children: [_jsx("p", { className: "tocktutor-kicker", children: "Ready When You Are" }), _jsx("h2", { children: "Select a Note" }), _jsx("p", { children: "Choose a Markdown note from the vault to read or edit its exact source." })] })) : snapshot.mode === 'source' ? (_jsx("textarea", { "aria-label": sourceLabel, onChange: (event) => { props.onEdit(event.target.value); }, spellCheck: "true", value: snapshot.source })) : snapshot.documentKind === 'canvas' ? (_jsx(CanvasView, { onMove: props.onMoveCanvas, source: snapshot.source })) : snapshot.documentKind === 'base' ? (_jsx(BaseView, { source: snapshot.source })) : reading?.status === 'ready' ? (_jsxs("article", { "aria-label": "Reading View", className: "tocktutor-reading", tabIndex: -1, children: [reading.warnings.map(warning => _jsx("p", { className: "tocktutor-warning", role: "note", children: warning }, warning)), reading.blocks.map((block, index) => (_jsx(ReadingBlockView, { block: block, onToggleTask: props.onToggleTask }, `${block.kind}-${String(index)}`)))] })) : (_jsx("p", { role: "alert", children: reading?.reason ?? 'Reading view is unavailable.' })) }), _jsxs("footer", { "aria-label": "TockTutor Status Bar", className: "tocktutor-statusbar", children: [_jsx("output", { "aria-live": "polite", className: "tocktutor-message", children: snapshot.message }), snapshot.path !== null && (_jsxs("div", { children: [_jsx("span", { children: "0 Backlinks" }), _jsx("span", { children: snapshot.mode === 'reading' ? 'Live Preview' : 'Source' }), _jsxs("span", { children: [String(words), " Words"] }), _jsxs("span", { children: [String(characters), " Characters"] }), _jsx("button", { "aria-label": "Open Assistant", "aria-expanded": panel === 'assistant', onClick: () => { setPanel(current => current === 'assistant' ? null : 'assistant'); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "chat" }) })] }))] })] }), _jsxs("aside", { "aria-label": "Assistant Panel", className: "tocktutor-right-panel", hidden: panel !== 'assistant', children: [_jsxs("header", { children: [_jsx("h2", { children: "Assistant" }), _jsx("button", { "aria-label": "Close Assistant", onClick: () => { setPanel(null); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] }), _jsx("div", { className: "tocktutor-assistant-content", children: props.assistantPanel })] }), _jsxs("aside", { "aria-label": "Workbench Utilities", className: "tocktutor-right-panel", hidden: panel !== 'utilities', children: [_jsxs("header", { children: [_jsx("h2", { children: "More Options" }), _jsx("button", { "aria-label": "Close More Options", onClick: () => { setPanel(null); }, type: "button", children: _jsx(WorkbenchGlyph, { kind: "close" }) })] }), _jsxs("section", { "aria-label": "Pane Groups", className: "tocktutor-pane-groups", children: [_jsxs("div", { className: "tocktutor-pane-heading", children: [_jsx("h2", { children: "Pane Groups" }), _jsx("button", { "aria-label": "Add Pane", disabled: snapshot.panes.length >= MAX_PANE_GROUPS, onClick: props.onAddPane, type: "button", children: "+" })] }), _jsx("div", { className: "tocktutor-pane-list", children: snapshot.panes.map((pane, index) => (_jsxs("button", { "aria-pressed": pane.id === snapshot.focusedPaneId, onClick: () => { props.onFocusPane(pane.id); }, title: pane.activePath ?? `Pane ${String(index + 1)}`, type: "button", children: [_jsxs("span", { children: ["Pane ", String(index + 1)] }), _jsx("small", { children: pane.activePath ?? 'Empty' })] }, pane.id))) })] }), _jsxs("section", { "aria-label": "Shared Review Panel", className: "tocktutor-review", children: [_jsx("header", { children: _jsx("h2", { children: "Reviews" }) }), _jsx("div", { className: "tocktutor-review-content", children: props.reviewPanel ?? _jsx("p", { role: "status", children: "No review workflow is active." }) })] }), _jsxs("section", { "aria-label": "Native Actions", className: "tocktutor-native-actions", children: [_jsx("header", { children: _jsx("h2", { children: "Native Actions" }) }), _jsx("div", { className: "tocktutor-native-actions-content", children: props.nativeActions ?? _jsx("p", { role: "status", children: "No native actions are available." }) })] })] })] })] }));
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
        fallback: _jsx("p", { role: "status", children: "No review workflow is active." }),
    });
}
function TockTutorNativeActionsOutlet(props) {
    return props.renderSlot(TOCKTUTOR_NATIVE_ACTIONS_SLOT, {
        activePath: props.activePath,
        handleDispatch: props.handleDispatch,
        vault: props.vault,
    }, {
        fallback: _jsx("p", { role: "status", children: "No native actions are available." }),
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
    return (_jsx("div", { className: "tocktutor-root", ref: root, children: _jsx(TockTutorRouteView, { assistantPanel: (_jsx(TockTutorAssistantPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), nativeActions: (_jsx(TockTutorNativeActionsOutlet, { activePath: snapshot.path, handleDispatch: event => controller.handleDispatch(event), renderSlot: props.renderSlot, vault: snapshot.vault })), onActivateTab: (paneId, path) => { void controller.activateTab(paneId, path); }, onAddPane: () => { void controller.addPane(); }, onCancelDispatch: () => { controller.cancelDispatchDialog(); }, onCloseSearch: () => { controller.closeSearch(); }, onEdit: source => { controller.edit(source); }, onFocusPane: paneId => { void controller.focusPane(paneId); }, onMode: mode => { controller.setMode(mode); }, onMoveCanvas: (nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY); }, onNewNote: () => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }); }, onOpenSearch: () => { controller.openSearch(''); }, onSave: () => { void controller.save(); }, onSearchChange: query => { controller.setSearchQuery(query); }, onSelect: path => { void controller.select(path); }, onSubmitDispatch: draft => { void controller.submitDispatchDialog(draft); }, onToggleTask: index => { controller.toggleTask(index); }, reviewPanel: (_jsx(TockTutorReviewPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), snapshot: snapshot, ...(typeof document === 'undefined' ? {} : { titlebarTarget: document.body }) }) }));
}
const ROUTE_CSS = `
.tocktutor-root { height: 100%; min-height: 0; }
.tocktutor-workbench {
  --tt-accent: var(--dsw-alias-accent-primary, #533afd);
  --tt-bg: var(--dsw-alias-bg-base, #fff);
  --tt-border: var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, #e1e3e7));
  --tt-muted: var(--dsw-alias-fg-muted, #71717a);
  --tt-panel: var(--dsw-alias-bg-elevated, #fff);
  --tt-selected: color-mix(in srgb, var(--tt-accent) 14%, var(--tt-panel));
  --tt-text: var(--dsw-alias-fg-primary, #27272a);
  background: var(--tt-bg);
  box-sizing: border-box;
  color: var(--tt-text);
  font: 14px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  height: 100%;
  min-height: 0;
  padding-top: var(--tockteam-titlebar-height, 40px);
}
.tocktutor-workbench *, .tocktutor-workbench *::before, .tocktutor-workbench *::after { box-sizing: border-box; }
.tocktutor-workbench svg { display: block; height: 16px; width: 16px; }
.tocktutor-workbench button { color: inherit; font: inherit; }
.tocktutor-workbench [hidden] { display: none !important; }
.tocktutor-titlebar {
  --tt-accent: var(--dsw-alias-accent-primary, #533afd);
  --tt-border: var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, #e1e3e7));
  --tt-muted: var(--dsw-alias-fg-muted, #71717a);
  --tt-panel: var(--dsw-alias-bg-elevated, #fff);
  --tt-tab-border: #d1d5db;
  --tt-text: var(--dsw-alias-fg-primary, #27272a);
  -webkit-app-region: drag;
  background: var(--tt-panel);
  box-sizing: border-box;
  color: var(--tt-text);
  font: 14px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border-bottom: 1px solid var(--tt-tab-border);
  display: grid;
  grid-template-columns: 225px minmax(0, 1fr);
  height: var(--tockteam-titlebar-height, 40px);
  left: var(--tockteam-rail-width, 40px);
  position: fixed;
  right: 0;
  top: var(--tockteam-titlebar-height, 40px);
  z-index: 2147483647;
}
.tocktutor-titlebar *, .tocktutor-titlebar *::before, .tocktutor-titlebar *::after { box-sizing: border-box; }
.tocktutor-titlebar svg { display: block; height: 16px; width: 16px; }
.tocktutor-titlebar button { -webkit-app-region: no-drag; color: inherit; font: inherit; }
.tocktutor-titlebar-sidebar, .tocktutor-titlebar-main { align-items: center; display: flex; min-width: 0; }
.tocktutor-titlebar-sidebar { border-right: 1px solid var(--tt-border); gap: 8px; justify-content: flex-start; padding: 0 8px 0 46px; }
.tocktutor-titlebar-sidebar > span, .tocktutor-titlebar-sidebar > button { align-items: center; background: transparent; border: 0; color: var(--tt-muted); display: inline-flex; height: 28px; justify-content: center; padding: 0; width: 22px; }
.tocktutor-titlebar-sidebar .tocktutor-titlebar-document { background: color-mix(in srgb, var(--tt-text) 8%, transparent); border-radius: 5px; color: var(--tt-text); }
.tocktutor-titlebar-main { gap: 4px; padding: 0 8px; }
.tocktutor-history { color: color-mix(in srgb, var(--tt-muted) 45%, transparent); display: flex; gap: 5px; margin-right: 18px; padding: 0 6px; }
.tocktutor-tabs { --tt-tab-curve: 10px; align-items: flex-end; align-self: stretch; display: flex; gap: 4px; margin-bottom: -1px; margin-inline: calc(var(--tt-tab-curve) * -2); min-width: 0; overflow: visible; padding-inline: calc(var(--tt-tab-curve) * 2); }
.tocktutor-tabs button { align-items: center; background: var(--tt-panel); border: 1px solid var(--tt-tab-border); border-bottom: 0; border-radius: 10px 10px 0 0; box-shadow: inset 0 1px 0 rgb(255 255 255 / 18%); display: flex; gap: 12px; height: 30px; margin-bottom: -1px; max-width: 220px; min-width: 118px; padding: 0 10px; position: relative; z-index: 1; }
.tocktutor-tabs button[aria-selected="false"] { background: color-mix(in srgb, var(--tt-panel) 70%, transparent); border-bottom: 1px solid var(--tt-tab-border); box-shadow: none; color: var(--tt-muted); margin-bottom: 2px; }
.tocktutor-tabs button[aria-selected="true"]::before, .tocktutor-tabs button[aria-selected="true"]::after { border-radius: 9999px; bottom: -1px; box-shadow: inset 0 0 0 1px var(--tt-tab-border), 0 0 0 calc(var(--tt-tab-curve) * 4) var(--tt-panel); content: ''; height: calc(var(--tt-tab-curve) * 2); pointer-events: none; position: absolute; width: calc(var(--tt-tab-curve) * 2); }
.tocktutor-tabs button[aria-selected="true"]::before { clip-path: inset(50% calc(var(--tt-tab-curve) * -1) 0 50%); left: calc(var(--tt-tab-curve) * -2); }
.tocktutor-tabs button[aria-selected="true"]::after { clip-path: inset(50% 50% 0 calc(var(--tt-tab-curve) * -1)); right: calc(var(--tt-tab-curve) * -2); }
.tocktutor-tabs button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-tabs button svg { height: 14px; margin-left: auto; width: 14px; }
.tocktutor-new-tab, .tocktutor-panel-icon { background: transparent; border: 0; color: var(--tt-muted); padding: 6px; }
.tocktutor-titlebar-spacer { flex: 1; }
.tocktutor-grid { display: grid; grid-template-columns: 225px minmax(0, 1fr); height: 100%; min-height: 0; position: relative; }
.tocktutor-sidebar { background: var(--tt-panel); border-right: 1px solid var(--tt-border); display: grid; grid-template-rows: 40px minmax(0, 1fr) 32px; min-height: 0; overflow: hidden; }
.tocktutor-sidebar-header { align-items: center; border-bottom: 1px solid var(--tt-border); display: flex; gap: 10px; padding: 0 10px; }
.tocktutor-sidebar-header h1 { font-size: 14px; font-weight: 600; margin: 0 auto 0 0; }
.tocktutor-sidebar-header span { align-items: center; color: var(--tt-muted); display: inline-flex; font-size: 14px; justify-content: center; }
.tocktutor-sidebar-header svg { height: 14px; width: 14px; }
.tocktutor-sidebar-content { min-height: 0; overflow: auto; padding: 3px 5px; }
.tocktutor-search { border-bottom: 1px solid var(--tt-border); margin: 0 0 8px; padding: 0 3px 8px; }
.tocktutor-search > label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; }
.tocktutor-search > div { display: flex; gap: 4px; }
.tocktutor-search input { border: 1px solid var(--tt-border); border-radius: 5px; font: inherit; min-width: 0; padding: 5px 7px; width: 100%; }
.tocktutor-search button { background: transparent; border: 1px solid var(--tt-border); border-radius: 5px; width: 28px; }
.tocktutor-search p, .tocktutor-sidebar nav > p { color: var(--tt-muted); font-size: 12px; margin: 7px 4px; }
.tocktutor-tree, .tocktutor-tree ul { list-style: none; margin: 0; padding: 0; }
.tocktutor-tree ul { padding-left: 16px; }
.tocktutor-tree-row { align-items: center; background: transparent; border: 0; border-radius: 4px; color: inherit; display: grid; font-weight: 500; gap: 7px; grid-template-columns: 12px 16px minmax(0, 1fr) 16px; min-height: 32px; overflow: hidden; padding: 4px 5px; text-align: left; width: 100%; }
.tocktutor-tree-row > span:not(.tocktutor-tree-indent) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-tree-row > svg:first-child { height: 12px; width: 12px; }
.tocktutor-tree-row > svg:last-child { color: var(--tt-muted); height: 14px; margin-left: auto; opacity: .8; width: 14px; }
.tocktutor-tree-row:hover { background: color-mix(in srgb, var(--tt-text) 5%, transparent); }
.tocktutor-tree-row[aria-current="page"] { background: var(--tt-selected); }
.tocktutor-tree-row[aria-current="page"] > svg:last-child { color: var(--tt-text); }
.tocktutor-tree-indent { width: 12px; }
.tocktutor-vault-switcher { align-items: center; background: var(--tt-panel); border: 0; border-top: 1px solid var(--tt-border); display: grid; gap: 6px; grid-template-columns: 14px minmax(0, 1fr) 16px; padding: 0 10px; text-align: left; }
.tocktutor-vault-switcher > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-vault-switcher svg { height: 13px; width: 13px; }
.tocktutor-editor { background: var(--tt-panel); display: grid; grid-template-rows: 40px minmax(0, 1fr) 28px; min-height: 0; overflow: hidden; }
.tocktutor-editor-header { align-items: center; border-bottom: 1px solid var(--tt-border); display: flex; justify-content: center; min-width: 0; padding: 0 10px; position: relative; }
.tocktutor-editor-header h2 { color: var(--tt-muted); font-size: 13px; font-weight: 500; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-editor-actions { align-items: center; display: flex; gap: 4px; position: absolute; right: 10px; }
.tocktutor-editor-actions button, .tocktutor-editor-actions span { align-items: center; background: transparent; border: 0; color: var(--tt-muted); display: inline-flex; height: 28px; justify-content: center; padding: 0; width: 26px; }
.tocktutor-editor-body { min-height: 0; overflow: auto; position: relative; }
.tocktutor-editor textarea { background: var(--tt-panel); border: 0; color: var(--tt-text); font: 14px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; height: 100%; min-height: 0; outline: none; padding: 36px max(28px, calc((100% - 768px) / 2)); resize: none; tab-size: 2; width: 100%; }
.tocktutor-reading { margin: 0 auto; max-width: 768px; min-height: 100%; padding: 18px 0 72px; width: calc(100% - 48px); }
.tocktutor-reading h1, .tocktutor-reading h2, .tocktutor-reading h3 { font-weight: 650; line-height: 1.25; margin: 0 0 16px; }
.tocktutor-reading h1 { font-size: 30px; }
.tocktutor-reading h1::before { color: color-mix(in srgb, var(--tt-muted) 45%, transparent); content: '⌄'; display: inline-block; font-size: 12px; margin-left: -18px; margin-right: 6px; transform: translateY(-4px); }
.tocktutor-reading h2 { font-size: 24px; }
.tocktutor-reading h3 { font-size: 20px; }
.tocktutor-reading p { font-size: 18px; margin: 0 0 16px; }
.tocktutor-reading pre { background: color-mix(in srgb, var(--tt-text) 4%, var(--tt-panel)); border: 1px solid var(--tt-border); border-radius: 6px; overflow: auto; padding: 12px; }
.tocktutor-statusbar { align-items: center; border-top: 1px solid var(--tt-border); color: var(--tt-muted); display: flex; font-size: 12px; min-width: 0; padding: 0 8px; }
.tocktutor-statusbar > div { align-items: center; display: flex; gap: 18px; margin-left: auto; white-space: nowrap; }
.tocktutor-statusbar button { background: transparent; border: 0; color: var(--tt-muted); padding: 2px 0; }
.tocktutor-statusbar button svg { height: 17px; width: 17px; }
.tocktutor-message, .tocktutor-visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
.tocktutor-kicker { color: var(--tt-muted); font-size: 11px; font-weight: 650; letter-spacing: .08em; margin: 0 0 2px; text-transform: uppercase; }
.tocktutor-empty { left: 50%; max-width: 420px; padding: 32px; position: absolute; text-align: center; top: 45%; transform: translate(-50%, -50%); width: 100%; }
.tocktutor-empty h2 { font-size: 20px; margin: 0; }
.tocktutor-empty > p:last-child { color: var(--tt-muted); }
.tocktutor-right-panel { background: var(--tt-panel); border-left: 1px solid var(--tt-border); bottom: 0; box-shadow: -8px 0 24px rgb(0 0 0 / 6%); display: grid; grid-template-rows: 40px minmax(0, 1fr); overflow: auto; position: fixed; right: 0; top: 36px; width: min(360px, calc(100vw - 262px)); z-index: 20; }
.tocktutor-right-panel > header { align-items: center; border-bottom: 1px solid var(--tt-border); display: flex; justify-content: space-between; padding: 0 12px; }
.tocktutor-right-panel > header h2, .tocktutor-review h2, .tocktutor-native-actions h2, .tocktutor-pane-groups h2 { font-size: 14px; margin: 0; }
.tocktutor-right-panel > header button { background: transparent; border: 0; padding: 5px; }
.tocktutor-assistant-content, .tocktutor-review-content, .tocktutor-native-actions-content { min-height: 0; overflow: auto; }
.tocktutor-pane-groups, .tocktutor-review, .tocktutor-native-actions { border-top: 1px solid var(--tt-border); padding: 12px; }
.tocktutor-pane-heading { align-items: center; display: flex; justify-content: space-between; }
.tocktutor-pane-heading button { background: transparent; border: 1px solid var(--tt-border); border-radius: 4px; height: 26px; width: 26px; }
.tocktutor-pane-list { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 8px; }
.tocktutor-pane-list button { background: transparent; border: 1px solid var(--tt-border); border-radius: 5px; overflow: hidden; padding: 6px; text-align: left; }
.tocktutor-pane-list button[aria-pressed="true"] { border-color: var(--tt-accent); }
.tocktutor-pane-list span, .tocktutor-pane-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-pane-list small, .tocktutor-review-content, .tocktutor-native-actions-content { color: var(--tt-muted); font-size: 12px; }
.tocktutor-projection { min-height: 0; overflow: auto; padding: 24px; }
.tocktutor-projection > header h3 { font-size: 17px; margin: 0 0 18px; }
.tocktutor-canvas-grid, .tocktutor-base-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.tocktutor-canvas-node, .tocktutor-base-view { background: var(--tt-bg); border: 1px solid var(--tt-border); border-radius: 8px; min-width: 0; padding: 14px; }
.tocktutor-canvas-node h4, .tocktutor-base-view h4 { font-size: 14px; margin: 0 0 8px; overflow-wrap: anywhere; }
.tocktutor-canvas-node > p:not(.tocktutor-kicker), .tocktutor-base-view > p:not(.tocktutor-kicker) { color: var(--tt-muted); font-size: 12px; }
.tocktutor-node-actions { border: 0; display: flex; gap: 4px; margin: 10px 0 0; padding: 0; }
.tocktutor-node-actions button, .tocktutor-dialog-actions button { background: var(--tt-panel); border: 1px solid var(--tt-border); border-radius: 5px; color: inherit; cursor: pointer; padding: 7px 10px; }
.tocktutor-base-view dl { margin: 0; }
.tocktutor-base-view dl > div { border-top: 1px solid var(--tt-border); display: grid; gap: 8px; grid-template-columns: minmax(72px, .35fr) minmax(0, 1fr); padding: 7px 0; }
.tocktutor-base-view dt { color: var(--tt-muted); }
.tocktutor-base-view dd { margin: 0; overflow-wrap: anywhere; }
.tocktutor-task { align-items: flex-start; display: flex; gap: 8px; margin: 8px 0; }
.tocktutor-warning { border-left: 3px solid #b7791f; color: var(--tt-muted); padding-left: 10px; }
.tocktutor-dispatch-dialog { align-items: center; background: transparent; border: 0; height: 100%; inset: 0; justify-content: center; max-height: none; max-width: none; padding: 24px; position: fixed; width: 100%; }
.tocktutor-dispatch-dialog::backdrop { background: rgb(0 0 0 / 35%); }
.tocktutor-dispatch-dialog[open] { display: flex; }
.tocktutor-dispatch-dialog form { background: var(--tt-panel); border: 1px solid var(--tt-border); border-radius: 8px; display: grid; gap: 14px; max-width: 480px; padding: 20px; width: 100%; }
.tocktutor-dispatch-dialog h2 { font-size: 17px; margin: 0; }
.tocktutor-dispatch-dialog label { display: grid; font-weight: 650; gap: 5px; }
.tocktutor-dispatch-dialog input, .tocktutor-dispatch-dialog textarea { border: 1px solid var(--tt-border); border-radius: 5px; font: inherit; padding: 8px; }
.tocktutor-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
.tocktutor-workbench button:focus-visible, .tocktutor-workbench input:focus-visible, .tocktutor-workbench textarea:focus-visible { outline: 2px solid var(--tt-accent); outline-offset: 2px; }
@media (max-width: 760px) {
  .tocktutor-titlebar { grid-template-columns: 190px minmax(0, 1fr); }
  .tocktutor-grid { grid-template-columns: 190px minmax(0, 1fr); }
  .tocktutor-statusbar > div { gap: 8px; }
  .tocktutor-launcher { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .tocktutor-workbench *, .tocktutor-workbench *::before, .tocktutor-workbench *::after { scroll-behavior: auto !important; transition-duration: 0s !important; }
}
`;
//# sourceMappingURL=route.js.map