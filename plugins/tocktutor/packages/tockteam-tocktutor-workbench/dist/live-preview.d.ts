export declare const MAX_LIVE_PREVIEW_SOURCE_BYTES = 2000000;
export declare const MAX_LIVE_PREVIEW_LINE_BYTES = 100000;
export type LivePreviewLineKind = 'blank' | 'callout' | 'code' | 'comment' | 'heading' | 'list' | 'property' | 'task' | 'text';
export interface LivePreviewLine {
    checked?: boolean;
    content: string;
    foldEndLine?: number;
    folded?: boolean;
    headingLevel?: number;
    index: number;
    kind: LivePreviewLineKind;
    taskIndex?: number;
}
export type LivePreviewProjection = {
    status: 'ready';
    lines: readonly LivePreviewLine[];
} | {
    reason: string;
    status: 'unsupported';
};
export declare function projectLivePreview(source: string): LivePreviewProjection;
export declare function replaceLivePreviewLine(source: string, index: number, replacement: string): string;
//# sourceMappingURL=live-preview.d.ts.map