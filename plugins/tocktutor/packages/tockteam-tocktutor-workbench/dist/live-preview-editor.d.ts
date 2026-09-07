import { type MutableRefObject, type ReactNode } from 'react';
import type { EditorWidgetTarget } from './editor-widgets.ts';
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts';
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
    onOpenExternalUrl?: (url: string) => void;
    resolvedEmbeds?: readonly import('./embeds.ts').ResolvedEmbedNode[];
    onSelectionChange?: (selection: LivePreviewSelection) => void;
    onTableAction?: (action: LivePreviewTableAction) => void;
    onToggleTask?: (index: number) => void;
    onWidgetState?: (widgets: readonly EditorWidgetTarget[]) => void;
    title?: string;
}
export declare function MarkdownDocumentHeader(props: {
    className?: string;
    onAddProperty?: (key: string) => boolean;
    source: string;
    title?: string;
}): ReactNode;
export declare function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode;
//# sourceMappingURL=live-preview-editor.d.ts.map