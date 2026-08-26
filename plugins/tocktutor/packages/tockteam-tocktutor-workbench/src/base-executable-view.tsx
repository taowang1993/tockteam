import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

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

export interface ExecutableBaseViewProps {
  activeView?: string | null
  baseFile?: { createdAt?: number; modifiedAt?: number; relativePath: string; sizeBytes?: number }
  files: readonly BaseHydratedFile[]
  onActiveViewChange?: (view: string) => void
  onCopy?: (request: ExecutableBaseCopyRequest) => void
  onEdit?: (request: ExecutableBaseFrontmatterEditRequest) => void
  onExport?: (request: ExecutableBaseExportRequest) => void
  onSearchChange?: (view: string, search: string) => void
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
  onEdit?: ((request: ExecutableBaseFrontmatterEditRequest) => void) | undefined
  row: ExecutableBaseRowModel
}): ReactNode {
  const { cell, row } = props
  if (!cell.editable || cell.inputType === null || props.onEdit === undefined) return cell.text
  const label = `Edit ${cell.label} for ${row.path}`
  const emit = (rawValue: string): void => {
    const request = createExecutableBaseFrontmatterEdit({ path: row.path, revision: row.revision, source: row.source }, cell.column, rawValue)
    if (request !== null) props.onEdit?.(request)
  }
  if (cell.inputType === 'checkbox') {
    return (
      <input
        aria-label={label}
        checked={cell.value === true}
        type="checkbox"
        onChange={event => emit(event.currentTarget.checked ? 'true' : 'false')}
      />
    )
  }
  return (
    <input
      aria-label={label}
      className="min-w-24 rounded border border-[var(--tt-border)] bg-transparent px-1.5 py-1"
      defaultValue={cell.text}
      key={`${row.revision}:${cell.column}:${cell.text}`}
      type={cell.inputType}
      onBlur={event => {
        if (event.currentTarget.value !== cell.text) emit(event.currentTarget.value)
      }}
    />
  )
}

function ExecutableTable(props: {
  model: Extract<ExecutableBaseViewModel, { status: 'ready' }>
  onCopy?: ((request: ExecutableBaseCopyRequest) => void) | undefined
  onEdit?: ((request: ExecutableBaseFrontmatterEditRequest) => void) | undefined
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
                    className="border border-[var(--tt-border)] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)] data-[selected=true]:bg-[var(--tt-selected)]"
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
  const document = useMemo(() => parseExecutableBase(props.source), [props.source])
  const selectedName = document.status === 'ready'
    ? document.views.find(view => view.name === props.activeView)?.name ?? document.views[0]?.name ?? ''
    : ''
  const search = props.searches?.[selectedName] ?? ''
  const model = useMemo(() => document.status === 'ready'
    ? createBaseViewModel(document, props.files, selectedName, search, props.baseFile)
    : document, [document, props.files, selectedName, search, props.baseFile])

  if (model.status !== 'ready') return <p role="alert">{model.reason}</p>
  const blocked = model.unsupported.length > 0
  const tsv = blocked ? null : executableBaseViewTsv(model)
  const csv = blocked ? null : executableBaseViewCsv(model)
  return (
    <section aria-label="Executable Base" className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
      <header className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium">
          Base View
          <select
            aria-label="Base View"
            className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1.5 text-sm"
            value={model.view.name}
            onChange={event => props.onActiveViewChange?.(event.currentTarget.value)}
          >
            {model.views.map(view => <option key={view.name} value={view.name}>{view.name} — {readableKind(view.kind)}</option>)}
          </select>
        </label>
        <label className="grid min-w-48 flex-1 gap-1 text-xs font-medium">
          Search This View
          <input
            aria-label={`Search ${model.view.name}`}
            className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1.5 text-sm"
            maxLength={1_000}
            type="search"
            value={model.search}
            onChange={event => props.onSearchChange?.(model.view.name, event.currentTarget.value)}
          />
        </label>
        <p aria-live="polite" className="m-0 text-sm text-[var(--tt-muted)]">{resultCount(model.rows.length)}</p>
        <button
          disabled={tsv === null || props.onCopy === undefined}
          type="button"
          onClick={() => {
            if (tsv !== null) props.onCopy?.({ kind: 'results', text: tsv, view: model.view.name })
          }}
        >
          Copy Visible Results
        </button>
        <button
          disabled={csv === null || props.onExport === undefined}
          type="button"
          onClick={() => {
            if (csv !== null) props.onExport?.({ filename: executableBaseCsvFilename(model.view.name), text: csv, view: model.view.name })
          }}
        >
          Export Visible CSV
        </button>
      </header>
      {blocked ? (
        <p role="alert">Unsupported Base expression: {model.unsupported.map(entry => entry.expression).join(', ')}</p>
      ) : model.rows.length === 0 ? (
        <p>No notes match this view.</p>
      ) : model.kind === 'table' ? (
        <ExecutableTable model={model} onCopy={props.onCopy} onEdit={props.onEdit} />
      ) : (
        <ReadonlyLayouts model={model} />
      )}
      <SummaryList model={model} />
    </section>
  )
}
