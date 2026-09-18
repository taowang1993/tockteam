import type { ListTreeRequest, ListSnapshotsRequest, NoteVaultState, OpenDocumentResult, SnapshotListResult, TrashListResult, VaultInspectionRuntimeResult, VaultLinksArgs, VaultLinksResult, VaultOutlineArgs, VaultOutlineResult, VaultReference, VaultSearchArgs, VaultSearchResult, VaultTreePage } from 'tockbot-note-runtime';
export declare const REVIEWED_PENNIVO_READ_TOOLS: readonly ["list_files", "read_file", "search", "find_backlinks", "get_outline", "list_workspaces", "list_snapshots", "list_trash"];
export type PennivoReadTool = typeof REVIEWED_PENNIVO_READ_TOOLS[number];
export type ReadToolErrorCode = 'ABORTED' | 'INVALID_ARGUMENTS' | 'INVALID_RESULT' | 'READ_DENIED' | 'READ_UNAVAILABLE' | 'RESULT_TOO_LARGE' | 'RUNTIME_FAILURE' | 'STALE_CONTEXT' | 'TOOL_DENIED' | 'TOOL_UNAVAILABLE';
export declare class ReadToolError extends Error {
    readonly code: ReadToolErrorCode;
    constructor(code: ReadToolErrorCode, message: string);
}
export interface ReadBinding {
    readonly vaultId: string;
    readonly vaultGeneration: number;
    readonly childInstanceId: string;
    readonly turnId: string;
}
export interface RuntimeDocumentReader {
    readonly state: NoteVaultState;
    listSnapshots?(request: ListSnapshotsRequest, signal: AbortSignal): Promise<SnapshotListResult>;
    listTrash?(request: {
        expectedVault: VaultReference;
    }, signal: AbortSignal): Promise<TrashListResult>;
    listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage>;
    links?(args: VaultLinksArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultLinksResult>>;
    search?(args: VaultSearchArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultSearchResult>>;
    outline?(args: VaultOutlineArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultOutlineResult>>;
    openDocument(requestedPath: string, expectedVault: VaultReference, signal: AbortSignal): Promise<OpenDocumentResult>;
}
export interface PennivoTextResult {
    readonly content: readonly [{
        readonly type: 'text';
        readonly text: string;
    }];
}
export interface ReadSourceIdentity {
    readonly path: string;
    readonly digest: string;
    readonly revision: string;
    readonly generation: number;
}
export interface ReadToolOutcome {
    /** The only portion that may be returned to the model. */
    readonly result: PennivoTextResult;
    /** Host-private identity for later staged-write revalidation. */
    readonly source: ReadSourceIdentity | null;
    readonly truncated: boolean;
}
export declare class PennivoReadAdapter {
    private readonly runtime;
    private readonly isCurrent;
    constructor(runtime: RuntimeDocumentReader, isCurrent: (binding: ReadBinding) => boolean);
    execute(tool: unknown, args: unknown, requestedBinding: ReadBinding, signal: AbortSignal): Promise<ReadToolOutcome>;
    /** Return full bounded source only to Host-owned transformations, never model output. */
    readDocument(requestedPath: string, requestedBinding: ReadBinding, signal: AbortSignal): Promise<{
        readonly content: string;
        readonly source: ReadSourceIdentity;
    }>;
    private getOutline;
    private findBacklinks;
    private search;
    private listTrash;
    private listSnapshots;
    private listFiles;
    private assertCurrent;
}
//# sourceMappingURL=read-tools.d.ts.map