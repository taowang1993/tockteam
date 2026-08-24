import { createHash } from 'node:crypto';
import { parseZip } from "../archive.js";
import { destinationAliasKey, ImportExportError, normalizeRelativePath, sha256, stableJson, } from "../core.js";
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const ACCEPTED_ASSETS = new Set([
    '3gp', 'avif', 'bmp', 'flac', 'gif', 'jpeg', 'jpg', 'm4a', 'mkv', 'mov',
    'mp3', 'mp4', 'ogg', 'ogv', 'pdf', 'png', 'wav', 'webm', 'webp',
]);
const GENERAL_ARCHIVE_LIMITS = {
    maxArchiveBytes: 500 * 1024 * 1024,
    maxCompressionRatio: 100,
    maxDepth: 64,
    maxEntries: 20_000,
    maxEntryBytes: 50 * 1024 * 1024,
    maxFilenameBytes: 4_096,
    maxParserMs: 120_000,
    maxTotalBytes: 500 * 1024 * 1024,
};
function decode(bytes, maximum) {
    if (bytes.byteLength > maximum)
        throw new ImportExportError('limit-exceeded');
    try {
        return decoder.decode(bytes);
    }
    catch {
        throw new ImportExportError('unsupported-type');
    }
}
function extension(path) {
    const name = path.split('/').at(-1) ?? '';
    const dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.slice(dot + 1).toLocaleLowerCase('en-US');
}
function stem(path) {
    const name = path.split('/').at(-1) ?? path;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}
function safeSegment(value, fallback = 'Untitled') {
    const cleaned = value
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f]/gu, '')
        .replace(/[\\/:*?"<>|]/gu, '-')
        .replace(/[. ]+$/gu, '')
        .replace(/^\.+/gu, '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 96);
    return cleaned || fallback;
}
function uniqueDestination(base, used) {
    const normalized = normalizeRelativePath(base);
    const dot = normalized.lastIndexOf('.');
    const prefix = dot > normalized.lastIndexOf('/') ? normalized.slice(0, dot) : normalized;
    const suffix = dot > normalized.lastIndexOf('/') ? normalized.slice(dot) : '';
    for (let number = 1; number <= 10_000; number += 1) {
        const candidate = number === 1 ? normalized : `${prefix}-${String(number)}${suffix}`;
        const alias = destinationAliasKey(candidate);
        if (!used.has(alias)) {
            used.add(alias);
            return candidate;
        }
    }
    throw new ImportExportError('limit-exceeded');
}
function finalize(files, skipped, sourceEntries, warnings = []) {
    if (files.length === 0)
        throw new ImportExportError('unsupported-type');
    files.sort((left, right) => left.destination.localeCompare(right.destination));
    skipped.sort((left, right) => left.label.localeCompare(right.label) || left.reason.localeCompare(right.reason));
    const size = files.reduce((total, file) => total + file.bytes.byteLength, 0);
    return {
        digest: sha256(stableJson({
            files: files.map(file => ({ destination: file.destination, digest: sha256(file.bytes), kind: file.kind })),
            skipped,
        })),
        files,
        size,
        skipped,
        sourceEntries,
        warnings: [
            ...warnings,
            ...(skipped.length === 0 ? [] : [`${String(skipped.length)} source ${skipped.length === 1 ? 'record is' : 'records are'} unsupported or intentionally omitted.`]),
        ],
    };
}
function yamlScalar(value) {
    if (/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?)$/u.test(value) && !/^-?0\d/u.test(value))
        return value;
    return JSON.stringify(value);
}
function parseCsv(source) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') {
                field += '"';
                index += 1;
            }
            else if (character === '"')
                quoted = false;
            else
                field += character;
            continue;
        }
        if (character === '"' && field === '')
            quoted = true;
        else if (character === ',') {
            row.push(field);
            field = '';
        }
        else if (character === '\n') {
            row.push(field.replace(/\r$/u, ''));
            rows.push(row);
            row = [];
            field = '';
        }
        else if (character === '\r' && source[index + 1] === '\n') {
            // The following newline closes the row.
        }
        else
            field += character;
    }
    if (quoted)
        throw new ImportExportError('unsupported-type');
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
function uniqueKeys(headers) {
    const used = new Set();
    return headers.map((header, index) => {
        const base = safeSegment(header.toLocaleLowerCase('en-US').replace(/\s+/gu, '-'), `column-${String(index + 1)}`);
        for (let suffix = 1; suffix <= 1_000; suffix += 1) {
            const candidate = suffix === 1 ? base : `${base}-${String(suffix)}`;
            const alias = candidate.toLocaleLowerCase('en-US');
            if (!used.has(alias)) {
                used.add(alias);
                return candidate;
            }
        }
        throw new ImportExportError('limit-exceeded');
    });
}
export function planCsv(bytes, sourceName) {
    const rows = parseCsv(decode(bytes, 2 * 1024 * 1024));
    if (rows.length < 2 || rows[0]?.every(value => value.trim() === ''))
        throw new ImportExportError('unsupported-type');
    const headers = rows[0];
    if (headers.length > 200 || rows.some(row => row.length > 200))
        throw new ImportExportError('limit-exceeded');
    const keys = uniqueKeys(headers);
    const titleIndex = headers.findIndex(value => /^(?:name|title)$/iu.test(value.trim()));
    const root = `Imported/${safeSegment(stem(sourceName), 'CSV Import')}`;
    const batch = sha256(bytes).slice(7, 23);
    const used = new Set();
    const files = [];
    const skipped = [];
    for (const [offset, values] of rows.slice(1).entries()) {
        if (offset >= 500) {
            skipped.push({ label: `row ${String(offset + 2)}`, reason: 'row-limit' });
            continue;
        }
        if (values.every(value => value.trim() === ''))
            continue;
        const title = safeSegment(values[titleIndex < 0 ? 0 : titleIndex] ?? '', `Row ${String(offset + 1)}`);
        const destination = uniqueDestination(`${root}/${title}.md`, used);
        const properties = keys.flatMap((key, index) => {
            const value = values[index]?.trim() ?? '';
            return value === '' ? [] : [`${key}: ${yamlScalar(value)}`];
        });
        const content = [
            '---',
            `title: ${yamlScalar(title)}`,
            `import-batch: ${yamlScalar(batch)}`,
            ...properties,
            '---',
            '',
            `# ${title}`,
            '',
        ].join('\n');
        files.push({ bytes: encoder.encode(content), destination, kind: 'document', sourceKey: `row:${String(offset + 2)}` });
    }
    const baseName = safeSegment(stem(sourceName), 'CSV Import');
    files.push({
        bytes: encoder.encode([
            'filters:',
            `  - note.import-batch == ${JSON.stringify(batch)}`,
            'properties:',
            ...keys.map(key => `  note.${key}:\n    displayName: ${yamlScalar(key)}`),
            'views:',
            '  - type: table',
            `    name: ${JSON.stringify(baseName)}`,
            '    order:',
            '      - file.name',
            ...keys.map(key => `      - note.${key}`),
            '',
        ].join('\n')),
        destination: uniqueDestination(`${root}/${baseName}.base`, used),
        kind: 'document',
        sourceKey: 'generated-base',
    });
    return finalize(files, skipped, rows.length);
}
function decodeEntities(value) {
    const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
    return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (_match, decimal, hex, name) => {
        if (decimal)
            return String.fromCodePoint(Number(decimal));
        if (hex)
            return String.fromCodePoint(Number.parseInt(hex, 16));
        return named[name.toLocaleLowerCase('en-US')] ?? '';
    });
}
function stripResidualMarkup(value) {
    return decodeEntities(value)
        .replace(/<(?:script|style|iframe|object|embed|svg)\b[^>]*>[^]*?<\/(?:script|style|iframe|object|embed|svg)>/giu, '')
        .replace(/<[^>\n]*>/gu, '');
}
function relativeSource(base, reference) {
    const cleaned = reference.split(/[?#]/u, 1)[0] ?? '';
    if (cleaned === '' || /^[a-z][a-z\d+.-]*:/iu.test(cleaned) || cleaned.startsWith('//') || cleaned.startsWith('/'))
        return null;
    const stack = base.split('/').slice(0, -1);
    for (const segment of cleaned.split('/')) {
        if (segment === '' || segment === '.')
            continue;
        if (segment === '..') {
            if (stack.length === 0)
                return null;
            stack.pop();
        }
        else
            stack.push(segment);
    }
    try {
        return normalizeRelativePath(stack.join('/'));
    }
    catch {
        return null;
    }
}
function relativeOutput(from, to) {
    const fromParts = from.split('/').slice(0, -1);
    const toParts = to.split('/');
    let common = 0;
    while (fromParts[common] !== undefined && fromParts[common] === toParts[common])
        common += 1;
    return [...fromParts.slice(common).map(() => '..'), ...toParts.slice(common)].join('/') || toParts.at(-1) || to;
}
function htmlMarkdown(html, sourcePath, outputRoot, noteMap, skipped) {
    let value = html
        .replace(/<!--[^]*?-->/gu, '')
        .replace(/<(?:script|style|iframe|object|embed|svg)\b[^>]*>[^]*?<\/(?:script|style|iframe|object|embed|svg)>/giu, '');
    const resources = [];
    const currentDestination = noteMap.get(sourcePath) ?? `${outputRoot}/Imported.md`;
    value = value.replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu, (_match, reference) => {
        const local = relativeSource(sourcePath, decodeEntities(reference));
        if (local === null) {
            skipped.push({ label: reference.slice(0, 512), reason: 'remote-resource' });
            return '';
        }
        resources.push(local);
        return `![](${relativeOutput(currentDestination, `${outputRoot}/${local}`)})`;
    });
    value = value.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([^]*?)<\/a>/giu, (_match, reference, label) => {
        const local = relativeSource(sourcePath, decodeEntities(reference));
        const destination = local === null ? undefined : noteMap.get(local);
        const text = decodeEntities(label.replace(/<[^>]+>/gu, '')).trim();
        return destination === undefined ? text : `[${text}](${relativeOutput(currentDestination, destination)})`;
    });
    value = value
        .replace(/<h1\b[^>]*>([^]*?)<\/h1>/giu, '\n# $1\n')
        .replace(/<h2\b[^>]*>([^]*?)<\/h2>/giu, '\n## $1\n')
        .replace(/<h3\b[^>]*>([^]*?)<\/h3>/giu, '\n### $1\n')
        .replace(/<li\b[^>]*>([^]*?)<\/li>/giu, '\n- $1')
        .replace(/<(?:br|hr)\s*\/?>/giu, '\n')
        .replace(/<\/(?:div|p|section|article|ul|ol)>/giu, '\n')
        .replace(/<[^>]+>/gu, '');
    value = stripResidualMarkup(value)
        .replace(/[ \t]+\n/gu, '\n')
        .replace(/\n{3,}/gu, '\n\n')
        .trim();
    return { markdown: `${value}\n`, resources };
}
export function planHtml(files, rootName) {
    if (files.length === 0 || files.length > 500)
        throw new ImportExportError('limit-exceeded');
    const source = new Map(files.map(file => [normalizeRelativePath(file.path), file]));
    const root = `Imported/${safeSegment(rootName, 'HTML Import')}`;
    const noteMap = new Map();
    const used = new Set();
    for (const path of [...source.keys()].sort()) {
        if (extension(path) === 'html' || extension(path) === 'htm') {
            noteMap.set(path, uniqueDestination(`${root}/${path.replace(/\.(?:html?|HTML?)$/u, '.md')}`, used));
        }
    }
    const filesOut = [];
    const skipped = [];
    const referenced = new Set();
    for (const [path, destination] of noteMap) {
        const input = source.get(path);
        const converted = htmlMarkdown(decode(input.bytes, 10 * 1024 * 1024), path, root, noteMap, skipped);
        converted.resources.forEach(resource => referenced.add(resource));
        filesOut.push({ bytes: encoder.encode(converted.markdown), destination, kind: 'document', sourceKey: input.fingerprint });
    }
    for (const path of [...referenced].sort()) {
        const input = source.get(path);
        if (input === undefined || !ACCEPTED_ASSETS.has(extension(path))) {
            skipped.push({ label: path, reason: 'unsupported-resource' });
            continue;
        }
        if (input.bytes.byteLength > 10 * 1024 * 1024) {
            skipped.push({ label: path, reason: 'limit-exceeded' });
            continue;
        }
        filesOut.push({ bytes: new Uint8Array(input.bytes), destination: uniqueDestination(`${root}/${path}`, used), kind: 'attachment', sourceKey: input.fingerprint });
    }
    return finalize(filesOut, skipped, files.length);
}
export function planHtmlZip(bytes, rootName) {
    const entries = parseZip(bytes, {
        ...GENERAL_ARCHIVE_LIMITS,
        maxArchiveBytes: 50 * 1024 * 1024,
        maxEntries: 500,
        maxEntryBytes: 10 * 1024 * 1024,
        maxTotalBytes: 100 * 1024 * 1024,
    });
    return planHtml(entries.map(entry => ({
        bytes: entry.bytes,
        fingerprint: `${entry.path}:${sha256(entry.bytes)}`,
        path: entry.path,
    })), rootName);
}
function classText(html, className) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return [...html.matchAll(new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([^]*?)<\\/[^>]+>`, 'giu'))]
        .flatMap(match => {
        const value = stripResidualMarkup((match[1] ?? '').replace(/<[^>]+>/gu, '')).trim();
        return value === '' ? [] : [value];
    });
}
export function planAppleJournal(files) {
    const used = new Set();
    const output = [];
    const skipped = [];
    for (const file of files.slice(0, 500)) {
        if (!/\.html?$/iu.test(file.path))
            continue;
        const html = decode(file.bytes, 10 * 1024 * 1024);
        const date = classText(html, 'pageHeader')[0];
        if (date !== undefined) {
            const parsed = new Date(`${date}T00:00:00.000Z`);
            if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Number.isNaN(parsed.getTime())
                || parsed.toISOString().slice(0, 10) !== date)
                throw new ImportExportError('unsupported-type');
        }
        const prompt = classText(html, 'reflectionPrompt')[0];
        const body = [...classText(html, 'p2'), ...classText(html, 'p3')];
        const content = [
            ...(date === undefined && prompt === undefined ? [] : ['---']),
            ...(date === undefined ? [] : [`date: ${date}`]),
            ...(prompt === undefined ? [] : [`reflection-prompt: ${yamlScalar(prompt)}`]),
            ...(date === undefined && prompt === undefined ? [] : ['---', '']),
            ...body,
            '',
        ].join('\n');
        const destination = uniqueDestination(`Journal/${safeSegment(stem(file.path))}.md`, used);
        output.push({ bytes: encoder.encode(content), destination, kind: 'document', sourceKey: file.fingerprint });
        if (/data-asset-type=["'](?:photo|video|live-photo)["']/iu.test(html)) {
            skipped.push({ label: `${file.path} media`, reason: 'unsupported-media' });
        }
    }
    return finalize(output, skipped, files.length);
}
function roamBlocks(blocks, depth, count) {
    if (depth > 64)
        throw new ImportExportError('limit-exceeded');
    const lines = [];
    for (const block of blocks) {
        count.value += 1;
        if (count.value > 100_000)
            throw new ImportExportError('limit-exceeded');
        const raw = typeof block.string === 'string' ? block.string : '';
        if (raw.length > 100_000)
            throw new ImportExportError('limit-exceeded');
        const converted = raw
            .replace(/\{\{\[\[TODO\]\]\}\}/gu, '[ ]')
            .replace(/\{\{\[\[DONE\]\]\}\}/gu, '[x]')
            .replace(/#\[\[([^\]]+)\]\]/gu, '#$1')
            .replace(/\[\[([^\]]+)\]\]/gu, '[[$1]]')
            .replace(/\^\^([^]+?)\^\^/gu, '==$1==');
        lines.push(`${'  '.repeat(depth)}- ${converted}`);
        if (Array.isArray(block.children))
            lines.push(...roamBlocks(block.children, depth + 1, count));
    }
    return lines;
}
export function planRoam(bytes) {
    const source = decode(bytes, 25 * 1024 * 1024);
    let value;
    try {
        value = JSON.parse(source);
    }
    catch {
        throw new ImportExportError('unsupported-type');
    }
    if (!Array.isArray(value) || value.length > 5_000)
        throw new ImportExportError('limit-exceeded');
    const used = new Set();
    const files = [];
    const skipped = [];
    const count = { value: 0 };
    for (const [index, page] of value.entries()) {
        if (page === null || typeof page !== 'object' || typeof page.title !== 'string') {
            skipped.push({ label: `page ${String(index + 1)}`, reason: 'malformed-page' });
            continue;
        }
        const typed = page;
        const lines = Array.isArray(typed.children) ? roamBlocks(typed.children, 0, count) : [];
        const destination = uniqueDestination(`Imported/Roam Research/${safeSegment(typed.title)}.md`, used);
        files.push({ bytes: encoder.encode(`# ${typed.title}\n\n${lines.join('\n')}\n`), destination, kind: 'document', sourceKey: `page:${String(index)}` });
    }
    return finalize(files, skipped, value.length);
}
export function planGoogleKeep(bytes) {
    const entries = parseZip(bytes, { ...GENERAL_ARCHIVE_LIMITS, maxArchiveBytes: 200 * 1024 * 1024, maxEntries: 5_000, maxTotalBytes: 250 * 1024 * 1024 });
    const byPath = new Map(entries.map(entry => [entry.path, entry]));
    const used = new Set();
    const files = [];
    const skipped = [];
    const referenced = new Set();
    let notes = 0;
    for (const entry of entries) {
        if (!/(?:^|\/)Keep\/[^/]+\.json$/u.test(entry.path))
            continue;
        notes += 1;
        if (notes > 2_000)
            throw new ImportExportError('limit-exceeded');
        let note;
        try {
            note = JSON.parse(decode(entry.bytes, 5 * 1024 * 1024));
        }
        catch {
            throw new ImportExportError('unsupported-type');
        }
        const title = safeSegment(typeof note.title === 'string' ? note.title : '', 'Untitled Keep Note');
        const labels = Array.isArray(note.labels)
            ? note.labels.flatMap(label => label !== null && typeof label === 'object' && typeof label.name === 'string' ? [label.name] : [])
            : [];
        const tasks = Array.isArray(note.listContent)
            ? note.listContent.flatMap(item => item !== null && typeof item === 'object'
                ? [`- ${item.isChecked === true ? '[x]' : '[ ]'} ${String(item.text ?? '')}`]
                : [])
            : [];
        const attachments = Array.isArray(note.attachments) ? note.attachments : [];
        const attachmentLinks = [];
        for (const attachment of attachments) {
            if (attachment === null || typeof attachment !== 'object' || typeof attachment.filePath !== 'string')
                continue;
            const reference = attachment.filePath;
            const directory = entry.path.slice(0, entry.path.lastIndexOf('/') + 1);
            const path = `${directory}${reference}`;
            referenced.add(path);
            attachmentLinks.push(`![[Attachments/${safeSegment(reference)}]]`);
        }
        const body = typeof note.textContent === 'string' ? note.textContent : tasks.join('\n');
        const content = [
            '---',
            ...(labels.length === 0 ? [] : ['tags:', ...labels.map(label => `  - ${safeSegment(label)}`)]),
            ...(note.isPinned === true ? ['pinned: true'] : []),
            ...(note.isArchived === true ? ['archived: true'] : []),
            ...(note.isTrashed === true ? ['trashed: true'] : []),
            '---', '', `# ${title}`, '', body, ...attachmentLinks, '',
        ].join('\n');
        files.push({ bytes: encoder.encode(content), destination: uniqueDestination(`Imported/Google Keep/${title}.md`, used), kind: 'document', sourceKey: entry.path });
    }
    for (const path of [...referenced].sort()) {
        const entry = byPath.get(path);
        if (entry === undefined || !ACCEPTED_ASSETS.has(extension(path))) {
            skipped.push({ label: path, reason: 'unsupported-attachment' });
            continue;
        }
        files.push({ bytes: entry.bytes, destination: uniqueDestination(`Imported/Google Keep/Attachments/${safeSegment(path.split('/').at(-1) ?? 'asset')}`, used), kind: 'attachment', sourceKey: path });
    }
    for (const entry of entries) {
        if (/(?:^|\/)Keep\/[^/]+\.json$/u.test(entry.path) || referenced.has(entry.path))
            continue;
        skipped.push({ label: entry.path, reason: 'unsupported-type' });
    }
    return finalize(files, skipped, entries.length);
}
export function planTextbundle(files) {
    if (files.length > 202 || files.reduce((total, file) => total + file.bytes.byteLength, 0) > 25 * 1024 * 1024) {
        throw new ImportExportError('limit-exceeded');
    }
    const textFile = files.find(file => /(?:^|\/)text\.(?:md|markdown)$/iu.test(file.path));
    if (textFile === undefined)
        throw new ImportExportError('unsupported-type');
    const rootPrefix = textFile.path.slice(0, textFile.path.lastIndexOf('/') + 1);
    const info = files.find(file => file.path === `${rootPrefix}info.json`);
    if (info !== undefined) {
        let metadata;
        try {
            metadata = JSON.parse(decode(info.bytes, 512 * 1024));
        }
        catch {
            throw new ImportExportError('unsupported-type');
        }
        if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))
            throw new ImportExportError('unsupported-type');
        const type = metadata.type;
        if (type !== undefined && !['net.daringfireball.markdown', 'text/markdown', 'text/x-markdown'].includes(String(type))) {
            throw new ImportExportError('unsupported-type');
        }
    }
    const bundleName = safeSegment(stem(rootPrefix.replace(/\/$/u, '') || textFile.path).replace(/\.textbundle$/iu, ''), 'Textbundle');
    const used = new Set();
    const skipped = [];
    const output = [];
    const markdown = decode(textFile.bytes, 25 * 1024 * 1024).replace(/\]\(\.\/assets\//gu, '](assets/').replace(/\]\(assets\//gu, '](assets/');
    for (const file of files) {
        if (!file.path.startsWith(`${rootPrefix}assets/`))
            continue;
        const relative = file.path.slice(`${rootPrefix}assets/`.length);
        if (relative.includes('/') || !ACCEPTED_ASSETS.has(extension(relative)) || file.bytes.byteLength > 10 * 1024 * 1024) {
            skipped.push({ label: `assets/${relative}`, reason: 'unsupported-type' });
            continue;
        }
        output.push({ bytes: file.bytes, destination: uniqueDestination(`Imported/${bundleName}/assets/${safeSegment(relative)}`, used), kind: 'attachment', sourceKey: file.fingerprint });
    }
    output.push({ bytes: encoder.encode(`${markdown.replace(/\n*$/u, '')}\n`), destination: uniqueDestination(`Imported/${bundleName}/${bundleName}.md`, used), kind: 'document', sourceKey: textFile.fingerprint });
    return finalize(output, skipped, files.length);
}
export function planTextpack(bytes) {
    const entries = parseZip(bytes, {
        ...GENERAL_ARCHIVE_LIMITS,
        maxArchiveBytes: 25 * 1024 * 1024,
        maxDepth: 16,
        maxEntries: 202,
        maxEntryBytes: 10 * 1024 * 1024,
        maxTotalBytes: 25 * 1024 * 1024,
    });
    return planTextbundle(entries.map(entry => ({
        bytes: entry.bytes,
        fingerprint: `${entry.path}:${sha256(entry.bytes)}`,
        path: entry.path,
    })));
}
function xmlText(xml, tag) {
    const match = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([^]*?)(?:\\]\\]>)?<\\/${tag}>`, 'iu').exec(xml);
    return match === null ? undefined : decodeEntities(match[1] ?? '').trim();
}
function enmlMarkdown(content) {
    return stripResidualMarkup(content
        .replace(/<(?:script|style|iframe|object|svg)\b[^>]*>[^]*?<\/(?:script|style|iframe|object|svg)>/giu, '')
        .replace(/<en-media\b[^>]*\bhash=["']([0-9a-f]+)["'][^>]*\/>/giu, (_match, hash) => `__EN_MEDIA_${hash.toLocaleLowerCase('en-US')}__`)
        .replace(/<(?:br)\s*\/?>/giu, '\n')
        .replace(/<\/(?:div|p|li)>/giu, '\n')
        .replace(/<[^>]+>/gu, ''))
        .replace(/\n{3,}/gu, '\n\n')
        .trim();
}
function assertWellFormedXml(xml) {
    const scrubbed = xml
        .replace(/<!\[CDATA\[[^]*?\]\]>/gu, '')
        .replace(/<!--[\s\S]*?-->/gu, '')
        .replace(/<\?[^]*?\?>/gu, '');
    if (/<!/u.test(scrubbed))
        throw new ImportExportError('unsupported-type');
    const stack = [];
    let cursor = 0;
    for (const match of scrubbed.matchAll(/<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*)?\s*\/?>/gu)) {
        const index = match.index ?? 0;
        if (/[<>]/u.test(scrubbed.slice(cursor, index)))
            throw new ImportExportError('unsupported-type');
        const token = match[0];
        const name = (match[1] ?? '').toLocaleLowerCase('en-US');
        if (token.startsWith('</')) {
            if (stack.pop() !== name)
                throw new ImportExportError('unsupported-type');
        }
        else if (!token.endsWith('/>'))
            stack.push(name);
        cursor = index + token.length;
    }
    if (stack.length !== 0 || /[<>]/u.test(scrubbed.slice(cursor)))
        throw new ImportExportError('unsupported-type');
}
export function planEvernote(bytes, sourceName) {
    const xml = decode(bytes, 100 * 1024 * 1024);
    if (/<!DOCTYPE|<!ENTITY/iu.test(xml))
        throw new ImportExportError('unsupported-type');
    assertWellFormedXml(xml);
    const noteMatches = [...xml.matchAll(/<note>([^]*?)<\/note>/giu)];
    if (noteMatches.length === 0 || noteMatches.length > 5_000)
        throw new ImportExportError('unsupported-type');
    const root = `Imported/Evernote/${safeSegment(stem(sourceName), 'Evernote')}`;
    const used = new Set();
    const output = [];
    const skipped = [];
    let resourceBytes = 0;
    let resourceCount = 0;
    for (const [index, match] of noteMatches.entries()) {
        const note = match[1] ?? '';
        const title = safeSegment(xmlText(note, 'title') ?? '', `Note ${String(index + 1)}`);
        let body = enmlMarkdown(xmlText(note, 'content') ?? '');
        const resources = [...note.matchAll(/<resource>([^]*?)<\/resource>/giu)];
        for (const [resourceIndex, resourceMatch] of resources.entries()) {
            resourceCount += 1;
            if (resourceCount > 20_000)
                throw new ImportExportError('limit-exceeded');
            const resource = resourceMatch[1] ?? '';
            const mime = xmlText(resource, 'mime') ?? '';
            const data = xmlText(resource, 'data') ?? '';
            const originalName = xmlText(resource, 'file-name') ?? `resource-${String(resourceIndex + 1)}`;
            const suffix = mime === 'image/png' ? 'png' : extension(originalName);
            if (!ACCEPTED_ASSETS.has(suffix) || !/^[A-Za-z\d+/=\s]+$/u.test(data)) {
                skipped.push({ label: `${title} resource ${String(resourceIndex + 1)}`, reason: 'unsupported-resource' });
                continue;
            }
            const asset = Buffer.from(data.replace(/\s+/gu, ''), 'base64');
            resourceBytes += asset.byteLength;
            if (asset.byteLength > 50 * 1024 * 1024 || resourceBytes > 500 * 1024 * 1024) {
                throw new ImportExportError('limit-exceeded');
            }
            const name = safeSegment(originalName.includes('.') ? originalName : `${originalName}.${suffix}`);
            const destination = uniqueDestination(`${root}/Attachments/${title}/${name}`, used);
            output.push({ bytes: new Uint8Array(asset), destination, kind: 'attachment', sourceKey: `resource:${String(index)}:${String(resourceIndex)}` });
            const hash = createHash('md5').update(asset).digest('hex');
            body = body.replaceAll(`__EN_MEDIA_${hash}__`, `![[Attachments/${title}/${name}]]`);
        }
        body = body.replace(/__EN_MEDIA_[0-9a-f]+__/gu, '');
        const tags = [...note.matchAll(/<tag>([^]*?)<\/tag>/giu)].map(tag => safeSegment(decodeEntities(tag[1] ?? '')));
        const created = xmlText(note, 'created');
        const content = [
            '---',
            ...(created === undefined ? [] : [`created: ${yamlScalar(created)}`]),
            ...(tags.length === 0 ? [] : ['tags:', ...tags.map(tag => `  - ${tag}`)]),
            '---', '', `# ${title}`, '', body, '',
        ].join('\n');
        output.push({ bytes: encoder.encode(content), destination: uniqueDestination(`${root}/${title}.md`, used), kind: 'document', sourceKey: `note:${String(index)}` });
    }
    return finalize(output, skipped, noteMatches.length);
}
export function planBear(bytes) {
    const entries = parseZip(bytes, GENERAL_ARCHIVE_LIMITS);
    const byPath = new Map(entries.map(entry => [entry.path, entry]));
    const used = new Set();
    const output = [];
    const skipped = [];
    const consumed = new Set();
    for (const entry of entries) {
        if (!/(?:^|\/)text\.md$/iu.test(entry.path))
            continue;
        consumed.add(entry.path);
        const directory = entry.path.slice(0, entry.path.lastIndexOf('/') + 1);
        const infoEntry = byPath.get(`${directory}info.json`);
        if (infoEntry !== undefined)
            consumed.add(infoEntry.path);
        let info = {};
        if (infoEntry !== undefined) {
            try {
                info = JSON.parse(decode(infoEntry.bytes, 512 * 1024));
            }
            catch {
                throw new ImportExportError('unsupported-type');
            }
        }
        const sourceMarkdown = decode(entry.bytes, 5 * 1024 * 1024);
        const heading = /^#\s+(.+)$/mu.exec(sourceMarkdown)?.[1];
        const title = safeSegment(typeof info.title === 'string' ? info.title : heading ?? '', 'Bear Note');
        const folder = info.trashed === true ? 'Trash/' : info.archived === true ? 'Archive/' : '';
        const tags = Array.isArray(info.tags) ? info.tags.filter((tag) => typeof tag === 'string') : [];
        const frontmatter = [
            '---',
            ...(tags.length === 0 ? [] : ['tags:', ...tags.map(tag => `  - ${safeSegment(tag)}`)]),
            ...(info.archived === true ? ['archived: true'] : []),
            ...(info.trashed === true ? ['trashed: true'] : []),
            '---', '',
        ].join('\n');
        output.push({ bytes: encoder.encode(`${frontmatter}${sourceMarkdown.replace(/^\s*/u, '')}`), destination: uniqueDestination(`Imported/Bear/${folder}${title}.md`, used), kind: 'document', sourceKey: entry.path });
        const assetPrefix = `${directory}assets/`;
        for (const asset of entries.filter(candidate => candidate.path.startsWith(assetPrefix))) {
            consumed.add(asset.path);
            if (!ACCEPTED_ASSETS.has(extension(asset.path))) {
                skipped.push({ label: asset.path, reason: 'unsupported-attachment' });
                continue;
            }
            const name = safeSegment(asset.path.slice(assetPrefix.length));
            output.push({ bytes: asset.bytes, destination: uniqueDestination(`Imported/Bear/Attachments/${title}/${name}`, used), kind: 'attachment', sourceKey: asset.path });
        }
    }
    for (const entry of entries)
        if (!consumed.has(entry.path))
            skipped.push({ label: entry.path, reason: 'unsupported-record' });
    return finalize(output, skipped, entries.length);
}
//# sourceMappingURL=converters.js.map