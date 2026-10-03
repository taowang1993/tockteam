import { type ReactNode } from 'react';
import type { TockTutorRouteViewProps } from './route.tsx';
export type WorkbenchUtilityView = 'attachments' | 'backlinks' | 'outgoing-links' | 'bookmarks' | 'extensions' | 'graph' | 'outline' | 'properties' | 'recovery' | 'tags' | 'tools' | 'web' | 'workspace';
export type WorkbenchUtilitiesProps = TockTutorRouteViewProps & {
    onClose(): void;
    view: WorkbenchUtilityView | null;
};
export declare function WorkbenchBookmarks(props: {
    snapshot: TockTutorRouteViewProps['snapshot'];
    onOpenBookmark: TockTutorRouteViewProps['onOpenBookmark'];
    onOpenExternalUrl: TockTutorRouteViewProps['onOpenExternalUrl'];
    onRemoveBookmark: TockTutorRouteViewProps['onRemoveBookmark'];
}): ReactNode;
/** Note information and vault indexes share the existing right-sidebar owner. */
export declare function WorkbenchSidebarViews(props: TockTutorRouteViewProps & {
    view: WorkbenchUtilityView | null;
}): ReactNode;
export declare function WorkbenchUtilities(props: WorkbenchUtilitiesProps): ReactNode;
//# sourceMappingURL=utility-panel.d.ts.map