import { isSafeVaultRelativePath } from "./session.js";
export const MAX_EMBED_TARGETS = 100;
export const MAX_EMBED_CONTENT_BYTES = 2_000_000;
function kind(path) {
    if (/\.canvas$/iu.test(path))
        return 'canvas';
    if (/\.base$/iu.test(path))
        return 'base';
    if (/\.(?:avif|bmp|gif|ico|jpe?g|png|webp|mp3|m4a|ogg|wav|webm|mp4|mov|pdf)$/iu.test(path))
        return 'media';
    if (/\.(?:markdown|md)$/iu.test(path) || !/\.[^/]+$/u.test(path))
        return 'note';
    return null;
}
function codeSpans(line) {
    const ranges = [];
    for (const match of line.matchAll(/(`+)([^`]*?)\1/gu)) {
        if (match.index !== undefined)
            ranges.push([match.index, match.index + match[0].length]);
    }
    return ranges;
}
export function collectEmbedTargets(source) {
    if (new TextEncoder().encode(source).byteLength > MAX_EMBED_CONTENT_BYTES)
        throw new Error('Embed source exceeds the content limit.');
    const targets = [];
    const lines = source.split(/\r?\n/u);
    let fence = null;
    for (const line of lines) {
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
        const code = codeSpans(line);
        for (const match of line.matchAll(/!\[\[([^\]\r\n]{1,4096})\]\]/gu)) {
            if (match.index === undefined || code.some(([start, end]) => match.index >= start && match.index < end))
                continue;
            let slashes = 0;
            for (let index = match.index - 1; index >= 0 && line[index] === '\\'; index -= 1)
                slashes += 1;
            if (slashes % 2 === 1)
                continue;
            const [rawTarget, displayPart] = match[1].split('|', 2);
            const targetPart = rawTarget ?? '';
            const hash = targetPart.indexOf('#');
            const path = (hash < 0 ? targetPart : targetPart.slice(0, hash)).trim();
            const fragment = hash < 0 ? null : targetPart.slice(hash + 1).trim() || null;
            const targetKind = kind(path);
            const normalizedPath = targetKind === 'note' && !/\.(?:markdown|md)$/iu.test(path) ? `${path}.md` : path;
            if (targetKind === null || !isSafeVaultRelativePath(normalizedPath))
                continue;
            targets.push({
                display: displayPart?.trim() || null,
                fragment,
                kind: targetKind,
                path: normalizedPath,
                source: match[0],
            });
            if (targets.length > MAX_EMBED_TARGETS)
                throw new Error('Embed target limit exceeded.');
        }
    }
    return targets;
}
function withoutFrontmatter(source) {
    if (!source.startsWith('---\n') && !source.startsWith('---\r\n'))
        return source;
    const lines = source.split(/\r?\n/u);
    const end = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'));
    return end < 0 ? source : lines.slice(end + 1).join('\n');
}
export function resolveNoteEmbedFragment(source, fragment) {
    if (new TextEncoder().encode(source).byteLength > MAX_EMBED_CONTENT_BYTES)
        return null;
    const body = withoutFrontmatter(source);
    if (fragment === null)
        return body;
    if (fragment.startsWith('^')) {
        const id = fragment.slice(1);
        if (!/^[A-Za-z0-9-]{1,200}$/u.test(id))
            return null;
        const lines = body.split(/\r?\n/u);
        const index = lines.findIndex(line => new RegExp(`(?:^|\\s)\\^${id}\\s*$`, 'u').test(line));
        return index < 0 ? null : `${lines[index].replace(new RegExp(`\\s*\\^${id}\\s*$`, 'u'), '')}\n`;
    }
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const lines = body.split(/\r?\n/u);
    const index = lines.findIndex(line => new RegExp(`^ {0,3}#{1,6}\\s+${escaped}\\s*#*\\s*$`, 'iu').test(line));
    if (index < 0)
        return null;
    const level = lines[index].match(/^ {0,3}(#{1,6})/u)[1].length;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const next = lines[cursor].match(/^ {0,3}(#{1,6})\s+/u);
        if (next !== null && next[1].length <= level) {
            end = cursor;
            break;
        }
    }
    return `${lines.slice(index, end).join('\n').replace(/\n+$/u, '')}\n`;
}
//# sourceMappingURL=embeds.js.map