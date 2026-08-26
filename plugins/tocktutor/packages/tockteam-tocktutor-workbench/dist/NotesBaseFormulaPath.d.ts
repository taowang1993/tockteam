type NotesBaseFormulaResult = {
    supported: true;
    value: unknown;
} | {
    supported: false;
};
type NotesBaseFormulaResolver = (property: string) => unknown;
type NotesBaseFileLinkTargetResolver = (normalizedSourcePath: string, normalizedTargetPath: string) => boolean | null;
export declare function normalizeNotesBaseFilePath(value: string): string | null;
export declare function normalizeNotesBaseLinkPath(value: string): string | null;
export declare function notesBaseFilePathField(value: string, field: string): string | null;
export declare function evaluateNotesBaseFileInFolderCall(call: {
    receiver: string;
    args: string;
}, resolveProperty: NotesBaseFormulaResolver, splitArgs: (args: string) => string[] | null, evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult): NotesBaseFormulaResult;
export declare function evaluateNotesBaseFileHasLinkCall(call: {
    receiver: string;
    args: string;
}, resolveProperty: NotesBaseFormulaResolver, fileLinksContain: NotesBaseFileLinkTargetResolver | undefined, splitArgs: (args: string) => string[] | null, evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult): NotesBaseFormulaResult;
export declare function evaluateNotesBaseLinkLinksToCall(call: {
    receiver: string;
    args: string;
}, resolveProperty: NotesBaseFormulaResolver, fileLinksContain: NotesBaseFileLinkTargetResolver | undefined, splitArgs: (args: string) => string[] | null, evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult): NotesBaseFormulaResult;
export declare function notesBaseFileLinkTargets(links: unknown): Set<string> | null;
export declare function notesBaseFileLinksSnapshot(links: unknown): string[] | null;
export declare function notesBaseFileLinksContain(links: unknown, normalizedCandidate: string): false | null;
export {};
//# sourceMappingURL=NotesBaseFormulaPath.d.ts.map