import type { VaultSearchCandidateRequest, VaultSearchCandidateResult } from 'tockbot-note-vault/inspection';
import type { IndexedSearchDocument } from './search-index-native.ts';
export { ISOLATED_SEARCH_SCHEMA } from './search-index-protocol.ts';
export type SearchIndexProcessOptions = {
    directory: string;
    identity: string;
    vaultId: string;
    maxReadBytes: number;
    list(signal: AbortSignal, progress: () => void): Promise<IndexedSearchDocument[] | null>;
    read(path: string, signal: AbortSignal, progress: () => void): Promise<(IndexedSearchDocument & {
        content: string;
    }) | null>;
    failed?(error: Error): void;
};
/** Owns a single generation. close() is ownership proof, never merely socket EOF. */
export declare class SearchIndexProcess {
    private readonly options;
    private readonly controller;
    private readonly readiness;
    readonly whenReady: Promise<void>;
    private owner?;
    private spawnFailure?;
    private listener?;
    private protocol?;
    private readonly clock;
    private timer?;
    private readonly starting;
    private closing?;
    private closed;
    private initialized;
    private revision;
    private readyRevision;
    private hostProgress;
    private searches;
    private failure?;
    private invalidatePending;
    private fullInvalidation;
    private readonly changedPaths;
    private changedPathBytes;
    constructor(options: SearchIndexProcessOptions);
    get pid(): number | undefined;
    private fail;
    private ready;
    private spawn;
    private start;
    invalidate(changedPath?: string): void;
    search(request: VaultSearchCandidateRequest, signal: AbortSignal): Promise<VaultSearchCandidateResult | null>;
    close(): Promise<void>;
}
