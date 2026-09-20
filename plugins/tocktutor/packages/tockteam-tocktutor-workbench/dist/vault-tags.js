import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@tockteam/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty';
import { Field, FieldGroup } from '@tockteam/ui/field';
import { Input } from '@tockteam/ui/input';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, X } from 'lucide-react';
import { useRef, useState } from 'react';
function tagTree(tags) {
    const roots = [];
    const nodes = new Map();
    for (const tag of tags) {
        let siblings = roots;
        let path = '';
        for (const label of tag.tag.split('/')) {
            path = path === '' ? label : `${path}/${label}`;
            const key = path.toLocaleLowerCase();
            let node = nodes.get(key);
            if (node === undefined) {
                node = { path, label, count: 0, children: [] };
                nodes.set(key, node);
                siblings.push(node);
            }
            node.count += tag.count;
            siblings = node.children;
        }
    }
    return roots;
}
const controlClass = '[&_svg]:size-4 flex size-7 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] focus-visible:outline focus-visible:outline-[var(--tt-accent)] disabled:opacity-40';
function TagRows({ nodes, collapsed, onToggle, onSearch, nested = false, filtering = false }) {
    return _jsx("ul", { "aria-label": nested ? undefined : 'Vault Tags', className: nested ? 'm-0 ml-3 list-none border-l border-[var(--tt-border)] py-0 pl-2 pr-0' : 'm-0 list-none p-0', children: nodes.map(node => {
            const branch = node.children.length > 0;
            const folded = !filtering && collapsed.has(node.path);
            const countLabel = branch ? `${String(node.count)} tag uses including nested tags; notes may count more than once` : `${String(node.count)} notes`;
            return _jsxs("li", { children: [_jsxs("div", { className: "flex min-w-0 items-center rounded hover:bg-[var(--tt-selected)] focus-within:bg-[var(--tt-selected)]", children: [branch ? _jsx(Button, { unstyled: true, "aria-label": `${folded ? 'Expand' : 'Collapse'} Tag ${node.path}`, "aria-expanded": !folded, className: controlClass, disabled: filtering, onClick: () => { onToggle(node.path); }, type: "button", children: _jsx(ChevronRight, { "aria-hidden": "true", className: folded ? '' : 'rotate-90', "data-icon": "inline-start" }) }) : _jsx("span", { "aria-hidden": "true", className: "w-7 shrink-0" }), _jsxs(Button, { unstyled: true, "aria-label": `Search Tag ${node.path}`, className: "flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded border-0 bg-transparent py-1 pl-0 pr-1 text-left text-xs focus-visible:outline focus-visible:outline-[var(--tt-accent)]", onClick: () => { onSearch(node.path); }, title: `#${node.path} · ${countLabel}`, type: "button", children: [_jsx("span", { className: "min-w-0 flex-1 truncate", children: node.label }), _jsx("span", { className: "shrink-0 text-right tabular-nums text-[var(--tt-muted)]", title: countLabel, children: node.count })] })] }), branch && !folded && _jsx(TagRows, { nodes: node.children, collapsed: collapsed, onToggle: onToggle, onSearch: onSearch, nested: true, filtering: filtering })] }, node.path);
        }) });
}
export function VaultTags({ tags, onSearch }) {
    const [collapsed, setCollapsed] = useState(new Set());
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('count');
    const [nested, setNested] = useState(true);
    const inputRef = useRef(null);
    const filter = query.trim().replace(/^#/, '').toLocaleLowerCase();
    const roots = nested ? tagTree(tags) : tags.map(tag => ({ path: tag.tag, label: tag.tag, count: tag.count, children: [] }));
    const branches = [];
    const project = (nodes) => nodes.flatMap(node => {
        if (node.children.length > 0)
            branches.push(node.path);
        const children = project(node.children);
        return node.path.toLocaleLowerCase().includes(filter) || children.length > 0 ? [{ ...node, children }] : [];
    }).toSorted((a, b) => (sort === 'count' ? b.count - a.count : 0) || a.path.localeCompare(b.path));
    const visible = project(roots);
    const matches = tags.filter(tag => tag.tag.toLocaleLowerCase().includes(filter)).length;
    const clear = () => { setQuery(''); inputRef.current?.focus(); };
    const toggle = (path) => { setCollapsed(current => { const next = new Set(current); if (next.has(path))
        next.delete(path);
    else
        next.add(path); return next; }); };
    return _jsxs("div", { className: "grid min-w-0 gap-2", children: [_jsxs(FieldGroup, { className: "gap-2", children: [_jsxs(Field, { orientation: "horizontal", children: [_jsx(Input, { unstyled: true, "aria-label": "Filter Tags", className: "h-8 min-w-0 flex-1 rounded border border-[var(--tt-border)] bg-transparent px-2 text-xs outline-none focus-visible:border-[var(--tt-accent)]", onChange: event => { setQuery(event.target.value); }, onKeyDown: event => { if (event.key === 'Escape' && query !== '') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    clear();
                                } }, placeholder: "Filter tags\u2026", ref: inputRef, type: "search", value: query }), query !== '' && _jsx(Button, { unstyled: true, "aria-label": "Clear Tag Filter", className: controlClass, onClick: clear, type: "button", children: _jsx(X, { "aria-hidden": "true", "data-icon": "inline-start" }) })] }), _jsxs(Field, { orientation: "horizontal", className: "justify-between", children: [_jsxs(NativeSelect, { unstyled: true, "aria-label": "Sort Tags", className: "min-w-0 max-w-[50%] rounded border-0 bg-[var(--tt-panel)] py-1 text-xs text-[var(--tt-muted)] focus-visible:outline focus-visible:outline-[var(--tt-accent)]", onChange: event => { setSort(event.target.value); }, value: sort, children: [_jsx(NativeSelectOption, { value: "count", children: "Most used" }), _jsx(NativeSelectOption, { value: "name", children: "Name A\u2013Z" })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx(Button, { unstyled: true, "aria-label": "Show Nested Tags", "aria-pressed": nested, className: `${controlClass} aria-pressed:bg-[var(--tt-selected)] aria-pressed:text-[var(--tt-text)]`, onClick: () => { setNested(current => !current); }, title: "Show nested tags", type: "button", children: _jsx(ListTree, { "aria-hidden": "true", "data-icon": "inline-start" }) }), _jsx(Button, { unstyled: true, "aria-label": "Expand All Tags", className: controlClass, disabled: branches.length === 0 || filter !== '', onClick: () => { setCollapsed(new Set()); }, title: "Expand all tags", type: "button", children: _jsx(ChevronsUpDown, { "aria-hidden": "true", "data-icon": "inline-start" }) }), _jsx(Button, { unstyled: true, "aria-label": "Collapse All Tags", className: controlClass, disabled: branches.length === 0 || filter !== '', onClick: () => { setCollapsed(new Set(branches)); }, title: "Collapse all tags", type: "button", children: _jsx(ChevronsDownUp, { "aria-hidden": "true", "data-icon": "inline-start" }) })] })] })] }), _jsx("span", { className: "text-xs text-[var(--tt-muted)]", role: "status", children: filter === '' ? `${String(tags.length)} tags` : `${String(matches)} of ${String(tags.length)} tags` }), _jsx(TagRows, { nodes: visible, collapsed: collapsed, onToggle: toggle, onSearch: onSearch, filtering: filter !== '' }), visible.length === 0 && _jsx(Empty, { unstyled: true, className: "py-6 text-center", children: _jsxs(EmptyHeader, { unstyled: true, children: [_jsx(EmptyTitle, { unstyled: true, className: "text-xs", children: tags.length === 0 ? 'No tags.' : 'No matching tags.' }), _jsx(EmptyDescription, { unstyled: true, className: "mt-1 text-xs text-[var(--tt-muted)]", children: tags.length === 0 ? 'Add a tag to a note to see it here.' : 'Try another tag or clear the filter.' })] }) })] });
}
//# sourceMappingURL=vault-tags.js.map