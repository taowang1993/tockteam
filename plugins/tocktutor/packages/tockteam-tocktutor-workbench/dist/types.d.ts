export interface VaultReference {
    generation: number;
    id: string;
}
export type ActiveVaultResult = VaultReference | null;
export interface RecentVaultInfo {
    id: string;
    lastOpenedAt: number;
}
export interface RecentVaultListResult {
    generation: number;
    vaults: RecentVaultInfo[];
}
export interface VaultGenerationRequest {
    expectedGeneration: number;
}
export interface RecentVaultRequest extends VaultGenerationRequest {
    id: string;
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
export interface VaultOutlineRequest {
    expectedVault: VaultReference;
    includeFootnotes?: boolean;
    includeQueries?: boolean;
    limit?: number;
    path: string;
}
export interface VaultHeading {
    level: number;
    line: number;
    selector: string;
    text: string;
}
export interface VaultInlineFootnote {
    content: string;
    kind: 'inline';
    line: number;
    ordinal: number;
}
export interface VaultOutlineResult {
    footnotes?: VaultInlineFootnote[];
    footnotesTruncated?: boolean;
    generation: number;
    headings: VaultHeading[];
    path: string;
    truncated: boolean;
}
export interface VaultLinksRequest {
    cursor?: string;
    expectedVault: VaultReference;
    includeUnlinked?: boolean;
    path: string;
}
export interface VaultLinkRecord {
    authoredTarget: string;
    displayText: string;
    fragment: string | null;
    kind: 'canvas-file' | 'embed' | 'image' | 'image-reference' | 'markdown' | 'reference' | 'tag' | 'wiki';
    line: number;
    normalizedTarget: string;
    resolvedPath: string | null;
    sourcePath: string;
    status: 'ambiguous' | 'resolved' | 'unresolved';
}
export interface VaultUnlinkedMention {
    identifierKind: 'alias' | 'basename' | 'title';
    line: number;
    matchedText: string;
    snippet: string;
    sourcePath: string;
}
export interface VaultLinksResult {
    backlinkDetails: VaultLinkRecord[];
    backlinks: string[];
    complete?: boolean;
    cursor: string | null;
    generation: number;
    outgoing: string[];
    outgoingDetails: VaultLinkRecord[];
    path: string;
    scan: {
        bytes: number;
        entries: number;
        files: number;
    };
    tagRelations: Array<{
        paths: string[];
        tag: string;
    }>;
    truncated: boolean;
    truncationReason: 'byte-limit' | 'entry-limit' | 'file-limit' | 'metadata-limit' | 'result-limit' | null;
    unlinkedMentions?: VaultUnlinkedMention[];
    warnings: string[];
}
export interface VaultSearchRequest {
    caseSensitive?: boolean;
    cursor?: string;
    directory?: string;
    expectedVault: VaultReference;
    limit?: number;
    mode?: 'literal' | 'query' | 'related';
    query: string;
    regex?: boolean;
    scope?: 'all' | 'content' | 'path' | 'properties';
    wholeWord?: boolean;
}
export interface VaultSearchMatch {
    kind: 'base' | 'block' | 'canvas' | 'content' | 'line' | 'path' | 'property' | 'section' | 'tag' | 'task';
    line: number | null;
    lineEnd?: number | null;
    operator?: 'any' | 'block' | 'content' | 'file' | 'line' | 'path' | 'property' | 'related' | 'section' | 'tag' | 'task' | 'task-done' | 'task-todo';
    path: string;
    preview: string;
    provenance?: 'body' | 'canvas' | 'frontmatter' | 'path' | 'section' | 'task';
    score?: number;
}
export interface VaultSearchResult {
    cursor: string | null;
    generation: number;
    matches: VaultSearchMatch[];
    query: string;
    scan: {
        bytes: number;
        entries: number;
        files: number;
    };
    truncated: boolean;
    truncationReason: 'byte-limit' | 'entry-limit' | 'file-limit' | 'metadata-limit' | 'result-limit' | null;
    warnings: string[];
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
export interface SnapshotContentResult {
    content: string;
    generation: number;
    snapshot: SnapshotInfo;
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
export interface ListTrashRequest {
    expectedVault: VaultReference;
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
//# sourceMappingURL=types.d.ts.map