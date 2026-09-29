export declare const MAX_IMAGE_WIDTH = 2000;
/** The inline node is the exact occurrence, so repeated embeds cannot resize a neighbour. */
export declare function resizeWikilinkToken(token: string, width: number): string | null;
export declare function resizedImageAlt(alt: string, width: number): string | null;
/** Preview only until release/Enter; the owning ProseMirror transaction is the sole writer. */
export declare function mountImageResizeControl(host: HTMLElement, image: HTMLImageElement, authored: string, onCommit: (width: number) => boolean): () => void;
//# sourceMappingURL=image-resize.d.ts.map