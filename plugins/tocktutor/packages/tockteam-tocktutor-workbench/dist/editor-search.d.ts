export declare const MAX_EDITOR_SEARCH_MATCHES = 10000;
export declare const MAX_EDITOR_SEARCH_QUERY_LENGTH = 100000;
export interface EditorSearchMatch {
    from: number;
    to: number;
}
export type EditorSearchAction = 'next' | 'previous' | 'replace' | 'replace-all';
export interface EditorSearchRequest {
    action: EditorSearchAction;
    consume?: () => boolean;
    id: number;
    replacement?: string;
}
export interface EditorSearchState {
    current: number | null;
    error?: string;
    query: string;
    total: number;
    truncated?: boolean;
}
export interface EditorSearchMatches {
    error?: string;
    matches: readonly EditorSearchMatch[];
    truncated: boolean;
}
export declare function searchEditorMatches(source: string, query: string, limit?: number): EditorSearchMatches;
export declare function findEditorMatches(source: string, query: string, limit?: number): readonly EditorSearchMatch[];
export declare function clampEditorSearchIndex(total: number, index: number | null | undefined): number | null;
export declare function moveEditorSearchIndex(total: number, current: number | null | undefined, direction: -1 | 1): number | null;
//# sourceMappingURL=editor-search.d.ts.map