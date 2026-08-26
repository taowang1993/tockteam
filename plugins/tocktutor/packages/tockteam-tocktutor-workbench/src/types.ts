export interface VaultReference {
  generation: number
  id: string
}

export type ActiveVaultResult = VaultReference | null

export interface RecentVaultInfo {
  id: string
  lastOpenedAt: number
}

export interface RecentVaultListResult {
  generation: number
  vaults: RecentVaultInfo[]
}

export interface VaultGenerationRequest {
  expectedGeneration: number
}

export interface RecentVaultRequest extends VaultGenerationRequest {
  id: string
}

export interface OpenDocumentResult {
  content: string
  digest: string
  generation: number
  path: string
  revision: string
}

export interface CreateDocumentRequest {
  content: string
  expectedVault: VaultReference
  path: string
}

export interface SaveDocumentRequest extends CreateDocumentRequest {
  expectedRevision: string
}

export type WriteDocumentResult = Readonly<
  | {
      digest: string
      generation: number
      path: string
      revision: string
      status: 'created'
    }
  | {
      digest: string
      generation: number
      path: string
      revision: string
      snapshotId: string
      status: 'saved'
    }
>

export interface ListTreeRequest {
  cursor?: string | null
  expectedVault: VaultReference
  limit?: number
}

export type VaultTreeEntry = Readonly<
  | { kind: 'directory'; modifiedAt: number; path: string; revision: string }
  | {
      createdAt: number
      kind: 'attachment'
      mediaKind: 'audio' | 'image' | 'pdf' | 'video'
      modifiedAt: number
      path: string
      revision: string
      size: number
    }
  | {
      createdAt: number
      kind: 'document'
      modifiedAt: number
      path: string
      revision: string
      size: number
    }
>

export type TreeTruncationReason = 'depth-limit' | 'entry-limit' | 'result-limit' | null

export interface VaultTreePage {
  complete: boolean
  cursor: string | null
  entries: VaultTreeEntry[]
  generation: number
  scan: { entries: number }
  truncated: boolean
  truncationReason: TreeTruncationReason
  warnings: string[]
}

export type NoteVaultChangeEvent = Readonly<
  | { action: 'activated'; kind: 'vault'; vault: VaultReference }
  | { action: 'changed' | 'watcher-error'; kind: 'tree'; vault: VaultReference }
  | {
      action: 'created' | 'external-change' | 'external-rename' | 'stored' | 'updated'
      kind: 'entry'
      path: string
      vault: VaultReference
    }
  | {
      action: 'duplicated' | 'moved' | 'restored' | 'trashed'
      fromPath: string
      kind: 'entry'
      path: string
      vault: VaultReference
    }
>

export interface SnapshotInfo {
  createdAt: number
  digest: string
  id: string
  path: string
  reason: string
  size: number
}

export interface ListSnapshotsRequest {
  expectedVault: VaultReference
  path: string
}

export interface SnapshotListResult {
  generation: number
  snapshots: SnapshotInfo[]
}

export interface ReadSnapshotRequest extends ListSnapshotsRequest {
  snapshotId: string
}

export interface SnapshotContentResult {
  content: string
  generation: number
  snapshot: SnapshotInfo
}

export interface RestoreSnapshotRequest extends ReadSnapshotRequest {
  toPath: string
}

export interface TrashEntryRequest {
  expectedRevision: string
  expectedVault: VaultReference
  path: string
}

export interface TrashEntryInfo {
  createdAt: number
  id: string
  kind: 'attachment' | 'document' | 'folder'
  originalPath: string
}

export interface TrashMutationResult extends TrashEntryInfo {
  generation: number
  revision: string
  status: 'trashed'
}

export interface TrashListResult {
  entries: TrashEntryInfo[]
  generation: number
}

export interface ListTrashRequest {
  expectedVault: VaultReference
}

export interface RestoreTrashRequest {
  expectedVault: VaultReference
  id: string
  toPath?: string
}

export interface RestoreTrashResult extends TrashEntryInfo {
  generation: number
  path: string
  revision: string
  status: 'restored'
}
