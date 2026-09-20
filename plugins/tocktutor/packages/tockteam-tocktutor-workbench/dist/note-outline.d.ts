import { type ReactNode } from 'react';
import type { TockTutorRouteViewProps } from './route.tsx';
import type { VaultHeading } from './types.ts';
/** Match rendered labels, including formatting and duplicate headings, within the current editor only. */
export declare function scrollOutlineHeading(root: HTMLElement | null, headings: VaultHeading[], index: number): boolean;
export declare function NoteOutline({ headings, onNavigate }: {
    headings: VaultHeading[];
    onNavigate(index: number): boolean;
}): ReactNode;
export declare function NoteOutlinePanel({ snapshot, onJumpToLine }: {
    snapshot: TockTutorRouteViewProps['snapshot'];
    onJumpToLine: TockTutorRouteViewProps['onJumpToLine'];
}): ReactNode;
//# sourceMappingURL=note-outline.d.ts.map