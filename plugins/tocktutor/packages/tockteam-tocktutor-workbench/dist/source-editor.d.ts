import { type MutableRefObject, type ReactNode } from 'react';
import type { EditorSearchRequest, EditorSearchState } from './editor-search.ts';
export type SourceEditorFoldAction = 'foldAll' | 'unfoldAll' | 'foldMore' | 'foldLess';
export interface SourceEditorFoldRequest {
    action: SourceEditorFoldAction;
    id: number;
}
export interface SourceEditorInsertTextRequest {
    cursorOffset?: number;
    id: number;
    text: string;
}
export interface SourceEditorSelectionRange {
    from: number;
    to: number;
}
export interface SourceEditorSelectionRequest extends SourceEditorSelectionRange {
    id: number;
}
export interface SourceEditorSelection {
    main: SourceEditorSelectionRange;
    ranges: readonly SourceEditorSelectionRange[];
}
export interface SourceEditorProps {
    ariaLabel?: string;
    className?: string;
    content: string;
    localEditRevision?: number | undefined;
    editable?: boolean;
    livePreview?: boolean;
    onOpenExternalUrl?: ((url: string) => void) | undefined;
    extraExtensions?: readonly unknown[];
    foldRequest?: SourceEditorFoldRequest | null;
    id?: string;
    insertTextRequest?: SourceEditorInsertTextRequest | null;
    onContentChange?: (content: string) => void;
    onRenameTitle?: (title: string) => Promise<boolean> | boolean;
    onSearchState?: (state: EditorSearchState) => void;
    onSelectionChange?: (selection: SourceEditorSelection) => void;
    searchCurrentIndex?: number | null;
    searchQuery?: string;
    searchRequest?: EditorSearchRequest | null;
    selectionRequest?: SourceEditorSelectionRequest | null | undefined;
    onWidgetState?: (widgets: readonly import('./editor-widgets.ts').EditorWidgetTarget[]) => void;
    placeholder?: string;
    resolvedEmbeds?: readonly import('./embeds.ts').ResolvedEmbedNode[];
    showFoldGutter?: boolean;
    spellCheck?: boolean;
    title?: string;
    editorViewRef?: MutableRefObject<unknown | null>;
}
export type SelectionMouseEvent = Pick<MouseEvent, 'altKey' | 'shiftKey'>;
export type RectangularSelectionMouseEvent = SelectionMouseEvent & Pick<MouseEvent, 'button'>;
/** Alt-click adds a selection range, matching Tockbot's Source editor. */
export declare function shouldAddEditorSelectionRange(event: SelectionMouseEvent): boolean;
/** Alt+Shift-drag or middle-drag starts a rectangular selection. */
export declare function shouldStartEditorRectangularSelection(event: RectangularSelectionMouseEvent): boolean;
/** Restore the authored newline sequence after CodeMirror's canonical edit. */
export declare function preserveEditorLineEndings(authored: string, edited: string): string;
export declare function buildSourceChange(current: string, next: string): {
    from: number;
    insert: string;
    to: number;
} | null;
export declare function SourceEditor(props: SourceEditorProps): ReactNode;
//# sourceMappingURL=source-editor.d.ts.map