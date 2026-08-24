import type { EditorMode } from './session.ts';
export declare const MAX_MARKDOWN_BYTES = 1000000;
export declare const MAX_MARKDOWN_LINES = 10000;
export declare const MAX_MARKDOWN_LINE_LENGTH = 16384;
export declare const MAX_READING_BLOCKS = 4096;
export type EditorStatus = 'saved' | 'unsaved' | 'saving' | 'save-failed';
export type EditorShortcut = 'save' | 'command-palette' | 'delete-line' | 'simplify-selection';
export interface ReadingLink {
    label: string;
    href: string | null;
    inert: boolean;
    resource: boolean;
}
export type ReadingBlock = {
    kind: 'heading';
    level: number;
    text: string;
} | {
    kind: 'paragraph';
    text: string;
    links: ReadingLink[];
} | {
    kind: 'task';
    index: number;
    text: string;
    checked: boolean;
} | {
    kind: 'code';
    language: string;
    text: string;
};
export type ReadingProjection = {
    status: 'ready';
    source: string;
    blocks: ReadingBlock[];
    warnings: string[];
} | {
    status: 'unsupported';
    reason: string;
};
export declare function projectReading(source: string): ReadingProjection;
export declare function toggleMarkdownTask(source: string, taskIndex: number): string;
export declare function nextEditorMode(mode: EditorMode, lastEditingMode: 'wysiwyg' | 'source'): EditorMode;
export declare function resolveEditorShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, isMac: boolean): EditorShortcut | null;
export declare function editorStatusLabel(status: EditorStatus): string;
export declare function visualMotion(reduced: boolean): {
    reduced: boolean;
    transitionMs: number;
    animate: boolean;
};
//# sourceMappingURL=markdown.d.ts.map