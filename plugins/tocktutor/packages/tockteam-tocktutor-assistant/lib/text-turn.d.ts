import { type LlmRuntime } from '@deepseek-ai/dsh-llm';
import { type AssistantPromptInput } from './context.ts';
export interface AssistantTurnBinding {
    readonly vaultId: string;
    readonly vaultGeneration: number;
    readonly childInstanceId: string;
    readonly turnId: string;
}
export interface AssistantTextTurnInput {
    readonly prompt: AssistantPromptInput;
    readonly provider: string;
    readonly model: string;
    readonly binding: AssistantTurnBinding;
}
export type AssistantTurnErrorCode = 'ABORTED' | 'INVALID_INPUT' | 'INVALID_STREAM' | 'PROVIDER_ERROR' | 'PROVIDER_UNAVAILABLE' | 'STALE_CONTEXT' | 'TOOLS_UNAVAILABLE';
export type AssistantTurnEvent = {
    readonly type: 'text-delta';
    readonly text: string;
} | {
    readonly type: 'finish';
    readonly reason: 'stop' | 'max-tokens' | 'max-output';
    readonly truncated: boolean;
} | {
    readonly type: 'error';
    readonly code: AssistantTurnErrorCode;
    readonly message: string;
};
export declare class AssistantTextTurnRunner {
    private readonly llm;
    private readonly isCurrent;
    constructor(llm: LlmRuntime, isCurrent: (binding: AssistantTurnBinding) => boolean);
    run(input: AssistantTextTurnInput, signal: AbortSignal): AsyncIterable<AssistantTurnEvent>;
    private assertCurrent;
}
//# sourceMappingURL=text-turn.d.ts.map