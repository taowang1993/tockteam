import { parseExecutableBase } from "./base-parser.js";
/** Replace only one bounded view field; refuse ambiguous or unsupported source. */
export function setBaseViewField(source, viewName, field, value) {
    const parsed = parseExecutableBase(source);
    if (parsed.status !== 'ready')
        return null;
    const view = parsed.views.find(entry => entry.name === viewName);
    if (!view || !source.endsWith('\n'))
        return null;
    if (field === 'name' && (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,79}$/u.test(value)
        || parsed.views.some(entry => entry !== view && entry.name.toLocaleLowerCase() === value.toLocaleLowerCase())))
        return null;
    const lines = source.slice(0, -1).split('\n');
    const starts = lines.map((line, index) => /^  -(?: type| name):/u.test(line) ? index : -1).filter(index => index >= 0);
    const start = starts[view.index];
    if (start === undefined)
        return null;
    const end = starts[view.index + 1] ?? lines.findIndex((line, index) => index > start && /^[A-Za-z][\w.-]*:/u.test(line));
    const stop = end < 0 ? lines.length : end;
    const matches = [];
    for (let index = start + 1; index < stop; index += 1)
        if (new RegExp(`^    ${field}:`, 'u').test(lines[index] ?? ''))
            matches.push(index);
    if (matches.length > 1)
        return null;
    const raw = Array.isArray(value) ? `[${value.map(item => JSON.stringify(item)).join(', ')}]` : JSON.stringify(value);
    const replacement = `    ${field}: ${raw}`;
    const clear = (field === 'filters' || field === 'limit') && value === '';
    if (field === 'name' && /^  - name:/u.test(lines[start] ?? '')) {
        if (matches.length > 0)
            return null;
        const inline = lines[start]?.match(/^(  - name:\s*)([^#\r\n]*)(\s+#.*)?$/u);
        if (!inline)
            return null;
        lines[start] = `${inline[1]}${raw}${inline[3] ?? ''}`;
    }
    else if (matches.length === 1) {
        const index = matches[0];
        let next = index + 1;
        while (next < stop && (/^      /u.test(lines[next] ?? '') || (lines[next] ?? '').trim() === ''))
            next += 1;
        lines.splice(index, next - index, ...(clear ? [] : [replacement]));
    }
    else if (!clear)
        lines.splice(stop, 0, replacement);
    const output = `${lines.join('\n')}\n`;
    const checked = parseExecutableBase(output);
    if (checked.status !== 'ready')
        return null;
    const updated = checked.views[view.index];
    if (!updated)
        return null;
    const expected = Array.isArray(value) ? value : [value];
    if (field === 'sort' || field === 'order') {
        if (JSON.stringify(updated[field]) !== JSON.stringify(expected))
            return null;
    }
    else if (field === 'name' && updated.name !== value)
        return null;
    else if (field === 'limit' && updated.limit !== (value === '' ? null : Number(value)))
        return null;
    else if (field === 'filters' && JSON.stringify(updated.filters) !== JSON.stringify(value === '' ? [] : [{ kind: 'statement', statement: value }]))
        return null;
    return output;
}
export function appendBaseView(source, kind, name) {
    const parsed = parseExecutableBase(source);
    if (parsed.status !== 'ready' || !source.endsWith('\n') || !/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,79}$/u.test(name)
        || parsed.views.some(view => view.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
        return null;
    const lines = source.slice(0, -1).split('\n');
    const viewsIndex = lines.findIndex(line => line === 'views:');
    if (viewsIndex < 0)
        return null;
    const next = lines.findIndex((line, index) => index > viewsIndex && /^[A-Za-z][\w.-]*:/u.test(line));
    lines.splice(next < 0 ? lines.length : next, 0, `  - type: ${kind}`, `    name: ${JSON.stringify(name)}`);
    const output = `${lines.join('\n')}\n`;
    const checked = parseExecutableBase(output);
    return checked.status === 'ready' && checked.views.length === parsed.views.length + 1 ? output : null;
}
//# sourceMappingURL=base-authoring.js.map