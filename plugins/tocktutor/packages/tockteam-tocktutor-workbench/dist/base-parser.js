import { MAX_BASE_BYTES, MAX_BASE_FIELDS, MAX_BASE_LINE_LENGTH, MAX_BASE_LINES, MAX_BASE_VIEWS, } from "./base.js";
import { parseNotesBaseFilterBlock } from "./NotesBaseFilterTree.js";
export const MAX_EXECUTABLE_BASE_LIST_ITEMS = 256;
export const MAX_EXECUTABLE_BASE_FORMULAS = 128;
export const MAX_EXECUTABLE_BASE_SEARCH_LENGTH = 1_000;
function unsupported(reason) {
    return { reason, status: 'unsupported' };
}
function leadingSpaces(line) {
    return /^ */u.exec(line)?.[0].length ?? 0;
}
function cleanScalar(value) {
    const trimmed = value.trim();
    if (trimmed.length < 2)
        return trimmed;
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed.startsWith("'") && trimmed.endsWith("'")
        ? trimmed.slice(1, -1).replaceAll("''", "'")
        : trimmed;
}
function splitInlineList(value) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']'))
        return null;
    const items = [];
    let current = '';
    let quote = '';
    let escaped = false;
    for (const character of trimmed.slice(1, -1)) {
        if (quote !== '') {
            current += character;
            if (escaped)
                escaped = false;
            else if (character === '\\')
                escaped = true;
            else if (character === quote)
                quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            current += character;
        }
        else if (character === ',') {
            const item = cleanScalar(current);
            if (item !== '')
                items.push(item);
            current = '';
        }
        else {
            current += character;
        }
    }
    if (quote !== '')
        return null;
    const item = cleanScalar(current);
    if (item !== '')
        items.push(item);
    return items;
}
function safeLine(line) {
    return line.length <= MAX_BASE_LINE_LENGTH
        && !line.includes('\t')
        && !/!![A-Za-z]|(^|\s)[&*][A-Za-z0-9_-]+|(^|\s)![A-Za-z][A-Za-z0-9_-]*/u.test(line);
}
function boundedList(values) {
    return values.length <= MAX_EXECUTABLE_BASE_LIST_ITEMS
        && values.every(value => value !== '' && value.length <= MAX_BASE_LINE_LENGTH);
}
function parseFilterLines(lines) {
    return parseNotesBaseFilterBlock(lines.map(line => {
        const item = /^(\s*-\s*)(.+)$/u.exec(line);
        return item === null ? line : `${item[1]}${cleanScalar(item[2] ?? '')}`;
    }));
}
/** Parse the bounded executable subset of Obsidian Bases without normalizing source bytes. */
export function parseExecutableBase(source) {
    if (new TextEncoder().encode(source).byteLength > MAX_BASE_BYTES)
        return unsupported('Base document exceeds the byte limit.');
    const lines = source.split(/\r\n|\n|\r/u);
    if (lines.length > MAX_BASE_LINES)
        return unsupported('Base document exceeds the line limit.');
    if (lines.some(line => !safeLine(line) || leadingSpaces(line) % 2 !== 0)) {
        return unsupported('Base document contains unsupported YAML syntax.');
    }
    const formulas = Object.create(null);
    const properties = Object.create(null);
    const filters = [];
    const views = [];
    let section = '';
    let currentView = null;
    let currentList = '';
    let currentProperty = '';
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#'))
            continue;
        const indent = leadingSpaces(line);
        const topLevel = indent === 0 ? /^([A-Za-z][\w.-]*):\s*(.*)$/u.exec(trimmed) : null;
        if (topLevel !== null) {
            section = topLevel[1] ?? '';
            currentView = null;
            currentList = '';
            currentProperty = '';
            if (section === 'filters') {
                const inline = cleanScalar(topLevel[2] ?? '');
                if (inline !== '')
                    filters.push({ kind: 'statement', statement: inline });
                else {
                    const block = [];
                    let next = index + 1;
                    while (next < lines.length && (lines[next]?.trim() === '' || leadingSpaces(lines[next] ?? '') > 0)) {
                        block.push(lines[next] ?? '');
                        next += 1;
                    }
                    if (block.some(entry => entry.trim() !== ''))
                        filters.push(parseFilterLines(block));
                    index = next - 1;
                }
            }
            continue;
        }
        if (section === 'properties') {
            const property = indent === 2 ? /^([^:]+):\s*$/u.exec(trimmed) : null;
            if (property !== null) {
                currentProperty = cleanScalar(property[1] ?? '');
                if (!/^(?:note\.)?[A-Za-z_][\w-]*$/u.test(currentProperty))
                    currentProperty = '';
                continue;
            }
            const displayName = currentProperty !== '' && indent === 4 ? /^displayName:\s*(.+)$/u.exec(trimmed) : null;
            if (displayName !== null) {
                if (Object.keys(properties).length >= MAX_BASE_FIELDS && properties[currentProperty] === undefined) {
                    return unsupported('Base document exceeds the property display-name limit.');
                }
                properties[currentProperty] = cleanScalar(displayName[1] ?? '');
            }
            continue;
        }
        if (section === 'formulas') {
            const formula = indent === 2 ? /^([A-Za-z_][\w-]*):\s*(.+)$/u.exec(trimmed) : null;
            if (formula !== null) {
                const name = formula[1] ?? '';
                if (Object.keys(formulas).length >= MAX_EXECUTABLE_BASE_FORMULAS && formulas[name] === undefined) {
                    return unsupported('Base document exceeds the formula limit.');
                }
                const expression = cleanScalar(formula[2] ?? '');
                if (expression !== '')
                    formulas[name] = expression;
            }
            continue;
        }
        if (section !== 'views')
            continue;
        const newView = indent === 2 ? /^-\s*(?:(type|name):\s*(.+))?$/u.exec(trimmed) : null;
        if (newView !== null) {
            if (views.length >= MAX_BASE_VIEWS)
                return unsupported('Base document exceeds the view limit.');
            currentView = {
                coordinates: null,
                filters: [],
                index: views.length,
                limit: null,
                name: `View ${String(views.length + 1)}`,
                order: [],
                sort: [],
                summaries: [],
                type: 'table',
            };
            if (newView[1] === 'type') {
                const type = cleanScalar(newView[2] ?? '');
                if (type !== 'table' && type !== 'list' && type !== 'cards' && type !== 'map') {
                    return unsupported(`Unsupported Base view type ${JSON.stringify(type)}.`);
                }
                currentView.type = type;
            }
            else if (newView[1] === 'name') {
                currentView.name = cleanScalar(newView[2] ?? '');
            }
            views.push(currentView);
            currentList = '';
            continue;
        }
        if (currentView === null)
            return unsupported('Base views contain malformed syntax.');
        const field = indent === 4 ? /^([A-Za-z][\w.-]*):\s*(.*)$/u.exec(trimmed) : null;
        if (field !== null) {
            const key = field[1] ?? '';
            const raw = field[2] ?? '';
            const value = cleanScalar(raw);
            currentList = key === 'order' || key === 'sort' || key === 'summaries' ? key : '';
            if (key === 'type') {
                if (value !== 'table' && value !== 'list' && value !== 'cards' && value !== 'map') {
                    return unsupported(`Unsupported Base view type ${JSON.stringify(value)}.`);
                }
                currentView.type = value;
            }
            else if (key === 'name') {
                if (value === '')
                    return unsupported('Base view names must not be empty.');
                currentView.name = value;
            }
            else if (key === 'limit') {
                if (!/^\d+$/u.test(value))
                    return unsupported('Base view limit is invalid.');
                const limit = Number(value);
                if (!Number.isSafeInteger(limit) || limit > 2_000)
                    return unsupported('Base view limit is invalid.');
                currentView.limit = limit;
            }
            else if (key === 'coordinates') {
                currentView.coordinates = /^[\w.-]+$/u.test(value) ? value : null;
                if (value !== '' && currentView.coordinates === null)
                    return unsupported('Base map coordinates property is invalid.');
            }
            else if (key === 'filters') {
                currentList = '';
                if (value !== '')
                    currentView.filters.push({ kind: 'statement', statement: value });
                else {
                    const block = [];
                    let next = index + 1;
                    while (next < lines.length && (lines[next]?.trim() === '' || leadingSpaces(lines[next] ?? '') > 4)) {
                        block.push(lines[next] ?? '');
                        next += 1;
                    }
                    if (block.some(entry => entry.trim() !== ''))
                        currentView.filters.push(parseFilterLines(block));
                    index = next - 1;
                }
            }
            else if (currentList !== '') {
                const inline = splitInlineList(raw);
                if (inline !== null) {
                    if (!boundedList(inline))
                        return unsupported('Base view list exceeds its limit.');
                    if (currentList === 'summaries') {
                        currentView.summaries.push(...inline.map(expression => ({ expression, label: expression })));
                    }
                    else if (currentList === 'order')
                        currentView.order.push(...inline);
                    else
                        currentView.sort.push(...inline);
                }
                else if (raw.trim() !== '')
                    return unsupported(`Base ${key} must be a list.`);
            }
            continue;
        }
        const summaryAssignment = currentList === 'summaries' && indent >= 6
            ? /^([\w.-]+):\s*([A-Za-z][\w-]*)$/u.exec(trimmed)
            : null;
        if (summaryAssignment !== null) {
            const property = cleanScalar(summaryAssignment[1] ?? '');
            const name = cleanScalar(summaryAssignment[2] ?? '');
            currentView.summaries.push({ expression: `${name.toLocaleLowerCase()}(${property})`, label: `${name}(${property})` });
            if (!boundedList(currentView.summaries.map(summary => summary.expression)))
                return unsupported('Base view list exceeds its limit.');
            continue;
        }
        const listItem = currentList !== '' && indent >= 6 ? /^-\s*(.+)$/u.exec(trimmed) : null;
        if (listItem !== null) {
            const value = cleanScalar(listItem[1] ?? '');
            if (value === '')
                return unsupported('Base view list item is empty.');
            if (currentList === 'summaries')
                currentView.summaries.push({ expression: value, label: value });
            else if (currentList === 'order')
                currentView.order.push(value);
            else
                currentView.sort.push(value);
            const values = currentList === 'summaries'
                ? currentView.summaries.map(summary => summary.expression)
                : currentList === 'order' ? currentView.order : currentView.sort;
            if (!boundedList(values))
                return unsupported('Base view list exceeds its limit.');
            continue;
        }
        if (indent >= 4)
            return unsupported('Base views contain unsupported nested syntax.');
    }
    if (views.length === 0)
        return unsupported('Base document has no executable views.');
    const names = new Set();
    for (const view of views) {
        const name = view.name.trim().toLocaleLowerCase();
        if (name === '' || names.has(name))
            return unsupported('Base view names must be unique.');
        names.add(name);
    }
    return {
        filters: [...filters],
        formulas: Object.freeze(formulas),
        properties: Object.freeze(properties),
        source,
        status: 'ready',
        views: views.map(view => ({
            ...view,
            filters: [...view.filters],
            order: [...view.order],
            sort: [...view.sort],
            summaries: view.summaries.map(summary => ({ ...summary })),
        })),
    };
}
//# sourceMappingURL=base-parser.js.map