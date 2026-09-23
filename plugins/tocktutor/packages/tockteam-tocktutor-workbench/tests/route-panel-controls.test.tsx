import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TockTutorRoute,
  TockTutorRouteView,
  type WorkbenchRouteSnapshot,
} from '../src/route.tsx'
import { LivePreviewView } from '../src/editor-surface.tsx'
import { createWorkbenchSession } from '../src/session.ts'
import { loadTockTutorSettings } from '../src/settings.ts'
import { MAX_EDITOR_SEARCH_MATCHES } from '../src/editor-search.ts'

const DEFAULT_TOCKTUTOR_SETTINGS = loadTockTutorSettings(localStorage, `vault:${'a'.repeat(64)}`)

const snapshot: WorkbenchRouteSnapshot = {
  dispatchDialog: null,
  documentKind: null,
  entries: [],
  focusedPaneId: 'main',
  message: '',
  mode: 'reading',
  panes: [{ activePath: null, id: 'main', tabs: [] }],
  path: null,
  phase: 'inactive',
  revision: null,
  saveStatus: 'saved',
  searchOpen: false,
  searchQuery: '',
  source: '',
  vault: null,
  warnings: [],
}

afterEach(() => {
  cleanup()
})

function renderRoute(overrides: Partial<WorkbenchRouteSnapshot> = {}, props: {
  nativeNoteActions?: import('../src/native-actions.ts').TockTutorNativeNoteActions | null
  onAddBookmark?(title?: string, group?: string | null): boolean | void
  onAttachFiles?(files: FileList): void
  onBack?(): void
  onCancelDispatch?(): void
  onCloseCommandPalette?(): void
  onCloseSearch?(): void
  onClosePane?(paneId: string): void
  onCloseTab?(paneId: string, path: string): void
  onCopyGraphPath?(path: string): void
  onCreateManagedVault?(name: string): void
  onEdit?(source: string): void
  onFocusEditor?(): void
  onJumpToLine?(line: number): void
  onLoadFacets?(): void
  onLoadRelationships?(): void
  onMode?(mode: 'live-preview' | 'reading' | 'source'): void
  onMoveNote?(folder: string): Promise<boolean> | boolean
  onMoveTab?(paneId: string, path: string, direction: -1 | 1): void
  onOpenGraphNode?(path: string, mode: 'local' | 'note'): boolean | void | Promise<boolean>
  onOpenInternalLink?(target: string): void | Promise<{ fragment: string | null } | null>
  onEditBookmark?(id: string, title: string, group: string | null): boolean | void
  onRevealFile?(): boolean | void | Promise<boolean>
  onOpenRecovery?(): void
  onOpenSearch?(): void
  onOpenSidebarSearch?(): void
  onReadSnapshot?(id: string): void
  onRemoveBookmark?(id: string): void
  onReopenClosedTab?(): void
  onRestoreSnapshot?(id: string): void
  onRestoreTrash?(id: string): void
  onRunSearch?(): void
  onQuickAnswer?(): void
  onCancelQuickAnswer?(): void
  onRetryQuickAnswer?(): void
  onSaveWorkspace?(): void
  onLoadWorkspace?(id: string): void
  onSearchActiveMove?(delta: number): void
  onSearchActiveSet?(index: number): void
  onSearchChange?(query: string): void
  onSearchMode?(mode: 'query' | 'related'): void
  onSelect?(path: string): void
  onSelectSearchMatch?(match: { kind: 'content'; line: number; path: string; preview: string }, newTab: boolean): void
  onSetProperty?(key: string, value: import('../src/properties.ts').PropertyValue): boolean
  onSettingsChange?(change: Record<string, unknown>): void
  onSubmitDispatch?(draft: { path: string } | { text: string; title: string }): void
  onToggleFocusMode?(): void
  onToggleTask?(index: number): void
  onTrashCurrent?(): void
  renderVaultActions?: (
    placement: 'actions' | 'menu',
    close: () => void,
    closeMenu: () => void,
    beginRename: (rename: (name: string, signal: AbortSignal) => Promise<boolean>) => void,
  ) => ReactNode
} = {}): void {
  render(<TockTutorRouteView
    onActivateTab={() => {}}
    onAddPane={() => {}}
    onEdit={() => {}}
    onFocusEditor={props.onFocusEditor}
    onFocusPane={() => {}}
    onMode={() => {}}
    onMoveCanvas={() => {}}
    onSave={() => {}}
    onSelect={() => {}}
    onToggleTask={() => {}}
    snapshot={{ ...snapshot, ...overrides }}
    {...props}
  />)
}

function openNoteActions(): HTMLElement {
  const trigger = screen.getByRole('button', { name: 'More Note Actions' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  return trigger
}

async function openCopyPath(): Promise<HTMLElement> {
  const trigger = screen.getByRole('menuitem', { name: 'Copy Path', exact: true })
  fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Copy Relative Path', exact: true })).toBeTruthy())
  return trigger
}

describe('TockTutor titlebar panel controls', () => {
  it('keeps layout implementation comments out of the note header', () => {
    renderRoute()
    expect(screen.queryByText(/Existing Desktop shell metric/u)).toBeNull()
  })

  it('copies the active vault-relative path directly from note actions and restores focus', async () => {
    const onCopyGraphPath = vi.fn()
    const path = 'Lessons/中文 Notes #1.md'
    renderRoute({ documentKind: 'markdown', path, phase: 'ready', source: '# Lesson\n' }, { onCopyGraphPath })
    const trigger = openNoteActions()
    await openCopyPath()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Relative Path', exact: true }))
    expect(onCopyGraphPath).toHaveBeenCalledExactlyOnceWith(path)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('opens Copy Path with keyboard and copies the Host-owned absolute path action', async () => {
    const run = vi.fn()
    const vault = { generation: 7, id: `vault:${'a'.repeat(64)}` }
    renderRoute({ documentKind: 'markdown', path: 'Lessons/中文 Notes #1.md', phase: 'ready', vault }, {
      nativeNoteActions: {
        activePath: 'Lessons/中文 Notes #1.md',
        disabled: false,
        message: 'Ready.',
        run,
        vault,
      },
    })
    const menuTrigger = openNoteActions()
    const copyPath = screen.getByRole('menuitem', { name: 'Copy Path', exact: true })
    copyPath.focus()
    fireEvent.keyDown(copyPath, { key: 'ArrowRight' })
    const absolute = await waitFor(() => screen.getByRole('menuitem', { name: 'Copy Absolute Path', exact: true }))
    absolute.focus()
    fireEvent.keyDown(absolute, { key: 'Enter' })
    expect(run).toHaveBeenCalledExactlyOnceWith('copy-absolute')
    await waitFor(() => expect(document.activeElement).toBe(menuTrigger))
  })

  it('keeps the portalled Copy Path submenu above the workbench and preserves compact hit rows', async () => {
    const run = vi.fn()
    const vault = { generation: 7, id: `vault:${'a'.repeat(64)}` }
    renderRoute({ documentKind: 'markdown', path: 'Lessons/Welcome.md', phase: 'ready', vault }, {
      nativeNoteActions: {
        activePath: 'Lessons/Welcome.md',
        disabled: false,
        message: 'Ready.',
        run,
        vault,
      },
    })
    openNoteActions()
    await openCopyPath()
    const submenu = screen.getByRole('menuitem', { name: 'Copy Relative Path', exact: true }).closest('[data-slot="dropdown-menu-sub-content"]')
    expect(submenu?.className).toContain('z-[1002]')
    expect(submenu?.className).toContain('[--tt-panel:var(--dsw-alias-bg-layer-1,#fff)]')
    const rootMenu = document.querySelector('[data-slot="dropdown-menu-content"]')!
    const submenuClasses = Array.from(submenu!.classList)
    // One feature-owned background, matching the root menu; no primitive recipe
    // may compete in the CSS cascade or override the body's shell theme owner.
    expect(submenuClasses.filter(value => value.startsWith('bg-'))).toEqual(Array.from(rootMenu.classList).filter(value => value.startsWith('bg-')))
    expect(submenuClasses.filter(value => value.startsWith('bg-'))).toHaveLength(1)
    expect(submenuClasses.filter(value => value.startsWith('p-'))).toEqual(['p-1.5'])
    for (const conflicting of ['bg-popover', 'text-popover-foreground', 'rounded-lg', 'shadow-md', 'ring-1', 'ring-foreground/10']) expect(submenu!.classList.contains(conflicting)).toBe(false)
    expect(submenuClasses.some(value => value.startsWith('[--tockteam-shell-chrome:'))).toBe(false)
    for (const token of ['border-[var(--dsw-alias-border-l2,CanvasText)]', 'text-[var(--dsw-alias-label-primary,#27272a)]']) {
      expect(rootMenu.classList.contains(token)).toBe(true)
      expect(submenu!.classList.contains(token)).toBe(true)
    }
    expect(submenu?.className).toContain('[&_[data-slot=dropdown-menu-item]]:h-[25px]')
    expect(screen.getByRole('menuitem', { name: 'Copy Relative Path', exact: true }).className).toContain('h-[25px]')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Absolute Path', exact: true }))
    expect(run).toHaveBeenCalledExactlyOnceWith('copy-absolute')
  })

  it.each(['no note', 'no copy handler'])('disables Copy Path with %s', unavailable => {
    const onCopyGraphPath = vi.fn()
    renderRoute({ path: unavailable === 'no note' ? null : 'Note.md' }, unavailable === 'no copy handler' ? {} : { onCopyGraphPath })
    openNoteActions()
    const item = screen.getByRole('menuitem', { name: 'Copy Path', exact: true })
    expect(item.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(item)
    expect(onCopyGraphPath).not.toHaveBeenCalled()
  })

  it('keeps the measured note-menu hierarchy limited to implemented actions', () => {
    const vault = { generation: 1, id: `vault:${'a'.repeat(64)}` }
    renderRoute({ documentKind: 'markdown', path: 'Notes/Welcome.md', phase: 'ready', vault }, {
      nativeNoteActions: { activePath: 'Notes/Welcome.md', disabled: false, message: 'Ready.', run: vi.fn(), vault },
      onCopyGraphPath: vi.fn(),
      onRevealFile: vi.fn(() => true),
    })
    openNoteActions()
    const menu = screen.getByRole('menu')
    const labels = within(menu).getAllByRole('menuitem').map(item => item.textContent?.trim())
    expect(labels).toEqual(expect.arrayContaining([
      'Open in New Window', 'Rename Note…', 'Move Note…', 'Bookmark Note…',
      'Add Property', 'Export PDF…', 'Find…', 'Replace…', 'Copy Path', 'Open in Default App', 'Reveal in Finder',
      'Reveal File in Navigation', 'Move File to Trash',
    ]))
    expect(labels).toEqual(expect.arrayContaining(['Split Right', 'Split Down']))
    expect(labels).not.toContain('Merge Entire File With…')
    expect(labels.indexOf('Open in Default App')).toBeLessThan(labels.indexOf('Reveal in Finder'))
    expect(labels.indexOf('Open in New Window')).toBeLessThan(labels.indexOf('Rename Note…'))
    expect(labels.indexOf('Copy Path')).toBeLessThan(labels.indexOf('Reveal File in Navigation'))
  })

  it('opens note-local Find, highlights Reading matches, navigates, and restores editor focus on Escape', async () => {
    const onFocusEditor = vi.fn()
    const source = 'alpha **alpha**\n'
    renderRoute({ documentKind: 'markdown', mode: 'reading', path: 'Notes/Welcome.md', phase: 'ready', source }, { onFocusEditor })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Find…', exact: true }))
    const strip = await screen.findByRole('search', { name: 'Find in Note' })
    const input = within(strip).getByRole('searchbox', { name: 'Find in Note' })
    fireEvent.change(input, { target: { value: 'alpha' } })
    await waitFor(() => expect(screen.getAllByText('alpha', { selector: 'mark[data-tocktutor-find]' })).toHaveLength(2))
    expect(within(strip).getByRole('status').textContent).toBe('1 / 2')
    fireEvent.click(within(strip).getByRole('button', { name: 'Next Match' }))
    expect(within(strip).getByRole('status').textContent).toBe('2 / 2')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('search', { name: 'Find in Note' })).toBeNull()
    expect(onFocusEditor).toHaveBeenCalledOnce()
  })

  it('shows an honest capped count and visible overlong-query feedback', async () => {
    renderRoute({ documentKind: 'markdown', mode: 'source', path: 'Note.md', phase: 'ready', source: 'x'.repeat(MAX_EDITOR_SEARCH_MATCHES + 1) })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Find…', exact: true }))
    const strip = await screen.findByRole('search', { name: 'Find in Note' })
    const input = within(strip).getByRole('searchbox', { name: 'Find in Note' })
    fireEvent.change(input, { target: { value: 'x' } })
    await waitFor(() => expect(within(strip).getByRole('status').textContent).toBe('1 / 10000+'), { timeout: 15_000 })
    fireEvent.change(input, { target: { value: 'x'.repeat(100_001) } })
    await waitFor(() => expect(within(strip).getByRole('alert').textContent).toBe('Search query is too long.'), { timeout: 5_000 })
  })

  it('opens Find and Replace with scoped platform shortcuts', async () => {
    renderRoute({ documentKind: 'markdown', mode: 'live-preview', path: 'Note.md', phase: 'ready', source: 'alpha\n' })
    fireEvent.keyDown(screen.getByRole('main', { name: 'TockTutor Workbench' }), { key: 'f', ctrlKey: true })
    expect(await screen.findByRole('search', { name: 'Find in Note' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('main', { name: 'TockTutor Workbench' }), { key: 'h', ctrlKey: true })
    expect(await screen.findByRole('search', { name: 'Find and Replace in Note' })).toBeTruthy()
  })

  it('keeps Replace local to Markdown and explicitly returns Reading to the last editing mode', async () => {
    const onMode = vi.fn()
    renderRoute({ documentKind: 'markdown', mode: 'reading', path: 'Note.md', phase: 'ready', source: 'alpha\n' }, { onMode })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace…', exact: true }))
    const strip = await screen.findByRole('search', { name: 'Find and Replace in Note' })
    fireEvent.change(within(strip).getByRole('searchbox', { name: 'Find in Note' }), { target: { value: 'alpha' } })
    fireEvent.change(within(strip).getByRole('textbox', { name: 'Replace in Note' }), { target: { value: 'omega' } })
    await waitFor(() => expect(within(strip).getByRole('button', { name: 'Replace All' }).getAttribute('disabled')).toBeNull())
    fireEvent.click(within(strip).getByRole('button', { name: 'Replace All' }))
    expect(onMode).toHaveBeenCalledExactlyOnceWith('live-preview')
    expect(within(strip).getByRole('alert').textContent).toContain('Switching to Live Preview')
  })

  it.each(['canvas', 'base'] as const)('disables note-local Find and Replace for %s documents', kind => {
    renderRoute({ documentKind: kind, mode: 'reading', path: kind === 'canvas' ? 'Data.canvas' : 'Data.base', phase: 'ready', source: kind === 'canvas' ? '{"nodes":[],"edges":[]}' : 'views: []' })
    openNoteActions()
    expect(screen.getByRole('menuitem', { name: 'Find…', exact: true }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Replace…', exact: true }).getAttribute('aria-disabled')).toBe('true')
  })

  it('reveals an exact Unicode tree row without reopening the active draft or losing search', async () => {
    const scrollIntoView = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    try {
      const path = 'Lessons/中文 Notes/Study #1.md'
      const onRevealFile = vi.fn(() => true)
      renderRoute({
        documentKind: 'markdown', path, phase: 'ready', saveStatus: 'unsaved', searchOpen: true,
        searchPresentation: 'sidebar', searchQuery: 'study', source: '# Draft',
        entries: [
          { kind: 'directory', path: 'Lessons' },
          { kind: 'directory', path: 'Lessons/中文 Notes' },
          { createdAt: 1, kind: 'document', modifiedAt: 2, path, revision: '1'.repeat(64), size: 7 },
          { createdAt: 1, kind: 'document', modifiedAt: 2, path: 'Lessons/Other/Study #1.md', revision: '2'.repeat(64), size: 7 },
        ],
      }, { onRevealFile })
      openNoteActions()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal File in Navigation', exact: true }))
      expect(onRevealFile).toHaveBeenCalledOnce()
      await waitFor(() => expect(screen.getByRole('navigation', { name: 'Vault Notes' })).toBeTruthy())
      const row = screen.getByRole('button', { name: path, exact: true })
      expect(row.getAttribute('data-tree-path')).toBe(path)
      await waitFor(() => expect(document.activeElement).toBe(row))
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      expect(screen.getByRole('button', { name: 'Toggle Files Sidebar' }).getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('navigation', { name: 'Vault Notes' }).textContent).toContain('Study #1')
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: original })
    }
  })

  it('edits one stable bookmark and supports choosing a duplicate target', async () => {
    const onEditBookmark = vi.fn(() => true)
    const path = 'Notes/中文.md'
    renderRoute({
      bookmarks: [
        { id: 'note-one', kind: 'note', path, title: 'First' },
        { id: 'note-two', kind: 'note', path, title: 'Second' },
        { id: 'other-group', kind: 'group', title: 'Lessons', children: [] },
        { id: 'group', kind: 'group', title: 'Lessons', children: [] },
      ],
      documentKind: 'markdown', path, phase: 'ready', source: '# Note',
    }, { onEditBookmark })
    openNoteActions()
    expect(screen.getByRole('menuitem', { name: 'Edit Bookmark…', exact: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Bookmark…', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Bookmark' })
    const bookmark = within(dialog).getByRole('combobox', { name: 'Bookmark' })
    fireEvent.change(bookmark, { target: { value: 'note-two' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Bookmark Title' }), { target: { value: 'Edited' } })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Bookmark Group' }), { target: { value: 'group' } })
    fireEvent.submit(within(dialog).getByRole('textbox', { name: 'Bookmark Title' }).closest('form')!)
    await waitFor(() => expect(onEditBookmark).toHaveBeenCalledExactlyOnceWith('note-two', 'Edited', 'group'))
    expect(screen.queryByRole('dialog', { name: 'Edit Bookmark' })).toBeNull()
  })

  it('creates a bookmark through the compact dialog and leaves cancellation untouched', () => {
    const onAddBookmark = vi.fn(() => true)
    renderRoute({ documentKind: 'markdown', path: 'Note.md', phase: 'ready', source: '# Note' }, { onAddBookmark })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bookmark Note…', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Bookmark Note' })
    const title = within(dialog).getByRole('textbox', { name: 'Bookmark Title' })
    fireEvent.change(title, { target: { value: 'Lesson' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }))
    expect(onAddBookmark).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Bookmark Note' })).toBeNull()
  })

  it('validates property names, preserves failed input, and cancels without a write', async () => {
    const onSetProperty = vi.fn(() => false)
    renderRoute({ documentKind: 'markdown', path: 'Note.md', phase: 'ready', source: '---\nstatus: active\n---\n# Note\n' }, { onSetProperty })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add Property', exact: true }))
    const input = screen.getByRole('textbox', { name: 'Property Name' }) as HTMLInputElement
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('alert').textContent).toBe('Enter a property name.')
    fireEvent.change(input, { target: { value: ' STATUS ' } })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('already exists')
    expect(onSetProperty).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'area' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be added'))
    expect(input.value).toBe('area')
    expect(onSetProperty).toHaveBeenCalledExactlyOnceWith('area', '')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onSetProperty).toHaveBeenCalledTimes(1)
  })

  it.each([
    { documentKind: null, path: null },
    { documentKind: 'canvas', path: 'Board.canvas', source: '{"nodes":[],"edges":[]}' },
  ] as const)('disables adding properties for an unavailable Markdown note: %s', async unavailable => {
    renderRoute(unavailable, { onSetProperty: () => true })
    openNoteActions()
    expect(screen.getByRole('menuitem', { name: 'Add Property', exact: true }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it.each(['reading', 'live-preview', 'source'] as const)('adds the first property through note actions in %s', async mode => {
    const onSetProperty = vi.fn(() => true)
    renderRoute({ documentKind: 'markdown', path: 'Note.md', phase: 'ready', mode, source: '# Note\n' }, { onSetProperty })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add Property', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Add Property' })
    const input = within(dialog).getByRole('textbox', { name: 'Property Name' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: ' area ' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(onSetProperty).toHaveBeenCalledWith('area', ''))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('omits frontmatter, comments and fenced code from the note outline', () => {
    renderRoute({ documentKind: 'markdown', path: 'Guide.md', source: ['---', 'title: Guide', '# metadata', '---', '# Visible', '```md', '## Code', '```', '%%', '## Comment', '%%', '### Child'].join('\n') })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Outline', exact: true }))
    const panel = within(screen.getByRole('region', { name: 'Outline', exact: true }))
    expect(panel.getAllByRole('button', { name: /^Go to / }).map(button => button.textContent)).toEqual(['Visible', 'Child'])
  })

  it('outlines unsaved source headings without waiting for the saved-note index', () => {
    const onJumpToLine = vi.fn()
    renderRoute({ phase: 'ready', documentKind: 'markdown', path: 'Draft.md', mode: 'source', saveStatus: 'unsaved', source: '# Draft\n\n## New section', outline: null }, { onJumpToLine })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Outline', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to New section' }))
    expect(onJumpToLine).toHaveBeenCalledWith(3)
  })

  it('opens a hierarchical outline and jumps within Reading View', () => {
    const scrollIntoView = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      renderRoute({ phase: 'ready', documentKind: 'markdown', path: 'Guide.md', source: '# Guide\n\n## Structure\n\n### Lists\n\n## Data', outline: {
        generation: 1, path: 'Guide.md', truncated: false, headings: [
          { level: 1, line: 1, selector: 'Guide', text: 'Guide' },
          { level: 2, line: 3, selector: 'Structure', text: 'Structure' },
          { level: 3, line: 5, selector: 'Lists', text: 'Lists' },
          { level: 2, line: 7, selector: 'Data', text: 'Data' },
        ],
      } })
      openNoteActions()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Outline', exact: true }))
      const outline = within(screen.getByRole('region', { name: 'Outline', exact: true }))
      fireEvent.click(outline.getByRole('button', { name: 'Collapse Structure' }))
      expect(outline.queryByRole('button', { name: 'Go to Lists' })).toBeNull()
      expect(outline.getByRole('button', { name: 'Go to Data' })).toBeTruthy()
      fireEvent.click(outline.getByRole('button', { name: 'Expand Structure' }))
      fireEvent.click(outline.getByRole('button', { name: 'Go to Lists' }))
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
      expect(screen.getByRole('region', { name: 'Reading View' })).toBeTruthy()
    } finally { HTMLElement.prototype.scrollIntoView = original }
  })

  it.each([
    [{ searchQuery: '' }, 'Search across your vault. Open a match to read it alongside these results.'],
    [{ searchLoading: true }, 'Searching notes…'],
    [{ searchError: 'Search could not be completed.' }, 'Search could not be completed.'],
    [{ searchMatches: [] }, 'No matches found.'],
  ])('shows sidebar search feedback for %j', (state, text) => {
    renderRoute({ phase: 'ready', searchOpen: true, searchPresentation: 'sidebar', searchQuery: 'lesson', ...state })
    expect(within(screen.getByRole('complementary', { name: 'Vault Search' })).getByText(text)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps grouped search matches beside the note and preserves them when switching to Files', () => {
    const onSelectSearchMatch = vi.fn()
    const onSearchChange = vi.fn()
    const onOpenSidebarSearch = vi.fn()
    renderRoute({
      phase: 'ready', path: 'Note.md', documentKind: 'markdown', source: '# Open note',
      searchOpen: true, searchPresentation: 'sidebar', searchQuery: 'lesson',
      searchMatches: [
        { kind: 'content', path: 'Folder/Note.md', line: 2, preview: 'First lesson' },
        { kind: 'content', path: 'Folder/Note.md', line: 8, preview: 'Another lesson' },
      ],
    }, { onSelectSearchMatch, onSearchChange, onOpenSidebarSearch })
    const sidebar = screen.getByRole('complementary', { name: 'Vault Search' })
    expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull()
    expect(screen.getByText('Open note')).toBeTruthy()
    expect(within(sidebar).getByText('1 note · 2 matches')).toBeTruthy()
    expect(sidebar.querySelectorAll('mark').length).toBe(2)
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Folder/Note.md, line 8: Another lesson' }), { metaKey: true })
    expect(onSelectSearchMatch).toHaveBeenCalledWith(expect.objectContaining({ line: 8 }), true)
    expect(screen.getByRole('searchbox', { name: 'Search Vault Query' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show Files' }))
    expect(screen.getByRole('navigation', { name: 'Vault Notes' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search Vault', exact: true }))
    expect(onOpenSidebarSearch).toHaveBeenCalledOnce()
    expect((screen.getByRole('searchbox', { name: 'Search Vault Query' }) as HTMLInputElement).value).toBe('lesson')
    fireEvent.click(screen.getByRole('button', { name: 'Clear Vault Search' }))
    expect(onSearchChange).toHaveBeenCalledWith('')
  })

  it('shows readable explorer names and file types while preserving exact navigation paths', () => {
    const onSelect = vi.fn()
    renderRoute({
      phase: 'ready', path: 'Notes/Study.md',
      entries: [
        { kind: 'directory', path: 'Notes' },
        ...['Notes/Study.md', 'Notes/Study.markdown', 'Notes/Study.canvas', 'Notes/Study.base', 'Notes/Study.MD'].map(path => ({
          createdAt: 1, kind: 'document' as const, modifiedAt: 2, path, revision: '1'.repeat(64), size: 12,
        })),
      ],
    }, { onSelect })
    const explorer = within(screen.getByRole('navigation', { name: 'Vault Notes' }))
    for (const path of ['Notes/Study.md', 'Notes/Study.markdown', 'Notes/Study.canvas', 'Notes/Study.base', 'Notes/Study.MD']) {
      const row = explorer.getByRole('button', { name: path, exact: true })
      expect(row.title).toBe(path)
      expect(within(row).getByText('Study')).toBeTruthy()
      expect(row.getAttribute('aria-current')).toBe(path === 'Notes/Study.md' ? 'page' : null)
      fireEvent.click(row)
      expect(onSelect).toHaveBeenLastCalledWith(path)
    }
    expect(explorer.getByText('CANVAS')).toBeTruthy()
    expect(explorer.getByText('BASE')).toBeTruthy()
    expect(explorer.queryByText('MD')).toBeNull()
    expect(explorer.queryByText('MARKDOWN')).toBeNull()
  })

  it('keeps the executable Base view selector interactive in the route', () => {
    renderRoute({
      baseFiles: [{
        path: 'Notes/Task.md',
        revision: 'file:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        source: '---\nstatus: draft\n---\n# Task\n',
      }],
      documentKind: 'base',
      entries: [{ createdAt: 1, kind: 'document', modifiedAt: 2, path: 'Tasks.base', revision: 'file:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', size: 80 }],
      path: 'Tasks.base',
      phase: 'ready',
      revision: 'file:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      source: `views:\n  - type: table\n    name: Ranked\n    order: [file.name]\n  - type: list\n    name: Drafts\n    filters: 'note.status == "draft"'\n    order: [file.name]\n`,
      vault: { generation: 1, id: 'vault:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    })

    expect(screen.getByRole('grid', { name: 'Ranked Results' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Base View' }), { target: { value: 'Drafts' } })
    expect(screen.getByRole('list', { name: 'Drafts Results' })).toBeTruthy()
    expect(screen.getByText('1 Result')).toBeTruthy()
  })

  it('opens note search in a modal dialog that matches the Files sidebar surface', () => {
    const revision = '1'.repeat(64)
    renderRoute({
      entries: [
        { createdAt: 1, kind: 'document', modifiedAt: 2, path: 'Second.md', revision, size: 12 },
        { createdAt: 1, kind: 'document', modifiedAt: 2, path: 'Folder/Note.md', revision, size: 30 },
      ],
      phase: 'ready',
      searchOpen: true,
      searchQuery: 'second',
    })

    const dialog = screen.getByRole('dialog', { name: 'Search Notes' })
    const query = screen.getByRole('combobox', { name: 'Search Notes Query' })
    expect(dialog.contains(query)).toBe(true)
    expect(dialog.className).toContain('[--tt-panel:var(--tockteam-shell-chrome,var(--dsw-alias-bg-base,#fff))]')
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay?.className).toContain('bg-[color-mix(in_srgb,var(--tt-text)_28%,transparent)]')
    expect(overlay?.className).not.toContain('!bg-transparent')
    expect(query.getAttribute('placeholder')).toBe('Search notes...')
    expect(document.querySelector('aside[aria-label="Files"]')?.contains(query)).toBe(false)
    expect(screen.queryByRole('list', { name: 'Matching Note Paths' })).toBeNull()
    expect(screen.getByText('No matching notes.')).toBeTruthy()
    expect(within(dialog).queryByText('Second.md')).toBeNull()
    expect(within(dialog).queryByText('Folder/Note.md')).toBeNull()
    expect(screen.getByRole('tabpanel', { name: 'Note Editor' })).toBeTruthy()
  })

  it('shows a bounded Quick Answer and opens its exact captured citation', () => {
    const selected: string[] = []
    renderRoute({
      entries: [{ createdAt: 1, kind: 'document', modifiedAt: 2, path: 'Second.md', revision: '1'.repeat(64), size: 12 }],
      phase: 'ready',
      searchAnswer: {
        status: 'completed',
        answer: 'The answer is in the note.',
        citations: [{ id: 'qa-1', path: 'Second.md', line: 2, lineEnd: 2 }],
      },
      searchMatches: [{ id: 'source-hit', kind: 'content', line: 2, path: 'Second.md', preview: 'supporting text' }],
      searchOpen: true,
      searchQuery: 'second',
    }, { onSelectSearchMatch: match => { selected.push(match.path) } })

    expect(screen.getByRole('region', { name: 'Quick Answer' })).toBeTruthy()
    expect(screen.getByText('The answer is in the note.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Second.md:2' }))
    expect(selected).toEqual(['Second.md'])
  })

  it('keeps result shortcuts truthful and lets users restore the preview pane', () => {
    const onSearchActiveSet = vi.fn()
    renderRoute({
      searchActiveIndex: 0,
      searchMatches: [{ kind: 'content', line: 3, path: 'Notes/Lesson.md', preview: 'A matching lesson' }],
      searchOpen: true,
      searchQuery: 'lesson',
    }, { onSearchActiveSet })

    expect(screen.getByText('Navigate')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByText('New Tab')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Preview' }))
    expect(screen.getByText('Preview is hidden.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show Preview' }))
    expect(onSearchActiveSet).toHaveBeenCalledWith(0)
  })

  it('does not label unrelated note paths as query matches', () => {
    renderRoute({
      entries: [
        { createdAt: 1, kind: 'document', modifiedAt: 2, path: 'Missing.md', revision: '1'.repeat(64), size: 12 },
        { createdAt: 1, kind: 'document', modifiedAt: 2, path: 'Unrelated.md', revision: '1'.repeat(64), size: 12 },
      ],
      phase: 'ready',
      searchOpen: true,
      searchQuery: 'missing',
    })

    expect(screen.queryByRole('list', { name: 'Matching Note Paths' })).toBeNull()
    expect(screen.getByText('No matching notes.')).toBeTruthy()
    const dialog = screen.getByRole('dialog', { name: 'Search Notes' })
    expect(within(dialog).queryByText('Missing.md')).toBeNull()
    expect(within(dialog).queryByText('Unrelated.md')).toBeNull()
  })

  it('opens and closes the Files sidebar and Assistant panel', () => {
    renderRoute()

    const searchButton = screen.getByRole('button', { name: 'Search Notes' })
    expect(searchButton.className).toContain('border-0')
    expect(searchButton.querySelector('svg')?.classList.contains('lucide-sliders-horizontal')).toBe(true)

    const sidebarButton = screen.getByRole('button', { name: 'Toggle Files Sidebar' })
    const sidebar = screen.getByRole('complementary', { name: 'Files' })
    const resizeHandle = screen.getByRole('button', { name: /Resize Files Sidebar/u })
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.getAttribute('data-open')).toBe('true')

    fireEvent.click(sidebarButton)
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')
    expect(sidebar.getAttribute('data-open')).toBe('false')
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.hidden).toBe(false)
    expect(resizeHandle.hidden).toBe(true)

    fireEvent.click(sidebarButton)
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.getAttribute('data-open')).toBe('true')
    expect(sidebar.hasAttribute('inert')).toBe(false)

    const assistantButton = screen.getByRole('button', { name: 'Toggle Assistant Panel' })
    const assistant = screen.getByLabelText('Assistant Panel')
    expect(assistantButton.getAttribute('aria-expanded')).toBe('false')
    expect(assistant.getAttribute('data-open')).toBe('false')
    expect(assistant.hidden).toBe(false)
    expect(assistant.hasAttribute('inert')).toBe(true)

    fireEvent.click(assistantButton)
    expect(assistantButton.getAttribute('aria-expanded')).toBe('true')
    expect(assistant.getAttribute('data-open')).toBe('true')
    expect(assistant.hasAttribute('inert')).toBe(false)
    const assistantResize = screen.getByRole('separator', { name: 'Resize Assistant Panel' })
    expect(assistantResize.getAttribute('aria-valuenow')).toBe('300')
    expect(assistantResize.className).not.toContain('before:')
    fireEvent.pointerDown(assistantResize, { clientX: 700 })
    expect(assistant.style.transitionDuration).toBe('0ms')
    fireEvent.pointerUp(window)
    expect(assistant.style.transitionDuration).toBe('')
    fireEvent.keyDown(assistantResize, { key: 'ArrowLeft' })
    expect(assistantResize.getAttribute('aria-valuenow')).toBe('310')

    fireEvent.click(assistantButton)
    expect(assistantButton.getAttribute('aria-expanded')).toBe('false')
    expect(assistant.getAttribute('data-open')).toBe('false')
    expect(assistant.hasAttribute('inert')).toBe(true)
  })

  it('exposes pane focus and close controls without removing the final pane', () => {
    const onClosePane = vi.fn()
    const onFocusPane = vi.fn()
    renderRoute({
      focusedPaneId: 'pane-2',
      panes: [
        { activePath: 'First.md', id: 'pane-1', tabs: [{ dirty: false, path: 'First.md', pinned: false }] },
        { activePath: 'Second.md', id: 'pane-2', tabs: [{ dirty: false, path: 'Second.md', pinned: false }] },
      ],
    }, { onClosePane, onFocusPane })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspaces and Panes' }))
    expect(screen.getByRole('button', { name: 'Add Pane' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pane 1 First.md' }))
    expect(onFocusPane).toHaveBeenCalledWith('pane-1')
    fireEvent.click(screen.getByRole('button', { name: 'Close Pane 2' }))
    expect(onClosePane).toHaveBeenCalledWith('pane-2')

    cleanup()
    renderRoute({ panes: [{ activePath: 'First.md', id: 'pane-1', tabs: [{ dirty: false, path: 'First.md', pinned: false }] }] })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspaces and Panes' }))
    const pane1Close = screen.getByRole('button', { name: 'Close Pane 1' })
    expect(pane1Close.hasAttribute('disabled')).toBe(true)
  })

  it('saves and restores named workspaces from accessible panel controls', () => {
    const onSaveWorkspace = vi.fn()
    const onLoadWorkspace = vi.fn()
    const vault = { generation: 1, id: `vault:${'a'.repeat(64)}` }
    renderRoute({
      settings: {
        attachmentFolder: 'Attachments',
        backlinksInDocument: false,
        defaultEditingMode: 'live-preview',
        graphColorBy: 'none',
        graphDepth: 2,
        graphGroupBy: 'none',
        graphIncludeAttachments: false,
        graphIncludeOrphans: true,
        graphIncludeTags: false,
        graphQuery: '',
        journalFolder: 'Journals',
        pagePreview: true,
        recoveryIntervalMinutes: 5,
        snapshotRetentionDays: 7,
        templateFolder: 'Templates',
        webClipFolder: 'Clips',
      },
      vault,
      workspaces: [{
        createdAt: 1,
        focusMode: true,
        id: 'class-layout',
        name: 'Class Layout',
        session: createWorkbenchSession('/tocktutor', vault, 'main'),
      }],
    }, { onLoadWorkspace, onSaveWorkspace })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspaces and Panes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Workspace' }))
    expect(onSaveWorkspace).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Load Class Layout' }))
    expect(onLoadWorkspace).toHaveBeenCalledWith('class-layout')
  })

  it('exposes Host-backed note actions behind explicit rename and move dialogs', async () => {
    const onMoveNote = vi.fn(async () => true)
    const onRenameTitle = vi.fn(async () => true)
    const onTrashCurrent = vi.fn()
    renderRoute({
      documentKind: 'markdown',
      path: 'Lessons/Welcome.md',
      phase: 'ready',
      source: '# Welcome\\n',
    }, { onMoveNote, onRenameTitle, onTrashCurrent })

    openNoteActions()
    expect(screen.getByRole('menuitem', { name: 'Rename Note' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Move Note' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Move File to Trash' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename Note' }))
    const renameDialog = screen.getByRole('dialog', { name: 'Rename Note' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Note Title' }), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename Note' }))
    await waitFor(() => expect(onRenameTitle).toHaveBeenCalledWith('Renamed'))
    expect(renameDialog).toBeTruthy()

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename Note' })).toBeNull())
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Note' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Note Folder' }), { target: { value: 'Archive/2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move Note' }))
    await waitFor(() => expect(onMoveNote).toHaveBeenCalledWith('Archive/2026'))
    expect(screen.queryByRole('dialog', { name: 'Move Note' })).toBeNull()

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move File to Trash' }))
    expect(onTrashCurrent).toHaveBeenCalledOnce()
  })

  it('exposes accessible tab lifecycle and history controls', () => {
    const onBack = vi.fn()
    const onCloseTab = vi.fn()
    const onMoveTab = vi.fn()
    renderRoute({
      canGoBack: true,
      commandPaletteOpen: false,
      focusedPaneId: 'main',
      panes: [{
        activePath: 'First.md',
        id: 'main',
        tabs: [
          { dirty: false, path: 'First.md', pinned: false },
          { dirty: false, path: 'Second.md', pinned: true },
        ],
      }],
      path: 'First.md',
      phase: 'ready',
      recentlyClosed: [{ dirty: false, path: 'Closed.md', pinned: false }],
    }, {
      onBack,
      onCloseTab,
      onMoveTab,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }))
    expect(onBack).toHaveBeenCalledOnce()
    const firstTab = screen.getByRole('tab', { name: 'First.md' })
    fireEvent.keyDown(firstTab, { altKey: true, key: 'ArrowRight' })
    expect(onMoveTab).toHaveBeenCalledWith('main', 'First.md', 1)
    expect(screen.queryByRole('button', { name: 'Pin First.md' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unpin Second.md' })).toBeNull()
    const closeTab = screen.getByRole('button', { name: 'Close First.md' })
    expect(firstTab.parentElement?.lastElementChild).toBe(closeTab)
    fireEvent.click(closeTab)
    expect(onCloseTab).toHaveBeenCalledWith('main', 'First.md')
  })

  it('filters and executes searchable command controls', async () => {
    const onCloseCommandPalette = vi.fn()
    const onOpenSearch = vi.fn()
    const onToggleFocusMode = vi.fn()
    renderRoute({ commandPaletteOpen: true }, {
      onCloseCommandPalette,
      onOpenSearch,
      onToggleFocusMode,
    })

    const dialog = screen.getByRole('dialog', { name: 'Command Palette' })
    expect(dialog.className).toContain('z-[2147483647]')
    expect(dialog.className).toContain('max-w-[640px]')
    expect(dialog.className).toContain('left-1/2')
    expect(dialog.className).toContain('-ml-[5px]')
    expect(dialog.className).toContain('[--tt-panel:var(--tockteam-shell-chrome,var(--dsw-alias-bg-base,#fff))]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('z-[2147483646]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('!bg-transparent')
    const commandList = screen.getByRole('listbox', { name: 'Command Search Results' })
    expect(commandList).toBeTruthy()
    expect(commandList.querySelector('[data-slot="command-group"]')?.className).toContain('gap-0')
    const newNote = screen.getByRole('option', { name: 'New Note' })
    expect(newNote.className).toContain('box-border')
    expect(newNote.className).toContain('h-7')
    expect(newNote.className).toContain('py-1')
    expect(newNote.className).not.toContain('min-h-9')
    expect(screen.queryByRole('region', { name: 'Command Preview' })).toBeNull()
    expect(screen.queryByText('Best Matches')).toBeNull()
    expect(dialog.querySelector('footer')?.textContent).toBe('↑↓ to navigate↵ to useesc to dismiss')
    expect(screen.getByLabelText('Up and Down Arrows')).toBeTruthy()
    expect(screen.getByLabelText('Enter')).toBeTruthy()
    expect(screen.getByLabelText('Escape')).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: 'Search Notes' }))
    expect(onOpenSearch).toHaveBeenCalledOnce()
    expect(onCloseCommandPalette).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Commands' }))
    const commandInput = screen.getByRole('combobox', { name: 'Search Commands' })
    fireEvent.change(commandInput, { target: { value: 'focus' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Toggle Focus Mode' }).getAttribute('aria-selected')).toBe('true'))
    fireEvent.keyDown(commandInput, { key: 'Enter' })
    expect(onToggleFocusMode).toHaveBeenCalledOnce()
    expect(onCloseCommandPalette).toHaveBeenCalledOnce()
  })

  it('activates the highlighted command with ArrowDown and Enter', async () => {
    const onOpenSearch = vi.fn()
    renderRoute({ commandPaletteOpen: true }, { onOpenSearch })
    const input = screen.getByRole('combobox', { name: 'Search Commands' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Search Notes' }).getAttribute('aria-selected')).toBe('true'))
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onOpenSearch).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
  })

  it('explains protected Live Preview and switches explicitly to Source Mode without changing the draft', async () => {
    const source = '---\ntags: [draft]\n---\n# Lesson\n\n> [!note]\n> Keep this exact.\n'
    const onEdit = vi.fn()
    function ProtectedNote(): ReactNode {
      const [mode, setMode] = useState<WorkbenchRouteSnapshot['mode']>('live-preview')
      return <TockTutorRouteView
        onActivateTab={() => {}}
        onAddPane={() => {}}
        onEdit={onEdit}
        onFocusPane={() => {}}
        onMode={setMode}
        onMoveCanvas={() => {}}
        onSave={() => {}}
        onSelect={() => {}}
        onToggleTask={() => {}}
        snapshot={{ ...snapshot, documentKind: 'markdown', mode, path: 'Lesson.md', phase: 'ready', source, saveStatus: 'unsaved', panes: [{ activePath: 'Lesson.md', id: 'main', tabs: [{ dirty: true, mode, path: 'Lesson.md' }] }] }}
      />
    }
    render(<ProtectedNote />)
    expect(screen.getByRole('note').textContent).toContain('Typing and pasting are disabled')
    expect(screen.getByLabelText('Live Preview')).toBeTruthy()
    expect(screen.queryByLabelText('Markdown Source')).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Edit in Source Mode' }))
    await waitFor(() => expect(screen.getByLabelText('Markdown Source').querySelector('.cm-content')).toBeTruthy())
    const lines = document.querySelectorAll('.cm-line')
    expect(Array.from(lines, line => line.textContent).join('\n')).toBe(source)
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.getByLabelText('Unsaved')).toBeTruthy()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('updates the protection notice with the source and omits unavailable actions', () => {
    const props = { documentKey: 'Lesson.md', onEdit: vi.fn(), onToggleTask: vi.fn(), title: 'Lesson' }
    const view = render(<LivePreviewView {...props} source={'> [!note]\n> Protected\n'} />)
    expect(screen.getByRole('note')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit in Source Mode' })).toBeNull()
    view.rerender(<LivePreviewView {...props} source={'# Lesson\nPlain text.\n'} />)
    expect(screen.queryByRole('note')).toBeNull()
    expect(props.onEdit).not.toHaveBeenCalled()
  })

  it.each([
    ['live-preview', '---\ntitle: Lesson\n---\n# Lesson\n[[Note]]\n'],
    ['reading', '> [!note]\n> Protected\n'],
    ['source', '> [!note]\n> Protected\n'],
  ] as const)('does not show a protected-edit notice in %s for an unaffected surface', (mode, source) => {
    renderRoute({ documentKind: 'markdown', mode, path: 'Lesson.md', phase: 'ready', source })
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit in Source Mode' })).toBeNull()
  })

  it('renders editable source-preserving Live Preview chrome', async () => {
    const onEdit = vi.fn()
    const onMode = vi.fn()
    const onToggleTask = vi.fn()
    const source = '# Lesson\n- [ ] Review\n- Parent\n  - Child\n```md\n> [!tip]- Literal\n```\n> [!tip]- Fold\n> Body\n'
    renderRoute({
      documentKind: 'markdown',
      mode: 'live-preview',
      panes: [{ activePath: 'Lesson.md', id: 'main', tabs: [{ dirty: false, mode: 'live-preview', path: 'Lesson.md' }] }],
      path: 'Lesson.md',
      phase: 'ready',
      source,
    }, { onEdit, onMode, onToggleTask })

    expect(screen.getByRole('button', { name: 'Switch to Reading View' })).toBeTruthy()
    const noteActions = screen.getByRole('button', { name: 'More Note Actions' })
    const editorActions = noteActions.parentElement
    expect(editorActions?.querySelector('.lucide-music')).toBeNull()
    expect(editorActions?.querySelector('.lucide-folder')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Source' })).toBeNull()
    expect(screen.queryByText('Rendered Preview', { exact: true })).toBeNull()
    expect(noteActions.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(noteActions, { key: 'Enter' })
    const menu = screen.getByRole('menu', { name: 'More Note Actions' })
    expect(menu.getAttribute('data-slot')).toBe('dropdown-menu-content')
    expect(menu.className).toContain('bg-[var(--tockteam-shell-chrome,var(--tt-panel))]')
    expect(menu.className).not.toContain('bg-[var(--dsw-alias-bg-layer-2')
    expect(menu.closest('[aria-hidden="true"]')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Reading View' })))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Live Preview' })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'More Note Actions' })).toBeNull()
    expect(noteActions.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(document.activeElement).toBe(noteActions))
    openNoteActions()
    const sourceMode = await screen.findByRole('menuitemradio', { name: 'Source Mode' })
    expect(sourceMode.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sourceMode)
    expect(onMode).toHaveBeenCalledWith('source')
    await waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy(), { timeout: 5_000 })
    expect(document.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('true')
    const editorBody = screen.getByLabelText('Editor Attachment Drop Zone')
    expect(editorBody.className).toContain('[&_.ProseMirror]:mx-auto')
    expect(editorBody.className).toContain('[&_.ProseMirror]:max-w-[700px]')
    expect(editorBody.className).toContain('[&_.ProseMirror]:w-[calc(100%-48px)]')
    expect(editorBody.className).toContain('[&_.ProseMirror]:outline-none')
    expect(screen.getByRole('note')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit in Source Mode' })).toBeTruthy()
    const task = screen.getByRole('checkbox', { name: 'Mark Task as Complete' })
    expect(task.tabIndex).toBe(0)
    fireEvent.keyDown(task, { key: ' ' })
    expect(onToggleTask).toHaveBeenCalledWith(0)
    const callout = document.querySelector('.tocktutor-live-callout')
    expect(callout?.classList.contains('hidden')).toBe(true)
    expect(callout?.textContent).toContain('Body')
    const calloutFold = screen.getByRole('button', { name: 'Expand Callout' })
    fireEvent.keyDown(calloutFold, { key: 'Enter' })
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(source.replace('> [!tip]- Fold', '> [!tip]+ Fold')))
    expect(callout).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Collapse Heading' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Collapse List' })).toBeTruthy()
  })

  it('returns the resolved Reading View fragment through the mounted route and scrolls it after navigation', { timeout: 20_000 }, async () => {
    const vault = { generation: 1, id: `vault:${'a'.repeat(64)}` }
    const revision = `file:${'b'.repeat(64)}`
    const sources: Record<string, string> = {
      'Notes/Alias Target.md': '# Alias Target\n\n## Details\nA resolved target.\n',
      'Notes/Welcome.md': '# Welcome\n\n- [ ] Review the lesson\n\n[[Alias Target#Details|the alias note]]\n',
    }
    const remote = {
      $on: () => () => {},
      tocktutorWorkbench: {
        currentVault: async () => ({ ok: true, value: { displayPath: '~/TockTutor', generation: vault.generation, name: 'TockTutor', vault } }),
        listTree: async () => ({ ok: true, value: {
          complete: true,
          cursor: null,
          entries: Object.keys(sources).map(path => ({ createdAt: 1, kind: 'document' as const, modifiedAt: 1, path, revision, size: sources[path]!.length })),
          generation: vault.generation,
          scan: { entries: Object.keys(sources).length },
          truncated: false,
          truncationReason: null,
          warnings: [],
        } }),
        openDocument: async (path: string) => ({ ok: true, value: { content: sources[path]!, digest: `sha256:${'c'.repeat(64)}`, generation: vault.generation, path, revision } }),
        readDraft: async () => ({ ok: true, value: { draft: null, generation: vault.generation } }),
        outline: async (request: { path: string }) => ({ ok: true, value: { generation: vault.generation, headings: [], path: request.path, truncated: false } }),
        links: async (request: { path: string }) => ({ ok: true, value: {
          backlinkDetails: [],
          backlinks: [],
          cursor: null,
          generation: vault.generation,
          outgoing: request.path === 'Notes/Welcome.md' ? ['Notes/Alias Target.md'] : [],
          outgoingDetails: request.path === 'Notes/Welcome.md' ? [{
            authoredTarget: 'Alias Target#Details',
            displayText: 'the alias note',
            fragment: 'Details',
            kind: 'wiki' as const,
            line: 5,
            normalizedTarget: 'alias target',
            resolvedPath: 'Notes/Alias Target.md',
            sourcePath: request.path,
            status: 'resolved' as const,
          }] : [],
          path: request.path,
          scan: { bytes: sources[request.path]!.length, entries: Object.keys(sources).length, files: Object.keys(sources).length },
          tagRelations: [],
          truncated: false,
          truncationReason: null,
          warnings: [],
        } }),
      },
    }
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    try {
      render(<TockTutorRoute
        location={{ hash: '', pathname: '/tocktutor/Notes/Welcome.md', search: '' }}
        navigate={() => {}}
        remote={remote as never}
        renderSlot={() => null}
      />)

      await waitFor(() => expect(screen.getByRole('button', { name: 'Switch to Reading View' })).toBeTruthy(), { timeout: 5_000 })
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Reading View' }))
      await waitFor(() => expect(screen.getByLabelText('Reading View').querySelector('article h1')?.textContent).toBe('Welcome'), { timeout: 5_000 })
      fireEvent.click(screen.getByRole('link', { name: 'the alias note' }))
      await waitFor(() => expect(screen.getByLabelText('Reading View').querySelector('article h1')?.textContent).toBe('Alias Target'), { timeout: 5_000 })
      await waitFor(() => expect(screen.getByLabelText('Reading View').querySelector('article h2')?.textContent).toBe('Details'), { timeout: 5_000 })
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }), { timeout: 5_000 })
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView })
    }
  })

  it('opens a spacious Obsidian-like vault switcher with clean vault navigation', async () => {
    const currentId = `vault:${'a'.repeat(64)}`
    const onCreateManagedVault = vi.fn()
    const onOpenFolderAsVault = vi.fn()
    const onRenameVault = vi.fn(async () => true)
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderRoute({
      vault: { generation: 2, id: currentId },
      vaultDisplayPath: '~/Documents/Research Vault',
      vaultName: 'Research Vault',
    }, {
      onCreateManagedVault,
      renderVaultActions: (placement, close, closeMenu, beginRename) => placement === 'menu'
        ? (
            <>
              <button onClick={() => { beginRename(onRenameVault); closeMenu() }} role="menuitem" type="button">Rename vault...</button>
              <button onClick={close} role="menuitem" type="button">Reveal vault in Finder</button>
            </>
          )
        : (
            <div>
              <p>Open Folder as Vault</p>
              <button onClick={() => { onOpenFolderAsVault(); close() }} type="button">Open</button>
            </div>
          ),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Research Vault' }))
    const dialog = screen.getByRole('dialog', { name: 'Vault Switcher' })
    const vaultList = screen.getByRole('region', { name: 'Vault List' })
    expect(dialog.className).toContain('bg-[var(--tt-panel)]')
    expect(dialog.className).toContain('text-[var(--tt-text)]')
    expect(dialog.className).toContain('[--tt-panel:var(--dsw-alias-bg-layer-1,#fff)]')
    expect(dialog.className).not.toContain('bg-popover')
    expect(dialog.className).not.toContain('p-4')
    expect(dialog.style.height).toBe('560px')
    expect(dialog.style.maxHeight).toBe('calc(100vh - 2rem)')
    expect(dialog.style.maxWidth).toBe('860px')
    expect(vaultList.className).toContain('bg-[var(--tockteam-shell-chrome,var(--tt-panel))]')
    expect(vaultList.className).not.toContain('overflow-y-auto')
    expect(vaultList.textContent).toContain('Research Vault')
    const vaultPath = screen.getByText('~/Documents/Research Vault')
    expect(vaultPath.getAttribute('title')).toBe('~/Documents/Research Vault')
    expect(vaultPath.className).toContain('break-words')
    expect(vaultPath.className).not.toContain('truncate')
    expect(screen.getByText('Vault Switcher').parentElement?.className).toContain('sr-only')
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('bg-transparent')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More Vault Actions' }), { button: 0, ctrlKey: false })
    const vaultMenu = screen.getByRole('menu')
    expect(vaultMenu.getAttribute('data-align')).toBe('start')
    expect(vaultMenu.getAttribute('data-vault-menu-align-offset')).toBe('16')
    expect(vaultMenu.className).toContain('bg-[var(--tt-panel)]')
    expect(vaultMenu.className).not.toContain('bg-popover')
    expect(screen.getByRole('menuitem', { name: 'Reveal vault in Finder' })).toBeTruthy()
    expect(screen.getByText('Open Folder as Vault')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Vault ID' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(currentId))
    writeText.mockRejectedValueOnce(new Error('denied'))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More Vault Actions' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Vault ID' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The vault ID could not be copied.')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More Vault Actions' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename vault...' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Vault Name' }), { target: { value: 'Renamed Vault' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename Vault' }))
    await waitFor(() => expect(onRenameVault).toHaveBeenCalledWith('Renamed Vault', expect.any(AbortSignal)))
    expect(screen.getByRole('img', { name: 'TockTeam Logo' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Vault Actions' })).toBeTruthy()
    expect(dialog.textContent).toContain('Current Vault')
    expect(dialog.textContent).not.toContain('Recent Vaults')
    expect(dialog.textContent).not.toContain('No other vaults yet')
    expect(vaultList.querySelector('[data-active-vault="true"]')).toBeTruthy()
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-open')).toBe('false')
    expect(screen.queryByText('Developer Options')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Demo Vault' })).toBeNull()
    expect(document.body.textContent).not.toContain(currentId)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpenFolderAsVault).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'Vault Switcher' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Research Vault' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create New Vault' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Vault Name' }), { target: { value: 'Research' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Vault' }))
    expect(onCreateManagedVault).toHaveBeenCalledWith('Research')
  })

  it('keeps the folder action mounted while the vault menu opens', () => {
    const placements: Array<'actions' | 'menu'> = []
    renderRoute({
      vault: { generation: 2, id: `vault:${'a'.repeat(64)}` },
      vaultName: 'Research Vault',
    }, {
      renderVaultActions: placement => {
        placements.push(placement)
        return placement === 'menu'
          ? <button role="menuitem" type="button">Rename vault...</button>
          : <p>Open Folder as Vault</p>
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Research Vault' }))
    expect(new Set(placements)).toEqual(new Set(['actions']))
    placements.length = 0
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More Vault Actions' }), { button: 0, ctrlKey: false })
    expect(new Set(placements)).toEqual(new Set(['actions', 'menu']))
    expect(screen.getByText('Open Folder as Vault')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Rename vault...' })).toBeTruthy()
  })

  it('does not reserve an empty vault-action row when the active surface contributes nothing', () => {
    renderRoute({}, { renderVaultActions: () => null })

    fireEvent.click(screen.getByRole('button', { name: /Choose Vault/u }))
    const actions = screen.getByRole('region', { name: 'Vault Actions' })
    expect(actions.textContent).not.toContain('Open Folder as Vault')
    expect(actions.querySelectorAll('[data-vault-action-row]')).toHaveLength(1)
  })

  it('keeps the active tab bottom corners on the tab shell', () => {
    renderRoute({
      documentKind: 'markdown',
      panes: [{
        activePath: 'Welcome.md',
        id: 'main',
        tabs: [
          { dirty: false, mode: 'reading', path: 'Welcome.md' },
          { dirty: false, mode: 'reading', path: 'Other.md' },
        ],
      }],
      path: 'Welcome.md',
      phase: 'ready',
    })

    const tab = screen.getByRole('tab', { name: 'Welcome.md' })
    const shell = tab.parentElement
    expect(shell?.dataset.active).toBe('true')
    expect(shell?.className).toContain('before:rounded-br-[var(--tt-tab-curve)]')
    expect(shell?.className).toContain('after:rounded-bl-[var(--tt-tab-curve)]')
    expect(shell?.className).not.toContain('clip-path')
    expect(shell?.className).toContain('border-transparent')
    expect(shell?.className).toContain('data-[active=false]:border-[var(--tt-border)]')
    expect(shell?.className).not.toContain('shadow-[inset_0_1px')
    expect(shell?.className).not.toContain('data-[active=false]:mb-0.5')
    expect(screen.getByRole('tab', { name: 'Other.md' }).parentElement?.className).toContain('h-[34px]')
    expect(shell?.className).toContain('rounded-t-[5px]')
    expect(screen.getByRole('tablist', { name: 'Note Tabs' }).className).toContain('[--tt-tab-curve:16px]')
    expect(screen.getByRole('button', { name: 'Close Welcome.md' }).className).toContain('[&_svg]:size-3!')
    expect(screen.getByRole('button', { name: 'Close Welcome.md' }).className).toContain('translate-x-0.5')
    expect(tab.className).not.toContain('before:')
  })

  it('keeps word and character counts visible in the bottom-right status bar', () => {
    renderRoute()

    const status = screen.getByRole('group', { name: 'TockTutor Status Bar' })
    expect(status.textContent).toContain('0 words')
    expect(status.textContent).toContain('0 characters')
    expect(status.querySelector('.tocktutor-document-stats')?.className).toContain('ml-auto')
  })

  it('uses one identity-bound FileList callback for picker, paste, and drop', () => {
    const onAttachFiles = vi.fn()
    const file = new File(['voice'], 'voice.weba', { type: 'audio/webm' })
    const files = { 0: file, item: (index: number) => index === 0 ? file : null, length: 1 } as FileList
    renderRoute({
      documentKind: 'markdown',
      mode: 'source',
      path: 'Note.md',
      phase: 'ready',
      revision: 'sha256:note',
      source: '# Note\n',
    }, { onAttachFiles })

    const dropZone = screen.getByLabelText('Editor Attachment Drop Zone')
    fireEvent.drop(dropZone, { dataTransfer: { files } })
    fireEvent.paste(dropZone, { clipboardData: { files } })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Attachments and Embeds' }))
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('attachments')
    expect(screen.queryByRole('heading', { name: 'Graph View' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Add Files'), { target: { files } })
    expect(onAttachFiles).toHaveBeenNthCalledWith(1, files)
    expect(onAttachFiles).toHaveBeenNthCalledWith(2, files)
    expect(onAttachFiles).toHaveBeenNthCalledWith(3, files)
  })

  it('renders bounded File Recovery and Trash actions', () => {
    const snapshotId = '2026-08-22T18-00-00-000Z-deadbeef'
    const trashId = 'trash-123e4567-e89b-42d3-a456-426614174000'
    const onOpenRecovery = vi.fn()
    const onReadSnapshot = vi.fn()
    const onRestoreSnapshot = vi.fn()
    const onRestoreTrash = vi.fn()
    const onTrashCurrent = vi.fn()
    renderRoute({
      draftRecovered: true,
      path: 'Note.md',
      selectedSnapshot: {
        content: '# Before\n',
        generation: 1,
        snapshot: { createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: snapshotId, path: 'Note.md', reason: 'save', size: 9 },
      },
      snapshots: [{ createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: snapshotId, path: 'Note.md', reason: 'save', size: 9 }],
      trash: [{ createdAt: 2, id: trashId, kind: 'document', originalPath: 'Deleted.md' }],
    }, { onOpenRecovery, onReadSnapshot, onRestoreSnapshot, onRestoreTrash, onTrashCurrent })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File Recovery' }))
    const recoveryPanel = screen.getByLabelText('Workbench Utilities')
    expect(recoveryPanel.getAttribute('data-view')).toBe('recovery')
    expect(recoveryPanel.className).toContain('data-[view=recovery]:w-[min(560px,calc(100vw-262px))]')
    expect(recoveryPanel.className).toContain('overflow-x-hidden')
    expect(onOpenRecovery).toHaveBeenCalledOnce()
    expect(screen.queryByRole('heading', { name: 'Web Viewer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onOpenRecovery).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('option', { name: /Snapshot 1/u }))
    expect(onReadSnapshot).toHaveBeenCalledWith(snapshotId)
    fireEvent.click(screen.getByRole('button', { name: 'Restore as New' }))
    expect(onRestoreSnapshot).toHaveBeenCalledWith(snapshotId)
    fireEvent.click(screen.getByRole('button', { name: 'Restore Trash Entry 1' }))
    expect(onRestoreTrash).toHaveBeenCalledWith(trashId)
    fireEvent.click(screen.getByRole('button', { name: 'Move Current File to Trash' }))
    expect(onTrashCurrent).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Snapshot Preview').textContent).toContain('# Before')
  })

  it('hides a snapshot preview when its path is not the active note', () => {
    const onRestoreSnapshot = vi.fn()
    renderRoute({
      path: 'Note.md',
      selectedSnapshot: {
        content: '# Stale\n',
        generation: 1,
        snapshot: { createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: 'stale', path: 'Other.md', reason: 'save', size: 8 },
      },
      snapshots: [{ createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: 'stale', path: 'Other.md', reason: 'save', size: 8 }],
    }, { onRestoreSnapshot })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File Recovery' }))
    expect(screen.getByRole('region', { name: 'Selected Snapshot Content' }).textContent).toContain('Select a snapshot')
    expect(screen.queryByLabelText('Snapshot Preview')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore as New' })).toBeNull()
    expect(onRestoreSnapshot).not.toHaveBeenCalled()
  })

  it('selects a bounded snapshot in the recovery list and shows its content beside the selector', async () => {
    const firstId = '2026-08-22T18-00-00-000Z-first'
    const secondId = '2026-08-22T18-01-00-000Z-second'
    const onReadSnapshot = vi.fn()
    renderRoute({
      path: 'Note.md',
      selectedSnapshot: {
        content: '# Second snapshot\\n',
        generation: 1,
        snapshot: { createdAt: 2, digest: `sha256:${'b'.repeat(64)}`, id: secondId, path: 'Note.md', reason: 'manual', size: 18 },
      },
      snapshots: [
        { createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: firstId, path: 'Note.md', reason: 'save', size: 15 },
        { createdAt: 2, digest: `sha256:${'b'.repeat(64)}`, id: secondId, path: 'Note.md', reason: 'manual', size: 18 },
      ],
    }, { onReadSnapshot })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File Recovery' }))
    const selector = screen.getByRole('listbox', { name: 'Recovery Snapshots' })
    const options = within(selector).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]?.getAttribute('aria-selected')).toBe('false')
    expect(options[1]?.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('region', { name: 'Selected Snapshot Content' }).textContent).toContain('# Second snapshot')
    expect(options[0]?.getAttribute('tabindex')).toBe('-1')
    expect(options[1]?.getAttribute('tabindex')).toBe('0')
    options[1]?.focus()
    fireEvent.keyDown(options[1]!, { key: 'ArrowUp' })
    await waitFor(() => expect(document.activeElement).toBe(options[0]))
    expect(onReadSnapshot).toHaveBeenCalledWith(firstId)
    fireEvent.click(options[0]!)
    expect(onReadSnapshot).toHaveBeenLastCalledWith(firstId)
  })

  it('uses the first snapshot as the roving tab stop until one is selected', async () => {
    const firstId = '2026-08-22T18-00-00-000Z-first'
    const secondId = '2026-08-22T18-01-00-000Z-second'
    const onReadSnapshot = vi.fn()
    renderRoute({
      path: 'Note.md',
      selectedSnapshot: null,
      snapshots: [
        { createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: firstId, path: 'Note.md', reason: 'save', size: 15 },
        { createdAt: 2, digest: `sha256:${'b'.repeat(64)}`, id: secondId, path: 'Note.md', reason: 'manual', size: 18 },
      ],
    }, { onReadSnapshot })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File Recovery' }))
    const options = within(screen.getByRole('listbox', { name: 'Recovery Snapshots' })).getAllByRole('option')
    expect(options[0]?.getAttribute('tabindex')).toBe('0')
    expect(options[1]?.getAttribute('tabindex')).toBe('-1')
    options[0]?.focus()
    fireEvent.keyDown(options[0]!, { key: 'ArrowDown' })
    expect(options[0]?.getAttribute('tabindex')).toBe('-1')
    expect(options[1]?.getAttribute('tabindex')).toBe('0')
    expect(document.activeElement).toBe(options[1])
    await waitFor(() => expect(document.activeElement).toBe(options[1]))
    expect(onReadSnapshot).toHaveBeenCalledWith(secondId)
    fireEvent.keyDown(options[1]!, { key: 'ArrowDown' })
    await waitFor(() => expect(document.activeElement).toBe(options[0]))
    expect(onReadSnapshot).toHaveBeenLastCalledWith(firstId)
  })

  it('keeps files visible after dismissing a tag search', () => {
    renderRoute({ phase: 'ready', searchOpen: false, searchPresentation: 'dialog', searchQuery: 'tag:lesson', entries: [{ path: 'Notes', kind: 'directory' }, { path: 'Notes/Welcome.md', kind: 'document' }] })
    expect(screen.getByRole('button', { name: 'Notes/Welcome.md', exact: true })).toBeTruthy()
    expect(screen.queryByText('No supported notes found.')).toBeNull()
  })

  it('browses nested tags and opens search results for a child tag', () => {
    const onOpenSearch = vi.fn()
    const onSearchChange = vi.fn()
    const onRunSearch = vi.fn()
    const onSearchMode = vi.fn()
    renderRoute({ searchMode: 'related', facets: { properties: [], tags: [{ tag: 'lesson/intro', count: 2 }] } }, { onOpenSearch, onSearchChange, onRunSearch, onSearchMode })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Tag lesson' }))
    expect(screen.queryByRole('button', { name: 'Search Tag lesson/intro' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Tag lesson' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search Tag lesson/intro' }))
    expect(onOpenSearch).toHaveBeenCalledOnce()
    expect(onSearchChange).toHaveBeenCalledWith('tag:lesson/intro')
    expect(onSearchMode).toHaveBeenCalledWith('query')
    expect(onRunSearch).toHaveBeenCalledOnce()
  })

  it('filters and sorts vault properties without changing the note search', () => {
    const onOpenSearch = vi.fn()
    const onSearchChange = vi.fn()
    const onRunSearch = vi.fn()
    renderRoute({ facets: { properties: [
      { key: 'status', count: 4, types: ['string'] },
      { key: 'aliases', count: 2, types: ['list'] },
      { key: 'area', count: 2, types: ['string'] },
    ], tags: [] } }, { onOpenSearch, onSearchChange, onRunSearch })
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Properties' }))
    const filter = screen.getByRole('searchbox', { name: 'Filter Properties' })
    const names = () => within(screen.getByRole('table', { name: 'Vault Properties' })).getAllByRole('button').map(button => button.textContent)
    expect(names()).toEqual(['status', 'aliases', 'area'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort Properties' }), { target: { value: 'name' } })
    expect(names()).toEqual(['aliases', 'area', 'status'])
    fireEvent.change(filter, { target: { value: '  STA  ' } })
    expect(names()).toEqual(['status'])
    expect(onSearchChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Search Property status' }))
    expect(onOpenSearch).toHaveBeenCalledOnce()
    expect(onSearchChange).toHaveBeenCalledWith('[status]')
    expect(onRunSearch).toHaveBeenCalledOnce()
    fireEvent.change(filter, { target: { value: 'no-match' } })
    expect(screen.getByText('No matching properties.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear Property Filter' }))
    expect(document.activeElement).toBe(filter)
    expect(names()).toEqual(['aliases', 'area', 'status'])
    fireEvent.change(filter, { target: { value: 'area' } })
    fireEvent.keyDown(filter, { key: 'Escape' })
    expect(names()).toEqual(['aliases', 'area', 'status'])
  })

  it('keeps Properties and Backlinks as separate utility views', () => {
    const onLoadFacets = vi.fn()
    renderRoute({
      documentKind: 'markdown',
      facets: { complete: true, cursor: null, generation: 1, properties: [{ count: 4, key: 'status', types: ['string'] }], scan: { bytes: 10, entries: 1, files: 1 }, tags: [], truncated: false, truncationReason: null, warnings: [] },
      path: 'Note.md',
      source: '---\nstatus: active\n---\n# Note\n',
    }, { onLoadFacets })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Properties' }))
    expect(onLoadFacets).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('properties')
    const properties = screen.getByRole('region', { name: 'Properties' })
    expect(properties).toBeTruthy()
    expect(within(properties).queryByRole('heading', { name: 'Properties' })).toBeNull()
    expect(screen.getByRole('table', { name: 'Vault Properties' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Property' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Count' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Properties' }).textContent).toContain('status')
    expect(screen.getByRole('region', { name: 'Properties' }).textContent).toContain('string')
    expect(screen.getByRole('region', { name: 'Properties' }).textContent).toContain('4')
    expect(screen.queryByRole('textbox', { name: 'status Property' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Properties' }).textContent).not.toContain('File')
    expect(screen.getByRole('region', { name: 'Properties' }).textContent).not.toContain('All')
    expect(screen.queryByRole('region', { name: 'Backlinks' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close Utility Panel' }))
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Backlinks' }))
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('backlinks')
    expect(screen.getByRole('region', { name: 'Backlinks' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Properties' })).toBeNull()
  })

  it('offers direct Desktop note actions without Claudian and disables them while busy', () => {
    const run = vi.fn()
    const vault = { id: `vault:${'a'.repeat(64)}`, generation: 1 }
    const nativeNoteActions = { activePath: 'Note.md', vault, disabled: false, message: 'Ready.', run }
    for (const [label, action] of [['Open in New Window', 'open-window'], ['Export PDF', 'export-pdf'], ['Open in Default App', 'open-default'], ['Reveal in Finder', 'reveal']] as const) {
      renderRoute({ documentKind: 'markdown', path: 'Note.md', phase: 'ready', vault }, { nativeNoteActions })
      openNoteActions()
      expect(screen.queryByRole('menuitem', { name: /Claudian/ })).toBeNull()
      fireEvent.click(screen.getByRole('menuitem', { name: label, exact: true }))
      expect(run).toHaveBeenLastCalledWith(action)
      cleanup()
    }
    renderRoute({ documentKind: 'markdown', path: 'Note.md', phase: 'ready', vault }, { nativeNoteActions: { ...nativeNoteActions, disabled: true } })
    openNoteActions()
    expect(screen.getByRole('menuitem', { name: 'Open in New Window' }).getAttribute('aria-disabled')).toBe('true')
    cleanup()
    renderRoute({ documentKind: 'markdown', path: 'Next.md', phase: 'ready', vault }, { nativeNoteActions })
    openNoteActions()
    expect(screen.getByRole('menuitem', { name: 'Open in New Window' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('shows document backlinks only when enabled, with safe navigation and bounded-result feedback', () => {
    const onSelect = vi.fn()
    const state: Partial<WorkbenchRouteSnapshot> = {
      documentKind: 'markdown', path: 'Note.md', phase: 'ready',
      vault: { id: `vault:${'a'.repeat(64)}`, generation: 1 },
      settings: { ...DEFAULT_TOCKTUTOR_SETTINGS, backlinksInDocument: true },
      links: {
        backlinkDetails: [{ authoredTarget: 'Note', displayText: 'Note', fragment: null, kind: 'wiki', line: 4, normalizedTarget: 'Note', resolvedPath: 'Note.md', sourcePath: 'Other.md', status: 'resolved' }],
        backlinks: ['Other.md'], complete: false, cursor: null, generation: 1,
        outgoing: [], outgoingDetails: [], path: 'Note.md', scan: { bytes: 10, entries: 3, files: 3 },
        tagRelations: [], truncated: true, truncationReason: 'result-limit', unlinkedMentions: [], warnings: [],
      },
    }
    renderRoute(state, { onSelect })
    const backlinks = screen.getByRole('region', { name: 'Backlinks in Document' })
    expect(backlinks.textContent).toContain('Linked Mentions (1)')
    expect(backlinks.textContent).toContain('Results are incomplete')
    fireEvent.click(within(backlinks).getByRole('button', { name: 'Open Linked Mention Other.md' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('Other.md')
    cleanup()
    renderRoute({ ...state, settings: { ...state.settings!, backlinksInDocument: false } })
    expect(screen.queryByRole('region', { name: 'Backlinks in Document' })).toBeNull()
    cleanup()
    const onLoadRelationships = vi.fn()
    renderRoute({ ...state, path: 'Next.md' }, { onLoadRelationships })
    expect(screen.queryByRole('button', { name: 'Open Linked Mention Other.md' })).toBeNull()
    fireEvent.click(within(screen.getByRole('region', { name: 'Backlinks in Document' })).getByRole('button', { name: 'Retry' }))
    expect(onLoadRelationships).toHaveBeenCalledOnce()
    cleanup()
    renderRoute({ ...state, linksLoading: true })
    expect(screen.getByRole('region', { name: 'Backlinks in Document' }).textContent).toContain('Loading backlinks')
    cleanup()
    renderRoute({ ...state, links: { ...state.links!, backlinkDetails: [], backlinks: [], truncated: false, complete: true } })
    expect(screen.getByRole('region', { name: 'Backlinks in Document' }).textContent).toContain('No linked mentions.')
    cleanup()
    renderRoute({ ...state, documentKind: 'canvas', mode: 'reading', source: '{"nodes":[],"edges":[]}' })
    expect(screen.queryByRole('region', { name: 'Backlinks in Document' })).toBeNull()
  })

  it('renders only collapsible linked and unlinked mentions in Backlinks', () => {
    const onLoadRelationships = vi.fn()
    const onSelect = vi.fn()
    renderRoute({
      documentKind: 'markdown',
      links: {
        backlinkDetails: [{ authoredTarget: 'Note.md', displayText: 'Note', fragment: null, kind: 'wiki', line: 4, normalizedTarget: 'Note.md', resolvedPath: 'Note.md', sourcePath: 'Other.md', status: 'resolved' }],
        backlinks: ['Other.md'],
        complete: true,
        cursor: null,
        generation: 1,
        outgoing: ['Else.md'],
        outgoingDetails: [{ authoredTarget: 'Else.md', displayText: 'Else', fragment: null, kind: 'wiki', line: 9, normalizedTarget: 'Else.md', resolvedPath: 'Else.md', sourcePath: 'Note.md', status: 'resolved' }],
        path: 'Note.md',
        scan: { bytes: 10, entries: 3, files: 3 },
        tagRelations: [],
        truncated: false,
        truncationReason: null,
        unlinkedMentions: [{ identifierKind: 'basename', line: 8, matchedText: 'Note', snippet: 'The note appears in this context.', sourcePath: 'Mention.md' }],
        warnings: [],
      },
      path: 'Note.md',
    }, { onLoadRelationships, onSelect })

    const statusBar = screen.getByLabelText('TockTutor Status Bar')
    expect(statusBar.textContent).toContain('1 backlink')
    expect(statusBar.textContent).not.toContain('0 backlinks')
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Backlinks' }))
    expect(onLoadRelationships).toHaveBeenCalledOnce()
    const backlinks = screen.getByRole('region', { name: 'Backlinks' })
    const linkedMentions = screen.getByText('Linked Mentions (1)', { selector: 'summary' }).parentElement as HTMLDetailsElement
    const unlinkedMentions = screen.getByText('Unlinked Mentions (1)', { selector: 'summary' }).parentElement as HTMLDetailsElement
    expect(linkedMentions.tagName).toBe('DETAILS')
    expect(linkedMentions.open).toBe(true)
    expect(unlinkedMentions.tagName).toBe('DETAILS')
    expect(unlinkedMentions.open).toBe(false)
    expect(backlinks.textContent).toContain('Other.md')
    expect(backlinks.textContent).toContain('Mention.md')
    expect(backlinks.textContent).toContain('The note appears in this context.')
    fireEvent.click(screen.getByRole('button', { name: 'Open Unlinked Mention Mention.md' }))
    expect(onSelect).toHaveBeenCalledWith('Mention.md')
    expect(within(backlinks).queryByRole('heading', { name: 'Backlinks' })).toBeNull()
    expect(backlinks.textContent).not.toContain('Outline')
    expect(backlinks.textContent).not.toContain('Footnotes')
    expect(backlinks.textContent).not.toContain('Outgoing Links')
  })

  it('keeps Bookmarks and Tags as compact separate utility views', () => {
    const onLoadFacets = vi.fn()
    renderRoute({ bookmarks: [{ createdAt: 1, id: 'bookmark-1', kind: 'note', missing: false, path: 'Note.md', title: 'Note' }], facets: { properties: [], tags: [{ count: 2, tag: 'lesson' }] } }, { onLoadFacets })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bookmarks' }))
    const bookmarks = screen.getByRole('region', { name: 'Bookmarks' })
    expect(within(bookmarks).queryByRole('heading', { name: 'Bookmarks' })).toBeNull()
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('bookmarks')
    expect(screen.getByRole('region', { name: 'Bookmarks' }).textContent).toContain('Note')
    expect(screen.queryByRole('region', { name: 'Tags' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close Utility Panel' }))
    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }))
    expect(onLoadFacets).toHaveBeenCalledOnce()
    const tags = screen.getByRole('region', { name: 'Tags' })
    expect(within(tags).queryByRole('heading', { name: 'Tags' })).toBeNull()
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('tags')
    expect(within(tags).getByRole('button', { name: 'Search Tag lesson' })).toBeTruthy()
    expect(tags.textContent).toContain('2')
    expect(screen.getByRole('list', { name: 'Vault Tags' })).toBeTruthy()
    expect(tags.textContent).not.toContain('Recent')
    expect(tags.textContent).not.toContain('Tasks')
    expect(tags.textContent).not.toContain('Journals')
    expect(tags.textContent).not.toContain('Favorites')
    expect(tags.textContent).not.toContain('Collections')
    expect(screen.queryByRole('region', { name: 'Bookmarks' })).toBeNull()
  })

  it('filters, groups, colors, zooms, and opens bounded graph nodes accessibly', () => {
    const onCopyGraphPath = vi.fn()
    const onOpenGraphNode = vi.fn()
    const onSettingsChange = vi.fn()
    renderRoute({
      graph: { complete: true, edges: [{ line: 1, sourcePath: 'Lessons/One.md', targetPath: 'Other.md' }], generation: 1, missing: [], nodes: [{ depth: 0, path: 'Lessons/One.md' }, { depth: 1, path: 'Other.md' }], orphans: [], path: 'Lessons/One.md', scan: { bytes: 1, entries: 2, files: 2 }, truncated: false, truncationReason: null, warnings: [] },
      graphLayout: [{ depth: 0, path: 'Lessons/One.md', x: 100, y: 0 }, { depth: 1, path: 'Other.md', x: -100, y: 0 }],
      graphMode: 'global',
      settings: {
        attachmentFolder: 'Attachments', backlinksInDocument: false, defaultEditingMode: 'live-preview',
        graphColorBy: 'folder', graphDepth: 2, graphGroupBy: 'folder', graphIncludeAttachments: false,
        graphIncludeOrphans: true, graphIncludeTags: false, graphQuery: '', journalFolder: 'Journals',
        pagePreview: true, recoveryIntervalMinutes: 5, snapshotRetentionDays: 7, templateFolder: 'Templates', webClipFolder: 'Clips',
      },
    }, { onCopyGraphPath, onOpenGraphNode, onSettingsChange })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph View' }))
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('graph')
    expect(screen.getByLabelText('Workbench Utilities').className).toContain('!absolute')
    expect(screen.getByLabelText('Global Graph Canvas')).toBeTruthy()
    expect(screen.getByLabelText('Global Graph Canvas').querySelectorAll('[data-graph-edge="true"]')).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'File Recovery' })).toBeNull()
    const graphNode = screen.getByLabelText('Lessons/One.md Graph Node')
    expect(screen.getByLabelText('Other.md Graph Node')).toBeTruthy()
    expect(graphNode.tagName).toBe('BUTTON')
    expect(graphNode.getAttribute('aria-current')).toBe('true')
    expect(graphNode.getAttribute('data-graph-group')).toBe('Lessons')
    expect((graphNode.querySelector('span') as HTMLElement).style.backgroundColor).toBe('var(--tt-accent)')
    const graphLayer = screen.getByLabelText('Global Graph Canvas').querySelector('[data-graph-layer="true"]') as HTMLElement
    const initialTransform = graphLayer.style.transform
    fireEvent.click(screen.getByText('Settings', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom Graph In' }))
    expect(graphLayer.style.transform).not.toBe(initialTransform)
    fireEvent.click(screen.getByRole('button', { name: 'Pan Graph Right' }))
    expect(graphLayer.style.transform).toContain('translate(20px, 0px)')
    fireEvent.click(screen.getByRole('button', { name: 'Reset Graph Viewport' }))
    expect(graphLayer.style.transform).toContain('translate(0px, 0px)')
    fireEvent.click(screen.getByRole('button', { name: 'Open Note Lessons/One.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Local Graph Lessons/One.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Graph Path Lessons/One.md' }))
    expect(onOpenGraphNode).toHaveBeenNthCalledWith(1, 'Lessons/One.md', 'note')
    expect(onOpenGraphNode).toHaveBeenNthCalledWith(2, 'Lessons/One.md', 'local')
    expect(onCopyGraphPath).toHaveBeenCalledWith('Lessons/One.md')
    fireEvent.click(graphNode)
    expect(onOpenGraphNode).toHaveBeenLastCalledWith('Lessons/One.md', 'note')
    fireEvent.change(screen.getByLabelText('Filter Graph Note Paths'), { target: { value: 'Other' } })
    fireEvent.change(screen.getByLabelText('Group Graph Nodes'), { target: { value: 'none' } })
    fireEvent.change(screen.getByLabelText('Color Graph Nodes'), { target: { value: 'none' } })
    expect(onSettingsChange).toHaveBeenCalledWith({ graphQuery: 'Other' })
    expect(onSettingsChange).toHaveBeenCalledWith({ graphGroupBy: 'none' })
    expect(onSettingsChange).toHaveBeenCalledWith({ graphColorBy: 'none' })
    fireEvent.click(screen.getByRole('button', { name: 'Close Utility Panel' }))
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByLabelText('Workbench Utilities').hasAttribute('inert')).toBe(true)
  })

  it('closes the graph overlay after a visual node opens a note', async () => {
    const onOpenGraphNode = vi.fn(async () => true)
    renderRoute({
      graph: { complete: true, edges: [], generation: 1, missing: [], nodes: [{ depth: 0, path: 'Note.md' }], orphans: [], path: 'Note.md', scan: { bytes: 1, entries: 1, files: 1 }, truncated: false, truncationReason: null, warnings: [] },
      graphLayout: [{ depth: 0, path: 'Note.md', x: 0, y: 0 }],
      graphMode: 'global',
      path: 'Note.md',
      phase: 'ready',
    }, { onOpenGraphNode })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph View' }))
    fireEvent.click(screen.getByLabelText('Note.md Graph Node'))
    await waitFor(() => { expect(screen.getByLabelText('Workbench Utilities').getAttribute('aria-hidden')).toBe('true') })
    expect(onOpenGraphNode).toHaveBeenCalledWith('Note.md', 'note')
  })

  it('keeps the graph overlay open when a visual node fails to open', async () => {
    const onOpenGraphNode = vi.fn(async () => false)
    renderRoute({
      graph: { complete: true, edges: [], generation: 1, missing: [], nodes: [{ depth: 0, path: 'Note.md' }], orphans: [], path: 'Note.md', scan: { bytes: 1, entries: 1, files: 1 }, truncated: false, truncationReason: null, warnings: [] },
      graphLayout: [{ depth: 0, path: 'Note.md', x: 0, y: 0 }],
      graphMode: 'global',
      path: 'Note.md',
      phase: 'ready',
    }, { onOpenGraphNode })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph View' }))
    fireEvent.click(screen.getByLabelText('Note.md Graph Node'))
    await waitFor(() => { expect(onOpenGraphNode).toHaveBeenCalledWith('Note.md', 'note') })
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('aria-hidden')).toBe('false')
  })

  it('renders bounded keyword and Related search results', () => {
    const onRunSearch = vi.fn()
    const onSearchMode = vi.fn()
    renderRoute({
      searchMatches: [{ kind: 'content', line: 2, path: 'Note.md', preview: 'Lesson match' }],
      searchMode: 'query',
      searchOpen: true,
      searchQuery: 'lesson',
    }, { onRunSearch, onSearchMode })

    fireEvent.click(screen.getByRole('radio', { name: 'Related' }))
    expect(onSearchMode).toHaveBeenCalledWith('related')
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Notes Query' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onRunSearch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('listbox', { name: 'Vault Search Results' }).textContent).toContain('Lesson match')
  })

  it('keeps search input focus while roving matches and opens Command+Enter in a new tab', () => {
    const onSearchActiveMove = vi.fn()
    const onSearchActiveSet = vi.fn()
    const onSelectSearchMatch = vi.fn()
    const matches = [
      { kind: 'content' as const, line: 2, path: 'A/Lesson.md', preview: 'First lesson match' },
      { kind: 'content' as const, line: 8, path: 'B/Lesson.md', preview: 'Second lesson match' },
    ]
    renderRoute({ searchActiveIndex: 0, searchMatches: matches, searchOpen: true, searchQuery: 'lesson' }, { onSearchActiveMove, onSearchActiveSet, onSelectSearchMatch })
    const input = screen.getByRole('combobox', { name: 'Search Notes Query' })
    input.focus()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onSearchActiveMove).toHaveBeenCalledWith(1)
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    expect(onSelectSearchMatch).toHaveBeenCalledWith(matches[0], true)
    expect(screen.getByRole('option', { name: 'Open A/Lesson.md' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Open B/Lesson.md' })).toBeTruthy()
  })

  it('renders local Title Only, In Folder, and modified-date filters', () => {
    const onSearchFilters = vi.fn()
    renderRoute({ searchMode: 'query', searchOpen: true, searchQuery: 'lesson' }, { onSearchFilters })
    fireEvent.click(screen.getByRole('button', { name: 'Search Options' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Title Only' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search in Folder' }), { target: { value: 'Lessons' } })
    fireEvent.change(screen.getByLabelText('Modified From'), { target: { value: '2026-09-10' } })
    expect(onSearchFilters).toHaveBeenLastCalledWith(expect.objectContaining({ modifiedFrom: Date.parse('2026-09-10') }))
    expect(onSearchFilters).toHaveBeenCalledWith(expect.objectContaining({ directory: 'Lessons' }))
    expect(onSearchFilters).toHaveBeenCalledWith(expect.objectContaining({ titleOnly: true }))
  })

  it('keeps the active editor while selecting a search result', () => {
    const onCloseSearch = vi.fn()
    const onSelect = vi.fn()
    renderRoute({
      searchMatches: [
        { kind: 'content', line: 2, path: 'Notes/Lesson.md', preview: 'First lesson match' },
        { kind: 'content', line: 8, path: 'Notes/Lesson.md', preview: 'Second lesson match' },
      ],
      searchMode: 'query',
      searchQuery: 'lesson',
    }, { onCloseSearch, onOpenSearch: vi.fn(), onSelect })

    fireEvent.click(screen.getByRole('button', { name: 'Search Notes' }))
    expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Search Mode' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Search Results' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Note Preview' })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: 'Open Notes/Lesson.md' }))
    expect(onSelect).toHaveBeenCalledWith('Notes/Lesson.md')
    expect(onCloseSearch).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull()
    expect(screen.getByRole('tabpanel', { name: 'Note Editor' })).toBeTruthy()
  })

  it('waits for Quick Answer citation navigation before closing Search Notes', async () => {
    const match = { kind: 'content' as const, line: 2, path: 'Notes/Lesson.md', preview: 'Lesson match' }
    let complete!: (opened: boolean) => void
    const onSelectSearchMatch = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve }))
    const onCloseSearch = vi.fn()
    renderRoute({
      searchMatches: [match],
      searchAnswer: { status: 'completed', answer: 'A cited answer.', citations: [{ id: 'qa-1', path: match.path, line: 2, lineEnd: 2 }] },
    }, { onOpenSearch: vi.fn(), onSelectSearchMatch, onCloseSearch })
    fireEvent.click(screen.getByRole('button', { name: 'Search Notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Notes/Lesson.md:2' }))
    expect(onSelectSearchMatch).toHaveBeenCalledWith(match, false)
    expect(onCloseSearch).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
    complete(true)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull())
    expect(onCloseSearch).toHaveBeenCalledOnce()
  })

  it('returns focus to the Search Notes button after pointer dismissal', async () => {
    renderRoute({ searchQuery: 'lesson' }, { onOpenSearch: vi.fn() })
    const opener = screen.getByRole('button', { name: 'Search Notes' })
    opener.focus()
    fireEvent.click(opener)
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    if (!(overlay instanceof HTMLElement)) throw new Error('Search Notes overlay not found')
    await new Promise(resolve => setTimeout(resolve, 0))
    fireEvent.pointerDown(overlay, { button: 0 })
    fireEvent.click(overlay)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('returns focus to the Search Notes button after keyboard dismissal', async () => {
    renderRoute({ searchQuery: 'lesson' }, { onOpenSearch: vi.fn() })
    const opener = screen.getByRole('button', { name: 'Search Notes' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Search Notes' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it.each(['direct', 'roundtrip', 'fresh shortcut'])('restores the shortcut opener after $0 palette dismissal', async flow => {
    function ShortcutHarness(): ReactNode {
      const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
      return <div onKeyDown={event => {
        if (event.metaKey && event.key.toLocaleLowerCase() === 'p') {
          event.preventDefault()
          setCommandPaletteOpen(true)
        }
      }}>
        <button onClick={() => {}} type="button">Editor Focus</button>
        <button onClick={() => {}} type="button">Fresh Focus</button>
        <TockTutorRouteView
          onActivateTab={() => {}}
          onAddPane={() => {}}
          onCloseCommandPalette={() => { setCommandPaletteOpen(false) }}
          onEdit={() => {}}
          onFocusPane={() => {}}
          onMode={() => {}}
          onMoveCanvas={() => {}}
          onOpenSearch={() => {}}
          onSave={() => {}}
          onSelect={() => {}}
          onToggleTask={() => {}}
          snapshot={{ ...snapshot, commandPaletteOpen }}
        />
      </div>
    }

    render(<ShortcutHarness />)
    let previousFocus = screen.getByRole('button', { name: 'Editor Focus' })
    if (flow === 'fresh shortcut') {
      previousFocus.focus()
      fireEvent.keyDown(previousFocus, { key: 'p', metaKey: true })
      fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Search Commands' }), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command Palette' })).toBeNull())
      await waitFor(() => expect(document.activeElement).toBe(previousFocus))
      previousFocus = screen.getByRole('button', { name: 'Fresh Focus' })
    }
    previousFocus.focus()
    fireEvent.keyDown(previousFocus, { key: 'p', metaKey: true })
    const commandInput = await screen.findByRole('combobox', { name: 'Search Commands' })
    fireEvent.keyDown(commandInput, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Search Notes' }).getAttribute('aria-selected')).toBe('true'))
    fireEvent.keyDown(commandInput, { key: 'Enter' })
    await screen.findByRole('dialog', { name: 'Search Notes' })
    if (flow === 'roundtrip') {
      fireEvent.click(screen.getByRole('button', { name: 'Commands', exact: true }))
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Search Commands' })))
      fireEvent.click(screen.getByRole('option', { name: 'Search Notes' }))
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Search Notes Query' })))
    }
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Notes Query' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull())
    expect(document.activeElement).toBe(previousFocus)
  })

  it.each([
    { activation: 'pointer', content: false, sameNote: false, fails: false },
    { activation: 'keyboard', content: false, sameNote: false, fails: false },
    { activation: 'pointer', content: true, sameNote: false, fails: false },
    { activation: 'keyboard', content: true, sameNote: false, fails: false },
    { activation: 'pointer', content: false, sameNote: true, fails: false },
    { activation: 'keyboard', content: true, sameNote: true, fails: false },
    { activation: 'pointer', content: false, sameNote: false, fails: true },
  ])('preserves search focus lifecycle ($activation, content=$content, sameNote=$sameNote, fails=$fails)', async ({ activation, content, sameNote, fails }) => {
    const vault = { generation: 1, id: `vault:${'a'.repeat(64)}` }
    const revision = `file:${'b'.repeat(64)}`
    const sources: Record<string, string> = {
      'Notes/Welcome.md': '# Welcome\n',
      'Notes/Result.md': '# Result\n\nA search match.\n',
    }
    const resultPath = sameNote ? 'Notes/Welcome.md' : 'Notes/Result.md'
    let release: (() => void) | undefined
    let holdOpen = false
    const navigate = vi.fn()
    const remote = {
      $on: () => () => {},
      tocktutorWorkbench: {
        currentVault: async () => ({ ok: true, value: { displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault } }),
        listTree: async () => ({ ok: true, value: {
          complete: true, cursor: null,
          entries: Object.keys(sources).map(path => ({ createdAt: 1, kind: 'document', modifiedAt: 1, path, revision, size: sources[path]!.length })),
          generation: 1, scan: { entries: 2 }, truncated: false, truncationReason: null, warnings: [],
        } }),
        openDocument: async (path: string) => {
          if (holdOpen) {
            await new Promise<void>(resolve => { release = resolve })
            if (fails) throw new Error('Fixture open failed')
          }
          return { ok: true, value: { content: sources[path]!, digest: `sha256:${'c'.repeat(64)}`, generation: 1, path, revision } }
        },
        search: async () => ({ ok: true, value: {
          cursor: null, generation: 1, query: 'match',
          matches: [{ kind: 'content', line: 1, path: resultPath, preview: 'match' }],
          scan: { bytes: 10, entries: 2, files: 2 }, truncated: false, truncationReason: null, warnings: [],
        } }),
        readDraft: async () => ({ ok: true, value: { draft: null, generation: 1 } }),
      },
    }
    render(<TockTutorRoute
      location={{ hash: '', pathname: '/tocktutor/Notes/Welcome.md', search: '' }}
      navigate={navigate}
      remote={remote as never}
      renderSlot={() => null}
    />)
    await screen.findByRole('button', { name: 'Switch to Reading View' })
    fireEvent.click(screen.getByRole('button', { name: 'Search Notes' }))
    if (content) {
      fireEvent.change(screen.getByRole('combobox', { name: 'Search Notes Query' }), { target: { value: 'match' } })
      await screen.findByRole('button', { name: 'Search', exact: true })
    }
    const result = await screen.findByRole('option', { name: `Open ${resultPath}` })
    // Preview is a separate request; complete it before delaying actual navigation.
    fireEvent.mouseEnter(result)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Search Notes Query' }).getAttribute('aria-activedescendant')).toBe(result.id))
    holdOpen = !sameNote
    if (activation === 'pointer') fireEvent.click(result)
    else fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Notes Query' }), { key: 'Enter' })
    if (!sameNote) {
      await waitFor(() => expect(release).toBeTypeOf('function'))
      expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
      holdOpen = false
      release!()
    }
    if (fails) {
      await screen.findByText('Fixture open failed')
      expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
      expect(navigate).not.toHaveBeenCalled()
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Notes Query' }), { key: 'Escape' })
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search Notes' })))
      return
    }
    if (!sameNote) await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tocktutor/Notes/Result.md'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull())
    await waitFor(() => expect(document.activeElement?.classList.contains(content ? 'cm-content' : 'ProseMirror')).toBe(true))
    expect(document.activeElement?.textContent).toContain(sameNote ? 'Welcome' : 'Result')
  })

  it('shows Obsidian search operators and inserts the selected operator', async () => {
    const onSearchChange = vi.fn()
    renderRoute({ searchMode: 'query', searchOpen: true, searchQuery: 'lesson' }, { onSearchChange })

    const query = screen.getByRole('combobox', { name: 'Search Notes Query' }) as HTMLInputElement
    query.setSelectionRange(query.value.length, query.value.length)
    fireEvent.click(screen.getByRole('button', { name: 'Search Options' }))

    const options = screen.getByRole('dialog', { name: 'Search Options' })
    // JSDOM has no layout; keep the viewport scroll contract alongside operator coverage.
    expect(options.classList.contains('max-h-[var(--radix-popover-content-available-height)]')).toBe(true)
    expect(options.classList.contains('overflow-y-auto')).toBe(true)
    // The portaled options own modal focus/scroll while the parent dialog is suspended.
    expect(screen.queryByRole('combobox', { name: 'Search Notes Query' })).toBeNull()
    for (const operator of ['path:', 'file:', 'tag:', 'line:', 'section:', 'block:', 'content:', 'ignore-case:', 'match-case:', 'task-done:', 'task-todo:', '[property]']) {
      expect(options.textContent).toContain(operator)
    }
    fireEvent.click(screen.getByRole('button', { name: /^path:/u }))

    expect(onSearchChange).toHaveBeenCalledWith('lesson path:')
    await waitFor(() => { expect(document.activeElement).toBe(query) })
    const trigger = screen.getByRole('button', { name: 'Search Options' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(document.activeElement).toBe(trigger) })
    expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Search Options' })).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hides Search Notes when the Files sidebar is collapsed', () => {
    const onOpenSearch = vi.fn()
    renderRoute({}, { onOpenSearch })
    const sidebarButton = screen.getByRole('button', { name: 'Toggle Files Sidebar' })
    fireEvent.click(sidebarButton)
    expect(document.querySelector('aside[aria-label="Files"]')?.getAttribute('data-open')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Search Notes' })).toBeNull()
    fireEvent.click(sidebarButton)
    expect(screen.getByRole('button', { name: 'Search Notes' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search Notes' }))
    expect(onOpenSearch).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { name: 'Search Notes' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull()
  })

  it('keeps filters available but hides query operators in Related mode', () => {
    renderRoute({ searchMode: 'related', searchOpen: true, searchQuery: 'lesson' })
    fireEvent.click(screen.getByRole('button', { name: 'Search Options' }))
    expect(screen.getByRole('dialog', { name: 'Search Options' })).toBeTruthy()
    expect(screen.queryByText('Search Syntax')).toBeNull()
  })

  it('renders and submits the shadcn New Note dialog', () => {
    const onSubmitDispatch = vi.fn()
    renderRoute({ dispatchDialog: 'new' }, { onSubmitDispatch })

    const dialog = screen.getByRole('dialog', { name: 'New Note' })
    expect(dialog.className).toContain('z-[2147483647]')
    expect(dialog.className).toContain('bg-[var(--tt-panel)]')
    expect(dialog.className).toContain('[--tt-panel:var(--dsw-alias-bg-layer-1,#fff)]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('z-[2147483646]')
    fireEvent.change(screen.getByLabelText('New Note Path'), { target: { value: 'Notes/New.md' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmitDispatch).toHaveBeenCalledWith({ path: 'Notes/New.md' })
  })

  it('closes the shadcn dispatch dialog on Escape', () => {
    const onCancelDispatch = vi.fn()
    renderRoute({ dispatchDialog: 'capture' }, { onCancelDispatch })

    expect(screen.getByRole('dialog', { name: 'Quick Capture' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancelDispatch).toHaveBeenCalledOnce()
  })
})


describe('route search integrity', () => {
  function Harness({ initialMode = 'source', source = 'alpha', deferMode = false }: { initialMode?: WorkbenchRouteSnapshot['mode']; source?: string; deferMode?: boolean }) {
    const [mode, setMode] = useState(initialMode)
    const [content, setContent] = useState(source)
    const [path, setPath] = useState('Note.md')
    return <><button onClick={() => setPath('Other.md')}>Test Other Note</button><button onClick={() => setMode('live-preview')}>Test Live</button><button onClick={() => setMode('source')}>Test Source</button><button onClick={() => setMode('reading')}>Test Reading</button><button onClick={() => setContent(content + 'x')}>Test Append</button>
      <TockTutorRouteView onActivateTab={() => {}} onAddPane={() => {}} onEdit={setContent} onFocusPane={() => {}} onMode={mode => { if (!deferMode) setMode(mode) }} onMoveCanvas={() => {}} onSave={() => {}} onSelect={() => {}} onToggleTask={() => {}} snapshot={{ ...snapshot, documentKind: 'markdown', path, phase: 'ready', source: content, mode, settings: { ...DEFAULT_TOCKTUTOR_SETTINGS, defaultEditingMode: 'source' } }} />
      <output aria-label="Authored Source">{content}</output></>
  }

  it.each(['source', 'reading'] as const)('consumes %s replacement once across mode switches', async initialMode => {
    render(<Harness initialMode={initialMode} />)
    fireEvent.keyDown(screen.getByRole('tabpanel', { name: 'Note Editor' }), { key: 'h', ctrlKey: true })
    const strip = await screen.findByRole('search', { name: 'Find and Replace in Note' })
    fireEvent.change(within(strip).getByRole('searchbox', { name: 'Find in Note' }), { target: { value: 'alpha' } })
    fireEvent.change(within(strip).getByRole('textbox', { name: 'Replace in Note' }), { target: { value: 'alphaX' } })
    await waitFor(() => expect(within(strip).getByRole('button', { name: 'Replace All' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(within(strip).getByRole('button', { name: 'Replace All' }))
    await waitFor(() => expect(screen.getByLabelText('Authored Source').textContent).toBe('alphaX'))
    fireEvent.click(screen.getByText('Test Reading'))
    await screen.findByLabelText('Reading View')
    fireEvent.click(screen.getByText('Test Source'))
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    expect(screen.getByLabelText('Authored Source').textContent).toBe('alphaX')
    fireEvent.click(screen.getByText('Test Live'))
    await waitFor(() => expect(document.querySelector('.ProseMirror')?.textContent).toBe('alphaX'), { timeout: 15_000 })
    expect(screen.getByLabelText('Authored Source').textContent).toBe('alphaX')
    fireEvent.click(screen.getByText('Test Source'))
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    expect(screen.getByLabelText('Authored Source').textContent).toBe('alphaX')
  })

  it.each(['query', 'source', 'document', 'editor', 'close'] as const)('cancels a pending Reading handoff after %s changes', async change => {
    render(<Harness initialMode="reading" deferMode />)
    fireEvent.keyDown(screen.getByRole('tabpanel', { name: 'Note Editor' }), { key: 'h', ctrlKey: true })
    const strip = await screen.findByRole('search', { name: 'Find and Replace in Note' })
    fireEvent.change(within(strip).getByRole('searchbox'), { target: { value: 'alpha' } })
    fireEvent.change(within(strip).getByRole('textbox', { name: 'Replace in Note' }), { target: { value: 'omega' } })
    fireEvent.click(within(strip).getByRole('button', { name: 'Replace All' }))
    if (change === 'query') fireEvent.change(within(strip).getByRole('searchbox'), { target: { value: 'a' } })
    if (change === 'source') fireEvent.click(screen.getByText('Test Append'))
    if (change === 'document') fireEvent.click(screen.getByText('Test Other Note'))
    if (change === 'editor') fireEvent.click(screen.getByText('Test Live'))
    if (change === 'close') fireEvent.keyDown(within(strip).getByRole('searchbox'), { key: 'Escape' })
    fireEvent.click(screen.getByText('Test Source'))
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    expect(screen.getByLabelText('Authored Source').textContent).toBe(change === 'source' ? 'alphax' : 'alpha')
  })

  it('updates capped count when only truncation changes', async () => {
    render(<Harness source={'x'.repeat(MAX_EDITOR_SEARCH_MATCHES)} />)
    fireEvent.keyDown(screen.getByRole('tabpanel', { name: 'Note Editor' }), { key: 'f', ctrlKey: true })
    const strip = await screen.findByRole('search', { name: 'Find in Note' })
    fireEvent.change(within(strip).getByRole('searchbox'), { target: { value: 'x' } })
    await waitFor(() => expect(strip.textContent).toContain('1 / 10000'), { timeout: 15_000 })
    expect(strip.textContent).not.toContain('10000+')
    fireEvent.click(screen.getByText('Test Append'))
    await waitFor(() => expect(strip.textContent).toContain('1 / 10000+'), { timeout: 15_000 })
  }, 20_000)
})
