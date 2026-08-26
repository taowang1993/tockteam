// @ts-nocheck -- Milkdown 7.20's extensionless declarations are incompatible with the pinned NodeNext analyzer.
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import { classifyExternalEmbed } from './external-embeds.ts'

interface FoldRegion {
  bodyFrom: number
  bodyTo: number
  from: number
  kind: 'heading' | 'list'
  to: number
}

interface ChromeState { folded: ReadonlySet<number> }
const chromeKey = new PluginKey<ChromeState>('tocktutorLivePreviewChrome')

function foldRegions(doc): FoldRegion[] {
  const regions: FoldRegion[] = []
  const top: Array<{ node: unknown; pos: number }> = []
  doc.forEach((node, offset) => { top.push({ node, pos: offset }) })
  for (let index = 0; index < top.length; index += 1) {
    const entry = top[index]!
    if (entry.node.type.name !== 'heading') continue
    const level = Number(entry.node.attrs.level) || 1
    let bodyTo = doc.content.size
    for (let next = index + 1; next < top.length; next += 1) {
      const candidate = top[next]!
      if (candidate.node.type.name === 'heading' && (Number(candidate.node.attrs.level) || 1) <= level) {
        bodyTo = candidate.pos
        break
      }
    }
    const to = entry.pos + entry.node.nodeSize
    if (bodyTo > to) regions.push({ bodyFrom: to, bodyTo, from: entry.pos, kind: 'heading', to })
  }
  doc.descendants((node, pos) => {
    if (node.type.name !== 'list_item') return
    let offset = 0
    let sawText = false
    node.forEach(child => {
      const childPos = pos + 1 + offset
      if (child.isTextblock) sawText = true
      else if (sawText && (child.type.name === 'bullet_list' || child.type.name === 'ordered_list')) {
        regions.push({ bodyFrom: childPos, bodyTo: childPos + child.nodeSize, from: pos, kind: 'list', to: pos + node.nodeSize })
      }
      offset += child.nodeSize
    })
  })
  return regions
}

function widgetButton(region: FoldRegion, folded: boolean): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tocktutor-live-fold mr-1 inline-flex size-5 items-center justify-center rounded border-0 bg-transparent text-[var(--tt-muted)]'
  button.dataset.foldFrom = String(region.from)
  button.setAttribute('aria-expanded', String(!folded))
  button.setAttribute('aria-label', `${folded ? 'Expand' : 'Collapse'} ${region.kind === 'heading' ? 'Heading' : 'List'}`)
  button.textContent = folded ? '›' : '⌄'
  return button
}

function staticWidget(kind: 'base' | 'math' | 'mermaid', content: string, from: number, to: number): HTMLElement {
  const widget = document.createElement('span')
  widget.className = 'tocktutor-live-static-widget inline-flex max-w-full flex-col gap-1 rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] p-2 align-top text-[var(--tt-text)]'
  widget.dataset.embedFrom = String(from)
  widget.dataset.embedTo = String(to)
  widget.dataset.embedKind = kind
  widget.setAttribute('aria-label', `${kind === 'base' ? 'Base' : kind === 'mermaid' ? 'Mermaid Diagram' : 'Math'} Preview`)
  widget.tabIndex = 0
  const label = document.createElement('strong')
  label.className = 'text-xs'
  label.textContent = kind === 'base' ? 'Base' : kind === 'mermaid' ? 'Mermaid Diagram' : 'Math'
  const preview = document.createElement('pre')
  preview.className = 'm-0 max-h-48 max-w-full overflow-auto whitespace-pre-wrap text-xs'
  preview.textContent = content
  widget.append(label, preview)
  return widget
}

function calloutFoldButton(pos: number, index: number, collapsed: boolean, title: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tocktutor-live-callout-fold mr-1 inline-flex size-5 items-center justify-center rounded border-0 bg-transparent text-[var(--tt-muted)]'
  button.dataset.calloutFoldPos = String(pos)
  button.dataset.calloutIndex = String(index)
  button.setAttribute('aria-expanded', String(!collapsed))
  button.setAttribute('aria-label', collapsed ? 'Expand Callout' : 'Collapse Callout')
  button.textContent = collapsed ? `› ${title}` : '⌄'
  return button
}

function taskCheckbox(pos: number, index: number, checked: boolean): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.className = 'tocktutor-live-task mr-1 align-middle'
  input.checked = checked
  input.dataset.taskPos = String(pos)
  input.dataset.taskIndex = String(index)
  input.setAttribute('aria-label', checked ? 'Mark Task as Incomplete' : 'Mark Task as Complete')
  input.tabIndex = -1
  return input
}

function decorations(state, folded: ReadonlySet<number>): DecorationSet {
  const values = []
  const regions = foldRegions(state.doc)
  for (const region of regions) {
    values.push(Decoration.widget(region.from + 1, () => widgetButton(region, folded.has(region.from)), { side: -1 }))
    if (!folded.has(region.from)) continue
    state.doc.nodesBetween(region.bodyFrom, region.bodyTo, (node, pos) => {
      if (pos >= region.bodyFrom && pos + node.nodeSize <= region.bodyTo) {
        values.push(Decoration.node(pos, pos + node.nodeSize, { class: 'hidden' }))
        return false
      }
      return true
    })
  }
  let commentOpen = false
  let calloutIndex = 0
  let taskIndex = 0
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') {
      const language = String(node.attrs.language ?? node.attrs.lang ?? '').toLocaleLowerCase()
      if ((language === 'base' || language === 'mermaid') && !(state.selection.from <= pos + node.nodeSize && state.selection.to >= pos)) {
        values.push(
          Decoration.node(pos, pos + node.nodeSize, { class: 'hidden' }),
          Decoration.widget(pos, () => staticWidget(language, node.textContent, pos, pos + node.nodeSize), { side: -1 }),
        )
      }
      return false
    }
    if (node.type.name === 'blockquote' && /^\[![A-Za-z][\w-]*\][+-]?/u.test(node.textContent)) {
      values.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'tocktutor-live-callout rounded border-l-4 border-[var(--tt-accent)] bg-[var(--tt-selected)] px-3 py-2',
      }))
      const index = calloutIndex
      calloutIndex += 1
      const marker = node.textContent.match(/^\[![A-Za-z][\w-]*\]([+-])/u)
      if (marker !== null) {
        const collapsed = marker[1] === '-'
        const firstLine = node.firstChild?.textBetween(0, node.firstChild.content.size, '\n', '\n').split('\n')[0] ?? ''
        const title = firstLine.replace(/^\[![A-Za-z][\w-]*\][+-]?\s*/u, '').trim() || 'Callout'
        values.push(Decoration.widget(pos, () => calloutFoldButton(pos, index, collapsed, title), { side: -1 }))
        if (collapsed) values.push(Decoration.node(pos, pos + node.nodeSize, { class: 'hidden' }))
      }
    }
    if (node.type.name === 'list_item' && node.attrs.checked !== null && node.attrs.checked !== undefined) {
      const index = taskIndex
      taskIndex += 1
      values.push(Decoration.widget(pos + 1, () => taskCheckbox(pos, index, Boolean(node.attrs.checked)), { side: -1 }))
    }
    if (!node.isText || !node.text || node.marks.some(mark => mark.type.name === 'code')) return
    for (const match of node.text.matchAll(/\$\$(.{1,20000})\$\$/gu)) {
      const from = pos + (match.index ?? 0)
      const to = from + match[0].length
      if (state.selection.from <= to && state.selection.to >= from) continue
      values.push(
        Decoration.inline(from, to, { class: 'hidden' }),
        Decoration.widget(from, () => staticWidget('math', match[1]!, from, to), { side: -1 }),
      )
    }
    let cursor = 0
    if (commentOpen) {
      const close = node.text.indexOf('%%')
      if (close < 0) {
        values.push(Decoration.inline(pos, pos + node.text.length, { class: 'tocktutor-live-comment text-[var(--tt-muted)]' }))
        return
      }
      values.push(Decoration.inline(pos, pos + close + 2, { class: 'tocktutor-live-comment text-[var(--tt-muted)]' }))
      commentOpen = false
      cursor = close + 2
    }
    while (cursor < node.text.length) {
      const open = node.text.indexOf('%%', cursor)
      if (open < 0) break
      const close = node.text.indexOf('%%', open + 2)
      if (close < 0) {
        values.push(Decoration.inline(pos + open, pos + node.text.length, { class: 'tocktutor-live-comment text-[var(--tt-muted)]' }))
        commentOpen = true
        break
      }
      values.push(Decoration.inline(pos + open, pos + close + 2, { class: 'tocktutor-live-comment text-[var(--tt-muted)]' }))
      cursor = close + 2
    }
  })
  return DecorationSet.create(state.doc, values)
}

export function buildLivePreviewChromePlugin(options: {
  isProtected(): boolean
  onOpenExternalUrl(): ((url: string) => void) | undefined
  onToggleCallout(index: number): void
  onToggleTask(index: number): void
}): Plugin<ChromeState> {
  return new Plugin<ChromeState>({
    key: chromeKey,
    state: {
      init: () => ({ folded: new Set() }),
      apply(transaction, value) {
        if (transaction.docChanged) return { folded: new Set() }
        const toggle = transaction.getMeta(chromeKey) as { toggle?: unknown } | undefined
        if (!Number.isSafeInteger(toggle?.toggle)) return value
        const folded = new Set(value.folded)
        if (folded.has(toggle!.toggle as number)) folded.delete(toggle!.toggle as number)
        else folded.add(toggle!.toggle as number)
        return { folded }
      },
    },
    props: {
      decorations: state => decorations(state, chromeKey.getState(state)?.folded ?? new Set()),
      editable: () => !options.isProtected(),
      nodeViews: {
        image(node) {
          const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
          const external = classifyExternalEmbed(src)
          if (external === null) {
            const dom = document.createElement('span')
            dom.className = 'tocktutor-live-image-inert text-[var(--tt-muted)]'
            dom.textContent = `Image: ${String(node.attrs.alt ?? src)}`
            return { dom }
          }
          const dom = document.createElement('button')
          dom.type = 'button'
          dom.className = 'tocktutor-live-external-image rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-[var(--tt-text)]'
          dom.dataset.externalUrl = external.viewerUrl
          dom.textContent = `External Image: ${String(node.attrs.alt ?? external.sourceUrl)}`
          return { dom }
        },
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target instanceof Element ? event.target : null
          const externalUrl = target?.closest<HTMLElement>('[data-external-url]')?.dataset.externalUrl
          if (externalUrl !== undefined) {
            event.preventDefault()
            options.onOpenExternalUrl()?.(externalUrl)
            return true
          }
          const callout = target?.closest<HTMLElement>('[data-callout-fold-pos]')
          if (callout !== null && callout !== undefined) {
            event.preventDefault()
            const pos = Number(callout.dataset.calloutFoldPos)
            const index = Number(callout.dataset.calloutIndex)
            if (options.isProtected()) {
              if (Number.isSafeInteger(index) && index >= 0) options.onToggleCallout(index)
              return true
            }
            const node = Number.isSafeInteger(pos) ? view.state.doc.nodeAt(pos) : null
            const marker = node?.textContent.match(/^\[![A-Za-z][\w-]*\]([+-])/u)
            if (node?.type.name === 'blockquote' && marker !== null && marker !== undefined) {
              const markerOffset = marker[0].length - 1
              const from = pos + 2 + markerOffset
              view.dispatch(view.state.tr.insertText(marker[1] === '-' ? '+' : '-', from, from + 1))
            }
            return true
          }
          const task = target?.closest<HTMLInputElement>('[data-task-pos]')
          if (task !== null && task !== undefined) {
            event.preventDefault()
            const pos = Number(task.dataset.taskPos)
            const index = Number(task.dataset.taskIndex)
            if (options.isProtected()) {
              if (Number.isSafeInteger(index) && index >= 0) options.onToggleTask(index)
              return true
            }
            const node = view.state.doc.nodeAt(pos)
            if (node?.type.name === 'list_item' && node.attrs.checked !== null && node.attrs.checked !== undefined) {
              view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
            }
            return true
          }
          const fold = target?.closest<HTMLElement>('[data-fold-from]')
          if (fold !== null && fold !== undefined) {
            event.preventDefault()
            const from = Number(fold.dataset.foldFrom)
            if (Number.isSafeInteger(from)) view.dispatch(view.state.tr.setMeta(chromeKey, { toggle: from }))
            return true
          }
          return false
        },
      },
    },
  })
}
