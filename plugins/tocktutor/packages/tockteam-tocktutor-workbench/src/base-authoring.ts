import { parseExecutableBase, type ExecutableBaseViewDefinition } from './base-parser.ts'

function sourceLines(source: string): { lines: string[]; newline: string; ending: string } {
  const newline = /\r\n|\n|\r/u.exec(source)?.[0] ?? '\n'
  const ending = /(?:\r\n|\n|\r)$/u.exec(source)?.[0] ?? ''
  return { lines: (ending ? source.slice(0, -ending.length) : source).split(/\r\n|\n|\r/u), newline, ending }
}

/** Replace only one bounded view field; refuse ambiguous or unsupported source. */
export function setBaseViewField(source: string, viewName: string, field: 'sort' | 'filters' | 'order' | 'name' | 'limit' | 'type' | 'rowHeight', value: string | readonly string[]): string | null {
  const parsed = parseExecutableBase(source)
  if (parsed.status !== 'ready') return null
  const view = parsed.views.find(entry => entry.name === viewName)
  if (!view) return null
  if (field === 'name' && (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,79}$/u.test(value)
    || parsed.views.some(entry => entry !== view && entry.name.toLocaleLowerCase() === value.toLocaleLowerCase()))) return null
  if (field === 'type' && (typeof value !== 'string' || !['table', 'list', 'cards', 'map'].includes(value))) return null
  if (field === 'rowHeight' && (typeof value !== 'string' || !['short', 'medium', 'tall'].includes(value))) return null
  const { lines, newline, ending } = sourceLines(source)
  const viewsStart = lines.findIndex(line => /^views:\s*(?:#.*)?$/u.test(line))
  if (viewsStart < 0) return null
  const nextSection = lines.findIndex((line, index) => index > viewsStart && /^[A-Za-z][\w.-]*:/u.test(line))
  const viewsEnd = nextSection < 0 ? lines.length : nextSection
  const starts = lines.flatMap((line, index) => index > viewsStart && index < viewsEnd && /^  -\s*(?:(?:type|name):\s*.+)?$/u.test(line) ? [index] : [])
  if (starts.length !== parsed.views.length) return null
  const start = starts[view.index]
  if (start === undefined) return null
  const stop = starts[view.index + 1] ?? viewsEnd
  const matches: number[] = []
  for (let index = start + 1; index < stop; index += 1) if (new RegExp(`^    ${field}:`, 'u').test(lines[index] ?? '')) matches.push(index)
  if (matches.length > 1) return null
  const raw = field === 'type' && typeof value === 'string' ? value : Array.isArray(value) ? `[${value.map(item => JSON.stringify(item)).join(', ')}]` : JSON.stringify(value)
  const replacement = `    ${field}: ${raw}`
  const clear = (field === 'filters' || field === 'limit') && value === ''
  if ((field === 'name' || field === 'type') && new RegExp(`^  - ${field}:`, 'u').test(lines[start] ?? '')) {
    if (matches.length > 0) return null
    const inline = lines[start]?.match(new RegExp(`^(  - ${field}:\\s*)([^#\\r\\n]*)(\\s+#.*)?$`, 'u'))
    if (!inline) return null
    lines[start] = `${inline[1]}${raw}${inline[3] ?? ''}`
  } else if (matches.length === 1) {
    const index = matches[0]!
    let next = index + 1
    while (next < stop && (/^      /u.test(lines[next] ?? '') || (lines[next] ?? '').trim() === '')) next += 1
    lines.splice(index, next - index, ...(clear ? [] : [replacement]))
  } else if (!clear) lines.splice(stop, 0, replacement)
  const output = lines.join(newline) + ending
  const checked = parseExecutableBase(output)
  if (checked.status !== 'ready') return null
  const updated = checked.views[view.index]
  if (!updated) return null
  const expected = Array.isArray(value) ? value : [value]
  if (field === 'sort' || field === 'order') {
    if (JSON.stringify(updated[field]) !== JSON.stringify(expected)) return null
  } else if (field === 'name' && updated.name !== value) return null
  else if (field === 'type' && updated.type !== value) return null
  else if (field === 'rowHeight' && updated.rowHeight !== value) return null
  else if (field === 'limit' && updated.limit !== (value === '' ? null : Number(value))) return null
  else if (field === 'filters' && JSON.stringify(updated.filters) !== JSON.stringify(value === '' ? [] : [{ kind: 'statement', statement: value }])) return null
  return output
}

export function appendBaseView(source: string, kind: ExecutableBaseViewDefinition['type'], name: string): string | null {
  const parsed = parseExecutableBase(source)
  if (parsed.status !== 'ready' || !/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,79}$/u.test(name)
    || parsed.views.some(view => view.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return null
  const { lines, newline, ending } = sourceLines(source)
  const viewsIndex = lines.findIndex(line => /^views:\s*(?:#.*)?$/u.test(line))
  if (viewsIndex < 0) return null
  const next = lines.findIndex((line, index) => index > viewsIndex && /^[A-Za-z][\w.-]*:/u.test(line))
  lines.splice(next < 0 ? lines.length : next, 0, `  - type: ${kind}`, `    name: ${JSON.stringify(name)}`)
  const output = lines.join(newline) + ending
  const checked = parseExecutableBase(output)
  return checked.status === 'ready' && checked.views.length === parsed.views.length + 1 ? output : null
}
