import { type ExecutableBaseDocument, type ExecutableBaseViewDefinition } from './base-parser.ts';
import { type BaseHydratedFile, type ExecutableBaseSummaryResult, type ExecutableBaseUnsupported } from './base-query.ts';
import type { NotesBaseFormulaContext } from './NotesBaseFormula.ts';
export type ExecutableBaseViewKind = 'cards' | 'list' | 'map-label' | 'table';
export type ExecutableBaseInputType = 'checkbox' | 'date' | 'number' | 'text';
export interface ExecutableBaseColumnModel {
    key: string;
    label: string;
}
export interface ExecutableBaseCellModel {
    column: string;
    editable: boolean;
    inputType: ExecutableBaseInputType | null;
    label: string;
    text: string;
    value: unknown;
}
export interface ExecutableBaseRowModel {
    cells: readonly ExecutableBaseCellModel[];
    coordinates: {
        latitude: number;
        longitude: number;
    } | null;
    path: string;
    revision: string;
    source: string;
}
export type ExecutableBaseViewModel = {
    reason: string;
    status: 'unsupported';
} | {
    columns: readonly ExecutableBaseColumnModel[];
    kind: ExecutableBaseViewKind;
    rows: readonly ExecutableBaseRowModel[];
    search: string;
    status: 'ready';
    summaries: readonly ExecutableBaseSummaryResult[];
    unsupported: readonly ExecutableBaseUnsupported[];
    view: ExecutableBaseViewDefinition;
    views: readonly {
        kind: ExecutableBaseViewKind;
        name: string;
    }[];
};
export declare function selectExecutableBaseView(document: ExecutableBaseDocument, name?: string | null): ExecutableBaseViewDefinition;
export declare function parseExecutableBaseCoordinates(value: unknown): {
    latitude: number;
    longitude: number;
} | null;
/** Build one layout-neutral model. Search is applied after filter/sort/limit and drives rows and summaries together. */
export declare function createBaseViewModel(document: ExecutableBaseDocument, files: readonly BaseHydratedFile[], selectedView?: string | null, search?: string, baseFile?: NotesBaseFormulaContext['thisFile']): ExecutableBaseViewModel;
//# sourceMappingURL=base-view-model.d.ts.map