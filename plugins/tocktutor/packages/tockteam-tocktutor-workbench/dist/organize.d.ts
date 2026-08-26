export declare const MAX_ORGANIZE_BYTES = 1000000;
export declare const MAX_ORGANIZE_CAPTURES = 100;
export declare function buildHighlightNote(input: {
    highlights: readonly string[];
    now: Date;
    sourceUrl?: string;
    title: string;
}): {
    content: string;
    path: string;
};
export interface OrganizationProposal {
    captures: readonly string[];
    content: string;
    destination: string;
    id: string;
    title: string;
}
export declare function buildOrganizationProposal(input: {
    captures: ReadonlyArray<{
        content: string;
        path: string;
    }>;
    now: Date;
    title: string;
}): OrganizationProposal;
//# sourceMappingURL=organize.d.ts.map