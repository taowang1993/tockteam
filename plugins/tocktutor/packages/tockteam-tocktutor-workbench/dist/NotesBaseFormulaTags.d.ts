type NotesBaseFormulaResult = {
    supported: true;
    value: unknown;
} | {
    supported: false;
};
type NotesBaseFormulaResolver = (property: string) => unknown;
export declare function notesBaseTagsSnapshot(value: unknown): string[] | null;
export declare function evaluateNotesBaseFileHasTagCall(call: {
    receiver: string;
    args: string;
}, resolveProperty: NotesBaseFormulaResolver, splitArgs: (args: string) => string[] | null, evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult, fileTagsFor?: (normalizedPath: string) => unknown | null): NotesBaseFormulaResult;
export {};
//# sourceMappingURL=NotesBaseFormulaTags.d.ts.map