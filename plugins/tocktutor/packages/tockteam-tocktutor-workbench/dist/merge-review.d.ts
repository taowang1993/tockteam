import { type ReactNode } from 'react';
import type { PreparedNoteMerge } from './merge-preview.ts';
export interface NoteMergeReviewProps {
    sourcePath: string;
    paths: readonly string[];
    onPrepare(path: string, signal: AbortSignal): Promise<PreparedNoteMerge>;
    onClose(): void;
}
/** Review stays non-mutating; only explicit confirmation invokes the optional Host-owned apply. */
export declare function NoteMergeReview(props: NoteMergeReviewProps): ReactNode;
export declare function MergeRecoveryDialog(props: {
    onList(signal: AbortSignal, cursor?: string): Promise<import('./types.ts').MergeListResult>;
    onRecover(id: string, signal: AbortSignal): Promise<import('./types.ts').MergeResult>;
    onClose(): void;
}): ReactNode;
//# sourceMappingURL=merge-review.d.ts.map