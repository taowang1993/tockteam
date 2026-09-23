import { type ReactNode } from 'react';
import type { TockTutorRouteViewProps } from './route.tsx';
export type WorkbenchUtilityView = 'attachments' | 'backlinks' | 'bookmarks' | 'extensions' | 'graph' | 'outline' | 'properties' | 'recovery' | 'tags' | 'tools' | 'web' | 'workspace';
export type WorkbenchUtilitiesProps = TockTutorRouteViewProps & {
    onClose(): void;
    view: WorkbenchUtilityView | null;
};
export declare function WorkbenchUtilities(props: WorkbenchUtilitiesProps): ReactNode;
//# sourceMappingURL=utility-panel.d.ts.map