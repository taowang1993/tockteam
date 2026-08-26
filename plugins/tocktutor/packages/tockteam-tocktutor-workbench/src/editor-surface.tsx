import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { ResolvedEmbedNode } from './embeds.ts'
import { LivePreviewEditor, type LivePreviewSelection } from './live-preview-editor.tsx'
import { buildMarkdownSlides, renderMarkdownHtml } from './rich-markdown.ts'

function embedLabel(embed: ResolvedEmbedNode): string {
  return `${embed.target.path}${embed.target.fragment === null ? '' : `#${embed.target.fragment}`}`
}

export function ResolvedEmbedsView(props: {
  embeds?: readonly ResolvedEmbedNode[] | undefined
  onOpenExternalUrl?: ((url: string) => void) | undefined
}): ReactNode {
  const embeds = props.embeds ?? []
  if (embeds.length === 0) return null
  return (
    <section aria-label="Resolved Embeds" className="mt-5 grid gap-3">
      <h2 className="m-0 text-sm font-semibold">Resolved Embeds</h2>
      {embeds.map((embed, index) => {
        const label = embedLabel(embed)
        const media = embed.target.kind === 'media'
        const image = media && embed.mimeType?.startsWith('image/')
        const audio = media && embed.mimeType?.startsWith('audio/')
        const video = media && embed.mimeType?.startsWith('video/')
        const pdf = media && embed.mimeType === 'application/pdf'
        return (
          <article className="overflow-auto rounded border border-[var(--tt-border)] p-3" data-embed-depth={embed.depth} key={`${label}:${String(index)}`}>
            <strong className="block truncate text-xs">{label}</strong>
            {image && <img alt={embed.target.display ?? embed.target.path} className="mt-2 max-h-80 max-w-full object-contain" loading="lazy" src={`data:${embed.mimeType};base64,${embed.content}`} />}
            {audio && <audio aria-label={embed.target.display ?? embed.target.path} className="mt-2 w-full" controls preload="metadata" src={`data:${embed.mimeType};base64,${embed.content}`} />}
            {video && <video aria-label={embed.target.display ?? embed.target.path} className="mt-2 max-h-80 max-w-full" controls preload="metadata" src={`data:${embed.mimeType};base64,${embed.content}`} />}
            {pdf && <iframe className="mt-2 h-80 w-full" sandbox="" src={`data:${embed.mimeType};base64,${embed.content}`} title={embed.target.display ?? embed.target.path} />}
            {embed.target.kind === 'note' && <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(embed.content, { externalEmbedMode: 'viewer' }) }} onClick={event => {
              const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-external-url]') : null
              const url = target?.dataset.externalUrl
              if (url !== undefined) props.onOpenExternalUrl?.(url)
            }} />}
            {(embed.target.kind === 'canvas' || embed.target.kind === 'base') && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{embed.content}</pre>}
          </article>
        )
      })}
    </section>
  )
}

export function MarkdownSlidesView(props: {
  embeds?: readonly ResolvedEmbedNode[] | undefined
  onOpenExternalUrl?: ((url: string) => void) | undefined
  source: string
}): ReactNode {
  const slides = useMemo(() => buildMarkdownSlides(props.source), [props.source])
  return (
    <section aria-label="Slides Preview" className="grid gap-3">
      {slides.map((slide, index) => (
        <article className="rounded border border-[var(--tt-border)] p-3" data-slide-index={index} key={index}>
          <div className="mb-2 text-xs text-[var(--tt-muted)]">Slide {index + 1}</div>
          <div dangerouslySetInnerHTML={{ __html: slide }} onClick={event => {
            const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-external-url]') : null
            const url = target?.dataset.externalUrl
            if (url !== undefined) props.onOpenExternalUrl?.(url)
          }} />
        </article>
      ))}
      <ResolvedEmbedsView embeds={props.embeds} onOpenExternalUrl={props.onOpenExternalUrl} />
    </section>
  )
}

export function RichReadingView(props: {
  embeds?: readonly ResolvedEmbedNode[] | undefined
  onOpenExternalUrl?: ((url: string) => void) | undefined
  onToggleTask(index: number): void
  source: string
}): ReactNode {
  const html = useMemo(() => {
    const warning = /<\/?(?:script|style|iframe|object|embed|form|svg|link|meta)\b/iu.test(props.source)
      ? '<p class="tocktutor-warning" role="note">Unsafe HTML is inert in Reading view.</p>'
      : ''
    return `${warning}${renderMarkdownHtml(props.source, { externalEmbedMode: 'viewer' })}`
  }, [props.source])
  const onClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.dataset.taskIndex !== undefined) {
      const index = Number(target.dataset.taskIndex)
      if (Number.isSafeInteger(index) && index >= 0) props.onToggleTask(index)
      return
    }
    if (target instanceof HTMLElement) {
      const external = target.closest<HTMLElement>('[data-external-url]')
      const url = external?.dataset.externalUrl
      if (url !== undefined) {
        event.preventDefault()
        props.onOpenExternalUrl?.(url)
        return
      }
    }
    if (target instanceof HTMLAnchorElement) event.preventDefault()
  }
  return (
    <article
      aria-label="Reading View"
      className="tocktutor-reading mx-auto min-h-full w-[calc(100%-48px)] max-w-3xl pt-[18px] pb-[72px] [&_.callout]:my-4 [&_.callout]:rounded-md [&_.footnotes]:mt-8 [&_.math-display]:my-4 [&_.mermaid]:my-4 [&_.task-list]:pl-5 [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[30px] [&_h1]:leading-tight [&_h1]:font-[650] [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_mark]:bg-[color-mix(in_srgb,#fde047_55%,transparent)] [&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--tt-border)] [&_td]:p-2 [&_th]:border [&_th]:border-[var(--tt-border)] [&_th]:p-2"
      onClick={onClick}
      tabIndex={-1}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <ResolvedEmbedsView embeds={props.embeds} onOpenExternalUrl={props.onOpenExternalUrl} />
    </article>
  )
}

export function LivePreviewView(props: {
  documentKey: string
  embeds?: readonly ResolvedEmbedNode[] | undefined
  onEdit(source: string): void
  onOpenExternalUrl?: ((url: string) => void) | undefined
  onSelectionChange?: ((selection: LivePreviewSelection) => void) | undefined
  onToggleTask(index: number): void
  source: string
}): ReactNode {
  return (
    <section aria-label="Live Preview" className="flex min-h-full flex-col" tabIndex={-1}>
      <LivePreviewEditor
        ariaLabel="Live Preview Editor"
        className="min-h-[20rem]"
        content={props.source}
        key={props.documentKey}
        onMarkdownChange={props.onEdit}
        onSelectionChange={props.onSelectionChange}
        onToggleTask={props.onToggleTask}
      />
      <details className="mx-auto mb-6 mt-4 w-[calc(100%-32px)] max-w-3xl rounded border border-[var(--tt-border)] p-2">
        <summary className="cursor-pointer text-xs font-medium">Rendered Preview</summary>
        <div aria-label="Live Preview Rendered Content" className="mt-2" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(props.source, { externalEmbedMode: 'viewer' }) }} onClick={event => {
          const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-external-url]') : null
          const url = target?.dataset.externalUrl
          if (url !== undefined) props.onOpenExternalUrl?.(url)
        }} />
        <ResolvedEmbedsView embeds={props.embeds} onOpenExternalUrl={props.onOpenExternalUrl} />
        <details className="mt-3 rounded border border-[var(--tt-border)] p-2">
          <summary className="cursor-pointer text-xs font-medium">Slides Preview</summary>
          <MarkdownSlidesView embeds={props.embeds} onOpenExternalUrl={props.onOpenExternalUrl} source={props.source} />
        </details>
      </details>
    </section>
  )
}
