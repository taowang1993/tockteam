export interface MermaidColors {
    background: string;
    foreground: string;
    accent: string;
}
/** The frame is opaque-origin and script-only. Its one local bundle can run, but no authored resource can load. */
export declare function mermaidFrameDocument(origin: string): string;
/** No returned markup is inserted. This allowlisted projection is used only as an image URL. */
export declare function passiveMermaidImageUrl(source: string, colors: MermaidColors): string | null;
//# sourceMappingURL=mermaid-browser.d.ts.map