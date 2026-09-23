import { Checkbox } from '@tockteam/ui/checkbox'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { AlignLeft, CalendarDays, CheckSquare, ChevronRight, Hash, List, Plus, Tags, X } from 'lucide-react'
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
import type { EditorSearchRequest, EditorSearchState } from './editor-search.ts'
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts'
import { MAX_FRONTMATTER_BYTES, MAX_PROPERTIES, parseFrontmatterProperties, type PropertyType, type PropertyValue } from './properties.ts'

const propertyIcons = { text: AlignLeft, list: List, number: Hash, checkbox: CheckSquare, date: CalendarDays, datetime: CalendarDays, mixed: List } satisfies Record<PropertyType, typeof AlignLeft>

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
  onSearchState?: (state: EditorSearchState) => void
  onOpenExternalUrl?: (url: string) => void
  onSetProperty?: (key: string, value: PropertyValue) => boolean
  resolvedEmbeds?: readonly import('./embeds.ts').ResolvedEmbedNode[]
  onSelectionChange?: (selection: LivePreviewSelection) => void
  searchCurrentIndex?: number | null
  searchQuery?: string
  searchRequest?: EditorSearchRequest | null
  onTableAction?: (action: LivePreviewTableAction) => void
  onToggleTask?: (index: number) => void
  onWidgetState?: (widgets: readonly EditorWidgetTarget[]) => void
  title?: string
}

const LazyLivePreviewEditor = lazy(async () => {
  const module = await import('./live-preview-editor-runtime.tsx')
  return { default: module.LivePreviewEditorRuntime }
})

function editedPropertyValue(previous: PropertyValue, text: string): PropertyValue {
  if (Array.isArray(previous)) {
    const value: unknown = JSON.parse(text)
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Use a JSON list of strings.')
    return value
  }
  if (typeof previous === 'number') {
    const value = Number(text)
    if (!Number.isFinite(value) || text.trim() === '') throw new Error('Enter a finite number.')
    return value
  }
  return previous === null && text === '' ? null : text
}

export function MarkdownDocumentHeader(props: { editableProperties?: boolean; className?: string; onAddProperty?: (key: string) => boolean; onSetProperty?: (key: string, value: PropertyValue) => boolean; source: string; title?: string }): ReactNode {
  const properties = useMemo(() => parseFrontmatterProperties(props.source), [props.source])
  const errorId = useId()
  const propertiesId = useId()
  const [propertiesExpanded, setPropertiesExpanded] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const cancel = (): void => {
    setAdding(false)
    setName('')
    setError('')
  }
  if (props.editableProperties && new TextEncoder().encode(props.source).byteLength > MAX_FRONTMATTER_BYTES) return <p role="status">This note is too large to edit properties. Use Source Mode.</p>
  const showProperties = properties.length > 0 || props.editableProperties === true
  if (props.title === undefined && !showProperties) return null
  return (
    <header className={props.className}>
      {props.title !== undefined && <h1 className="m-0 mb-5 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)]">{props.title}</h1>}
      {props.editableProperties && error && !adding && <p role="alert">{error}</p>}
      {props.editableProperties && properties.length >= MAX_PROPERTIES && <p role="status">The property limit was reached; this list may be incomplete. Use Source Mode.</p>}
      {props.editableProperties && properties.length === 0 && <p className="text-xs text-[var(--tt-muted)]">No properties.</p>}
      {showProperties && (
        <section>
          <h2 className="m-0 mb-3 text-base font-semibold text-[var(--tt-text)]">
            <Button
              unstyled
              aria-controls={propertiesId}
              aria-expanded={propertiesExpanded}
              className="group relative flex min-h-6 w-full cursor-pointer items-center rounded border-0 bg-transparent p-0 text-left text-inherit hover:text-[var(--tt-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tt-accent)]"
              onClick={() => { setPropertiesExpanded(expanded => !expanded) }}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="absolute -left-5 size-4 text-[var(--tt-muted)] group-aria-expanded:rotate-90" data-icon="inline-start" />
              Properties
            </Button>
          </h2>
          <div hidden={!propertiesExpanded} id={propertiesId}>
            {properties.length > 0 && (
              <dl aria-label="Document Properties" className="m-0 grid grid-cols-[minmax(96px,140px)_minmax(0,1fr)] gap-x-3 text-sm leading-6">
                {properties.map(property => {
                  const tags = property.key.toLocaleLowerCase() === 'tags' && Array.isArray(property.value) ? property.value : null
                  const checkbox = property.type === 'checkbox' && typeof property.value === 'boolean'
                  const Icon = tags === null ? propertyIcons[property.type] : Tags
                  return (
                    <div className="contents" key={property.key}>
                      <dt className="flex min-h-8 min-w-0 items-center gap-2 self-start text-[var(--tt-muted)]" title={`${property.key} · ${property.type}`}><Icon aria-hidden="true" className="size-4 shrink-0" /><span className="truncate">{property.key}</span></dt>
                      <dd className="m-0 flex min-h-8 min-w-0 flex-wrap items-center gap-1 py-1 text-[var(--tt-text)]">
                        {props.editableProperties && !checkbox ? <Input aria-label={`Property ${property.key}`} key={JSON.stringify(property.value)} defaultValue={Array.isArray(property.value) ? JSON.stringify(property.value) : String(property.value ?? '')} onBlur={event => {
                          try {
                            const text = event.currentTarget.value
                            const value = editedPropertyValue(property.value, text)
                            if (JSON.stringify(value) !== JSON.stringify(property.value) && !props.onSetProperty?.(property.key, value)) throw new Error('This property could not be changed. Use Source Mode for structured values, or retry against the current note.')
                            setError('')
                          } catch (error) { setError(error instanceof Error ? error.message : 'Invalid property value.') }
                        }} /> : tags === null
                          ? checkbox
                            ? <Checkbox aria-label={property.key} checked={property.value === true} className="size-4 cursor-default disabled:opacity-100 data-[state=checked]:!border-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!bg-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!text-[#000]" disabled={!props.editableProperties} onCheckedChange={checked => { if (!props.onSetProperty?.(property.key, checked === true)) setError('This property could not be changed.') }} />
                            : <span className="min-w-0 [overflow-wrap:anywhere]">{Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '')}</span>
                          : tags.map((tag, index) => (
                              <span className="inline-flex min-h-6 max-w-full items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,transparent)] px-2 text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]" key={tag}>
                                <span className="min-w-0 [overflow-wrap:anywhere]">{tag}</span>
                                {props.onSetProperty !== undefined && <Button unstyled aria-label={`Remove ${tag} tag`} className="inline-flex size-5 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-current focus-visible:outline focus-visible:outline-[var(--tt-accent)]" onClick={() => { props.onSetProperty?.(property.key, tags.filter((_value, valueIndex) => valueIndex !== index)) }} type="button"><X aria-hidden="true" className="size-3" /></Button>}
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
              : <Button className="mt-2 -ml-2.5 bg-transparent text-[var(--tt-muted)] hover:text-[var(--tt-text)]" onClick={() => { setAdding(true) }} type="button" variant="ghost"><Plus aria-hidden="true" data-icon="inline-start" />Add Property</Button>)}
          </div>
        </section>
      )}
    </header>
  )
}

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MarkdownDocumentHeader className="mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px]" source={props.content} {...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty })} {...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty })} {...(props.title === undefined ? {} : { title: props.title })} />
      <Suspense fallback={<div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={props.className}>Loading Live Preview…</div>}>
        <LazyLivePreviewEditor {...props} />
      </Suspense>
    </div>
  )
}
