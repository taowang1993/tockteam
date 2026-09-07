import { type ReactNode } from 'react';
import type { ResolvedEmbedNode } from './embeds.ts';
import { type LivePreviewSelection } from './live-preview-editor.tsx';
import type { PropertyValue } from './properties.ts';
export declare function ResolvedEmbedsView(props: {
    embeds?: readonly ResolvedEmbedNode[] | undefined;
    onOpenExternalUrl?: ((url: string) => void) | undefined;
}): ReactNode;
export declare function MarkdownSlidesView(props: {
    embeds?: readonly ResolvedEmbedNode[] | undefined;
    onOpenExternalUrl?: ((url: string) => void) | undefined;
    source: string;
}): ReactNode;
export declare function RichReadingView(props: {
    embeds?: readonly ResolvedEmbedNode[] | undefined;
    onAddProperty?: ((key: string) => boolean) | undefined;
    onOpenExternalUrl?: ((url: string) => void) | undefined;
    onSetProperty?: ((key: string, value: PropertyValue) => boolean) | undefined;
    onToggleTask(index: number): void;
    source: string;
    title: string;
}): ReactNode;
export declare function LivePreviewView(props: {
    documentKey: string;
    embeds?: readonly ResolvedEmbedNode[] | undefined;
    onAddProperty?: ((key: string) => boolean) | undefined;
    onEdit(source: string): void;
    onOpenExternalUrl?: ((url: string) => void) | undefined;
    onSelectionChange?: ((selection: LivePreviewSelection) => void) | undefined;
    onSetProperty?: ((key: string, value: PropertyValue) => boolean) | undefined;
    onToggleTask(index: number): void;
    source: string;
    title: string;
}): ReactNode;
//# sourceMappingURL=editor-surface.d.ts.map