// @ts-nocheck -- CodeMirror's extensionless declaration graph is incompatible with the pinned NodeNext analyzer.
import { StateEffect } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view'
import type { ResolvedEmbedNode } from './embeds.ts'
import { projectEditorStaticWidgets, projectEditorWidgets, type EditorStaticWidgetTarget } from './editor-widgets.ts'

const refreshSourceEmbeds = StateEffect.define<void>()

function mediaElement(embed: ResolvedEmbedNode): HTMLElement | null {
  const mime = embed.mimeType?.toLocaleLowerCase() ?? ''
  const src = `data:${mime};base64,${embed.content}`
  if (mime.startsWith('image/')) {
    const image = document.createElement('img')
    image.alt = embed.target.display ?? embed.target.path
    image.loading = 'lazy'
    image.src = src
    return image
  }
  if (mime.startsWith('audio/')) {
    const audio = document.createElement('audio')
    audio.setAttribute('aria-label', embed.target.display ?? embed.target.path)
    audio.controls = true
    audio.preload = 'metadata'
    audio.src = src
    return audio
  }
  if (mime.startsWith('video/')) {
    const video = document.createElement('video')
    video.setAttribute('aria-label', embed.target.display ?? embed.target.path)
    video.controls = true
    video.preload = 'metadata'
    video.src = src
    return video
  }
  return null
}

class StaticSourceWidget extends WidgetType {
  constructor(readonly target: EditorStaticWidgetTarget) { super() }
  eq(other: StaticSourceWidget): boolean { return this.target.source === other.target.source && this.target.from === other.target.from }
  toDOM(): HTMLElement {
    const widget = document.createElement('span')
    widget.className = 'tocktutor-source-static-widget inline-flex max-w-full flex-col gap-1 rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] p-2 align-top text-[var(--tt-text)]'
    widget.dataset.embedFrom = String(this.target.from)
    widget.dataset.embedTo = String(this.target.to)
    widget.dataset.embedKind = this.target.kind
    widget.setAttribute('aria-label', `${this.target.kind === 'base' ? 'Base' : this.target.kind === 'mermaid' ? 'Mermaid Diagram' : 'Math'} Preview`)
    widget.tabIndex = 0
    const label = document.createElement('strong')
    label.className = 'text-xs'
    label.textContent = this.target.kind === 'base' ? 'Base' : this.target.kind === 'mermaid' ? 'Mermaid Diagram' : 'Math'
    const preview = document.createElement('pre')
    preview.className = 'm-0 max-h-48 max-w-full overflow-auto whitespace-pre-wrap text-xs'
    preview.textContent = this.target.content
    widget.append(label, preview)
    return widget
  }
  ignoreEvent(): boolean { return false }
}

class SourceEmbedWidget extends WidgetType {
  constructor(
    readonly embed: ResolvedEmbedNode,
    readonly from: number,
    readonly to: number,
  ) { super() }

  eq(other: SourceEmbedWidget): boolean {
    return this.from === other.from && this.to === other.to
      && this.embed.content === other.embed.content
      && this.embed.mimeType === other.embed.mimeType
      && this.embed.target.path === other.embed.target.path
  }

  toDOM(): HTMLElement {
    const widget = document.createElement('span')
    widget.className = 'tocktutor-source-embed-widget inline-flex max-w-full flex-col gap-1 rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] p-2 align-top text-[var(--tt-text)]'
    widget.dataset.embedFrom = String(this.from)
    widget.dataset.embedTo = String(this.to)
    widget.dataset.embedKind = this.embed.target.kind
    widget.setAttribute('aria-label', `${this.embed.target.kind} Embed: ${this.embed.target.display ?? this.embed.target.path}`)
    widget.tabIndex = 0

    const label = document.createElement('strong')
    label.className = 'truncate text-xs'
    label.textContent = this.embed.target.display ?? this.embed.target.path
    widget.append(label)

    const media = this.embed.target.kind === 'media' ? mediaElement(this.embed) : null
    if (media !== null) {
      media.className = 'max-h-80 max-w-full object-contain'
      widget.append(media)
    } else {
      const preview = document.createElement('pre')
      preview.className = 'm-0 max-h-48 max-w-full overflow-auto whitespace-pre-wrap text-xs'
      preview.textContent = this.embed.target.kind === 'media'
        ? `${this.embed.mimeType ?? 'Media'} preview is available in Reading view.`
        : this.embed.content.slice(0, 4_000)
      widget.append(preview)
    }
    return widget
  }

  ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest('audio,video') !== null
  }
}

function buildDecorations(view: EditorView, embeds: readonly ResolvedEmbedNode[]) {
  const buckets = new Map<string, ResolvedEmbedNode[]>()
  for (const embed of embeds) {
    const bucket = buckets.get(embed.target.source) ?? []
    bucket.push(embed)
    buckets.set(embed.target.source, bucket)
  }
  const ranges = []
  for (const target of projectEditorWidgets(view.state.doc.toString())) {
    if (view.state.selection.ranges.some(range => range.from <= target.to && range.to >= target.from)) continue
    const embed = buckets.get(target.source)?.shift()
    if (embed === undefined) continue
    ranges.push(Decoration.replace({ widget: new SourceEmbedWidget(embed, target.from, target.to) }).range(target.from, target.to))
  }
  for (const target of projectEditorStaticWidgets(view.state.doc.toString())) {
    if (view.state.selection.ranges.some(range => range.from <= target.to && range.to >= target.from)) continue
    ranges.push(Decoration.replace({ block: target.kind !== 'math', widget: new StaticSourceWidget(target) }).range(target.from, target.to))
  }
  return Decoration.set(ranges, true)
}

export function buildSourceEmbedWidgetExtension(getEmbeds: () => readonly ResolvedEmbedNode[]) {
  const plugin = ViewPlugin.fromClass(class {
    decorations
    constructor(view: EditorView) { this.decorations = buildDecorations(view, getEmbeds()) }
    update(update) {
      if (update.docChanged || update.selectionSet || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshSourceEmbeds)))) {
        this.decorations = buildDecorations(update.view, getEmbeds())
      }
    }
  }, {
    decorations: value => value.decorations,
    provide: value => EditorView.atomicRanges.of(view => view.plugin(value)?.decorations ?? Decoration.none),
  })
  const reveal = (event: Event, view: EditorView): boolean => {
    const widget = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-embed-from][data-embed-to]') : null
    if (widget === null || event.type === 'keydown' && (event as KeyboardEvent).key !== 'Enter' && (event as KeyboardEvent).key !== ' ') return false
    const from = Number(widget.dataset.embedFrom)
    const to = Number(widget.dataset.embedTo)
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to > view.state.doc.length) return false
    event.preventDefault()
    view.dispatch({ selection: { anchor: Math.min(from + 3, to - 1) }, scrollIntoView: true })
    view.focus()
    return true
  }
  return [plugin, EditorView.domEventHandlers({ mousedown: reveal, keydown: reveal })]
}

export function refreshSourceEmbedWidgets(view: EditorView | null): void {
  view?.dispatch({ effects: refreshSourceEmbeds.of(undefined) })
}
