import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { NoteVaultRuntime } from 'tockbot-note-runtime';
import type { ActiveVaultResult, CreateDocumentRequest, DraftMutationResult, DraftRequest, DraftResult, ListSnapshotsRequest, ListTrashRequest, ListTreeRequest, OpenDocumentResult, ReadSnapshotRequest, RecentVaultListResult, RecentVaultRequest, RestoreSnapshotRequest, RestoreTrashRequest, RestoreTrashResult, SaveDocumentRequest, SaveDraftRequest, SnapshotContentResult, SnapshotListResult, TrashEntryRequest, TrashListResult, TrashMutationResult, VaultGenerationRequest, VaultReference, VaultTreePage, WriteDocumentResult } from './types.ts';
export type * from './types.ts';
export declare const MAX_DOCUMENT_CONTENT_BYTES = 2000000;
export declare const MAX_TREE_CURSOR_LENGTH = 512;
export declare const MAX_TREE_PAGE_SIZE = 200;
export type NoteVaultCapability = Pick<NoteVaultRuntime, 'activateRecentVault' | 'clearDraft' | 'createDocument' | 'listRecentVaults' | 'listSnapshots' | 'listTrash' | 'listTree' | 'openDocument' | 'openSandboxVault' | 'readDraft' | 'readSnapshot' | 'removeRecentVault' | 'restoreSnapshotAsNew' | 'restoreTrash' | 'saveDocument' | 'saveDraft' | 'state' | 'trashEntry'>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        tocktutorWorkbench: TockTutorWorkbenchGateway;
    }
}
/** Host-only projection of accepted note-vault workbench capabilities. */
export declare class TockTutorWorkbenchGateway extends TypertRemoteService {
    static inject: string[];
    constructor(ctx: Context);
    currentVault(signal: AbortSignal): Promise<ActiveVaultResult>;
    listRecentVaults(signal: AbortSignal): Promise<RecentVaultListResult>;
    activateRecentVault(request: RecentVaultRequest, signal: AbortSignal): Promise<VaultReference>;
    removeRecentVault(request: RecentVaultRequest, signal: AbortSignal): Promise<RecentVaultListResult>;
    openSandboxVault(request: VaultGenerationRequest, signal: AbortSignal): Promise<VaultReference>;
    openDocument(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<OpenDocumentResult>;
    listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage>;
    createDocument(request: CreateDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    saveDocument(request: SaveDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    readDraft(request: DraftRequest, signal: AbortSignal): Promise<DraftResult>;
    saveDraft(request: SaveDraftRequest, signal: AbortSignal): Promise<DraftMutationResult>;
    clearDraft(request: DraftRequest, signal: AbortSignal): Promise<DraftMutationResult>;
    listSnapshots(request: ListSnapshotsRequest, signal: AbortSignal): Promise<SnapshotListResult>;
    readSnapshot(request: ReadSnapshotRequest, signal: AbortSignal): Promise<SnapshotContentResult>;
    restoreSnapshotAsNew(request: RestoreSnapshotRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    trashEntry(request: TrashEntryRequest, signal: AbortSignal): Promise<TrashMutationResult>;
    listTrash(request: ListTrashRequest, signal: AbortSignal): Promise<TrashListResult>;
    restoreTrash(request: RestoreTrashRequest, signal: AbortSignal): Promise<RestoreTrashResult>;
}
//# sourceMappingURL=host-read.d.ts.map