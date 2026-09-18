type NotesBaseImageSource = {
    kind: "remote";
    value: string;
} | {
    kind: "local";
    value: string;
};
declare class NotesBaseImageValue {
    #private;
    constructor(source: NotesBaseImageSource);
    source(): NotesBaseImageSource;
}
/** Normalize one bounded absolute HTTP(S) image URL without creating an evaluator-owned value. */
export declare function normalizeNotesBaseImageUrl(input: string): string | null;
/** Create an evaluator-owned image value from one bounded remote URL or safe local image path. */
export declare function createNotesBaseImageValue(input: string): NotesBaseImageValue | null;
/** Return the normalized remote URL only for evaluator-owned remote image values. */
export declare function notesBaseImageUrl(value: unknown): string | null;
/** Return the normalized vault-relative path only for evaluator-owned local image values. */
export declare function notesBaseImagePath(value: unknown): string | null;
/** Return the inert URL/path projection only for evaluator-owned image values. */
export declare function notesBaseImageText(value: unknown): string | null;
export {};
//# sourceMappingURL=NotesBaseFormulaImage.d.ts.map