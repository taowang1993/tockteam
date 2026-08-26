import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'


import { ExecutableBaseView } from '../src/base-executable-view.tsx'
import type { BaseHydratedFile } from '../src/base-query.ts'

afterEach(cleanup)

const revision = (character: string): string => `file:${character.repeat(64)}`
const source = `formulas:
  doubled: 'note.score * 2'
properties:
  note.status:
    displayName: Status
views:
  - type: table
    name: Ranked
    order: [file.name, note.status, formula.doubled]
    sort: [note.score desc]
    summaries: [sum(note.score)]
  - type: list
    name: Tasks
    order: [file.name, note.status]
  - type: cards
    name: Cards
    order: [file.name, note.status]
  - type: map
    name: Places
    coordinates: note.location
    order: [file.name, note.location]
`

const files: BaseHydratedFile[] = [
  {
    path: 'Alpha.md',
    revision: revision('a'),
    source: `---\nstatus: '=ready'\nscore: 2\nlocation: '51.5, -0.1'\n---\n# Alpha\n`,
  },
  {
    path: 'Beta.md',
    revision: revision('b'),
    source: `---\nstatus: done\nscore: 4\nlocation: '40.7, -74'\n---\n# Beta\n`,
  },
]

function ControlledBase(props: {
  onCopy?: (request: { kind: 'results' | 'selection'; text: string; view: string }) => void
  onEdit?: Parameters<typeof ExecutableBaseView>[0]['onEdit']
  onExport?: Parameters<typeof ExecutableBaseView>[0]['onExport']
}) {
  const [activeView, setActiveView] = useState('Ranked')
  const [searches, setSearches] = useState<Record<string, string>>({})
  return (
    <ExecutableBaseView
      activeView={activeView}
      files={files}
      onActiveViewChange={setActiveView}
      onCopy={props.onCopy}
      onEdit={props.onEdit}
      onExport={props.onExport}
      onSearchChange={(view, search) => setSearches(current => ({ ...current, [view]: search }))}
      searches={searches}
      source={source}
    />
  )
}

describe('ExecutableBaseView', () => {
  it('keeps current-view search controlled and renders table, list, cards, and map labels', () => {
    render(<ControlledBase />)

    expect(screen.getByRole('grid', { name: 'Ranked Results' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Ranked' }), { target: { value: 'alpha' } })
    expect(screen.getByText('1 Result')).toBeTruthy()
    expect(screen.queryByText('Beta')).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Base View' }), { target: { value: 'Tasks' } })
    expect(screen.getByRole('list', { name: 'Tasks Results' })).toBeTruthy()
    expect(screen.getByText('2 Results')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Base View' }), { target: { value: 'Cards' } })
    expect(screen.getByRole('list', { name: 'Cards Results' })).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Base View' }), { target: { value: 'Places' } })
    expect(screen.getByRole('list', { name: 'Places Map Labels' })).toBeTruthy()
    expect(screen.getByText('51.5, -0.1')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Base View' }), { target: { value: 'Ranked' } })
    expect((screen.getByRole('searchbox', { name: 'Search Ranked' }) as HTMLInputElement).value).toBe('alpha')
  })

  it('copies and exports the exact searched row set with spreadsheet-safe values', () => {
    const onCopy = vi.fn()
    const onExport = vi.fn()
    render(<ControlledBase onCopy={onCopy} onExport={onExport} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Ranked' }), { target: { value: 'alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Visible Results' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export Visible CSV' }))

    expect(onCopy).toHaveBeenCalledWith({
      kind: 'results',
      text: "file.name\tStatus\tformula.doubled\nAlpha\t'=ready\t4",
      view: 'Ranked',
    })
    expect(onExport).toHaveBeenCalledWith({
      filename: 'Ranked.csv',
      text: "file.name,Status,formula.doubled\r\nAlpha,'=ready,4",
      view: 'Ranked',
    })
    expect(screen.getByText('sum(note.score):')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('supports roving keyboard cells, rectangular selection, and header-free TSV copy', () => {
    const onCopy = vi.fn()
    render(<ControlledBase onCopy={onCopy} />)
    const grid = screen.getByRole('grid', { name: 'Ranked Results' })
    const cells = within(grid).getAllByRole('gridcell')

    cells[0]?.focus()
    fireEvent.keyDown(cells[0]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cells[1])
    fireEvent.keyDown(cells[1]!, { key: 'ArrowDown', shiftKey: true })
    expect(document.activeElement).toBe(cells[4])
    fireEvent.keyDown(cells[4]!, { ctrlKey: true, key: 'c' })

    expect(onCopy).toHaveBeenLastCalledWith({ kind: 'selection', text: "done\n'=ready", view: 'Ranked' })
    expect(cells[1]?.getAttribute('aria-selected')).toBe('true')
    expect(cells[4]?.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(cells[4]!, { key: 'Escape' })
    expect(cells[4]?.getAttribute('aria-selected')).toBeNull()
  })

  it('emits identity-bound frontmatter edits while keeping formula cells read-only', () => {
    const onEdit = vi.fn()
    render(<ControlledBase onEdit={onEdit} />)
    const input = screen.getByRole('textbox', { name: 'Edit Status for Beta.md' })
    fireEvent.change(input, { target: { value: 'review' } })
    fireEvent.blur(input)

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0]?.[0]).toMatchObject({
      expectedPropertyIdentity: '["status","text","done"]',
      expectedRevision: revision('b'),
      operation: 'base-frontmatter',
      path: 'Beta.md',
      previousSource: files[1]?.source,
      property: 'status',
      value: 'review',
    })
    expect(screen.queryByRole('textbox', { name: /formula/u })).toBeNull()
  })

  it('renders unsupported executable expressions as an inert alert', () => {
    render(
      <ExecutableBaseView
        activeView="Unsafe"
        files={files}
        searches={{}}
        source={`views:\n  - type: table\n    name: Unsafe\n    filters: 'fetch("https://example.com")'\n`}
      />,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/Unsupported Base expression/u)
    expect(screen.queryByRole('grid')).toBeNull()
  })
})
