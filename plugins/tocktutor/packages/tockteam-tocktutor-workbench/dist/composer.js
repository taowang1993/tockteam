import { Document, isAlias, isMap, isNode, isScalar, parseDocument, visit } from 'yaml';
import { expandTemplate } from "./capture.js";
import { isSafeVaultRelativePath } from "./session.js";
function appendBlock(source, block, prepend = false) {
    const [left, right] = prepend ? [block, source] : [source, block];
    if (!left || !right)
        return left + right;
    const eol = source.match(/\r\n|\r|\n/u)?.[0] ?? block.match(/\r\n|\r|\n/u)?.[0] ?? '\n';
    const trailing = left.match(/(?:\r\n|\r|\n)$/u)?.[0] ?? '';
    const leading = right.match(/^(?:\r\n|\r|\n)/u)?.[0] ?? '';
    const separated = (trailing && /[\r\n]$/u.test(left.slice(0, -trailing.length)))
        || (leading && /^[\r\n]/u.test(right.slice(leading.length))) || (trailing && leading);
    return `${left}${separated ? '' : eol.repeat(trailing || leading ? 1 : 2)}${right}`;
}
function link(path, label, kind) {
    if (kind === 'none')
        return '';
    if (kind === 'embed')
        return `![[${path}]]`;
    return `[[${path}|${label.replace(/[\[\]|\r\n]/gu, ' ').trim().slice(0, 200) || path}]]`;
}
export function extractSelectionToNote(input) {
    if (!isSafeVaultRelativePath(input.destinationPath) || !/\.md$/iu.test(input.destinationPath))
        throw new Error('Composer destination is invalid.');
    if (!Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.end) || input.start < 0 || input.end <= input.start || input.end > input.source.length)
        throw new Error('Composer selection is invalid.');
    const selected = input.source.slice(input.start, input.end);
    const replacement = link(input.destinationPath, selected, input.leftover);
    const destinationContent = input.template === undefined
        ? `${selected.replace(/^\s+|\s+$/gu, '')}\n`
        : expandTemplate(input.template, {
            content: selected.replace(/^\s+|\s+$/gu, ''),
            fromTitle: input.sourceTitle,
            now: new Date(),
            title: input.destinationTitle,
        }).replace(/\s+$/u, '');
    return {
        destinationContent,
        sourceContent: `${input.source.slice(0, input.start)}${replacement}${input.source.slice(input.end)}`,
    };
}
function mergeFrontmatter(source) {
    if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > 2_000_000)
        throw new Error('Composer merge content is too large or invalid.');
    const opening = source.match(/^\uFEFF?---(?:\r\n|\r|\n)/u);
    if (!opening)
        return { body: source, header: '', yaml: '', document: null, properties: new Map() };
    const rest = source.slice(opening[0].length);
    const closing = /^(?:---|\.\.\.)(?:\r\n|\r|\n|$)/gmu.exec(rest);
    if (!closing || closing.index > 64_000)
        throw new Error('Note properties are unclosed or too large. Resolve them in Source Mode.');
    const yaml = rest.slice(0, closing.index);
    const document = parseDocument(yaml, { uniqueKeys: true, strict: true, intAsBigInt: true });
    if (document.errors.length || document.warnings.length || (document.contents !== null && !isMap(document.contents))) {
        throw new Error('Note properties must be a valid mapping. Resolve them in Source Mode.');
    }
    let nodes = 0;
    visit(document, (_, node) => {
        // ponytail: do not reconcile cross-document YAML anchors/tags; resolve them in Source Mode first.
        if (++nodes > 4_000 || isAlias(node) || (isNode(node) && (node.anchor || node.tag))) {
            throw new Error('Complex note properties must be resolved in Source Mode before merging.');
        }
        if (isScalar(node) && typeof node.value === 'number') {
            const scalar = node.clone();
            delete scalar.comment;
            delete scalar.commentBefore;
            if (new Document(scalar).toString().trim() !== node.source) {
                throw new Error('Numeric properties must round-trip exactly. Quote the value in Source Mode before merging.');
            }
        }
    });
    const properties = new Map();
    if (isMap(document.contents))
        for (const pair of document.contents.items) {
            if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || properties.size >= 1_000)
                throw new Error('Note property names must be bounded text.');
            const property = new Document({});
            property.add(pair.clone());
            properties.set(pair.key.value, { pair, value: property.toString({ lineWidth: 0, flowCollectionPadding: false }) });
        }
    const end = opening[0].length + closing.index + closing[0].length;
    return { body: source.slice(end), header: source.slice(0, end), yaml, document, properties };
}
export function mergePropertyConflicts(source, destination) {
    const from = mergeFrontmatter(source), to = mergeFrontmatter(destination);
    return [...from.properties].flatMap(([key, entry]) => {
        const current = to.properties.get(key);
        return current && current.value !== entry.value ? [{ key, source: entry.value, destination: current.value }] : [];
    });
}
export function mergeNotes(input) {
    if (!isSafeVaultRelativePath(input.destinationPath) || !isSafeVaultRelativePath(input.sourcePath)
        || !/\.(?:md|markdown)$/iu.test(input.destinationPath) || !/\.(?:md|markdown)$/iu.test(input.sourcePath)
        || input.destinationPath.normalize('NFC').toLowerCase() === input.sourcePath.normalize('NFC').toLowerCase())
        throw new Error('Composer merge paths are invalid.');
    if (!['append', 'prepend'].includes(input.placement) || !['link', 'embed', 'none'].includes(input.leftover))
        throw new Error('Composer merge options are invalid.');
    const source = mergeFrontmatter(input.source), destination = mergeFrontmatter(input.destination);
    let header = destination.header || source.header;
    if (source.document && destination.document) {
        const document = destination.document.clone();
        for (const [key, entry] of source.properties) {
            const current = destination.properties.get(key);
            const choice = input.propertyChoices && Object.hasOwn(input.propertyChoices, key) ? input.propertyChoices[key] : undefined;
            if (current && current.value !== entry.value && choice !== 'source' && choice !== 'destination')
                throw new Error(`Choose which value to keep for property ${key}.`);
            if (!current || choice === 'source')
                document.set(key, entry.pair.value && isNode(entry.pair.value) ? entry.pair.value.clone() : null);
            if ((!current || choice === 'source') && isMap(document.contents)) {
                const index = document.contents.items.findIndex(pair => String(pair.key) === key);
                document.contents.items[index] = entry.pair.clone();
            }
        }
        for (const field of ['commentBefore', 'comment']) {
            if (source.document[field] && source.document[field] !== document[field])
                document[field] = [document[field], source.document[field]].filter(Boolean).join('\n');
        }
        const eol = input.destination.match(/\r\n|\r|\n/u)?.[0] ?? '\n';
        const yaml = document.contents === null ? destination.yaml + source.yaml : document.toString({ lineWidth: 0, flowCollectionPadding: false });
        header = `---${eol}${yaml.replace(/\r\n|\r|\n/gu, eol)}---${eol}`;
    }
    const body = appendBlock(destination.body, source.body, input.placement === 'prepend');
    if (header && body && !/[\r\n]$/u.test(header))
        header += input.destination.match(/\r\n|\r|\n/u)?.[0] ?? '\n';
    const destinationContent = header + body;
    mergeFrontmatter(destinationContent);
    const from = input.sourcePath.split('/').slice(0, -1), to = input.destinationPath.split('/');
    let shared = 0;
    while (shared < from.length && from[shared] === to[shared])
        shared += 1;
    const target = [...from.slice(shared).map(() => '..'), ...to.slice(shared).map(encodeURIComponent)].join('/');
    return {
        destinationContent,
        sourceContent: `${link(target, input.destinationPath.replace(/\.(?:md|markdown)$/iu, ''), input.leftover)}\n`,
    };
}
function convertFrontmatter(lines) {
    if (lines[0] !== '---')
        return;
    const end = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'));
    if (end < 0)
        return;
    const replacements = new Map([['alias', 'aliases'], ['tag', 'tags'], ['cssclass', 'cssclasses']]);
    for (let index = 1; index < end; index += 1) {
        const match = lines[index]?.match(/^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/u);
        const replacement = match === null || match === undefined ? undefined : replacements.get(match[1].toLocaleLowerCase());
        if (replacement !== undefined)
            lines[index] = `${replacement}:${match[2]}`;
    }
}
export function convertMarkdownFormats(source, options) {
    if (new TextEncoder().encode(source).byteLength > 2_000_000)
        throw new Error('Format conversion source is too large.');
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const finalEol = /(?:\r\n|[\r\n])$/u.test(source);
    const lines = source.split(/\r?\n/u);
    if (finalEol)
        lines.pop();
    if (options.deprecatedProperties === true)
        convertFrontmatter(lines);
    let fence = null;
    for (let index = 0; index < lines.length; index += 1) {
        let line = lines[index];
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
        if (marker !== undefined) {
            if (fence === null)
                fence = { character: marker[0], length: marker.length };
            else if (marker[0] === fence.character && marker.length >= fence.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line))
                fence = null;
            continue;
        }
        if (fence !== null)
            continue;
        if (options.roamBear === true) {
            line = line.replace(/^(\s*[-+*]\s+)TODO\s+/u, '$1[ ] ');
            line = line.replace(/\^\^([^\r\n^]{1,100000})\^\^/gu, '==$1==');
        }
        if (options.zettelkasten !== undefined) {
            line = line.replace(/\[\[(\d{8,14})\]\]/gu, (original, uid) => {
                const path = options.zettelkasten?.get(uid);
                return path !== undefined && isSafeVaultRelativePath(path) ? `[[${path}|${uid}]]` : original;
            });
        }
        lines[index] = line;
    }
    return `${lines.join(eol)}${finalEol ? eol : ''}`;
}
//# sourceMappingURL=composer.js.map