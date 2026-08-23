import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { AssistantApprovalRequest, AssistantApprovalView, AssistantAuditResult, AssistantDecisionView, AssistantPageRequest, AssistantProposalListResult, AssistantRejectionRequest, AssistantRemoteAuditOutcome, AssistantRemoteOperation, AssistantSettingsView, AssistantTurnRequest, AssistantTurnResult } from './remote-types.ts';
export type * from './remote-types.ts';
interface HostProposal {
    proposalId: string;
    auditCorrelationId: string;
    createdAt: number;
    expiresAt: number;
    destination: string;
    operation: AssistantRemoteOperation;
    contentBytes: number;
    contentChars: number;
    preview: string;
    warnings: string[];
    skippedEntries: string[];
}
interface HostApprovalResult {
    proposalId: string;
    auditCorrelationId: string;
    operation: AssistantRemoteOperation;
    path: string;
    snapshotCaptured: boolean;
    status: 'created' | 'saved';
}
interface HostAuditEntry {
    auditId: string;
    auditCorrelationId: string;
    proposalId: string;
    timestamp: number;
    outcome: AssistantRemoteAuditOutcome;
    destination: string;
    operation: AssistantRemoteOperation;
    contentBytes: number;
    reason?: string;
}
/** Narrow structural seam from the Remote gateway to the Host-private service. */
export interface AssistantRemoteHost {
    currentSettings(): AssistantSettingsView;
    saveSettings(settings: AssistantSettingsView): Promise<void>;
    continueBoundAgent(agent: Agent, request: AssistantTurnRequest, signal: AbortSignal): {
        mode: AssistantTurnResult['mode'];
        redacted: boolean;
        truncated: boolean;
    };
    listProposals(): Promise<HostProposal[]>;
    approveProposal(proposalId: string, signal: AbortSignal): Promise<HostApprovalResult>;
    rejectProposal(proposalId: string, reason: string): Promise<AssistantDecisionView>;
    proposalAudit(): Promise<HostAuditEntry[]>;
    proposalAuditStatus(): Promise<{
        entries: number;
        dropped: number;
    }>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        tocktutorAssistant: TockTutorAssistantGateway;
    }
}
/** Browser-safe Remote gateway over the Host-owned assistant service. */
export declare class TockTutorAssistantGateway extends TypertRemoteService {
    static inject: string[];
    private readonly assistant;
    constructor(ctx: Context);
    currentSettings(signal: AbortSignal): Promise<AssistantSettingsView>;
    saveSettings(request: AssistantSettingsView, signal: AbortSignal): Promise<AssistantSettingsView>;
    continueTurn(request: AssistantTurnRequest, signal: AbortSignal): Promise<AssistantTurnResult>;
    listProposals(request: AssistantPageRequest, signal: AbortSignal): Promise<AssistantProposalListResult>;
    approveProposal(request: AssistantApprovalRequest, signal: AbortSignal): Promise<AssistantApprovalView>;
    rejectProposal(request: AssistantRejectionRequest, signal: AbortSignal): Promise<AssistantDecisionView>;
    audit(request: AssistantPageRequest, signal: AbortSignal): Promise<AssistantAuditResult>;
}
//# sourceMappingURL=remote.d.ts.map