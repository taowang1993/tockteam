import type { ReactNode } from 'react';
import type { VaultLinksResult } from './types.ts';
/** Shared mention list for the relationship panel and document footer. */
export declare function NoteBacklinks(props: {
    links: VaultLinksResult | null | undefined;
    loading?: boolean;
    onSelect(path: string): void;
    onRetry: (() => void) | undefined;
}): ReactNode;
export declare function NoteOutgoingLinks(props: Parameters<typeof NoteBacklinks>[0]): ReactNode;
//# sourceMappingURL=note-backlinks.d.ts.map