import type { ReactNode } from 'react';
export type SidebarNoteAction = 'tab' | 'right' | 'open-window' | 'duplicate' | 'move' | 'bookmark' | 'merge' | 'copy-relative' | 'copy-absolute' | 'recovery' | 'open-default' | 'reveal' | 'rename' | 'trash';
export interface NoteMenuAnchor {
    x: number;
    y: number;
    row: HTMLElement;
}
/** The shared menu owns focus, keyboard navigation, dismissal and collision handling. */
export declare function SidebarNoteMenu(props: {
    anchor: NoteMenuAnchor;
    bookmarked: boolean;
    markdown: boolean;
    nativeAvailable: boolean;
    onAction(action: SidebarNoteAction): void;
    onClose(): void;
}): ReactNode;
//# sourceMappingURL=sidebar-note-menu.d.ts.map