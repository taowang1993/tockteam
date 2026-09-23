import { type ReactNode } from 'react';
import type { PaneLayout } from './session.ts';
/** Flat, keyed pane seats preserve editor DOM/history when a split reparents a leaf. */
export declare function PaneLayoutView(props: {
    layout: PaneLayout;
    renderPane(id: string): ReactNode;
    onResize(path: readonly number[], ratio: number): void;
}): ReactNode;
//# sourceMappingURL=pane-layout.d.ts.map