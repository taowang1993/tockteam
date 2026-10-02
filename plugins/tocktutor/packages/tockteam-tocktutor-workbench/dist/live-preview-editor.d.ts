import { type MutableRefObject, type ReactNode } from 'react';
import type { EditorWidgetTarget } from './editor-widgets.ts';
import type { EditorCommandId } from './editor-commands.ts';
import type { EditorSearchRequest, EditorSearchState } from './editor-search.ts';
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts';
import { type EditablePropertyType, type PropertyValue } from './properties.ts';
import type { ObsidianPropertyTypes } from './types.ts';
import { type PropertySuggestions } from './property-suggestions.tsx';
export interface LivePreviewSelection {
    from: number;
    to: number;
}
export declare function splitLivePreviewSource(source: string): {
    body: string;
    prefix: string;
};
export interface LivePreviewEditorProps {
    ariaLabel?: string;
    className?: string;
    content: string;
    declaredTypes?: ObsidianPropertyTypes | undefined;
    localEditRevision?: number | undefined;
    commandRef?: MutableRefObject<((command: EditorCommandId) => boolean) | null>;
    insertTextRef?: MutableRefObject<((text: string) => boolean) | null>;
    onUploadImage?: (file: File) => Promise<string>;
    slashLinks?: import('./markdown-links.ts').SlashLinkContext | undefined;
    onOpenInternalLink?: (target: string, kind?: 'markdown') => void;
    editorViewRef?: MutableRefObject<unknown | null>;
    onAddProperty?: (key: string) => boolean;
    onMarkdownChange: (markdown: string) => void;
    onRenameTitle?: (title: string) => Promise<boolean> | boolean;
    onSearchState?: (state: EditorSearchState) => void;
    onOpenExternalUrl?: (url: string) => void;
    onSetProperty?: (key: string, value: PropertyValue) => boolean;
    onRenameProperty?: ((from: string, to: string) => boolean) | undefined;
    onRemoveProperty?: ((key: string) => boolean) | undefined;
    onChangePropertyType?: ((key: string, type: EditablePropertyType, allowLossy: boolean) => Promise<boolean>) | undefined;
    propertyDrafts?: Map<string, string> | undefined;
    suggestions?: PropertySuggestions | undefined;
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
    compact?: boolean;
    editableProperties?: boolean;
    className?: string;
    declaredTypes?: ObsidianPropertyTypes | undefined;
    onAddProperty?: (key: string) => boolean;
    onRenameProperty?: ((from: string, to: string) => boolean) | undefined;
    onRemoveProperty?: ((key: string) => boolean) | undefined;
    onChangePropertyType?: LivePreviewEditorProps['onChangePropertyType'];
    onRenameTitle?: (title: string) => Promise<boolean> | boolean;
    onSetProperty?: (key: string, value: PropertyValue) => boolean;
    propertyDrafts?: Map<string, string> | undefined;
    suggestions?: PropertySuggestions | undefined;
    source: string;
    title?: string;
}): ReactNode;
export declare function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode;
//# sourceMappingURL=live-preview-editor.d.ts.map