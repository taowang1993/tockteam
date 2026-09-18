export type ComposerLeftover = 'link' | 'embed' | 'none';
export declare function extractSelectionToNote(input: {
    destinationPath: string;
    destinationTitle: string;
    end: number;
    leftover: ComposerLeftover;
    source: string;
    sourceTitle: string;
    start: number;
    template?: string;
}): {
    destinationContent: string;
    sourceContent: string;
};
export declare function mergeNotes(input: {
    destination: string;
    destinationPath: string;
    leftover: ComposerLeftover;
    placement: 'append' | 'prepend';
    source: string;
    sourcePath: string;
}): {
    destinationContent: string;
    sourceContent: string;
};
export interface FormatConversionOptions {
    deprecatedProperties?: boolean;
    roamBear?: boolean;
    zettelkasten?: ReadonlyMap<string, string>;
}
export declare function convertMarkdownFormats(source: string, options: FormatConversionOptions): string;
//# sourceMappingURL=composer.d.ts.map