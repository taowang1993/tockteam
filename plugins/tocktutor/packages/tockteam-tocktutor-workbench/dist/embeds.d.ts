export declare const MAX_EMBED_TARGETS = 100;
export declare const MAX_EMBED_CONTENT_BYTES = 2000000;
export type EmbedKind = 'base' | 'canvas' | 'media' | 'note';
export interface EmbedTarget {
    display: string | null;
    fragment: string | null;
    kind: EmbedKind;
    path: string;
    source: string;
}
export declare function collectEmbedTargets(source: string): EmbedTarget[];
/** Resolve an authored path exactly before falling back to one unambiguous basename. */
export declare function resolveEmbedTargetPath(entries: readonly {
    path: string;
}[], targetPath: string): string | null;
export declare function resolveNoteEmbedFragment(source: string, fragment: string | null): string | null;
//# sourceMappingURL=embeds.d.ts.map