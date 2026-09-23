import { type MutableRefObject, type ReactNode } from 'react';
import type { EditorWidgetTarget } from './editor-widgets.ts';
import type { EditorSearchRequest, EditorSearchState } from './editor-search.ts';
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts';
import { type PropertyValue } from './properties.ts';
export interface LivePreviewSelection {
    from: number;
    to: number;
}
export declare function isLivePreviewSourceProtected(source: string): boolean;
export declare function splitLivePreviewSource(source: string): {
    body: string;
    prefix: string;
};
export interface LivePreviewEditorProps {
    ariaLabel?: string;
    className?: string;
    content: string;
    editorViewRef?: MutableRefObject<unknown | null>;
    onAddProperty?: (key: string) => boolean;
    onMarkdownChange: (markdown: string) => void;
    onSearchState?: (state: EditorSearchState) => void;
    onOpenExternalUrl?: (url: string) => void;
    onSetProperty?: (key: string, value: PropertyValue) => boolean;
    resolvedEmbeds?: readonly import('./embeds.ts').ResolvedEmbedNode[];
    onSelectionChange?: (selection: LivePreviewSelection) => void;
    searchCurrentIndex?: number | null;
    searchQuery?: string;
    searchRequest?: EditorSearchRequest | null;
    onTableAction?: (action: LivePreviewTableAction) => void;
    onToggleTask?: (index: number) => void;
    onWidgetState?: (widgets: readonly EditorWidgetTarget[]) => void;
    title?: string;
}
export declare function MarkdownDocumentHeader(props: {
    editableProperties?: boolean;
    className?: string;
    onAddProperty?: (key: string) => boolean;
    onSetProperty?: (key: string, value: PropertyValue) => boolean;
    source: string;
    title?: string;
}): ReactNode;
export declare function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode;
//# sourceMappingURL=live-preview-editor.d.ts.map