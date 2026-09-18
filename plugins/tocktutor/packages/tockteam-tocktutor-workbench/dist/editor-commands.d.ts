export declare const MAX_EDITOR_COMMAND_SOURCE_BYTES = 2000000;
export type EditorCommandId = 'bold' | 'callout-tip' | 'delete-line' | 'highlight' | 'insert-table' | 'italic' | 'link' | 'strikethrough';
export interface EditorCommandResult {
    selectionEnd: number;
    selectionStart: number;
    source: string;
}
export interface EditorSelectionRange {
    from: number;
    to: number;
}
export interface MultiEditorCommandResult {
    ranges: readonly EditorSelectionRange[];
    source: string;
}
export type TableCommand = {
    column: number;
    kind: 'align-center' | 'align-default' | 'align-left' | 'align-right' | 'delete-column' | 'sort-ascending' | 'sort-descending';
} | {
    kind: 'add-row';
    row: number;
} | {
    kind: 'delete-row' | 'move-row-down' | 'move-row-up';
    row: number;
};
interface ShortcutLike {
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    shiftKey: boolean;
}
export declare function applyEditorCommand(source: string, command: EditorCommandId, selectionStart: number, selectionEnd: number): EditorCommandResult;
/** Apply one Markdown command to every range in one atomic source transaction. */
export declare function applyEditorCommandToSelections(source: string, command: EditorCommandId, selections: readonly EditorSelectionRange[]): MultiEditorCommandResult;
export declare function applyTableCommand(source: string, command: TableCommand): string;
export declare function resolveSlashCommand(value: string): EditorCommandId | null;
export declare function resolvePlatformEditorCommand(event: ShortcutLike, isMac: boolean): EditorCommandId | null;
export declare function internalLinkDropMarkdown(path: string, label?: string): string | null;
export declare function pagePreviewTargetAtOffset(source: string, offset: number): {
    fragment: string | null;
    path: string;
} | null;
export {};
//# sourceMappingURL=editor-commands.d.ts.map