export declare const MAX_EMBED_TARGETS = 100;
export declare const MAX_EMBED_CONTENT_BYTES = 2000000;
export declare const MAX_EMBED_DEPTH = 3;
export declare const MAX_EMBED_TOTAL_BYTES: number;
export declare const MAX_EMBED_MEDIA_BYTES: number;
export declare const MAX_EMBED_WARNINGS = 32;
export type EmbedKind = 'base' | 'canvas' | 'media' | 'note';
export interface EmbedTarget {
    display: string | null;
    fragment: string | null;
    kind: EmbedKind;
    path: string;
    source: string;
}
export interface ResolvedEmbedNode {
    content: string;
    depth?: number;
    mimeType?: string;
    parentPath?: string;
    target: EmbedTarget;
}
export type EmbedResolutionStatus = 'cancelled' | 'ready' | 'stale';
export interface EmbedResolutionResult {
    embeds: readonly ResolvedEmbedNode[];
    status: EmbedResolutionStatus;
    truncated: boolean;
    warnings: readonly string[];
}
interface EmbedIndexEntry {
    aliases?: readonly string[];
    kind?: string;
    name?: string;
    path: string;
}
export interface EmbedDocumentResult {
    content: string;
    generation?: number;
    path?: string;
    revision?: string;
}
export interface EmbedAttachmentResult {
    dataBase64: string;
    generation?: number;
    mimeType: string;
    path?: string;
}
export interface EmbedResolverOptions {
    entries: readonly EmbedIndexEntry[];
    isCurrent?: () => boolean;
    maxDepth?: number;
    maxMediaBytes?: number;
    maxNodes?: number;
    maxTotalBytes?: number;
    readAttachment(path: string, signal: AbortSignal): Promise<EmbedAttachmentResult>;
    readDocument(path: string, signal: AbortSignal): Promise<EmbedDocumentResult>;
    signal?: AbortSignal;
    source: string;
}
export declare function collectEmbedTargets(source: string): EmbedTarget[];
/** Resolve an authored path exactly before falling back to one unambiguous basename or alias. */
export declare function resolveEmbedTargetPath(entries: readonly EmbedIndexEntry[], targetPath: string): string | null;
export declare function resolveNoteEmbedFragment(source: string, fragment: string | null): string | null;
/**
 * Resolve local embed content as one bounded, cancellable graph. Reads are
 * cached by canonical path, while each occurrence keeps its own target and
 * depth so presentation modes can preserve source order. `isCurrent` is
 * checked after every await to prevent late work crossing a route identity.
 */
export declare function resolveEmbedGraph(options: EmbedResolverOptions): Promise<EmbedResolutionResult>;
/** Alias kept short for consumers that treat this operation as a resolver. */
export declare const resolveEmbeds: typeof resolveEmbedGraph;
export {};
//# sourceMappingURL=embeds.d.ts.map