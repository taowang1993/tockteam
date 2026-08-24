export const MAX_BASE_BYTES = 2_000_000;
export const MAX_BASE_LINES = 4_096;
export const MAX_BASE_LINE_LENGTH = 4_096;
export const MAX_BASE_VIEWS = 64;
export const MAX_BASE_FIELDS = 128;
function isUnsafeYamlLine(line) {
    return line.includes('\t')
        || /!![A-Za-z]/u.test(line)
        || /(^|\s)[&*][A-Za-z0-9_-]+/u.test(line)
        || /(^|\s)![A-Za-z][A-Za-z0-9_-]*/u.test(line);
}
function scalar(value) {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed.at(-1);
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1).replaceAll(first === '"' ? '\\"' : "''", first === '"' ? '"' : "'");
        }
    }
    return trimmed;
}
function leadingSpaces(line) {
    let count = 0;
    while (count < line.length && line[count] === ' ')
        count += 1;
    return count;
}
function splitInlineList(value) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']'))
        return [];
    return trimmed.slice(1, -1).split(',').map(scalar).filter(Boolean);
}
function unsupported(reason) {
    return { status: 'unsupported', reason };
}
export function projectBase(content) {
    if (new TextEncoder().encode(content).byteLength > MAX_BASE_BYTES) {
        return unsupported('Base document exceeds the byte limit.');
    }
    const lines = content.split(/\r\n|\n/u);
    if (lines.length > MAX_BASE_LINES)
        return unsupported('Base document exceeds the line limit.');
    if (lines.some(line => line.length > MAX_BASE_LINE_LENGTH || isUnsafeYamlLine(line))) {
        return unsupported('Base document contains unsupported YAML syntax.');
    }
    let inViews = false;
    let sawViews = false;
    let current = null;
    const views = [];
    const warnings = [];
    let malformed = false;
    const closeCurrent = () => {
        if (current === null)
            return;
        if (current.type === '') {
            current.status = 'unsupported';
            current.warnings.push('View type is missing.');
        }
        views.push(current);
        current = null;
    };
    for (const line of lines) {
        if (line.trim() === '' || line.trim().startsWith('#'))
            continue;
        const indent = leadingSpaces(line);
        if (indent % 2 !== 0) {
            malformed = true;
            break;
        }
        const trimmed = line.trim();
        const topLevel = indent === 0 ? /^([A-Za-z][\w.-]*):(?:\s*(.*))?$/u.exec(trimmed) : null;
        if (topLevel !== null) {
            closeCurrent();
            inViews = topLevel[1] === 'views';
            sawViews ||= inViews;
            continue;
        }
        if (!inViews)
            continue;
        if (indent === 2 && trimmed.startsWith('-')) {
            closeCurrent();
            if (views.length >= MAX_BASE_VIEWS) {
                malformed = true;
                break;
            }
            current = {
                status: 'ready',
                type: '',
                name: `View ${String(views.length + 1)}`,
                fields: {},
                order: [],
                warnings: [],
            };
            const inline = /^-\s*([A-Za-z][\w.-]*):(?:\s*(.*))?$/u.exec(trimmed);
            if (inline !== null && current !== null) {
                assignField(current, inline[1], inline[2] ?? '');
            }
            continue;
        }
        if (current === null || indent < 4) {
            malformed = true;
            break;
        }
        const field = /^([A-Za-z][\w.-]*):(?:\s*(.*))?$/u.exec(trimmed);
        if (field !== null && indent === 4) {
            assignField(current, field[1], field[2] ?? '');
            continue;
        }
        if (indent >= 6 && current.fields.order === '' && trimmed.startsWith('-')) {
            current.order.push(scalar(trimmed.slice(1)));
            continue;
        }
        if (indent >= 6) {
            current.status = 'unsupported';
            current.warnings.push('Nested Base syntax is inert.');
            continue;
        }
        malformed = true;
        break;
    }
    closeCurrent();
    if (malformed || !sawViews || views.length === 0)
        return unsupported('Base document has unsupported or missing views syntax.');
    return { status: 'ready', views, warnings };
}
function assignField(view, key, rawValue) {
    if (Object.keys(view.fields).length >= MAX_BASE_FIELDS && view.fields[key] === undefined) {
        view.status = 'unsupported';
        view.warnings.push('View field limit exceeded.');
        return;
    }
    const value = scalar(rawValue);
    if (key === 'type') {
        view.type = value;
        if (!['table', 'list', 'cards', 'map'].includes(value)) {
            view.status = 'unsupported';
            view.warnings.push(`Unsupported view type ${JSON.stringify(value)} is inert.`);
        }
    }
    else if (key === 'name') {
        if (value.length === 0 || value.length > MAX_BASE_LINE_LENGTH) {
            view.status = 'unsupported';
            view.warnings.push('View name is invalid.');
        }
        else {
            view.name = value;
        }
    }
    else if (key === 'order') {
        const inline = splitInlineList(rawValue);
        view.order.push(...inline);
    }
    view.fields[key] = value;
    if (key === 'formula' || key === 'filter' || key === 'where' || /\b(?:eval|Function|import)\s*[(]/u.test(value)) {
        view.status = 'unsupported';
        view.warnings.push(`Base ${key} is inert and is not evaluated.`);
    }
}
//# sourceMappingURL=base.js.map