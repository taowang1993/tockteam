import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Checkbox } from '@tockteam/ui/checkbox';
import { Button } from '@tockteam/ui/button';
import { Input } from '@tockteam/ui/input';
import { AlignLeft, Plus, Tags, X } from 'lucide-react';
import { lazy, Suspense, useId, useMemo, useState, } from 'react';
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
    const showProperties = properties.length > 0 || (props.onAddProperty !== undefined && props.source.trim() !== '');
    if (props.title === undefined && !showProperties)
        return null;
    return (_jsxs("header", { className: props.className, children: [props.title !== undefined && _jsx("h1", { className: "m-0 mb-5 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)]", children: props.title }), showProperties && (_jsxs("section", { children: [_jsx("h2", { className: "m-0 mb-2 text-xs font-semibold text-[var(--tt-text)]", children: "Properties" }), properties.length > 0 && (_jsx("dl", { "aria-label": "Document Properties", className: "m-0 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 text-xs", children: properties.map(property => {
                            const tags = property.key.toLocaleLowerCase() === 'tags' && Array.isArray(property.value) ? property.value : null;
                            const checkbox = property.type === 'checkbox' && typeof property.value === 'boolean';
                            const Icon = tags === null ? AlignLeft : Tags;
                            return (_jsxs("div", { className: "contents", children: [_jsxs("dt", { className: "flex min-h-6 min-w-0 items-center gap-2 font-medium text-[var(--tt-muted)]", children: [_jsx(Icon, { "aria-hidden": "true", className: "size-3 shrink-0" }), _jsx("span", { className: "truncate", children: property.key })] }), _jsx("dd", { className: `m-0 flex min-h-6 min-w-0 items-center text-[var(--tt-text)] ${tags === null ? 'truncate' : 'flex-wrap gap-1'}`, children: tags === null
                                            ? checkbox
                                                ? _jsx(Checkbox, { "aria-label": property.key, checked: property.value === true, className: "size-3.5 cursor-default disabled:opacity-100 data-[state=checked]:!border-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!bg-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!text-[#000]", disabled: true })
                                                : Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '')
                                            : tags.map((tag, index) => (_jsxs("span", { className: "inline-flex h-5 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,transparent)] px-2 text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]", children: [tag, props.onSetProperty !== undefined && _jsx(Button, { unstyled: true, "aria-label": `Remove ${tag} tag`, className: "inline-flex size-3 items-center justify-center border-0 bg-transparent p-0 text-current", onClick: () => { props.onSetProperty?.(property.key, tags.filter((_value, valueIndex) => valueIndex !== index)); }, type: "button", children: _jsx(X, { "aria-hidden": "true", className: "size-3" }) })] }, tag))) })] }, property.key));
                        }) })), props.onAddProperty !== undefined && (adding
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
    return (_jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col", children: [_jsx(MarkdownDocumentHeader, { className: "mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px]", source: props.content, ...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty }), ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), ...(props.title === undefined ? {} : { title: props.title }) }), _jsx(Suspense, { fallback: _jsx("div", { "aria-label": props.ariaLabel ?? 'Live Preview Editor', className: props.className, children: "Loading Live Preview\u2026" }), children: _jsx(LazyLivePreviewEditor, { ...props }) })] }));
}
//# sourceMappingURL=live-preview-editor.js.map