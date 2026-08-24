import type { Agent } from '@deepseek-ai/dsh-agent';
import { type ProposalSummary, type StageProposalInput } from './proposals.ts';
import type { AssistantReadToolExecutor } from './read-tool-registration.ts';
import { type AssistantTurnBindingRegistry, type AssistantToolName } from './turn-bindings.ts';
export interface AssistantProposalStager {
    stage(input: StageProposalInput): Promise<Pick<ProposalSummary, 'proposalId' | 'auditCorrelationId'>>;
}
export declare function registerAssistantWriteTools(agent: Agent, reader: AssistantReadToolExecutor, stager: AssistantProposalStager, turns: AssistantTurnBindingRegistry, allowedTools: readonly AssistantToolName[]): () => void;
//# sourceMappingURL=write-tool-registration.d.ts.map