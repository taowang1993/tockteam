import { Service } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { settingsNamespace, } from '@deepseek-ai/dsh-settings';
import { ProposalApprovalExecutor, } from "./approval.js";
import { ProposalQueue, } from "./proposals.js";
import { AssistantProposalStateStore } from "./proposal-state.js";
import { AgentContinuationRouter, } from "./agent-continuation.js";
import { registerAssistantReadTools } from "./read-tool-registration.js";
import { PennivoReadAdapter, REVIEWED_PENNIVO_READ_TOOLS, } from "./read-tools.js";
import { AssistantTurnBindingError, AssistantTurnBindingRegistry, } from "./turn-bindings.js";
import { registerAssistantWriteTools } from "./write-tool-registration.js";
import { TockTutorAssistantGateway, } from "./remote.js";
import { PennivoChildManager, } from "./pennivo-child.js";
import { ProductionAssistantTurnBinder, } from "./production-turns.js";
export { buildAssistantPrompt, boundToolText, redactBoundaryText, } from "./context.js";
export * from "./agent-continuation.js";
export * from "./approval.js";
export * from "./proposals.js";
export * from "./production-turns.js";
export * from "./read-tool-registration.js";
export * from "./read-tools.js";
export * from "./remote.js";
export * from "./remote-types.js";
export * from "./text-turn.js";
export * from "./turn-bindings.js";
export * from "./write-tool-registration.js";
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
export const Config = Schema.object({
    provider: Schema.string().min(1).max(128).pattern(IDENTIFIER_PATTERN).default('deepseek-official'),
    model: Schema.string().min(1).max(256).pattern(IDENTIFIER_PATTERN).default('deepseek-v4-flash'),
    writePermission: Schema.union([
        Schema.const('read-only'),
        Schema.const('propose'),
    ]).default('read-only'),
});
export const ASSISTANT_SETTINGS_NAMESPACE = settingsNamespace('tocktutor-assistant');
export class NoteAssistant extends Service {
    static Config = Config;
    static inject = ['agents', 'noteVault', 'settings', 'storageDomain', 'subprocess', 'tools'];
    agents;
    noteVault;
    settings;
    observedSettings;
    settingsAbort = new AbortController();
    childAbort = new AbortController();
    continuation;
    pennivoChild;
    readAdapter;
    productionTurns;
    turnBindings = new AssistantTurnBindingRegistry();
    vaultBarrier = Promise.resolve();
    permissionEpoch = 0;
    proposalQueue = new ProposalQueue();
    proposalAgents = new Map();
    proposalState;
    proposalPersistence = Promise.resolve();
    decisionTasks = new Set();
    decisionAdmissionOpen = true;
    constructor(ctx, config) {
        super(ctx, 'noteAssistant');
        this.agents = ctx.agents;
        this.noteVault = ctx.noteVault;
        this.settings = ctx.settings.register(ASSISTANT_SETTINGS_NAMESPACE, Config, { base: config });
        this.observedSettings = { ...this.settings.get() };
        this.continuation = new AgentContinuationRouter(ctx.agents, (agentId, agent) => agent.id === agentId && this.agents.get(agent.id) === agent);
        this.pennivoChild = new PennivoChildManager(ctx.subprocess, {
            onInstanceChange: instanceId => {
                this.childAbort.abort(new Error('Assistant child changed.'));
                this.childAbort = new AbortController();
                this.proposalQueue.invalidateForChild(instanceId);
                this.scheduleProposalPersistence();
                this.turnBindings.invalidateChild(instanceId);
            },
        });
        this.readAdapter = new PennivoReadAdapter(ctx.noteVault, binding => this.turnBindings.isCurrent(binding));
        this.productionTurns = new ProductionAssistantTurnBinder({
            bind: (agent, turn, messageId, signal) => this.bindProductionTurn(agent, turn, messageId, signal),
            requestConfig: (agent, turn, signal, config) => this.productionRequestConfig(agent, turn, signal, config),
        });
        ctx.on('settings/updated', (namespace) => {
            if (namespace === ASSISTANT_SETTINGS_NAMESPACE)
                this.observeSettings(this.settings.get());
        });
        ctx.plugin(TockTutorAssistantGateway);
        ctx.on('note-vault/change', event => {
            this.turnBindings.invalidateVault(event.vault);
            this.proposalQueue.invalidateVault(event.vault);
            this.scheduleProposalPersistence();
            if (event.action !== 'activated')
                return;
            this.productionTurns.invalidateAll();
            this.quiesceChild();
        });
        ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
            this.productionTurns.onClaimed(agent, message, turn);
        });
        ctx.on('agent/inbox/discarded', ({ agent, message }) => {
            this.productionTurns.onDiscarded(agent, message);
        });
        ctx.on('agent/pre-step', (payload, next) => this.productionTurns.onPreStep(payload, next));
        ctx.on('agent/request', (payload, next) => this.productionTurns.onRequest(payload, next));
        ctx.on('agent/turn-stopping', ({ agent, turn }) => {
            this.productionTurns.onTurnStopping(agent, turn);
        });
        ctx.on('agent/status', ({ agent, status }) => {
            if (status === 'idle') {
                this.productionTurns.invalidateAgent(agent);
                this.turnBindings.invalidateAgent(agent);
            }
        });
        ctx.on('agent/disposed', ({ agent }) => {
            this.productionTurns.invalidateAgent(agent);
            this.turnBindings.invalidateAgent(agent);
        });
        ctx.effect(() => async () => {
            this.decisionAdmissionOpen = false;
            this.settingsAbort.abort(new Error('Assistant settings disposed.'));
            this.childAbort.abort(new Error('Assistant child disposed.'));
            this.productionTurns.dispose();
            this.turnBindings.dispose();
            await this.vaultBarrier.catch(() => undefined);
            await this.pennivoChild.dispose();
            await Promise.allSettled(this.decisionTasks);
            await this.proposalPersistence;
            await this.proposalState?.close();
        }, 'tocktutor-assistant Host lifecycle');
    }
    async [Service.init]() {
        this.proposalState = await AssistantProposalStateStore.open(this.ctx.storageDomain);
        const restored = this.proposalState.load();
        this.permissionEpoch = restored.permissionEpoch;
        this.proposalQueue = restored.queue;
        this.proposalAgents.clear();
        await this.proposalQueue.invalidateRestored(proposal => this.restoredProposalMismatch(proposal));
        await this.persistProposalState();
    }
    continueAgent(request, signal) {
        return this.continuation.route(request, signal);
    }
    continueBoundAgent(agent, request, signal) {
        if (this.agents.get(agent.id) !== agent
            || (agent.status !== 'idle' && agent.status !== 'running'))
            throw new AssistantTurnBindingError('STALE_TURN');
        return this.continuation.route({ ...request, agentId: agent.id }, signal, (resolved, message) => this.productionTurns.reserve(resolved, message.id));
    }
    bindAgentTurn(input) {
        this.observeSettings(this.settings.get());
        const settings = this.settings.get();
        const child = this.pennivoChild.active();
        const vault = this.noteVault.state;
        if (this.agents.get(input.agent.id) !== input.agent
            || (input.requestModelOverride !== true && (input.agent.options.provider !== settings.provider
                || input.agent.options.model !== settings.model))
            || child === null
            || child.instanceId !== input.childInstanceId
            || child.binding.vaultId !== input.vaultId
            || child.binding.vaultGeneration !== input.vaultGeneration
            || child.binding.writePermission !== settings.writePermission
            || !vault.active
            || vault.id !== input.vaultId
            || vault.generation !== input.vaultGeneration)
            throw new AssistantTurnBindingError('STALE_TURN');
        const { requestModelOverride: _requestModelOverride, ...bindingInput } = input;
        const lease = this.turnBindings.begin({
            ...bindingInput,
            provider: settings.provider,
            model: settings.model,
            permission: settings.writePermission,
            permissionEpoch: this.permissionEpoch,
        });
        try {
            const readTools = input.allowedTools.filter((tool) => (REVIEWED_PENNIVO_READ_TOOLS.includes(tool) && tool !== 'list_workspaces'));
            const writeTools = input.allowedTools.filter(tool => (tool === 'create_file'
                || tool === 'write_file'
                || tool === 'notes_stage_write'
                || tool === 'notes_organize_capture'));
            if (readTools.length > 0) {
                lease.addCleanup(registerAssistantReadTools(input.agent, this.readAdapter, this.turnBindings, readTools));
            }
            if (writeTools.length > 0) {
                lease.addCleanup(registerAssistantWriteTools(input.agent, this.readAdapter, { stage: proposal => this.stageBoundProposal(proposal) }, this.turnBindings, writeTools));
            }
            const currentChild = this.pennivoChild.active();
            const currentVault = this.noteVault.state;
            const currentSettings = this.settings.get();
            if (currentChild === null
                || currentChild.instanceId !== input.childInstanceId
                || currentChild.binding.vaultId !== input.vaultId
                || currentChild.binding.vaultGeneration !== input.vaultGeneration
                || currentChild.binding.writePermission !== settings.writePermission
                || !currentVault.active
                || currentVault.id !== input.vaultId
                || currentVault.generation !== input.vaultGeneration
                || currentSettings.provider !== settings.provider
                || currentSettings.model !== settings.model
                || currentSettings.writePermission !== settings.writePermission)
                throw new AssistantTurnBindingError('STALE_TURN');
            return lease;
        }
        catch (error) {
            lease.end();
            throw error;
        }
    }
    async stageBoundProposal(proposal) {
        this.observeSettings(this.settings.get());
        if (!this.turnBindings.isCurrentProposal({
            vaultId: proposal.vaultId,
            vaultGeneration: proposal.vaultGeneration,
            childInstanceId: proposal.childInstanceId,
            turnId: proposal.turnId,
            requestId: proposal.requestId,
            provider: proposal.provider,
            model: proposal.model,
            permission: proposal.writePermission,
            permissionEpoch: proposal.permissionEpoch,
        }))
            throw new AssistantTurnBindingError('STALE_TURN');
        const agent = this.turnBindings.agentForTurn(proposal.turnId);
        const summary = this.proposalQueue.stage(proposal);
        if (agent !== undefined) {
            if (this.proposalAgents.size >= 100)
                this.proposalAgents.clear();
            this.proposalAgents.set(summary.proposalId, agent);
        }
        await this.persistProposalState();
        return summary;
    }
    persistProposalState() {
        const store = this.proposalState;
        if (store === undefined)
            return Promise.reject(new Error('Assistant proposal state is unavailable.'));
        const serialized = this.proposalQueue.serialize();
        const permissionEpoch = this.permissionEpoch;
        const operation = this.proposalPersistence.then(() => store.saveSerialized(serialized, permissionEpoch));
        this.proposalPersistence = operation.catch(() => undefined);
        return operation;
    }
    scheduleProposalPersistence() {
        if (this.proposalState === undefined)
            return;
        void this.persistProposalState().catch(() => undefined);
    }
    async restoredProposalMismatch(proposal) {
        const state = this.noteVault.state;
        if (!state.active
            || state.id !== proposal.vaultId
            || state.generation !== proposal.vaultGeneration)
            return 'STALE_VAULT';
        const expectedVault = { id: proposal.vaultId, generation: proposal.vaultGeneration };
        const signal = new AbortController().signal;
        if (proposal.source !== undefined) {
            try {
                const source = await this.noteVault.openDocument(proposal.source.relativePath, expectedVault, signal);
                if (source.revision !== proposal.source.identity
                    || source.digest !== `sha256:${proposal.source.contentDigest}`)
                    return 'SOURCE_CHANGED';
            }
            catch {
                return 'SOURCE_CHANGED';
            }
        }
        try {
            const target = await this.noteVault.openDocument(proposal.destination, expectedVault, signal);
            if (proposal.operation === 'create'
                || target.revision !== proposal.expectedTarget.identity)
                return 'TARGET_CHANGED';
        }
        catch (error) {
            const code = error instanceof Error
                ? error.code
                : undefined;
            if (proposal.operation === 'update' || code !== 'not-found')
                return 'TARGET_CHANGED';
        }
        const settings = this.settings.get();
        this.observeSettings(settings);
        if (settings.writePermission !== proposal.writePermission
            || this.permissionEpoch !== proposal.permissionEpoch)
            return 'PERMISSION_CHANGED';
        if (settings.provider !== proposal.provider || settings.model !== proposal.model) {
            return 'PROVIDER_MISMATCH';
        }
        if (!this.turnBindings.isCurrentProposal({
            vaultId: proposal.vaultId,
            vaultGeneration: proposal.vaultGeneration,
            childInstanceId: proposal.childInstanceId,
            turnId: proposal.turnId,
            requestId: proposal.requestId,
            provider: proposal.provider,
            model: proposal.model,
            permission: proposal.writePermission,
            permissionEpoch: proposal.permissionEpoch,
        }))
            return 'TURN_MISMATCH';
        if (this.pennivoChild.active()?.instanceId !== proposal.childInstanceId)
            return 'CHILD_REPLACED';
        return undefined;
    }
    observeSettings(next) {
        const previous = this.observedSettings;
        const providerChanged = next.provider !== previous.provider || next.model !== previous.model;
        const permissionChanged = next.writePermission !== previous.writePermission;
        if (!providerChanged && !permissionChanged)
            return;
        this.observedSettings = { ...next };
        this.settingsAbort.abort(new Error('Assistant settings changed.'));
        this.settingsAbort = new AbortController();
        this.productionTurns.invalidateAll();
        if (providerChanged) {
            this.proposalQueue.invalidateProvider(next.provider, next.model);
            this.scheduleProposalPersistence();
            this.turnBindings.invalidateProvider(next.provider, next.model);
        }
        if (permissionChanged) {
            this.permissionEpoch += 1;
            this.proposalQueue.invalidatePermission(next.writePermission, this.permissionEpoch);
            this.scheduleProposalPersistence();
            this.turnBindings.invalidatePermission(next.writePermission, this.permissionEpoch);
            this.quiesceChild();
        }
    }
    quiesceChild() {
        const previous = this.vaultBarrier;
        const stopping = this.pennivoChild.stop();
        const quiescence = Promise.all([previous, stopping]).then(() => undefined);
        this.vaultBarrier = quiescence;
        return quiescence;
    }
    assertCurrentChildBinding(binding) {
        const state = this.noteVault.state;
        const settings = this.settings.get();
        this.observeSettings(settings);
        if (!state.active
            || state.id !== binding.vaultId
            || state.generation !== binding.vaultGeneration
            || settings.writePermission !== binding.writePermission)
            throw new AssistantTurnBindingError('STALE_TURN');
    }
    async bindProductionTurn(agent, _turn, messageId, signal) {
        this.observeSettings(this.settings.get());
        try {
            await this.vaultBarrier;
        }
        catch {
            throw new AssistantTurnBindingError('STALE_TURN');
        }
        if (signal.aborted || this.agents.get(agent.id) !== agent || agent.status !== 'running') {
            throw new AssistantTurnBindingError('STALE_TURN');
        }
        const settings = this.settings.get();
        const vault = this.noteVault.state;
        if (!vault.active)
            throw new AssistantTurnBindingError('STALE_TURN');
        const child = await this.pennivoChild.ensure({
            vaultId: vault.id,
            vaultGeneration: vault.generation,
            writePermission: settings.writePermission,
        });
        const currentSettings = this.settings.get();
        this.observeSettings(currentSettings);
        const currentVault = this.noteVault.state;
        if (signal.aborted
            || this.agents.get(agent.id) !== agent
            || agent.status !== 'running'
            || currentSettings.provider !== settings.provider
            || currentSettings.model !== settings.model
            || currentSettings.writePermission !== settings.writePermission
            || !currentVault.active
            || currentVault.id !== vault.id
            || currentVault.generation !== vault.generation
            || child.binding.vaultId !== vault.id
            || child.binding.vaultGeneration !== vault.generation
            || child.binding.writePermission !== settings.writePermission)
            throw new AssistantTurnBindingError('STALE_TURN');
        const allowedTools = [
            ...REVIEWED_PENNIVO_READ_TOOLS.filter(tool => tool !== 'list_workspaces'),
            'notes_search',
            'notes_read',
            ...(settings.writePermission === 'propose'
                ? ['create_file', 'write_file', 'notes_stage_write', 'notes_organize_capture']
                : []),
        ];
        return {
            lease: this.bindAgentTurn({
                agent,
                turnId: messageId,
                requestId: messageId,
                childInstanceId: child.instanceId,
                vaultId: vault.id,
                vaultGeneration: vault.generation,
                allowedTools,
                signal,
                requestModelOverride: true,
            }),
        };
    }
    productionRequestConfig(agent, _turn, signal, config) {
        this.observeSettings(this.settings.get());
        if (signal.aborted)
            throw new AssistantTurnBindingError('STALE_TURN');
        const binding = this.turnBindings.current(agent);
        const settings = this.settings.get();
        const child = this.pennivoChild.active();
        const vault = this.noteVault.state;
        if (binding.provider !== settings.provider
            || binding.model !== settings.model
            || binding.permission !== settings.writePermission
            || binding.permissionEpoch !== this.permissionEpoch
            || child === null
            || child.instanceId !== binding.readBinding.childInstanceId
            || child.binding.vaultId !== binding.readBinding.vaultId
            || child.binding.vaultGeneration !== binding.readBinding.vaultGeneration
            || child.binding.writePermission !== binding.permission
            || !vault.active
            || vault.id !== binding.readBinding.vaultId
            || vault.generation !== binding.readBinding.vaultGeneration)
            throw new AssistantTurnBindingError('STALE_TURN');
        return { ...config, provider: settings.provider, model: settings.model };
    }
    currentSettings() {
        const current = this.settings.get();
        this.observeSettings(current);
        return { ...current };
    }
    async saveSettings(settings) {
        await this.settings.replace(settings);
        this.observeSettings(this.settings.get());
        await this.proposalPersistence;
    }
    stageProposal(input) {
        return this.stageBoundProposal(input);
    }
    async listProposals() {
        const proposals = this.proposalQueue.list();
        const pending = new Set(proposals.map(proposal => proposal.proposalId));
        for (const proposalId of this.proposalAgents.keys()) {
            if (!pending.has(proposalId))
                this.proposalAgents.delete(proposalId);
        }
        await this.persistProposalState();
        return proposals;
    }
    async invalidateProposals(context) {
        const invalidated = this.proposalQueue.invalidateMismatched(context);
        await this.persistProposalState();
        return invalidated;
    }
    async ensurePennivoChild(binding) {
        await this.vaultBarrier;
        this.assertCurrentChildBinding(binding);
        const info = await this.pennivoChild.ensure(binding);
        await this.vaultBarrier;
        this.assertCurrentChildBinding(binding);
        if (info.binding.vaultId !== binding.vaultId
            || info.binding.vaultGeneration !== binding.vaultGeneration
            || info.binding.writePermission !== binding.writePermission)
            throw new AssistantTurnBindingError('STALE_TURN');
        return info;
    }
    async listPennivoTools(binding) {
        await this.vaultBarrier;
        this.assertCurrentChildBinding(binding);
        const tools = await this.pennivoChild.listTools(binding);
        await this.vaultBarrier;
        this.assertCurrentChildBinding(binding);
        return tools;
    }
    stopPennivoChild() {
        return this.quiesceChild();
    }
    activePennivoChild() {
        return this.pennivoChild.active();
    }
    approveProposal(proposalId, signal) {
        if (!this.decisionAdmissionOpen) {
            return Promise.reject(new Error('The assistant is unloading.'));
        }
        this.observeSettings(this.settings.get());
        const settingsSignal = this.settingsAbort.signal;
        const childSignal = this.childAbort.signal;
        const proposal = this.proposalQueue.list().find(candidate => candidate.proposalId === proposalId);
        const executor = new ProposalApprovalExecutor(this.proposalQueue, this.noteVault, () => {
            const state = this.noteVault.state;
            const settings = this.settings.get();
            this.observeSettings(settings);
            return {
                vaultId: state.active ? state.id : 'inactive-vault',
                vaultGeneration: state.generation,
                childInstanceId: this.pennivoChild.active()?.instanceId ?? 'missing-child',
                turnId: proposal?.turnId ?? 'missing-turn',
                requestId: proposal?.requestId ?? 'missing-request',
                provider: settings.provider,
                model: settings.model,
                writePermission: settings.writePermission,
                permissionEpoch: this.permissionEpoch,
            };
        }, () => this.persistProposalState());
        const decisionSignal = AbortSignal.any([signal, settingsSignal, childSignal]);
        const task = executor.approve(proposalId, decisionSignal).then(result => {
            const agent = this.proposalAgents.get(proposalId);
            this.proposalAgents.delete(proposalId);
            if (agent !== undefined && !decisionSignal.aborted) {
                try {
                    this.continueBoundAgent(agent, {
                        mode: 'followup',
                        text: `TockTutor write proposal ${proposalId} was approved with status ${result.status}.`,
                    }, decisionSignal);
                }
                catch { /* A stale originating Agent does not roll back an approved vault write. */ }
            }
            return result;
        });
        this.decisionTasks.add(task);
        return task.finally(() => { this.decisionTasks.delete(task); });
    }
    rejectProposal(proposalId, reason) {
        if (!this.decisionAdmissionOpen) {
            return Promise.reject(new Error('The assistant is unloading.'));
        }
        const task = (async () => {
            const result = this.proposalQueue.reject(proposalId, reason);
            await this.persistProposalState();
            const agent = this.proposalAgents.get(proposalId);
            this.proposalAgents.delete(proposalId);
            if (agent !== undefined) {
                try {
                    this.continueBoundAgent(agent, {
                        mode: 'followup',
                        text: `TockTutor write proposal ${proposalId} was rejected by the user.`,
                    }, new AbortController().signal);
                }
                catch { /* A stale originating Agent has nothing left to resume. */ }
            }
            return result;
        })();
        this.decisionTasks.add(task);
        return task.finally(() => { this.decisionTasks.delete(task); });
    }
    async proposalAudit() {
        await this.proposalPersistence;
        return this.proposalQueue.audit();
    }
    async proposalAuditStatus() {
        await this.proposalPersistence;
        return this.proposalQueue.auditStatus();
    }
}
export default NoteAssistant;
//# sourceMappingURL=index.js.map