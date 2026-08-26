import { REVIEWED_PENNIVO_READ_TOOLS, } from "./read-tools.js";
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/~-]{7,255}$/u;
const CALL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,511}$/u;
const PROVIDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const MAX_USED_TURNS = 100_000;
const DEFAULT_MAX_ACTIVE_TURNS = 32;
const AVAILABLE_TOOLS = new Set([
    ...REVIEWED_PENNIVO_READ_TOOLS.filter(tool => tool !== 'list_workspaces'),
    'create_file',
    'write_file',
]);
const WRITE_TOOLS = new Set(['create_file', 'write_file']);
const ERROR_MESSAGES = {
    ABORTED: 'The assistant tool call was cancelled.',
    CALL_REPLAY: 'The assistant tool call was already used.',
    CAPACITY: 'The assistant turn registry is full.',
    DISPOSED: 'The assistant turn registry is disposed.',
    INVALID_BINDING: 'The assistant turn binding is invalid.',
    STALE_TURN: 'The assistant turn is no longer current.',
    TOOL_UNAVAILABLE: 'The assistant tool is unavailable for this turn.',
    TURN_REUSED: 'The assistant turn identity was already used.',
};
export class AssistantTurnBindingError extends Error {
    code;
    constructor(code) {
        super(ERROR_MESSAGES[code]);
        this.name = 'AssistantTurnBindingError';
        this.code = code;
    }
}
function failure(code) {
    return new AssistantTurnBindingError(code);
}
function isPlainRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function validAgent(agent, runningOnly = false) {
    if (typeof agent !== 'object' || agent === null)
        return false;
    const value = agent;
    return OPAQUE_ID_PATTERN.test(String(value.id))
        && value.session?.id === value.id
        && (runningOnly ? value.status === 'running' : value.status === 'idle' || value.status === 'running');
}
function parseBinding(value) {
    try {
        if (!isPlainRecord(value)
            || Object.keys(value).some(key => ![
                'agent', 'turnId', 'requestId', 'childInstanceId', 'vaultId', 'vaultGeneration',
                'provider', 'model', 'permission', 'permissionEpoch', 'allowedTools', 'signal',
            ].includes(key))
            || !validAgent(value.agent)
            || typeof value.turnId !== 'string'
            || !OPAQUE_ID_PATTERN.test(value.turnId)
            || typeof value.requestId !== 'string'
            || !OPAQUE_ID_PATTERN.test(value.requestId)
            || typeof value.childInstanceId !== 'string'
            || !OPAQUE_ID_PATTERN.test(value.childInstanceId)
            || typeof value.vaultId !== 'string'
            || !OPAQUE_ID_PATTERN.test(value.vaultId)
            || typeof value.vaultGeneration !== 'number'
            || !Number.isSafeInteger(value.vaultGeneration)
            || value.vaultGeneration < 1
            || typeof value.provider !== 'string'
            || value.provider.length > 128
            || !PROVIDER_PATTERN.test(value.provider)
            || typeof value.model !== 'string'
            || value.model.length > 256
            || !PROVIDER_PATTERN.test(value.model)
            || (value.permission !== 'read-only' && value.permission !== 'propose')
            || typeof value.permissionEpoch !== 'number'
            || !Number.isSafeInteger(value.permissionEpoch)
            || value.permissionEpoch < 0
            || !Array.isArray(value.allowedTools)
            || value.allowedTools.length < 1
            || value.allowedTools.length > AVAILABLE_TOOLS.size
            || !(value.signal instanceof AbortSignal)
            || value.signal.aborted)
            throw failure('INVALID_BINDING');
        const tools = new Set();
        for (const tool of value.allowedTools) {
            if (typeof tool !== 'string' || !AVAILABLE_TOOLS.has(tool) || tools.has(tool)) {
                throw failure('INVALID_BINDING');
            }
            tools.add(tool);
        }
        if (value.permission === 'read-only' && [...tools].some(tool => WRITE_TOOLS.has(tool))) {
            throw failure('INVALID_BINDING');
        }
        return {
            agent: value.agent,
            turnId: value.turnId,
            requestId: value.requestId,
            childInstanceId: value.childInstanceId,
            vaultId: value.vaultId,
            vaultGeneration: value.vaultGeneration,
            provider: value.provider,
            model: value.model,
            permission: value.permission,
            permissionEpoch: value.permissionEpoch,
            allowedTools: [...tools],
            signal: value.signal,
        };
    }
    catch (error) {
        if (error instanceof AssistantTurnBindingError)
            throw error;
        throw failure('INVALID_BINDING');
    }
}
export class AssistantTurnBindingRegistry {
    maxActiveTurns;
    byAgent = new Map();
    byTurn = new Map();
    usedTurns = new Set();
    disposed = false;
    constructor(options = {}) {
        const maximum = options.maxActiveTurns ?? DEFAULT_MAX_ACTIVE_TURNS;
        if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1_000) {
            throw new TypeError('maxActiveTurns must be a positive safe integer no greater than 1000');
        }
        this.maxActiveTurns = maximum;
    }
    get activeCount() {
        return this.byTurn.size;
    }
    begin(value) {
        if (this.disposed)
            throw failure('DISPOSED');
        const binding = parseBinding(value);
        if (this.usedTurns.has(binding.turnId))
            throw failure('TURN_REUSED');
        if (this.usedTurns.size >= MAX_USED_TURNS)
            throw failure('CAPACITY');
        const previous = this.byAgent.get(binding.agent);
        if (previous === undefined && this.byTurn.size >= this.maxActiveTurns)
            throw failure('CAPACITY');
        if (previous !== undefined)
            this.remove(previous);
        this.usedTurns.add(binding.turnId);
        let entry;
        const onAbort = () => { this.remove(entry); };
        entry = {
            agent: binding.agent,
            turnId: binding.turnId,
            childInstanceId: binding.childInstanceId,
            vaultId: binding.vaultId,
            vaultGeneration: binding.vaultGeneration,
            readBinding: Object.freeze({
                vaultId: binding.vaultId,
                vaultGeneration: binding.vaultGeneration,
                childInstanceId: binding.childInstanceId,
                turnId: binding.turnId,
            }),
            requestId: binding.requestId,
            provider: binding.provider,
            model: binding.model,
            permission: binding.permission,
            permissionEpoch: binding.permissionEpoch,
            allowedTools: new Set(binding.allowedTools),
            calls: new Set(),
            cleanups: new Set(),
            signal: binding.signal,
            onAbort,
        };
        this.byAgent.set(entry.agent, entry);
        this.byTurn.set(entry.turnId, entry);
        entry.signal.addEventListener('abort', entry.onAbort, { once: true });
        return Object.freeze({
            turnId: entry.turnId,
            addCleanup: (cleanup) => {
                if (typeof cleanup !== 'function')
                    throw new TypeError('cleanup must be a function');
                if (this.byTurn.get(entry.turnId) !== entry) {
                    cleanup();
                    return;
                }
                entry.cleanups.add(cleanup);
            },
            end: () => { this.remove(entry); },
        });
    }
    agentForTurn(turnId) {
        const entry = this.byTurn.get(turnId);
        if (entry === undefined || entry.signal.aborted || !validAgent(entry.agent))
            return undefined;
        return entry.agent;
    }
    current(agent) {
        if (this.disposed)
            throw failure('DISPOSED');
        const entry = this.byAgent.get(agent);
        if (entry === undefined)
            throw failure('STALE_TURN');
        if (entry.signal.aborted || !validAgent(entry.agent, true)) {
            this.remove(entry);
            throw failure('STALE_TURN');
        }
        return Object.freeze({
            readBinding: entry.readBinding,
            requestId: entry.requestId,
            provider: entry.provider,
            model: entry.model,
            permission: entry.permission,
            permissionEpoch: entry.permissionEpoch,
        });
    }
    resolve(execution) {
        if (this.disposed)
            throw failure('DISPOSED');
        if (!(execution.signal instanceof AbortSignal) || execution.signal.aborted)
            throw failure('ABORTED');
        const callId = String(execution.callId);
        if (!CALL_ID_PATTERN.test(callId) || typeof execution.tool !== 'string')
            throw failure('TOOL_UNAVAILABLE');
        const entry = execution.agent === undefined ? undefined : this.byAgent.get(execution.agent);
        if (entry === undefined)
            throw failure('TOOL_UNAVAILABLE');
        if (entry.signal.aborted || !validAgent(entry.agent, true)) {
            this.remove(entry);
            throw failure('STALE_TURN');
        }
        if (!entry.allowedTools.has(execution.tool)) {
            throw failure('TOOL_UNAVAILABLE');
        }
        if (entry.calls.has(callId))
            throw failure('CALL_REPLAY');
        entry.calls.add(callId);
        return Object.freeze({
            readBinding: entry.readBinding,
            requestId: entry.requestId,
            provider: entry.provider,
            model: entry.model,
            permission: entry.permission,
            permissionEpoch: entry.permissionEpoch,
        });
    }
    isCurrent(binding) {
        const entry = this.byTurn.get(binding.turnId);
        return this.entryIsCurrent(entry, binding);
    }
    isCurrentProposal(binding) {
        const entry = this.byTurn.get(binding.turnId);
        return this.entryIsCurrent(entry, binding)
            && entry?.requestId === binding.requestId
            && entry.provider === binding.provider
            && entry.model === binding.model
            && entry.permission === binding.permission
            && entry.permissionEpoch === binding.permissionEpoch;
    }
    invalidateAgent(agent) {
        const entry = this.byAgent.get(agent);
        if (entry !== undefined)
            this.remove(entry);
    }
    invalidateChild(currentInstanceId) {
        this.invalidate(entry => currentInstanceId === null || entry.childInstanceId !== currentInstanceId);
    }
    invalidateVault(current) {
        this.invalidate(entry => current === null
            || entry.vaultId !== current.id
            || entry.vaultGeneration !== current.generation);
    }
    invalidatePermission(permission, epoch) {
        this.invalidate(entry => entry.permission !== permission || entry.permissionEpoch !== epoch);
    }
    invalidateProvider(provider, model) {
        this.invalidate(entry => provider === null || entry.provider !== provider || (model !== undefined && entry.model !== model));
    }
    end(turnId) {
        const entry = this.byTurn.get(turnId);
        if (entry !== undefined)
            this.remove(entry);
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.invalidate(() => true);
    }
    entryIsCurrent(entry, binding) {
        return !this.disposed
            && entry !== undefined
            && !entry.signal.aborted
            && validAgent(entry.agent, true)
            && entry.childInstanceId === binding.childInstanceId
            && entry.vaultId === binding.vaultId
            && entry.vaultGeneration === binding.vaultGeneration;
    }
    invalidate(predicate) {
        for (const entry of [...this.byTurn.values()]) {
            if (predicate(entry))
                this.remove(entry);
        }
    }
    remove(entry) {
        if (this.byTurn.get(entry.turnId) !== entry)
            return;
        this.byTurn.delete(entry.turnId);
        if (this.byAgent.get(entry.agent) === entry)
            this.byAgent.delete(entry.agent);
        entry.signal.removeEventListener('abort', entry.onAbort);
        entry.calls.clear();
        for (const cleanup of entry.cleanups) {
            entry.cleanups.delete(cleanup);
            try {
                cleanup();
            }
            catch {
                // One cleanup cannot prevent the remaining turn-scoped registrations from unwinding.
            }
        }
    }
}
//# sourceMappingURL=turn-bindings.js.map