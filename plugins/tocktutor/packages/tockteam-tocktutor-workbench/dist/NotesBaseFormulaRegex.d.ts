type NotesBaseFormulaResult = {
    supported: true;
    value: unknown;
} | {
    supported: false;
};
type NotesBaseFormulaResolver = (property: string) => unknown;
export declare function evaluateNotesBaseRegexpReplaceCall(call: {
    receiver: string;
    args: string;
}, resolveProperty: NotesBaseFormulaResolver, splitArgs: (args: string) => string[] | null, evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult, maxOutputLength: number): NotesBaseFormulaResult;
export declare function splitNotesBaseRegexpIsTypeCall(value: string): {
    args: string;
    receiver: string;
} | null;
export declare function evaluateNotesBaseRegexpAnyValueCall(value: string): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseRegexpMatchesCall(call: {
    receiver: string;
    args: string;
}, resolveProperty: NotesBaseFormulaResolver, splitArgs: (args: string) => string[] | null, evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult): NotesBaseFormulaResult;
export declare function evaluateNotesBaseRegexpSplitCall(call: {
    receiver: string;
    args: string;
}, resolveProperty: NotesBaseFormulaResolver, splitArgs: (args: string) => string[] | null, evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult, maxElements: number): NotesBaseFormulaResult;
export {};
//# sourceMappingURL=NotesBaseFormulaRegex.d.ts.map