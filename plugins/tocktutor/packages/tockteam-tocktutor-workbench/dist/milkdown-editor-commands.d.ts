import type { EditorView } from '@milkdown/prose/view';
export type LivePreviewTableAction = 'add-column-after' | 'add-column-before' | 'add-row-after' | 'add-row-before' | 'align-center' | 'align-default' | 'align-left' | 'align-right' | 'delete-column' | 'delete-row' | 'move-column-left' | 'move-column-right' | 'move-row-down' | 'move-row-up' | 'sort-ascending' | 'sort-descending';
/** Execute one history-aware table command against the active Milkdown view. */
export declare function runLivePreviewTableAction(view: Pick<EditorView, 'editable' | 'state' | 'dispatch'>, action: LivePreviewTableAction): boolean;
//# sourceMappingURL=milkdown-editor-commands.d.ts.map