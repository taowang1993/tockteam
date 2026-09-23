import { type ReactNode } from 'react';
import type { WorkbenchRouteController } from './route.tsx';
import type { LinkedViewKind } from './session.ts';
export declare const LINKED_VIEW_TITLES: Record<LinkedViewKind, string>;
export declare function LinkedNotePane({ controller, id }: {
    controller: WorkbenchRouteController;
    id: string;
}): ReactNode;
//# sourceMappingURL=linked-note-pane.d.ts.map