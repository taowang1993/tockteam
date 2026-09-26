import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef, useState, } from 'react';
import { ArrowDownUp, ChevronsUpDown, LayoutGrid, List, ListFilter, ListTree, MapPin, Plus, Search, Table2 } from 'lucide-react';
import { Button } from '@tockteam/ui/button';
import { Checkbox } from '@tockteam/ui/checkbox';
import { Field, FieldLabel } from '@tockteam/ui/field';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@tockteam/ui/popover';
import { appendBaseView, setBaseViewField } from "./base-authoring.js";
import { parseFrontmatterProperties } from "./properties.js";
import { createExecutableBaseFrontmatterEdit } from "./base-edit.js";
import { parseExecutableBase } from "./base-parser.js";
import { executableBaseCellRangeTsv, executableBaseCsvFilename, executableBaseViewCsv, executableBaseViewTsv, } from "./base-spreadsheet.js";
import { createBaseViewModel } from "./base-view-model.js";
function resultCount(count) {
    return `${String(count)} ${count === 1 ? 'Result' : 'Results'}`;
}
function cellKey(view, path, column) {
    return `${view}\0${path}\0${String(column)}`;
}
function readableKind(kind) {
    return kind === 'map-label' ? 'Map Labels' : `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
}
function SummaryList(props) {
    if (props.model.summaries.length === 0)
        return null;
    return (_jsx("dl", { "aria-label": `${props.model.view.name} Summaries`, className: "flex flex-wrap gap-2", children: props.model.summaries.map(summary => (_jsxs("div", { className: "rounded-md border border-[var(--tt-border)] px-2 py-1 text-xs", children: [_jsxs("dt", { className: "inline font-medium", children: [summary.label, ": "] }), _jsx("dd", { className: "inline", children: String(summary.value ?? '') })] }, summary.expression))) }));
}
function ReadonlyLayouts(props) {
    const { model } = props;
    if (model.kind === 'list') {
        return (_jsx("ul", { "aria-label": `${model.view.name} Results`, className: "space-y-1.5", children: model.rows.map(row => (_jsx("li", { className: "rounded-md border border-[var(--tt-border)] p-2", children: row.cells.map((cell, index) => (_jsxs("span", { children: [index > 0 ? _jsx("span", { "aria-hidden": "true", children: " \u00B7 " }) : null, _jsx("span", { className: index === 0 ? 'font-medium' : 'text-[var(--tt-muted)]', children: cell.text })] }, cell.column))) }, row.path))) }));
    }
    if (model.kind === 'cards') {
        return (_jsx("ul", { "aria-label": `${model.view.name} Results`, className: "grid list-none grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 p-0", children: model.rows.map(row => (_jsx("li", { className: "rounded-lg border border-[var(--tt-border)] p-3", children: row.cells.map(cell => (_jsxs("p", { className: "m-0 text-sm", children: [_jsxs("strong", { children: [cell.label, ":"] }), " ", cell.text] }, cell.column))) }, row.path))) }));
    }
    return (_jsx("ul", { "aria-label": `${model.view.name} Map Labels`, className: "space-y-1.5", children: model.rows.map(row => {
            const coordinateCell = model.view.coordinates === null
                ? undefined
                : row.cells.find(cell => cell.column === model.view.coordinates);
            return (_jsxs("li", { className: "flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--tt-border)] p-2", children: [_jsx("span", { className: "font-medium", children: row.cells[0]?.text || row.path }), _jsx("span", { className: "text-xs text-[var(--tt-muted)]", children: row.coordinates === null ? 'Coordinates Unavailable' : coordinateCell?.text ?? `${String(row.coordinates.latitude)}, ${String(row.coordinates.longitude)}` })] }, row.path));
        }) }));
}
function EditableCell(props) {
    const { cell, row } = props;
    const errorId = useId();
    const authorityKey = `${row.revision}\0${row.source}`;
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const [value, setValue] = useState(cell.text);
    const authorityRef = useRef({ key: authorityKey, text: cell.text });
    const pendingRef = useRef(null);
    const tokenRef = useRef(0);
    useEffect(() => {
        authorityRef.current = { key: authorityKey, text: cell.text };
        setError(null);
        setValue(cell.text);
    }, [authorityKey, cell.text]);
    useEffect(() => () => {
        pendingRef.current = null;
    }, []);
    if (!cell.editable || cell.inputType === null || props.onEdit === undefined)
        return cell.text;
    const label = `Edit ${cell.label} for ${row.path}`;
    const onEdit = props.onEdit;
    const emit = (rawValue) => {
        const request = createExecutableBaseFrontmatterEdit({ path: row.path, revision: row.revision, source: row.source }, cell.column, rawValue);
        if (request === null)
            return;
        const token = tokenRef.current + 1;
        tokenRef.current = token;
        const requestAuthorityKey = authorityRef.current.key;
        pendingRef.current = { authorityKey: requestAuthorityKey, token };
        setError(null);
        setPending(true);
        const settle = (success) => {
            if (pendingRef.current?.token !== token)
                return;
            pendingRef.current = null;
            setPending(false);
            if (authorityRef.current.key !== requestAuthorityKey)
                return;
            if (success) {
                setValue(rawValue);
                setError(null);
            }
            else {
                setValue(authorityRef.current.text);
                setError('The Base cell could not be saved.');
            }
        };
        let result;
        try {
            result = onEdit(request);
        }
        catch {
            settle(false);
            return;
        }
        void Promise.resolve(result).then(value => { settle(value !== false); }, () => { settle(false); });
    };
    const feedback = error === null ? null : _jsx("span", { className: "block text-xs text-[var(--dsw-alias-state-error-primary)]", id: errorId, role: "alert", children: error });
    if (cell.inputType === 'checkbox') {
        return _jsxs("span", { className: "grid gap-1", children: [_jsx(Checkbox, { "aria-describedby": error === null ? undefined : errorId, "aria-invalid": error === null ? undefined : true, "aria-label": label, checked: value === 'true', disabled: pending, onCheckedChange: checked => emit(checked === true ? 'true' : 'false') }), feedback] });
    }
    return (_jsxs("span", { className: "grid gap-1", children: [_jsx(Input, { unstyled: true, "aria-describedby": error === null ? undefined : errorId, "aria-invalid": error === null ? undefined : true, "aria-label": label, className: "min-w-24 rounded border border-[var(--tt-border)] bg-transparent px-1.5 py-1", disabled: pending, type: cell.inputType, value: value, onBlur: event => {
                    if (!pending && event.currentTarget.value !== authorityRef.current.text)
                        emit(event.currentTarget.value);
                }, onChange: event => { setValue(event.currentTarget.value); setError(null); } }), feedback] }));
}
function ExecutableTable(props) {
    const { model } = props;
    const [selected, setSelected] = useState(null);
    const [anchor, setAnchor] = useState(null);
    const refs = useRef(new Map());
    const selectedRow = selected?.view === model.view.name ? model.rows.findIndex(row => row.path === selected.path) : -1;
    const selectedVisible = selected !== null && selectedRow >= 0 && selected.column < model.columns.length;
    const anchorRow = anchor?.view === model.view.name ? model.rows.findIndex(row => row.path === anchor.path) : -1;
    const range = selectedVisible && anchor !== null && anchorRow >= 0
        ? {
            columnEnd: Math.max(selected.column, Math.min(anchor.column, model.columns.length - 1)),
            columnStart: Math.min(selected.column, Math.min(anchor.column, model.columns.length - 1)),
            rowEnd: Math.max(selectedRow, anchorRow),
            rowStart: Math.min(selectedRow, anchorRow),
        }
        : null;
    const focusCell = (rowIndex, column, extend) => {
        if (model.rows.length === 0 || model.columns.length === 0)
            return;
        const boundedRow = Math.max(0, Math.min(rowIndex, model.rows.length - 1));
        const boundedColumn = Math.max(0, Math.min(column, model.columns.length - 1));
        const path = model.rows[boundedRow]?.path;
        if (path === undefined)
            return;
        setAnchor(extend ? anchor ?? (selectedVisible ? selected : null) : null);
        const next = { column: boundedColumn, path, view: model.view.name };
        setSelected(next);
        refs.current.get(cellKey(next.view, next.path, next.column))?.focus();
    };
    const copySelection = () => {
        if (!selectedVisible || selected === null || props.onCopy === undefined)
            return;
        const rectangle = range ?? {
            columnEnd: selected.column,
            columnStart: selected.column,
            rowEnd: selectedRow,
            rowStart: selectedRow,
        };
        const values = model.rows.slice(rectangle.rowStart, rectangle.rowEnd + 1).map(row => (row.cells.slice(rectangle.columnStart, rectangle.columnEnd + 1).map(cell => cell.value)));
        const text = executableBaseCellRangeTsv(values);
        if (text !== null)
            props.onCopy({ kind: 'selection', text, view: model.view.name });
    };
    const handleKeyDown = (event, row, column) => {
        if (event.target !== event.currentTarget || event.altKey)
            return;
        if (event.ctrlKey || event.metaKey) {
            if (event.key.toLocaleLowerCase() === 'c') {
                event.preventDefault();
                copySelection();
            }
            return;
        }
        let nextRow = row;
        let nextColumn = column;
        if (event.key === 'ArrowLeft')
            nextColumn -= 1;
        else if (event.key === 'ArrowRight')
            nextColumn += 1;
        else if (event.key === 'ArrowUp')
            nextRow -= 1;
        else if (event.key === 'ArrowDown')
            nextRow += 1;
        else if (event.key === 'Home')
            nextColumn = 0;
        else if (event.key === 'End')
            nextColumn = model.columns.length - 1;
        else if (event.key === 'Tab') {
            const flat = row * model.columns.length + column + (event.shiftKey ? -1 : 1);
            if (flat < 0 || flat >= model.rows.length * model.columns.length)
                return;
            nextRow = Math.floor(flat / model.columns.length);
            nextColumn = flat % model.columns.length;
        }
        else if (event.key === 'Enter') {
            const control = event.currentTarget.querySelector('input, button, select, textarea');
            if (control === null)
                return;
            event.preventDefault();
            control.focus();
            return;
        }
        else if (event.key === 'Escape') {
            event.preventDefault();
            setSelected(null);
            setAnchor(null);
            event.currentTarget.blur();
            return;
        }
        else
            return;
        event.preventDefault();
        focusCell(nextRow, nextColumn, event.shiftKey && event.key.startsWith('Arrow'));
    };
    return (_jsx("div", { className: "overflow-auto", children: _jsxs("table", { "aria-label": `${model.view.name} Results`, className: "w-full border-collapse text-sm", role: "grid", children: [_jsx("thead", { children: _jsx("tr", { children: model.columns.map(column => _jsx("th", { className: "border border-[var(--tt-border)] p-2 text-left", children: column.label }, column.key)) }) }), _jsx("tbody", { children: model.rows.map((row, rowIndex) => (_jsx("tr", { children: row.cells.map((cell, columnIndex) => {
                            const active = selectedVisible && selected?.path === row.path && selected.column === columnIndex;
                            const inRange = selectedVisible && (range === null
                                ? active
                                : rowIndex >= range.rowStart && rowIndex <= range.rowEnd && columnIndex >= range.columnStart && columnIndex <= range.columnEnd);
                            return (_jsx("td", { "aria-selected": inRange ? 'true' : undefined, className: "border border-[var(--tt-border)] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)] data-[selected=true]:bg-[var(--tt-selected)]", "data-selected": inRange ? 'true' : undefined, ref: element => {
                                    const key = cellKey(model.view.name, row.path, columnIndex);
                                    if (element === null)
                                        refs.current.delete(key);
                                    else
                                        refs.current.set(key, element);
                                }, role: "gridcell", tabIndex: active || (!selectedVisible && rowIndex === 0 && columnIndex === 0) ? 0 : -1, onClick: event => {
                                    setAnchor(event.shiftKey ? anchor ?? (selectedVisible ? selected : null) : null);
                                    setSelected({ column: columnIndex, path: row.path, view: model.view.name });
                                    if (event.target === event.currentTarget)
                                        event.currentTarget.focus();
                                }, onFocus: () => setSelected({ column: columnIndex, path: row.path, view: model.view.name }), onKeyDown: event => handleKeyDown(event, rowIndex, columnIndex), children: _jsx(EditableCell, { cell: cell, row: row, onEdit: props.onEdit }) }, cell.column));
                        }) }, row.path))) })] }) }));
}
/** Controlled browser-only seam for bounded executable Base views. */
export function ExecutableBaseView(props) {
    const [sortProperty, setSortProperty] = useState('file.name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [filterProperty, setFilterProperty] = useState('file.name');
    const [filterValue, setFilterValue] = useState('');
    const [filterOperator, setFilterOperator] = useState('==');
    const [viewName, setViewName] = useState('');
    const [renameName, setRenameName] = useState('');
    const [viewType, setViewType] = useState('table');
    const [authoringError, setAuthoringError] = useState('');
    const document = useMemo(() => parseExecutableBase(props.source), [props.source]);
    const selectedName = document.status === 'ready'
        ? document.views.find(view => view.name === props.activeView)?.name ?? document.views[0]?.name ?? ''
        : '';
    const search = props.searches?.[selectedName] ?? '';
    const model = useMemo(() => document.status === 'ready'
        ? createBaseViewModel(document, props.files, selectedName, search, props.baseFile)
        : document, [document, props.files, selectedName, search, props.baseFile]);
    if (model.status !== 'ready')
        return _jsx("p", { role: "alert", children: model.reason });
    const blocked = model.unsupported.length > 0;
    const tsv = blocked ? null : executableBaseViewTsv(model);
    const csv = blocked ? null : executableBaseViewCsv(model);
    const properties = useMemo(() => [...new Set([
            'file.name', 'file.path', 'file.folder', 'file.mtime', 'file.size',
            ...model.columns.map(column => column.key),
            ...props.files.flatMap(file => parseFrontmatterProperties(file.source).map(property => `note.${property.key}`)),
        ])].filter(key => /^[\w.-]+$/u.test(key)).slice(0, 256), [model.columns, props.files]);
    const commit = async (next) => {
        if (next === null || props.onSourceChange === undefined) {
            setAuthoringError('This Base change is unavailable. Open Base Source to edit it.');
            return;
        }
        try {
            if (!await props.onSourceChange(props.source, next)) {
                setAuthoringError('The Base changed before it could be saved. Review its source and retry.');
                return;
            }
            setAuthoringError('');
        }
        catch {
            setAuthoringError('The Base could not be saved. Review its source before retrying.');
        }
    };
    const menuClass = 'z-[1002] w-64 rounded-lg border border-border bg-[var(--tockteam-shell-chrome,var(--dsw-alias-bg-layer-1))] p-3 text-foreground shadow-lg';
    const ViewIcon = { table: Table2, list: List, cards: LayoutGrid, 'map-label': MapPin }[model.kind];
    return (_jsxs("section", { "aria-label": "Executable Base", className: "flex min-h-0 flex-col gap-3 overflow-auto p-4", children: [_jsxs("header", { "aria-label": "Base View Controls", role: "toolbar", className: "flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-2", children: [_jsxs("div", { className: "relative flex h-7 max-w-36 shrink-0 items-center rounded-md hover:bg-muted", children: [_jsx(ViewIcon, { "aria-hidden": "true", className: "pointer-events-none absolute left-2 size-4 text-muted-foreground" }), _jsx(NativeSelect, { unstyled: true, id: "tocktutor-base-view", "aria-label": "Base View", className: "box-border h-7 min-w-24 max-w-36 cursor-pointer appearance-none [field-sizing:content] rounded-md border-0 bg-transparent py-1 pl-7 pr-6 text-sm text-foreground outline-none focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]", value: model.view.name, onChange: event => props.onActiveViewChange?.(event.currentTarget.value), children: model.views.map(view => _jsx(NativeSelectOption, { value: view.name, children: view.name === readableKind(view.kind) ? view.name : `${view.name} — ${readableKind(view.kind)}` }, view.name)) }), _jsx(ChevronsUpDown, { "aria-hidden": "true", className: "pointer-events-none absolute right-1 size-3.5 text-muted-foreground" })] }), _jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { size: "sm", variant: "ghost", type: "button", "aria-live": "polite", className: "tabular-nums text-muted-foreground", children: resultCount(model.rows.length) }) }), _jsx(PopoverContent, { align: "start", className: menuClass, children: _jsxs(Field, { className: "gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-result-limit", children: "Result Limit" }), _jsx(NativeSelect, { id: "base-result-limit", value: String(model.view.limit ?? 'all'), disabled: !props.onSourceChange, onChange: event => { void commit(setBaseViewField(props.source, model.view.name, 'limit', event.currentTarget.value === 'all' ? '' : event.currentTarget.value)); }, children: ['all', '25', '50', '100', '500', '2000'].map(value => _jsx(NativeSelectOption, { value: value, children: value === 'all' ? 'All Results' : value }, value)) })] }) })] }), _jsxs("details", { className: "relative shrink-0", onKeyDown: event => { if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            event.currentTarget.open = false;
                            event.currentTarget.querySelector('summary')?.focus();
                        } }, children: [_jsx("summary", { "aria-label": "More Base Actions", className: "flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden", children: _jsx(Plus, { "aria-hidden": "true", className: "size-4" }) }), _jsxs("div", { className: "absolute top-full left-0 z-[1002] flex w-max max-w-[calc(100vw-3rem)] flex-wrap gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg", children: [_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { size: "sm", variant: "ghost", type: "button", children: "Add View" }) }), _jsxs(PopoverContent, { align: "start", className: menuClass, children: [_jsxs(Field, { className: "gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-new-view-name", children: "View Name" }), _jsx(Input, { id: "base-new-view-name", value: viewName, onChange: event => setViewName(event.currentTarget.value) })] }), _jsxs(Field, { className: "mt-2 gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-new-view-kind", children: "View Type" }), _jsx(NativeSelect, { id: "base-new-view-kind", value: viewType, onChange: event => setViewType(event.currentTarget.value), children: ['table', 'list', 'cards', 'map'].map(kind => _jsx(NativeSelectOption, { value: kind, children: readableKind(kind) }, kind)) })] }), _jsx(Button, { className: "mt-3", disabled: !props.onSourceChange, type: "button", onClick: () => { void commit(appendBaseView(props.source, viewType, viewName)); }, children: "Create View" })] })] }), _jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { size: "sm", variant: "ghost", type: "button", onClick: () => setRenameName(model.view.name), children: "Rename View" }) }), _jsxs(PopoverContent, { align: "start", className: menuClass, children: [_jsxs(Field, { className: "gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-rename-view-name", children: "View Name" }), _jsx(Input, { id: "base-rename-view-name", value: renameName, onChange: event => setRenameName(event.currentTarget.value) })] }), _jsx(Button, { className: "mt-3", disabled: !props.onSourceChange || renameName === model.view.name, type: "button", onClick: () => { void commit(setBaseViewField(props.source, model.view.name, 'name', renameName)); }, children: "Save View Name" })] })] }), _jsx(Button, { size: "sm", variant: "ghost", disabled: tsv === null || props.onCopy === undefined, type: "button", onClick: () => { if (tsv !== null)
                                            props.onCopy?.({ kind: 'results', text: tsv, view: model.view.name }); }, children: "Copy Visible Results" }), _jsx(Button, { size: "sm", variant: "ghost", disabled: csv === null || props.onExport === undefined, type: "button", onClick: () => { if (csv !== null)
                                            props.onExport?.({ filename: executableBaseCsvFilename(model.view.name), text: csv, view: model.view.name }); }, children: "Export Visible CSV" })] })] }), _jsxs("div", { className: "ml-auto flex flex-wrap items-center gap-1", children: [_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { size: "sm", variant: "ghost", type: "button", children: [_jsx(ArrowDownUp, { "aria-hidden": "true" }), "Sort"] }) }), _jsxs(PopoverContent, { align: "end", className: menuClass, children: [_jsxs(Field, { className: "gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-sort-property", children: "Sort Property" }), _jsx(NativeSelect, { id: "base-sort-property", value: sortProperty, onChange: event => setSortProperty(event.currentTarget.value), children: properties.map(key => _jsx(NativeSelectOption, { value: key, children: key }, key)) })] }), _jsxs(Field, { className: "mt-2 gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-sort-direction", children: "Sort Direction" }), _jsxs(NativeSelect, { id: "base-sort-direction", value: sortDirection, onChange: event => setSortDirection(event.currentTarget.value), children: [_jsx(NativeSelectOption, { value: "asc", children: "Ascending" }), _jsx(NativeSelectOption, { value: "desc", children: "Descending" })] })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: model.view.sort.length > 0 ? model.view.sort.join(', ') : 'No sort applied.' }), _jsx(Button, { disabled: !props.onSourceChange, type: "button", onClick: () => { void commit(setBaseViewField(props.source, model.view.name, 'sort', [`${sortProperty} ${sortDirection}`])); }, children: "Apply Sort" }), _jsx(Button, { variant: "ghost", disabled: !props.onSourceChange || model.view.sort.length === 0, type: "button", onClick: () => { void commit(setBaseViewField(props.source, model.view.name, 'sort', [])); }, children: "Clear Sort" })] })] }), _jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { size: "sm", variant: "ghost", type: "button", children: [_jsx(ListFilter, { "aria-hidden": "true" }), "Filter"] }) }), _jsxs(PopoverContent, { align: "end", className: menuClass, children: [_jsxs(Field, { className: "gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-filter-property", children: "Filter Property" }), _jsx(NativeSelect, { id: "base-filter-property", value: filterProperty, onChange: event => setFilterProperty(event.currentTarget.value), children: properties.map(key => _jsx(NativeSelectOption, { value: key, children: key }, key)) })] }), _jsxs(Field, { className: "mt-2 gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-filter-operator", children: "Filter Operator" }), _jsxs(NativeSelect, { id: "base-filter-operator", value: filterOperator, onChange: event => setFilterOperator(event.currentTarget.value), children: [_jsx(NativeSelectOption, { value: "==", children: "Equals" }), _jsx(NativeSelectOption, { value: "!=", children: "Does Not Equal" })] })] }), _jsxs(Field, { className: "mt-2 gap-1", children: [_jsx(FieldLabel, { htmlFor: "base-filter-value", children: "Filter Value" }), _jsx(Input, { id: "base-filter-value", maxLength: 200, value: filterValue, onChange: event => setFilterValue(event.currentTarget.value) })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: model.view.filters.length > 0 ? 'Applying replaces this view’s current filter.' : 'No view filter applied.' }), _jsx(Button, { disabled: !props.onSourceChange || filterValue === '', type: "button", onClick: () => { void commit(setBaseViewField(props.source, model.view.name, 'filters', `${filterProperty} ${filterOperator} ${JSON.stringify(filterValue)}`)); }, children: "Apply Filter" }), _jsx(Button, { variant: "ghost", disabled: !props.onSourceChange || model.view.filters.length === 0, type: "button", onClick: () => { void commit(setBaseViewField(props.source, model.view.name, 'filters', '')); }, children: "Clear Filter" })] })] }), _jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { size: "sm", variant: "ghost", type: "button", children: [_jsx(ListTree, { "aria-hidden": "true" }), "Properties"] }) }), _jsxs(PopoverContent, { align: "end", className: menuClass, children: [_jsx("p", { className: "m-0 mb-2 text-sm", children: "Visible Properties" }), _jsx("div", { className: "max-h-56 overflow-auto", children: properties.map(key => _jsxs(Label, { className: "flex min-h-8 items-center gap-2 text-sm", children: [_jsx(Checkbox, { disabled: !props.onSourceChange || key === 'file.name', checked: model.columns.some(column => column.key === key), onCheckedChange: checked => { const columns = model.columns.map(column => column.key).filter(column => column !== key); if (checked === true)
                                                                columns.push(key); if (!columns.includes('file.name'))
                                                                columns.unshift('file.name'); void commit(setBaseViewField(props.source, model.view.name, 'order', columns)); } }), _jsx("span", { children: key })] }, key)) })] })] }), _jsxs("div", { className: "relative w-36 shrink-0 rounded-md hover:bg-muted", children: [_jsx(Search, { "aria-hidden": "true", className: "pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" }), _jsx(Input, { unstyled: true, id: "tocktutor-base-search", "aria-label": `Search ${model.view.name}`, className: "box-border h-7 w-full rounded-md border-0 bg-transparent py-1 pl-7 pr-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]", maxLength: 1_000, placeholder: "Search", type: "search", value: model.search, onChange: event => props.onSearchChange?.(model.view.name, event.currentTarget.value) })] }), _jsxs(Button, { size: "sm", variant: "ghost", disabled: !props.onNewNote, type: "button", onClick: props.onNewNote, children: [_jsx(Plus, { "aria-hidden": "true" }), "New"] })] })] }), authoringError && _jsx("p", { role: "alert", className: "m-0 text-sm text-destructive", children: authoringError }), blocked ? (_jsxs("p", { role: "alert", children: ["Unsupported Base expression: ", model.unsupported.map(entry => entry.expression).join(', ')] })) : model.rows.length === 0 ? (_jsx("p", { children: "No notes match this view." })) : model.kind === 'table' ? (_jsx(ExecutableTable, { model: model, onCopy: props.onCopy, onEdit: props.onEdit })) : (_jsx(ReadonlyLayouts, { model: model })), _jsx(SummaryList, { model: model })] }));
}
//# sourceMappingURL=base-executable-view.js.map