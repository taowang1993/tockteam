import { Alert, AlertDescription, AlertTitle } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { ResolvedEmbedNode } from './embeds.ts'
import { isLivePreviewSourceProtected, LivePreviewEditor, MarkdownDocumentHeader, type LivePreviewSelection } from './live-preview-editor.tsx'
import type { PropertyValue } from './properties.ts'
import { buildMarkdownSlides, renderMarkdownHtml } from './rich-markdown.ts'

function embedLabel(embed: ResolvedEmbedNode): string {
  return `${embed.target.path}${embed.target.fragment === null ? '' : `#${embed.target.fragment}`}`
}

export interface ReadingLinkResult {
  fragment: string | null
}

function handleRenderedClick(
  event: ReactMouseEvent<HTMLElement>,
  onOpenExternalUrl?: (url: string) => void,
  onOpenInternalLink?: (target: string) => void | Promise<ReadingLinkResult | null>,
): void | Promise<ReadingLinkResult | null> {
  const target = event.target instanceof Element ? event.target : null
  const url = target?.closest<HTMLElement>('[data-external-url]')?.dataset.externalUrl
  if (url !== undefined) {
    event.preventDefault()
    event.stopPropagation()
    onOpenExternalUrl?.(url)
    return
  }
  const internalTarget = target?.closest<HTMLElement>('a.internal-link')?.dataset.target
  if (internalTarget !== undefined) {
    event.preventDefault()
    event.stopPropagation()
    return onOpenInternalLink?.(internalTarget)
  } else if (target?.closest('a') !== null) {
    event.preventDefault()
  }
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
            {embed.target.kind === 'note' && <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(embed.content, { externalEmbedMode: 'viewer', resolvedEmbeds: embeds, resolvedEmbedParentPath: embed.target.path }) }} onClick={event => { handleRenderedClick(event, props.onOpenExternalUrl) }} />}
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
  const slides = useMemo(() => buildMarkdownSlides(props.source, { externalEmbedMode: 'viewer', ...(props.embeds === undefined ? {} : { resolvedEmbeds: props.embeds }) }), [props.source, props.embeds])
  return (
    <section aria-label="Slides Preview" className="grid gap-3">
      {slides.map((slide, index) => (
        <article className="rounded border border-[var(--tt-border)] p-3" data-slide-index={index} key={index}>
          <div className="mb-2 text-xs text-[var(--tt-muted)]">Slide {index + 1}</div>
          <div dangerouslySetInnerHTML={{ __html: slide }} onClick={event => { handleRenderedClick(event, props.onOpenExternalUrl) }} />
        </article>
      ))}
    </section>
  )
}

function normalizedFragment(value: string): string {
  try {
    return decodeURIComponent(value).replace(/^#+/u, '').replace(/^\^/u, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
  } catch {
    return value.replace(/^#+/u, '').replace(/^\^/u, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
  }
}

function scrollReadingFragment(fragment: string): void {
  if (typeof document === 'undefined') return
  const wanted = normalizedFragment(fragment)
  if (wanted === '') return
  const root = document.querySelector<HTMLElement>('[aria-label="Reading View"] .tocktutor-reading')
  const anchor = Array.from(root?.querySelectorAll<HTMLElement>('[id]') ?? [])
    .find(candidate => normalizedFragment(candidate.id) === wanted)
  const heading = anchor ?? Array.from(root?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6') ?? [])
    .find(candidate => normalizedFragment(candidate.textContent ?? '') === wanted)
  heading?.scrollIntoView({ block: 'start' })
}

export function RichReadingView(props: {
  embeds?: readonly ResolvedEmbedNode[] | undefined
  onAddProperty?: ((key: string) => boolean) | undefined
  onOpenExternalUrl?: ((url: string) => void) | undefined
  onOpenInternalLink?: ((target: string) => void | Promise<ReadingLinkResult | null>) | undefined
  onSetProperty?: ((key: string, value: PropertyValue) => boolean) | undefined
  onToggleTask(index: number): void
  source: string
  title: string
}): ReactNode {
  const html = useMemo(() => renderMarkdownHtml(props.source, { externalEmbedMode: 'viewer', ...(props.embeds === undefined ? {} : { resolvedEmbeds: props.embeds }) }), [props.source, props.embeds])
  const onClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.dataset.taskIndex !== undefined) {
      const index = Number(target.dataset.taskIndex)
      if (Number.isSafeInteger(index) && index >= 0) props.onToggleTask(index)
      return
    }
    const result = handleRenderedClick(event, props.onOpenExternalUrl, props.onOpenInternalLink)
    if (result instanceof Promise) {
      void result.then(value => {
        const fragment = value?.fragment
        if (fragment !== null && fragment !== undefined) {
          const scroll = () => { scrollReadingFragment(fragment) }
          if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(scroll)
          else setTimeout(scroll, 0)
        }
      }).catch(() => undefined)
    }
  }
  return (
    <section aria-label="Reading View" className="min-h-full" tabIndex={-1}>
      <MarkdownDocumentHeader className="mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px]" {...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty })} {...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty })} source={props.source} title={props.title} />
      <article
        className="tocktutor-reading mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px] pb-[72px] text-base leading-6 [&_.callout]:my-4 [&_.callout]:rounded-md [&_.callout]:border [&_.callout]:border-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_35%,var(--tt-border))] [&_.callout]:bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,var(--tt-panel))] [&_.callout]:px-4 [&_.callout]:py-3 [&_.callout>strong]:mb-2 [&_.callout>strong]:block [&_.callout>strong]:text-[var(--dsw-specific-markdown-accent)] [&_.footnotes]:mt-8 [&_.math-display]:my-4 [&_.mermaid]:my-4 [&_.mermaid-diagram]:my-4 [&_.mermaid-diagram]:overflow-x-auto [&_.mermaid-diagram]:rounded-md [&_.mermaid-diagram]:border [&_.mermaid-diagram]:border-[var(--tt-border)] [&_.mermaid-diagram]:bg-[color-mix(in_srgb,var(--tt-text)_3%,var(--tt-panel))] [&_.mermaid-svg]:block [&_.mermaid-svg]:h-auto [&_.mermaid-svg]:min-w-[320px] [&_.mermaid-svg]:w-full [&_.mermaid-edge-path]:fill-none [&_.mermaid-edge-path]:stroke-[var(--dsw-specific-markdown-accent)] [&_.mermaid-edge-path]:stroke-2 [&_.mermaid-arrow-head]:fill-[var(--dsw-specific-markdown-accent)] [&_.mermaid-node-shape]:fill-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_12%,var(--tt-panel))] [&_.mermaid-node-shape]:stroke-[var(--dsw-specific-markdown-accent)] [&_.mermaid-node-shape]:stroke-2 [&_.mermaid-node-label]:fill-[var(--tt-text)] [&_.mermaid-node-label]:font-[inherit] [&_.mermaid-node-label]:text-sm [&_.task-list]:m-0 [&_.task-list]:list-none [&_.task-list]:pl-1 [&_.task-list_li]:min-h-6 [&_.task-list_li]:leading-6 [&_.task-list_input]:mr-2 [&_.task-list_input]:size-3.5 [&_.task-list_input]:accent-[var(--dsw-specific-markdown-accent)] [&_.task-list_li:has(input:checked)]:text-[var(--tt-muted)] [&_.task-list_li:has(input:checked)]:line-through [&_blockquote]:mx-0 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--dsw-specific-markdown-accent)] [&_blockquote]:pl-3 [&_blockquote_p]:m-0 [&_a]:text-[var(--dsw-specific-markdown-accent)] [&_a.internal-link]:no-underline [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[26px] [&_h1]:leading-[31px] [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_ol]:my-2 [&_ol]:pl-[30px] [&_ul:not(.task-list)]:my-2 [&_ul:not(.task-list)]:list-disc [&_ul:not(.task-list)]:pl-[30px] [&_li>ul]:!my-0 [&_li>ul]:!pl-4 [&_li>ul]:border-l [&_li>ul]:border-[var(--tt-border)] [&_li>ol]:!my-0 [&_li>ol]:!pl-4 [&_li>ol]:border-l [&_li>ol]:border-[var(--tt-border)] [&_mark]:bg-[var(--dsw-specific-markdown-highlight)] [&_mark]:text-inherit [&_code]:rounded-sm [&_code]:bg-[var(--dsw-specific-markdown-inline-code)] [&_code]:px-1 [&_code]:py-0.5 [&_pre_code]:rounded-none [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_p]:mt-0 [&_p]:mb-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3 [&_table]:my-4 [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold"
        onClick={onClick}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </section>
  )
}

export function LivePreviewView(props: {
  documentKey: string
  embeds?: readonly ResolvedEmbedNode[] | undefined
  onAddProperty?: ((key: string) => boolean) | undefined
  onEdit(source: string): void
  onEditSource?: (() => void) | undefined
  onOpenExternalUrl?: ((url: string) => void) | undefined
  onSelectionChange?: ((selection: LivePreviewSelection) => void) | undefined
  onSetProperty?: ((key: string, value: PropertyValue) => boolean) | undefined
  onToggleTask(index: number): void
  source: string
  title: string
}): ReactNode {
  return (
    <section aria-label="Live Preview" className="flex min-h-full flex-col" tabIndex={-1}>
      {isLivePreviewSourceProtected(props.source) && (
        <div className="mx-auto mt-3 w-[calc(100%-48px)] max-w-3xl">
          <Alert role="note">
            <AlertTitle>Editing Is Limited</AlertTitle>
            <AlertDescription>
              <p>Typing and pasting are disabled in Live Preview because this note contains formatting it cannot safely preserve. Use Source Mode to edit without changing that formatting.</p>
              {props.onEditSource !== undefined && <Button className="mt-2" onClick={props.onEditSource} size="sm" type="button" variant="outline">Edit in Source Mode</Button>}
            </AlertDescription>
          </Alert>
        </div>
      )}
      <LivePreviewEditor
        ariaLabel="Live Preview Editor"
        className="min-h-[20rem]"
        content={props.source}
        key={props.documentKey}
        onMarkdownChange={props.onEdit}
        {...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty })}
        {...(props.onOpenExternalUrl === undefined ? {} : { onOpenExternalUrl: props.onOpenExternalUrl })}
        {...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty })}
        {...(props.embeds === undefined ? {} : { resolvedEmbeds: props.embeds })}
        {...(props.onSelectionChange === undefined ? {} : { onSelectionChange: props.onSelectionChange })}
        onToggleTask={props.onToggleTask}
        title={props.title}
      />
    </section>
  )
}
