import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@tockteam/ui/button';
import { Input } from '@tockteam/ui/input';
import { AlignLeft, Plus, X } from 'lucide-react';
import { lazy, Suspense, useId, useMemo, useState, } from 'react';
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
    const errorId = useId();
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const cancel = () => {
        setAdding(false);
        setName('');
        setError('');
    };
    const showProperties = properties.length > 0 || props.onAddProperty !== undefined;
    if (props.title === undefined && !showProperties)
        return null;
    return (_jsxs("header", { className: props.className, children: [props.title !== undefined && _jsx("h1", { className: "m-0 mb-5 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)]", children: props.title }), showProperties && (_jsxs("section", { children: [_jsx("h2", { className: "m-0 mb-2 text-xs font-semibold text-[var(--tt-text)]", children: "Properties" }), properties.length > 0 && (_jsx("dl", { "aria-label": "Document Properties", className: "m-0 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 text-xs", children: properties.map(property => (_jsxs("div", { className: "contents", children: [_jsxs("dt", { className: "flex min-h-6 min-w-0 items-center gap-2 font-medium text-[var(--tt-muted)]", children: [_jsx(AlignLeft, { "aria-hidden": "true", className: "size-3 shrink-0" }), _jsx("span", { className: "truncate", children: property.key })] }), _jsx("dd", { className: "m-0 flex min-h-6 min-w-0 items-center truncate text-[var(--tt-text)]", children: Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '') })] }, property.key))) })), props.onAddProperty !== undefined && (adding
                        ? (_jsxs("form", { "aria-label": "Add Property", className: "mt-1 flex min-h-7 flex-wrap items-center gap-1", onKeyDown: event => {
                                if (event.key !== 'Escape')
                                    return;
                                event.preventDefault();
                                event.stopPropagation();
                                cancel();
                            }, onSubmit: event => {
                                event.preventDefault();
                                const key = name.trim();
                                if (key === '') {
                                    setError('Enter a property name.');
                                    return;
                                }
                                if (properties.some(property => property.key.toLocaleLowerCase() === key.toLocaleLowerCase())) {
                                    setError('A property with this name already exists.');
                                    return;
                                }
                                if (!props.onAddProperty?.(key)) {
                                    setError('That property could not be added.');
                                    return;
                                }
                                cancel();
                            }, children: [_jsx(Input, { "aria-describedby": error === '' ? undefined : errorId, "aria-invalid": error === '' ? undefined : true, "aria-label": "Property Name", autoFocus: true, className: "h-7 max-w-52 rounded-md text-xs", onChange: event => { setName(event.currentTarget.value); setError(''); }, placeholder: "Property name", value: name }), _jsx(Button, { className: "bg-transparent text-[var(--tt-text)]", size: "xs", type: "submit", variant: "outline", children: "Add" }), _jsx(Button, { "aria-label": "Cancel Adding Property", className: "bg-transparent", onClick: cancel, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(X, { "aria-hidden": "true" }) }), error !== '' && _jsx("span", { className: "basis-full text-xs text-[var(--dsw-alias-state-error-primary)]", id: errorId, role: "alert", children: error })] }))
                        : _jsxs(Button, { className: "mt-1 -ml-1 bg-transparent text-[var(--tt-muted)] hover:text-[var(--tt-text)]", onClick: () => { setAdding(true); }, size: "xs", type: "button", variant: "ghost", children: [_jsx(Plus, { "aria-hidden": "true" }), "Add Property"] }))] }))] }));
}
export function LivePreviewEditor(props) {
    const protectedSource = useMemo(() => isLivePreviewSourceProtected(props.content), [props.content]);
    return (_jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col", children: [_jsx(MarkdownDocumentHeader, { className: "mx-auto w-[calc(100%-48px)] max-w-3xl pt-[18px]", source: props.content, ...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty }), ...(props.title === undefined ? {} : { title: props.title }) }), protectedSource && _jsx("p", { className: "m-0 border-b border-[var(--tt-border)] px-4 py-2 text-xs text-[var(--tt-muted)]", role: "note", children: "Protected Markdown stays exact in Live Preview. Use Source mode for free-form edits; task and fold controls remain available." }), _jsx(Suspense, { fallback: _jsx("div", { "aria-label": props.ariaLabel ?? 'Live Preview Editor', className: props.className, children: "Loading Live Preview\u2026" }), children: _jsx(LazyLivePreviewEditor, { ...props }) })] }));
}
//# sourceMappingURL=live-preview-editor.js.map