import { collectEmbedTargets, type EmbedKind } from './embeds.ts'

export const MAX_EDITOR_WIDGETS = 100

export interface EditorWidgetTarget {
  from: number
  kind: EmbedKind
  path: string
  selected: boolean
  source: string
  to: number
  visible: boolean
}

/**
 * Projects safe local embeds for editor chrome without replacing their source.
 * The source range is authoritative: selecting it always hides the widget.
 */
export function projectEditorWidgets(
  source: string,
  selection: { from: number; to: number } = { from: 0, to: 0 },
): readonly EditorWidgetTarget[] {
  const from = Number.isSafeInteger(selection.from) ? Math.max(0, Math.min(source.length, selection.from)) : 0
  const to = Number.isSafeInteger(selection.to) ? Math.max(from, Math.min(source.length, selection.to)) : from
  let targets
  try {
    targets = collectEmbedTargets(source)
  } catch {
    return Object.freeze([])
  }
  let searchFrom = 0
  const projected: EditorWidgetTarget[] = []
  for (const target of targets.slice(0, MAX_EDITOR_WIDGETS)) {
    const start = source.indexOf(target.source, searchFrom)
    if (start < 0) continue
    const end = start + target.source.length
    searchFrom = end
    const selected = from < end && to > start
    projected.push(Object.freeze({
      from: start,
      kind: target.kind,
      path: target.path,
      selected,
      source: target.source,
      to: end,
      visible: !selected,
    }))
  }
  return Object.freeze(projected)
}

export interface EditorStaticWidgetTarget {
  content: string
  from: number
  kind: 'base' | 'math' | 'mermaid'
  selected: boolean
  source: string
  to: number
  visible: boolean
}

/** Project bounded source-local Base, Mermaid, and display-math widgets. */
export function projectEditorStaticWidgets(
  source: string,
  selection: { from: number; to: number } = { from: 0, to: 0 },
): readonly EditorStaticWidgetTarget[] {
  if (new TextEncoder().encode(source).byteLength > 2_000_000) return Object.freeze([])
  const selectedFrom = Number.isSafeInteger(selection.from) ? Math.max(0, Math.min(source.length, selection.from)) : 0
  const selectedTo = Number.isSafeInteger(selection.to) ? Math.max(selectedFrom, Math.min(source.length, selection.to)) : selectedFrom
  const lines = source.split(/(?<=\n)/u)
  const lineStarts: number[] = []
  let total = 0
  for (const line of lines) {
    lineStarts.push(total)
    total += line.length
  }
  const widgets: EditorStaticWidgetTarget[] = []
  for (let index = 0; index < lines.length && widgets.length < MAX_EDITOR_WIDGETS; index += 1) {
    const line = lines[index]!
    const opening = line.replace(/\r?\n$/u, '').match(/^ {0,3}(`{3,}|~{3,})\s*(base|mermaid)\s*$/iu)
    if (opening !== null) {
      const start = lineStarts[index] ?? 0
      const body: string[] = []
      let end = start + line.length
      let closed = false
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const candidate = lines[cursor]!
        end += candidate.length
        if (new RegExp(`^ {0,3}${opening[1]![0]}{${String(opening[1]!.length)},}\\s*(?:\\r?\\n)?$`, 'u').test(candidate)) {
          index = cursor
          closed = true
          break
        }
        body.push(candidate)
      }
      if (closed) {
        const raw = source.slice(start, end)
        const selected = selectedFrom < end && selectedTo > start
        widgets.push(Object.freeze({
          content: body.join('').replace(/\r?\n$/u, ''),
          from: start,
          kind: opening[2]!.toLocaleLowerCase() as 'base' | 'mermaid',
          selected,
          source: raw,
          to: end,
          visible: !selected,
        }))
      }
    } else {
      const text = line.replace(/\r?\n$/u, '')
      const math = text.match(/^\s*\$\$(.{1,20000})\$\$\s*$/u)
      if (math !== null) {
        const start = lineStarts[index] ?? 0
        const end = start + text.length
        const selected = selectedFrom < end && selectedTo > start
        widgets.push(Object.freeze({ content: math[1]!, from: start, kind: 'math', selected, source: text, to: end, visible: !selected }))
      }
    }
  }
  return Object.freeze(widgets.sort((left, right) => left.from - right.from))
}
