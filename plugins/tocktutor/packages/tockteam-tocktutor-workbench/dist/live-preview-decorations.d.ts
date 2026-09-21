import { StateField } from '@codemirror/state';
export declare const refreshLivePreview: import("@codemirror/state").StateEffectType<boolean | undefined>;
/** Decorations change the view, never the Markdown document or its undo history. */
export declare function buildLivePreviewExtension(getEmbeds: () => readonly unknown[], openUrl: (url: string) => void): (StateField<import("@codemirror/view").DecorationSet> | import("@codemirror/state").Extension | StateField<boolean>)[];
//# sourceMappingURL=live-preview-decorations.d.ts.map