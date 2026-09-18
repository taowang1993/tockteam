import type { TrustedRaycastProjectionNode as Node } from './trusted-raycast-projection.ts'

const PAGE_SIZE = 24
const summary = (text: unknown, count?: number): string => {
  const value = String(text ?? '')
  const suffix = count ? `… · ${count} Languages` : '…'
  return value.length > 160 ? `${value.slice(0, 160 - suffix.length)}${suffix}` : value
}
const targetCount = (value: string): number | undefined => {
  try { const set = JSON.parse(value); return Array.isArray(set?.langTo) ? set.langTo.length : undefined } catch { return undefined }
}
const nodes = (root: Node, type: string): Node[] => [
  ...(root.type === type ? [root] : []),
  ...root.children.flatMap(child => typeof child === 'string' ? [] : nodes(child, type)),
]

/** Child-owned presentation only: retain source callbacks and full values outside the wire projection. */
export function createTranslateCollectionProjection(emit: () => void) {
  let collection: Node | undefined
  let page = 0
  let query = ''
  let detail: { title: string; pages: string[]; page: number } | undefined
  const control = (title: string, kind: string, onAction: () => void): Node => ({
    type: 'raycast-action', props: { title, collectionControl: kind, onAction: () => { onAction(); emit() } }, children: [],
  })
  const compact = (node: Node): Node => {
    if (node.type === 'raycast-dropdown' && typeof node.props.onChange === 'function') {
      const options = node.children.filter((child): child is Node => typeof child !== 'string')
      const values = options.map(option => String(option.props.value ?? ''))
      const current = String(node.props.value ?? '')
      if (!values.includes(current)) {
        values.push(current)
        options.push({ type: 'raycast-dropdown-item', props: { title: 'Current Language Set', value: current }, children: [] })
      }
      const token = (index: number) => values[index]!.length <= 128 ? values[index]! : `set-${index}`
      const tokens = new Map(values.map((value, index) => [token(index), value]))
      return { ...node, props: { ...node.props, value: token(values.indexOf(current)), onChange: (value: string) => {
        const original = tokens.get(value)
        if (original === undefined) throw new Error('That language set is no longer available. Please try again.')
        return (node.props.onChange as (value: string) => void)(original)
      } }, children: options.map((option, index) => ({ ...option, props: { ...option.props, title: summary(option.props.title, targetCount(values[index]!)), value: token(index) } })) }
    }
    return { ...node, children: node.children.map(child => typeof child === 'string' ? child : compact(child)) }
  }
  return {
    overflow(root: Node): Node {
      const clean = compact(root)
      const list = nodes(clean, 'raycast-list')[0]
      if (!list) return clean
      return { ...clean, children: [{ ...list, children: [
        ...list.children.filter(child => typeof child !== 'string' && ['raycast-dropdown', 'raycast-action-panel'].includes(child.type)),
        { type: 'raycast-empty', props: { title: 'Translation Results Exceed the Display Limit', description: 'Choose a language set with fewer targets, or shorten the text. Your saved sets are unchanged.' }, children: [] },
      ] }] }
    },
    search(value: string): boolean {
      if (!collection || detail) return false
      query = value; page = 0; emit(); return true
    },
    pop(): boolean {
      if (!detail) return false
      detail = undefined; emit(); return true
    },
    project(root: Node): Node {
      const list = nodes(root, 'raycast-list')[0]
      // The reviewed language manager is the only Translate list without a source search callback.
      const next = Number(root.props.navigationDepth) > 0 && list && typeof list.props.onSearchTextChange !== 'function' ? list : undefined
      if (next !== collection) { collection = next; page = 0; query = ''; detail = undefined }
      if (!collection) return compact(root)
      const items = nodes(collection, 'raycast-list-item')
      const pinned = items.filter(item => !Array.isArray(item.props.keywords))
      const sets = items.filter(item => Array.isArray(item.props.keywords))
      const needle = query.trim().toLocaleLowerCase()
      const matches = sets.filter(item => !needle || [item.props.title, item.props.subtitle, ...(item.props.keywords as unknown[])].join(' ').toLocaleLowerCase().includes(needle))
      const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
      page = Math.min(page, pages - 1)
      const present = (item: Node): Node => {
        const full = String(item.props.subtitle ?? '')
        const count = Array.isArray(item.props.keywords) ? (item.props.keywords.length - 2) / 2 : undefined
        const props: Record<string, unknown> = { ...item.props, subtitle: summary(full, count) }
        delete props.keywords
        if (full.length > 160 && count) props.accessories = JSON.stringify([{ text: `${count} Languages` }])
        const children = [...item.children]
        if (full.length > 160) children.push(control('View All Languages', 'expand', () => {
          // Unicode-aware chunks keep even the largest valid legacy set accessible without oversized messages.
          const pages: string[] = []
          let start = 0
          while (start < full.length) {
            const separator = full.lastIndexOf(', ', start + 2046)
            let end = Math.min(full.length, separator > start && full.length - start > 2048 ? separator + 2 : start + 2048)
            if (end < full.length && /[\uD800-\uDBFF]/u.test(full[end - 1]!)) end++
            pages.push(full.slice(start, end)); start = end
          }
          detail = { title: String(item.props.title ?? 'Language Set'), pages, page: 0 }
        }))
        return { ...item, props, children }
      }
      const controls: Node[] = []
      let shown: Node[]
      if (detail) {
        const selected = detail
        controls.push(control('Back to Language Sets', 'back', () => { detail = undefined }))
        if (selected.page > 0) controls.push(control('Previous Page', 'previous', () => { selected.page-- }))
        if (selected.page + 1 < selected.pages.length) controls.push(control('Next Page', 'next', () => { selected.page++ }))
        shown = [{ type: 'raycast-list-item', props: { title: selected.title }, children: [{ type: 'raycast-detail', props: { markdown: selected.pages[selected.page] }, children: [] }] }]
      } else {
        if (page > 0) controls.push(control('Previous Page', 'previous', () => { page-- }))
        if (page + 1 < pages) controls.push(control('Next Page', 'next', () => { page++ }))
        shown = [...pinned, ...matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)].map(present)
      }
      const rootActions = collection.children.filter((child): child is Node => typeof child !== 'string' && child.type === 'raycast-action-panel')
      return { ...root, props: { ...root.props, searchable: !detail, languageCollection: true,
        collectionDetail: Boolean(detail), collectionPage: (detail?.page ?? page) + 1, collectionPages: detail?.pages.length ?? pages,
        collectionCount: matches.length, collectionTotal: sets.length, navigationDepth: Number(root.props.navigationDepth) + (detail ? 1 : 0),
      }, children: [{ ...collection, props: { searchText: query, searchBarPlaceholder: 'Search Language Sets', isShowingDetail: Boolean(detail) },
        children: [...(detail ? [] : rootActions), ...shown, { type: 'raycast-action-panel', props: {}, children: controls }],
      }] }
    },
  }
}
