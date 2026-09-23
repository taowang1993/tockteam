export const MAX_FRONTMATTER_BYTES = 1_000_000;
export const MAX_PROPERTIES = 1_000;
const KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/u;
function frontmatter(source) {
    if (new TextEncoder().encode(source).byteLength > MAX_FRONTMATTER_BYTES)
        return null;
    const opening = source.match(/^---(?:\r\n|\n|\r)/u);
    if (opening === null)
        return null;
    const start = opening[0].length;
    const close = /(?:^|\r\n|\n|\r)(?:---|\.\.\.)(?=\r\n|\n|\r|$)/gmu;
    close.lastIndex = start;
    const match = close.exec(source);
    if (match === null)
        return null;
    const markerOffset = match.index + (match[0].startsWith('\r\n') ? 2 : match[0].startsWith('\n') || match[0].startsWith('\r') ? 1 : 0);
    return { content: source.slice(start, markerOffset), start };
}
function decodeQuoted(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return trimmed.slice(1, -1);
        }
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'"))
        return trimmed.slice(1, -1).replaceAll("''", "'");
    return trimmed;
}
export function inferPropertyType(value) {
    if (Array.isArray(value))
        return 'list';
    if (typeof value === 'number')
        return 'number';
    if (typeof value === 'boolean')
        return 'checkbox';
    if (typeof value !== 'string')
        return 'mixed';
    if (/^\d{4}-\d{2}-\d{2}$/u.test(value))
        return 'date';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/u.test(value))
        return 'datetime';
    return 'text';
}
// ponytail: only flat string lists are editable; quote ambiguous scalars or use Source Mode.
function listString(value) {
    const text = value.trim();
    if (/^"(?:\\.|[^"\\])*"$/u.test(text)) {
        try {
            return JSON.parse(text);
        }
        catch {
            return null;
        }
    }
    if (/^'(?:[^']|'')*'$/u.test(text))
        return decodeQuoted(text);
    if (!text || inferPropertyType(text) !== 'text' || /[:#\[\]{},&*!|>'"%@`]/u.test(text) || /^[-?](?:\s|$)/u.test(text)
        || /^(?:true|false|null|~|[-+]?\.(?:nan|inf))$/iu.test(text)
        || (/\d/u.test(text) && !Number.isNaN(Number(text.replaceAll('_', '').replace(/^[-+]/u, '')))))
        return null;
    return text;
}
function flowStringList(value) {
    if (!value.startsWith('[') || !value.endsWith(']'))
        return null;
    const content = value.slice(1, -1).trim();
    if (!content)
        return [];
    const token = /("(?:\\.|[^"\\])*"\s*|'(?:[^']|'')*'\s*|[^,\[\]{}'"]+)(,|$)/gyu;
    const items = [];
    while (token.lastIndex < content.length) {
        // Consume separator whitespace once; overlapping quantifiers backtrack quadratically on malformed lists.
        while (/\s/u.test(content[token.lastIndex] ?? ''))
            token.lastIndex++;
        const match = token.exec(content);
        if (!match)
            return null;
        const item = listString(match[1]);
        if (item === null || (match[2] === ',' && token.lastIndex === content.length))
            return null;
        items.push(item);
    }
    return items;
}
function scalar(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('['))
        return flowStringList(trimmed) ?? trimmed;
    if (trimmed === 'true')
        return true;
    if (trimmed === 'false')
        return false;
    if (trimmed === 'null' || trimmed === '~')
        return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(trimmed)) {
        const number = Number(trimmed);
        if (Number.isFinite(number))
            return number;
    }
    return decodeQuoted(trimmed);
}
function ranges(source) {
    const block = frontmatter(source);
    if (block === null)
        return [];
    const lines = [...block.content.matchAll(/.*(?:\r\n|\n|\r|$)/gu)].filter(match => match[0] !== '');
    const properties = [];
    let offset = block.start;
    for (let index = 0; index < lines.length && properties.length < MAX_PROPERTIES; index += 1) {
        const line = lines[index][0];
        const content = line.replace(/(?:\r\n|\n|\r)$/u, '');
        const match = content.match(/^([A-Za-z_][A-Za-z0-9_-]{0,127}):(?:\s*(.*))?$/u);
        if (match === null) {
            offset += line.length;
            continue;
        }
        const key = match[1];
        let end = offset + line.length;
        const items = [];
        let editable = true;
        let indentation;
        let next = index + 1;
        while (next < lines.length && /^\s{2,}-\s+/u.test(lines[next][0])) {
            const listLine = lines[next][0];
            const indent = listLine.match(/^ +/u)?.[0].length;
            const item = listString(listLine.replace(/^\s{2,}-\s+/u, '').replace(/(?:\r\n|\n|\r)$/u, ''));
            editable &&= item !== null && /^ +-[ \t]+/u.test(listLine) && indent !== undefined && (indentation === undefined || indent === indentation);
            indentation ??= indent;
            items.push(item ?? '');
            end += lines[next][0].length;
            next += 1;
        }
        const authored = (match[2] ?? '').trim();
        const value = items.length > 0 ? items : scalar(authored);
        editable &&= !(items.length > 0 && authored !== '')
            && !(authored.startsWith('[') && !Array.isArray(value))
            && !/^[|>{&*!]/u.test(authored)
            && !/^(?:[ \t]*(?:#[^\r\n]*)?(?:\r\n|\n|\r))*(?:[ \t]+\S|-[ \t])/u.test(source.slice(end));
        properties.push({ editable, end, key, start: offset, type: editable ? inferPropertyType(value) : 'mixed', value: editable ? value : source.slice(offset, end).trimEnd() });
        index = next - 1;
        offset = end;
    }
    return properties;
}
export function parseFrontmatterProperties(source) {
    return ranges(source).map(({ key, type, value }) => ({ key, type, value }));
}
function quoteText(value) {
    if (listString(value) === null || /^(?:true|false|null|~|-?(?:0|[1-9]\d*)(?:\.\d+)?|\d{4}-\d{2}-\d{2}(?:T.*)?)$/iu.test(value)
        || /[:#\[\]{},&*!|>'"%@`]/u.test(value)
        || /[\u0000-\u001f\u007f]/u.test(value) || /^\s|\s$/u.test(value))
        return JSON.stringify(value);
    return value;
}
function serializedProperty(key, value, eol) {
    if (Array.isArray(value))
        return value.length === 0 ? `${key}: []${eol}` : `${key}:${eol}${value.map(item => `  - ${quoteText(item)}`).join(eol)}${eol}`;
    const encoded = value === null ? 'null' : typeof value === 'string' ? quoteText(value) : String(value);
    return `${key}: ${encoded}${eol}`;
}
export function setFrontmatterProperty(source, key, value) {
    if (!KEY.test(key))
        throw new Error('The property name is invalid.');
    if (new TextEncoder().encode(source).byteLength > MAX_FRONTMATTER_BYTES)
        throw new Error('This note is too large to edit properties. Use Source Mode.');
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const properties = ranges(source);
    const matches = properties.filter(property => property.key.toLocaleLowerCase() === key.toLocaleLowerCase());
    const existing = matches[0];
    if (matches.length > 1)
        throw new Error('Duplicate properties must be edited in Source Mode.');
    if (!existing && properties.length >= MAX_PROPERTIES)
        throw new Error('The property limit was reached. Use Source Mode.');
    if (existing && !existing.editable)
        throw new Error('Structured property values must be edited in Source Mode.');
    const serialized = serializedProperty(key, value, eol);
    if (existing !== undefined)
        return `${source.slice(0, existing.start)}${serialized}${source.slice(existing.end)}`;
    const block = frontmatter(source);
    if (block === null)
        return `---${eol}${serialized}---${eol}${source}`;
    const insertion = block.start + block.content.length;
    return `${source.slice(0, insertion)}${serialized}${source.slice(insertion)}`;
}
export function renameFrontmatterProperty(source, from, to) {
    if (!KEY.test(from) || !KEY.test(to))
        throw new Error('The property name is invalid.');
    const properties = ranges(source);
    const sourceProperty = properties.find(property => property.key.toLocaleLowerCase() === from.toLocaleLowerCase());
    if (sourceProperty === undefined)
        return source;
    if (properties.some(property => property.key.toLocaleLowerCase() === to.toLocaleLowerCase() && property !== sourceProperty)) {
        throw new Error('The target property already exists.');
    }
    const prefixLength = sourceProperty.key.length;
    return `${source.slice(0, sourceProperty.start)}${to}${source.slice(sourceProperty.start + prefixLength)}`;
}
export async function renamePropertiesRecoverably(files, from, to, operations) {
    const planned = files.map(file => ({ ...file, nextSource: renameFrontmatterProperty(file.source, from, to) }))
        .filter(file => file.nextSource !== file.source);
    const saved = [];
    try {
        for (const file of planned) {
            const result = await operations.save(file);
            saved.push({ ...file, savedRevision: result.revision });
        }
        return { paths: saved.map(file => file.path), status: 'saved' };
    }
    catch {
        const rollbackFailures = [];
        for (const file of [...saved].reverse()) {
            try {
                await operations.rollback(file);
            }
            catch {
                rollbackFailures.push(file.path);
            }
        }
        return rollbackFailures.length === 0
            ? { paths: saved.map(file => file.path), status: 'rolled-back' }
            : { paths: saved.map(file => file.path), rollbackFailures, status: 'partial' };
    }
}
//# sourceMappingURL=properties.js.map