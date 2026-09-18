export const NOTES_BASE_HTML_TAGS = ["strong", "em", "s", "u", "code"];
const MAX_NOTES_BASE_HTML_LENGTH = 100_000;
const MAX_NOTES_BASE_HTML_NODES = 1_000;
const MAX_NOTES_BASE_HTML_DEPTH = 64;
const supportedTags = new Set(NOTES_BASE_HTML_TAGS);
function isNotesBaseHtmlTag(value) {
    return supportedTags.has(value);
}
class NotesBaseHtmlValue {
    #nodes;
    #text;
    constructor(nodes, text) {
        this.#nodes = nodes;
        this.#text = text;
        Object.freeze(this);
    }
    nodes() {
        return this.#nodes;
    }
    text() {
        return this.#text;
    }
}
const notesBaseHtmlValues = new WeakSet();
function frozenNodes(nodes) {
    return Object.freeze(nodes.map((node) => node.kind === "tag"
        ? Object.freeze({ ...node, children: frozenNodes([...node.children]) })
        : Object.freeze(node)));
}
function visibleText(nodes) {
    return nodes.map((node) => {
        if (node.kind === "text")
            return node.value;
        if (node.kind === "break")
            return "\n";
        return visibleText(node.children);
    }).join("");
}
function parseNotesBaseHtml(source) {
    if (source.length > MAX_NOTES_BASE_HTML_LENGTH)
        return null;
    const root = [];
    const stack = [{ tag: null, children: root }];
    let cursor = 0;
    let nodeCount = 0;
    const push = (node) => {
        nodeCount += 1;
        if (nodeCount > MAX_NOTES_BASE_HTML_NODES)
            return false;
        const frame = stack.at(-1);
        if (!frame)
            return false;
        frame.children.push(node);
        return true;
    };
    while (cursor < source.length) {
        const open = source.indexOf("<", cursor);
        if (open < 0) {
            if (cursor < source.length && !push({ kind: "text", value: source.slice(cursor) }))
                return null;
            break;
        }
        if (open > cursor && !push({ kind: "text", value: source.slice(cursor, open) }))
            return null;
        const close = source.indexOf(">", open + 1);
        if (close < 0)
            return null;
        const token = source.slice(open, close + 1);
        if (/^<br\/?\s*>$/iu.test(token)) {
            if (!push({ kind: "break", key: nodeCount }))
                return null;
            cursor = close + 1;
            continue;
        }
        const closing = /^<\/([a-z]+)>$/iu.exec(token);
        if (closing) {
            const tag = (closing[1] ?? "").toLowerCase();
            const frame = stack.pop();
            if (!frame?.tag || frame.tag !== tag)
                return null;
            cursor = close + 1;
            continue;
        }
        const opening = /^<([a-z]+)>$/iu.exec(token);
        const tag = (opening?.[1] ?? "").toLowerCase();
        if (!opening || !isNotesBaseHtmlTag(tag) || stack.length > MAX_NOTES_BASE_HTML_DEPTH)
            return null;
        const children = [];
        const node = { kind: "tag", key: nodeCount, tag, children };
        if (!push(node))
            return null;
        stack.push({ tag, children });
        cursor = close + 1;
    }
    return stack.length === 1 ? frozenNodes(root) : null;
}
/** Parse a bounded inline subset into an evaluator-owned immutable value. */
export function createNotesBaseHtmlValue(source) {
    const nodes = parseNotesBaseHtml(source);
    if (nodes === null)
        return null;
    const value = new NotesBaseHtmlValue(nodes, visibleText(nodes));
    notesBaseHtmlValues.add(value);
    return value;
}
function notesBaseHtmlValue(value) {
    return typeof value === "object" && value !== null && notesBaseHtmlValues.has(value)
        ? value
        : null;
}
/** Return parsed nodes only for evaluator-owned HTML values. */
export function notesBaseHtmlNodes(value) {
    return notesBaseHtmlValue(value)?.nodes() ?? null;
}
/** Return visible inert text only for evaluator-owned HTML values. */
export function notesBaseHtmlText(value) {
    return notesBaseHtmlValue(value)?.text() ?? null;
}
function escapeHtml(value) {
    return value
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/"/gu, "&quot;");
}
function renderNodes(nodes) {
    return nodes.map((node) => {
        if (node.kind === "text")
            return escapeHtml(node.value);
        if (node.kind === "break")
            return "<br>";
        return `<${node.tag}>${renderNodes(node.children)}</${node.tag}>`;
    }).join("");
}
/** Emit fixed allowlisted markup only for evaluator-owned HTML values. */
export function notesBaseHtmlMarkup(value) {
    const nodes = notesBaseHtmlNodes(value);
    return nodes === null ? null : renderNodes(nodes);
}
//# sourceMappingURL=NotesBaseFormulaHtml.js.map