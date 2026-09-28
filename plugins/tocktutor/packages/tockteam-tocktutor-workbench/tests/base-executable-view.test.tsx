import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  files?: readonly BaseHydratedFile[]
  onCopy?: (request: { kind: 'results' | 'selection'; text: string; view: string }) => void
  onEdit?: Parameters<typeof ExecutableBaseView>[0]['onEdit']
  onExport?: Parameters<typeof ExecutableBaseView>[0]['onExport']
}) {
  const [activeView, setActiveView] = useState('Ranked')
  const [searches, setSearches] = useState<Record<string, string>>({})
  return (
    <ExecutableBaseView
      activeView={activeView}
      files={props.files ?? files}
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
  it('opens the full-width selected row into a saved Configure View form', async () => {
    function EditableBase() {
      const [baseSource, setBaseSource] = useState(source)
      const [selected, setSelected] = useState('Ranked')
      return <ExecutableBaseView source={baseSource} files={files} activeView={selected} onActiveViewChange={setSelected} onSourceChange={async (previous, next) => {
        if (previous !== baseSource) return false
        setBaseSource(next)
        return true
      }} />
    }
    render(<EditableBase />)
    const count = screen.getByRole('button', { name: '2 Results' })
    expect(count.className).toContain('bg-transparent')
    expect(screen.getByRole('columnheader', { name: 'File Name' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Base View' }))
    expect(screen.getByRole('dialog').className).toContain('w-64')
    const row = screen.getByRole('option', { name: 'Ranked' })
    expect(row.className).toContain('w-full')
    fireEvent.click(row)
    expect(screen.getByRole('heading', { name: 'Configure View' })).toBeTruthy()
    expect(screen.getByRole('dialog').className).toContain('w-72')
    const rowHeight = screen.getByRole('button', { name: 'Row Height Short' })
    expect(rowHeight.className).toContain('w-full')
    expect(screen.queryByRole('combobox', { name: 'Row Height' })).toBeNull()
    fireEvent.pointerDown(rowHeight, { button: 0, ctrlKey: false })
    expect(screen.getByRole('menuitemradio', { name: 'Short' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Tall' }))
    await waitFor(() => expect(screen.getByRole('gridcell', { name: 'Alpha' }).className).toContain('py-4'))
    const tallHeight = screen.getByRole('button', { name: 'Row Height Tall' })
    fireEvent.pointerDown(tallHeight, { button: 0, ctrlKey: false })
    expect(screen.getByRole('menuitemradio', { name: 'Tall' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menuitemradio', { name: 'Tall' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(tallHeight))
    const layout = screen.getByRole('button', { name: 'Layout Table' })
    expect(layout.className).toContain('w-full')
    fireEvent.click(layout)
    const searchLayouts = screen.getByRole('combobox', { name: 'Search Layouts' })
    expect(screen.getByRole('option', { name: 'Table' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('option', { name: 'Cards' }).querySelector('svg')).toBeTruthy()
    fireEvent.keyDown(searchLayouts, { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Search Layouts' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Configure View' })).toBeTruthy()
    fireEvent.click(layout)
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Layouts' }), { target: { value: 'list' } })
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Cards' })).toBeNull())
    fireEvent.click(screen.getByRole('option', { name: 'List' }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Ranked Results' })).toBeTruthy())
    const name = screen.getByRole('textbox', { name: 'View Name' })
    fireEvent.change(name, { target: { value: 'Renamed' } })
    fireEvent.blur(name)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Base View' }).textContent).toContain('Renamed'))
  })

  it('blocks another Configure View write until the first source save settles', async () => {
    let finish!: (saved: boolean) => void
    const pending = new Promise<boolean>(resolve => { finish = resolve })
    const onSourceChange = vi.fn(async () => await pending)
    render(<ExecutableBaseView source={source} files={files} onSourceChange={onSourceChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Base View' }))
    fireEvent.click(screen.getByRole('option', { name: 'Ranked' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Row Height Short' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Tall' }))
    await waitFor(() => expect(onSourceChange).toHaveBeenCalledTimes(1))
    expect((screen.getByRole('button', { name: 'Row Height Short' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Layout Table' }) as HTMLButtonElement).disabled).toBe(true)
    finish(true)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Layout Table' }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('reopens the view list after closing Configure View during a name save', async () => {
    let finish!: (saved: boolean) => void
    const pending = new Promise<boolean>(resolve => { finish = resolve })
    function EditableBase() {
      const [baseSource, setBaseSource] = useState(source)
      const [selected, setSelected] = useState('Ranked')
      return <ExecutableBaseView source={baseSource} files={files} activeView={selected} onActiveViewChange={setSelected} onSourceChange={async (previous, next) => {
        if (previous !== baseSource) return false
        if (!await pending) return false
        setBaseSource(next)
        return true
      }} />
    }
    render(<EditableBase />)
    fireEvent.click(screen.getByRole('button', { name: 'Base View' }))
    fireEvent.click(screen.getByRole('option', { name: 'Ranked' }))
    const name = screen.getByRole('textbox', { name: 'View Name' })
    fireEvent.change(name, { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close Configure View' }))
    finish(true)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Base View' }).textContent).toContain('Renamed'))
    fireEvent.click(screen.getByRole('button', { name: 'Base View' }))
    expect(screen.getByRole('combobox', { name: 'Search Views' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Configure View' })).toBeNull()
  })

  it('opens an inline Find strip that filters rows and clears on Escape', async () => {
    render(<ControlledBase />)
    const search = screen.getByRole('button', { name: 'Search', exact: true })
    expect(screen.queryByRole('search', { name: 'Find in Base' })).toBeNull()
    fireEvent.click(search)
    expect(search.className).toContain('text-[var(--dsw-specific-markdown-accent)]!')
    expect(search.className).toContain('hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]!')
    const strip = screen.getByRole('search', { name: 'Find in Base' })
    expect(strip.className).toContain('w-full')
    const input = within(strip).getByRole('searchbox', { name: 'Find in Base' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: 'alpha' } })
    expect(screen.getByText('1 Result')).toBeTruthy()
    expect(screen.queryByText('Beta')).toBeNull()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('search', { name: 'Find in Base' })).toBeNull()
    expect(search.className).not.toContain('text-[var(--dsw-specific-markdown-accent)]!')
    expect(screen.getByText('2 Results')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(search))
  })

  it('opens an unboxed, searchable view menu with Add View and keyboard focus', async () => {
    render(<ControlledBase />)
    const toolbar = screen.getByRole('toolbar', { name: 'Base View Controls' })
    for (const name of ['2 Results', 'Sort', 'Filter', 'Properties']) expect(within(toolbar).getByRole('button', { name })).toBeTruthy()
    const view = within(toolbar).getByRole('button', { name: 'Base View' })
    const search = within(toolbar).getByRole('button', { name: 'Search' })
    expect(view.className).toContain('border-0')
    expect(view.className).toContain('bg-transparent')
    expect(view.className).toContain('focus-visible:shadow-')
    expect(search.getAttribute('aria-expanded')).toBe('false')
    view.focus()
    fireEvent.click(view)
    const viewSearch = screen.getByRole('combobox', { name: 'Search Views' })
    expect(viewSearch.className).toContain('text-sm')
    const panel = screen.getByRole('dialog')
    expect(panel.className).toContain('w-64')
    expect(panel.className).not.toContain('w-72')
    expect(screen.getByRole('option', { name: 'Ranked' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add View' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Views' }), { target: { value: 'Places' } })
    expect(screen.queryByRole('option', { name: 'Tasks' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Places' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Views' }), { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Search Views' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(view))
    expect(within(toolbar).queryByLabelText('More Base Actions')).toBeNull()
    for (const name of ['Sort', 'Filter', 'Properties', 'Search', 'New']) {
      const action = within(toolbar).getByRole('button', { name })
      expect(action.className).toContain('bg-transparent')
      expect(action.className).toContain('hover:bg-[var(--tockteam-shell-chrome,var(--tt-panel))]!')
    }
    expect(within(toolbar).getByRole('button', { name: 'Properties' }).querySelector('path[d="M3 12h.01"]')).toBeTruthy()
  })

  it('offers the Base toolbar and persists a changed sort through the source owner', async () => {
    const changes: string[] = []
    render(<ExecutableBaseView files={files} source={source} onSourceChange={async (_, next) => { changes.push(next); return true }} onNewNote={() => {}} />)
    expect(screen.getByRole('button', { name: 'Sort' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Properties' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort Property' }), { target: { value: 'file.name' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort Direction' }), { target: { value: 'asc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Sort' }))
    await waitFor(() => expect(changes).toHaveLength(1))
    expect(changes[0]).toContain('sort: ["file.name asc"]')
  })

  it('renames the selected view in Base source', async () => {
    const changes: string[] = []
    render(<ExecutableBaseView files={files} source={source} onSourceChange={async (_, next) => { changes.push(next); return true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Base View' }))
    fireEvent.click(screen.getByRole('option', { name: 'Ranked' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'View Name' }), { target: { value: 'Favorites' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'View Name' }))
    await waitFor(() => expect(changes).toHaveLength(1))
    expect(changes[0]).toContain('name: "Favorites"')
  })

  it('uses an Obsidian-style results menu to set and clear a valid number, without a native picker', async () => {
    function EditableBase() {
      const [baseSource, setBaseSource] = useState(source)
      return <ExecutableBaseView files={files} source={baseSource} onSourceChange={async (_, next) => { setBaseSource(next); return true }} />
    }
    render(<EditableBase />)
    const trigger = screen.getByRole('button', { name: '2 Results' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('dialog')
    expect(menu.className).toContain('bg-surface-muted')
    expect(menu.className).not.toContain('bg-popover')
    expect(menu.className).toContain('w-56')
    expect(menu.querySelector('form')?.className).toContain('gap-2')
    expect(menu.querySelector('[class*="border-t"]')).toBeNull()
    expect(within(menu).queryByRole('combobox')).toBeNull()
    const limit = within(menu).getByRole('textbox', { name: 'Limit Number of Results' }) as HTMLInputElement
    expect(within(menu).getByText('Limit Number of Results').className).toContain('text-sm')
    expect(limit.className).toContain('text-sm')
    for (const action of ['Show All', 'Copy to Clipboard', 'Export CSV…']) {
      expect(within(menu).getByRole('button', { name: action }).className).toContain('text-sm')
    }
    expect(within(menu).queryByRole('spinbutton')).toBeNull()
    expect(limit.type).toBe('text')
    expect(limit.inputMode).toBe('numeric')
    expect(limit.placeholder).toBe('e.g. 10')
    expect(limit.value).toBe('')
    for (const invalid of ['0', '2001', '3.5']) {
      fireEvent.change(limit, { target: { value: invalid } })
      fireEvent.submit(limit.closest('form')!)
      expect(screen.getByRole('dialog')).toBeTruthy()
    }
    fireEvent.change(limit, { target: { value: '1' } })
    fireEvent.submit(limit.closest('form')!)
    await waitFor(() => expect(screen.getByRole('button', { name: '1 Result' })).toBeTruthy())
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1 Result' }))
    expect((screen.getByRole('textbox', { name: 'Limit Number of Results' }) as HTMLInputElement).value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Show All' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '2 Results' })).toBeTruthy())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the result limit menu open with an error when a source write fails', async () => {
    render(<ExecutableBaseView files={files} source={source} onSourceChange={async () => false} />)
    fireEvent.click(screen.getByRole('button', { name: '2 Results' }))
    const limit = screen.getByRole('textbox', { name: 'Limit Number of Results' })
    fireEvent.change(limit, { target: { value: '25' } })
    fireEvent.submit(limit.closest('form')!)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('changed before it could be saved'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('saves a filter, visible property and new view in the Base file', async () => {
    function EditableBase() {
      const [baseSource, setBaseSource] = useState(source)
      const [selected, setSelected] = useState('Ranked')
      return <ExecutableBaseView source={baseSource} files={files} activeView={selected} onActiveViewChange={setSelected} onSourceChange={async (previous, next) => {
        if (previous !== baseSource) return false
        setBaseSource(next)
        return true
      }} />
    }
    render(<EditableBase />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter Value' }), { target: { value: 'Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filter' }))
    await waitFor(() => expect(screen.getByText('1 Result')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Properties' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'file.path' }))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'file.path' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Base View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add View' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'View Name' }), { target: { value: 'Gallery' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'View Type' }), { target: { value: 'cards' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create View' }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Gallery' })).toBeTruthy())
  })

  it('keeps current-view search controlled and renders table, list, cards, and map labels', () => {
    render(<ControlledBase />)

    expect(screen.getByRole('grid', { name: 'Ranked Results' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in Base' }), { target: { value: 'alpha' } })
    expect(screen.getByText('1 Result')).toBeTruthy()
    expect(screen.queryByText('Beta')).toBeNull()

    for (const name of ['Tasks', 'Cards', 'Places', 'Ranked']) {
      fireEvent.click(screen.getByRole('button', { name: 'Base View' }))
      fireEvent.click(screen.getByRole('option', { name }))
      if (name === 'Tasks') expect(screen.getByRole('list', { name: 'Tasks Results' })).toBeTruthy()
      if (name === 'Cards') expect(screen.getByRole('list', { name: 'Cards Results' })).toBeTruthy()
      if (name === 'Places') {
        expect(screen.getByRole('list', { name: 'Places Map Labels' })).toBeTruthy()
        expect(screen.getByText('51.5, -0.1')).toBeTruthy()
      }
    }
    expect(screen.getByText('1 Result')).toBeTruthy()
    expect((screen.getByRole('searchbox', { name: 'Find in Base' }) as HTMLInputElement).value).toBe('alpha')
  })

  it('copies and exports the exact searched row set with spreadsheet-safe values', () => {
    const onCopy = vi.fn()
    const onExport = vi.fn()
    render(<ControlledBase onCopy={onCopy} onExport={onExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in Base' }), { target: { value: 'alpha' } })
    fireEvent.click(screen.getByRole('button', { name: '1 Result' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy to Clipboard' }))
    fireEvent.click(screen.getByRole('button', { name: '1 Result' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV…' }))
    expect(screen.queryByLabelText('More Base Actions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy Visible Results' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export Visible CSV' })).toBeNull()

    expect(onCopy).toHaveBeenCalledWith({
      kind: 'results',
      text: "File Name\tStatus\tformula.doubled\nAlpha\t'=ready\t4",
      view: 'Ranked',
    })
    expect(onExport).toHaveBeenCalledWith({
      filename: 'Ranked.csv',
      text: "File Name,Status,formula.doubled\r\nAlpha,'=ready,4",
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

  it('restores an edited cell after a failed write and permits a successful retry', async () => {
    const onEdit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<ControlledBase onEdit={onEdit} />)
    const input = screen.getByRole('textbox', { name: 'Edit Status for Beta.md' }) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'review' } })
    fireEvent.blur(input)
    await waitFor(() => expect(input.value).toBe('done'))
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')

    fireEvent.change(input, { target: { value: 'ready' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(input.value).toBe('ready'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([false, true])('ignores a stale write result (%s) after authoritative Base data changes', async success => {
    let resolve!: (success: boolean) => void
    const pending = new Promise<boolean>(next => { resolve = next })
    const onEdit = vi.fn(() => pending)
    const view = render(<ControlledBase onEdit={onEdit} />)
    const input = screen.getByRole('textbox', { name: 'Edit Status for Beta.md' }) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'review' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1))

    const newerFiles = files.map(file => file.path === 'Beta.md'
      ? { ...file, revision: revision('c'), source: file.source.replace('status: done', 'status: fresh') }
      : file)
    view.rerender(<ControlledBase files={newerFiles} onEdit={onEdit} />)
    const newerInput = screen.getByRole('textbox', { name: 'Edit Status for Beta.md' }) as HTMLInputElement
    await waitFor(() => expect(newerInput.value).toBe('fresh'))
    resolve(success)
    await act(async () => {})
    expect(newerInput.value).toBe('fresh')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['throw', 'reject'])('restores the authoritative cell after a %s error', async kind => {
    const onEdit = () => {
      if (kind === 'throw') throw new Error('Unavailable')
      return Promise.reject(new Error('Unavailable'))
    }
    render(<ControlledBase onEdit={onEdit} />)
    const input = screen.getByRole('textbox', { name: 'Edit Status for Beta.md' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'lost' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be saved'))
    expect(input.value).toBe('done')
    expect(input.disabled).toBe(false)
  })

  it('restores a checkbox cell after a failed write', async () => {
    render(<ControlledBase files={files.map(file => file.path === 'Beta.md' ? { ...file, source: file.source.replace('status: done', 'status: true') } : file)} onEdit={async () => false} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Edit Status for Beta.md' })
    fireEvent.click(checkbox)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be saved'))
    expect(checkbox.getAttribute('aria-checked')).toBe('true')
    expect(checkbox.getAttribute('aria-invalid')).toBe('true')
  })

  it('recovers from invalid Base source without changing React hook order', () => {
    const view = render(<ExecutableBaseView files={files} source="views: [" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    view.rerender(<ExecutableBaseView files={files} source={source} />)
    expect(screen.getByRole('toolbar', { name: 'Base View Controls' })).toBeTruthy()
    view.rerender(<ExecutableBaseView files={files} source="views: [" />)
    expect(screen.getByRole('alert')).toBeTruthy()
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
