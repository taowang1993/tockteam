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
export const MAX_NOTES_BASE_FILTER_TREE_DEPTH = 8;
export const MAX_NOTES_BASE_FILTER_TREE_NODES = 64;
function filterBlockLines(lines) {
    const block = [];
    for (const line of lines) {
        const text = line.trim();
        if (!text || text.startsWith("#"))
            continue;
        block.push({ indent: /^\s*/u.exec(line)?.[0].length ?? 0, text });
    }
    return block;
}
function filterBlockText(block) {
    return block.map((line) => line.text).join(" ");
}
function cleanFilterStatement(value) {
    return value.trim().replace(/^['"]|['"]$/u, "");
}
/** Parse `- ` items at one indent level; each item is a statement or a nested conjunction. */
function parseFilterItems(block, depth, budget) {
    if (block.length === 0)
        return null;
    const itemIndent = block[0]?.indent ?? 0;
    const children = [];
    let index = 0;
    while (index < block.length) {
        const line = block[index] ?? { indent: -1, text: "" };
        if (line.indent !== itemIndent || !line.text.startsWith("- "))
            return null;
        let end = index + 1;
        while (end < block.length && (block[end]?.indent ?? 0) > itemIndent)
            end += 1;
        const subtree = block.slice(index + 1, end);
        const content = cleanFilterStatement(line.text.slice(2));
        budget.nodes += 1;
        if (budget.nodes > MAX_NOTES_BASE_FILTER_TREE_NODES || depth > MAX_NOTES_BASE_FILTER_TREE_DEPTH) {
            return null;
        }
        const conjunction = /^(and|or|not):$/u.exec(content);
        if (conjunction) {
            const nested = parseFilterItems(subtree, depth + 1, budget);
            if (!nested)
                return null;
            children.push({ kind: conjunction[1], children: nested });
        }
        else {
            if (subtree.length > 0)
                return null;
            children.push({ kind: "statement", statement: content });
        }
        index = end;
    }
    return children;
}
function parseFilterBlock(block, depth, budget) {
    const first = block[0];
    if (!first)
        return { kind: "unsupported", raw: "" };
    const conjunction = /^(and|or|not):$/u.exec(first.text);
    if (conjunction) {
        budget.nodes += 1;
        if (budget.nodes > MAX_NOTES_BASE_FILTER_TREE_NODES || depth > MAX_NOTES_BASE_FILTER_TREE_DEPTH) {
            return { kind: "unsupported", raw: filterBlockText(block) };
        }
        const children = parseFilterItems(block.slice(1), depth + 1, budget);
        if (!children)
            return { kind: "unsupported", raw: filterBlockText(block) };
        return { kind: conjunction[1], children };
    }
    if (first.text.startsWith("- ")) {
        const children = parseFilterItems(block, depth + 1, budget);
        if (!children)
            return { kind: "unsupported", raw: filterBlockText(block) };
        return { kind: "and", children };
    }
    if (block.length > 1)
        return { kind: "unsupported", raw: filterBlockText(block) };
    budget.nodes += 1;
    if (budget.nodes > MAX_NOTES_BASE_FILTER_TREE_NODES)
        return { kind: "unsupported", raw: filterBlockText(block) };
    return { kind: "statement", statement: cleanFilterStatement(first.text) };
}
/** Parse the line block under a `filters:` key into a filter tree (fail-closed on malformed input). */
export function parseNotesBaseFilterBlock(lines) {
    return parseFilterBlock(filterBlockLines(lines), 0, { nodes: 0 });
}
/**
 * Evaluate a filter tree for one row. `and` requires every child, `or` any
 * child, and `not` excludes the row when any child is true. Any unevaluable
 * node fails closed with the unsupported-expression surface.
 */
export function evaluateNotesBaseFilterTree(tree, evaluateStatement) {
    if (tree.kind === "unsupported") {
        return { supported: false, kind: "filter", expression: tree.raw };
    }
    if (tree.kind === "statement")
        return evaluateStatement(tree.statement);
    let matched = tree.kind !== "or";
    for (const child of tree.children) {
        const outcome = evaluateNotesBaseFilterTree(child, evaluateStatement);
        if (!outcome.supported)
            return outcome;
        if (tree.kind === "and")
            matched = matched && outcome.matched;
        else if (tree.kind === "or")
            matched = matched || outcome.matched;
        else
            matched = matched && !outcome.matched;
    }
    return { supported: true, matched };
}
//# sourceMappingURL=NotesBaseFilterTree.js.map