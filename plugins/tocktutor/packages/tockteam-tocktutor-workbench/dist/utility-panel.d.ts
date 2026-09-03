import { type ReactNode } from 'react';
import { parseFrontmatterProperties } from './properties.ts';
import type { TockTutorRouteViewProps } from './route.tsx';
export type WorkbenchUtilityView = 'attachments' | 'extensions' | 'graph' | 'library' | 'note-info' | 'recovery' | 'tools' | 'web' | 'workspace';
export type WorkbenchUtilitiesProps = TockTutorRouteViewProps & {
    activeProperties: ReturnType<typeof parseFrontmatterProperties>;
    onClose(): void;
    view: WorkbenchUtilityView | null;
};
export declare function WorkbenchUtilities(props: WorkbenchUtilitiesProps): ReactNode;
//# sourceMappingURL=utility-panel.d.ts.map