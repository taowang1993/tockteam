export interface ArchiveLimits {
    maxArchiveBytes: number;
    maxCompressionRatio: number;
    maxDepth: number;
    maxEntries: number;
    maxEntryBytes: number;
    maxFilenameBytes: number;
    maxParserMs: number;
    maxTotalBytes: number;
}
export interface ArchiveEntry {
    bytes: Uint8Array;
    compressedSize: number;
    path: string;
}
export interface CreateArchiveEntry {
    bytes: Uint8Array;
    path: string;
}
export declare function crc32(bytes: Uint8Array): number;
export declare function parseZip(input: Uint8Array, limits: ArchiveLimits, options?: {
    allowNestedArchives?: boolean;
    signal?: AbortSignal;
}): ArchiveEntry[];
export declare function createDeterministicZip(entries: CreateArchiveEntry[]): Uint8Array;
//# sourceMappingURL=archive.d.ts.map