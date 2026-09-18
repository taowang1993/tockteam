import type { NativeOperationProgress } from './search-index-progress.ts';
import type { VaultSearchCandidateRequest, VaultSearchCandidateResult } from 'tockbot-note-vault/inspection';
export declare const SEARCH_INDEX_SCHEMA = "tocktutor-search-v2";
export type IndexedSearchDocument = {
    modifiedAt: number;
    path: string;
    revision: string;
};
export type SearchDependencies = {
    Document: typeof import('flexsearch').Document;
    Sqlite: typeof import('flexsearch/db/sqlite').default;
    sqlite3: {
        Database: typeof import('sqlite3').Database;
    };
};
export type SearchIndexOptions = {
    directory: string;
    identity: string;
    list(signal: AbortSignal): Promise<IndexedSearchDocument[] | null>;
    read(path: string, signal: AbortSignal): Promise<(IndexedSearchDocument & {
        content: string;
    }) | null>;
    vaultId: string;
    schema?: string;
    progress?: NativeOperationProgress;
    changed?(ready: boolean): void;
    failed?(error: unknown): void;
};
/** Kept reachable by the child until process death; never repaired, replaced or unlinked. */
export declare function acquireSearchIndexLease(filename: string, progress: NativeOperationProgress): Promise<unknown>;
export declare class PersistentSearchIndex {
    private controller;
    private database;
    private readonly options;
    private index;
    private ready;
    private reconcileTask;
    private fullReconcilePending;
    private readonly pendingPaths;
    private pendingPathBytes;
    private epoch;
    constructor(options: SearchIndexOptions);
    private publish;
    invalidate(changedPath?: string): void;
    search(request: VaultSearchCandidateRequest, signal: AbortSignal): Promise<VaultSearchCandidateResult | null>;
    close(): Promise<void>;
    private reconcile;
    private reconcileNow;
    private reconcilePaths;
    private open;
    private create;
    private storageName;
}
