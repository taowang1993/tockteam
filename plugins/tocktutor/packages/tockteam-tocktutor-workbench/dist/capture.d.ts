export declare const MAX_TEMPLATE_BYTES = 1000000;
export declare function expandTemplate(template: string, context: {
    now: Date;
    title: string;
    content?: string;
    fromTitle?: string;
}): string;
export declare function buildCaptureNote(input: {
    body: string;
    existing: ReadonlySet<string>;
    folder?: string;
    now: Date;
    title: string;
}): {
    content: string;
    path: string;
};
export declare function buildJournalNote(input: {
    dateFormat?: string;
    folder: string;
    now: Date;
    template?: string;
}): {
    content: string;
    path: string;
};
export declare function uniqueNotePath(now: Date, existing: ReadonlySet<string>): string;
//# sourceMappingURL=capture.d.ts.map