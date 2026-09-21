// @ts-nocheck -- CodeMirror's declarations are incompatible with the pinned NodeNext analyzer.
import { markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { renderMarkdownHtml } from './rich-markdown.ts'
import { collectEmbedTargets, MAX_EMBED_CONTENT_BYTES } from './embeds.ts'
import { attachInlineImages, InlineImageLoader } from './inline-images.ts'
import { classifyExternalEmbed } from './external-embeds.ts'

/** Parse the complete note, not CodeMirror's viewport-limited syntax tree. */
export function markdownImageUrls(source: string): string[] {
  if (new TextEncoder().encode(source).byteLength > MAX_EMBED_CONTENT_BYTES) return []
  const tree = markdownLanguage.parser.parse(source)
  const references = new Map<string, string>(), images: Array<typeof tree.topNode> = []
  tree.iterate({ enter: ref => {
    if (ref.name === 'LinkReference') {
      const label = ref.node.getChild('LinkLabel'), url = ref.node.getChild('URL')
      if (label && url) references.set(source.slice(label.from + 1, label.to - 1).toLowerCase(), source.slice(url.from, url.to))
    }
    if (ref.name === 'Image') images.push(ref.node)
  } })
  return images.flatMap(node => {
    const url = node.getChild('URL'), reference = node.getChild('LinkLabel'), marks = node.getChildren('LinkMark')
    const label = source.slice(marks[0]?.to ?? node.from, marks[1]?.from ?? node.to)
    const raw = url ? source.slice(url.from, url.to) : references.get(reference ? source.slice(reference.from + 1, reference.to - 1).toLowerCase() : label.toLowerCase())
    const target = raw && classifyExternalEmbed(raw.replace(/^<|>$/gu, '').replace(/\\([()\\])/gu, '$1'))
    return target && (target.kind === 'web' || target.kind === 'image') ? [target.sourceUrl] : []
  })
}

export const refreshLivePreview = StateEffect.define<boolean | undefined>()
const owners = new WeakMap<HTMLElement, Preview>()
const EMPTY_EMBEDS = Object.freeze([])
const imageLoaders = new WeakMap<EditorView, InlineImageLoader>()
function imageLoader(view: EditorView): InlineImageLoader {
  let loader = imageLoaders.get(view)
  if (!loader) { loader = new InlineImageLoader(); imageLoaders.set(view, loader) }
  return loader
}

class Preview extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly to: number, readonly embeds: readonly unknown[], readonly block = false, readonly renderedSource = source) { super() }
  eq(other: Preview) { return this.source === other.source && this.renderedSource === other.renderedSource && this.from === other.from && this.to === other.to && this.embeds === other.embeds }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement(this.block ? 'div' : 'span')
    dom.className = `tocktutor-live-rendered${this.source.startsWith('![[') ? ' tocktutor-live-embed-widget' : ''}`
    dom.tabIndex = 0
    dom.setAttribute('aria-label', 'Edit Preview')
    dom.dataset.previewFrom = String(this.from)
    dom.dataset.previewTo = String(this.to)
    owners.set(dom, this)
    dom.innerHTML = renderMarkdownHtml(this.renderedSource, { externalEmbedMode: 'viewer', resolvedEmbeds: this.embeds })
    const markers: number[] = []
    syntaxTree(view.state).iterate({ from: this.from, to: this.to, enter: node => { if (node.name === 'TaskMarker') markers.push(node.from) } })
    dom.querySelectorAll<HTMLInputElement>('input[data-task-index]').forEach((input, index) => {
      if (markers[index] !== undefined) input.dataset.liveTaskFrom = String(markers[index])
      input.disabled = view.state.readOnly
      input.setAttribute('aria-label', input.checked ? 'Mark Task as Incomplete' : 'Mark Task as Complete')
    })
    for (const nested of dom.querySelectorAll('li > ul, li > ol')) {
      const item = nested.parentElement!
      const details = document.createElement('details')
      details.open = true
      const summary = document.createElement('summary')
      summary.setAttribute('aria-label', 'Collapse List')
      while (item.firstChild && item.firstChild !== nested) summary.append(item.firstChild)
      details.append(summary, nested)
      item.append(details)
      details.addEventListener('toggle', () => { summary.setAttribute('aria-label', details.open ? 'Collapse List' : 'Expand List'); view.requestMeasure() })
    }
    const fold = this.source.match(/^>\s*\[![A-Za-z][\w-]*\]([+-])/u)
    const callout = dom.querySelector('.callout')
    if (fold && callout) {
      const details = document.createElement('details')
      const summary = document.createElement('summary')
      details.className = callout.className
      details.open = fold[1] !== '-'
      summary.textContent = callout.querySelector('strong')?.textContent ?? 'Callout'
      callout.querySelector('strong')?.remove()
      details.append(summary, ...callout.childNodes)
      callout.replaceWith(details)
      this.controls = new AbortController()
      details.addEventListener('toggle', () => {
        const from = Number(dom.dataset.previewFrom) + fold[0].length - 1
        const marker = details.open ? '+' : '-'
        if (!view.state.readOnly && view.state.sliceDoc(from, from + 1) !== marker) view.dispatch({ changes: { from, to: from + 1, insert: marker } })
        view.requestMeasure()
      }, { signal: this.controls.signal })
    }
    this.disposeImages = attachInlineImages(dom, () => view.requestMeasure(), imageLoader(view))
    return dom
  }
  updateDOM(dom: HTMLElement): boolean {
    const owner = owners.get(dom)
    if (!owner || owner.constructor !== this.constructor || owner.source !== this.source || owner.renderedSource !== this.renderedSource || owner.embeds !== this.embeds) return false
    const shift = this.from - Number(dom.dataset.previewFrom)
    dom.dataset.previewFrom = String(this.from)
    dom.dataset.previewTo = String(this.to)
    for (const task of dom.querySelectorAll<HTMLElement>('[data-live-task-from]')) task.dataset.liveTaskFrom = String(Number(task.dataset.liveTaskFrom) + shift)
    return true
  }
  destroy(dom: HTMLElement) {
    const owner = owners.get(dom)
    owner?.disposeImages?.(); owner?.controls?.abort()
    owners.delete(dom)
  }
  ignoreEvent(event: Event): boolean { return event.target instanceof Element && event.target.closest('audio,video,summary') !== null }
}

class ImagePreview extends Preview {
  constructor(source: string, from: number, to: number, readonly url: string, readonly alt: string) { super(source, from, to, EMPTY_EMBEDS) }
  eq(other: ImagePreview) { return super.eq(other) && this.url === other.url && this.alt === other.alt }
  updateDOM(dom: HTMLElement): boolean {
    const owner = owners.get(dom)
    return owner instanceof ImagePreview && owner.url === this.url && owner.alt === this.alt && super.updateDOM(dom)
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('span')
    dom.className = 'tocktutor-live-image'
    dom.tabIndex = 0
    dom.setAttribute('aria-label', 'Edit Image')
    dom.dataset.previewFrom = String(this.from)
    dom.dataset.previewTo = String(this.to)
    owners.set(dom, this)
    const placeholder = document.createElement('span')
    placeholder.dataset.externalEmbedKind = 'image'
    placeholder.dataset.externalUrl = this.url
    placeholder.dataset.imageAlt = this.alt
    dom.append(placeholder)
    this.disposeImages = attachInlineImages(dom, () => view.requestMeasure(), imageLoader(view))
    return dom
  }
}

class Task extends WidgetType {
  constructor(readonly from: number, readonly checked: boolean) { super() }
  eq(other: Task) { return this.from === other.from && this.checked === other.checked }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.disabled = view.state.readOnly
    input.checked = this.checked
    input.dataset.liveTaskFrom = String(this.from)
    input.setAttribute('aria-label', this.checked ? 'Mark Task as Incomplete' : 'Mark Task as Complete')
    return input
  }
  ignoreEvent() { return false }
}

/** Decorations change the view, never the Markdown document or its undo history. */
export function buildLivePreviewExtension(getEmbeds: () => readonly unknown[], openUrl: (url: string) => void) {
  const focus = StateEffect.define<boolean>()
  const focused = StateField.define({ create: () => false, update: (value, transaction) => transaction.effects.find(effect => effect.is(focus) || effect.is(refreshLivePreview) && typeof effect.value === 'boolean')?.value ?? value })
  const build = state => {
    const values = []
    const source = state.doc.toString()
    const active = (from: number, to: number) => state.field(focused) && state.selection.ranges.some(range => range.from <= to && range.to >= from)
    const hide = (from: number, to: number) => { if (to > from) values.push(Decoration.replace({}).range(from, to)) }
    const mark = (from: number, to: number, className: string, attributes = {}) => { if (to > from) values.push(Decoration.mark({ class: className, attributes }).range(from, to)) }
    const line = (from: number, className: string) => values.push(Decoration.line({ class: className }).range(state.doc.lineAt(from).from))
    const embeds = getEmbeds()
    const covered: Array<{ from: number; to: number }> = []
    const preview = (from: number, to: number) => {
      if (active(from, to)) return false
      let rendered = '', cursor = from
      // Fragment rendering cannot see reference definitions elsewhere in the note.
      tree.iterate({ from, to, enter: ref => {
        if (ref.name !== 'Image' || ref.node.getChild('URL')) return
        const marks = ref.node.getChildren('LinkMark'), reference = ref.node.getChild('LinkLabel')
        const label = source.slice(marks[0]?.to ?? ref.from, marks[1]?.from ?? ref.to)
        const key = reference ? source.slice(reference.from + 1, reference.to - 1) : label
        const url = references.get(key.toLowerCase())
        if (!url || !marks[1]) return
        rendered += source.slice(cursor, ref.from) + source.slice(ref.from, marks[1].to) + `(${url})`
        cursor = ref.to
      } })
      rendered += source.slice(cursor, to)
      values.push(Decoration.replace({ block: true, widget: new Preview(source.slice(from, to), from, to, embeds, true, rendered) }).range(from, to))
      covered.push({ from, to })
      return true
    }
    const prefix = source.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u)
    if (prefix && !active(0, prefix[0].length - 1)) {
      values.push(Decoration.replace({ block: true }).range(0, prefix[0].length))
      covered.push({ from: 0, to: prefix[0].length })
    }
    const references = new Map<string, string>()
    const codeRanges: Array<{ from: number; to: number }> = []
    const tree = syntaxTree(state)
    tree.iterate({ enter: ref => {
      if (ref.name === 'InlineCode') codeRanges.push({ from: ref.from, to: ref.to })
      if (ref.name !== 'LinkReference') return
      const label = ref.node.getChild('LinkLabel'), url = ref.node.getChild('URL')
      if (label && url) references.set(source.slice(label.from + 1, label.to - 1).toLowerCase(), source.slice(url.from, url.to).replace(/^<|>$/gu, ''))
    } })
    tree.iterate({ enter: ref => {
      const { from, to, name, node } = ref
      if (name === 'Document') return
      if (covered.some(range => from >= range.from && to <= range.to)) return false
      if (name === 'FencedCode' || name === 'CodeBlock' || name === 'HTMLBlock' || name === 'Table' || name === 'Blockquote' || name === 'BulletList' || name === 'OrderedList') {
        if (preview(from, to)) return false
        if (name !== 'BulletList' && name !== 'OrderedList') {
          for (let number = state.doc.lineAt(from).number; number <= state.doc.lineAt(to).number; number++) {
            line(state.doc.line(number).from, name === 'Blockquote' ? 'cm-live-quote' : 'cm-live-code')
          }
          return false
        }
      }
      if (/^ATXHeading[1-6]$|^SetextHeading[12]$/u.test(name)) line(from, `cm-live-heading-${name.slice(-1)}`)
      if (name === 'HeaderMark' && !active(node.parent.from, node.parent.to)) {
        hide(from, Math.min(to + (source[to] === ' ' ? 1 : 0), node.parent.to)); return false
      }
      const inlineClass = { StrongEmphasis: 'cm-live-strong', Emphasis: 'cm-live-emphasis', Strikethrough: 'cm-live-strike', InlineCode: 'cm-live-inline-code' }[name]
      if (inlineClass) mark(from, to, inlineClass)
      if (['EmphasisMark', 'StrikethroughMark', 'CodeMark'].includes(name) && !active(node.parent.from, node.parent.to)) hide(from, to)
      if (name === 'TaskMarker') {
        values.push(Decoration.replace({ widget: new Task(from, source.slice(from, to) !== '[ ]') }).range(from, to)); return false
      }
      if (name === 'ListMark') {
        if (/^\s*\[[ xX]\]/u.test(source.slice(to, state.doc.lineAt(to).to)) && !active(node.parent.from, node.parent.to)) hide(from, to + 1)
        else mark(from, to, 'cm-live-list-mark')
      }
      if (name === 'Link' || name === 'Image') {
        const urlNode = node.getChild('URL'), reference = node.getChild('LinkLabel')
        const marks = node.getChildren('LinkMark')
        const labelFrom = marks[0]?.to ?? from, labelTo = marks[1]?.from ?? to
        const label = source.slice(labelFrom, labelTo)
        const url = urlNode ? source.slice(urlNode.from, urlNode.to).replace(/^<|>$/gu, '').replace(/\\([()\\])/gu, '$1')
          : references.get(reference ? source.slice(reference.from + 1, reference.to - 1).toLowerCase() : label.toLowerCase())
        if (!url) return false
        if (name === 'Image' && !active(from, to)) {
          const wholeLine = state.doc.lineAt(from).from === from && state.doc.lineAt(to).to === to
          const raw = source.slice(from, to)
          const external = classifyExternalEmbed(url)
          const widget = external?.kind === 'web' ? new ImagePreview(raw, from, to, url, label)
            : external || embeds.some(embed => embed.target.source === raw) ? new Preview(raw, from, to, embeds, wholeLine) : null
          if (widget) values.push(Decoration.replace({ block: wholeLine, widget }).range(from, to))
        } else if (name === 'Link') {
          mark(labelFrom, labelTo, 'cm-live-link', { 'data-live-url': url, role: 'link', tabindex: '0' })
          if (!active(from, to)) { hide(from, labelFrom); hide(labelTo, to) }
        }
        return false
      }
      if (name === 'URL') mark(from, to, 'cm-live-link', { 'data-live-url': source.slice(from, to), role: 'link', tabindex: '0' })
      if (name === 'Paragraph') {
        // Obsidian-specific syntax is outside CommonMark but remains ordinary editable source.
        const text = source.slice(from, to)
        if (/^\s*\$\$[\s\S]*\$\$\s*$/u.test(text) && preview(from, to)) return false
        for (const match of text.matchAll(/(?<!!)\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/gu)) {
          const start = from + match.index!, end = start + match[0].length
          if (codeRanges.some(range => start >= range.from && start < range.to)) continue
          const labelFrom = start + (match[2] ? match[0].indexOf('|') + 1 : 2)
          mark(labelFrom, end - 2, 'cm-live-internal-link')
          if (!active(start, end)) { hide(start, labelFrom); hide(end - 2, end) }
        }
        for (const match of text.matchAll(/==([^=\n]+)==|%%[\s\S]*?%%/gu)) {
          const start = from + match.index!, end = start + match[0].length
          if (codeRanges.some(range => start >= range.from && start < range.to)) continue
          if (match[1] !== undefined) {
            mark(start + 2, end - 2, 'cm-live-highlight')
            if (!active(start, end)) { hide(start, start + 2); hide(end - 2, end) }
          } else if (active(start, end)) mark(start, end, 'cm-live-comment')
          else hide(start, end)
        }
        let targets = []
        try { targets = collectEmbedTargets(text) } catch { /* Source remains editable when preview budgets are exceeded. */ }
        let offset = 0
        for (const target of targets) {
          if (!target.source.startsWith('![[')) continue
          const start = text.indexOf(target.source, offset)
          offset = start + target.source.length
          if (start < 0 || active(from + start, from + offset) || !embeds.some(embed => embed.target.source === target.source)) continue
          const block = start === 0 && offset === text.length
          values.push(Decoration.replace({ block, widget: new Preview(target.source, from + start, from + offset, embeds, block) }).range(from + start, from + offset))
        }
      }
    } })
    return Decoration.set(values, true)
  }
  const field = StateField.define({
    create: build,
    update(value, transaction) {
      return transaction.docChanged || transaction.selection || syntaxTree(transaction.state) !== syntaxTree(transaction.startState) || transaction.effects.some(effect => effect.is(refreshLivePreview) || effect.is(focus)) ? build(transaction.state) : value
    },
    provide: field => EditorView.decorations.from(field),
  })
  const activate = (event, view) => {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return false
    const target = event.target instanceof Element ? event.target : null
    const control = target?.closest('[data-live-task-from],[data-external-url]')
    if (event.type === 'mousedown' && control) { event.preventDefault(); return true }
    if (event.type === 'click' && !control) return false
    const task = target?.closest('[data-live-task-from]')
    if (task) {
      if (view.state.readOnly) return false
      const from = Number(task.dataset.liveTaskFrom)
      if (!Number.isSafeInteger(from) || !/^\[[^\]]\]$/u.test(view.state.sliceDoc(from, from + 3))) return false
      event.preventDefault()
      view.dispatch({ changes: { from, to: from + 3, insert: view.state.sliceDoc(from, from + 3) === '[ ]' ? '[x]' : '[ ]' } })
      view.focus(); return true
    }
    const external = target?.closest('[data-external-url]')
    const url = external?.dataset.externalUrl ?? target?.closest('[data-live-url]')?.dataset.liveUrl ?? target?.closest('a[href]')?.getAttribute('href')
    if (url && (external || event.metaKey || event.ctrlKey || event.type === 'keydown' && event.key === 'Enter')) {
      event.preventDefault()
      const publicUrl = classifyExternalEmbed(url)?.sourceUrl
      if (publicUrl) openUrl(publicUrl)
      return true
    }
    const widget = target?.closest('[data-preview-from]')
    if (!widget || target?.closest('audio,video,summary')) return false
    const from = Number(widget.dataset.previewFrom), to = Number(widget.dataset.previewTo)
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > view.state.doc.length) return false
    event.preventDefault()
    view.focus()
    view.dispatch({ selection: { anchor: Math.min(from + 1, to - 1) }, scrollIntoView: true })
    return true
  }
  const images = ViewPlugin.define(view => {
    const loader = imageLoader(view)
    const sync = () => loader.sync([
      ...markdownImageUrls(view.state.doc.toString()),
      ...getEmbeds().filter(embed => embed.target.kind === 'note').flatMap(embed => markdownImageUrls(embed.content)),
    ])
    sync()
    return {
      update(update) {
        if (update.docChanged || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshLivePreview) && effect.value === undefined))) sync()
      },
      destroy() { loader.dispose(); imageLoaders.delete(view) },
    }
  })
  return [focused, field, images, EditorView.domEventHandlers({
    mousedown: activate, click: activate, keydown: activate,
    focus: (_event, view) => { view.dispatch({ effects: focus.of(true) }); return false },
    blur: (_event, view) => { view.dispatch({ effects: focus.of(false) }); return false },
  })]
}
