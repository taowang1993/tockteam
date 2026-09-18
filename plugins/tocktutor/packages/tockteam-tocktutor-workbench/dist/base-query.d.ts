import { type NotesBaseFormulaContext } from './NotesBaseFormula.ts';
import type { ExecutableBaseDocument, ExecutableBaseViewDefinition } from './base-parser.ts';
import { type PropertyValue } from './properties.ts';
export declare const MAX_EXECUTABLE_BASE_FILES = 2000;
export declare const MAX_EXECUTABLE_BASE_FILE_BYTES = 1000000;
export declare const MAX_EXECUTABLE_BASE_TOTAL_BYTES = 16000000;
export interface BaseHydratedFile {
    createdAt?: number;
    modifiedAt?: number;
    path: string;
    revision: string;
    sizeBytes?: number;
    source: string;
}
export interface ExecutableBaseRow {
    file: BaseHydratedFile;
    properties: Readonly<Record<string, PropertyValue>>;
    values: Readonly<Record<string, unknown>>;
}
export interface ExecutableBaseUnsupported {
    expression: string;
    kind: 'filter' | 'formula' | 'input' | 'sort' | 'summary';
}
export interface ExecutableBaseSummaryResult {
    expression: string;
    label: string;
    value: unknown;
}
export interface ExecutableBaseQueryResult {
    rows: readonly ExecutableBaseRow[];
    summaries: readonly ExecutableBaseSummaryResult[];
    unsupported: readonly ExecutableBaseUnsupported[];
}
/** Recompute configured summaries over an already-visible row set. */
export declare function summarizeExecutableBaseRows(document: ExecutableBaseDocument, view: ExecutableBaseViewDefinition, rows: readonly ExecutableBaseRow[], baseFile?: NotesBaseFormulaContext['thisFile']): {
    summaries: readonly ExecutableBaseSummaryResult[];
    unsupported: readonly ExecutableBaseUnsupported[];
};
/** Execute filters, sorts, limit, displayed formulas, and summaries for one bounded Base view. */
export declare function queryExecutableBaseView(document: ExecutableBaseDocument, view: ExecutableBaseViewDefinition, files: readonly BaseHydratedFile[], baseFile?: NotesBaseFormulaContext['thisFile']): ExecutableBaseQueryResult;
//# sourceMappingURL=base-query.d.ts.map