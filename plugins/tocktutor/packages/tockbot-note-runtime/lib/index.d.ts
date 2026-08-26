import { Service, type Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type VaultCanvasArgs, type VaultCanvasResult, type VaultFacetsArgs, type VaultFacetsResult, type VaultGraphArgs, type VaultGraphResult, type VaultInspection, type VaultLinksArgs, type VaultLinksResult, type VaultListArgs, type VaultListResult, type VaultOutlineArgs, type VaultOutlineResult, type VaultReadArgs, type VaultSearchArgs, type VaultSearchResult } from 'tockbot-note-vault/inspection';
declare module '@deepseek-ai/cordis' {
    interface Context {
        noteVault: NoteVaultRuntime;
        tockTeamDesktopReveal: TockTeamDesktopReveal;
        tockTeamDesktopVaultSelection: TockTeamDesktopVaultSelection;
    }
    interface Events {
        'note-vault/change': (event: NoteVaultChangeEvent) => void;
    }
}
export interface Config {
    maxAttachmentBytes: number;
    maxDraftBytes: number;
    maxFolderBytes: number;
    recentVaultLimit: number;
    restoreActiveVault: boolean;
    maxReadBytes: number;
    maxTreeDepth: number;
    maxTreeEntries: number;
    maxTreeResults: number;
    snapshotLimit: number;
    snapshotRetentionDays: number;
    stateRoot: string | null;
    vaultRoot: string | null;
}
export declare const Config: Schema<Config>;
export type NoteVaultState = Readonly<{
    active: false;
    generation: number;
} | {
    active: true;
    generation: number;
    id: string;
}>;
export interface VaultReference {
    generation: number;
    id: string;
}
export interface TockTeamDesktopRevealIdentity {
    dev: string;
    ino: string;
}
export interface TockTeamDesktopRevealInput {
    canonicalPath: string;
    identity: TockTeamDesktopRevealIdentity;
    kind: 'directory' | 'file';
    operationId: string;
    vaultGeneration: number;
    vaultId: string;
}
export type TockTeamDesktopRevealStatus = 'cancelled' | 'denied' | 'revealed' | 'stale' | 'unavailable';
export interface TockTeamDesktopRevealResult {
    operationId: string;
    status: TockTeamDesktopRevealStatus;
}
export declare abstract class TockTeamDesktopReveal extends Service {
    constructor(ctx: Context);
    abstract reveal(input: TockTeamDesktopRevealInput, signal: AbortSignal): Promise<TockTeamDesktopRevealResult>;
}
export declare const TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE: "tockTeamDesktopVaultSelection";
export type TockTeamDesktopVaultSelectionClaim = string & {
    readonly __tockTeamDesktopVaultSelectionClaim: unique symbol;
};
export interface TockTeamDesktopVaultSelectionIdentity {
    operationId: string;
    requestId: string;
    sessionId: string;
    vaultGeneration: number;
    vaultId: string | null;
    windowId: string;
}
export interface TockTeamDesktopVaultSelectionFileIdentity {
    dev: string;
    ino: string;
}
export type TockTeamDesktopVaultSelectionFailureStatus = 'cancelled' | 'denied' | 'stale' | 'unavailable';
export interface TockTeamDesktopVaultSelectionConsumeInput {
    authorization: string;
    identity: TockTeamDesktopVaultSelectionIdentity;
}
export type TockTeamDesktopVaultSelectionConsumeResult = {
    operationId: string;
    status: TockTeamDesktopVaultSelectionFailureStatus;
} | {
    canonicalPath: string;
    claim: TockTeamDesktopVaultSelectionClaim;
    identity: TockTeamDesktopVaultSelectionFileIdentity;
    operationId: string;
    status: 'consumed';
};
export interface TockTeamDesktopVaultSelectionBindInput {
    claim: TockTeamDesktopVaultSelectionClaim;
    operationId: string;
    vaultGeneration: number;
    vaultId: string;
}
export type TockTeamDesktopVaultSelectionBindResult = {
    operationId: string;
    status: TockTeamDesktopVaultSelectionFailureStatus;
} | {
    operationId: string;
    status: 'bound';
};
export interface TockTeamDesktopVaultSelectionReleaseInput {
    claim: TockTeamDesktopVaultSelectionClaim;
    operationId: string;
}
export declare abstract class TockTeamDesktopVaultSelection extends Service {
    constructor(ctx: Context);
    abstract bind(input: TockTeamDesktopVaultSelectionBindInput, signal: AbortSignal): Promise<TockTeamDesktopVaultSelectionBindResult>;
    abstract consume(input: TockTeamDesktopVaultSelectionConsumeInput, signal: AbortSignal): Promise<TockTeamDesktopVaultSelectionConsumeResult>;
    abstract release(input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void>;
}
export interface ActivateDesktopSelectionRequest {
    authorization: string;
    identity: TockTeamDesktopVaultSelectionIdentity;
}
export interface ActivateDesktopSelectionResult {
    operationId: string;
    status: 'activated';
    vaultGeneration: number;
    vaultId: string;
}
export interface RevealEntryRequest {
    expectedVault: VaultReference;
    path: string;
}
export interface RevealEntryResult {
    generation: number;
    path: string;
    status: 'revealed';
}
export interface OpenDocumentResult {
    content: string;
    digest: string;
    generation: number;
    path: string;
    revision: string;
}
export interface CreateDocumentRequest {
    content: string;
    expectedVault: VaultReference;
    path: string;
}
export interface SaveDocumentRequest extends CreateDocumentRequest {
    expectedRevision: string;
}
export type WriteDocumentResult = Readonly<{
    digest: string;
    generation: number;
    path: string;
    revision: string;
    status: 'created';
} | {
    digest: string;
    generation: number;
    path: string;
    revision: string;
    snapshotId: string;
    status: 'saved';
}>;
export interface ListTreeRequest {
    cursor?: string | null;
    expectedVault: VaultReference;
    limit?: number;
}
export type VaultTreeEntry = Readonly<{
    kind: 'directory';
    modifiedAt: number;
    path: string;
    revision: string;
} | {
    createdAt: number;
    kind: 'attachment';
    mediaKind: 'audio' | 'image' | 'pdf' | 'video';
    modifiedAt: number;
    path: string;
    revision: string;
    size: number;
} | {
    createdAt: number;
    kind: 'document';
    modifiedAt: number;
    path: string;
    revision: string;
    size: number;
}>;
export type TreeTruncationReason = 'depth-limit' | 'entry-limit' | 'result-limit' | null;
export interface VaultTreePage {
    complete: boolean;
    cursor: string | null;
    entries: VaultTreeEntry[];
    generation: number;
    scan: {
        entries: number;
    };
    truncated: boolean;
    truncationReason: TreeTruncationReason;
    warnings: string[];
}
export interface ListPassiveBackupEntriesRequest {
    expectedVault: VaultReference;
}
export interface PassiveBackupEntry {
    path: string;
    revision: string;
    size: number;
}
export interface PassiveBackupListResult {
    entries: PassiveBackupEntry[];
    generation: number;
}
export interface ReadPassiveBackupEntryRequest {
    expectedRevision: string;
    expectedVault: VaultReference;
    path: string;
}
export interface PassiveBackupContentResult extends PassiveBackupEntry {
    data: Uint8Array;
    digest: string;
    generation: number;
}
export interface RestorePassiveBackupEntryRequest {
    data: Uint8Array;
    expectedVault: VaultReference;
    path: string;
}
export interface PassiveBackupMutationResult extends PassiveBackupEntry {
    digest: string;
    generation: number;
    status: 'restored';
}
export type NoteVaultChangeEvent = Readonly<{
    action: 'activated';
    kind: 'vault';
    vault: VaultReference;
} | {
    action: 'changed' | 'watcher-error';
    kind: 'tree';
    vault: VaultReference;
} | {
    action: 'created' | 'external-change' | 'external-rename' | 'stored' | 'updated';
    kind: 'entry';
    path: string;
    vault: VaultReference;
} | {
    action: 'duplicated' | 'moved' | 'restored' | 'trashed';
    fromPath: string;
    kind: 'entry';
    path: string;
    vault: VaultReference;
}>;
export interface FileMutationRequest {
    expectedRevision: string;
    expectedVault: VaultReference;
    fromPath: string;
    toPath: string;
}
export interface FileMutationResult {
    fromPath: string;
    generation: number;
    path: string;
    revision: string;
    status: 'duplicated' | 'moved';
}
export type FolderMutationRequest = FileMutationRequest;
export type FolderMutationResult = FileMutationResult;
export interface LinkRewriteSnapshot {
    path: string;
    snapshotId: string;
}
export interface LinkRewriteMutationResult {
    rewriteError?: string;
    rewriteSnapshots: LinkRewriteSnapshot[];
    rewrittenPaths: string[];
}
export type FileMoveWithLinkRewriteResult = FileMutationResult & LinkRewriteMutationResult;
export type FolderMoveWithLinkRewriteResult = FolderMutationResult & LinkRewriteMutationResult;
export interface AttachmentMetadataResult {
    generation: number;
    mediaKind: 'audio' | 'image' | 'pdf' | 'video';
    mimeType: string;
    path: string;
    revision: string;
    size: number;
}
export interface AttachmentPreviewResult extends AttachmentMetadataResult {
    data: Uint8Array;
    digest: string;
}
export interface StoreAttachmentRequest {
    data: Uint8Array;
    expectedVault: VaultReference;
    path: string;
}
export interface StoreAttachmentResult extends AttachmentMetadataResult {
    digest: string;
    status: 'stored';
}
export interface SnapshotInfo {
    createdAt: number;
    digest: string;
    id: string;
    path: string;
    reason: string;
    size: number;
}
export interface ListSnapshotsRequest {
    expectedVault: VaultReference;
    path: string;
}
export interface SnapshotListResult {
    generation: number;
    snapshots: SnapshotInfo[];
}
export interface ReadSnapshotRequest extends ListSnapshotsRequest {
    snapshotId: string;
}
export interface CaptureSnapshotRequest extends ListSnapshotsRequest {
    content: string;
    reason?: string;
}
export interface RestoreSnapshotOverwriteRequest extends ReadSnapshotRequest {
    expectedRevision: string;
}
export interface SnapshotContentResult {
    content: string;
    generation: number;
    snapshot: SnapshotInfo;
}
export interface SnapshotMutationResult {
    generation: number;
    removed?: number;
    snapshot?: SnapshotInfo;
}
export interface RestoreSnapshotRequest extends ReadSnapshotRequest {
    toPath: string;
}
export interface TrashEntryRequest {
    expectedRevision: string;
    expectedVault: VaultReference;
    path: string;
}
export interface TrashEntryInfo {
    createdAt: number;
    id: string;
    kind: 'attachment' | 'document' | 'folder';
    originalPath: string;
}
export interface TrashMutationResult extends TrashEntryInfo {
    generation: number;
    revision: string;
    status: 'trashed';
}
export interface TrashListResult {
    entries: TrashEntryInfo[];
    generation: number;
}
export interface RestoreTrashRequest {
    expectedVault: VaultReference;
    id: string;
    toPath?: string;
}
export interface RestoreTrashResult extends TrashEntryInfo {
    generation: number;
    path: string;
    revision: string;
    status: 'restored';
}
export interface RecentVaultInfo {
    id: string;
    lastOpenedAt: number;
}
export interface DraftRequest {
    expectedVault: VaultReference;
    path: string;
}
export interface SaveDraftRequest extends DraftRequest {
    content: string;
    revision?: string;
}
export interface DraftRecord {
    content: string;
    path: string;
    revision?: string;
    updatedAt: number;
}
export interface DraftResult {
    draft: DraftRecord | null;
    generation: number;
}
export interface DraftMutationResult {
    generation: number;
    ok: true;
    updatedAt?: number;
}
export type VaultInspectionRuntimeResult<Result> = Result & {
    generation: number;
};
export type { VaultCanvasArgs, VaultCanvasResult, VaultFacetsArgs, VaultFacetsResult, VaultGraphArgs, VaultGraphResult, VaultLinksArgs, VaultLinksResult, VaultListArgs, VaultListResult, VaultOutlineArgs, VaultOutlineResult, VaultPathRewriteArgs, VaultPathRewriteResult, VaultPathRewriteUpdate, VaultReadArgs, VaultSearchArgs, VaultSearchResult, } from 'tockbot-note-vault/inspection';
export type NoteVaultErrorCode = 'cancelled' | 'changed' | 'conflict' | 'denied' | 'exists' | 'inactive' | 'invalid-content' | 'invalid-path' | 'invalid-vault' | 'not-found' | 'partial' | 'recovery-unavailable' | 'stale-vault' | 'too-large' | 'unavailable' | 'unsafe-target' | 'unsupported-type';
export declare class NoteVaultError extends Error {
    readonly code: NoteVaultErrorCode;
    constructor(code: NoteVaultErrorCode, message: string);
}
export declare function isPassiveBackupPath(relativePath: string): boolean;
export declare class NoteVaultRuntime extends Service {
    static Config: Schema<Config>;
    private activeDesktopSelectionClaim;
    private readonly activeDesktopSelectionOperations;
    private readonly activeRevealOperations;
    private readonly desktopSelectionCleanupOperations;
    private readonly context;
    private currentState;
    private readonly draftOperations;
    private readonly maxAttachmentBytes;
    private readonly maxDraftBytes;
    private readonly maxFolderBytes;
    private readonly maxReadBytes;
    private readonly maxTreeResults;
    private readonly recentVaultLimit;
    private recentVaults;
    private readonly snapshotLimit;
    private readonly snapshotRetentionDays;
    private readonly stateRoot;
    private readonly treeConfig;
    private vaultIdentity;
    private vaultRoot;
    private watcher;
    private watcherActive;
    private watcherToken;
    constructor(ctx: Context, config: Config);
    private emitVaultActivation;
    private queueDesktopSelectionClaimRelease;
    private openWatcher;
    private emitWatcherChange;
    private emitEntryChange;
    private emitFileMutation;
    get state(): NoteVaultState;
    private invalidateActiveVault;
    private assertActiveVaultBound;
    private captureExpectedVault;
    private assertCapturedVault;
    activateDesktopSelection(request: ActivateDesktopSelectionRequest, signal: AbortSignal): Promise<ActivateDesktopSelectionResult>;
    activate(vaultRoot: string, expectedGeneration: number): NoteVaultState;
    private activateVault;
    listRecentVaults(): RecentVaultInfo[];
    removeRecentVault(id: string, expectedGeneration: number): RecentVaultInfo[];
    openSandboxVault(expectedGeneration: number): NoteVaultState;
    createManagedVault(name: string, expectedGeneration: number): NoteVaultState;
    revealEntry(request: RevealEntryRequest, signal: AbortSignal): Promise<RevealEntryResult>;
    activateRecentVault(id: string, expectedGeneration: number): NoteVaultState;
    private createInspection;
    private runInspection;
    search(args: VaultSearchArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultSearchResult>>;
    read(args: VaultReadArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<Awaited<ReturnType<VaultInspection['read']>>>>;
    list(args: VaultListArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultListResult>>;
    links(args: VaultLinksArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultLinksResult>>;
    outline(args: VaultOutlineArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultOutlineResult>>;
    graph(args: VaultGraphArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultGraphResult>>;
    canvas(args: VaultCanvasArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultCanvasResult>>;
    facets(args: VaultFacetsArgs, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultInspectionRuntimeResult<VaultFacetsResult>>;
    private runDraftOperation;
    saveDraft(request: SaveDraftRequest, signal: AbortSignal): Promise<DraftMutationResult>;
    readDraft(request: DraftRequest, signal: AbortSignal): Promise<DraftResult>;
    clearDraft(request: DraftRequest, signal: AbortSignal): Promise<DraftMutationResult>;
    openDocument(requestedPath: string, expectedVault: VaultReference, signal: AbortSignal): Promise<OpenDocumentResult>;
    listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage>;
    listPassiveBackupEntries(request: ListPassiveBackupEntriesRequest, signal: AbortSignal): Promise<PassiveBackupListResult>;
    readPassiveBackupEntry(request: ReadPassiveBackupEntryRequest, signal: AbortSignal): Promise<PassiveBackupContentResult>;
    restorePassiveBackupEntry(request: RestorePassiveBackupEntryRequest, signal: AbortSignal): Promise<PassiveBackupMutationResult>;
    private moveAttachmentInternal;
    private moveFileInternal;
    moveFile(request: FileMutationRequest, signal: AbortSignal): Promise<FileMutationResult>;
    duplicateFile(request: FileMutationRequest, signal: AbortSignal): Promise<FileMutationResult>;
    private mutateFolder;
    duplicateFolder(request: FolderMutationRequest, signal: AbortSignal): Promise<FolderMutationResult>;
    moveFolder(request: FolderMutationRequest, signal: AbortSignal): Promise<FolderMutationResult>;
    private completePathRewritePlan;
    private documentPathsByCanonicalTarget;
    private preparePathRewrites;
    private moveWithLinkRewrite;
    moveFileWithLinkRewrite(request: FileMutationRequest, signal: AbortSignal): Promise<FileMoveWithLinkRewriteResult>;
    moveFolderWithLinkRewrite(request: FolderMutationRequest, signal: AbortSignal): Promise<FolderMoveWithLinkRewriteResult>;
    private captureRecoverySnapshot;
    listSnapshots(request: ListSnapshotsRequest, signal: AbortSignal): Promise<SnapshotListResult>;
    readSnapshot(request: ReadSnapshotRequest, signal: AbortSignal): Promise<SnapshotContentResult>;
    captureSnapshot(request: CaptureSnapshotRequest, signal: AbortSignal): Promise<SnapshotMutationResult>;
    clearSnapshots(request: ListSnapshotsRequest, signal: AbortSignal): Promise<SnapshotMutationResult>;
    restoreSnapshot(request: RestoreSnapshotOverwriteRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    restoreSnapshotAsNew(request: RestoreSnapshotRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    trashEntry(request: TrashEntryRequest, signal: AbortSignal): Promise<TrashMutationResult>;
    listTrash(request: {
        expectedVault: VaultReference;
    }, signal: AbortSignal): Promise<TrashListResult>;
    restoreTrash(request: RestoreTrashRequest, signal: AbortSignal): Promise<RestoreTrashResult>;
    inspectAttachment(requestedPath: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentMetadataResult>;
    previewAttachment(requestedPath: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentPreviewResult>;
    storeAttachment(request: StoreAttachmentRequest, signal: AbortSignal): Promise<StoreAttachmentResult>;
    createDocument(request: CreateDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
    saveDocument(request: SaveDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult>;
}
export default NoteVaultRuntime;
