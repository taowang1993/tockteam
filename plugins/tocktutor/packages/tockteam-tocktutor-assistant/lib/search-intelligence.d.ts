import type { LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { AssistantSearchIntelligenceResult } from './remote-types.ts';
import type { VaultSearchResult } from 'tockbot-note-vault/inspection';
import { type AssistantTurnBinding } from './text-turn.ts';
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