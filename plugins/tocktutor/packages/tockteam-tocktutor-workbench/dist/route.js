import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useSyncExternalStore, } from 'react';
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
    return (_jsx("dialog", { "aria-label": label, className: "tocktutor-dispatch-dialog", onCancel: event => { event.preventDefault(); props.onCancel(); }, open: true, children: _jsxs("form", { onSubmit: submit, children: [_jsx("header", { children: _jsx("h2", { children: label }) }), props.kind === 'new' ? (_jsxs("label", { children: ["Note Path", _jsx("input", { "aria-label": "New Note Path", autoFocus: true, maxLength: 1_000, name: "path", required: true })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { children: ["Title", _jsx("input", { "aria-label": "Capture Title", autoFocus: true, maxLength: 200, name: "title", required: true })] }), _jsxs("label", { children: ["Text", _jsx("textarea", { "aria-label": "Capture Text", maxLength: 100_000, name: "text" })] })] })), _jsxs("div", { className: "tocktutor-dialog-actions", children: [_jsx("button", { onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx("button", { type: "submit", children: "Create" })] })] }) }));
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
    return (_jsxs("main", { "aria-label": "TockTutor Workbench", className: "tocktutor-workbench", "data-phase": snapshot.phase, tabIndex: -1, children: [_jsx("style", { children: ROUTE_CSS }), _jsxs("header", { className: "tocktutor-header", children: [_jsxs("div", { children: [_jsx("p", { className: "tocktutor-kicker", children: "Local Notes" }), _jsx("h1", { children: "TockTutor" })] }), _jsx("output", { "aria-live": "polite", className: "tocktutor-status", children: snapshot.path === null ? snapshot.message : editorStatusLabel(snapshot.saveStatus) })] }), snapshot.dispatchDialog !== null && (_jsx(NativeDispatchDialog, { kind: snapshot.dispatchDialog, onCancel: () => { props.onCancelDispatch?.(); }, onSubmit: draft => { props.onSubmitDispatch?.(draft); } })), _jsxs("div", { className: "tocktutor-grid", children: [_jsxs("aside", { className: "tocktutor-sidebar", children: [snapshot.searchOpen && (_jsxs("section", { "aria-label": "Search Notes", className: "tocktutor-search", children: [_jsx("label", { htmlFor: "tocktutor-search-query", children: "Search Notes" }), _jsxs("div", { children: [_jsx("input", { "aria-label": "Search Notes Query", autoFocus: true, id: "tocktutor-search-query", maxLength: 1_000, onChange: event => { props.onSearchChange?.(event.target.value); }, type: "search", value: snapshot.searchQuery }), _jsx("button", { "aria-label": "Close Search", onClick: () => { props.onCloseSearch?.(); }, type: "button", children: "\u00D7" })] }), _jsxs("p", { "aria-live": "polite", role: "status", children: [documents.length, " matching notes."] })] })), _jsxs("nav", { "aria-label": "Vault Notes", children: [_jsx("h2", { children: "Vault Notes" }), snapshot.phase === 'loading' && _jsx("p", { children: "Loading notes\u2026" }), snapshot.phase === 'inactive' && _jsx("p", { role: "alert", children: "No Active Vault" }), snapshot.phase === 'error' && _jsx("p", { role: "alert", children: snapshot.message }), snapshot.phase === 'ready' && documents.length === 0 && _jsx("p", { children: "No supported notes found." }), _jsx("ul", { children: documents.map(entry => (_jsx("li", { children: _jsx("button", { "aria-current": entry.path === snapshot.path ? 'page' : undefined, onClick: () => { props.onSelect(entry.path); }, title: entry.path, type: "button", children: entry.path }) }, entry.path))) })] }), _jsxs("section", { "aria-label": "Pane Groups", className: "tocktutor-pane-groups", children: [_jsxs("div", { className: "tocktutor-pane-heading", children: [_jsx("h2", { children: "Pane Groups" }), _jsx("button", { "aria-label": "Add Pane", disabled: snapshot.panes.length >= MAX_PANE_GROUPS, onClick: props.onAddPane, type: "button", children: "+" })] }), _jsx("div", { className: "tocktutor-pane-list", children: snapshot.panes.map((pane, index) => (_jsxs("button", { "aria-pressed": pane.id === snapshot.focusedPaneId, onClick: () => { props.onFocusPane(pane.id); }, title: pane.activePath ?? `Pane ${String(index + 1)}`, type: "button", children: [_jsxs("span", { children: ["Pane ", String(index + 1)] }), _jsx("small", { children: pane.activePath ?? 'Empty' })] }, pane.id))) }), focusedPane !== undefined && focusedPane.tabs.length > 0 && (_jsx("div", { "aria-label": "Note Tabs", className: "tocktutor-tab-list", role: "tablist", children: focusedPane.tabs.map((tab, index) => (_jsxs("button", { "aria-selected": tab.path === focusedPane.activePath, onClick: () => { props.onActivateTab(focusedPane.id, tab.path); }, onKeyDown: event => {
                                                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                                                    return;
                                                event.preventDefault();
                                                const offset = event.key === 'ArrowLeft' ? -1 : 1;
                                                const next = focusedPane.tabs[(index + offset + focusedPane.tabs.length) % focusedPane.tabs.length];
                                                if (next !== undefined)
                                                    props.onActivateTab(focusedPane.id, next.path);
                                            }, role: "tab", tabIndex: tab.path === focusedPane.activePath ? 0 : -1, title: tab.path, type: "button", children: [tab.dirty && _jsx("span", { "aria-label": "Unsaved", children: "\u2022" }), tab.path] }, tab.path))) }))] })] }), _jsx("section", { "aria-label": "Note Editor", className: "tocktutor-editor", children: snapshot.path === null ? (_jsxs("div", { className: "tocktutor-empty", children: [_jsx("p", { className: "tocktutor-kicker", children: "Ready When You Are" }), _jsx("h2", { children: "Select a Note" }), _jsx("p", { children: "Choose a Markdown note from the vault to read or edit its exact source." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "tocktutor-toolbar", children: [_jsxs("div", { className: "tocktutor-title", children: [_jsx("p", { className: "tocktutor-kicker", children: "Active Note" }), _jsx("h2", { children: snapshot.path })] }), _jsxs("fieldset", { className: "tocktutor-segment", children: [_jsx("legend", { className: "tocktutor-visually-hidden", children: "Editor Mode" }), _jsx("button", { "aria-pressed": snapshot.mode === 'source', onClick: () => { props.onMode('source'); }, type: "button", children: "Source" }), _jsx("button", { "aria-pressed": snapshot.mode === 'reading', onClick: () => { props.onMode('reading'); }, type: "button", children: previewLabel })] }), _jsx("button", { className: "tocktutor-save", disabled: snapshot.saveStatus === 'saved' || snapshot.saveStatus === 'saving', onClick: props.onSave, type: "button", children: snapshot.saveStatus === 'saving' ? 'Saving…' : 'Save' })] }), snapshot.mode === 'source' ? (_jsx("textarea", { "aria-label": sourceLabel, onChange: (event) => { props.onEdit(event.target.value); }, spellCheck: "true", value: snapshot.source })) : snapshot.documentKind === 'canvas' ? (_jsx(CanvasView, { onMove: props.onMoveCanvas, source: snapshot.source })) : snapshot.documentKind === 'base' ? (_jsx(BaseView, { source: snapshot.source })) : reading?.status === 'ready' ? (_jsxs("article", { "aria-label": "Reading View", className: "tocktutor-reading", tabIndex: -1, children: [reading.warnings.map(warning => _jsx("p", { className: "tocktutor-warning", role: "note", children: warning }, warning)), reading.blocks.map((block, index) => (_jsx(ReadingBlockView, { block: block, onToggleTask: props.onToggleTask }, `${block.kind}-${String(index)}`)))] })) : (_jsx("p", { role: "alert", children: reading?.reason ?? 'Reading view is unavailable.' })), _jsx("p", { "aria-live": "polite", className: "tocktutor-message", role: "status", children: snapshot.message })] })) }), _jsxs("div", { className: "tocktutor-right-rail", children: [_jsxs("aside", { "aria-label": "Assistant Panel", className: "tocktutor-assistant", children: [_jsx("header", { children: _jsx("h2", { children: "Assistant" }) }), _jsx("div", { className: "tocktutor-assistant-content", children: props.assistantPanel })] }), _jsxs("section", { "aria-label": "Shared Review Panel", className: "tocktutor-review", children: [_jsx("header", { children: _jsx("h2", { children: "Reviews" }) }), _jsx("div", { className: "tocktutor-review-content", children: props.reviewPanel ?? _jsx("p", { role: "status", children: "No review workflow is active." }) })] }), _jsxs("section", { "aria-label": "Native Actions", className: "tocktutor-native-actions", children: [_jsx("header", { children: _jsx("h2", { children: "Native Actions" }) }), _jsx("div", { className: "tocktutor-native-actions-content", children: props.nativeActions ?? _jsx("p", { role: "status", children: "No native actions are available." }) })] })] })] })] }));
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
    return (_jsx("div", { className: "tocktutor-root", ref: root, children: _jsx(TockTutorRouteView, { assistantPanel: (_jsx(TockTutorAssistantPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), nativeActions: (_jsx(TockTutorNativeActionsOutlet, { activePath: snapshot.path, handleDispatch: event => controller.handleDispatch(event), renderSlot: props.renderSlot, vault: snapshot.vault })), onActivateTab: (paneId, path) => { void controller.activateTab(paneId, path); }, onAddPane: () => { void controller.addPane(); }, onCancelDispatch: () => { controller.cancelDispatchDialog(); }, onCloseSearch: () => { controller.closeSearch(); }, onEdit: source => { controller.edit(source); }, onFocusPane: paneId => { void controller.focusPane(paneId); }, onMode: mode => { controller.setMode(mode); }, onMoveCanvas: (nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY); }, onSave: () => { void controller.save(); }, onSearchChange: query => { controller.setSearchQuery(query); }, onSelect: path => { void controller.select(path); }, onSubmitDispatch: draft => { void controller.submitDispatchDialog(draft); }, onToggleTask: index => { controller.toggleTask(index); }, reviewPanel: (_jsx(TockTutorReviewPanelOutlet, { activePath: snapshot.path, renderSlot: props.renderSlot, vault: snapshot.vault })), snapshot: snapshot }) }));
}
const ROUTE_CSS = `
.tocktutor-root { height: 100%; min-height: 0; }
.tocktutor-workbench {
  --tt-accent: var(--dsw-alias-accent-primary, #2457d6);
  --tt-bg: var(--dsw-alias-bg-base, #f7f8fa);
  --tt-border: var(--dsw-alias-border-subtle, #d9dde5);
  --tt-muted: var(--dsw-alias-fg-muted, #667085);
  --tt-panel: var(--dsw-alias-bg-elevated, #fff);
  --tt-text: var(--dsw-alias-fg-primary, #18202c);
  background: var(--tt-bg);
  color: var(--tt-text);
  display: grid;
  font: 14px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.tocktutor-header { align-items: center; background: var(--tt-panel); border-bottom: 1px solid var(--tt-border); display: flex; justify-content: space-between; min-height: 64px; padding: 10px 20px; }
.tocktutor-header h1, .tocktutor-toolbar h2, .tocktutor-empty h2 { font-size: 17px; line-height: 1.25; margin: 0; }
.tocktutor-kicker { color: var(--tt-muted); font-size: 11px; font-weight: 650; letter-spacing: .08em; margin: 0 0 2px; text-transform: uppercase; }
.tocktutor-visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
.tocktutor-status { background: color-mix(in srgb, var(--tt-accent) 10%, transparent); border-radius: 999px; color: var(--tt-accent); font-size: 12px; font-weight: 650; padding: 4px 9px; }
.tocktutor-grid { display: grid; grid-template-columns: minmax(190px, 240px) minmax(0, 1fr) minmax(240px, 320px); min-height: 0; }
.tocktutor-sidebar { background: var(--tt-panel); border-right: 1px solid var(--tt-border); min-height: 0; overflow: auto; padding: 18px 12px; }
.tocktutor-search { border-bottom: 1px solid var(--tt-border); margin: 0 0 14px; padding: 0 8px 14px; }
.tocktutor-search > label { display: block; font-size: 12px; font-weight: 650; margin-bottom: 6px; }
.tocktutor-search > div { display: flex; gap: 4px; }
.tocktutor-search input { border: 1px solid var(--tt-border); border-radius: 6px; font: inherit; min-width: 0; padding: 6px 8px; width: 100%; }
.tocktutor-search button { border: 1px solid var(--tt-border); text-align: center; width: 32px; }
.tocktutor-search p { color: var(--tt-muted); font-size: 11px; margin: 6px 0 0; }
.tocktutor-sidebar h2 { font-size: 12px; letter-spacing: .04em; margin: 0 8px 10px; text-transform: uppercase; }
.tocktutor-sidebar p { color: var(--tt-muted); margin: 10px 8px; }
.tocktutor-sidebar ul { list-style: none; margin: 0; padding: 0; }
.tocktutor-sidebar button { background: transparent; border: 0; border-radius: 7px; color: inherit; cursor: pointer; display: block; overflow: hidden; padding: 7px 8px; text-align: left; text-overflow: ellipsis; transition: background-color 120ms ease; white-space: nowrap; width: 100%; }
.tocktutor-sidebar button:hover { background: color-mix(in srgb, var(--tt-text) 6%, transparent); }
.tocktutor-sidebar button[aria-current="page"] { background: color-mix(in srgb, var(--tt-accent) 12%, transparent); color: var(--tt-accent); font-weight: 650; }
.tocktutor-pane-groups { border-top: 1px solid var(--tt-border); margin-top: 18px; padding-top: 14px; }
.tocktutor-pane-heading { align-items: center; display: flex; justify-content: space-between; margin: 0 8px 8px; }
.tocktutor-pane-heading h2 { margin: 0; }
.tocktutor-pane-heading button { border: 1px solid var(--tt-border); font-size: 17px; height: 26px; padding: 0; text-align: center; width: 26px; }
.tocktutor-pane-list { display: grid; gap: 5px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.tocktutor-pane-list button { border: 1px solid transparent; }
.tocktutor-pane-list button[aria-pressed="true"] { border-color: var(--tt-accent); }
.tocktutor-pane-list span, .tocktutor-pane-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-pane-list small { color: var(--tt-muted); font-size: 10px; }
.tocktutor-tab-list { border-top: 1px solid var(--tt-border); margin-top: 10px; padding-top: 8px; }
.tocktutor-tab-list button { align-items: center; display: flex; gap: 5px; }
.tocktutor-tab-list button[aria-selected="true"] { background: color-mix(in srgb, var(--tt-accent) 10%, transparent); color: var(--tt-accent); font-weight: 650; }
.tocktutor-editor { background: var(--tt-panel); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; overflow: hidden; }
.tocktutor-right-rail { background: var(--tt-panel); border-left: 1px solid var(--tt-border); display: grid; grid-template-rows: minmax(0, 1fr) auto auto; min-height: 0; overflow: hidden; }
.tocktutor-assistant { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; overflow: hidden; }
.tocktutor-assistant > header, .tocktutor-review > header, .tocktutor-native-actions > header { border-bottom: 1px solid var(--tt-border); padding: 16px 18px; }
.tocktutor-assistant h2, .tocktutor-review h2, .tocktutor-native-actions h2 { font-size: 14px; margin: 0; }
.tocktutor-assistant-content, .tocktutor-review-content, .tocktutor-native-actions-content { min-height: 0; overflow: auto; }
.tocktutor-review, .tocktutor-native-actions { border-top: 1px solid var(--tt-border); max-height: 40vh; min-height: 0; overflow: hidden; }
.tocktutor-review-content > p[role="status"], .tocktutor-native-actions-content > p[role="status"] { color: var(--tt-muted); margin: 0; padding: 14px 18px; }
.tocktutor-toolbar { align-items: center; border-bottom: 1px solid var(--tt-border); display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) auto auto; padding: 12px 18px; }
.tocktutor-title { min-width: 0; }
.tocktutor-title h2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-segment { background: var(--tt-bg); border: 1px solid var(--tt-border); border-radius: 8px; display: flex; margin: 0; min-width: 0; padding: 2px; }
.tocktutor-segment button, .tocktutor-save { border: 0; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600; padding: 6px 10px; }
.tocktutor-segment button { background: transparent; color: var(--tt-muted); }
.tocktutor-segment button[aria-pressed="true"] { background: var(--tt-panel); color: var(--tt-text); box-shadow: 0 1px 2px rgb(16 24 40 / 10%); }
.tocktutor-save { background: var(--tt-accent); color: white; }
.tocktutor-save:disabled { cursor: default; opacity: .45; }
.tocktutor-editor textarea { background: var(--tt-panel); border: 0; color: var(--tt-text); font: 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; min-height: 0; outline: none; padding: 24px clamp(20px, 5vw, 72px); resize: none; tab-size: 2; }
.tocktutor-reading { margin: 0 auto; max-width: 760px; min-height: 0; overflow: auto; padding: 32px clamp(20px, 5vw, 56px) 80px; width: 100%; }
.tocktutor-projection { min-height: 0; overflow: auto; padding: 24px; }
.tocktutor-projection > header h3 { font-size: 17px; margin: 0 0 18px; }
.tocktutor-canvas-grid, .tocktutor-base-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.tocktutor-canvas-node, .tocktutor-base-view { background: var(--tt-bg); border: 1px solid var(--tt-border); border-radius: 10px; min-width: 0; padding: 14px; }
.tocktutor-canvas-node h4, .tocktutor-base-view h4 { font-size: 14px; margin: 0 0 8px; overflow-wrap: anywhere; }
.tocktutor-canvas-node > p:not(.tocktutor-kicker), .tocktutor-base-view > p:not(.tocktutor-kicker) { color: var(--tt-muted); font-size: 12px; }
.tocktutor-node-actions { border: 0; display: flex; gap: 4px; margin: 10px 0 0; padding: 0; }
.tocktutor-node-actions button { background: var(--tt-panel); border: 1px solid var(--tt-border); border-radius: 6px; color: inherit; cursor: pointer; height: 30px; width: 30px; }
.tocktutor-base-view dl { margin: 0; }
.tocktutor-base-view dl > div { border-top: 1px solid var(--tt-border); display: grid; gap: 8px; grid-template-columns: minmax(72px, .35fr) minmax(0, 1fr); padding: 7px 0; }
.tocktutor-base-view dt { color: var(--tt-muted); }
.tocktutor-base-view dd { margin: 0; overflow-wrap: anywhere; }
.tocktutor-reading h1, .tocktutor-reading h2, .tocktutor-reading h3 { line-height: 1.25; margin: 1.5em 0 .6em; }
.tocktutor-reading p { margin: .8em 0; }
.tocktutor-reading pre { background: var(--tt-bg); border: 1px solid var(--tt-border); border-radius: 8px; overflow: auto; padding: 14px; }
.tocktutor-task { align-items: flex-start; display: flex; gap: 8px; margin: 8px 0; }
.tocktutor-task input { margin-top: 4px; }
.tocktutor-warning { border-left: 3px solid #b7791f; color: var(--tt-muted); padding-left: 10px; }
.tocktutor-message { border-top: 1px solid var(--tt-border); color: var(--tt-muted); font-size: 12px; margin: 0; padding: 7px 18px; }
.tocktutor-empty { align-self: center; justify-self: center; max-width: 420px; padding: 32px; text-align: center; }
.tocktutor-empty > p:last-child { color: var(--tt-muted); }
.tocktutor-dispatch-dialog { align-items: center; background: rgb(0 0 0 / 35%); display: flex; inset: 0; justify-content: center; padding: 24px; position: fixed; z-index: 10; }
.tocktutor-dispatch-dialog form { background: var(--tt-panel); border: 1px solid var(--tt-border); border-radius: 10px; display: grid; gap: 14px; max-width: 480px; padding: 20px; width: 100%; }
.tocktutor-dispatch-dialog h2 { font-size: 17px; margin: 0; }
.tocktutor-dispatch-dialog label { display: grid; font-weight: 650; gap: 5px; }
.tocktutor-dispatch-dialog input, .tocktutor-dispatch-dialog textarea { border: 1px solid var(--tt-border); border-radius: 6px; font: inherit; padding: 8px; }
.tocktutor-dispatch-dialog textarea { min-height: 120px; resize: vertical; }
.tocktutor-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
.tocktutor-dialog-actions button { border: 1px solid var(--tt-border); border-radius: 6px; cursor: pointer; font: inherit; padding: 7px 12px; }
.tocktutor-workbench button:focus-visible, .tocktutor-workbench input:focus-visible, .tocktutor-workbench textarea:focus-visible { outline: 2px solid var(--tt-accent); outline-offset: 2px; }
@media (max-width: 1000px) {
  .tocktutor-grid { grid-template-columns: minmax(180px, 220px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .tocktutor-right-rail { border-left: 0; border-top: 1px solid var(--tt-border); grid-column: 2; max-height: 45vh; }
}
@media (max-width: 720px) {
  .tocktutor-grid { grid-template-columns: 1fr; grid-template-rows: minmax(100px, 30vh) minmax(0, 1fr) auto; }
  .tocktutor-sidebar { border-bottom: 1px solid var(--tt-border); border-right: 0; }
  .tocktutor-assistant { grid-column: 1; max-height: 35vh; }
  .tocktutor-toolbar { grid-template-columns: minmax(0, 1fr) auto; }
  .tocktutor-title { grid-column: 1 / -1; }
}
@media (prefers-reduced-motion: reduce) {
  .tocktutor-workbench *, .tocktutor-workbench *::before, .tocktutor-workbench *::after { scroll-behavior: auto !important; transition-duration: 0s !important; }
}
`;
//# sourceMappingURL=route.js.map