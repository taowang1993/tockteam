import { notesBaseValueText } from "./NotesBaseFormulaValue.js";
export const MAX_EXECUTABLE_BASE_SPREADSHEET_CHARACTERS = 1_000_000;
export const MAX_EXECUTABLE_BASE_SPREADSHEET_CELLS = 1_000_000;
function spreadsheetSafeText(value, lineBreak) {
    const source = notesBaseValueText(value);
    if (source.length > MAX_EXECUTABLE_BASE_SPREADSHEET_CHARACTERS)
        return null;
    const normalized = source.replace(/\r\n?|\n/gu, lineBreak);
    return typeof value !== 'number' && /^\s*[=+@-]/u.test(normalized) ? `'${normalized}` : normalized;
}
function tsvCell(value) {
    const safe = spreadsheetSafeText(value, '\n');
    if (safe === null)
        return null;
    return /[\t\n"]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
function csvCell(value) {
    const safe = spreadsheetSafeText(value, '\r\n');
    if (safe === null)
        return null;
    return /[,\r\n"]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
function serialize(headers, rows, separator, lineBreak, cell) {
    const width = headers?.length ?? rows[0]?.length ?? 0;
    if (width === 0 || rows.some(row => row.length !== width))
        return null;
    if ((rows.length + (headers === null ? 0 : 1)) * width > MAX_EXECUTABLE_BASE_SPREADSHEET_CELLS)
        return null;
    const lines = [];
    let length = 0;
    for (const values of headers === null ? rows : [headers, ...rows]) {
        const serialized = [];
        for (const value of values) {
            const encoded = cell(value);
            if (encoded === null)
                return null;
            serialized.push(encoded);
        }
        const line = serialized.join(separator);
        length += line.length + (lines.length === 0 ? 0 : lineBreak.length);
        if (length > MAX_EXECUTABLE_BASE_SPREADSHEET_CHARACTERS)
            return null;
        lines.push(line);
    }
    return lines.join(lineBreak);
}
function visibleTable(model) {
    if (model.status !== 'ready' || model.unsupported.length > 0)
        return null;
    return {
        headers: model.columns.map(column => column.label),
        rows: model.rows.map(row => row.cells.map(cell => cell.value)),
    };
}
/** Serialize exactly the visible view rows as spreadsheet-safe TSV with headers. */
export function executableBaseViewTsv(model) {
    const table = visibleTable(model);
    return table === null ? null : serialize(table.headers, table.rows, '\t', '\n', tsvCell);
}
/** Serialize exactly the visible view rows as spreadsheet-safe CSV with CRLF records. */
export function executableBaseViewCsv(model) {
    const table = visibleTable(model);
    return table === null ? null : serialize(table.headers, table.rows, ',', '\r\n', csvCell);
}
/** Serialize a rectangular, header-free semantic cell selection as TSV. */
export function executableBaseCellRangeTsv(rows) {
    return serialize(null, rows, '\t', '\n', tsvCell);
}
export function executableBaseCsvFilename(viewName) {
    const normalized = viewName.normalize('NFKC').trim()
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/gu, '-')
        .replace(/\s+/gu, '-')
        .replace(/-+/gu, '-')
        .replace(/^[.-]+|[. -]+$/gu, '');
    const stem = Array.from(normalized).slice(0, 80).join('').replace(/[. -]+$/gu, '');
    return `${stem || 'base-results'}.csv`;
}
//# sourceMappingURL=base-spreadsheet.js.map