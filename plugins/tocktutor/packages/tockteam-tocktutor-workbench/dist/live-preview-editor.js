import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useMemo, } from 'react';
import { parseFrontmatterProperties } from "./properties.js";
export function isLivePreviewSourceProtected(source) {
    return /(?:^|\n)\s*>\s*\[![A-Za-z][\w-]*\][+-]?|%%|\$\$|!\[\[|(?:^|\n) {0,3}(?:`{3,}|~{3,})\s*(?:base|mermaid)\b|<\/?[A-Za-z][^>]*>/u.test(source);
}
export function splitLivePreviewSource(source) {
    const normalized = source.replace(/\r\n?/gu, '\n');
    const match = normalized.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u);
    return match === null ? { body: normalized, prefix: '' } : { body: normalized.slice(match[0].length), prefix: match[0] };
}
const LazyLivePreviewEditor = lazy(async () => {
    const module = await import("./live-preview-editor-runtime.js");
    return { default: module.LivePreviewEditorRuntime };
});
export function MarkdownDocumentHeader(props) {
    const properties = useMemo(() => parseFrontmatterProperties(props.source), [props.source]);
    if (props.title === undefined && properties.length === 0)
        return null;
    return (_jsxs("header", { className: props.className, children: [props.title !== undefined && _jsx("h1", { className: "m-0 mb-5 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)]", children: props.title }), properties.length > 0 && (_jsxs("section", { children: [_jsx("h2", { className: "m-0 mb-2 text-xs font-semibold text-[var(--tt-text)]", children: "Properties" }), _jsx("dl", { "aria-label": "Document Properties", className: "m-0 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 text-xs", children: properties.map(property => (_jsxs("div", { className: "contents", children: [_jsxs("dt", { className: "flex min-h-6 min-w-0 items-center gap-2 font-medium text-[var(--tt-muted)]", children: [_jsx("span", { "aria-hidden": "true", children: "\u2261" }), _jsx("span", { className: "truncate", children: property.key })] }), _jsx("dd", { className: "m-0 flex min-h-6 min-w-0 items-center truncate text-[var(--tt-text)]", children: Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '') })] }, property.key))) })] }))] }));
}
export function LivePreviewEditor(props) {
    const protectedSource = useMemo(() => isLivePreviewSourceProtected(props.content), [props.content]);
    return (_jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col", children: [_jsx(MarkdownDocumentHeader, { className: "mx-auto w-[calc(100%-48px)] max-w-3xl pt-[18px]", source: props.content, ...(props.title === undefined ? {} : { title: props.title }) }), protectedSource && _jsx("p", { className: "m-0 border-b border-[var(--tt-border)] px-4 py-2 text-xs text-[var(--tt-muted)]", role: "note", children: "Protected Markdown stays exact in Live Preview. Use Source mode for free-form edits; task and fold controls remain available." }), _jsx(Suspense, { fallback: _jsx("div", { "aria-label": props.ariaLabel ?? 'Live Preview Editor', className: props.className, children: "Loading Live Preview\u2026" }), children: _jsx(LazyLivePreviewEditor, { ...props }) })] }));
}
//# sourceMappingURL=live-preview-editor.js.map