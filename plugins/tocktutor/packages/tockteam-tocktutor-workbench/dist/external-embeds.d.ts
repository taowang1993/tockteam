export type ExternalEmbedKind = 'image' | 'twitter' | 'web' | 'youtube';
export interface ExternalEmbedTarget {
    kind: ExternalEmbedKind;
    sourceUrl: string;
    viewerUrl: string;
}
export declare function classifyExternalEmbed(value: string): ExternalEmbedTarget | null;
export declare function externalEmbedButtonHtml(alt: string, target: ExternalEmbedTarget): string;
export declare function externalEmbedInertHtml(alt: string, target: ExternalEmbedTarget): string;
/** Return the viewer-safe URL only; the caller must still use the isolated Web Viewer. */
export declare function viewerExternalUrl(value: string): string | null;
//# sourceMappingURL=external-embeds.d.ts.map