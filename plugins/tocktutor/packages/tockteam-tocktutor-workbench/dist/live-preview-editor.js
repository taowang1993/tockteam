import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useMemo, } from 'react';
import { parseFrontmatterProperties } from "./properties.js";
export function splitLivePreviewSource(source) {
    const normalized = source.replace(/\r\n?/gu, '\n');
    const match = normalized.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u);
    return match === null ? { body: normalized, prefix: '' } : { body: normalized.slice(match[0].length), prefix: match[0] };
}
const LazyLivePreviewEditor = lazy(async () => {
    const module = await import("./live-preview-editor-runtime.js");
    return { default: module.LivePreviewEditorRuntime };
});
export function LivePreviewEditor(props) {
    const properties = useMemo(() => parseFrontmatterProperties(props.content), [props.content]);
    return (_jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col", children: [properties.length > 0 && (_jsx("dl", { "aria-label": "Live Preview Properties", className: "m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-[var(--tt-border)] bg-[var(--tt-panel)] px-4 py-2 text-xs", children: properties.map(property => (_jsxs("div", { className: "contents", children: [_jsx("dt", { className: "font-medium text-[var(--tt-muted)]", children: property.key }), _jsx("dd", { className: "m-0 truncate text-[var(--tt-text)]", children: Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '') })] }, property.key))) })), _jsx(Suspense, { fallback: _jsx("div", { "aria-label": props.ariaLabel ?? 'Live Preview Editor', className: props.className, children: "Loading Live Preview\u2026" }), children: _jsx(LazyLivePreviewEditor, { ...props }) })] }));
}
//# sourceMappingURL=live-preview-editor.js.map