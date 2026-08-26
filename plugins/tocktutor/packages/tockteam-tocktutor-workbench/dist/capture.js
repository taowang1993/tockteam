import { isSafeVaultRelativePath } from "./session.js";
export const MAX_TEMPLATE_BYTES = 1_000_000;
export const BUILTIN_TEMPLATES = Object.freeze({
    'Cornell Notes': '# {{title}}\n\n## Cues\n\n## Notes\n\n## Summary\n',
    'Lesson Plan': '# {{title}}\n\n## Objectives\n\n## Activities\n\n## Assessment\n',
    'One-Pager': '# {{title}}\n\n## Big Idea\n\n## Evidence\n\n## Reflection\n',
    'Reading Log': '# {{title}}\n\nDate: {{date}}\n\n## Notes\n\n## Response\n',
});
function pad(value, length = 2) {
    return String(value).padStart(length, '0');
}
function formatDate(value, format) {
    const replacements = {
        YYYY: String(value.getFullYear()),
        MMMM: value.toLocaleString('en', { month: 'long' }),
        MMM: value.toLocaleString('en', { month: 'short' }),
        MM: pad(value.getMonth() + 1),
        DD: pad(value.getDate()),
        dddd: value.toLocaleString('en', { weekday: 'long' }),
        ddd: value.toLocaleString('en', { weekday: 'short' }),
        HH: pad(value.getHours()),
        hh: pad((value.getHours() % 12) || 12),
        mm: pad(value.getMinutes()),
        ss: pad(value.getSeconds()),
        SSS: pad(value.getMilliseconds(), 3),
        A: value.getHours() < 12 ? 'AM' : 'PM',
    };
    let output = '';
    for (let index = 0; index < format.length;) {
        if (format[index] === '[') {
            const close = format.indexOf(']', index + 1);
            if (close >= 0) {
                output += format.slice(index + 1, close);
                index = close + 1;
                continue;
            }
        }
        const token = Object.keys(replacements).toSorted((left, right) => right.length - left.length).find(candidate => format.startsWith(candidate, index));
        if (token === undefined) {
            output += format[index];
            index += 1;
        }
        else {
            output += replacements[token];
            index += token.length;
        }
    }
    return output;
}
function safeFolder(folder) {
    if (!isSafeVaultRelativePath(folder) || /^[A-Za-z]:/u.test(folder))
        throw new Error('The capture folder is invalid.');
    return folder.replace(/\/$/u, '');
}
function slug(value) {
    return value.normalize('NFKD')
        .replace(/[\u0300-\u036f]/gu, '')
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '')
        .slice(0, 80) || 'capture';
}
function collisionPath(path, existing) {
    if (!existing.has(path))
        return path;
    const extension = path.match(/(\.[^./]+)$/u)?.[1] ?? '';
    const stem = extension === '' ? path : path.slice(0, -extension.length);
    for (let index = 2; index <= 1_000; index += 1) {
        const candidate = `${stem}-${String(index)}${extension}`;
        if (!existing.has(candidate))
            return candidate;
    }
    throw new Error('No collision-safe capture path is available.');
}
export function expandTemplate(template, context) {
    if (new TextEncoder().encode(template).byteLength > MAX_TEMPLATE_BYTES)
        throw new Error('The template is too large.');
    return template.replace(/\{\{(title|newTitle|content|fromTitle|date|time)(?::([^}\r\n]{1,100}))?\}\}/gu, (source, name, format) => {
        if (name === 'title' || name === 'newTitle')
            return context.title;
        if (name === 'content')
            return context.content ?? '';
        if (name === 'fromTitle')
            return context.fromTitle ?? '';
        if (name === 'date')
            return formatDate(context.now, format ?? 'YYYY-MM-DD');
        if (name === 'time')
            return formatDate(context.now, format ?? 'HH:mm');
        return source;
    });
}
export function buildCaptureNote(input) {
    const title = input.title.trim().slice(0, 200);
    if (title === '')
        throw new Error('Capture title is required.');
    if (new TextEncoder().encode(input.body).byteLength > MAX_TEMPLATE_BYTES)
        throw new Error('Capture body is too large.');
    const folder = safeFolder(input.folder ?? 'Inbox');
    const date = formatDate(input.now, 'YYYY-MM-DD');
    return {
        content: `# ${title}\n\n${input.body}`,
        path: collisionPath(`${folder}/${date}-${slug(title)}.md`, input.existing),
    };
}
export function buildJournalNote(input) {
    const folder = safeFolder(input.folder);
    const date = formatDate(input.now, input.dateFormat ?? 'YYYY-MM-DD');
    if (date.length === 0 || date.length > 200 || /[\\/:*?"<>|]/u.test(date))
        throw new Error('The journal date format is invalid.');
    return {
        content: input.template === undefined
            ? `---\njournal-date: ${formatDate(input.now, 'YYYY-MM-DD')}\n---\n# ${date}\n`
            : expandTemplate(input.template, { now: input.now, title: date }),
        path: `${folder}/${date}.md`,
    };
}
export function uniqueNotePath(now, existing) {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    for (let index = 0; index < 1_440; index += 1) {
        const path = `${formatDate(candidate, 'YYYYMMDDHHmm')}.md`;
        if (!existing.has(path))
            return path;
        candidate.setMinutes(candidate.getMinutes() + 1);
    }
    throw new Error('No unique-note timestamp is available within one day.');
}
//# sourceMappingURL=capture.js.map