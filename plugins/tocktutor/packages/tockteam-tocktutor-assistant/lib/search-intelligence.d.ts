import type { LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { AssistantQuickAnswerRequest, AssistantQuickAnswerCitation, AssistantSearchIntelligenceResult } from './remote-types.ts';
import type { VaultSearchResult } from 'tockbot-note-vault/inspection';
import { type AssistantTurnBinding } from './text-turn.ts';
type QuickAnswerResult = {
    status: 'completed' | 'no-evidence' | 'provider-unavailable' | 'disabled' | 'invalid-output' | 'error' | 'cancelled';
    answer: string;
    citations: AssistantQuickAnswerCitation[];
};
export declare function parseSearchExpansion(value: string): string[];
declare function boundedSearchRequest(request: {
    query: string;
    directory?: string;
    modifiedFrom?: number;
    modifiedTo?: number;
    titleOnly?: boolean;
}, query: string, mode?: 'query' | 'related'): {
    query: string;
    mode: 'query' | 'related';
    directory?: string;
    modifiedFrom?: number;
    modifiedTo?: number;
    titleOnly?: boolean;
    limit: number;
};
export declare function answerSearchQuery(llm: LlmRuntime | undefined, request: AssistantQuickAnswerRequest, provider: string, model: string, read: (path: string, signal: AbortSignal) => Promise<{
    path: string;
    content: string;
}>, signal: AbortSignal, isCurrent?: (binding: AssistantTurnBinding) => boolean): Promise<QuickAnswerResult>;
export declare function expandAndSearch(llm: LlmRuntime | undefined, request: {
    query: string;
    vaultGeneration: number;
    directory?: string;
    modifiedFrom?: number;
    modifiedTo?: number;
    titleOnly?: boolean;
}, provider: string, model: string, search: (request: ReturnType<typeof boundedSearchRequest>, signal: AbortSignal) => Promise<VaultSearchResult>, signal: AbortSignal, isCurrent?: (binding: AssistantTurnBinding) => boolean): Promise<AssistantSearchIntelligenceResult>;
export {};
//# sourceMappingURL=search-intelligence.d.ts.map