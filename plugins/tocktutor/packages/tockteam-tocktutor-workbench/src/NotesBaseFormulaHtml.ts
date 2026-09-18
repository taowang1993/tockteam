export const NOTES_BASE_HTML_TAGS = ["strong", "em", "s", "u", "code"] as const;

export type NotesBaseHtmlTag = typeof NOTES_BASE_HTML_TAGS[number];
export type NotesBaseHtmlNode =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "break"; readonly key: number }
  | { readonly kind: "tag"; readonly key: number; readonly tag: NotesBaseHtmlTag; readonly children: readonly NotesBaseHtmlNode[] };

const MAX_NOTES_BASE_HTML_LENGTH = 100_000;
const MAX_NOTES_BASE_HTML_NODES = 1_000;
const MAX_NOTES_BASE_HTML_DEPTH = 64;
const supportedTags = new Set<NotesBaseHtmlTag>(NOTES_BASE_HTML_TAGS);

function isNotesBaseHtmlTag(value: string): value is NotesBaseHtmlTag {
  return supportedTags.has(value as NotesBaseHtmlTag);
}

class NotesBaseHtmlValue {
  readonly #nodes: readonly NotesBaseHtmlNode[];
  readonly #text: string;

  constructor(nodes: readonly NotesBaseHtmlNode[], text: string) {
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

const notesBaseHtmlValues = new WeakSet<NotesBaseHtmlValue>();

function frozenNodes(nodes: NotesBaseHtmlNode[]): readonly NotesBaseHtmlNode[] {
  return Object.freeze(nodes.map((node) => node.kind === "tag"
    ? Object.freeze({ ...node, children: frozenNodes([...node.children]) })
    : Object.freeze(node)));
}

function visibleText(nodes: readonly NotesBaseHtmlNode[]): string {
  return nodes.map((node) => {
    if (node.kind === "text") return node.value;
    if (node.kind === "break") return "\n";
    return visibleText(node.children);
  }).join("");
}

function parseNotesBaseHtml(source: string): readonly NotesBaseHtmlNode[] | null {
  if (source.length > MAX_NOTES_BASE_HTML_LENGTH) return null;

  const root: NotesBaseHtmlNode[] = [];
  const stack: Array<{ tag: NotesBaseHtmlTag | null; children: NotesBaseHtmlNode[] }> = [{ tag: null, children: root }];
  let cursor = 0;
  let nodeCount = 0;

  const push = (node: NotesBaseHtmlNode) => {
    nodeCount += 1;
    if (nodeCount > MAX_NOTES_BASE_HTML_NODES) return false;
    const frame = stack.at(-1);
    if (!frame) return false;
    frame.children.push(node);
    return true;
  };

  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) {
      if (cursor < source.length && !push({ kind: "text", value: source.slice(cursor) })) return null;
      break;
    }
    if (open > cursor && !push({ kind: "text", value: source.slice(cursor, open) })) return null;

    const close = source.indexOf(">", open + 1);
    if (close < 0) return null;
    const token = source.slice(open, close + 1);
    if (/^<br\/?\s*>$/iu.test(token)) {
      if (!push({ kind: "break", key: nodeCount })) return null;
      cursor = close + 1;
      continue;
    }

    const closing = /^<\/([a-z]+)>$/iu.exec(token);
    if (closing) {
      const tag = (closing[1] ?? "").toLowerCase();
      const frame = stack.pop();
      if (!frame?.tag || frame.tag !== tag) return null;
      cursor = close + 1;
      continue;
    }

    const opening = /^<([a-z]+)>$/iu.exec(token);
    const tag = (opening?.[1] ?? "").toLowerCase();
    if (!opening || !isNotesBaseHtmlTag(tag) || stack.length > MAX_NOTES_BASE_HTML_DEPTH) return null;
    const children: NotesBaseHtmlNode[] = [];
    const node: NotesBaseHtmlNode = { kind: "tag", key: nodeCount, tag, children };
    if (!push(node)) return null;
    stack.push({ tag, children });
    cursor = close + 1;
  }

  return stack.length === 1 ? frozenNodes(root) : null;
}

/** Parse a bounded inline subset into an evaluator-owned immutable value. */
export function createNotesBaseHtmlValue(source: string) {
  const nodes = parseNotesBaseHtml(source);
  if (nodes === null) return null;
  const value = new NotesBaseHtmlValue(nodes, visibleText(nodes));
  notesBaseHtmlValues.add(value);
  return value;
}

function notesBaseHtmlValue(value: unknown) {
  return typeof value === "object" && value !== null && notesBaseHtmlValues.has(value as NotesBaseHtmlValue)
    ? value as NotesBaseHtmlValue
    : null;
}

/** Return parsed nodes only for evaluator-owned HTML values. */
export function notesBaseHtmlNodes(value: unknown) {
  return notesBaseHtmlValue(value)?.nodes() ?? null;
}

/** Return visible inert text only for evaluator-owned HTML values. */
export function notesBaseHtmlText(value: unknown) {
  return notesBaseHtmlValue(value)?.text() ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function renderNodes(nodes: readonly NotesBaseHtmlNode[]): string {
  return nodes.map((node) => {
    if (node.kind === "text") return escapeHtml(node.value);
    if (node.kind === "break") return "<br>";
    return `<${node.tag}>${renderNodes(node.children)}</${node.tag}>`;
  }).join("");
}

/** Emit fixed allowlisted markup only for evaluator-owned HTML values. */
export function notesBaseHtmlMarkup(value: unknown) {
  const nodes = notesBaseHtmlNodes(value);
  return nodes === null ? null : renderNodes(nodes);
}
