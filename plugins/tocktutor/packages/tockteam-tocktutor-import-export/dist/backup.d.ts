import { type ArchiveLimits } from './archive.ts';
import { type VaultBinding } from './core.ts';
import type { PlannedSourceResult } from './formats/markdown.ts';
export declare const BACKUP_FORMAT: "tockbot-vault-backup";
export declare const BACKUP_VERSION: 2;
export declare const BACKUP_ARCHIVE_LIMITS: ArchiveLimits;
export interface BackupSnapshotEntry {
    bytes: Uint8Array;
    kind: 'attachment' | 'document';
    path: string;
    revision: string;
}
export interface BackupManifestEntry {
    kind: BackupSnapshotEntry['kind'];
    path: string;
    revision: string;
    sha256: string;
    size: number;
}
export interface BackupManifest {
    createdAt: number;
    entries: BackupManifestEntry[];
    format: typeof BACKUP_FORMAT;
    totalBytes: number;
    vault: VaultBinding;
    version: typeof BACKUP_VERSION;
}
export interface VerifiedBackup {
    entries: BackupSnapshotEntry[];
    manifest: BackupManifest;
    manifestDigest: string;
    outerDigest: string;
}
export declare function createBackupArchive(input: {
    createdAt: number;
    entries: BackupSnapshotEntry[];
    vault: VaultBinding;
}): Uint8Array;
export declare function verifyBackupArchive(bytes: Uint8Array, signal?: AbortSignal): VerifiedBackup;
export declare function planVerifiedRestore(bytes: Uint8Array, signal?: AbortSignal): PlannedSourceResult;
//# sourceMappingURL=backup.d.ts.map