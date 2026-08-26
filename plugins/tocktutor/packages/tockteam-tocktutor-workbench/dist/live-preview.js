export const MAX_LIVE_PREVIEW_SOURCE_BYTES = 2_000_000;
export const MAX_LIVE_PREVIEW_LINE_BYTES = 100_000;
function sourceLines(source) {
    if (source.length === 0)
        return [{ content: '', end: 0, index: 0, separator: '', start: 0 }];
    const lines = [];
    let start = 0;
    while (start < source.length) {
        let end = start;
        while (end < source.length && source[end] !== '\n' && source[end] !== '\r')
            end += 1;
        const separator = source.startsWith('\r\n', end) ? '\r\n' : source[end] === '\n' || source[end] === '\r' ? source[end] : '';
        lines.push({ content: source.slice(start, end), end: end + separator.length, index: lines.length, separator, start });
        start = end + separator.length;
    }
    if (/(?:\r\n|[\n\r])$/u.test(source)) {
        lines.push({ content: '', end: source.length, index: lines.length, separator: '', start: source.length });
    }
    return lines;
}
function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
}
function fenceMarker(content) {
    const match = content.match(/^ {0,3}(`{3,}|~{3,})/u);
    if (match === null)
        return null;
    const marker = match[1];
    return { character: marker[0], length: marker.length };
}
function heading(content) {
    const match = content.match(/^ {0,3}(#{1,6})(?:\s+|$)/u);
    return match?.[1]?.length ?? null;
}
function listIndent(content) {
    const match = content.match(/^(\s*)(?:[-+*]|\d{1,9}[.)])\s+/u);
    return match === null ? null : match[1].replaceAll('\t', '    ').length;
}
export function projectLivePreview(source) {
    if (byteLength(source) > MAX_LIVE_PREVIEW_SOURCE_BYTES) {
        return { reason: 'The Markdown source exceeds the Live Preview limit.', status: 'unsupported' };
    }
    const raw = sourceLines(source);
    const projected = [];
    const frontmatterEnd = raw[0]?.content === '---'
        ? raw.findIndex((line, index) => index > 0 && (line.content === '---' || line.content === '...'))
        : -1;
    let openFence = null;
    let inComment = false;
    let taskIndex = 0;
    for (const line of raw) {
        const content = line.content;
        if (openFence !== null) {
            projected.push({ content, index: line.index, kind: 'code' });
            const close = content.match(/^ {0,3}(`+|~+)\s*$/u)?.[1];
            if (close !== undefined && close[0] === openFence.character && close.length >= openFence.length)
                openFence = null;
            continue;
        }
        const opener = fenceMarker(content);
        if (opener !== null) {
            openFence = opener;
            projected.push({ content, index: line.index, kind: 'code' });
            continue;
        }
        if (line.index <= frontmatterEnd) {
            const property = line.index > 0 && line.index < frontmatterEnd && /^[A-Za-z_][A-Za-z0-9_-]{0,127}\s*:/u.test(content);
            projected.push({ content, index: line.index, kind: property ? 'property' : content === '' ? 'blank' : 'text' });
            continue;
        }
        const commentMarkerCount = content.split('%%').length - 1;
        if (inComment || commentMarkerCount > 0) {
            projected.push({ content, index: line.index, kind: 'comment' });
            if (commentMarkerCount % 2 === 1)
                inComment = !inComment;
            continue;
        }
        const task = content.match(/^\s{0,64}(?:[-+*]|\d{1,9}[.)])\s+\[([^\]])\]\s*(.*)$/u);
        if (task !== null) {
            projected.push({
                checked: task[1] !== ' ',
                content,
                index: line.index,
                kind: 'task',
                taskIndex,
            });
            taskIndex += 1;
            continue;
        }
        const callout = content.match(/^>\s*\[!([A-Za-z0-9_-]+)\]([+-])?(?:\s+.*)?$/u);
        if (callout !== null) {
            projected.push({
                content,
                folded: callout[2] === '-',
                index: line.index,
                kind: 'callout',
            });
            continue;
        }
        const level = heading(content);
        if (level !== null) {
            projected.push({ content, headingLevel: level, index: line.index, kind: 'heading' });
            continue;
        }
        if (listIndent(content) !== null) {
            projected.push({ content, index: line.index, kind: 'list' });
            continue;
        }
        projected.push({ content, index: line.index, kind: content === '' ? 'blank' : 'text' });
    }
    for (const line of projected) {
        if (line.kind === 'heading') {
            let end = line.index;
            for (let index = line.index + 1; index < projected.length; index += 1) {
                const candidate = projected[index];
                if (candidate.kind === 'heading' && (candidate.headingLevel ?? 7) <= (line.headingLevel ?? 6))
                    break;
                if (candidate.kind !== 'blank')
                    end = candidate.index;
            }
            if (end > line.index)
                line.foldEndLine = end;
        }
        else if (line.kind === 'callout') {
            let end = line.index;
            for (let index = line.index + 1; index < projected.length; index += 1) {
                const candidate = projected[index];
                if (!/^> ?/u.test(candidate.content))
                    break;
                end = candidate.index;
            }
            if (end > line.index)
                line.foldEndLine = end;
        }
        else if (line.kind === 'list') {
            const indent = listIndent(line.content) ?? 0;
            let end = line.index;
            for (let index = line.index + 1; index < projected.length; index += 1) {
                const candidate = projected[index];
                if (candidate.kind === 'blank')
                    continue;
                const candidateIndent = listIndent(candidate.content);
                if (candidateIndent === null || candidateIndent <= indent)
                    break;
                end = candidate.index;
            }
            if (end > line.index)
                line.foldEndLine = end;
        }
    }
    return { lines: Object.freeze(projected.map(line => Object.freeze(line))), status: 'ready' };
}
export function replaceLivePreviewLine(source, index, replacement) {
    if (!Number.isSafeInteger(index) || index < 0 || /[\r\n]/u.test(replacement))
        return source;
    if (byteLength(replacement) > MAX_LIVE_PREVIEW_LINE_BYTES)
        return source;
    const line = sourceLines(source)[index];
    if (line === undefined)
        return source;
    return `${source.slice(0, line.start)}${replacement}${line.separator}${source.slice(line.end)}`;
}
//# sourceMappingURL=live-preview.js.map