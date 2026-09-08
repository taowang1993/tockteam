import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TockTutorRoute,
  TockTutorRouteView,
  type WorkbenchRouteSnapshot,
} from '../src/route.tsx'
import { createWorkbenchSession } from '../src/session.ts'

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
  onAttachFiles?(files: FileList): void
  onBack?(): void
  onCancelDispatch?(): void
  onCloseCommandPalette?(): void
  onClosePane?(paneId: string): void
  onCloseTab?(paneId: string, path: string): void
  onCopyGraphPath?(path: string): void
  onCreateManagedVault?(name: string): void
  onEdit?(source: string): void
  onLoadFacets?(): void
  onLoadRelationships?(): void
  onMode?(mode: 'live-preview' | 'reading' | 'source'): void
  onMoveNote?(folder: string): Promise<boolean> | boolean
  onMoveTab?(paneId: string, path: string, direction: -1 | 1): void
  onOpenGraphNode?(path: string, mode: 'local' | 'note'): boolean | void | Promise<boolean>
  onOpenInternalLink?(target: string): void | Promise<{ fragment: string | null } | null>
  onOpenRecovery?(): void
  onOpenSearch?(): void
  onReadSnapshot?(id: string): void
  onReopenClosedTab?(): void
  onRestoreSnapshot?(id: string): void
  onRestoreTrash?(id: string): void
  onRunSearch?(): void
  onSaveWorkspace?(): void
  onLoadWorkspace?(id: string): void
  onSearchChange?(query: string): void
  onSearchMode?(mode: 'query' | 'related'): void
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

describe('TockTutor titlebar panel controls', () => {
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

  it('opens note search in a persistent Files sidebar without replacing the active editor', () => {
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

    const search = screen.getByRole('region', { name: 'Search Notes' })
    const query = screen.getByRole('searchbox', { name: 'Search Notes Query' })
    expect(search.contains(query)).toBe(true)
    expect(query.getAttribute('placeholder')).toBe('Search notes...')
    expect(document.querySelector('aside[aria-label="Files"]')?.contains(query)).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Search Notes' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Matching Note Paths' }).textContent).toContain('Second.md')
    expect(screen.queryByText('Folder/Note.md')).toBeNull()
    expect(screen.getByRole('tabpanel', { name: 'Note Editor' })).toBeTruthy()
  })

  it('opens and closes the Files sidebar and Assistant panel', () => {
    renderRoute()

    const searchButton = screen.getByRole('button', { name: 'Search Notes' })
    expect(searchButton.className).toContain('border-0')
    expect(searchButton.querySelector('svg')?.classList.contains('lucide-search')).toBe(true)

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
    expect(dialog.className).toContain('[--tt-panel:var(--dsw-alias-bg-layer-1,#fff)]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('z-[2147483646]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('!bg-transparent')
    expect(screen.getByRole('listbox', { name: 'Command Search Results' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Command Preview' })).toBeNull()
    expect(screen.queryByText('Best Matches')).toBeNull()
    expect(screen.getByText('Dismiss')).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: 'Search Notes' }))
    expect(onOpenSearch).toHaveBeenCalledOnce()
    expect(onCloseCommandPalette).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Search Notes' })).toBeTruthy()
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
    expect(screen.getByRole('region', { name: 'Search Notes' })).toBeTruthy()
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
    expect(noteActions.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(noteActions, { key: 'Enter' })
    const menu = screen.getByRole('menu', { name: 'More Note Actions' })
    expect(menu.getAttribute('data-slot')).toBe('dropdown-menu-content')
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
    expect(editorBody.className).toContain('[&_.ProseMirror]:max-w-3xl')
    expect(editorBody.className).toContain('[&_.ProseMirror]:w-[calc(100%-48px)]')
    expect(editorBody.className).toContain('[&_.ProseMirror]:outline-none')
    expect(screen.getByRole('note').textContent).toMatch(/Protected Markdown stays exact/u)
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy vault ID' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(currentId))
    writeText.mockRejectedValueOnce(new Error('denied'))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More Vault Actions' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy vault ID' }))
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
    expect(shell?.className).toContain('before:[clip-path:inset(50%_calc(var(--tt-tab-curve)*-1)_0_50%)]')
    expect(shell?.className).toContain('border-[var(--tt-border)]')
    expect(shell?.className).not.toContain('shadow-[inset_0_1px')
    expect(shell?.className).not.toContain('data-[active=false]:mb-0.5')
    expect(screen.getByRole('tab', { name: 'Other.md' }).parentElement?.className).toContain('h-[34px]')
    expect(shell?.className).toContain('rounded-t-[5px]')
    expect(screen.getByRole('tablist', { name: 'Note Tabs' }).className).toContain('[--tt-tab-curve:8px]')
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
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeTruthy()
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
    expect(tags.textContent).toContain('#lesson')
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
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search Notes Query' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onRunSearch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('list', { name: 'Vault Search Results' }).textContent).toContain('Lesson match')
  })

  it('keeps the active editor while selecting a search result', () => {
    const onSelect = vi.fn()
    renderRoute({
      searchMatches: [
        { kind: 'content', line: 2, path: 'Notes/Lesson.md', preview: 'First lesson match' },
        { kind: 'content', line: 8, path: 'Notes/Lesson.md', preview: 'Second lesson match' },
      ],
      searchMode: 'query',
      searchOpen: true,
      searchQuery: 'lesson',
    }, { onSelect })

    expect(screen.getByRole('radiogroup', { name: 'Search Mode' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Search Results' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Note Preview' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open Notes/Lesson.md' })[1]!)
    expect(onSelect).toHaveBeenCalledWith('Notes/Lesson.md')
    expect(screen.getByRole('region', { name: 'Search Notes' })).toBeTruthy()
    expect(screen.getByRole('tabpanel', { name: 'Note Editor' })).toBeTruthy()
  })

  it('shows Obsidian search operators and inserts the selected operator', async () => {
    const onSearchChange = vi.fn()
    renderRoute({ searchMode: 'query', searchOpen: true, searchQuery: 'lesson' }, { onSearchChange })

    const query = screen.getByRole('searchbox', { name: 'Search Notes Query' }) as HTMLInputElement
    query.setSelectionRange(query.value.length, query.value.length)
    fireEvent.click(screen.getByRole('button', { name: 'Search Options' }))

    const options = screen.getByRole('dialog', { name: 'Search Options' })
    for (const operator of ['path:', 'file:', 'tag:', 'line:', 'section:', '[property]']) {
      expect(options.textContent).toContain(operator)
    }
    fireEvent.click(screen.getByRole('button', { name: /^path:/u }))

    expect(onSearchChange).toHaveBeenCalledWith('lesson path:')
    await waitFor(() => { expect(document.activeElement).toBe(query) })
  })

  it('restores a collapsed sidebar after closing Search', () => {
    renderRoute({}, { onOpenSearch: vi.fn() })
    const sidebarButton = screen.getByRole('button', { name: 'Toggle Files Sidebar' })
    fireEvent.click(sidebarButton)
    expect(document.querySelector('aside[aria-label="Files"]')?.getAttribute('data-open')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Search Notes' }))
    expect(screen.getByRole('region', { name: 'Search Notes' })).toBeTruthy()
    expect(document.querySelector('aside[aria-label="Files"]')?.getAttribute('data-open')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Close Search' }))
    expect(document.querySelector('aside[aria-label="Files"]')?.getAttribute('data-open')).toBe('false')
  })

  it('hides query operators in Related mode', () => {
    renderRoute({ searchMode: 'related', searchOpen: true, searchQuery: 'lesson' })
    expect(screen.queryByRole('button', { name: 'Search Options' })).toBeNull()
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
