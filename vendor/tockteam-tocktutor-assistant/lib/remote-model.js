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
import { Remote, RemoteScope, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
let TockTutorAssistantRemoteModel = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _currentSettings_decorators;
    let _saveSettings_decorators;
    let _continueTurn_decorators;
    let _listProposals_decorators;
    let _approveProposal_decorators;
    let _rejectProposal_decorators;
    let _audit_decorators;
    return class TockTutorAssistantRemoteModel extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _currentSettings_decorators = [Remote];
            _saveSettings_decorators = [Remote];
            _continueTurn_decorators = [RemoteScope('agent')];
            _listProposals_decorators = [Remote];
            _approveProposal_decorators = [Remote];
            _rejectProposal_decorators = [Remote];
            _audit_decorators = [Remote];
            __esDecorate(this, null, _currentSettings_decorators, { kind: "method", name: "currentSettings", static: false, private: false, access: { has: obj => "currentSettings" in obj, get: obj => obj.currentSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _saveSettings_decorators, { kind: "method", name: "saveSettings", static: false, private: false, access: { has: obj => "saveSettings" in obj, get: obj => obj.saveSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _continueTurn_decorators, { kind: "method", name: "continueTurn", static: false, private: false, access: { has: obj => "continueTurn" in obj, get: obj => obj.continueTurn }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listProposals_decorators, { kind: "method", name: "listProposals", static: false, private: false, access: { has: obj => "listProposals" in obj, get: obj => obj.listProposals }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approveProposal_decorators, { kind: "method", name: "approveProposal", static: false, private: false, access: { has: obj => "approveProposal" in obj, get: obj => obj.approveProposal }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _rejectProposal_decorators, { kind: "method", name: "rejectProposal", static: false, private: false, access: { has: obj => "rejectProposal" in obj, get: obj => obj.rejectProposal }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _audit_decorators, { kind: "method", name: "audit", static: false, private: false, access: { has: obj => "audit" in obj, get: obj => obj.audit }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            super(ctx, 'tocktutorAssistant');
            __runInitializers(this, _instanceExtraInitializers);
        }
        async currentSettings(signal) {
            throw new Error('Typert reflection model is not executable.');
        }
        async saveSettings(request, signal) {
            throw new Error('Typert reflection model is not executable.');
        }
        async continueTurn(request, signal) {
            throw new Error('Typert reflection model is not executable.');
        }
        async listProposals(request, signal) {
            throw new Error('Typert reflection model is not executable.');
        }
        async approveProposal(request, signal) {
            throw new Error('Typert reflection model is not executable.');
        }
        async rejectProposal(request, signal) {
            throw new Error('Typert reflection model is not executable.');
        }
        async audit(request, signal) {
            throw new Error('Typert reflection model is not executable.');
        }
    };
})();
export { TockTutorAssistantRemoteModel };
//# sourceMappingURL=remote-model.js.map