import { type ReactNode } from 'react';
import type { PaneLayout } from './session.ts';
/** Shared geometry keeps titlebar tabs aligned with their pane seats. */
export declare function paneLayoutEntries(layout: PaneLayout): {
    node: PaneLayout;
    path: number[];
    x: number;
    y: number;
    width: number;
    height: number;
}[];
/** Flat, keyed pane seats preserve editor DOM/history when a split reparents a leaf. */
export declare function PaneLayoutView(props: {
    layout: PaneLayout;
    renderPane(id: string, topRow: boolean): ReactNode;
    onResize(path: readonly number[], ratio: number): void;
}): ReactNode;
//# sourceMappingURL=pane-layout.d.ts.map