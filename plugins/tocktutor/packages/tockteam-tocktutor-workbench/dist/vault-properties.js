import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@tockteam/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty';
import { Field, FieldGroup } from '@tockteam/ui/field';
import { Input } from '@tockteam/ui/input';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { CalendarDays, CheckSquare, Hash, List, Tags, Text, X } from 'lucide-react';
import { useRef, useState } from 'react';
function propertyIcon(property) {
    if (property.types.length !== 1)
        return List;
    switch (property.types[0]) {
        case 'boolean': return CheckSquare;
        case 'number': return Hash;
        case 'date':
        case 'datetime': return CalendarDays;
        case 'list': return property.key.toLocaleLowerCase() === 'tags' ? Tags : List;
        default: return Text;
    }
}
export function VaultProperties({ properties, onSearch }) {
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('count');
    const inputRef = useRef(null);
    const filter = query.trim().toLocaleLowerCase();
    const visible = properties.filter(property => property.key.toLocaleLowerCase().includes(filter))
        .toSorted((a, b) => (sort === 'count' ? b.count - a.count : 0) || a.key.localeCompare(b.key));
    const clear = () => { setQuery(''); inputRef.current?.focus(); };
    return (_jsxs("div", { className: "grid min-w-0 gap-2", children: [_jsxs(FieldGroup, { className: "gap-2", children: [_jsxs(Field, { orientation: "horizontal", children: [_jsx(Input, { unstyled: true, "aria-label": "Filter Properties", className: "h-8 min-w-0 flex-1 rounded border border-[var(--tt-border)] bg-transparent px-2 text-xs outline-none focus-visible:border-[var(--tt-accent)]", onChange: event => { setQuery(event.target.value); }, onKeyDown: event => { if (event.key === 'Escape' && query !== '') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    clear();
                                } }, placeholder: "Filter properties\u2026", ref: inputRef, type: "search", value: query }), query !== '' && _jsx(Button, { unstyled: true, "aria-label": "Clear Property Filter", className: "[&_svg]:size-4 flex size-8 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] focus-visible:outline focus-visible:outline-[var(--tt-accent)]", onClick: clear, type: "button", children: _jsx(X, { "aria-hidden": "true", "data-icon": "inline-start" }) })] }), _jsxs(Field, { orientation: "horizontal", className: "justify-between", children: [_jsx("span", { "aria-live": "polite", className: "text-xs text-[var(--tt-muted)]", role: "status", children: filter === '' ? `${String(properties.length)} properties` : `${String(visible.length)} of ${String(properties.length)} properties` }), _jsxs(NativeSelect, { unstyled: true, "aria-label": "Sort Properties", className: "max-w-[60%] rounded border-0 bg-[var(--tt-panel)] py-1 text-xs text-[var(--tt-muted)] focus-visible:outline focus-visible:outline-[var(--tt-accent)]", onChange: event => { setSort(event.target.value); }, value: sort, children: [_jsx(NativeSelectOption, { value: "count", children: "Most used" }), _jsx(NativeSelectOption, { value: "name", children: "Name A\u2013Z" })] })] })] }), _jsxs("table", { "aria-label": "Vault Properties", className: "w-full table-fixed border-collapse text-xs", children: [_jsxs("colgroup", { children: [_jsx("col", {}), _jsx("col", { className: "w-10" })] }), _jsx("thead", { className: "sr-only", children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Property" }), _jsx("th", { scope: "col", children: "Count" })] }) }), _jsx("tbody", { children: visible.map(property => {
                            const Icon = propertyIcon(property);
                            const type = property.types.join(', ') || 'Unknown';
                            return (_jsxs("tr", { className: "group hover:bg-[var(--tt-selected)] focus-within:bg-[var(--tt-selected)]", children: [_jsxs("th", { className: "min-w-0 text-left font-normal", scope: "row", children: [_jsxs(Button, { unstyled: true, "aria-label": `Search Property ${property.key}`, className: "[&_svg]:size-4 flex w-full min-w-0 items-center gap-2 rounded border-0 bg-transparent px-1 py-1.5 text-left text-xs focus-visible:outline focus-visible:outline-[var(--tt-accent)]", onClick: () => { onSearch(property.key); }, title: `${property.key} · ${type}`, type: "button", children: [_jsx(Icon, { "aria-hidden": "true", className: "shrink-0 text-[var(--tt-muted)]", "data-icon": "inline-start" }), _jsx("span", { className: "truncate", children: property.key })] }), _jsx("span", { className: "sr-only", children: type })] }), _jsx("td", { className: "w-10 px-1 text-right tabular-nums text-[var(--tt-muted)]", title: `${String(property.count)} notes`, children: String(property.count) })] }, property.key));
                        }) })] }), visible.length === 0 && _jsx(Empty, { unstyled: true, className: "py-6 text-center", children: _jsxs(EmptyHeader, { unstyled: true, children: [_jsx(EmptyTitle, { unstyled: true, className: "text-xs", children: properties.length === 0 ? 'No properties.' : 'No matching properties.' }), _jsx(EmptyDescription, { unstyled: true, className: "mt-1 text-xs text-[var(--tt-muted)]", children: properties.length === 0 ? 'Add properties to a note to see them here.' : 'Try another property name or clear the filter.' })] }) })] }));
}
//# sourceMappingURL=vault-properties.js.map