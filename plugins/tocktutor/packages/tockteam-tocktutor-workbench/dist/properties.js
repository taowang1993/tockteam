const MAX_FRONTMATTER_BYTES = 1_000_000;
const MAX_PROPERTIES = 1_000;
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
    const markerEnd = markerOffset + (source.startsWith('...', markerOffset) ? 3 : 3);
    const separator = source.startsWith('\r\n', markerEnd) ? 2 : source[markerEnd] === '\n' || source[markerEnd] === '\r' ? 1 : 0;
    return { bodyStart: markerEnd + separator, content: source.slice(start, markerOffset), start };
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
function scalar(value) {
    const decoded = decodeQuoted(value);
    if (decoded === 'true')
        return true;
    if (decoded === 'false')
        return false;
    if (decoded === 'null' || decoded === '~')
        return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(decoded)) {
        const number = Number(decoded);
        if (Number.isFinite(number))
            return number;
    }
    return decoded;
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
        let next = index + 1;
        while (next < lines.length && /^\s{2,}-\s+/u.test(lines[next][0])) {
            items.push(decodeQuoted(lines[next][0].replace(/^\s{2,}-\s+/u, '').replace(/(?:\r\n|\n|\r)$/u, '')));
            end += lines[next][0].length;
            next += 1;
        }
        const value = items.length > 0 ? items : scalar(match[2] ?? '');
        properties.push({ end, key, start: offset, type: inferPropertyType(value), value });
        index = next - 1;
        offset = end;
    }
    return properties;
}
export function parseFrontmatterProperties(source) {
    return ranges(source).map(({ key, type, value }) => ({ key, type, value }));
}
function quoteText(value) {
    if (value === '' || /^(?:true|false|null|~|-?(?:0|[1-9]\d*)(?:\.\d+)?|\d{4}-\d{2}-\d{2}(?:T.*)?)$/iu.test(value)
        || /[:#\[\]{},&*!|>'"%@`]/u.test(value)
        || /^\s|\s$/u.test(value))
        return JSON.stringify(value);
    return value;
}
function serializedProperty(key, value, eol) {
    if (Array.isArray(value))
        return `${key}:${eol}${value.map(item => `  - ${quoteText(item)}`).join(eol)}${eol}`;
    const encoded = value === null ? 'null' : typeof value === 'string' ? quoteText(value) : String(value);
    return `${key}: ${encoded}${eol}`;
}
export function setFrontmatterProperty(source, key, value) {
    if (!KEY.test(key))
        throw new Error('The property name is invalid.');
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const existing = ranges(source).find(property => property.key.toLocaleLowerCase() === key.toLocaleLowerCase());
    const serialized = serializedProperty(key, value, eol);
    if (existing !== undefined)
        return `${source.slice(0, existing.start)}${serialized}${source.slice(existing.end)}`;
    const block = frontmatter(source);
    if (block === null)
        return `---${eol}${serialized}---${eol}${source}`;
    const insertion = block.bodyStart - (source.startsWith('\r\n', block.bodyStart - 2) ? 5 : 4);
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