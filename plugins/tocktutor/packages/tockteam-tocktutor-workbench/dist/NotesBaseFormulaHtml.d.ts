export declare const NOTES_BASE_HTML_TAGS: readonly ["strong", "em", "s", "u", "code"];
export type NotesBaseHtmlTag = typeof NOTES_BASE_HTML_TAGS[number];
export type NotesBaseHtmlNode = {
    readonly kind: "text";
    readonly value: string;
} | {
    readonly kind: "break";
    readonly key: number;
} | {
    readonly kind: "tag";
    readonly key: number;
    readonly tag: NotesBaseHtmlTag;
    readonly children: readonly NotesBaseHtmlNode[];
};
declare class NotesBaseHtmlValue {
    #private;
    constructor(nodes: readonly NotesBaseHtmlNode[], text: string);
    nodes(): readonly NotesBaseHtmlNode[];
    text(): string;
}
/** Parse a bounded inline subset into an evaluator-owned immutable value. */
export declare function createNotesBaseHtmlValue(source: string): NotesBaseHtmlValue | null;
/** Return parsed nodes only for evaluator-owned HTML values. */
export declare function notesBaseHtmlNodes(value: unknown): readonly NotesBaseHtmlNode[] | null;
/** Return visible inert text only for evaluator-owned HTML values. */
export declare function notesBaseHtmlText(value: unknown): string | null;
/** Emit fixed allowlisted markup only for evaluator-owned HTML values. */
export declare function notesBaseHtmlMarkup(value: unknown): string | null;
export {};
//# sourceMappingURL=NotesBaseFormulaHtml.d.ts.map