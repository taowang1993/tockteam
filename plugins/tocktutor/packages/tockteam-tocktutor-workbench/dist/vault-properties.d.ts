import { type ReactNode } from 'react';
import type { VaultFacetsResult } from './types.ts';
type Property = VaultFacetsResult['properties'][number];
export declare function VaultProperties({ properties, onSearch }: {
    properties: Property[];
    onSearch(key: string): void;
}): ReactNode;
export {};
//# sourceMappingURL=vault-properties.d.ts.map