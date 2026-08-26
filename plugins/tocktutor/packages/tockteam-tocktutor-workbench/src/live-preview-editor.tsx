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
}

const LazyLivePreviewEditor = lazy(async () => {
  const module = await import('./live-preview-editor-runtime.tsx')
  return { default: module.LivePreviewEditorRuntime }
})

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  const properties = useMemo(() => parseFrontmatterProperties(props.content), [props.content])
  const protectedSource = useMemo(() => isLivePreviewSourceProtected(props.content), [props.content])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {properties.length > 0 && (
        <dl aria-label="Live Preview Properties" className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-[var(--tt-border)] bg-[var(--tt-panel)] px-4 py-2 text-xs">
          {properties.map(property => (
            <div className="contents" key={property.key}>
              <dt className="font-medium text-[var(--tt-muted)]">{property.key}</dt>
              <dd className="m-0 truncate text-[var(--tt-text)]">{Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '')}</dd>
            </div>
          ))}
        </dl>
      )}
      {protectedSource && <p className="m-0 border-b border-[var(--tt-border)] px-4 py-2 text-xs text-[var(--tt-muted)]" role="note">Protected Markdown stays exact in Live Preview. Use Source mode for free-form edits; task and fold controls remain available.</p>}
      <Suspense fallback={<div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={props.className}>Loading Live Preview…</div>}>
        <LazyLivePreviewEditor {...props} />
      </Suspense>
    </div>
  )
}
