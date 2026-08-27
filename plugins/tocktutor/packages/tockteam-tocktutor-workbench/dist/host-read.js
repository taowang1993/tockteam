var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { isSafeVaultRelativePath } from "./session.js";
export const MAX_DOCUMENT_CONTENT_BYTES = 2_000_000;
export const MAX_TREE_CURSOR_LENGTH = 512;
export const MAX_TREE_PAGE_SIZE = 200;
function assertRecord(value, label) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${label} must be a bounded record.`);
    }
}
function assertVaultReference(value) {
    if (value === null
        || typeof value !== 'object'
        || !Number.isSafeInteger(value.generation)
        || value.generation < 0
        || typeof value.id !== 'string'
        || !/^vault:[0-9a-f]{64}$/u.test(value.id)) {
        throw new TypeError('Vault reference must identify one bounded active vault generation.');
    }
}
function assertEntryPath(value) {
    if (!isSafeVaultRelativePath(value)) {
        throw new TypeError('Entry path must be a canonical vault-relative path.');
    }
}
function assertDocumentPath(value) {
    if (!isSafeVaultRelativePath(value) || !/\.(?:base|canvas|markdown|md)$/iu.test(value)) {
        throw new TypeError('Document path must be a canonical supported vault-relative path.');
    }
}
function assertRevision(value) {
    if (typeof value !== 'string' || !/^file:[0-9a-f]{64}$/u.test(value)) {
        throw new TypeError('Expected revision must be one bounded file revision.');
    }
}
function assertAttachmentPath(value) {
    if (!isSafeVaultRelativePath(value) || !/\.(?:avif|bmp|gif|ico|jpe?g|png|webp|mp3|m4a|ogg|wav|weba|webm|mp4|mov|pdf)$/iu.test(value)) {
        throw new TypeError('Attachment path must be one accepted vault-relative media path.');
    }
}
function assertStoreAttachmentRequest(value) {
    assertRecord(value, 'Attachment request');
    assertVaultReference(value.expectedVault);
    assertAttachmentPath(value.path);
    if (typeof value.dataBase64 !== 'string' || value.dataBase64.length > 35_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.dataBase64))
        throw new TypeError('Attachment data must be bounded base64.');
}
function assertContent(value) {
    if (typeof value !== 'string'
        || new TextEncoder().encode(value).byteLength > MAX_DOCUMENT_CONTENT_BYTES) {
        throw new TypeError(`Document content must not exceed ${String(MAX_DOCUMENT_CONTENT_BYTES)} bytes.`);
    }
}
function assertSnapshotId(value) {
    if (typeof value !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}$/iu.test(value)) {
        throw new TypeError('Snapshot id must be one bounded recovery identifier.');
    }
}
function assertTrashId(value) {
    if (typeof value !== 'string'
        || !/^trash-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new TypeError('Trash id must be one bounded recovery identifier.');
    }
}
function assertExpectedGeneration(value) {
    assertRecord(value, 'Vault generation request');
    if (!Number.isSafeInteger(value.expectedGeneration) || value.expectedGeneration < 0) {
        throw new TypeError('Expected vault generation must be a non-negative safe integer.');
    }
}
function assertCreateManagedVaultRequest(value) {
    assertExpectedGeneration(value);
    if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(value.name.trim())) {
        throw new TypeError('Managed vault name is invalid.');
    }
}
function assertRecentVaultRequest(value) {
    assertExpectedGeneration(value);
    if (typeof value.id !== 'string' || !/^vault:[0-9a-f]{64}$/u.test(value.id)) {
        throw new TypeError('Recent vault request must identify one opaque vault.');
    }
}
function activeReference(state) {
    if (!state.active)
        throw new TypeError('Vault activation returned no active vault.');
    const vault = { generation: state.generation, id: state.id };
    assertVaultReference(vault);
    return vault;
}
function assertTreeRequest(value) {
    assertRecord(value, 'Tree request');
    assertVaultReference(value.expectedVault);
    if (value.cursor !== undefined
        && value.cursor !== null
        && (typeof value.cursor !== 'string'
            || value.cursor.length === 0
            || value.cursor.length > MAX_TREE_CURSOR_LENGTH)) {
        throw new TypeError('Tree cursor must be null or a bounded non-empty string.');
    }
    if (value.limit !== undefined
        && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > MAX_TREE_PAGE_SIZE)) {
        throw new TypeError(`Tree limit must be an integer from 1 through ${String(MAX_TREE_PAGE_SIZE)}.`);
    }
}
function assertCreateRequest(value) {
    assertRecord(value, 'Create request');
    assertVaultReference(value.expectedVault);
    assertDocumentPath(value.path);
    assertContent(value.content);
}
function assertSaveRequest(value) {
    assertCreateRequest(value);
    assertRevision(value.expectedRevision);
}
function assertGraphRequest(value) {
    assertRecord(value, 'Graph request');
    assertVaultReference(value.expectedVault);
    if (value.path !== undefined)
        assertDocumentPath(value.path);
    if (value.scope !== undefined && value.scope !== 'local' && value.scope !== 'global')
        throw new TypeError('Graph scope is unsupported.');
    if (value.direction !== undefined && value.direction !== 'outgoing' && value.direction !== 'backlinks' && value.direction !== 'both')
        throw new TypeError('Graph direction is unsupported.');
    if (value.depth !== undefined && (!Number.isSafeInteger(value.depth) || value.depth < 1 || value.depth > 3))
        throw new TypeError('Graph depth must be from 1 through 3.');
    if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 180))
        throw new TypeError('Graph limit must be bounded.');
    if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH))
        throw new TypeError('Graph cursor must be bounded.');
    if (value.tag !== undefined && (typeof value.tag !== 'string' || value.tag.length === 0 || value.tag.length > 256))
        throw new TypeError('Graph tag must be bounded.');
    for (const option of [value.includeAttachments, value.includeTags]) {
        if (option !== undefined && typeof option !== 'boolean')
            throw new TypeError('Graph options must be Boolean.');
    }
}
function assertFacetsRequest(value) {
    assertRecord(value, 'Facets request');
    assertVaultReference(value.expectedVault);
    if (value.directory !== undefined)
        assertEntryPath(value.directory);
    if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 1_000))
        throw new TypeError('Facets limit must be bounded.');
    if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH))
        throw new TypeError('Facets cursor must be bounded.');
}
function assertOutlineRequest(value) {
    assertRecord(value, 'Outline request');
    assertVaultReference(value.expectedVault);
    assertDocumentPath(value.path);
    if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 1_000))
        throw new TypeError('Outline limit must be bounded.');
    for (const option of [value.includeFootnotes, value.includeQueries]) {
        if (option !== undefined && typeof option !== 'boolean')
            throw new TypeError('Outline options must be Boolean.');
    }
}
function assertLinksRequest(value) {
    assertRecord(value, 'Links request');
    assertVaultReference(value.expectedVault);
    assertDocumentPath(value.path);
    if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH))
        throw new TypeError('Links cursor must be bounded.');
    if (value.includeUnlinked !== undefined && typeof value.includeUnlinked !== 'boolean')
        throw new TypeError('Links options must be Boolean.');
}
function assertSearchRequest(value) {
    assertRecord(value, 'Search request');
    assertVaultReference(value.expectedVault);
    if (typeof value.query !== 'string' || value.query.length > 1_000 || /[\u0000-\u001f\u007f]/u.test(value.query)) {
        throw new TypeError('Search query must be bounded text.');
    }
    if (value.mode !== undefined && value.mode !== 'literal' && value.mode !== 'query' && value.mode !== 'related')
        throw new TypeError('Search mode is unsupported.');
    if (value.scope !== undefined && value.scope !== 'all' && value.scope !== 'content' && value.scope !== 'path' && value.scope !== 'properties')
        throw new TypeError('Search scope is unsupported.');
    if (value.directory !== undefined)
        assertEntryPath(value.directory);
    if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 100))
        throw new TypeError('Search limit must be from 1 through 100.');
    if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > MAX_TREE_CURSOR_LENGTH))
        throw new TypeError('Search cursor must be bounded.');
    for (const option of [value.caseSensitive, value.regex, value.wholeWord]) {
        if (option !== undefined && typeof option !== 'boolean')
            throw new TypeError('Search options must be Boolean.');
    }
}
function assertDraftRequest(value) {
    assertRecord(value, 'Draft request');
    assertVaultReference(value.expectedVault);
    assertDocumentPath(value.path);
}
function assertSaveDraftRequest(value) {
    assertDraftRequest(value);
    assertContent(value.content);
    if (value.revision !== undefined)
        assertRevision(value.revision);
}
function assertSnapshotListRequest(value) {
    assertRecord(value, 'Snapshot request');
    assertVaultReference(value.expectedVault);
    assertDocumentPath(value.path);
}
function assertCaptureSnapshotRequest(value) {
    assertSnapshotListRequest(value);
    assertContent(value.content);
    if (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.trim().length === 0 || value.reason.length > 200))
        throw new TypeError('Snapshot reason must be bounded.');
}
function assertReadSnapshotRequest(value) {
    assertSnapshotListRequest(value);
    assertSnapshotId(value.snapshotId);
}
function assertRestoreSnapshotOverwriteRequest(value) {
    assertReadSnapshotRequest(value);
    assertRevision(value.expectedRevision);
}
function assertRestoreSnapshotRequest(value) {
    assertReadSnapshotRequest(value);
    assertDocumentPath(value.toPath);
}
function assertTrashEntryRequest(value) {
    assertRecord(value, 'Trash request');
    assertVaultReference(value.expectedVault);
    assertEntryPath(value.path);
    assertRevision(value.expectedRevision);
}
function assertListTrashRequest(value) {
    assertRecord(value, 'Trash list request');
    assertVaultReference(value.expectedVault);
}
function assertRestoreTrashRequest(value) {
    assertRecord(value, 'Trash restore request');
    assertVaultReference(value.expectedVault);
    assertTrashId(value.id);
    if (value.toPath !== undefined)
        assertEntryPath(value.toPath);
}
async function synchronizeDesktopVault(noteVault, signal) {
    await noteVault.synchronizeDesktopSelection(signal);
    signal.throwIfAborted();
}
/** Host-only projection of accepted note-vault workbench capabilities. */
let TockTutorWorkbenchGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _currentVault_decorators;
    let _createManagedVault_decorators;
    let _listRecentVaults_decorators;
    let _activateRecentVault_decorators;
    let _removeRecentVault_decorators;
    let _openSandboxVault_decorators;
    let _inspectAttachment_decorators;
    let _previewAttachment_decorators;
    let _storeAttachment_decorators;
    let _openDocument_decorators;
    let _listTree_decorators;
    let _createDocument_decorators;
    let _saveDocument_decorators;
    let _graph_decorators;
    let _facets_decorators;
    let _outline_decorators;
    let _links_decorators;
    let _search_decorators;
    let _readDraft_decorators;
    let _saveDraft_decorators;
    let _clearDraft_decorators;
    let _captureSnapshot_decorators;
    let _clearSnapshots_decorators;
    let _listSnapshots_decorators;
    let _readSnapshot_decorators;
    let _restoreSnapshot_decorators;
    let _restoreSnapshotAsNew_decorators;
    let _trashEntry_decorators;
    let _listTrash_decorators;
    let _restoreTrash_decorators;
    return class TockTutorWorkbenchGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _currentVault_decorators = [Remote];
            _createManagedVault_decorators = [Remote];
            _listRecentVaults_decorators = [Remote];
            _activateRecentVault_decorators = [Remote];
            _removeRecentVault_decorators = [Remote];
            _openSandboxVault_decorators = [Remote];
            _inspectAttachment_decorators = [Remote];
            _previewAttachment_decorators = [Remote];
            _storeAttachment_decorators = [Remote];
            _openDocument_decorators = [Remote];
            _listTree_decorators = [Remote];
            _createDocument_decorators = [Remote];
            _saveDocument_decorators = [Remote];
            _graph_decorators = [Remote];
            _facets_decorators = [Remote];
            _outline_decorators = [Remote];
            _links_decorators = [Remote];
            _search_decorators = [Remote];
            _readDraft_decorators = [Remote];
            _saveDraft_decorators = [Remote];
            _clearDraft_decorators = [Remote];
            _captureSnapshot_decorators = [Remote];
            _clearSnapshots_decorators = [Remote];
            _listSnapshots_decorators = [Remote];
            _readSnapshot_decorators = [Remote];
            _restoreSnapshot_decorators = [Remote];
            _restoreSnapshotAsNew_decorators = [Remote];
            _trashEntry_decorators = [Remote];
            _listTrash_decorators = [Remote];
            _restoreTrash_decorators = [Remote];
            __esDecorate(this, null, _currentVault_decorators, { kind: "method", name: "currentVault", static: false, private: false, access: { has: obj => "currentVault" in obj, get: obj => obj.currentVault }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createManagedVault_decorators, { kind: "method", name: "createManagedVault", static: false, private: false, access: { has: obj => "createManagedVault" in obj, get: obj => obj.createManagedVault }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listRecentVaults_decorators, { kind: "method", name: "listRecentVaults", static: false, private: false, access: { has: obj => "listRecentVaults" in obj, get: obj => obj.listRecentVaults }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _activateRecentVault_decorators, { kind: "method", name: "activateRecentVault", static: false, private: false, access: { has: obj => "activateRecentVault" in obj, get: obj => obj.activateRecentVault }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _removeRecentVault_decorators, { kind: "method", name: "removeRecentVault", static: false, private: false, access: { has: obj => "removeRecentVault" in obj, get: obj => obj.removeRecentVault }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _openSandboxVault_decorators, { kind: "method", name: "openSandboxVault", static: false, private: false, access: { has: obj => "openSandboxVault" in obj, get: obj => obj.openSandboxVault }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _inspectAttachment_decorators, { kind: "method", name: "inspectAttachment", static: false, private: false, access: { has: obj => "inspectAttachment" in obj, get: obj => obj.inspectAttachment }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _previewAttachment_decorators, { kind: "method", name: "previewAttachment", static: false, private: false, access: { has: obj => "previewAttachment" in obj, get: obj => obj.previewAttachment }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _storeAttachment_decorators, { kind: "method", name: "storeAttachment", static: false, private: false, access: { has: obj => "storeAttachment" in obj, get: obj => obj.storeAttachment }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _openDocument_decorators, { kind: "method", name: "openDocument", static: false, private: false, access: { has: obj => "openDocument" in obj, get: obj => obj.openDocument }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listTree_decorators, { kind: "method", name: "listTree", static: false, private: false, access: { has: obj => "listTree" in obj, get: obj => obj.listTree }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createDocument_decorators, { kind: "method", name: "createDocument", static: false, private: false, access: { has: obj => "createDocument" in obj, get: obj => obj.createDocument }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _saveDocument_decorators, { kind: "method", name: "saveDocument", static: false, private: false, access: { has: obj => "saveDocument" in obj, get: obj => obj.saveDocument }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _graph_decorators, { kind: "method", name: "graph", static: false, private: false, access: { has: obj => "graph" in obj, get: obj => obj.graph }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _facets_decorators, { kind: "method", name: "facets", static: false, private: false, access: { has: obj => "facets" in obj, get: obj => obj.facets }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _outline_decorators, { kind: "method", name: "outline", static: false, private: false, access: { has: obj => "outline" in obj, get: obj => obj.outline }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _links_decorators, { kind: "method", name: "links", static: false, private: false, access: { has: obj => "links" in obj, get: obj => obj.links }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readDraft_decorators, { kind: "method", name: "readDraft", static: false, private: false, access: { has: obj => "readDraft" in obj, get: obj => obj.readDraft }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _saveDraft_decorators, { kind: "method", name: "saveDraft", static: false, private: false, access: { has: obj => "saveDraft" in obj, get: obj => obj.saveDraft }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _clearDraft_decorators, { kind: "method", name: "clearDraft", static: false, private: false, access: { has: obj => "clearDraft" in obj, get: obj => obj.clearDraft }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _captureSnapshot_decorators, { kind: "method", name: "captureSnapshot", static: false, private: false, access: { has: obj => "captureSnapshot" in obj, get: obj => obj.captureSnapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _clearSnapshots_decorators, { kind: "method", name: "clearSnapshots", static: false, private: false, access: { has: obj => "clearSnapshots" in obj, get: obj => obj.clearSnapshots }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listSnapshots_decorators, { kind: "method", name: "listSnapshots", static: false, private: false, access: { has: obj => "listSnapshots" in obj, get: obj => obj.listSnapshots }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readSnapshot_decorators, { kind: "method", name: "readSnapshot", static: false, private: false, access: { has: obj => "readSnapshot" in obj, get: obj => obj.readSnapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _restoreSnapshot_decorators, { kind: "method", name: "restoreSnapshot", static: false, private: false, access: { has: obj => "restoreSnapshot" in obj, get: obj => obj.restoreSnapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _restoreSnapshotAsNew_decorators, { kind: "method", name: "restoreSnapshotAsNew", static: false, private: false, access: { has: obj => "restoreSnapshotAsNew" in obj, get: obj => obj.restoreSnapshotAsNew }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _trashEntry_decorators, { kind: "method", name: "trashEntry", static: false, private: false, access: { has: obj => "trashEntry" in obj, get: obj => obj.trashEntry }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listTrash_decorators, { kind: "method", name: "listTrash", static: false, private: false, access: { has: obj => "listTrash" in obj, get: obj => obj.listTrash }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _restoreTrash_decorators, { kind: "method", name: "restoreTrash", static: false, private: false, access: { has: obj => "restoreTrash" in obj, get: obj => obj.restoreTrash }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['noteVault'];
        constructor(ctx) {
            super(ctx, 'tocktutorWorkbench');
            __runInitializers(this, _instanceExtraInitializers);
        }
        async currentVault(signal) {
            signal.throwIfAborted();
            const state = this.ctx.noteVault.state;
            if (!state.active)
                return null;
            const vault = activeReference(state);
            await synchronizeDesktopVault(this.ctx.noteVault, signal);
            return vault;
        }
        async createManagedVault(request, signal) {
            assertCreateManagedVaultRequest(request);
            signal.throwIfAborted();
            const vault = activeReference(this.ctx.noteVault.createManagedVault(request.name, request.expectedGeneration));
            await synchronizeDesktopVault(this.ctx.noteVault, signal);
            return vault;
        }
        async listRecentVaults(signal) {
            signal.throwIfAborted();
            return {
                generation: this.ctx.noteVault.state.generation,
                vaults: this.ctx.noteVault.listRecentVaults(),
            };
        }
        async activateRecentVault(request, signal) {
            assertRecentVaultRequest(request);
            signal.throwIfAborted();
            const vault = activeReference(this.ctx.noteVault.activateRecentVault(request.id, request.expectedGeneration));
            await synchronizeDesktopVault(this.ctx.noteVault, signal);
            return vault;
        }
        async removeRecentVault(request, signal) {
            assertRecentVaultRequest(request);
            signal.throwIfAborted();
            return {
                generation: this.ctx.noteVault.state.generation,
                vaults: this.ctx.noteVault.removeRecentVault(request.id, request.expectedGeneration),
            };
        }
        async openSandboxVault(request, signal) {
            assertExpectedGeneration(request);
            signal.throwIfAborted();
            const vault = activeReference(this.ctx.noteVault.openSandboxVault(request.expectedGeneration));
            await synchronizeDesktopVault(this.ctx.noteVault, signal);
            return vault;
        }
        async inspectAttachment(path, expectedVault, signal) {
            assertAttachmentPath(path);
            assertVaultReference(expectedVault);
            signal.throwIfAborted();
            return this.ctx.noteVault.inspectAttachment(path, expectedVault, signal);
        }
        async previewAttachment(path, expectedVault, signal) {
            assertAttachmentPath(path);
            assertVaultReference(expectedVault);
            signal.throwIfAborted();
            const preview = await this.ctx.noteVault.previewAttachment(path, expectedVault, signal);
            const { data, ...metadata } = preview;
            return { ...metadata, dataBase64: Buffer.from(data).toString('base64') };
        }
        async storeAttachment(request, signal) {
            assertStoreAttachmentRequest(request);
            signal.throwIfAborted();
            const data = Buffer.from(request.dataBase64, 'base64');
            if (data.byteLength > 25 * 1024 * 1024)
                throw new TypeError('Attachment data must not exceed 25 MiB.');
            return this.ctx.noteVault.storeAttachment({ data, expectedVault: request.expectedVault, path: request.path }, signal);
        }
        async openDocument(path, expectedVault, signal) {
            assertDocumentPath(path);
            assertVaultReference(expectedVault);
            signal.throwIfAborted();
            return this.ctx.noteVault.openDocument(path, expectedVault, signal);
        }
        async listTree(request, signal) {
            assertTreeRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.listTree(request, signal);
        }
        async createDocument(request, signal) {
            assertCreateRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.createDocument(request, signal);
        }
        async saveDocument(request, signal) {
            assertSaveRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.saveDocument(request, signal);
        }
        async graph(request, signal) {
            assertGraphRequest(request);
            signal.throwIfAborted();
            const { expectedVault, ...args } = request;
            return this.ctx.noteVault.graph(args, expectedVault, signal);
        }
        async facets(request, signal) {
            assertFacetsRequest(request);
            signal.throwIfAborted();
            const { expectedVault, ...args } = request;
            return this.ctx.noteVault.facets(args, expectedVault, signal);
        }
        async outline(request, signal) {
            assertOutlineRequest(request);
            signal.throwIfAborted();
            const { expectedVault, ...args } = request;
            return this.ctx.noteVault.outline(args, expectedVault, signal);
        }
        async links(request, signal) {
            assertLinksRequest(request);
            signal.throwIfAborted();
            const { expectedVault, ...args } = request;
            return this.ctx.noteVault.links(args, expectedVault, signal);
        }
        async search(request, signal) {
            assertSearchRequest(request);
            signal.throwIfAborted();
            const { expectedVault, ...args } = request;
            return this.ctx.noteVault.search(args, expectedVault, signal);
        }
        async readDraft(request, signal) {
            assertDraftRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.readDraft(request, signal);
        }
        async saveDraft(request, signal) {
            assertSaveDraftRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.saveDraft(request, signal);
        }
        async clearDraft(request, signal) {
            assertDraftRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.clearDraft(request, signal);
        }
        async captureSnapshot(request, signal) {
            assertCaptureSnapshotRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.captureSnapshot(request, signal);
        }
        async clearSnapshots(request, signal) {
            assertSnapshotListRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.clearSnapshots(request, signal);
        }
        async listSnapshots(request, signal) {
            assertSnapshotListRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.listSnapshots(request, signal);
        }
        async readSnapshot(request, signal) {
            assertReadSnapshotRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.readSnapshot(request, signal);
        }
        async restoreSnapshot(request, signal) {
            assertRestoreSnapshotOverwriteRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.restoreSnapshot(request, signal);
        }
        async restoreSnapshotAsNew(request, signal) {
            assertRestoreSnapshotRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.restoreSnapshotAsNew(request, signal);
        }
        async trashEntry(request, signal) {
            assertTrashEntryRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.trashEntry(request, signal);
        }
        async listTrash(request, signal) {
            assertListTrashRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.listTrash(request, signal);
        }
        async restoreTrash(request, signal) {
            assertRestoreTrashRequest(request);
            signal.throwIfAborted();
            return this.ctx.noteVault.restoreTrash(request, signal);
        }
    };
})();
export { TockTutorWorkbenchGateway };
//# sourceMappingURL=host-read.js.map