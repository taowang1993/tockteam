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
type ExecutableBaseEditResult = boolean | void | PromiseLike<boolean | void>;
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
    onEdit?: (request: ExecutableBaseFrontmatterEditRequest) => ExecutableBaseEditResult;
    onExport?: (request: ExecutableBaseExportRequest) => void;
    onSearchChange?: (view: string, search: string) => void;
    searches?: Readonly<Record<string, string | undefined>>;
    source: string;
}
/** Controlled browser-only seam for bounded executable Base views. */
export declare function ExecutableBaseView(props: ExecutableBaseViewProps): ReactNode;
export {};
//# sourceMappingURL=base-executable-view.d.ts.map