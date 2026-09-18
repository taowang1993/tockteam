/**
 * Bounded Obsidian Bases nested filter grammar for `filters:` sections.
 *
 * A filters section contains a single statement string, a conjunction object
 * (`and`/`or`/`not` whose values are heterogeneous lists of objects and
 * statement strings), or a sequence of items that AND-combine. The parser is a
 * bounded recursive descent over indentation (depth ≤ 8, nodes ≤ 64). Anything
 * outside the documented subset degrades to an `unsupported` node so queries
 * keep failing closed.
 */
export declare const MAX_NOTES_BASE_FILTER_TREE_DEPTH = 8;
export declare const MAX_NOTES_BASE_FILTER_TREE_NODES = 64;
export type NotesBaseFilterTree = {
    kind: "statement";
    statement: string;
} | {
    kind: "and";
    children: NotesBaseFilterTree[];
} | {
    kind: "or";
    children: NotesBaseFilterTree[];
} | {
    kind: "not";
    children: NotesBaseFilterTree[];
} | {
    kind: "unsupported";
    raw: string;
};
export type NotesBaseFilterStatementResult = {
    supported: true;
    matched: boolean;
} | {
    supported: false;
    kind: "filter" | "formula";
    expression: string;
};
/** Parse the line block under a `filters:` key into a filter tree (fail-closed on malformed input). */
export declare function parseNotesBaseFilterBlock(lines: string[]): NotesBaseFilterTree;
/**
 * Evaluate a filter tree for one row. `and` requires every child, `or` any
 * child, and `not` excludes the row when any child is true. Any unevaluable
 * node fails closed with the unsupported-expression surface.
 */
export declare function evaluateNotesBaseFilterTree(tree: NotesBaseFilterTree, evaluateStatement: (statement: string) => NotesBaseFilterStatementResult): NotesBaseFilterStatementResult;
//# sourceMappingURL=NotesBaseFilterTree.d.ts.map