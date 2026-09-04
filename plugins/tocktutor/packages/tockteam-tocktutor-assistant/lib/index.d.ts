import { Service, type Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import Schema from '@deepseek-ai/schemastery';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type NoteVaultRuntime from 'tockbot-note-runtime';
import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import { type ApprovalResult } from './approval.ts';
import { type ApprovalContext, type ProposalAuditEntry, type ProposalAuditStatus, type ProposalSummary, type StageProposalInput } from './proposals.ts';
import { type AgentContinuationRequest, type AgentContinuationResult } from './agent-continuation.ts';
import { type AssistantToolName, type AssistantTurnLease } from './turn-bindings.ts';
import { type AssistantRemoteHost } from './remote.ts';
export { buildAssistantPrompt, boundToolText, redactBoundaryText, type AssistantPrompt, type AssistantPromptAttachment, type AssistantPromptHistory, type AssistantPromptInput, } from './context.ts';
export * from './agent-continuation.ts';
export * from './approval.ts';
export * from './proposals.ts';
export * from './production-turns.ts';
export * from './read-tool-registration.ts';
export * from './read-tools.ts';
export * from './remote.ts';
export * from './remote-types.ts';
export * from './text-turn.ts';
export * from './turn-bindings.ts';
export * from './write-tool-registration.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        noteAssistant: NoteAssistant;
        noteVault: NoteVaultRuntime;
        settings: import('@deepseek-ai/dsh-settings').SettingsProvider;
        storageDomain: DomainFacility;
        subprocess: SubprocessRuntime;
    }
}
export type AssistantWritePermission = 'read-only' | 'propose';
export interface BoundAssistantContinuationRequest {
    mode: AgentContinuationRequest['mode'];
    text: string;
}
export interface BindAssistantTurnInput {
    agent: Agent;
    turnId: string;
    requestId: string;
    childInstanceId: string;
    vaultId: string;
    vaultGeneration: number;
    allowedTools: readonly AssistantToolName[];
    signal: AbortSignal;
    requestModelOverride?: true;
}
export interface AssistantSettings {
    provider: string;
    model: string;
    writePermission: AssistantWritePermission;
}
export type Config = AssistantSettings;
export declare const Config: Schema<Config>;
export declare const ASSISTANT_SETTINGS_NAMESPACE = "tocktutor-assistant";
export declare class NoteAssistant extends Service implements AssistantRemoteHost {
    static Config: Schema<AssistantSettings>;
    static inject: string[];
    private readonly agents;
    private readonly noteVault;
    private readonly settings;
    private observedSettings;
    private settingsAbort;
    private childAbort;
    private readonly continuation;
    private readonly pennivoChild;
    private readonly readAdapter;
    private readonly productionTurns;
    private readonly turnBindings;
    private vaultBarrier;
    private permissionEpoch;
    private proposalQueue;
    private readonly proposalAgents;
    private proposalState?;
    private proposalPersistence;
    private readonly decisionTasks;
    private decisionAdmissionOpen;
    private mainTockDriverDispose;
    constructor(ctx: Context, config: Config);
    protected [Service.init](): Promise<void>;
    continueAgent(request: AgentContinuationRequest, signal: AbortSignal): AgentContinuationResult;
    continueBoundAgent(agent: Agent, request: BoundAssistantContinuationRequest, signal: AbortSignal): AgentContinuationResult;
    bindAgentTurn(input: BindAssistantTurnInput): AssistantTurnLease;
    private syncMainTockDriverTools;
    private mainTockDriverFacts;
    private stageMainTockDriverProposal;
    private stageMainTockDriverWrite;
    private organizeMainTockDriverCapture;
    private stageBoundProposal;
    private persistProposalState;
    private scheduleProposalPersistence;
    private restoredCreateTargetExists;
    private restoredProposalMismatch;
    private observeSettings;
    private quiesceChild;
    private assertCurrentChildBinding;
    private bindProductionTurn;
    private productionRequestConfig;
    currentSettings(): AssistantSettings;
    saveSettings(settings: AssistantSettings): Promise<void>;
    stageProposal(input: StageProposalInput): Promise<ProposalSummary>;
    listProposals(): Promise<ProposalSummary[]>;
    invalidateProposals(context: ApprovalContext): Promise<number>;
    private ensurePennivoChild;
    private listPennivoTools;
    private stopPennivoChild;
    private activePennivoChild;
    approveProposal(proposalId: string, signal: AbortSignal): Promise<ApprovalResult>;
    rejectProposal(proposalId: string, reason: string): Promise<Pick<ProposalSummary, 'proposalId' | 'auditCorrelationId'>>;
    proposalAudit(): Promise<ProposalAuditEntry[]>;
    proposalAuditStatus(): Promise<ProposalAuditStatus>;
}
export default NoteAssistant;
//# sourceMappingURL=index.d.ts.map