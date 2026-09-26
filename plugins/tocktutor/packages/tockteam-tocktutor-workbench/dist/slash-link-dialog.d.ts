import { type SlashLinkContext } from './markdown-links.ts';
export interface PendingSlashLink {
    kind: 'link' | 'note-link' | 'new-note' | 'file';
    context?: SlashLinkContext;
    isCurrent(): boolean;
    insert(href: string, label: string): boolean;
    cancel(): void;
    restoreFocus(): void;
}
export declare function SlashLinkDialog({ action }: {
    action: PendingSlashLink;
}): import("react").JSX.Element;
//# sourceMappingURL=slash-link-dialog.d.ts.map