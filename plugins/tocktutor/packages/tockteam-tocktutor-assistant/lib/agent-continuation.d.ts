import type { Agent, AgentRegistry } from '@deepseek-ai/dsh-agent';
import type { UserMessage } from '@deepseek-ai/dsh-session';
export type AgentContinuationMode = 'followup' | 'inject' | 'steer';
export interface AgentContinuationRequest {
    agentId?: string;
    mode: AgentContinuationMode;
    text: string;
}
export interface AgentContinuationResult {
    agentId: string;
    messageId: string;
    mode: AgentContinuationMode;
    redacted: boolean;
    truncated: boolean;
}
export type AgentContinuationErrorCode = 'ABORTED' | 'AGENT_NOT_LIVE' | 'AGENT_REQUIRED' | 'DELIVERY_FAILED' | 'IDENTITY_MISMATCH' | 'IDENTITY_UNAUTHORIZED' | 'INVALID_REQUEST' | 'REGISTRY_UNAVAILABLE';
export declare class AgentContinuationError extends Error {
    readonly code: AgentContinuationErrorCode;
    constructor(code: AgentContinuationErrorCode);
}
type ContinuationRegistry = Pick<AgentRegistry, 'currentInitiator' | 'get'>;
export type ExplicitAgentAuthorizer = (agentId: string, agent: Agent) => boolean;
export type BeforeAgentDelivery = (agent: Agent, message: UserMessage) => () => void;
export declare function isAssistantContinuationMessage(message: UserMessage): boolean;
export declare class AgentContinuationRouter {
    private readonly agents;
    private readonly authorizeExplicit;
    constructor(agents: ContinuationRegistry, authorizeExplicit?: ExplicitAgentAuthorizer);
    route(value: unknown, signal: AbortSignal, beforeDelivery?: BeforeAgentDelivery): AgentContinuationResult;
    private resolveAgent;
}
export {};
//# sourceMappingURL=agent-continuation.d.ts.map