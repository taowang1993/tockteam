export declare const MAX_RICH_MARKDOWN_BYTES = 2000000;
export declare const MAX_RICH_MARKDOWN_BLOCKS = 20000;
export declare const MAX_RICH_MARKDOWN_FOOTNOTES = 1000;
export interface RenderMarkdownOptions {
    strictLineBreaks?: boolean;
}
export interface BuildMarkdownExportDocumentOptions extends RenderMarkdownOptions {
    markdown: string;
    title: string;
}
export declare function escapeMarkdownHtml(value: string): string;
export declare function renderMarkdownHtml(markdown: string, options?: RenderMarkdownOptions): string;
export declare function buildMarkdownSlides(markdown: string, options?: RenderMarkdownOptions): string[];
export declare function buildMarkdownExportDocument(options: BuildMarkdownExportDocumentOptions): string;
//# sourceMappingURL=rich-markdown.d.ts.map