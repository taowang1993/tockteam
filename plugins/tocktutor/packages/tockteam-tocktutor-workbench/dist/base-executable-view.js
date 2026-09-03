import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useMemo, useRef, useState, } from 'react';
import { Button } from '@tockteam/ui/button';
import { Checkbox } from '@tockteam/ui/checkbox';
import { Field, FieldLabel } from '@tockteam/ui/field';
import { Input } from '@tockteam/ui/input';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
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
    if (!cell.editable || cell.inputType === null || props.onEdit === undefined)
        return cell.text;
    const label = `Edit ${cell.label} for ${row.path}`;
    const emit = (rawValue) => {
        const request = createExecutableBaseFrontmatterEdit({ path: row.path, revision: row.revision, source: row.source }, cell.column, rawValue);
        if (request !== null)
            props.onEdit?.(request);
    };
    if (cell.inputType === 'checkbox') {
        return _jsx(Checkbox, { "aria-label": label, checked: cell.value === true, onCheckedChange: checked => emit(checked === true ? 'true' : 'false') });
    }
    return (_jsx(Input, { unstyled: true, "aria-label": label, className: "min-w-24 rounded border border-[var(--tt-border)] bg-transparent px-1.5 py-1", defaultValue: cell.text, type: cell.inputType, onBlur: event => {
            if (event.currentTarget.value !== cell.text)
                emit(event.currentTarget.value);
        } }, `${row.revision}:${cell.column}:${cell.text}`));
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
    return (_jsxs("section", { "aria-label": "Executable Base", className: "flex min-h-0 flex-col gap-3 overflow-auto p-4", children: [_jsxs("header", { className: "flex flex-wrap items-end gap-3", children: [_jsxs(Field, { className: "w-auto gap-1", children: [_jsx(FieldLabel, { htmlFor: "tocktutor-base-view", className: "text-xs", children: "Base View" }), _jsx(NativeSelect, { unstyled: true, id: "tocktutor-base-view", "aria-label": "Base View", className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1.5 text-sm", value: model.view.name, onChange: event => props.onActiveViewChange?.(event.currentTarget.value), children: model.views.map(view => _jsxs(NativeSelectOption, { value: view.name, children: [view.name, " \u2014 ", readableKind(view.kind)] }, view.name)) })] }), _jsxs(Field, { className: "min-w-48 flex-1 gap-1", children: [_jsx(FieldLabel, { htmlFor: "tocktutor-base-search", className: "text-xs", children: "Search This View" }), _jsx(Input, { unstyled: true, id: "tocktutor-base-search", "aria-label": `Search ${model.view.name}`, className: "rounded border border-[var(--tt-border)] bg-transparent px-2 py-1.5 text-sm", maxLength: 1_000, type: "search", value: model.search, onChange: event => props.onSearchChange?.(model.view.name, event.currentTarget.value) })] }), _jsx("p", { "aria-live": "polite", className: "m-0 text-sm text-[var(--tt-muted)]", children: resultCount(model.rows.length) }), _jsx(Button, { size: "sm", variant: "outline", disabled: tsv === null || props.onCopy === undefined, type: "button", onClick: () => { if (tsv !== null)
                            props.onCopy?.({ kind: 'results', text: tsv, view: model.view.name }); }, children: "Copy Visible Results" }), _jsx(Button, { size: "sm", variant: "outline", disabled: csv === null || props.onExport === undefined, type: "button", onClick: () => { if (csv !== null)
                            props.onExport?.({ filename: executableBaseCsvFilename(model.view.name), text: csv, view: model.view.name }); }, children: "Export Visible CSV" })] }), blocked ? (_jsxs("p", { role: "alert", children: ["Unsupported Base expression: ", model.unsupported.map(entry => entry.expression).join(', ')] })) : model.rows.length === 0 ? (_jsx("p", { children: "No notes match this view." })) : model.kind === 'table' ? (_jsx(ExecutableTable, { model: model, onCopy: props.onCopy, onEdit: props.onEdit })) : (_jsx(ReadonlyLayouts, { model: model })), _jsx(SummaryList, { model: model })] }));
}
//# sourceMappingURL=base-executable-view.js.map