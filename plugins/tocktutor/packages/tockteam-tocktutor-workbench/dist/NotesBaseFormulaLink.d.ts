import { type NotesBaseIconName } from './NotesBaseFormulaIcon.ts';
type NotesBaseLinkDisplay = {
    kind: "text";
    value: string;
} | {
    kind: "icon";
    name: NotesBaseIconName;
    value: unknown;
} | null;
declare class NotesBaseLinkValue {
    #private;
    constructor(path: string, display: NotesBaseLinkDisplay);
    path(): string;
    text(): string;
    icon(): unknown;
}
/** Create an evaluator-owned internal Link value from an already-normalized vault path. */
export declare function createNotesBaseLinkValue(path: string, display: unknown): NotesBaseLinkValue | null;
/** Return the normalized vault path only for evaluator-owned Link values. */
export declare function notesBaseLinkPath(value: unknown): string | null;
/** Return the visible label only for evaluator-owned Link values. */
export declare function notesBaseLinkText(value: unknown): string | null;
/** Return only a verified evaluator-owned icon used as a Link display value. */
export declare function notesBaseLinkIcon(value: unknown): {} | null;
export {};
//# sourceMappingURL=NotesBaseFormulaLink.d.ts.map