import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CallId } from '@deepseek-ai/dsh-llm';
import { type PennivoReadTool, type ReadBinding } from './read-tools.ts';
export type AssistantToolName = PennivoReadTool | 'create_file' | 'write_file';
export type AssistantTurnPermission = 'read-only' | 'propose';
export interface AssistantTurnBindingInput {
    agent: Agent;
    turnId: string;
    requestId: string;
    childInstanceId: string;
    vaultId: string;
    vaultGeneration: number;
    provider: string;
    model: string;
    permission: AssistantTurnPermission;
    permissionEpoch: number;
    allowedTools: readonly AssistantToolName[];
    signal: AbortSignal;
}
export interface AssistantProposalBinding extends ReadBinding {
    requestId: string;
    provider: string;
    model: string;
    permission: AssistantTurnPermission;
    permissionEpoch: number;
}
export interface AssistantToolExecutionIdentity {
    agent?: Agent;
    callId: CallId;
    signal: AbortSignal;
    tool: string;
}
export interface ResolvedAssistantTurn {
    readBinding: ReadBinding;
    requestId: string;
    provider: string;
    model: string;
    permission: AssistantTurnPermission;
    permissionEpoch: number;
}
export interface AssistantTurnLease {
    turnId: string;
    addCleanup(cleanup: () => void): void;
    end(): void;
}
export type AssistantTurnBindingErrorCode = 'ABORTED' | 'CALL_REPLAY' | 'CAPACITY' | 'DISPOSED' | 'INVALID_BINDING' | 'STALE_TURN' | 'TOOL_UNAVAILABLE' | 'TURN_REUSED';
export declare class AssistantTurnBindingError extends Error {
    readonly code: AssistantTurnBindingErrorCode;
    constructor(code: AssistantTurnBindingErrorCode);
}
export declare class AssistantTurnBindingRegistry {
    private readonly maxActiveTurns;
    private readonly byAgent;
    private readonly byTurn;
    private readonly usedTurns;
    private disposed;
    constructor(options?: {
        maxActiveTurns?: number;
    });
    get activeCount(): number;
    begin(value: unknown): AssistantTurnLease;
    current(agent: Agent): ResolvedAssistantTurn;
    resolve(execution: AssistantToolExecutionIdentity): ResolvedAssistantTurn;
    isCurrent(binding: ReadBinding): boolean;
    isCurrentProposal(binding: AssistantProposalBinding): boolean;
    invalidateAgent(agent: Agent): void;
    invalidateChild(currentInstanceId: string | null): void;
    invalidateVault(current: {
        id: string;
        generation: number;
    } | null): void;
    invalidatePermission(permission: AssistantTurnPermission, epoch: number): void;
    invalidateProvider(provider: string | null, model?: string): void;
    end(turnId: string): void;
    dispose(): void;
    private entryIsCurrent;
    private invalidate;
    private remove;
}
//# sourceMappingURL=turn-bindings.d.ts.map