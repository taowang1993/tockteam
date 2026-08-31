import type { Agent } from '@deepseek-ai/dsh-agent';
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type ProposalSummary, type StageProposalInput } from './proposals.ts';
import type { AssistantReadToolExecutor } from './read-tool-registration.ts';
import { type AssistantTurnBindingRegistry, type AssistantToolName } from './turn-bindings.ts';
export interface AssistantProposalStager {
    stage(input: StageProposalInput): Promise<Pick<ProposalSummary, 'proposalId' | 'auditCorrelationId'> & Partial<Pick<ProposalSummary, 'createdAt'>>>;
}
export interface TockDriverWriteResult {
    id: string;
    status: 'pending_review';
    source: 'tockdriver';
    approvalQueue: 'tockdriver-notes';
    inlineAssistantMcp: false;
    vaultId: string;
    relativePath: string;
    title: string;
    operation: 'create' | 'update';
    createdAt: number;
}
export interface TockDriverStageWriteArguments {
    vaultId?: string;
    path: string;
    content: string;
    operation: 'create' | 'update';
}
export declare function notesWriteArguments(value: unknown): TockDriverStageWriteArguments;
export interface TockDriverOrganizeArguments {
    vaultId?: string;
    path: string;
}
export declare function organizeCaptureArguments(value: unknown): TockDriverOrganizeArguments;
export declare function organizedCaptureContent(sourcePath: string, sourceMarkdown: string, organizedAt: Date): {
    title: string;
    destination: string;
    content: string;
};
export declare function publicTockDriverWriteResult(summary: Pick<ProposalSummary, 'proposalId'> & Partial<Pick<ProposalSummary, 'createdAt'>>, binding: {
    vaultId: string;
}, path: string, title: string, operation: 'create' | 'update'): TockDriverWriteResult;
export declare function registerAssistantWriteTools(agent: Agent, reader: AssistantReadToolExecutor, stager: AssistantProposalStager, turns: AssistantTurnBindingRegistry, allowedTools: readonly AssistantToolName[]): () => void;
export interface MainTockDriverWriteHost {
    organize(args: TockDriverOrganizeArguments, signal: AbortSignal): Promise<TockDriverWriteResult>;
    stage(args: TockDriverStageWriteArguments, signal: AbortSignal): Promise<TockDriverWriteResult>;
}
/** Register the durable reviewed-write aliases for ordinary DSH agents. */
export declare function registerMainTockDriverWriteTools(tools: {
    register(definition: ToolDefinition): () => void;
}, host: MainTockDriverWriteHost): () => void;
//# sourceMappingURL=write-tool-registration.d.ts.map