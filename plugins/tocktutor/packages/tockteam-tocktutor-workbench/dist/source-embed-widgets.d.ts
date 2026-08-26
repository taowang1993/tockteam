import { EditorView } from '@codemirror/view';
import type { ResolvedEmbedNode } from './embeds.ts';
export declare function buildSourceEmbedWidgetExtension(getEmbeds: () => readonly ResolvedEmbedNode[]): import("@codemirror/state").Extension[];
export declare function refreshSourceEmbedWidgets(view: EditorView | null): void;
//# sourceMappingURL=source-embed-widgets.d.ts.map