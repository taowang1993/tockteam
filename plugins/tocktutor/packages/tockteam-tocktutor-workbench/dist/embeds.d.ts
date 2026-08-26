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
export declare function resolveNoteEmbedFragment(source: string, fragment: string | null): string | null;
//# sourceMappingURL=embeds.d.ts.map