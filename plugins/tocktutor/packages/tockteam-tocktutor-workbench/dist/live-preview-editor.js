import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Checkbox } from '@tockteam/ui/checkbox';
import { Button } from '@tockteam/ui/button';
import { Input } from '@tockteam/ui/input';
import { AlignLeft, CalendarDays, CheckSquare, ChevronRight, Hash, List, Plus, Tags, X } from 'lucide-react';
import { lazy, Suspense, useId, useMemo, useState, } from 'react';
import { MAX_FRONTMATTER_BYTES, MAX_PROPERTIES, parseFrontmatterProperties } from "./properties.js";
const propertyIcons = { text: AlignLeft, list: List, number: Hash, checkbox: CheckSquare, date: CalendarDays, datetime: CalendarDays, mixed: List };
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
function editedPropertyValue(previous, text) {
    if (Array.isArray(previous)) {
        const value = JSON.parse(text);
        if (!Array.isArray(value) || !value.every(item => typeof item === 'string'))
            throw new Error('Use a JSON list of strings.');
        return value;
    }
    if (typeof previous === 'number') {
        const value = Number(text);
        if (!Number.isFinite(value) || text.trim() === '')
            throw new Error('Enter a finite number.');
        return value;
    }
    return previous === null && text === '' ? null : text;
}
export function MarkdownDocumentHeader(props) {
    const properties = useMemo(() => parseFrontmatterProperties(props.source), [props.source]);
    const errorId = useId();
    const propertiesId = useId();
    const [propertiesExpanded, setPropertiesExpanded] = useState(true);
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const cancel = () => {
        setAdding(false);
        setName('');
        setError('');
    };
    if (props.editableProperties && new TextEncoder().encode(props.source).byteLength > MAX_FRONTMATTER_BYTES)
        return _jsx("p", { role: "status", children: "This note is too large to edit properties. Use Source Mode." });
    const showProperties = properties.length > 0 || props.editableProperties === true;
    if (props.title === undefined && !showProperties)
        return null;
    return (_jsxs("header", { className: props.className, children: [props.title !== undefined && _jsx("h1", { className: "m-0 mb-5 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)]", children: props.title }), props.editableProperties && error && !adding && _jsx("p", { role: "alert", children: error }), props.editableProperties && properties.length >= MAX_PROPERTIES && _jsx("p", { role: "status", children: "The property limit was reached; this list may be incomplete. Use Source Mode." }), props.editableProperties && properties.length === 0 && _jsx("p", { className: "text-xs text-[var(--tt-muted)]", children: "No properties." }), showProperties && (_jsxs("section", { children: [_jsx("h2", { className: "m-0 mb-3 text-base font-semibold text-[var(--tt-text)]", children: _jsxs(Button, { unstyled: true, "aria-controls": propertiesId, "aria-expanded": propertiesExpanded, className: "group relative flex min-h-6 w-full cursor-pointer items-center rounded border-0 bg-transparent p-0 text-left text-inherit hover:text-[var(--tt-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tt-accent)]", onClick: () => { setPropertiesExpanded(expanded => !expanded); }, type: "button", children: [_jsx(ChevronRight, { "aria-hidden": "true", className: "absolute -left-5 size-4 text-[var(--tt-muted)] group-aria-expanded:rotate-90", "data-icon": "inline-start" }), "Properties"] }) }), _jsxs("div", { hidden: !propertiesExpanded, id: propertiesId, children: [properties.length > 0 && (_jsx("dl", { "aria-label": "Document Properties", className: "m-0 grid grid-cols-[minmax(96px,140px)_minmax(0,1fr)] gap-x-3 text-sm leading-6", children: properties.map(property => {
                                    const tags = property.key.toLocaleLowerCase() === 'tags' && Array.isArray(property.value) ? property.value : null;
                                    const checkbox = property.type === 'checkbox' && typeof property.value === 'boolean';
                                    const Icon = tags === null ? propertyIcons[property.type] : Tags;
                                    return (_jsxs("div", { className: "contents", children: [_jsxs("dt", { className: "flex min-h-8 min-w-0 items-center gap-2 self-start text-[var(--tt-muted)]", title: `${property.key} · ${property.type}`, children: [_jsx(Icon, { "aria-hidden": "true", className: "size-4 shrink-0" }), _jsx("span", { className: "truncate", children: property.key })] }), _jsx("dd", { className: "m-0 flex min-h-8 min-w-0 flex-wrap items-center gap-1 py-1 text-[var(--tt-text)]", children: props.editableProperties && !checkbox ? _jsx(Input, { "aria-label": `Property ${property.key}`, defaultValue: Array.isArray(property.value) ? JSON.stringify(property.value) : String(property.value ?? ''), onBlur: event => {
                                                        try {
                                                            const text = event.currentTarget.value;
                                                            const value = editedPropertyValue(property.value, text);
                                                            if (JSON.stringify(value) !== JSON.stringify(property.value) && !props.onSetProperty?.(property.key, value))
                                                                throw new Error('This property could not be changed. Use Source Mode for structured values, or retry against the current note.');
                                                            setError('');
                                                        }
                                                        catch (error) {
                                                            setError(error instanceof Error ? error.message : 'Invalid property value.');
                                                        }
                                                    } }, JSON.stringify(property.value)) : tags === null
                                                    ? checkbox
                                                        ? _jsx(Checkbox, { "aria-label": property.key, checked: property.value === true, className: "size-4 cursor-default disabled:opacity-100 data-[state=checked]:!border-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!bg-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!text-[#000]", disabled: !props.editableProperties, onCheckedChange: checked => { if (!props.onSetProperty?.(property.key, checked === true))
                                                                setError('This property could not be changed.'); } })
                                                        : _jsx("span", { className: "min-w-0 [overflow-wrap:anywhere]", children: Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '') })
                                                    : tags.map((tag, index) => (_jsxs("span", { className: "inline-flex min-h-6 max-w-full items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,transparent)] px-2 text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]", children: [_jsx("span", { className: "min-w-0 [overflow-wrap:anywhere]", children: tag }), props.onSetProperty !== undefined && _jsx(Button, { unstyled: true, "aria-label": `Remove ${tag} tag`, className: "inline-flex size-5 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-current focus-visible:outline focus-visible:outline-[var(--tt-accent)]", onClick: () => { props.onSetProperty?.(property.key, tags.filter((_value, valueIndex) => valueIndex !== index)); }, type: "button", children: _jsx(X, { "aria-hidden": "true", className: "size-3" }) })] }, tag))) })] }, property.key));
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
                                : _jsxs(Button, { className: "mt-2 -ml-2.5 bg-transparent text-[var(--tt-muted)] hover:text-[var(--tt-text)]", onClick: () => { setAdding(true); }, type: "button", variant: "ghost", children: [_jsx(Plus, { "aria-hidden": "true", "data-icon": "inline-start" }), "Add Property"] }))] })] }))] }));
}
export function LivePreviewEditor(props) {
    return (_jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col", children: [_jsx(MarkdownDocumentHeader, { className: "mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px]", source: props.content, ...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty }), ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), ...(props.title === undefined ? {} : { title: props.title }) }), _jsx(Suspense, { fallback: _jsx("div", { "aria-label": props.ariaLabel ?? 'Live Preview Editor', className: props.className, children: "Loading Live Preview\u2026" }), children: _jsx(LazyLivePreviewEditor, { ...props }) })] }));
}
//# sourceMappingURL=live-preview-editor.js.map