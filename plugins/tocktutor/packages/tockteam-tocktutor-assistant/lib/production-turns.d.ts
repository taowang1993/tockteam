import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm';
import type { UserMessage } from '@deepseek-ai/dsh-session';
import { type AssistantTurnLease } from './turn-bindings.ts';
export interface ProductionTurnBinding {
    lease: AssistantTurnLease;
}
export interface ProductionTurnHost {
    bind(agent: Agent, turn: number, messageId: string, signal: AbortSignal): Promise<ProductionTurnBinding>;
    requestConfig(agent: Agent, turn: number, signal: AbortSignal, config: LlmCallConfig): LlmCallConfig;
}
/** Correlates only Host-minted assistant messages to their exact existing-Agent turn lifecycle. */
export declare class ProductionAssistantTurnBinder {
    private readonly host;
    private readonly pending;
    private readonly claimed;
    private readonly binding;
    private readonly invalidatedMessages;
    private readonly invalidatedTurns;
    private readonly active;
    private disposed;
    constructor(host: ProductionTurnHost);
    reserve(agent: Agent, messageId: string): () => void;
    onClaimed(agent: Agent, message: UserMessage, turn: number): void;
    onDiscarded(agent: Agent, message: UserMessage): void;
    onPreStep(payload: {
        agent: Agent;
        messages: UserMessage[];
        turn: number;
        signal: AbortSignal;
    }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>;
    onRequest(payload: {
        agent: Agent;
        turn: number;
        signal: AbortSignal;
    }, next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig>;
    onTurnStopping(agent: Agent, turn: number): void;
    invalidateAgent(agent: Agent): void;
    invalidateAll(): void;
    dispose(): void;
    private invalidateTurn;
    private removeFromInbox;
    private endActive;
    private end;
}
//# sourceMappingURL=production-turns.d.ts.map