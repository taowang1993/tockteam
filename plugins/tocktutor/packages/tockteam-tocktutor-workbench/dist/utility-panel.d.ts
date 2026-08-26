import { type ReactNode } from 'react';
import { parseFrontmatterProperties } from './properties.ts';
import type { TockTutorRouteViewProps } from './route.tsx';
export type WorkbenchUtilitiesProps = TockTutorRouteViewProps & {
    activeProperties: ReturnType<typeof parseFrontmatterProperties>;
    onClose(): void;
    open: boolean;
};
export declare function WorkbenchUtilities(props: WorkbenchUtilitiesProps): ReactNode;
//# sourceMappingURL=utility-panel.d.ts.map