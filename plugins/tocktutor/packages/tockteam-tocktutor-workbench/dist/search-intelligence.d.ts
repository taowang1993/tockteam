import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { VaultSearchMatch } from './types.ts';
export type WorkbenchAiSearchPolicy = 'off' | 'on-demand' | 'automatic';
export interface WorkbenchSearchIntelligenceRequest {
    query: string;
    vaultGeneration: number;
    mode: 'related';
    directory?: string;
    modifiedFrom?: number;
    modifiedTo?: number;
    titleOnly?: boolean;
}
export interface WorkbenchSearchIntelligenceResult {
    status: 'applied' | 'disabled' | 'provider-unavailable' | 'invalid-output' | 'error' | 'cancelled';
    matches: VaultSearchMatch[];
}
export interface WorkbenchQuickAnswerCandidate {
    id: string;
    path: string;
    line: number | null;
    lineEnd?: number | null;
    preview: string;
}
export interface WorkbenchQuickAnswerCitation {
    id: string;
    path: string;
    line: number | null;
    lineEnd: number | null;
}
export interface WorkbenchQuickAnswerResult {
    status: 'completed' | 'no-evidence' | 'provider-unavailable' | 'disabled' | 'invalid-output' | 'error' | 'cancelled';
    answer: string;
    citations: WorkbenchQuickAnswerCitation[];
}
export type WorkbenchQuickAnswerState = Omit<WorkbenchQuickAnswerResult, 'status'> & {
    status: 'idle' | 'thinking' | 'unavailable' | WorkbenchQuickAnswerResult['status'];
};
/** Optional Host capability; the Workbench remains fully local without it. */
export interface WorkbenchSearchIntelligenceRemote {
    currentSettings?(signal?: AbortSignal): Promise<RemoteResult<{
        provider: string;
        model: string;
        aiSearch?: WorkbenchAiSearchPolicy;
    }>>;
    searchIntelligence?(request: WorkbenchSearchIntelligenceRequest, signal?: AbortSignal): Promise<RemoteResult<WorkbenchSearchIntelligenceResult>>;
    quickAnswer?(request: {
        query: string;
        vaultGeneration: number;
        candidates: WorkbenchQuickAnswerCandidate[];
    }, signal?: AbortSignal): Promise<RemoteResult<WorkbenchQuickAnswerResult>>;
}
//# sourceMappingURL=search-intelligence.d.ts.map