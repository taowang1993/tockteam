import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { ArrowDownUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Copy, FileDown, LayoutGrid, List, ListFilter, MapPin, Plus, RotateCcw, Search, Table2, X } from 'lucide-react'
import { Button } from '@tockteam/ui/button'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@tockteam/ui/dropdown-menu'
import { Field, FieldLabel } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@tockteam/ui/popover'
import { appendBaseView, setBaseViewField } from './base-authoring.ts'
import { parseFrontmatterProperties } from './properties.ts'

import { createExecutableBaseFrontmatterEdit, type ExecutableBaseFrontmatterEditRequest } from './base-edit.ts'
import { parseExecutableBase } from './base-parser.ts'
import type { BaseHydratedFile } from './base-query.ts'
import {
  executableBaseCellRangeTsv,
  executableBaseCsvFilename,
  executableBaseViewCsv,
  executableBaseViewTsv,
} from './base-spreadsheet.ts'
import { createBaseViewModel, type ExecutableBaseRowModel, type ExecutableBaseViewModel } from './base-view-model.ts'

export interface ExecutableBaseCopyRequest {
  kind: 'results' | 'selection'
  text: string
  view: string
}

export interface ExecutableBaseExportRequest {
  filename: string
  text: string
  view: string
}

type ExecutableBaseEditResult = boolean | void | PromiseLike<boolean | void>

export interface ExecutableBaseViewProps {
  activeView?: string | null
  baseFile?: { createdAt?: number; modifiedAt?: number; relativePath: string; sizeBytes?: number }
  files: readonly BaseHydratedFile[]
  onActiveViewChange?: (view: string) => void
  onCopy?: (request: ExecutableBaseCopyRequest) => void
  onEdit?: (request: ExecutableBaseFrontmatterEditRequest) => ExecutableBaseEditResult
  onExport?: (request: ExecutableBaseExportRequest) => void
  onSearchChange?: (view: string, search: string) => void
  onSourceChange?: (previous: string, next: string) => Promise<boolean>
  onNewNote?: () => void
  searches?: Readonly<Record<string, string | undefined>>
  source: string
}

type SelectedCell = { column: number; path: string; view: string }

function resultCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'Result' : 'Results'}`
}

function cellKey(view: string, path: string, column: number): string {
  return `${view}\0${path}\0${String(column)}`
}

function readableKind(kind: string): string {
  return kind === 'map-label' ? 'Map Labels' : `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`
}

const layoutIcons = { table: Table2, cards: LayoutGrid, list: List, map: MapPin }
const configureChoiceClass = 'box-border flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-2 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

function SummaryList(props: { model: Extract<ExecutableBaseViewModel, { status: 'ready' }> }): ReactNode {
  if (props.model.summaries.length === 0) return null
  return (
    <dl aria-label={`${props.model.view.name} Summaries`} className="flex flex-wrap gap-2">
      {props.model.summaries.map(summary => (
        <div className="rounded-md border border-[var(--tt-border)] px-2 py-1 text-xs" key={summary.expression}>
          <dt className="inline font-medium">{summary.label}: </dt>
          <dd className="inline">{String(summary.value ?? '')}</dd>
        </div>
      ))}
    </dl>
  )
}

function ReadonlyLayouts(props: {
  model: Extract<ExecutableBaseViewModel, { status: 'ready' }>
}): ReactNode {
  const { model } = props
  if (model.kind === 'list') {
    return (
      <ul aria-label={`${model.view.name} Results`} className="space-y-1.5">
        {model.rows.map(row => (
          <li className="rounded-md border border-[var(--tt-border)] p-2" key={row.path}>
            {row.cells.map((cell, index) => (
              <span key={cell.column}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                <span className={index === 0 ? 'font-medium' : 'text-[var(--tt-muted)]'}>{cell.text}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    )
  }
  if (model.kind === 'cards') {
    return (
      <ul aria-label={`${model.view.name} Results`} className="grid list-none grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 p-0">
        {model.rows.map(row => (
          <li className="rounded-lg border border-[var(--tt-border)] p-3" key={row.path}>
            {row.cells.map(cell => (
              <p className="m-0 text-sm" key={cell.column}>
                <strong>{cell.label}:</strong> {cell.text}
              </p>
            ))}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul aria-label={`${model.view.name} Map Labels`} className="space-y-1.5">
      {model.rows.map(row => {
        const coordinateCell = model.view.coordinates === null
          ? undefined
          : row.cells.find(cell => cell.column === model.view.coordinates)
        return (
          <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--tt-border)] p-2" key={row.path}>
            <span className="font-medium">{row.cells[0]?.text || row.path}</span>
            <span className="text-xs text-[var(--tt-muted)]">
              {row.coordinates === null ? 'Coordinates Unavailable' : coordinateCell?.text ?? `${String(row.coordinates.latitude)}, ${String(row.coordinates.longitude)}`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function EditableCell(props: {
  cell: ExecutableBaseRowModel['cells'][number]
  onEdit?: ((request: ExecutableBaseFrontmatterEditRequest) => ExecutableBaseEditResult) | undefined
  row: ExecutableBaseRowModel
}): ReactNode {
  const { cell, row } = props
  const errorId = useId()
  const authorityKey = `${row.revision}\0${row.source}`
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [value, setValue] = useState(cell.text)
  const authorityRef = useRef({ key: authorityKey, text: cell.text })
  const pendingRef = useRef<{ authorityKey: string; token: number } | null>(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    authorityRef.current = { key: authorityKey, text: cell.text }
    setError(null)
    setValue(cell.text)
  }, [authorityKey, cell.text])
  useEffect(() => () => {
    pendingRef.current = null
  }, [])

  if (!cell.editable || cell.inputType === null || props.onEdit === undefined) return cell.text
  const label = `Edit ${cell.label} for ${row.path}`
  const onEdit = props.onEdit
  const emit = (rawValue: string): void => {
    const request = createExecutableBaseFrontmatterEdit({ path: row.path, revision: row.revision, source: row.source }, cell.column, rawValue)
    if (request === null) return
    const token = tokenRef.current + 1
    tokenRef.current = token
    const requestAuthorityKey = authorityRef.current.key
    pendingRef.current = { authorityKey: requestAuthorityKey, token }
    setError(null)
    setPending(true)
    const settle = (success: boolean): void => {
      if (pendingRef.current?.token !== token) return
      pendingRef.current = null
      setPending(false)
      if (authorityRef.current.key !== requestAuthorityKey) return
      if (success) {
        setValue(rawValue)
        setError(null)
      } else {
        setValue(authorityRef.current.text)
        setError('The Base cell could not be saved.')
      }
    }
    let result: ExecutableBaseEditResult
    try {
      result = onEdit(request)
    } catch {
      settle(false)
      return
    }
    void Promise.resolve(result).then(value => { settle(value !== false) }, () => { settle(false) })
  }
  const feedback = error === null ? null : <span className="block text-xs text-[var(--dsw-alias-state-error-primary)]" id={errorId} role="alert">{error}</span>
  if (cell.inputType === 'checkbox') {
    return <span className="grid gap-1"><Checkbox aria-describedby={error === null ? undefined : errorId} aria-invalid={error === null ? undefined : true} aria-label={label} checked={value === 'true'} disabled={pending} onCheckedChange={checked => emit(checked === true ? 'true' : 'false')} />{feedback}</span>
  }
  return (
    <span className="grid gap-1">
      <Input
        unstyled
        aria-describedby={error === null ? undefined : errorId}
        aria-invalid={error === null ? undefined : true}
        aria-label={label}
        className="min-w-24 rounded border border-[var(--tt-border)] bg-transparent px-1.5 py-1"
        disabled={pending}
        type={cell.inputType}
        value={value}
        onBlur={event => {
          if (!pending && event.currentTarget.value !== authorityRef.current.text) emit(event.currentTarget.value)
        }}
        onChange={event => { setValue(event.currentTarget.value); setError(null) }}
      />
      {feedback}
    </span>
  )
}

function ExecutableTable(props: {
  model: Extract<ExecutableBaseViewModel, { status: 'ready' }>
  onCopy?: ((request: ExecutableBaseCopyRequest) => void) | undefined
  onEdit?: ((request: ExecutableBaseFrontmatterEditRequest) => ExecutableBaseEditResult) | undefined
}): ReactNode {
  const { model } = props
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const [anchor, setAnchor] = useState<SelectedCell | null>(null)
  const refs = useRef(new Map<string, HTMLTableCellElement>())
  const selectedRow = selected?.view === model.view.name ? model.rows.findIndex(row => row.path === selected.path) : -1
  const selectedVisible = selected !== null && selectedRow >= 0 && selected.column < model.columns.length
  const anchorRow = anchor?.view === model.view.name ? model.rows.findIndex(row => row.path === anchor.path) : -1
  const range = selectedVisible && anchor !== null && anchorRow >= 0
    ? {
        columnEnd: Math.max(selected!.column, Math.min(anchor.column, model.columns.length - 1)),
        columnStart: Math.min(selected!.column, Math.min(anchor.column, model.columns.length - 1)),
        rowEnd: Math.max(selectedRow, anchorRow),
        rowStart: Math.min(selectedRow, anchorRow),
      }
    : null

  const focusCell = (rowIndex: number, column: number, extend: boolean): void => {
    if (model.rows.length === 0 || model.columns.length === 0) return
    const boundedRow = Math.max(0, Math.min(rowIndex, model.rows.length - 1))
    const boundedColumn = Math.max(0, Math.min(column, model.columns.length - 1))
    const path = model.rows[boundedRow]?.path
    if (path === undefined) return
    setAnchor(extend ? anchor ?? (selectedVisible ? selected : null) : null)
    const next = { column: boundedColumn, path, view: model.view.name }
    setSelected(next)
    refs.current.get(cellKey(next.view, next.path, next.column))?.focus()
  }

  const copySelection = (): void => {
    if (!selectedVisible || selected === null || props.onCopy === undefined) return
    const rectangle = range ?? {
      columnEnd: selected.column,
      columnStart: selected.column,
      rowEnd: selectedRow,
      rowStart: selectedRow,
    }
    const values = model.rows.slice(rectangle.rowStart, rectangle.rowEnd + 1).map(row => (
      row.cells.slice(rectangle.columnStart, rectangle.columnEnd + 1).map(cell => cell.value)
    ))
    const text = executableBaseCellRangeTsv(values)
    if (text !== null) props.onCopy({ kind: 'selection', text, view: model.view.name })
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTableCellElement>, row: number, column: number): void => {
    if (event.target !== event.currentTarget || event.altKey) return
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLocaleLowerCase() === 'c') {
        event.preventDefault()
        copySelection()
      }
      return
    }
    let nextRow = row
    let nextColumn = column
    if (event.key === 'ArrowLeft') nextColumn -= 1
    else if (event.key === 'ArrowRight') nextColumn += 1
    else if (event.key === 'ArrowUp') nextRow -= 1
    else if (event.key === 'ArrowDown') nextRow += 1
    else if (event.key === 'Home') nextColumn = 0
    else if (event.key === 'End') nextColumn = model.columns.length - 1
    else if (event.key === 'Tab') {
      const flat = row * model.columns.length + column + (event.shiftKey ? -1 : 1)
      if (flat < 0 || flat >= model.rows.length * model.columns.length) return
      nextRow = Math.floor(flat / model.columns.length)
      nextColumn = flat % model.columns.length
    } else if (event.key === 'Enter') {
      const control = event.currentTarget.querySelector<HTMLElement>('input, button, select, textarea')
      if (control === null) return
      event.preventDefault()
      control.focus()
      return
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setSelected(null)
      setAnchor(null)
      event.currentTarget.blur()
      return
    } else return
    event.preventDefault()
    focusCell(nextRow, nextColumn, event.shiftKey && event.key.startsWith('Arrow'))
  }

  return (
    <div className="overflow-auto">
      <table aria-label={`${model.view.name} Results`} className="w-full border-collapse text-sm" role="grid">
        <thead>
          <tr>
            {model.columns.map(column => <th className="border border-[var(--tt-border)] p-2 text-left" key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, rowIndex) => (
            <tr key={row.path}>
              {row.cells.map((cell, columnIndex) => {
                const active = selectedVisible && selected?.path === row.path && selected.column === columnIndex
                const inRange = selectedVisible && (range === null
                  ? active
                  : rowIndex >= range.rowStart && rowIndex <= range.rowEnd && columnIndex >= range.columnStart && columnIndex <= range.columnEnd)
                return (
                  <td
                    aria-selected={inRange ? 'true' : undefined}
                    className={`border border-[var(--tt-border)] px-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)] data-[selected=true]:bg-[var(--tt-selected)] ${model.view.rowHeight === 'tall' ? 'py-4' : model.view.rowHeight === 'medium' ? 'py-2' : 'py-1'}`}
                    data-selected={inRange ? 'true' : undefined}
                    key={cell.column}
                    ref={element => {
                      const key = cellKey(model.view.name, row.path, columnIndex)
                      if (element === null) refs.current.delete(key)
                      else refs.current.set(key, element)
                    }}
                    role="gridcell"
                    tabIndex={active || (!selectedVisible && rowIndex === 0 && columnIndex === 0) ? 0 : -1}
                    onClick={event => {
                      setAnchor(event.shiftKey ? anchor ?? (selectedVisible ? selected : null) : null)
                      setSelected({ column: columnIndex, path: row.path, view: model.view.name })
                      if (event.target === event.currentTarget) event.currentTarget.focus()
                    }}
                    onFocus={() => setSelected({ column: columnIndex, path: row.path, view: model.view.name })}
                    onKeyDown={event => handleKeyDown(event, rowIndex, columnIndex)}
                  >
                    <EditableCell cell={cell} row={row} onEdit={props.onEdit} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Controlled browser-only seam for bounded executable Base views. */
export function ExecutableBaseView(props: ExecutableBaseViewProps): ReactNode {
  const [sortProperty, setSortProperty] = useState('file.name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [filterProperty, setFilterProperty] = useState('file.name')
  const [filterValue, setFilterValue] = useState('')
  const [filterOperator, setFilterOperator] = useState('==')
  const [viewName, setViewName] = useState('')
  const [viewPickerOpen, setViewPickerOpen] = useState(false)
  const [viewQuery, setViewQuery] = useState('')
  const [showAddView, setShowAddView] = useState(false)
  const [configuringView, setConfiguringView] = useState<string | null>(null)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [resultMenuOpen, setResultMenuOpen] = useState(false)
  const [limitValue, setLimitValue] = useState('')
  const findRef = useRef<HTMLInputElement>(null)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const viewTriggerRef = useRef<HTMLButtonElement>(null)
  const [renameName, setRenameName] = useState('')
  const [viewType, setViewType] = useState<'table' | 'list' | 'cards' | 'map'>('table')
  const [authoringError, setAuthoringError] = useState('')
  const savingRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const document = useMemo(() => parseExecutableBase(props.source), [props.source])
  const selectedName = document.status === 'ready'
    ? document.views.find(view => view.name === props.activeView)?.name ?? document.views[0]?.name ?? ''
    : ''
  const search = props.searches?.[selectedName] ?? ''
  const model = useMemo(() => document.status === 'ready'
    ? createBaseViewModel(document, props.files, selectedName, search, props.baseFile)
    : document, [document, props.files, selectedName, search, props.baseFile])
  const configured = document.status === 'ready' ? document.views.find(view => view.name === configuringView) : undefined
  useEffect(() => { if (findOpen) findRef.current?.focus() }, [findOpen])

  if (model.status !== 'ready') return <p role="alert">{model.reason}</p>
  const blocked = model.unsupported.length > 0
  const tsv = blocked ? null : executableBaseViewTsv(model)
  const csv = blocked ? null : executableBaseViewCsv(model)
  const properties = useMemo(() => [...new Set([
    'file.name', 'file.path', 'file.folder', 'file.mtime', 'file.size',
    ...model.columns.map(column => column.key),
    ...props.files.flatMap(file => parseFrontmatterProperties(file.source).map(property => `note.${property.key}`)),
  ])].filter(key => /^[\w.-]+$/u.test(key)).slice(0, 256), [model.columns, props.files])
  const commit = async (next: string | null): Promise<boolean> => {
    if (savingRef.current) return false
    if (next === null || props.onSourceChange === undefined) { setAuthoringError('This Base change is unavailable. Open Base Source to edit it.'); return false }
    // ponytail: one Base source write at a time; queue edits only if simultaneous authoring becomes necessary.
    savingRef.current = true
    setSaving(true)
    try {
      if (!await props.onSourceChange(props.source, next)) { setAuthoringError('The Base changed before it could be saved. Review its source and retry.'); return false }
      setAuthoringError('')
      return true
    } catch { setAuthoringError('The Base could not be saved. Review its source before retrying.'); return false }
    finally { savingRef.current = false; setSaving(false) }
  }
  const saveConfiguredName = (): void => {
    if (configured === undefined || renameName === configured.name) return
    void commit(setBaseViewField(props.source, configured.name, 'name', renameName)).then(saved => {
      if (saved) { setConfiguringView(current => current === configured.name ? renameName : current); props.onActiveViewChange?.(renameName) }
    })
  }
  const menuClass = 'z-[1002] w-64 rounded-lg border border-border bg-surface-muted p-3 text-foreground shadow-lg'
  const ViewIcon = { table: Table2, list: List, cards: LayoutGrid, 'map-label': MapPin }[model.kind]
  const LayoutIcon = layoutIcons[configured?.type ?? 'table']
  return (
    <section aria-label="Executable Base" className="flex min-h-0 flex-col overflow-auto p-4">
      <header aria-label="Base View Controls" role="toolbar" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-2">
        <Popover open={viewPickerOpen} onOpenChange={open => { setViewPickerOpen(open); if (!open) { setViewQuery(''); setShowAddView(false); setConfiguringView(null); setLayoutPickerOpen(false) } }}>
          <PopoverTrigger asChild>
            <Button unstyled ref={viewTriggerRef} id="tocktutor-base-view" type="button" aria-label="Base View" className="box-border flex h-7 max-w-36 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-2 text-sm text-foreground hover:bg-muted outline-none focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]">
              <ViewIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{model.view.name}</span>
              <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent unstyled align="start" sideOffset={2} className={`z-[1002] box-border flex flex-col gap-0 rounded-lg border border-border bg-surface-muted p-1 text-sm text-foreground shadow-lg outline-none ${configured === undefined && !showAddView ? 'w-64' : 'w-72'}`}>
            {configured !== undefined ? (
              <div className="flex flex-col gap-2 p-1">
                <div className="flex items-center gap-1">
                  <Button unstyled type="button" aria-label="Back to Views" className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onPointerDown={event => event.preventDefault()} onClick={() => { setConfiguringView(null); saveConfiguredName() }}><ChevronLeft aria-hidden="true" className="size-4" /></Button>
                  <h3 className="m-0 flex-1 text-sm font-medium">Configure View</h3>
                  <Button unstyled type="button" aria-label="Close Configure View" className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onPointerDown={event => event.preventDefault()} onClick={() => { setViewPickerOpen(false); setConfiguringView(null); saveConfiguredName(); viewTriggerRef.current?.focus() }}><X aria-hidden="true" className="size-4" /></Button>
                </div>
                <Input unstyled aria-label="View Name" className="box-border h-8 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={!props.onSourceChange || saving} value={renameName} onChange={event => setRenameName(event.currentTarget.value)} onBlur={saveConfiguredName} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
                <Field className="gap-1">
                  <FieldLabel id="base-configure-layout-label" htmlFor="base-configure-layout">Layout</FieldLabel>
                  <Popover open={layoutPickerOpen} onOpenChange={setLayoutPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button unstyled id="base-configure-layout" type="button" aria-labelledby="base-configure-layout-label base-configure-layout-value" disabled={!props.onSourceChange || saving} className={configureChoiceClass}>
                        <LayoutIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                        <span id="base-configure-layout-value" className="min-w-0 flex-1 truncate">{readableKind(configured.type)}</span>
                        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent unstyled align="start" sideOffset={2} className="z-[1003] box-border w-[var(--radix-popover-trigger-width)] rounded-lg border border-border bg-surface p-1 text-sm text-foreground shadow-lg outline-none">
                      <Command unstyled className="flex min-h-0 flex-col" label="Search Layouts">
                        <div className="flex h-8 items-center gap-1 border-b border-border px-2">
                          <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                          <CommandInput unstyled placeholder="Search..." className="h-7 min-w-0 flex-1 border-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]" />
                        </div>
                        <CommandList className="max-h-56"><CommandEmpty className="py-2 text-center text-xs text-muted-foreground">No layouts found.</CommandEmpty>
                          <CommandGroup unstyled className="box-border w-full py-1">
                            {(['table', 'cards', 'list', 'map'] as const).map(kind => {
                              const Icon = layoutIcons[kind]
                              return <CommandItem unstyled key={kind} value={readableKind(kind)} className="box-border flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-foreground outline-none data-[current=true]:bg-[var(--dsw-alias-interactive-bg-hover)] data-[selected=true]:bg-[var(--dsw-alias-interactive-bg-hover)] focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]" data-current={kind === configured.type ? 'true' : undefined} aria-current={kind === configured.type ? 'true' : undefined} onSelect={() => { setLayoutPickerOpen(false); if (kind !== configured.type) void commit(setBaseViewField(props.source, configured.name, 'type', kind)) }}><Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{readableKind(kind)}</span>{kind === configured.type && <Check aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}</CommandItem>
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </Field>
                {configured.type === 'table' && (
                  <Field className="gap-1">
                    <FieldLabel id="base-configure-row-height-label" htmlFor="base-configure-row-height">Row Height</FieldLabel>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button unstyled id="base-configure-row-height" type="button" aria-labelledby="base-configure-row-height-label base-configure-row-height-value" disabled={!props.onSourceChange || saving} className={configureChoiceClass}>
                          <span id="base-configure-row-height-value" className="min-w-0 flex-1 truncate">{readableKind(configured.rowHeight)}</span>
                          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent unstyled align="start" sideOffset={2} className="z-[1003] box-border w-[var(--radix-dropdown-menu-trigger-width)] rounded-lg border border-border bg-surface p-1 text-sm text-foreground shadow-lg">
                        <DropdownMenuRadioGroup value={configured.rowHeight} onValueChange={height => { if (height !== configured.rowHeight) void commit(setBaseViewField(props.source, configured.name, 'rowHeight', height)) }}>
                          {(['short', 'medium', 'tall'] as const).map(height => <DropdownMenuRadioItem key={height} value={height} className="box-border flex h-8 w-full cursor-pointer items-center rounded-md px-2 text-sm text-foreground data-[highlighted]:bg-[var(--dsw-alias-interactive-bg-hover)] data-[state=checked]:bg-[var(--dsw-alias-interactive-bg-hover)]">{readableKind(height)}</DropdownMenuRadioItem>)}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Field>
                )}
                {authoringError && <p role="alert" className="m-0 text-xs text-destructive">{authoringError}</p>}
              </div>
            ) : showAddView ? (
              <div className="p-2">
                <Field className="gap-1"><FieldLabel htmlFor="base-new-view-name">View Name</FieldLabel><Input id="base-new-view-name" value={viewName} onChange={event => setViewName(event.currentTarget.value)} /></Field>
                <Field className="mt-2 gap-1"><FieldLabel htmlFor="base-new-view-kind">View Type</FieldLabel><NativeSelect id="base-new-view-kind" value={viewType} onChange={event => setViewType(event.currentTarget.value as typeof viewType)}>{(['table', 'list', 'cards', 'map'] as const).map(kind => <NativeSelectOption key={kind} value={kind}>{readableKind(kind)}</NativeSelectOption>)}</NativeSelect></Field>
                <div className="mt-3 flex gap-1"><Button disabled={!props.onSourceChange} type="button" onClick={() => { void commit(appendBaseView(props.source, viewType, viewName)).then(saved => { if (saved) setShowAddView(false) }) }}>Create View</Button><Button variant="ghost" type="button" onClick={() => setShowAddView(false)}>Cancel</Button></div>
              </div>
            ) : (
              <>
                <Command unstyled className="flex min-h-0 flex-col" label="Search Views">
                  <div className="flex h-9 items-center gap-1 border-b border-border px-2">
                    <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                    <CommandInput unstyled placeholder="Search..." value={viewQuery} onValueChange={setViewQuery} className="h-7 min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]" />
                  </div>
                  <CommandList className="max-h-56">
                    <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">No views found.</CommandEmpty>
                    <CommandGroup unstyled className="box-border w-full py-1">
                      {model.views.map(view => {
                        const Icon = { table: Table2, list: List, cards: LayoutGrid, 'map-label': MapPin }[view.kind]
                        return <CommandItem unstyled key={view.name} value={view.name} aria-current={view.name === model.view.name ? 'true' : undefined} className="box-border flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-foreground outline-none data-[current=true]:bg-[var(--dsw-alias-interactive-bg-hover)] data-[selected=true]:bg-[var(--dsw-alias-interactive-bg-hover)] focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]" data-current={view.name === model.view.name ? 'true' : undefined} onSelect={() => { if (view.name === model.view.name) { setRenameName(view.name); setViewQuery(''); setConfiguringView(view.name) } else { props.onActiveViewChange?.(view.name); setViewPickerOpen(false); setViewQuery('') } }}><Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{view.name}</span>{view.name === model.view.name && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}</CommandItem>
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
                <Button unstyled type="button" className="flex h-9 w-full cursor-pointer items-center gap-2 border-0 border-t border-border bg-transparent px-2 text-sm text-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover)] focus-visible:shadow-[inset_0_-2px_0_var(--dsw-alias-label-secondary)]" onClick={() => { setViewQuery(''); setShowAddView(true) }}><Plus aria-hidden="true" className="size-4" />Add View</Button>
              </>
            )}
          </PopoverContent>
        </Popover>
        <Popover open={resultMenuOpen} onOpenChange={open => { setResultMenuOpen(open); if (open) setLimitValue(model.view.limit === null ? '' : String(model.view.limit)) }}>
          <PopoverTrigger asChild><Button unstyled type="button" aria-live="polite" className="h-7 cursor-pointer rounded-md border-0 bg-transparent px-1 text-sm tabular-nums text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{resultCount(model.rows.length)}</Button></PopoverTrigger>
          <PopoverContent unstyled align="start" sideOffset={2} className="z-[1002] box-border w-56 rounded-lg border border-border bg-surface-muted p-1 text-foreground shadow-lg outline-none">
            <form className="flex flex-col gap-2 p-1" onSubmit={event => {
              event.preventDefault()
              if (!/^[1-9]\d{0,3}$/u.test(limitValue) || Number(limitValue) > 2_000) return
              void commit(setBaseViewField(props.source, model.view.name, 'limit', limitValue)).then(saved => { if (saved) setResultMenuOpen(false) })
            }}>
              <Label htmlFor="base-result-limit" className="text-sm text-muted-foreground">Limit Number of Results</Label>
              <Input unstyled id="base-result-limit" type="text" required inputMode="numeric" pattern="(?:[1-9][0-9]{0,2}|1[0-9]{3}|2000)" maxLength={4} placeholder="e.g. 10" value={limitValue} disabled={!props.onSourceChange || saving} onChange={event => setLimitValue(event.currentTarget.value)} className="box-border h-7 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50" />
            </form>
            <div>
              <Button unstyled type="button" disabled={model.view.limit === null || !props.onSourceChange || saving} className="box-border flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { void commit(setBaseViewField(props.source, model.view.name, 'limit', '')).then(saved => { if (saved) setResultMenuOpen(false) }) }}><RotateCcw aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />Show All</Button>
              <Button unstyled type="button" disabled={tsv === null || props.onCopy === undefined} className="box-border flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { if (tsv !== null) props.onCopy?.({ kind: 'results', text: tsv, view: model.view.name }); setResultMenuOpen(false) }}><Copy aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />Copy to Clipboard</Button>
              <Button unstyled type="button" disabled={csv === null || props.onExport === undefined} className="box-border flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { if (csv !== null) props.onExport?.({ filename: executableBaseCsvFilename(model.view.name), text: csv, view: model.view.name }); setResultMenuOpen(false) }}><FileDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />Export CSV…</Button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex flex-wrap items-center gap-1">
        <Popover><PopoverTrigger asChild><Button size="sm" variant="ghost" className="bg-transparent hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]!" type="button"><ArrowDownUp aria-hidden="true" />Sort</Button></PopoverTrigger><PopoverContent unstyled align="end" className={menuClass}>
          <Field className="gap-1"><FieldLabel htmlFor="base-sort-property">Sort Property</FieldLabel><NativeSelect id="base-sort-property" value={sortProperty} onChange={event => setSortProperty(event.currentTarget.value)}>{properties.map(key => <NativeSelectOption key={key} value={key}>{key}</NativeSelectOption>)}</NativeSelect></Field>
          <Field className="mt-2 gap-1"><FieldLabel htmlFor="base-sort-direction">Sort Direction</FieldLabel><NativeSelect id="base-sort-direction" value={sortDirection} onChange={event => setSortDirection(event.currentTarget.value)}><NativeSelectOption value="asc">Ascending</NativeSelectOption><NativeSelectOption value="desc">Descending</NativeSelectOption></NativeSelect></Field>
          <p className="text-xs text-muted-foreground">{model.view.sort.length > 0 ? model.view.sort.join(', ') : 'No sort applied.'}</p>
          <Button disabled={!props.onSourceChange} type="button" onClick={() => { void commit(setBaseViewField(props.source, model.view.name, 'sort', [`${sortProperty} ${sortDirection}`])) }}>Apply Sort</Button>
          <Button variant="ghost" disabled={!props.onSourceChange || model.view.sort.length === 0} type="button" onClick={() => { void commit(setBaseViewField(props.source, model.view.name, 'sort', [])) }}>Clear Sort</Button>
        </PopoverContent></Popover>
        <Popover><PopoverTrigger asChild><Button size="sm" variant="ghost" className="bg-transparent hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]!" type="button"><ListFilter aria-hidden="true" />Filter</Button></PopoverTrigger><PopoverContent unstyled align="end" className={menuClass}>
          <Field className="gap-1"><FieldLabel htmlFor="base-filter-property">Filter Property</FieldLabel><NativeSelect id="base-filter-property" value={filterProperty} onChange={event => setFilterProperty(event.currentTarget.value)}>{properties.map(key => <NativeSelectOption key={key} value={key}>{key}</NativeSelectOption>)}</NativeSelect></Field>
          <Field className="mt-2 gap-1"><FieldLabel htmlFor="base-filter-operator">Filter Operator</FieldLabel><NativeSelect id="base-filter-operator" value={filterOperator} onChange={event => setFilterOperator(event.currentTarget.value)}><NativeSelectOption value="==">Equals</NativeSelectOption><NativeSelectOption value="!=">Does Not Equal</NativeSelectOption></NativeSelect></Field>
          <Field className="mt-2 gap-1"><FieldLabel htmlFor="base-filter-value">Filter Value</FieldLabel><Input id="base-filter-value" maxLength={200} value={filterValue} onChange={event => setFilterValue(event.currentTarget.value)} /></Field>
          <p className="text-xs text-muted-foreground">{model.view.filters.length > 0 ? 'Applying replaces this view’s current filter.' : 'No view filter applied.'}</p>
          <Button disabled={!props.onSourceChange || filterValue === ''} type="button" onClick={() => { void commit(setBaseViewField(props.source, model.view.name, 'filters', `${filterProperty} ${filterOperator} ${JSON.stringify(filterValue)}`)) }}>Apply Filter</Button>
          <Button variant="ghost" disabled={!props.onSourceChange || model.view.filters.length === 0} type="button" onClick={() => { void commit(setBaseViewField(props.source, model.view.name, 'filters', '')) }}>Clear Filter</Button>
        </PopoverContent></Popover>
        <Popover><PopoverTrigger asChild><Button size="sm" variant="ghost" className="bg-transparent hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]!" type="button"><List aria-hidden="true" />Properties</Button></PopoverTrigger><PopoverContent unstyled align="end" className={menuClass}>
          <p className="m-0 mb-2 text-sm">Visible Properties</p>
          <div className="max-h-56 overflow-auto">{properties.map(key => <Label key={key} className="flex min-h-8 items-center gap-2 text-sm"><Checkbox disabled={!props.onSourceChange || key === 'file.name'} checked={model.columns.some(column => column.key === key)} onCheckedChange={checked => { const columns = model.columns.map(column => column.key).filter(column => column !== key); if (checked === true) columns.push(key); if (!columns.includes('file.name')) columns.unshift('file.name'); void commit(setBaseViewField(props.source, model.view.name, 'order', columns)) }} /><span>{key}</span></Label>)}</div>
        </PopoverContent></Popover>
        <Button ref={searchTriggerRef} size="sm" variant="ghost" type="button" aria-controls="tocktutor-base-find" aria-expanded={findOpen} className={findOpen ? 'bg-transparent hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]! text-[var(--dsw-specific-markdown-accent)]!' : 'bg-transparent hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]!'} onClick={() => { if (findOpen) props.onSearchChange?.(model.view.name, ''); setFindOpen(!findOpen) }}><Search aria-hidden="true" />Search</Button>
        <Button size="sm" variant="ghost" className="bg-transparent hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]!" disabled={!props.onNewNote} type="button" onClick={props.onNewNote}><Plus aria-hidden="true" />New</Button>
        </div>
      </header>
      {authoringError && configured === undefined && <p role="alert" className="m-0 text-sm text-destructive">{authoringError}</p>}
      {findOpen && <div id="tocktutor-base-find" role="search" aria-label="Find in Base" className="flex h-9 w-full min-w-0 items-center gap-1 border-b border-border px-1 text-muted-foreground focus-within:border-ring"><Search aria-hidden="true" className="size-4 shrink-0" /><Input unstyled ref={findRef} aria-label="Find in Base" className="box-border h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground" maxLength={1_000} placeholder="Find..." type="search" value={model.search} onChange={event => props.onSearchChange?.(model.view.name, event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onSearchChange?.(model.view.name, ''); setFindOpen(false); searchTriggerRef.current?.focus() } }} /></div>}
      {blocked ? (
        <p role="alert">Unsupported Base expression: {model.unsupported.map(entry => entry.expression).join(', ')}</p>
      ) : model.rows.length === 0 ? (
        <p>{model.search ? 'No notes match this search.' : 'No notes match this view.'}</p>
      ) : model.kind === 'table' ? (
        <ExecutableTable model={model} onCopy={props.onCopy} onEdit={props.onEdit} />
      ) : (
        <ReadonlyLayouts model={model} />
      )}
      <SummaryList model={model} />
    </section>
  )
}
