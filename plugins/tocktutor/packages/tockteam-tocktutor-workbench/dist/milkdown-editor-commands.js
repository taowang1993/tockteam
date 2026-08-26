// @ts-nocheck -- Milkdown 7.20's extensionless declarations are not consumable by the pinned Typert NodeNext analyzer; runtime stays pinned to the public packages.
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, isInTable, moveTableColumn, selectedRect, TableMap, } from '@milkdown/prose/tables';
import { TextSelection } from '@milkdown/prose/state';
function moveRow(direction) {
    return (state, dispatch) => {
        if (!isInTable(state))
            return false;
        const rect = selectedRect(state);
        const row = rect.top;
        const target = row + (direction === 'up' ? -1 : 1);
        if (row <= 0 || target <= 0 || target >= rect.table.childCount)
            return false;
        if (!dispatch)
            return true;
        let rowFrom = rect.tableStart;
        for (let index = 0; index < row; index += 1)
            rowFrom += rect.table.child(index).nodeSize;
        const moving = rect.table.child(row);
        const adjacent = rect.table.child(target);
        const anchor = state.selection instanceof TextSelection ? state.selection.anchor - rowFrom : 0;
        const head = state.selection instanceof TextSelection ? state.selection.head - rowFrom : 0;
        const transaction = state.tr.delete(rowFrom, rowFrom + moving.nodeSize);
        const insertAt = direction === 'up' ? rowFrom - adjacent.nodeSize : rowFrom + adjacent.nodeSize;
        const movedFrom = direction === 'up' ? rowFrom - adjacent.nodeSize : rowFrom + adjacent.nodeSize;
        transaction.insert(transaction.mapping.map(insertAt), moving);
        transaction.setSelection(TextSelection.create(transaction.doc, movedFrom + anchor, movedFrom + head));
        dispatch(transaction.scrollIntoView());
        return true;
    };
}
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function sortRows(direction) {
    return (state, dispatch) => {
        if (!isInTable(state))
            return false;
        const rect = selectedRect(state);
        let hasRowspan = false;
        rect.table.descendants(node => {
            if ((node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') && node.attrs.rowspan > 1)
                hasRowspan = true;
        });
        if (hasRowspan)
            return false;
        const rows = Array.from({ length: Math.max(0, rect.table.childCount - 1) }, (_, index) => {
            const row = index + 1;
            const position = rect.map.positionAt(row, rect.left, rect.table);
            return { index: row, node: rect.table.child(row), value: rect.table.nodeAt(position)?.textContent.trim() ?? '' };
        });
        const multiplier = direction === 'ascending' ? 1 : -1;
        rows.sort((left, right) => multiplier * collator.compare(left.value, right.value) || left.index - right.index);
        if (!dispatch || rows.every((row, index) => row.index === index + 1))
            return true;
        const oldRow = rect.top;
        const sourcePosition = rect.map.positionAt(oldRow, rect.left, rect.table);
        const anchor = state.selection instanceof TextSelection ? state.selection.anchor - rect.tableStart - sourcePosition : 0;
        const head = state.selection instanceof TextSelection ? state.selection.head - rect.tableStart - sourcePosition : 0;
        const sorted = rect.table.type.create(rect.table.attrs, [rect.table.firstChild, ...rows.map(row => row.node)], rect.table.marks);
        const tableFrom = rect.tableStart - 1;
        const transaction = state.tr.replaceWith(tableFrom, tableFrom + rect.table.nodeSize, sorted);
        const movedRow = oldRow === 0 ? 0 : rows.findIndex(row => row.index === oldRow) + 1;
        const movedPosition = TableMap.get(sorted).positionAt(movedRow, rect.left, sorted);
        transaction.setSelection(TextSelection.create(transaction.doc, rect.tableStart + movedPosition + anchor, rect.tableStart + movedPosition + head));
        dispatch(transaction.scrollIntoView());
        return true;
    };
}
function alignColumn(alignment) {
    return (state, dispatch) => {
        if (!isInTable(state))
            return false;
        if (!dispatch)
            return true;
        const rect = selectedRect(state);
        const transaction = state.tr;
        const positions = new Set();
        for (let row = 0; row < rect.map.height; row += 1)
            positions.add(rect.tableStart + rect.map.map[row * rect.map.width + rect.left]);
        for (const position of positions) {
            const cell = transaction.doc.nodeAt(position);
            if (cell && cell.attrs.alignment !== alignment)
                transaction.setNodeMarkup(position, undefined, { ...cell.attrs, alignment });
        }
        if (transaction.docChanged)
            dispatch(transaction.scrollIntoView());
        return true;
    };
}
const commands = {
    'add-column-after': addColumnAfter,
    'add-column-before': addColumnBefore,
    'add-row-after': addRowAfter,
    'add-row-before': addRowBefore,
    'align-center': alignColumn('center'),
    'align-default': alignColumn(null),
    'align-left': alignColumn('left'),
    'align-right': alignColumn('right'),
    'delete-column': deleteColumn,
    'delete-row': deleteRow,
    'move-column-left': moveTableColumn({ from: -1, to: -1, select: false }),
    'move-column-right': moveTableColumn({ from: -1, to: -1, select: false }),
    'move-row-down': moveRow('down'),
    'move-row-up': moveRow('up'),
    'sort-ascending': sortRows('ascending'),
    'sort-descending': sortRows('descending'),
};
/** Execute one history-aware table command against the active Milkdown view. */
export function runLivePreviewTableAction(view, action) {
    if (!view.editable)
        return false;
    if (action === 'move-column-left' || action === 'move-column-right') {
        if (!isInTable(view.state))
            return false;
        const rect = selectedRect(view.state);
        const target = action === 'move-column-left' ? rect.left - 1 : rect.right;
        if (target < 0 || target >= rect.map.width)
            return false;
        return moveTableColumn({ from: rect.left, to: target, select: true })(view.state, view.dispatch);
    }
    return commands[action](view.state, view.dispatch);
}
//# sourceMappingURL=milkdown-editor-commands.js.map