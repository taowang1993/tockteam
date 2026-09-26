import type { VaultTreeEntry } from './types.ts';
export type SlashLinkRequest = {
    kind: 'note';
    path: string;
} | {
    kind: 'new-note';
    path: string;
} | {
    kind: 'attachment';
    path: string;
} | {
    kind: 'upload';
    file: File;
};
export interface SlashLinkResult {
    href: string;
    label: string;
    writtenPath?: string;
}
export declare class SlashWriteUncertainError extends Error {
    constructor(path: string);
}
export interface SlashLinkContext {
    sourcePath: string;
    entries: readonly VaultTreeEntry[];
    isCurrent(): boolean;
    resolve(request: SlashLinkRequest, signal: AbortSignal): Promise<SlashLinkResult>;
    reportUnlinked(result: SlashLinkResult): void;
}
/** Inputs are decoded, vault-relative identities; output is a Markdown URL, not a Host path. */
export declare function markdownLinkHref(source: string, target: string): string;
export declare function resolveMarkdownLink(source: string, href: string): {
    path: string;
    fragment: string | null;
} | null;
//# sourceMappingURL=markdown-links.d.ts.map