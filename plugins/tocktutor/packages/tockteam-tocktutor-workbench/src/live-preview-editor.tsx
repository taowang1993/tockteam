import {
  lazy,
  Suspense,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import type { EditorWidgetTarget } from './editor-widgets.ts'
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts'
import { parseFrontmatterProperties } from './properties.ts'

export interface LivePreviewSelection {
  from: number
  to: number
}

export function isLivePreviewSourceProtected(source: string): boolean {
  return /(?:^|\n)\s*>\s*\[![A-Za-z][\w-]*\][+-]?|%%|\$\$|!\[\[|(?:^|\n) {0,3}(?:`{3,}|~{3,})\s*(?:base|mermaid)\b|<\/?[A-Za-z][^>]*>/u.test(source)
}

export function splitLivePreviewSource(source: string): { body: string; prefix: string } {
  const normalized = source.replace(/\r\n?/gu, '\n')
  const match = normalized.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u)
  return match === null ? { body: normalized, prefix: '' } : { body: normalized.slice(match[0].length), prefix: match[0] }
}

export interface LivePreviewEditorProps {
  ariaLabel?: string
  className?: string
  content: string
  editorViewRef?: MutableRefObject<unknown | null>
  onMarkdownChange: (markdown: string) => void
  onOpenExternalUrl?: (url: string) => void
  resolvedEmbeds?: readonly import('./embeds.ts').ResolvedEmbedNode[]
  onSelectionChange?: (selection: LivePreviewSelection) => void
  onTableAction?: (action: LivePreviewTableAction) => void
  onToggleTask?: (index: number) => void
  onWidgetState?: (widgets: readonly EditorWidgetTarget[]) => void
  title?: string
}

const LazyLivePreviewEditor = lazy(async () => {
  const module = await import('./live-preview-editor-runtime.tsx')
  return { default: module.LivePreviewEditorRuntime }
})

export function MarkdownDocumentHeader(props: { className?: string; source: string; title?: string }): ReactNode {
  const properties = useMemo(() => parseFrontmatterProperties(props.source), [props.source])
  if (props.title === undefined && properties.length === 0) return null
  return (
    <header className={props.className}>
      {props.title !== undefined && <h1 className="m-0 mb-5 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)]">{props.title}</h1>}
      {properties.length > 0 && (
        <section>
          <h2 className="m-0 mb-2 text-xs font-semibold text-[var(--tt-text)]">Properties</h2>
          <dl aria-label="Document Properties" className="m-0 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 text-xs">
            {properties.map(property => (
              <div className="contents" key={property.key}>
                <dt className="flex min-h-6 min-w-0 items-center gap-2 font-medium text-[var(--tt-muted)]"><span aria-hidden="true">≡</span><span className="truncate">{property.key}</span></dt>
                <dd className="m-0 flex min-h-6 min-w-0 items-center truncate text-[var(--tt-text)]">{Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '')}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </header>
  )
}

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  const protectedSource = useMemo(() => isLivePreviewSourceProtected(props.content), [props.content])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MarkdownDocumentHeader className="mx-auto w-[calc(100%-48px)] max-w-3xl pt-[18px]" source={props.content} {...(props.title === undefined ? {} : { title: props.title })} />
      {protectedSource && <p className="m-0 border-b border-[var(--tt-border)] px-4 py-2 text-xs text-[var(--tt-muted)]" role="note">Protected Markdown stays exact in Live Preview. Use Source mode for free-form edits; task and fold controls remain available.</p>}
      <Suspense fallback={<div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={props.className}>Loading Live Preview…</div>}>
        <LazyLivePreviewEditor {...props} />
      </Suspense>
    </div>
  )
}
