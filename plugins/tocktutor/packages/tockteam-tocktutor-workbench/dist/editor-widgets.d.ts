import { type EmbedKind } from './embeds.ts';
export declare const MAX_EDITOR_WIDGETS = 100;
export interface EditorWidgetTarget {
    from: number;
    kind: EmbedKind;
    path: string;
    selected: boolean;
    source: string;
    to: number;
    visible: boolean;
}
/**
 * Projects safe local embeds for editor chrome without replacing their source.
 * The source range is authoritative: selecting it always hides the widget.
 */
export declare function projectEditorWidgets(source: string, selection?: {
    from: number;
    to: number;
}): readonly EditorWidgetTarget[];
export interface EditorStaticWidgetTarget {
    content: string;
    from: number;
    kind: 'base' | 'math' | 'mermaid';
    selected: boolean;
    source: string;
    to: number;
    visible: boolean;
}
/** Project bounded source-local Base, Mermaid, and display-math widgets. */
export declare function projectEditorStaticWidgets(source: string, selection?: {
    from: number;
    to: number;
}): readonly EditorStaticWidgetTarget[];
//# sourceMappingURL=editor-widgets.d.ts.map