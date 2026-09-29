import { type ReactNode, type RefObject } from 'react';
export interface ViewerImage {
    alt: string;
    src: string;
}
export declare function safeRasterImageDataUrl(value: string | null | undefined): string | null;
export declare function ImageViewerAction(props: {
    image: ViewerImage;
    onView(image: ViewerImage, trigger: HTMLButtonElement): void;
}): ReactNode;
export declare function ImageViewerDialog(props: {
    image: ViewerImage | null;
    onClose(): void;
    returnFocusRef?: RefObject<HTMLElement | null>;
}): ReactNode;
export declare function ImageViewerButton(props: {
    image: ViewerImage;
}): ReactNode;
export declare function mountImageViewerButton(container: HTMLElement, image: ViewerImage): () => void;
export declare function mountImageViewerAction(container: HTMLElement, image: ViewerImage, onView: (image: ViewerImage, trigger: HTMLButtonElement) => void): () => void;
//# sourceMappingURL=image-viewer.d.ts.map