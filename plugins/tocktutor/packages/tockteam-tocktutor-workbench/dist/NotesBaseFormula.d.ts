export type NotesBaseFormulaResult = {
    supported: true;
    value: unknown;
} | {
    supported: false;
};
export type NotesBaseFormulaContext = {
    fileBacklinksFor?: (normalizedPath: string) => unknown | null;
    fileCreatedAtFor?: (normalizedPath: string) => number | null;
    fileEmbedsFor?: (normalizedPath: string) => unknown | null;
    fileLinksFor?: (normalizedPath: string) => unknown | null;
    fileLinksContain?: (normalizedSourcePath: string, normalizedTargetPath: string) => boolean | null;
    fileModifiedAtFor?: (normalizedPath: string) => number | null;
    filePropertiesFor?: (normalizedPath: string) => unknown | null;
    filePropertiesHas?: (normalizedPath: string, propertyName: string) => boolean | null;
    fileSizeFor?: (normalizedPath: string) => number | null;
    fileTagsFor?: (normalizedPath: string) => unknown | null;
    thisFile?: {
        relativePath: string;
        sizeBytes?: number;
        createdAt?: number;
        modifiedAt?: number;
    };
};
export declare const NOTES_BASE_UNSUPPORTED_FORMULA_VALUE: unique symbol;
export declare function notesBaseFileTimestamp(timestamp: unknown): string | undefined;
export declare function notesBaseFormulaExpression(value: string): string | null;
export declare function evaluateNotesBaseFormula(expression: string, resolveProperty: (property: string) => unknown, context?: NotesBaseFormulaContext): NotesBaseFormulaResult;
export declare function evaluateNotesBaseSummary<Row>(expression: string, rows: Row[], resolveProperty: (row: Row, property: string) => unknown): NotesBaseFormulaResult;
//# sourceMappingURL=NotesBaseFormula.d.ts.map