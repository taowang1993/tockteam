import { Checkbox } from '@tockteam/ui/checkbox'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { AlignLeft, Plus, Tags, X } from 'lucide-react'
import {
  lazy,
  Suspense,
  useId,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import type { EditorWidgetTarget } from './editor-widgets.ts'
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts'
import { parseFrontmatterProperties, type PropertyValue } from './properties.ts'

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
  onAddProperty?: (key: string) => boolean
  onMarkdownChange: (markdown: string) => void
  onOpenExternalUrl?: (url: string) => void
  onSetProperty?: (key: string, value: PropertyValue) => boolean
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

export function MarkdownDocumentHeader(props: { className?: string; onAddProperty?: (key: string) => boolean; onSetProperty?: (key: string, value: PropertyValue) => boolean; source: string; title?: string }): ReactNode {
  const properties = useMemo(() => parseFrontmatterProperties(props.source), [props.source])
  const errorId = useId()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const cancel = (): void => {
    setAdding(false)
    setName('')
    setError('')
  }
  const showProperties = properties.length > 0 || (props.onAddProperty !== undefined && props.source.trim() !== '')
  if (props.title === undefined && !showProperties) return null
  return (
    <header className={props.className}>
      {props.title !== undefined && <h1 className="m-0 mb-5 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)]">{props.title}</h1>}
      {showProperties && (
        <section>
          <h2 className="m-0 mb-2 text-xs font-semibold text-[var(--tt-text)]">Properties</h2>
          {properties.length > 0 && (
            <dl aria-label="Document Properties" className="m-0 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 text-xs">
              {properties.map(property => {
                const tags = property.key.toLocaleLowerCase() === 'tags' && Array.isArray(property.value) ? property.value : null
                const checkbox = property.type === 'checkbox' && typeof property.value === 'boolean'
                const Icon = tags === null ? AlignLeft : Tags
                return (
                  <div className="contents" key={property.key}>
                    <dt className="flex min-h-6 min-w-0 items-center gap-2 font-medium text-[var(--tt-muted)]"><Icon aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{property.key}</span></dt>
                    <dd className={`m-0 flex min-h-6 min-w-0 items-center text-[var(--tt-text)] ${tags === null ? 'truncate' : 'flex-wrap gap-1'}`}>
                      {tags === null
                        ? checkbox
                          ? <Checkbox aria-label={property.key} checked={property.value === true} className="size-3.5 cursor-default disabled:opacity-100 data-[state=checked]:!border-[var(--tt-accent)] data-[state=checked]:!bg-[var(--tt-accent)] data-[state=checked]:!text-[#000]" disabled />
                          : Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '')
                        : tags.map((tag, index) => (
                            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_15%,transparent)] px-2 text-[var(--dsw-specific-markdown-accent)]" key={tag}>
                              {tag}
                              {props.onSetProperty !== undefined && <Button unstyled aria-label={`Remove ${tag} tag`} className="inline-flex size-3 items-center justify-center border-0 bg-transparent p-0 text-current" onClick={() => { props.onSetProperty?.(property.key, tags.filter((_value, valueIndex) => valueIndex !== index)) }} type="button"><X aria-hidden="true" className="size-3" /></Button>}
                            </span>
                          ))}
                    </dd>
                  </div>
                )
              })}
            </dl>
          )}
          {props.onAddProperty !== undefined && (adding
            ? (
                <form
                  aria-label="Add Property"
                  className="mt-1 flex min-h-7 flex-wrap items-center gap-1"
                  onKeyDown={event => {
                    if (event.key !== 'Escape') return
                    event.preventDefault()
                    event.stopPropagation()
                    cancel()
                  }}
                  onSubmit={event => {
                    event.preventDefault()
                    const key = name.trim()
                    if (key === '') {
                      setError('Enter a property name.')
                      return
                    }
                    if (properties.some(property => property.key.toLocaleLowerCase() === key.toLocaleLowerCase())) {
                      setError('A property with this name already exists.')
                      return
                    }
                    if (!props.onAddProperty?.(key)) {
                      setError('That property could not be added.')
                      return
                    }
                    cancel()
                  }}
                >
                  <Input aria-describedby={error === '' ? undefined : errorId} aria-invalid={error === '' ? undefined : true} aria-label="Property Name" autoFocus className="h-7 max-w-52 rounded-md text-xs" onChange={event => { setName(event.currentTarget.value); setError('') }} placeholder="Property name" value={name} />
                  <Button className="bg-transparent text-[var(--tt-text)]" size="xs" type="submit" variant="outline">Add</Button>
                  <Button aria-label="Cancel Adding Property" className="bg-transparent" onClick={cancel} size="icon-xs" type="button" variant="ghost"><X aria-hidden="true" /></Button>
                  {error !== '' && <span className="basis-full text-xs text-[var(--dsw-alias-state-error-primary)]" id={errorId} role="alert">{error}</span>}
                </form>
              )
            : <Button className="mt-1 -ml-1 bg-transparent text-[var(--tt-muted)] hover:text-[var(--tt-text)]" onClick={() => { setAdding(true) }} size="xs" type="button" variant="ghost"><Plus aria-hidden="true" />Add Property</Button>)}
        </section>
      )}
    </header>
  )
}

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MarkdownDocumentHeader className="mx-auto w-[calc(100%-48px)] max-w-3xl pt-[18px]" source={props.content} {...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty })} {...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty })} {...(props.title === undefined ? {} : { title: props.title })} />
      <Suspense fallback={<div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={props.className}>Loading Live Preview…</div>}>
        <LazyLivePreviewEditor {...props} />
      </Suspense>
    </div>
  )
}
