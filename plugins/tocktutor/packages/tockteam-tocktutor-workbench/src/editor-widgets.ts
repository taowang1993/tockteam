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
