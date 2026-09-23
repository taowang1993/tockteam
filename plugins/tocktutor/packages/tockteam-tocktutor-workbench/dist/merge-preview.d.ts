import type { MergeLinkPreviewRequest, MergeLinkPreviewResult, OpenDocumentResult, VaultReference } from './types.ts';
export type MergeSourceDisposition = 'keep' | 'trash' | 'link' | 'embed';
export interface NoteMergePreviewInput {
    expectedVault: VaultReference;
    source: OpenDocumentResult;
    destination: OpenDocumentResult;
    placement: 'append' | 'prepend';
    propertyChoices?: Readonly<Record<string, 'source' | 'destination'>>;
    sourceDisposition: MergeSourceDisposition;
}
export type NoteMergeOptions = Pick<NoteMergePreviewInput, 'placement' | 'propertyChoices' | 'sourceDisposition'>;
/** Saved documents with a route-owned lifetime. Apply requires the exact latest Host-reviewed preview. */
export interface PreparedNoteMerge {
    source: OpenDocumentResult;
    destination: OpenDocumentResult;
    signal: AbortSignal;
    preview(options: NoteMergeOptions, signal: AbortSignal): Promise<NoteMergePreview>;
    apply?(preview: NoteMergePreview, signal: AbortSignal): Promise<import('./types.ts').MergeResult>;
}
export interface NoteMergePreview {
    request: MergeLinkPreviewRequest;
    plan: MergeLinkPreviewResult;
    destinationContent: string;
    /** Null means no source replacement text: retain it unchanged or move it to trash. */
    sourceContent: string | null;
    sourceDisposition: MergeSourceDisposition;
}
/** Read-only review data, never apply authorization. The route must save drafts first and invalidate on owner changes. */
export declare function previewNoteMerge(input: NoteMergePreviewInput, read: (request: MergeLinkPreviewRequest, signal: AbortSignal) => Promise<MergeLinkPreviewResult>, signal: AbortSignal): Promise<NoteMergePreview>;
//# sourceMappingURL=merge-preview.d.ts.map