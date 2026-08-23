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
import { ReviewedOperationEngine } from "./engine.js";
export const name = '@tockteam/tocktutor-import-export';
export const inject = ['noteVault', 'tockTeamDesktopPicker'];
function token() {
    return randomBytes(32).toString('base64url');
}
/** Host-only reviewed operation gateway. Native grants never cross a Remote method. */
let TockTutorImportExportGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _inspect_decorators;
    let _approveImport_decorators;
    let _commitImport_decorators;
    let _cancelImport_decorators;
    let _prepareBackup_decorators;
    let _approveBackup_decorators;
    let _commitBackup_decorators;
    let _cancelBackup_decorators;
    return class TockTutorImportExportGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _inspect_decorators = [Remote('inspect')];
            _approveImport_decorators = [Remote('approve-import')];
            _commitImport_decorators = [Remote('commit-import')];
            _cancelImport_decorators = [Remote('cancel-import')];
            _prepareBackup_decorators = [Remote('prepare-backup')];
            _approveBackup_decorators = [Remote('approve-backup')];
            _commitBackup_decorators = [Remote('commit-backup')];
            _cancelBackup_decorators = [Remote('cancel-backup')];
            __esDecorate(this, null, _inspect_decorators, { kind: "method", name: "inspect", static: false, private: false, access: { has: obj => "inspect" in obj, get: obj => obj.inspect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approveImport_decorators, { kind: "method", name: "approveImport", static: false, private: false, access: { has: obj => "approveImport" in obj, get: obj => obj.approveImport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commitImport_decorators, { kind: "method", name: "commitImport", static: false, private: false, access: { has: obj => "commitImport" in obj, get: obj => obj.commitImport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelImport_decorators, { kind: "method", name: "cancelImport", static: false, private: false, access: { has: obj => "cancelImport" in obj, get: obj => obj.cancelImport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prepareBackup_decorators, { kind: "method", name: "prepareBackup", static: false, private: false, access: { has: obj => "prepareBackup" in obj, get: obj => obj.prepareBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approveBackup_decorators, { kind: "method", name: "approveBackup", static: false, private: false, access: { has: obj => "approveBackup" in obj, get: obj => obj.approveBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commitBackup_decorators, { kind: "method", name: "commitBackup", static: false, private: false, access: { has: obj => "commitBackup" in obj, get: obj => obj.commitBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelBackup_decorators, { kind: "method", name: "cancelBackup", static: false, private: false, access: { has: obj => "cancelBackup" in obj, get: obj => obj.cancelBackup }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        backups = __runInitializers(this, _instanceExtraInitializers);
        imports;
        constructor(ctx) {
            super(ctx, 'tocktutor-import-export');
            const runtime = ctx.noteVault;
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
            return await this.imports.inspect(request, signal);
        }
        async approveImport(request) {
            return await this.imports.approve(request);
        }
        async commitImport(request, signal) {
            return await this.imports.commit(request, signal);
        }
        async cancelImport(operationId, sessionId) {
            return await this.imports.cancel(operationId, sessionId);
        }
        async prepareBackup(identity, signal) {
            return await this.backups.prepare({ identity }, signal);
        }
        async approveBackup(request) {
            return await this.backups.approve(request);
        }
        async commitBackup(request, signal) {
            return await this.backups.commit(request, signal);
        }
        async cancelBackup(operationId, sessionId) {
            return await this.backups.cancel(operationId, sessionId);
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