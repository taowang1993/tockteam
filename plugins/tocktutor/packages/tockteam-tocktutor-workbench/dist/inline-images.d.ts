/** One note/view owns its requests and decoded cache; widget disposal only detaches that consumer. */
export declare class InlineImageLoader {
    private entries;
    private bytes;
    private prefetched;
    load(url: string): Promise<HTMLImageElement>;
    sync(urls: readonly string[]): void;
    dispose(): void;
}
/** Start immediately, and only publish fully decoded images. */
export declare function attachInlineImages(root: HTMLElement, onSizeChange?: () => void, shared?: InlineImageLoader): () => void;
//# sourceMappingURL=inline-images.d.ts.map