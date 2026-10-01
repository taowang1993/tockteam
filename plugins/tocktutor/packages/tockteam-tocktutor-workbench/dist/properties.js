export const MAX_FRONTMATTER_BYTES = 1_000_000;
export const MAX_PROPERTIES = 1_000;
const KEY = /^[\p{L}\p{N}_][\p{L}\p{N}\p{M}_. -]*$/u;
export function isValidPropertyName(key) {
    return typeof key === 'string' && key.length <= 128 && key.trim() === key && KEY.test(key)
        && !['__proto__', 'constructor', 'prototype'].includes(key);
}
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
function validIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value))
        return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validLocalDateTime(value) {
    const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d$/u.exec(value);
    return match !== null && validIsoDate(match[1]);
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
    if (validIsoDate(value))
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
function decimalIdentity(raw) {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(raw);
    let digits = `${match[2]}${match[3] ?? ''}`.replace(/^0+/u, '');
    let power = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
    if (!digits)
        return '0';
    while (digits.endsWith('0')) {
        digits = digits.slice(0, -1);
        power++;
    }
    return `${match[1]}${digits}e${power}`;
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
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(trimmed)) {
        const number = Number(trimmed);
        if (Number.isFinite(number))
            return number;
    }
    return decodeQuoted(trimmed);
}
function scalarComment(raw) {
    let quote = '';
    for (let index = 0; index < raw.length; index++) {
        const char = raw[index];
        if (quote === '"' && char === '\\') {
            index++;
            continue;
        }
        if (quote === "'" && char === "'" && raw[index + 1] === "'") {
            index++;
            continue;
        }
        if (quote && char === quote)
            quote = '';
        else if (!quote && (char === '"' || char === "'") && (index === 0 || /[\s\[,]/u.test(raw[index - 1])))
            quote = char;
        else if (!quote && char === '#' && (index === 0 || /\s/u.test(raw[index - 1])))
            return { value: raw.slice(0, index).trimEnd(), comment: raw.slice(index) };
    }
    return { value: raw, comment: '' };
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
        const match = content.match(/^([^:]+):(?:[ \t]*(.*))?$/u);
        const rawKey = match?.[1]?.trimEnd() ?? '';
        const key = /^(?:"(?:\\.|[^"\\])*"|'(?:[^']|'')*')$/u.test(rawKey) ? decodeQuoted(rawKey) : rawKey;
        if (match === null || !isValidPropertyName(key)) {
            offset += line.length;
            continue;
        }
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
        const { value: authoredValue, comment } = scalarComment(match[2] ?? '');
        const authored = authoredValue.trim();
        const value = items.length > 0 ? items : scalar(authored);
        editable &&= !(items.length > 0 && authored !== '')
            && !(authored.startsWith('[') && !Array.isArray(value))
            && !/^[|>{&*!]/u.test(authored)
            && !(authored.startsWith('"') && !/^"(?:\\.|[^"\\])*"$/u.test(authored))
            && !(authored.startsWith("'") && !/^'(?:[^']|'')*'$/u.test(authored))
            && !(typeof value === 'number' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(authored)
                && decimalIdentity(authored) !== decimalIdentity(String(value)))
            && !/^(?:[ \t]*(?:#[^\r\n]*)?(?:\r\n|\n|\r))*(?:[ \t]+\S|-[ \t])/u.test(source.slice(end));
        properties.push({ rawKey, comment, editable, end, key, start: offset, type: editable ? inferPropertyType(value) : 'mixed', value: editable ? value : source.slice(offset, end).trimEnd() });
        index = next - 1;
        offset = end;
    }
    return properties;
}
export function parseFrontmatterProperties(source, declared = {}) {
    return ranges(source).map(({ key, type, value }) => {
        if (type === 'datetime' && typeof value === 'string' && !validLocalDateTime(value))
            return { key, type: 'mixed', value };
        const imported = Object.hasOwn(declared, key) ? declared[key] : undefined;
        const expected = imported === 'multitext' || imported === 'tags' || imported === 'aliases'
            ? 'list' : imported;
        if (!expected || (type === 'mixed' && value !== null))
            return { key, type, value };
        const compatible = expected === 'list' ? Array.isArray(value)
            : expected === 'text' ? typeof value === 'string'
                : expected === 'number' ? typeof value === 'number'
                    : expected === 'checkbox' ? typeof value === 'boolean'
                        : typeof value === 'string' && type === expected
                            && (expected === 'date' ? validIsoDate(value) : expected !== 'datetime' || validLocalDateTime(value));
        return { key, type: compatible || value === '' || value === null ? expected : 'mixed', value };
    });
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
    const encoded = value === null ? 'null' : typeof value === 'string' ? quoteText(value) : Object.is(value, -0) ? '-0' : String(value);
    return `${key}: ${encoded}${eol}`;
}
export function setFrontmatterProperty(source, key, value) {
    if (!isValidPropertyName(key))
        throw new Error('The property name is invalid.');
    if (new TextEncoder().encode(source).byteLength > MAX_FRONTMATTER_BYTES)
        throw new Error('This note is too large to edit properties. Use Source Mode.');
    const eol = source.match(/\r\n|\n|\r/u)?.[0] ?? '\n';
    const properties = ranges(source);
    if (properties.length >= MAX_PROPERTIES)
        throw new Error('The property limit was reached. Use Source Mode.');
    const matches = properties.filter(property => property.key.toLocaleLowerCase() === key.toLocaleLowerCase());
    const existing = matches[0];
    if (matches.length > 1)
        throw new Error('Duplicate properties must be edited in Source Mode.');
    if (existing && !existing.editable)
        throw new Error('Structured property values must be edited in Source Mode.');
    let serialized = serializedProperty(existing?.rawKey ?? key, value, eol);
    if (existing?.comment)
        serialized = serialized.replace(eol, () => ` ${existing.comment}${eol}`);
    if (existing !== undefined)
        return `${source.slice(0, existing.start)}${serialized}${source.slice(existing.end)}`;
    const block = frontmatter(source);
    if (block === null)
        return `---${eol}${serialized}---${eol}${source}`;
    const insertion = block.start + block.content.length;
    return `${source.slice(0, insertion)}${serialized}${source.slice(insertion)}`;
}
export function renameFrontmatterProperty(source, from, to) {
    if (!isValidPropertyName(from) || !isValidPropertyName(to))
        throw new Error('The property name is invalid.');
    if (new TextEncoder().encode(source).byteLength > MAX_FRONTMATTER_BYTES)
        throw new Error('This note is too large to edit properties. Use Source Mode.');
    const properties = ranges(source);
    if (properties.length >= MAX_PROPERTIES)
        throw new Error('The property limit was reached. Use Source Mode.');
    const matches = properties.filter(property => property.key.toLocaleLowerCase() === from.toLocaleLowerCase());
    if (matches.length > 1)
        throw new Error('Duplicate properties must be edited in Source Mode.');
    const sourceProperty = matches[0];
    if (sourceProperty === undefined)
        return source;
    if (properties.some(property => property.key.toLocaleLowerCase() === to.toLocaleLowerCase() && property !== sourceProperty)) {
        throw new Error('The target property already exists.');
    }
    const prefixLength = sourceProperty.rawKey.length;
    return `${source.slice(0, sourceProperty.start)}${to}${source.slice(sourceProperty.start + prefixLength)}`;
}
export function removeFrontmatterProperty(source, key) {
    if (!isValidPropertyName(key))
        throw new Error('The property name is invalid.');
    if (new TextEncoder().encode(source).byteLength > MAX_FRONTMATTER_BYTES)
        throw new Error('This note is too large to edit properties. Use Source Mode.');
    const properties = ranges(source);
    if (properties.length >= MAX_PROPERTIES)
        throw new Error('The property limit was reached. Use Source Mode.');
    const matches = properties.filter(property => property.key.toLocaleLowerCase() === key.toLocaleLowerCase());
    if (matches.length > 1)
        throw new Error('Duplicate properties must be edited in Source Mode.');
    const property = matches[0];
    if (!property)
        return source;
    if (!property.editable)
        throw new Error('Structured property values must be edited in Source Mode.');
    return source.slice(0, property.start) + source.slice(property.end);
}
export function normalizePropertyListValue(key, value) {
    return key.toLowerCase() === 'tags' || key.toLowerCase() === 'cssclasses' ? value.trim().replace(/^#+/u, '').replace(/\s+/gu, '-') : value;
}
export function preparePropertyTypeChange(source, key, target) {
    const properties = ranges(source);
    const found = properties.filter(property => property.key.toLowerCase() === key.toLowerCase());
    const property = found[0];
    const refuse = (message = 'This value cannot be converted safely. Use Source Mode.') => ({ ok: false, message });
    if (properties.length >= MAX_PROPERTIES || found.length !== 1 || !property?.editable || property.type === 'datetime' && typeof property.value === 'string' && !validLocalDateTime(property.value))
        return refuse();
    let value = property.value, lossy = false;
    if (value !== null && value !== '') {
        if (target === 'list')
            value = (Array.isArray(value) ? value : [String(value)]).map(item => normalizePropertyListValue(key, item));
        else {
            if (Array.isArray(value)) {
                if (target !== 'text' && value.length > 1)
                    return refuse();
                lossy = value.length > 1;
                value = target === 'text' ? value.join(', ') : value[0] ?? '';
            }
            if (target === 'text')
                value = String(value);
            if (target === 'number') {
                const raw = String(value).trim();
                if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(raw) || !Number.isFinite(Number(raw)))
                    return refuse();
                if (decimalIdentity(raw) !== decimalIdentity(String(Number(raw))))
                    return refuse('This number would lose precision. Use Source Mode to keep the original value.');
                value = Number(raw);
            }
            if (target === 'checkbox') {
                if (value !== true && value !== false && value !== 'true' && value !== 'false' && value !== 0 && value !== 1)
                    return refuse();
                value = value === true || value === 'true' || value === 1;
            }
            if (target === 'date') {
                if (typeof value !== 'string')
                    return refuse();
                if (validLocalDateTime(value)) {
                    lossy = !value.endsWith('T00:00');
                    value = value.slice(0, 10);
                }
                if (!validIsoDate(value))
                    return refuse();
            }
            if (target === 'datetime') {
                if (typeof value !== 'string')
                    return refuse();
                if (validIsoDate(value))
                    value += 'T00:00';
                if (!validLocalDateTime(value))
                    return refuse();
            }
        }
    }
    try {
        return { ok: true, value, lossy, nextSource: setFrontmatterProperty(source, key, value) };
    }
    catch (error) {
        return refuse(error instanceof Error ? error.message : undefined);
    }
}
export function obsidianPropertyType(key, type) {
    return type === 'list' ? key.toLowerCase() === 'tags' ? 'tags' : key.toLowerCase() === 'aliases' ? 'aliases' : 'multitext' : type;
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