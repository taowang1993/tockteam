import { type ArchiveLimits } from '../archive.ts';
import { type PlannedFile, type SkippedEntry } from '../core.ts';
export declare const MARKDOWN_MAX_ENTRIES = 500;
export declare const MARKDOWN_MAX_ENTRY_BYTES: number;
export declare const MARKDOWN_MAX_TOTAL_BYTES: number;
export declare const MARKDOWN_ARCHIVE_LIMITS: ArchiveLimits;
export interface InspectedSourceFile {
    bytes: Uint8Array;
    fingerprint: string;
    path: string;
}
export interface PlannedSourceResult {
    digest: string;
    files: PlannedFile[];
    size: number;
    skipped: SkippedEntry[];
    sourceEntries: number;
    warnings: string[];
}
export declare function planMarkdownFolder(files: InspectedSourceFile[]): PlannedSourceResult;
export declare function planMarkdownZip(bytes: Uint8Array, signal?: AbortSignal): PlannedSourceResult;
//# sourceMappingURL=markdown.d.ts.map