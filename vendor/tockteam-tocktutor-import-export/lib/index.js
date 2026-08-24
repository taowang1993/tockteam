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
import { randomBytes } from 'node:crypto';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { ReviewedBackupEngine } from "./backup-engine.js";
import { ImportExportError } from "./core.js";
import { ReviewedOperationEngine } from "./engine.js";
import { isImportInspectFormat, } from "./types.js";
export const name = '@tockteam/tocktutor-import-export';
export const inject = ['noteVault', 'tockTeamDesktopCaller', 'tockTeamDesktopPicker'];
function token() {
    return randomBytes(32).toString('base64url');
}
/** Host-only reviewed operation gateway. Native grants never cross a Remote method. */
let TockTutorImportExportGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _inspect_decorators;
    let _abandonImport_decorators;
    let _approveImport_decorators;
    let _commitImport_decorators;
    let _cancelImport_decorators;
    let _prepareBackup_decorators;
    let _abandonBackup_decorators;
    let _approveBackup_decorators;
    let _commitBackup_decorators;
    let _cancelBackup_decorators;
    return class TockTutorImportExportGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _inspect_decorators = [Remote('inspect')];
            _abandonImport_decorators = [Remote('abandon-import')];
            _approveImport_decorators = [Remote('approve-import')];
            _commitImport_decorators = [Remote('commit-import')];
            _cancelImport_decorators = [Remote('cancel-import')];
            _prepareBackup_decorators = [Remote('prepare-backup')];
            _abandonBackup_decorators = [Remote('abandon-backup')];
            _approveBackup_decorators = [Remote('approve-backup')];
            _commitBackup_decorators = [Remote('commit-backup')];
            _cancelBackup_decorators = [Remote('cancel-backup')];
            __esDecorate(this, null, _inspect_decorators, { kind: "method", name: "inspect", static: false, private: false, access: { has: obj => "inspect" in obj, get: obj => obj.inspect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _abandonImport_decorators, { kind: "method", name: "abandonImport", static: false, private: false, access: { has: obj => "abandonImport" in obj, get: obj => obj.abandonImport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approveImport_decorators, { kind: "method", name: "approveImport", static: false, private: false, access: { has: obj => "approveImport" in obj, get: obj => obj.approveImport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commitImport_decorators, { kind: "method", name: "commitImport", static: false, private: false, access: { has: obj => "commitImport" in obj, get: obj => obj.commitImport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelImport_decorators, { kind: "method", name: "cancelImport", static: false, private: false, access: { has: obj => "cancelImport" in obj, get: obj => obj.cancelImport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prepareBackup_decorators, { kind: "method", name: "prepareBackup", static: false, private: false, access: { has: obj => "prepareBackup" in obj, get: obj => obj.prepareBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _abandonBackup_decorators, { kind: "method", name: "abandonBackup", static: false, private: false, access: { has: obj => "abandonBackup" in obj, get: obj => obj.abandonBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approveBackup_decorators, { kind: "method", name: "approveBackup", static: false, private: false, access: { has: obj => "approveBackup" in obj, get: obj => obj.approveBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commitBackup_decorators, { kind: "method", name: "commitBackup", static: false, private: false, access: { has: obj => "commitBackup" in obj, get: obj => obj.commitBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelBackup_decorators, { kind: "method", name: "cancelBackup", static: false, private: false, access: { has: obj => "cancelBackup" in obj, get: obj => obj.cancelBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        backups = __runInitializers(this, _instanceExtraInitializers);
        caller;
        imports;
        runtime;
        constructor(ctx) {
            super(ctx, 'tocktutor-import-export');
            const runtime = ctx.noteVault;
            this.caller = ctx.tockTeamDesktopCaller;
            this.runtime = runtime;
            this.imports = new ReviewedOperationEngine({
                now: Date.now,
                picker: ctx.tockTeamDesktopPicker,
                randomToken: token,
                runtime,
            });
            this.backups = new ReviewedBackupEngine({
                desktop: ctx.tockTeamDesktopPicker,
                now: Date.now,
                randomToken: token,
                runtime,
            });
            ctx.effect(() => async () => {
                await this.imports.dispose();
                await this.backups.dispose();
            });
        }
        async inspect(request, signal) {
            if (!isImportInspectFormat(request.format))
                throw new ImportExportError('unsupported-type');
            const operation = request.format === 'restore-backup' ? 'restore-backup' : 'import-source';
            const identity = await this.claim(request.authorization, operation, signal);
            return await this.imports.inspect({ format: request.format, identity }, signal);
        }
        async abandonImport(request, signal) {
            if (!isImportInspectFormat(request.format))
                throw new ImportExportError('unsupported-type');
            const operation = request.format === 'restore-backup' ? 'restore-backup' : 'import-source';
            const identity = await this.claim(request.authorization, operation, signal, false);
            return await this.imports.abandon({ format: request.format, identity });
        }
        async approveImport(request) {
            return await this.imports.approve(request);
        }
        async commitImport(request, signal) {
            return await this.imports.commit(request, signal);
        }
        async cancelImport(request) {
            return await this.imports.cancel(request);
        }
        async prepareBackup(request, signal) {
            const identity = await this.claim(request.authorization, 'backup', signal);
            return await this.backups.prepare({ identity }, signal);
        }
        async abandonBackup(request, signal) {
            const identity = await this.claim(request.authorization, 'backup', signal, false);
            return await this.backups.abandon({ identity });
        }
        async approveBackup(request) {
            return await this.backups.approve(request);
        }
        async commitBackup(request, signal) {
            return await this.backups.commit(request, signal);
        }
        async cancelBackup(request) {
            return await this.backups.cancel(request);
        }
        async claim(authorization, operation, signal, revalidateRuntime = true) {
            if (typeof authorization !== 'string' || authorization === '' || Buffer.byteLength(authorization, 'utf8') > 1_024) {
                throw new ImportExportError('invalid-plan');
            }
            const identity = await this.caller.claim({ authorization, operation }, signal);
            if (revalidateRuntime) {
                const state = this.runtime.state;
                if (!state.active || identity.vaultId !== state.id || identity.vaultGeneration !== state.generation) {
                    throw new ImportExportError('stale-vault');
                }
            }
            return identity;
        }
    };
})();
export { TockTutorImportExportGateway };
export function apply(ctx) {
    ctx.plugin(TockTutorImportExportGateway);
}
export * from "./archive.js";
export * from "./backup.js";
export * from "./backup-engine.js";
export * from "./core.js";
export * from "./engine.js";
export * from "./types.js";
//# sourceMappingURL=index.js.map