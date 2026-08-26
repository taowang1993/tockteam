// @ts-nocheck -- Milkdown 7.20's extensionless declarations are incompatible with the pinned NodeNext analyzer.
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { ResolvedEmbedNode } from './embeds.ts'

export const livePreviewEmbedPluginKey = new PluginKey('tocktutorLivePreviewEmbeds')

function widgetDom(embed: ResolvedEmbedNode, from: number, to: number, reveal: () => void): HTMLElement {
  const widget = document.createElement('span')
  widget.className = 'tocktutor-live-embed-widget inline-flex max-w-full flex-col gap-1 rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] p-2 align-top text-[var(--tt-text)]'
  widget.dataset.embedFrom = String(from)
  widget.dataset.embedTo = String(to)
  widget.dataset.embedKind = embed.target.kind
  widget.setAttribute('aria-label', `${embed.target.kind} Embed: ${embed.target.display ?? embed.target.path}`)
  widget.tabIndex = 0
  widget.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); reveal() })
  widget.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    reveal()
  })
  const label = document.createElement('strong')
  label.className = 'truncate text-xs'
  label.textContent = embed.target.display ?? embed.target.path
  widget.append(label)
  const mime = embed.mimeType?.toLocaleLowerCase() ?? ''
  const src = `data:${mime};base64,${embed.content}`
  let media: HTMLElement | null = null
  if (mime.startsWith('image/')) {
    const image = document.createElement('img')
    image.alt = embed.target.display ?? embed.target.path
    image.loading = 'lazy'
    image.src = src
    media = image
  } else if (mime.startsWith('audio/')) {
    const audio = document.createElement('audio')
    audio.setAttribute('aria-label', embed.target.display ?? embed.target.path)
    audio.controls = true
    audio.preload = 'metadata'
    audio.src = src
    media = audio
  } else if (mime.startsWith('video/')) {
    const video = document.createElement('video')
    video.setAttribute('aria-label', embed.target.display ?? embed.target.path)
    video.controls = true
    video.preload = 'metadata'
    video.src = src
    media = video
  }
  if (media !== null) {
    media.className = 'max-h-80 max-w-full object-contain'
    widget.append(media)
  } else {
    const preview = document.createElement('pre')
    preview.className = 'm-0 max-h-48 max-w-full overflow-auto whitespace-pre-wrap text-xs'
    preview.textContent = embed.target.kind === 'media'
      ? `${embed.mimeType ?? 'Media'} preview is available in Reading view.`
      : embed.content.slice(0, 4_000)
    widget.append(preview)
  }
  return widget
}

function decorationSet(state, embeds: readonly ResolvedEmbedNode[], reveal: (from: number, to: number) => void): DecorationSet {
  const buckets = new Map<string, ResolvedEmbedNode[]>()
  for (const embed of embeds) {
    const bucket = buckets.get(embed.target.source) ?? []
    bucket.push(embed)
    buckets.set(embed.target.source, bucket)
  }
  const decorations = []
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text || node.marks.some(mark => mark.type.name === 'code')) return
    for (const [source, bucket] of buckets) {
      let offset = 0
      while (bucket.length > 0) {
        const index = node.text.indexOf(source, offset)
        if (index < 0) break
        const from = pos + index
        const to = from + source.length
        offset = index + source.length
        const embed = bucket.shift()
        if (embed === undefined || state.selection.from <= to && state.selection.to >= from) continue
        decorations.push(
          Decoration.inline(from, to, { class: 'hidden' }, { embedSource: 'true' }),
          Decoration.widget(from, () => widgetDom(embed, from, to, () => { reveal(from, to) }), { side: -1, embedWidget: 'true' }),
        )
      }
    }
  })
  return DecorationSet.create(state.doc, decorations)
}

export function buildLivePreviewEmbedPlugin(getEmbeds: () => readonly ResolvedEmbedNode[]): Plugin {
  let currentView = null
  const revealRange = (from: number, to: number): void => {
    const view = currentView
    if (view === null || from < 0 || to <= from || to > view.state.doc.content.size) return
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(from + 3, to - 1)))))
    view.focus()
  }
  const reveal = (view, event: Event): boolean => {
    const widget = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-embed-from][data-embed-to]') : null
    if (widget === null || event.type === 'keydown' && (event as KeyboardEvent).key !== 'Enter' && (event as KeyboardEvent).key !== ' ') return false
    const from = Number(widget.dataset.embedFrom)
    const to = Number(widget.dataset.embedTo)
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to > view.state.doc.content.size) return false
    event.preventDefault()
    revealRange(from, to)
    return true
  }
  return new Plugin({
    key: livePreviewEmbedPluginKey,
    props: {
      decorations: state => decorationSet(state, getEmbeds(), revealRange),
      handleDOMEvents: { mousedown: reveal, keydown: reveal },
    },
    view(view) {
      currentView = view
      return { destroy() { if (currentView === view) currentView = null } }
    },
  })
}
