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
import { createNativeOwnerLifetime, MAX_PRINT_EXPORT_HTML_BYTES, } from '@tockteam/desktop/host';
import { buildMarkdownExportDocument, collectEmbedTargets, resolveEmbedTargetPath, resolveNoteEmbedFragment, } from '@tockteam/tocktutor-workbench';
export const MAX_TRACKED_POPOUTS = 64;
function assertVault(value) {
    if (typeof value !== 'object'
        || value === null
        || !Number.isSafeInteger(value.generation)
        || value.generation < 0
        || typeof value.id !== 'string'
        || !/^vault:[0-9a-f]{64}$/u.test(value.id))
        throw new TypeError('Vault must identify one active vault generation.');
}
function assertPath(value) {
    if (typeof value !== 'string'
        || value.length === 0
        || value.includes('\\')
        || /[\u0000-\u001f\u007f]/u.test(value)
        || new TextEncoder().encode(value).byteLength > 4096
        || value.startsWith('/')
        || /^[A-Za-z]:/u.test(value)
        || value.split('/').some(part => part.length === 0 || part === '.' || part === '..'))
        throw new TypeError('Path must be one bounded vault-relative entry.');
}
function assertAuthorization(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
        throw new TypeError('Desktop authorization must be one bounded opaque token.');
    }
}
function popOutKey(vault, path) {
    return `${vault.id}:${String(vault.generation)}:${path}`;
}
async function resolveExportEmbeds(runtime, source, expectedVault, signal) {
    const targets = collectEmbedTargets(source);
    if (targets.length === 0)
        return [];
    const entries = [];
    let cursor = null;
    for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
        const page = await runtime.listTree({ cursor, expectedVault, limit: 500 }, signal);
        assertCurrentVault(runtime, expectedVault);
        if (page.generation !== expectedVault.generation)
            throw new Error('The active vault changed while resolving embeds.');
        entries.push(...page.entries);
        if (page.complete || page.cursor === null)
            break;
        if (page.cursor === cursor || pageIndex === 9)
            throw new Error('The bounded embed tree scan did not complete.');
        cursor = page.cursor;
    }
    const resolved = [];
    let aggregateBytes = 0;
    for (const target of targets) {
        const path = resolveEmbedTargetPath(entries, target.path);
        if (path === null)
            continue;
        const entry = entries.find(candidate => candidate.path === path);
        if (entry === undefined)
            continue;
        const projectedTarget = { ...target, path: entry.path };
        if (target.kind === 'media') {
            if (entry.kind !== 'attachment')
                continue;
            if (entry.mediaKind !== 'image') {
                resolved.push({
                    content: '',
                    mimeType: entry.mediaKind === 'audio' ? 'audio/unknown' : entry.mediaKind === 'video' ? 'video/unknown' : 'application/pdf',
                    target: projectedTarget,
                });
                continue;
            }
            const preview = await runtime.previewAttachment(entry.path, expectedVault, signal);
            assertCurrentVault(runtime, expectedVault);
            if (preview.generation !== expectedVault.generation || preview.path !== entry.path || preview.data.byteLength > 1_500_000)
                continue;
            aggregateBytes += preview.data.byteLength;
            if (aggregateBytes > 6_000_000)
                break;
            resolved.push({ content: Buffer.from(preview.data).toString('base64'), mimeType: preview.mimeType, target: projectedTarget });
            continue;
        }
        if (entry.kind !== 'document')
            continue;
        const opened = await runtime.openDocument(entry.path, expectedVault, signal);
        assertCurrentVault(runtime, expectedVault);
        if (opened.generation !== expectedVault.generation || opened.path !== entry.path)
            throw new Error('An embedded document changed during export.');
        aggregateBytes += new TextEncoder().encode(opened.content).byteLength;
        if (aggregateBytes > 6_000_000)
            break;
        const content = target.kind === 'note' ? resolveNoteEmbedFragment(opened.content, target.fragment) : opened.content;
        if (content !== null)
            resolved.push({ content, target: projectedTarget });
    }
    return resolved;
}
async function renderNote(runtime, path, content, expectedVault, signal) {
    const title = Array.from(path).slice(-128).join('');
    const embeds = await resolveExportEmbeds(runtime, content, expectedVault, signal);
    const html = buildMarkdownExportDocument({ embeds, markdown: content, title });
    if (new TextEncoder().encode(html).byteLength > MAX_PRINT_EXPORT_HTML_BYTES) {
        throw new TypeError('The active note is too large to print or export safely.');
    }
    return { html, title };
}
function assertCurrentVault(runtime, expected) {
    const state = runtime.state;
    if (!state.active || state.id !== expected.id || state.generation !== expected.generation) {
        throw new Error('The active vault changed before the Desktop action could finish.');
    }
}
function assertIdentityCurrent(runtime, identity) {
    const state = runtime.state;
    if (state.generation !== identity.vaultGeneration
        || (state.active ? state.id : null) !== identity.vaultId)
        throw new Error('Desktop caller authorization is stale for the active vault.');
}
function sameIdentity(left, right) {
    return left.operationId === right.operationId
        && left.requestId === right.requestId
        && left.sessionId === right.sessionId
        && left.vaultGeneration === right.vaultGeneration
        && left.vaultId === right.vaultId
        && left.windowId === right.windowId;
}
function assertClaim(runtime, expected, identity) {
    assertCurrentVault(runtime, expected);
    assertIdentityCurrent(runtime, identity);
    if (identity.vaultId !== expected.id || identity.vaultGeneration !== expected.generation) {
        throw new Error('Desktop caller authorization is stale for the requested vault.');
    }
}
/** Caller-bound Host gateway for the bounded TockTutor native action seat. */
let TockTutorDesktopGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _activateVault_decorators;
    let _openPopOut_decorators;
    let _closePopOut_decorators;
    let _closeAllPopOuts_decorators;
    let _printNote_decorators;
    let _exportNote_decorators;
    let _requestMicrophone_decorators;
    let _revealEntry_decorators;
    return class TockTutorDesktopGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _activateVault_decorators = [Remote];
            _openPopOut_decorators = [Remote];
            _closePopOut_decorators = [Remote];
            _closeAllPopOuts_decorators = [Remote];
            _printNote_decorators = [Remote];
            _exportNote_decorators = [Remote];
            _requestMicrophone_decorators = [Remote];
            _revealEntry_decorators = [Remote];
            __esDecorate(this, null, _activateVault_decorators, { kind: "method", name: "activateVault", static: false, private: false, access: { has: obj => "activateVault" in obj, get: obj => obj.activateVault }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _openPopOut_decorators, { kind: "method", name: "openPopOut", static: false, private: false, access: { has: obj => "openPopOut" in obj, get: obj => obj.openPopOut }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _closePopOut_decorators, { kind: "method", name: "closePopOut", static: false, private: false, access: { has: obj => "closePopOut" in obj, get: obj => obj.closePopOut }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _closeAllPopOuts_decorators, { kind: "method", name: "closeAllPopOuts", static: false, private: false, access: { has: obj => "closeAllPopOuts" in obj, get: obj => obj.closeAllPopOuts }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _printNote_decorators, { kind: "method", name: "printNote", static: false, private: false, access: { has: obj => "printNote" in obj, get: obj => obj.printNote }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _exportNote_decorators, { kind: "method", name: "exportNote", static: false, private: false, access: { has: obj => "exportNote" in obj, get: obj => obj.exportNote }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _requestMicrophone_decorators, { kind: "method", name: "requestMicrophone", static: false, private: false, access: { has: obj => "requestMicrophone" in obj, get: obj => obj.requestMicrophone }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _revealEntry_decorators, { kind: "method", name: "revealEntry", static: false, private: false, access: { has: obj => "revealEntry" in obj, get: obj => obj.revealEntry }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = [
            'noteVault',
            'tockTeamDesktopCaller',
            'tockTeamDesktopMicrophone',
            'tockTeamDesktopPicker',
            'tockTeamDesktopPopOut',
            'tockTeamDesktopPrintExport',
        ];
        activations = (__runInitializers(this, _instanceExtraInitializers), new Map());
        lifetime = createNativeOwnerLifetime();
        recoveredResults = new Map();
        popOutClosures = new Map();
        popOuts = new Map();
        revealed = new Map();
        constructor(ctx) {
            super(ctx, 'tocktutorDesktop');
            ctx.effect(() => async () => {
                await this.lifetime.dispose();
                const opened = new Map([...this.popOuts.values()].map(record => [record.windowId, record]));
                this.activations.clear();
                this.popOutClosures.clear();
                this.popOuts.clear();
                this.recoveredResults.clear();
                this.revealed.clear();
                await Promise.allSettled([...opened.values()].map(record => (this.ctx.tockTeamDesktopPopOut.close({ identity: record.identity, windowId: record.windowId }, AbortSignal.timeout(2_000)))));
            }, 'tocktutorDesktop owner lifetime');
        }
        recoverResult(authorization, fingerprint, identity) {
            const recovered = this.recoveredResults.get(authorization);
            if (recovered === undefined)
                return undefined;
            if (recovered.fingerprint !== fingerprint || !sameIdentity(recovered.identity, identity)) {
                throw new Error('Desktop action changed during response recovery.');
            }
            return recovered.result;
        }
        rememberResult(authorization, fingerprint, identity, result) {
            this.recoveredResults.set(authorization, { fingerprint, identity, result });
            if (this.recoveredResults.size > 128) {
                this.recoveredResults.delete(this.recoveredResults.keys().next().value);
            }
            return result;
        }
        async activateVault(authorization, signal) {
            assertAuthorization(authorization);
            return this.lifetime.run(async (ownerSignal) => {
                const identity = await this.ctx.tockTeamDesktopCaller.claim({
                    authorization,
                    operation: 'activate-vault',
                }, ownerSignal);
                const recovered = this.activations.get(authorization);
                if (recovered !== undefined) {
                    if (!sameIdentity(recovered.identity, identity)) {
                        throw new Error('Desktop caller authorization changed during recovery.');
                    }
                    assertCurrentVault(this.ctx.noteVault, recovered.vault);
                    return { status: 'activated' };
                }
                assertIdentityCurrent(this.ctx.noteVault, identity);
                const selection = await this.ctx.tockTeamDesktopPicker.pick({
                    identity,
                    kind: 'vault',
                    purpose: 'activate',
                }, ownerSignal);
                assertIdentityCurrent(this.ctx.noteVault, identity);
                if (selection.status !== 'selected')
                    return { status: selection.status };
                if (selection.operationId !== identity.operationId) {
                    throw new Error('Desktop picker returned a mismatched operation.');
                }
                const result = await this.ctx.noteVault.activateDesktopSelection({
                    authorization: selection.authorization,
                    identity,
                }, ownerSignal);
                const state = this.ctx.noteVault.state;
                if (result.operationId !== identity.operationId
                    || !state.active
                    || state.id !== result.vaultId
                    || state.generation !== result.vaultGeneration)
                    throw new Error('Desktop vault activation completed with stale state.');
                this.activations.set(authorization, {
                    identity,
                    vault: { generation: result.vaultGeneration, id: result.vaultId },
                });
                if (this.activations.size > 128)
                    this.activations.delete(this.activations.keys().next().value);
                return { status: 'activated' };
            }, signal);
        }
        async openPopOut(authorization, path, expectedVault, signal) {
            assertAuthorization(authorization);
            assertPath(path);
            assertVault(expectedVault);
            assertCurrentVault(this.ctx.noteVault, expectedVault);
            return this.lifetime.run(async (ownerSignal) => {
                const identity = await this.ctx.tockTeamDesktopCaller.claim({
                    authorization,
                    operation: 'popout-open',
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const fingerprint = `popout-open:${expectedVault.id}:${String(expectedVault.generation)}:${path}`;
                const recovered = this.recoverResult(authorization, fingerprint, identity);
                if (recovered !== undefined)
                    return recovered;
                const key = popOutKey(expectedVault, path);
                if (!this.popOuts.has(key) && this.popOuts.size >= MAX_TRACKED_POPOUTS) {
                    return { status: 'denied' };
                }
                const result = await this.ctx.tockTeamDesktopPopOut.open({ identity, relativePath: path }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                if (result.operationId !== identity.operationId) {
                    throw new Error('Desktop pop-out returned a mismatched operation.');
                }
                if (result.status === 'opened' || result.status === 'focused') {
                    this.popOuts.set(key, { identity, windowId: result.windowId });
                }
                return this.rememberResult(authorization, fingerprint, identity, { status: result.status });
            }, signal);
        }
        async closePopOut(authorization, path, expectedVault, signal) {
            assertAuthorization(authorization);
            assertPath(path);
            assertVault(expectedVault);
            assertCurrentVault(this.ctx.noteVault, expectedVault);
            return this.lifetime.run(async (ownerSignal) => {
                const identity = await this.ctx.tockTeamDesktopCaller.claim({
                    authorization,
                    operation: 'popout-close',
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const recovered = this.popOutClosures.get(authorization);
                if (recovered !== undefined) {
                    if (!sameIdentity(recovered.identity, identity)
                        || recovered.request !== path
                        || recovered.vault.id !== expectedVault.id
                        || recovered.vault.generation !== expectedVault.generation) {
                        throw new Error('Desktop pop-out close changed during recovery.');
                    }
                    return { status: 'closed' };
                }
                const key = popOutKey(expectedVault, path);
                const opened = this.popOuts.get(key);
                if (opened === undefined)
                    return { status: 'stale' };
                const result = await this.ctx.tockTeamDesktopPopOut.close({
                    identity,
                    windowId: opened.windowId,
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                if (result.operationId !== identity.operationId) {
                    throw new Error('Desktop pop-out returned a mismatched operation.');
                }
                if (result.status === 'closed' || result.status === 'stale')
                    this.popOuts.delete(key);
                if (result.status === 'closed') {
                    this.popOutClosures.set(authorization, { identity, request: path, vault: expectedVault });
                    if (this.popOutClosures.size > 128) {
                        this.popOutClosures.delete(this.popOutClosures.keys().next().value);
                    }
                }
                return { status: result.status };
            }, signal);
        }
        async closeAllPopOuts(authorization, expectedVault, signal) {
            assertAuthorization(authorization);
            assertVault(expectedVault);
            assertCurrentVault(this.ctx.noteVault, expectedVault);
            return this.lifetime.run(async (ownerSignal) => {
                const identity = await this.ctx.tockTeamDesktopCaller.claim({
                    authorization,
                    operation: 'popout-close-all',
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const recovered = this.popOutClosures.get(authorization);
                if (recovered !== undefined) {
                    if (!sameIdentity(recovered.identity, identity)
                        || recovered.request !== '*'
                        || recovered.vault.id !== expectedVault.id
                        || recovered.vault.generation !== expectedVault.generation) {
                        throw new Error('Desktop pop-out close changed during recovery.');
                    }
                    return { status: 'closed' };
                }
                const result = await this.ctx.tockTeamDesktopPopOut.closeAll({ identity }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                if (result.operationId !== identity.operationId) {
                    throw new Error('Desktop pop-out returned a mismatched operation.');
                }
                if (result.status === 'closed' || result.status === 'stale')
                    this.popOuts.clear();
                if (result.status === 'closed') {
                    this.popOutClosures.set(authorization, { identity, request: '*', vault: expectedVault });
                    if (this.popOutClosures.size > 128) {
                        this.popOutClosures.delete(this.popOutClosures.keys().next().value);
                    }
                }
                return { status: result.status };
            }, signal);
        }
        async printNote(authorization, path, expectedVault, signal) {
            assertAuthorization(authorization);
            assertPath(path);
            assertVault(expectedVault);
            assertCurrentVault(this.ctx.noteVault, expectedVault);
            return this.lifetime.run(async (ownerSignal) => {
                const identity = await this.ctx.tockTeamDesktopCaller.claim({
                    authorization,
                    operation: 'print',
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const fingerprint = `print:${expectedVault.id}:${String(expectedVault.generation)}:${path}`;
                const recovered = this.recoverResult(authorization, fingerprint, identity);
                if (recovered !== undefined)
                    return recovered;
                const document = await this.ctx.noteVault.openDocument(path, expectedVault, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const note = await renderNote(this.ctx.noteVault, document.path, document.content, expectedVault, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const result = await this.ctx.tockTeamDesktopPrintExport.render({
                    format: 'print',
                    ...note,
                    identity,
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                if (result.operationId !== identity.operationId) {
                    throw new Error('Desktop print returned a mismatched operation.');
                }
                return this.rememberResult(authorization, fingerprint, identity, { status: result.status });
            }, signal);
        }
        async exportNote(authorization, format, path, expectedVault, signal) {
            assertAuthorization(authorization);
            if (format !== 'html' && format !== 'pdf')
                throw new TypeError('Export format must be html or pdf.');
            assertPath(path);
            assertVault(expectedVault);
            assertCurrentVault(this.ctx.noteVault, expectedVault);
            return this.lifetime.run(async (ownerSignal) => {
                const purpose = format === 'html' ? 'export-html' : 'export-pdf';
                const identity = await this.ctx.tockTeamDesktopCaller.claim({ authorization, operation: purpose }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const fingerprint = `export-${format}:${expectedVault.id}:${String(expectedVault.generation)}:${path}`;
                const recovered = this.recoverResult(authorization, fingerprint, identity);
                if (recovered !== undefined)
                    return recovered;
                const document = await this.ctx.noteVault.openDocument(path, expectedVault, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const selection = await this.ctx.tockTeamDesktopPicker.pick({
                    identity,
                    kind: 'destination',
                    purpose,
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                if (selection.status !== 'selected') {
                    return this.rememberResult(authorization, fingerprint, identity, { status: selection.status });
                }
                if (selection.operationId !== identity.operationId) {
                    throw new Error('Desktop picker returned a mismatched operation.');
                }
                const note = await renderNote(this.ctx.noteVault, document.path, document.content, expectedVault, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const result = await this.ctx.tockTeamDesktopPrintExport.render(format === 'html' ? {
                    authorization: selection.authorization,
                    format: 'html',
                    ...note,
                    identity,
                    purpose: 'export-html',
                } : {
                    authorization: selection.authorization,
                    format: 'pdf',
                    ...note,
                    identity,
                    purpose: 'export-pdf',
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                if (result.operationId !== identity.operationId) {
                    throw new Error('Desktop export returned a mismatched operation.');
                }
                return this.rememberResult(authorization, fingerprint, identity, { status: result.status });
            }, signal);
        }
        async requestMicrophone(authorization, expectedVault, signal) {
            assertAuthorization(authorization);
            assertVault(expectedVault);
            assertCurrentVault(this.ctx.noteVault, expectedVault);
            return this.lifetime.run(async (ownerSignal) => {
                const identity = await this.ctx.tockTeamDesktopCaller.claim({
                    authorization,
                    operation: 'microphone',
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const fingerprint = `microphone:${expectedVault.id}:${String(expectedVault.generation)}`;
                const recovered = this.recoverResult(authorization, fingerprint, identity);
                if (recovered !== undefined)
                    return recovered;
                const result = await this.ctx.tockTeamDesktopMicrophone.request({ identity }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                if (result.operationId !== identity.operationId) {
                    throw new Error('Desktop microphone returned a mismatched operation.');
                }
                return this.rememberResult(authorization, fingerprint, identity, { status: result.status });
            }, signal);
        }
        async revealEntry(authorization, path, expectedVault, signal) {
            assertAuthorization(authorization);
            assertPath(path);
            assertVault(expectedVault);
            assertCurrentVault(this.ctx.noteVault, expectedVault);
            return this.lifetime.run(async (ownerSignal) => {
                const identity = await this.ctx.tockTeamDesktopCaller.claim({
                    authorization,
                    operation: 'reveal-entry',
                }, ownerSignal);
                assertClaim(this.ctx.noteVault, expectedVault, identity);
                const recovered = this.revealed.get(authorization);
                if (recovered !== undefined
                    && sameIdentity(recovered.identity, identity)
                    && recovered.path === path
                    && recovered.vault.id === expectedVault.id
                    && recovered.vault.generation === expectedVault.generation)
                    return { status: 'revealed' };
                await this.ctx.noteVault.revealEntry({ expectedVault, path }, ownerSignal);
                assertCurrentVault(this.ctx.noteVault, expectedVault);
                this.revealed.set(authorization, { identity, path, vault: expectedVault });
                if (this.revealed.size > 128)
                    this.revealed.delete(this.revealed.keys().next().value);
                return { status: 'revealed' };
            }, signal);
        }
    };
})();
export { TockTutorDesktopGateway };
//# sourceMappingURL=host-actions.js.map