import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tockteam/ui/alert-dialog'
import { Button } from '@tockteam/ui/button'
import { Checkbox } from '@tockteam/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tockteam/ui/dropdown-menu'
import { Input } from '@tockteam/ui/input'
import { AlignLeft, CalendarDays, CheckSquare, ChevronRight, Hash, List, MoreHorizontal, Plus, Tags, X } from 'lucide-react'
import {
  lazy,
  Suspense,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import type { EditorWidgetTarget } from './editor-widgets.ts'
import type { EditorCommandId } from './editor-commands.ts'
import type { EditorSearchRequest, EditorSearchState } from './editor-search.ts'
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts'
import { NoteTitleEditor } from './source-editor.tsx'
import { MAX_FRONTMATTER_BYTES, MAX_PROPERTIES, normalizePropertyListValue, parseFrontmatterProperties, type FrontmatterProperty, type PropertyType, type PropertyValue } from './properties.ts'
import type { ObsidianPropertyTypes } from './types.ts'

const propertyIcons = { text: AlignLeft, list: List, number: Hash, checkbox: CheckSquare, date: CalendarDays, datetime: CalendarDays, mixed: List } satisfies Record<PropertyType, typeof AlignLeft>
const propertyTypeLabels = { text: 'Text', list: 'List', number: 'Number', checkbox: 'Checkbox', date: 'Date', datetime: 'Date & Time', mixed: 'Source Mode' } satisfies Record<PropertyType, string>

export interface LivePreviewSelection {
  from: number
  to: number
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
  declaredTypes?: ObsidianPropertyTypes | undefined
  localEditRevision?: number | undefined
  commandRef?: MutableRefObject<((command: EditorCommandId) => boolean) | null>
  insertTextRef?: MutableRefObject<((text: string) => boolean) | null>
  onUploadImage?: (file: File) => Promise<string>
  slashLinks?: import('./markdown-links.ts').SlashLinkContext | undefined
  onOpenInternalLink?: (target: string, kind?: 'markdown') => void
  editorViewRef?: MutableRefObject<unknown | null>
  onAddProperty?: (key: string) => boolean
  onMarkdownChange: (markdown: string) => void
  onRenameTitle?: (title: string) => Promise<boolean> | boolean
  onSearchState?: (state: EditorSearchState) => void
  onOpenExternalUrl?: (url: string) => void
  onSetProperty?: (key: string, value: PropertyValue) => boolean
  onRenameProperty?: ((from: string, to: string) => boolean) | undefined
  onRemoveProperty?: ((key: string) => boolean) | undefined
  propertyDrafts?: Map<string, string> | undefined
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

function editedPropertyValue(previous: PropertyValue, text: string, type?: PropertyType): PropertyValue {
  if (Array.isArray(previous)) {
    const value: unknown = JSON.parse(text)
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Use a JSON list of strings.')
    return value
  }
  if (type === 'number' || typeof previous === 'number') {
    const value = Number(text)
    if (!Number.isFinite(value) || text.trim() === '') throw new Error('Enter a finite number.')
    return value
  }
  return previous === null && text === '' ? null : text
}

const propertyDraftPrefix = 'tocktutor:properties:'

type PropertyDraftKind = 'add-property' | 'list-add' | 'list-edit' | 'rename' | 'scalar'

function propertyDraftKey(kind: PropertyDraftKind, property?: string, index?: number): string {
  return `${propertyDraftPrefix}${kind}${property === undefined ? '' : `:${encodeURIComponent(property)}`}${index === undefined ? '' : `:${index}`}`
}

function PropertyListEditor(props: { name: string; values: string[]; onSet: (values: string[]) => boolean | undefined; propertyDrafts?: Map<string, string> | undefined }): ReactNode {
  const addKey = propertyDraftKey('list-add', props.name)
  const findEditingIndex = (): number => props.values.findIndex((_value, index) => props.propertyDrafts?.has(propertyDraftKey('list-edit', props.name, index)) === true)
  const [draft, setDraft] = useState(() => props.propertyDrafts?.get(addKey) ?? '')
  const [editingIndex, setEditingIndex] = useState<number | null>(() => {
    const index = findEditingIndex()
    return index < 0 ? null : index
  })
  const [editDraft, setEditDraft] = useState(() => {
    const index = findEditingIndex()
    return index < 0 ? '' : props.propertyDrafts?.get(propertyDraftKey('list-edit', props.name, index)) ?? props.values[index] ?? ''
  })
  const [error, setError] = useState('')
  const editButtons = useRef(new Map<number, HTMLButtonElement>())
  const editCancelled = useRef(false)
  const editFinished = useRef(false)
  const update = (values: string[]): boolean => {
    const saved = props.onSet(values) === true
    setError(saved ? '' : 'This list could not be changed. Retry against the current note or use Source Mode.')
    return saved
  }
  const setAddDraft = (value: string): void => {
    props.propertyDrafts?.set(addKey, value)
    setDraft(value)
  }
  const editKey = editingIndex === null ? null : propertyDraftKey('list-edit', props.name, editingIndex)
  const setCurrentEditDraft = (value: string): void => {
    if (editKey !== null) props.propertyDrafts?.set(editKey, value)
    setEditDraft(value)
  }
  const cancelEdit = (): void => {
    if (editingIndex === null) return
    const index = editingIndex
    editCancelled.current = true
    props.propertyDrafts?.delete(propertyDraftKey('list-edit', props.name, index))
    setEditingIndex(null)
    setEditDraft('')
    setError('')
    queueMicrotask(() => editButtons.current.get(index)?.focus())
  }
  const commitEdit = (): void => {
    if (editingIndex === null || editCancelled.current || editFinished.current) return
    if (editDraft.trim() === '') {
      setError('Enter a value.')
      return
    }
    const index = editingIndex
    const next = normalizePropertyListValue(props.name, editDraft)
    const values = props.values.map((value, at) => at === index ? next : value)
    if (values.every((value, at) => value === props.values[at])) {
      editFinished.current = true
      props.propertyDrafts?.delete(propertyDraftKey('list-edit', props.name, index))
      setEditingIndex(null)
      setEditDraft('')
      setError('')
      return
    }
    if (!update(values)) return
    editFinished.current = true
    props.propertyDrafts?.delete(propertyDraftKey('list-edit', props.name, index))
    setEditingIndex(null)
    setEditDraft('')
  }
  const startEdit = (value: string, index: number): void => {
    const key = propertyDraftKey('list-edit', props.name, index)
    props.propertyDrafts?.set(key, value)
    editCancelled.current = false
    editFinished.current = false
    setEditDraft(props.propertyDrafts?.get(key) ?? value)
    setEditingIndex(index)
    setError('')
  }
  const remove = (index: number): void => {
    if (!update(props.values.filter((_item, at) => at !== index))) return
    if (editingIndex !== null && index < editingIndex) {
      const oldKey = propertyDraftKey('list-edit', props.name, editingIndex)
      const nextIndex = editingIndex - 1
      const nextKey = propertyDraftKey('list-edit', props.name, nextIndex)
      const savedDraft = props.propertyDrafts?.get(oldKey)
      props.propertyDrafts?.delete(oldKey)
      if (savedDraft !== undefined) props.propertyDrafts?.set(nextKey, savedDraft)
      setEditingIndex(nextIndex)
    }
  }
  return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
    {props.values.map((value, index) => <span className="inline-flex min-h-6 max-w-full items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,transparent)] px-2 text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]" key={`${index}:${value}`}>
      {editingIndex === index
        ? <Input aria-label={`Edit ${value} in ${props.name}`} className="h-6 min-w-12 max-w-48 border-0 bg-transparent px-0 py-0 text-xs" onBlur={commitEdit} onChange={event => { setCurrentEditDraft(event.currentTarget.value) }} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelEdit() }
            if (event.key === 'Enter') { event.preventDefault(); commitEdit() }
          }} value={editDraft} />
        : <Button unstyled aria-label={`Edit ${value} in ${props.name}`} className="min-w-0 max-w-full cursor-text truncate rounded border-0 bg-transparent p-0 text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => { startEdit(value, index) }} ref={element => { if (element) editButtons.current.set(index, element); else editButtons.current.delete(index) }} type="button">{value}</Button>}
      {editingIndex !== index && <Button unstyled aria-label={`Remove ${value} from ${props.name}`} className="inline-flex size-5 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" disabled={props.onSet === undefined} onClick={() => { remove(index) }} type="button"><X aria-hidden="true" className="size-3" /></Button>}
    </span>)}
    <form className="flex min-w-0 flex-1 flex-wrap items-center gap-1" onSubmit={event => {
      event.preventDefault()
      if (draft.trim() === '') { setError('Enter a value.'); return }
      const value = normalizePropertyListValue(props.name, draft)
      if (update([...props.values, value])) {
        props.propertyDrafts?.delete(addKey)
        setDraft('')
      }
    }}>
      <Input aria-label={`New ${props.name} Value`} className="h-7 min-w-28 flex-1 text-xs" onChange={event => { setAddDraft(event.currentTarget.value); setError('') }} value={draft} />
      <Button aria-label={`Add ${props.name} Value`} disabled={props.onSet === undefined} size="xs" type="submit" variant="outline">Add</Button>
    </form>
    {error && <span className="basis-full text-xs text-destructive" role="alert">{error}</span>}
  </div>
}

function MarkdownDocumentProperty(props: {
  property: FrontmatterProperty
  properties: FrontmatterProperty[]
  editable: boolean
  propertyDrafts?: Map<string, string> | undefined
  errorId: string
  error: string
  setError: (message: string) => void
  onSetProperty?: ((key: string, value: PropertyValue) => boolean) | undefined
  onRenameProperty?: ((from: string, to: string) => boolean) | undefined
  onRemoveProperty?: ((key: string) => boolean) | undefined
}): ReactNode {
  const { property } = props
  const tags = property.key.toLocaleLowerCase() === 'tags' && Array.isArray(property.value) ? property.value : null
  const checkbox = property.type === 'checkbox' && (typeof property.value === 'boolean' || property.value === '' || property.value === null)
  const list = property.type === 'list' && (Array.isArray(property.value) || property.value === '' || property.value === null)
  const Icon = tags === null ? propertyIcons[property.type] : Tags
  const renameKey = propertyDraftKey('rename', property.key)
  const scalarKey = propertyDraftKey('scalar', property.key)
  const rowErrorId = useId()
  const [renaming, setRenaming] = useState(() => props.propertyDrafts?.has(renameKey) === true)
  const [renameDraft, setRenameDraft] = useState(() => props.propertyDrafts?.get(renameKey) ?? property.key)
  const originalScalar = Array.isArray(property.value) ? JSON.stringify(property.value) : String(property.value ?? '')
  const [scalarInput, setScalarInput] = useState(() => ({ original: originalScalar, value: props.propertyDrafts?.get(scalarKey) ?? originalScalar }))
  const scalarDraft = props.propertyDrafts ? props.propertyDrafts.get(scalarKey) ?? originalScalar
    : scalarInput.original === originalScalar ? scalarInput.value : originalScalar
  const [rowError, setRowError] = useState('')
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const propertyNameButton = useRef<HTMLButtonElement>(null)
  const actionsButton = useRef<HTMLButtonElement>(null)
  const renameCancelled = useRef(false)
  const renameFinished = useRef(false)
  const safeProperty = property.type !== 'mixed'
  const canRename = props.editable && safeProperty && props.onRenameProperty !== undefined
  const canRemove = props.editable && safeProperty && props.onRemoveProperty !== undefined
  const IconComponent = Icon
  const startRename = (): void => {
    if (!canRename) return
    props.propertyDrafts?.set(renameKey, props.propertyDrafts?.get(renameKey) ?? property.key)
    renameCancelled.current = false
    renameFinished.current = false
    setRenameDraft(props.propertyDrafts?.get(renameKey) ?? property.key)
    setRenaming(true)
    setRowError('')
  }
  const startRenameFromMenu = (): void => {
    setTimeout(startRename, 0)
  }
  const cancelRename = (): void => {
    renameCancelled.current = true
    props.propertyDrafts?.delete(renameKey)
    setRenameDraft(property.key)
    setRenaming(false)
    setRowError('')
    queueMicrotask(() => propertyNameButton.current?.focus())
  }
  const commitRename = (): void => {
    if (renameCancelled.current || renameFinished.current) return
    const name = renameDraft.trim()
    if (name === '') { setRowError('Enter a property name.'); return }
    if (props.properties.some(candidate => candidate.key !== property.key && candidate.key.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setRowError('A property with this name already exists.')
      return
    }
    if (name === property.key) {
      renameFinished.current = true
      props.propertyDrafts?.delete(renameKey)
      setRenaming(false)
      setRowError('')
      return
    }
    if (!props.onRenameProperty?.(property.key, name)) {
      setRowError('This property could not be renamed. Retry against the current note or use Source Mode.')
      return
    }
    renameFinished.current = true
    props.propertyDrafts?.delete(renameKey)
    if (props.propertyDrafts) {
      for (const kind of ['scalar', 'list-add'] as const) {
        const previousKey = propertyDraftKey(kind, property.key)
        const nextKey = propertyDraftKey(kind, name)
        const draft = props.propertyDrafts.get(previousKey)
        if (draft !== undefined) { props.propertyDrafts.set(nextKey, draft); props.propertyDrafts.delete(previousKey) }
      }
      if (Array.isArray(property.value)) {
        for (let index = 0; index < property.value.length; index += 1) {
          const previousKey = propertyDraftKey('list-edit', property.key, index)
          const nextKey = propertyDraftKey('list-edit', name, index)
          const draft = props.propertyDrafts.get(previousKey)
          if (draft !== undefined) { props.propertyDrafts.set(nextKey, draft); props.propertyDrafts.delete(previousKey) }
        }
      }
    }
    setRenaming(false)
    setRowError('')
  }
  const copyValue = async (): Promise<void> => {
    const value = property.value === null ? '' : Array.isArray(property.value) ? property.value.join(', ') : String(property.value)
    try {
      const clipboard = globalThis.navigator?.clipboard
      if (clipboard === undefined || typeof clipboard.writeText !== 'function') throw new Error('Clipboard unavailable')
      await clipboard.writeText(value)
      setRowError('')
    } catch {
      setRowError('Value could not be copied. Clipboard access is unavailable.')
    }
  }
  const requestRemove = (): void => { setRemoveError(''); setRemoveOpen(true) }
  const removeProperty = (): void => {
    if (!props.onRemoveProperty?.(property.key)) {
      setRemoveError('This property could not be removed. Retry against the current note or use Source Mode.')
      return
    }
    setRemoveError('')
    if (props.propertyDrafts) {
      for (const kind of ['rename', 'scalar', 'list-add'] as const) props.propertyDrafts.delete(propertyDraftKey(kind, property.key))
      if (Array.isArray(property.value)) {
        for (let index = 0; index < property.value.length; index += 1) props.propertyDrafts.delete(propertyDraftKey('list-edit', property.key, index))
      }
    }
    setRemoveOpen(false)
  }
  const displayValue = (): ReactNode => {
    if (props.editable && property.type === 'mixed' && property.value !== null) return <span className="text-muted-foreground">Use Source Mode</span>
    if (props.editable && list) return <PropertyListEditor name={property.key} onSet={values => props.onSetProperty?.(property.key, values)} propertyDrafts={props.propertyDrafts} values={Array.isArray(property.value) ? property.value : []} />
    if (props.editable && !checkbox) return <Input aria-describedby={props.error === '' ? undefined : props.errorId} aria-invalid={props.error === '' ? undefined : true} aria-label={`Property ${property.key}`} onBlur={event => {
      try {
        const text = event.currentTarget.value
        if (text === originalScalar) {
          props.propertyDrafts?.delete(scalarKey)
          props.setError('')
          return
        }
        const value = editedPropertyValue(property.value, text, property.type)
        if (JSON.stringify(value) !== JSON.stringify(property.value) && !props.onSetProperty?.(property.key, value)) throw new Error('This property could not be changed. Use Source Mode for structured values, or retry against the current note.')
        props.propertyDrafts?.delete(scalarKey)
        props.setError('')
      } catch (error) { props.setError(error instanceof Error ? error.message : 'Invalid property value.') }
    }} onChange={event => { props.propertyDrafts?.set(scalarKey, event.currentTarget.value); setScalarInput({ original: originalScalar, value: event.currentTarget.value }) }} step={property.type === 'number' ? 'any' : undefined} type={property.type === 'date' ? 'date' : property.type === 'datetime' ? 'datetime-local' : property.type === 'number' ? 'number' : undefined} value={scalarDraft} />
    if (tags === null) {
      if (checkbox) return <Checkbox aria-label={property.key} checked={property.value === true} className="size-4 cursor-default disabled:opacity-100 data-[state=checked]:!border-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!bg-[var(--dsw-specific-markdown-accent)] data-[state=checked]:!text-[#000]" disabled={!props.editable} onCheckedChange={checked => { if (!props.onSetProperty?.(property.key, checked === true)) props.setError('This property could not be changed.') }} />
      return <span className="min-w-0 [overflow-wrap:anywhere]">{Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '')}</span>
    }
    return tags.map((tag, index) => <span className="inline-flex min-h-6 max-w-full items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,transparent)] px-2 text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]" key={`${index}:${tag}`}>
      <span className="min-w-0 [overflow-wrap:anywhere]">{tag}</span>
      {props.onSetProperty !== undefined && <Button unstyled aria-label={`Remove ${tag} tag`} className="inline-flex size-5 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-current focus-visible:outline focus-visible:outline-[var(--tt-accent)]" onClick={() => { props.onSetProperty?.(property.key, tags.filter((_value, valueIndex) => valueIndex !== index)) }} type="button"><X aria-hidden="true" className="size-3" /></Button>}
    </span>)
  }
  return <>
    <dt className="flex min-h-8 min-w-0 items-center gap-2 self-start text-[var(--tt-muted)]" title={`${property.key} · ${propertyTypeLabels[property.type]}`}>
      <IconComponent aria-hidden="true" className="size-4 shrink-0" />
      {renaming && props.editable
        ? <Input aria-describedby={rowError === '' ? undefined : rowErrorId} aria-invalid={rowError === '' ? undefined : true} aria-label={`Rename Property ${property.key}`} autoFocus className="h-7 min-w-0 flex-1 text-xs" onBlur={commitRename} onChange={event => { props.propertyDrafts?.set(renameKey, event.currentTarget.value); setRenameDraft(event.currentTarget.value); setRowError('') }} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
            if (event.key === 'Enter') { event.preventDefault(); commitRename() }
          }} value={renameDraft} />
        : props.editable
          ? <Button unstyled aria-label={`Rename Property ${property.key}`} className="min-w-0 flex-1 cursor-text truncate rounded border-0 bg-transparent p-0 text-left text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default" disabled={!canRename} onClick={startRename} ref={propertyNameButton} type="button">{property.key}</Button>
          : <span className="min-w-0 truncate">{property.key}</span>}
      {props.editable && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button unstyled aria-label={`Actions for ${property.key}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" ref={actionsButton} type="button"><MoreHorizontal aria-hidden="true" className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={!canRename} onSelect={startRenameFromMenu}>Rename Property</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void copyValue() }}>Copy Value</DropdownMenuItem>
            <DropdownMenuItem disabled={!canRemove} onSelect={requestRemove}>Remove Property</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
    </dt>
    <dd className="m-0 flex min-h-8 min-w-0 flex-wrap items-center gap-1 py-1 text-[var(--tt-text)]">
      {displayValue()}
      {rowError !== '' && <span className="basis-full text-xs text-destructive" id={rowErrorId} role="alert">{rowError}</span>}
    </dd>
    {props.editable && <AlertDialog onOpenChange={setRemoveOpen} open={removeOpen}>
      <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); actionsButton.current?.focus() }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Property “{property.key}”?</AlertDialogTitle>
          <AlertDialogDescription>This removes the property from this document.</AlertDialogDescription>
        </AlertDialogHeader>
        {removeError !== '' && <p className="m-0 text-destructive" role="alert">{removeError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setRemoveError('') }}>Cancel</AlertDialogCancel>
          <Button onClick={removeProperty} type="button" variant="destructive">Remove Property</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>
}

function fallbackDocumentTitle(source: string, title: string | undefined): string | undefined {
  if (title === undefined) return undefined
  // Suppress only a matching leading title; never remove or rewrite authored headings.
  const heading = splitLivePreviewSource(source).body.match(/^(?:[ \t]*\n)* {0,3}#[ \t]+([^\n]+?)(?:[ \t]+#+)?[ \t]*(?:\n|$)/u)?.[1]
  return heading?.replace(/\s/gu, '') === title.replace(/\s/gu, '') ? undefined : title
}

export function MarkdownDocumentHeader(props: {
  editableProperties?: boolean
  className?: string
  declaredTypes?: ObsidianPropertyTypes | undefined
  onAddProperty?: (key: string) => boolean
  onRenameProperty?: ((from: string, to: string) => boolean) | undefined
  onRemoveProperty?: ((key: string) => boolean) | undefined
  onRenameTitle?: (title: string) => Promise<boolean> | boolean
  onSetProperty?: (key: string, value: PropertyValue) => boolean
  propertyDrafts?: Map<string, string> | undefined
  source: string
  title?: string
}): ReactNode {
  const properties = useMemo(() => parseFrontmatterProperties(props.source, props.declaredTypes), [props.source, props.declaredTypes])
  const errorId = useId()
  const propertiesId = useId()
  const addKey = propertyDraftKey('add-property')
  const [propertiesExpanded, setPropertiesExpanded] = useState(true)
  const [adding, setAdding] = useState(() => props.propertyDrafts?.has(addKey) === true)
  const [name, setName] = useState(() => props.propertyDrafts?.get(addKey) ?? '')
  const [error, setError] = useState('')
  const addButton = useRef<HTMLButtonElement>(null)
  const cancel = (): void => {
    props.propertyDrafts?.delete(addKey)
    setAdding(false)
    setName('')
    setError('')
    queueMicrotask(() => addButton.current?.focus())
  }
  if (props.editableProperties && new TextEncoder().encode(props.source).byteLength > MAX_FRONTMATTER_BYTES) return <p role="status">This note is too large to edit properties. Use Source Mode.</p>
  const showProperties = properties.length > 0 || props.editableProperties === true
  const title = props.onRenameTitle === undefined ? fallbackDocumentTitle(props.source, props.title) : props.title
  if (title === undefined && !showProperties) return null
  return (
    <header className={props.className}>
      {title !== undefined && (props.onRenameTitle === undefined
        ? <h1 className="m-0 mb-5 text-[30px] leading-tight font-bold tracking-[-.01em] text-[var(--tt-text)]">{title}</h1>
        : <NoteTitleEditor compact onRenameTitle={props.onRenameTitle} title={title} />)}
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
                {properties.map(property => <div className="contents" key={property.key}>
                  <MarkdownDocumentProperty
                    editable={props.editableProperties === true}
                    error={error}
                    errorId={errorId}
                    onRemoveProperty={props.onRemoveProperty}
                    onRenameProperty={props.onRenameProperty}
                    onSetProperty={props.onSetProperty}
                    properties={properties}
                    property={property}
                    propertyDrafts={props.propertyDrafts}
                    setError={setError}
                  />
                </div>)}
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
                    <Input aria-describedby={error === '' ? undefined : errorId} aria-invalid={error === '' ? undefined : true} aria-label="Property Name" autoFocus className="h-7 max-w-52 rounded-md text-xs" onChange={event => { props.propertyDrafts?.set(addKey, event.currentTarget.value); setName(event.currentTarget.value); setError('') }} placeholder="Property name" value={name} />
                    <Button className="bg-transparent text-[var(--tt-text)]" size="xs" type="submit" variant="outline">Add</Button>
                    <Button aria-label="Cancel Adding Property" className="bg-transparent" onClick={cancel} size="icon-xs" type="button" variant="ghost"><X aria-hidden="true" /></Button>
                    {error !== '' && <span className="basis-full text-xs text-[var(--dsw-alias-state-error-primary)]" id={errorId} role="alert">{error}</span>}
                  </form>
                )
              : <Button className="mt-2 -ml-2.5 bg-transparent text-[var(--tt-muted)] hover:text-[var(--tt-text)]" onClick={() => { props.propertyDrafts?.set(addKey, ''); setName(''); setError(''); setAdding(true) }} ref={addButton} type="button" variant="ghost"><Plus aria-hidden="true" data-icon="inline-start" />Add Property</Button>)}
          </div>
        </section>
      )}
    </header>
  )
}

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MarkdownDocumentHeader className="mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px]" declaredTypes={props.declaredTypes} editableProperties={props.onSetProperty !== undefined} onRenameProperty={props.onRenameProperty} onRemoveProperty={props.onRemoveProperty} propertyDrafts={props.propertyDrafts} source={props.content} {...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty })} {...(props.onRenameTitle === undefined ? {} : { onRenameTitle: props.onRenameTitle })} {...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty })} {...(props.title === undefined ? {} : { title: props.title })} />
      <Suspense fallback={<div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={props.className}>Loading Live Preview…</div>}>
        <LazyLivePreviewEditor {...props} />
      </Suspense>
    </div>
  )
}
