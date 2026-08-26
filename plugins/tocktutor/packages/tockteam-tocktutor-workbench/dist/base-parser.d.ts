import { type NotesBaseFilterTree } from './NotesBaseFilterTree.ts';
export declare const MAX_EXECUTABLE_BASE_LIST_ITEMS = 256;
export declare const MAX_EXECUTABLE_BASE_FORMULAS = 128;
export declare const MAX_EXECUTABLE_BASE_SEARCH_LENGTH = 1000;
export interface ExecutableBaseSummary {
    expression: string;
    label: string;
}
export interface ExecutableBaseViewDefinition {
    coordinates: string | null;
    filters: NotesBaseFilterTree[];
    index: number;
    limit: number | null;
    name: string;
    order: string[];
    sort: string[];
    summaries: ExecutableBaseSummary[];
    type: 'table' | 'list' | 'cards' | 'map';
}
export interface ExecutableBaseDocument {
    filters: NotesBaseFilterTree[];
    formulas: Readonly<Record<string, string>>;
    properties: Readonly<Record<string, string>>;
    source: string;
    status: 'ready';
    views: readonly ExecutableBaseViewDefinition[];
}
export type ExecutableBaseParseResult = ExecutableBaseDocument | {
    reason: string;
    status: 'unsupported';
};
/** Parse the bounded executable subset of Obsidian Bases without normalizing source bytes. */
export declare function parseExecutableBase(source: string): ExecutableBaseParseResult;
//# sourceMappingURL=base-parser.d.ts.map