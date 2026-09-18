import { StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ResolvedEmbedNode } from './embeds.ts';
export declare function buildSourceEmbedWidgetExtension(getEmbeds: () => readonly ResolvedEmbedNode[]): (StateField<import("@codemirror/view").DecorationSet> | import("@codemirror/state").Extension)[];
export declare function refreshSourceEmbedWidgets(view: EditorView | null): void;
//# sourceMappingURL=source-embed-widgets.d.ts.map