import { type ReactNode } from 'react';
import type { ResolvedEmbedNode } from './embeds.ts';
import { type LivePreviewSelection, type LivePreviewEditorProps } from './live-preview-editor.tsx';
import { type EditorSearchRequest, type EditorSearchState } from './editor-search.ts';
import type { PropertyValue } from './properties.ts';
export interface ReadingLinkResult {
    fragment: string | null;
}
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
    onOpenInternalLink?: ((target: string, kind?: 'markdown') => void | Promise<ReadingLinkResult | null>) | undefined;
    onSearchState?: ((state: EditorSearchState) => void) | undefined;
    onSetProperty?: ((key: string, value: PropertyValue) => boolean) | undefined;
    onToggleTask(index: number): void;
    searchCurrentIndex?: number | null;
    searchQuery?: string;
    searchRequest?: EditorSearchRequest | null;
    source: string;
    title: string;
}): ReactNode;
export declare function LivePreviewView(props: {
    commandRef?: LivePreviewEditorProps['commandRef'];
    insertTextRef?: LivePreviewEditorProps['insertTextRef'];
    slashLinks?: LivePreviewEditorProps['slashLinks'];
    onUploadImage?: LivePreviewEditorProps['onUploadImage'];
    onOpenInternalLink?: LivePreviewEditorProps['onOpenInternalLink'];
    documentKey: string;
    localEditRevision?: number | undefined;
    embeds?: readonly ResolvedEmbedNode[] | undefined;
    onAddProperty?: ((key: string) => boolean) | undefined;
    onEdit(source: string): void;
    onEditSource?: (() => void) | undefined;
    onRenameTitle?: ((title: string) => Promise<boolean> | boolean) | undefined;
    onOpenExternalUrl?: ((url: string) => void) | undefined;
    onSearchState?: ((state: EditorSearchState) => void) | undefined;
    onSelectionChange?: ((selection: LivePreviewSelection) => void) | undefined;
    onSetProperty?: ((key: string, value: PropertyValue) => boolean) | undefined;
    onToggleTask(index: number): void;
    searchCurrentIndex?: number | null;
    searchQuery?: string;
    searchRequest?: EditorSearchRequest | null;
    source: string;
    title: string;
}): ReactNode;
//# sourceMappingURL=editor-surface.d.ts.map