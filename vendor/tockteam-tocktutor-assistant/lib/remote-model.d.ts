/**
 * Typert reflection source only. Runtime behavior lives in remote.ts so Node can
 * execute source-based tests without parsing decorator syntax.
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { AssistantApprovalRequest, AssistantApprovalView, AssistantAuditResult, AssistantDecisionView, AssistantPageRequest, AssistantProposalListResult, AssistantRejectionRequest, AssistantSettingsView, AssistantTurnRequest, AssistantTurnResult } from './remote-types.ts';
export declare class TockTutorAssistantRemoteModel extends TypertRemoteService {
    constructor(ctx: Context);
    currentSettings(signal: AbortSignal): Promise<AssistantSettingsView>;
    saveSettings(request: AssistantSettingsView, signal: AbortSignal): Promise<AssistantSettingsView>;
    continueTurn(request: AssistantTurnRequest, signal: AbortSignal): Promise<AssistantTurnResult>;
    listProposals(request: AssistantPageRequest, signal: AbortSignal): Promise<AssistantProposalListResult>;
    approveProposal(request: AssistantApprovalRequest, signal: AbortSignal): Promise<AssistantApprovalView>;
    rejectProposal(request: AssistantRejectionRequest, signal: AbortSignal): Promise<AssistantDecisionView>;
    audit(request: AssistantPageRequest, signal: AbortSignal): Promise<AssistantAuditResult>;
}
//# sourceMappingURL=remote-model.d.ts.map