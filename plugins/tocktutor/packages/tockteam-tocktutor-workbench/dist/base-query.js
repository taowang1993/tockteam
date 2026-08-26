import { evaluateNotesBaseFormula, evaluateNotesBaseSummary, notesBaseFileTimestamp, notesBaseFormulaExpression, NOTES_BASE_UNSUPPORTED_FORMULA_VALUE, } from "./NotesBaseFormula.js";
import { evaluateNotesBaseFilterTree } from "./NotesBaseFilterTree.js";
import { notesBaseValueText } from "./NotesBaseFormulaValue.js";
import { parseFrontmatterProperties } from "./properties.js";
export const MAX_EXECUTABLE_BASE_FILES = 2_000;
export const MAX_EXECUTABLE_BASE_FILE_BYTES = 1_000_000;
export const MAX_EXECUTABLE_BASE_TOTAL_BYTES = 16_000_000;
const MAX_EXECUTABLE_BASE_PROPERTIES = 256;
const MAX_EXECUTABLE_BASE_FORMULA_DEPTH = 32;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\\\0\r\n])[\p{L}\p{N} ._()\-\/[\]]+$/u;
const REVISION = /^file:[0-9a-f]{64}$/u;
function fileName(path) {
    return (path.split('/').at(-1) ?? path).replace(/\.md$/iu, '');
}
function fileFolder(path) {
    const separator = path.lastIndexOf('/');
    return separator < 0 ? '' : path.slice(0, separator);
}
function fileSize(file) {
    return typeof file.sizeBytes === 'number' && Number.isSafeInteger(file.sizeBytes) && file.sizeBytes >= 0
        ? file.sizeBytes
        : new TextEncoder().encode(file.source).byteLength;
}
function fileTags(properties, source) {
    const tags = properties.tags;
    const values = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
    const found = new Set(values.flatMap(value => value.split(/[\s,]+/u)).filter(Boolean).map(value => value.startsWith('#') ? value : `#${value}`));
    for (const match of source.matchAll(/(^|\s)(#[\p{L}\p{N}_/-]+)/gu))
        found.add(match[2] ?? '');
    return [...found].filter(Boolean).slice(0, 10_000);
}
function propertyValue(row, property) {
    const key = property.trim();
    if (key === 'file.name' || key === 'file.basename')
        return fileName(row.file.path);
    if (key === 'file.file' || key === 'file.path')
        return row.file.path;
    if (key === 'file.folder')
        return fileFolder(row.file.path);
    if (key === 'file.ext')
        return row.file.path.split('.').at(-1) ?? '';
    if (key === 'file.size')
        return fileSize(row.file);
    if (key === 'file.ctime')
        return notesBaseFileTimestamp(row.file.createdAt);
    if (key === 'file.mtime')
        return notesBaseFileTimestamp(row.file.modifiedAt);
    if (key === 'file.properties')
        return row.properties;
    if (key === 'file.tags')
        return fileTags(row.properties, row.file.source);
    const frontmatterKey = key.startsWith('note.') ? key.slice(5) : key;
    return Object.prototype.hasOwnProperty.call(row.properties, frontmatterKey)
        ? row.properties[frontmatterKey]
        : undefined;
}
function namedFormula(column) {
    return /^formula\.([A-Za-z_][\w-]*)$/u.exec(column.trim())?.[1] ?? null;
}
function formulaContext(rowsByPath, baseFile) {
    return {
        fileCreatedAtFor: path => rowsByPath.get(path)?.file.createdAt ?? null,
        fileModifiedAtFor: path => rowsByPath.get(path)?.file.modifiedAt ?? null,
        filePropertiesFor: path => rowsByPath.get(path)?.properties ?? null,
        fileSizeFor: path => rowsByPath.has(path) ? fileSize(rowsByPath.get(path).file) : null,
        fileTagsFor: path => {
            const row = rowsByPath.get(path);
            return row === undefined ? null : fileTags(row.properties, row.file.source);
        },
        ...(baseFile === undefined ? {} : { thisFile: baseFile }),
    };
}
function columnValue(document, row, column, context, active = new Set()) {
    const formulaName = namedFormula(column);
    if (formulaName !== null) {
        const cached = row.formulaCache.get(formulaName);
        if (cached !== undefined)
            return cached;
        const expression = document.formulas[formulaName];
        if (expression === undefined || active.has(formulaName) || active.size >= MAX_EXECUTABLE_BASE_FORMULA_DEPTH) {
            return { supported: false };
        }
        active.add(formulaName);
        const result = evaluateNotesBaseFormula(expression, property => {
            const dependency = namedFormula(property);
            if (dependency === null)
                return propertyValue(row, property);
            const nested = columnValue(document, row, property, context, active);
            return nested.supported ? nested.value : NOTES_BASE_UNSUPPORTED_FORMULA_VALUE;
        }, context);
        active.delete(formulaName);
        row.formulaCache.set(formulaName, result);
        return result;
    }
    const expression = notesBaseFormulaExpression(column);
    if (expression !== null) {
        return evaluateNotesBaseFormula(expression, property => {
            const dependency = namedFormula(property);
            if (dependency === null)
                return propertyValue(row, property);
            const nested = columnValue(document, row, property, context, active);
            return nested.supported ? nested.value : NOTES_BASE_UNSUPPORTED_FORMULA_VALUE;
        }, context);
    }
    return { supported: true, value: propertyValue(row, column) };
}
function compareValues(left, right) {
    if (left == null && right == null)
        return 0;
    if (left == null)
        return 1;
    if (right == null)
        return -1;
    if (typeof left === 'number' && typeof right === 'number')
        return left - right;
    return notesBaseValueText(left).localeCompare(notesBaseValueText(right), undefined, { numeric: true, sensitivity: 'base' });
}
function validateFiles(files) {
    if (files.length > MAX_EXECUTABLE_BASE_FILES)
        return 'Base hydration exceeds the file limit.';
    const paths = new Set();
    let totalBytes = 0;
    for (const file of files) {
        if (!SAFE_PATH.test(file.path) || !/\.md$/iu.test(file.path) || paths.has(file.path))
            return 'Base hydration contains an invalid or duplicate path.';
        if (!REVISION.test(file.revision))
            return 'Base hydration contains an invalid revision.';
        const bytes = new TextEncoder().encode(file.source).byteLength;
        if (bytes > MAX_EXECUTABLE_BASE_FILE_BYTES)
            return 'Base hydration contains an oversized note.';
        totalBytes += bytes;
        if (totalBytes > MAX_EXECUTABLE_BASE_TOTAL_BYTES)
            return 'Base hydration exceeds its total byte limit.';
        paths.add(file.path);
    }
    return null;
}
function mutableRows(files) {
    const rows = [];
    for (const file of files) {
        const parsed = parseFrontmatterProperties(file.source);
        if (parsed.length > MAX_EXECUTABLE_BASE_PROPERTIES) {
            return { error: `Base note ${JSON.stringify(file.path)} exceeds the property limit.`, rows: [] };
        }
        const properties = Object.create(null);
        const keys = new Set();
        for (const property of parsed) {
            const identity = property.key.toLocaleLowerCase();
            if (keys.has(identity))
                return { error: `Base note ${JSON.stringify(file.path)} contains duplicate properties.`, rows: [] };
            keys.add(identity);
            properties[property.key] = property.value;
        }
        rows.push({ file, formulaCache: new Map(), properties, values: Object.create(null) });
    }
    return { error: null, rows };
}
function summariesForRows(document, summaries, rows, context) {
    const results = [];
    const unsupported = [];
    for (const summary of summaries) {
        let formulasSupported = true;
        const result = evaluateNotesBaseSummary(summary.expression, [...rows], (row, property) => {
            const value = columnValue(document, row, property, context);
            if (!value.supported)
                formulasSupported = false;
            return value.supported ? value.value : undefined;
        });
        if (!result.supported || !formulasSupported)
            unsupported.push({ expression: summary.expression, kind: 'summary' });
        else
            results.push({ expression: summary.expression, label: summary.label, value: result.value });
    }
    return { results, unsupported };
}
/** Recompute configured summaries over an already-visible row set. */
export function summarizeExecutableBaseRows(document, view, rows, baseFile) {
    const mutable = rows.map(row => ({
        file: row.file,
        formulaCache: new Map(),
        properties: { ...row.properties },
        values: { ...row.values },
    }));
    const byPath = new Map(mutable.map(row => [row.file.path, row]));
    const result = summariesForRows(document, view.summaries, mutable, formulaContext(byPath, baseFile));
    return { summaries: result.results, unsupported: result.unsupported };
}
/** Execute filters, sorts, limit, displayed formulas, and summaries for one bounded Base view. */
export function queryExecutableBaseView(document, view, files, baseFile) {
    const inputError = validateFiles(files);
    if (inputError !== null)
        return { rows: [], summaries: [], unsupported: [{ expression: inputError, kind: 'input' }] };
    const hydrated = mutableRows(files);
    if (hydrated.error !== null)
        return { rows: [], summaries: [], unsupported: [{ expression: hydrated.error, kind: 'input' }] };
    const allRows = hydrated.rows;
    const rowsByPath = new Map(allRows.map(row => [row.file.path, row]));
    const context = formulaContext(rowsByPath, baseFile);
    const unsupported = [];
    let rows = allRows;
    for (const tree of [...document.filters, ...view.filters]) {
        const matching = [];
        let failure = null;
        for (const row of rows) {
            const outcome = evaluateNotesBaseFilterTree(tree, statement => {
                const result = evaluateNotesBaseFormula(statement, property => {
                    const value = columnValue(document, row, property, context);
                    return value.supported ? value.value : NOTES_BASE_UNSUPPORTED_FORMULA_VALUE;
                }, context);
                return result.supported && typeof result.value === 'boolean'
                    ? { matched: result.value, supported: true }
                    : { expression: statement, kind: 'formula', supported: false };
            });
            if (!outcome.supported) {
                failure = { expression: outcome.expression, kind: outcome.kind };
                break;
            }
            if (outcome.matched)
                matching.push(row);
        }
        if (failure !== null) {
            unsupported.push(failure);
            rows = [];
            break;
        }
        rows = matching;
    }
    const sortSpecs = [];
    for (const source of view.sort) {
        const match = /^([\w.-]+)(?:\s+(asc|desc))?$/iu.exec(source);
        if (match === null)
            unsupported.push({ expression: source, kind: 'sort' });
        else
            sortSpecs.push({ column: match[1] ?? 'file.name', direction: (match[2] ?? 'asc').toLowerCase() === 'desc' ? -1 : 1 });
    }
    if (unsupported.length === 0 && sortSpecs.length > 0) {
        const projected = rows.map((row, index) => ({
            index,
            row,
            values: sortSpecs.map(spec => columnValue(document, row, spec.column, context)),
        }));
        for (let index = 0; index < sortSpecs.length; index += 1) {
            if (projected.some(entry => entry.values[index]?.supported !== true)) {
                unsupported.push({ expression: sortSpecs[index]?.column ?? '', kind: 'formula' });
            }
        }
        if (unsupported.length === 0) {
            rows = projected.sort((left, right) => {
                for (let index = 0; index < sortSpecs.length; index += 1) {
                    const leftValue = left.values[index];
                    const rightValue = right.values[index];
                    const compared = compareValues(leftValue?.supported ? leftValue.value : undefined, rightValue?.supported ? rightValue.value : undefined) * (sortSpecs[index]?.direction ?? 1);
                    if (compared !== 0)
                        return compared;
                }
                return left.index - right.index;
            }).map(entry => entry.row);
        }
    }
    if (view.limit !== null)
        rows = rows.slice(0, view.limit);
    const columns = view.order.length > 0 ? view.order : ['file.name'];
    for (const row of rows) {
        for (const column of new Set([...columns, ...(view.coordinates === null ? [] : [view.coordinates])])) {
            const value = columnValue(document, row, column, context);
            if (!value.supported)
                unsupported.push({ expression: column, kind: 'formula' });
            else
                row.values[column] = value.value;
        }
    }
    if (unsupported.length > 0)
        return { rows: [], summaries: [], unsupported };
    const summary = summariesForRows(document, view.summaries, rows, context);
    unsupported.push(...summary.unsupported);
    return {
        rows: Object.freeze(rows.map(row => Object.freeze({
            file: Object.freeze({ ...row.file }),
            properties: Object.freeze({ ...row.properties }),
            values: Object.freeze({ ...row.values }),
        }))),
        summaries: Object.freeze(summary.results.map(result => Object.freeze({ ...result }))),
        unsupported: Object.freeze(unsupported.map(entry => Object.freeze({ ...entry }))),
    };
}
//# sourceMappingURL=base-query.js.map