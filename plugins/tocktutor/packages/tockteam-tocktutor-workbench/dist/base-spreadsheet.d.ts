import type { ExecutableBaseViewModel } from './base-view-model.ts';
export declare const MAX_EXECUTABLE_BASE_SPREADSHEET_CHARACTERS = 1000000;
export declare const MAX_EXECUTABLE_BASE_SPREADSHEET_CELLS = 1000000;
/** Serialize exactly the visible view rows as spreadsheet-safe TSV with headers. */
export declare function executableBaseViewTsv(model: ExecutableBaseViewModel): string | null;
/** Serialize exactly the visible view rows as spreadsheet-safe CSV with CRLF records. */
export declare function executableBaseViewCsv(model: ExecutableBaseViewModel): string | null;
/** Serialize a rectangular, header-free semantic cell selection as TSV. */
export declare function executableBaseCellRangeTsv(rows: readonly (readonly unknown[])[]): string | null;
export declare function executableBaseCsvFilename(viewName: string): string;
//# sourceMappingURL=base-spreadsheet.d.ts.map