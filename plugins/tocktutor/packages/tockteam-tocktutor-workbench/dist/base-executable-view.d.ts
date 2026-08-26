import { type ReactNode } from 'react';
import { type ExecutableBaseFrontmatterEditRequest } from './base-edit.ts';
import type { BaseHydratedFile } from './base-query.ts';
export interface ExecutableBaseCopyRequest {
    kind: 'results' | 'selection';
    text: string;
    view: string;
}
export interface ExecutableBaseExportRequest {
    filename: string;
    text: string;
    view: string;
}
export interface ExecutableBaseViewProps {
    activeView?: string | null;
    baseFile?: {
        createdAt?: number;
        modifiedAt?: number;
        relativePath: string;
        sizeBytes?: number;
    };
    files: readonly BaseHydratedFile[];
    onActiveViewChange?: (view: string) => void;
    onCopy?: (request: ExecutableBaseCopyRequest) => void;
    onEdit?: (request: ExecutableBaseFrontmatterEditRequest) => void;
    onExport?: (request: ExecutableBaseExportRequest) => void;
    onSearchChange?: (view: string, search: string) => void;
    searches?: Readonly<Record<string, string | undefined>>;
    source: string;
}
/** Controlled browser-only seam for bounded executable Base views. */
export declare function ExecutableBaseView(props: ExecutableBaseViewProps): ReactNode;
//# sourceMappingURL=base-executable-view.d.ts.map