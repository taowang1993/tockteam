import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TockTutorRouteView,
  type WorkbenchRouteSnapshot,
} from '../src/route.tsx'

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
  onActivateRecentVault?(id: string): void
  onAttachFiles?(files: FileList): void
  onBack?(): void
  onCancelDispatch?(): void
  onCloseCommandPalette?(): void
  onCloseTab?(paneId: string, path: string): void
  onCopyGraphPath?(path: string): void
  onCreateManagedVault?(name: string): void
  onEdit?(source: string): void
  onMode?(mode: 'live-preview' | 'reading' | 'source'): void
  onMoveTab?(paneId: string, path: string, direction: -1 | 1): void
  onOpenGraphNode?(path: string, mode: 'local' | 'note'): void
  onOpenRecovery?(): void
  onOpenSearch?(): void
  onReadSnapshot?(id: string): void
  onRemoveRecentVault?(id: string): void
  onReopenClosedTab?(): void
  onRestoreSnapshot?(id: string): void
  onRestoreTrash?(id: string): void
  onRunSearch?(): void
  onSearchChange?(query: string): void
  onSearchMode?(mode: 'query' | 'related'): void
  onSettingsChange?(change: Record<string, unknown>): void
  onSubmitDispatch?(draft: { path: string } | { text: string; title: string }): void
  onToggleFocusMode?(): void
  onToggleTask?(index: number): void
  onTrashCurrent?(): void
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
  it('opens note search in the command palette dialog instead of the Files sidebar', () => {
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
    const query = screen.getByRole('searchbox', { name: 'Search Notes Query' })
    expect(dialog.contains(query)).toBe(true)
    expect(query.getAttribute('placeholder')).toBe('Search notes...')
    expect(document.querySelector('aside[aria-label="Files"]')?.contains(query)).toBe(false)
    expect(document.querySelector('button[aria-label="Command Palette"]')).toBeNull()
    expect(screen.getByRole('list', { name: 'Matching Note Paths' }).textContent).toContain('Second.md')
    expect(screen.queryByText('Folder/Note.md')).toBeNull()
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
    expect(dialog.className).toContain('max-w-[900px]')
    expect(dialog.className).toContain('[--tt-panel:var(--dsw-alias-bg-layer-1,#fff)]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('z-[2147483646]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('!bg-transparent')
    expect(screen.getByRole('listbox', { name: 'Command Search Results' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Command Preview' })).toBeTruthy()
    expect(screen.getByText('Best Matches')).toBeTruthy()
    expect(screen.getByText('Dismiss')).toBeTruthy()
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
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Reading view' })))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Live Preview' })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'More Note Actions' })).toBeNull()
    expect(noteActions.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(document.activeElement).toBe(noteActions))
    openNoteActions()
    const sourceMode = await screen.findByRole('menuitemradio', { name: 'Source mode' })
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

  it('opens an Obsidian-like vault switcher without developer controls', () => {
    const currentId = `vault:${'a'.repeat(64)}`
    const recentId = `vault:${'b'.repeat(64)}`
    const onActivateRecentVault = vi.fn()
    const onCreateManagedVault = vi.fn()
    const onRemoveRecentVault = vi.fn()
    renderRoute({
      recentVaults: [{ id: currentId, lastOpenedAt: 2 }, { id: recentId, lastOpenedAt: 1 }],
      vault: { generation: 2, id: currentId },
    }, { onActivateRecentVault, onCreateManagedVault, onRemoveRecentVault })

    const vaultSwitcher = screen.getByRole('button', { name: /TockTutor Vault/u })
    fireEvent.click(vaultSwitcher)
    const dialog = screen.getByRole('dialog', { name: 'Vaults' })
    expect(screen.getByRole('region', { name: 'Vault List' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Vault Actions' })).toBeTruthy()
    expect(dialog.textContent).toContain('Current Vault')
    expect(dialog.textContent).toContain('Recent Vault 1')
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-open')).toBe('false')
    expect(screen.queryByText('Developer Options')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Demo Vault' })).toBeNull()
    expect(document.body.textContent).not.toContain(currentId)
    expect(document.body.textContent).not.toContain(recentId)
    fireEvent.click(screen.getByRole('button', { name: 'Forget Recent Vault 1' }))
    expect(onRemoveRecentVault).toHaveBeenCalledWith(recentId)

    fireEvent.click(screen.getByRole('button', { name: 'Create New Vault' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Vault Name' }), { target: { value: 'Research' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Vault' }))
    expect(onCreateManagedVault).toHaveBeenCalledWith('Research')

    fireEvent.click(vaultSwitcher)
    fireEvent.click(screen.getByRole('button', { name: 'Open Recent Vault 1' }))
    expect(onActivateRecentVault).toHaveBeenCalledWith(recentId)
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Attachments and embeds' }))
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'File recovery' }))
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('recovery')
    expect(screen.queryByRole('heading', { name: 'Web Viewer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onOpenRecovery).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(onReadSnapshot).toHaveBeenCalledWith(snapshotId)
    fireEvent.click(screen.getByRole('button', { name: 'Restore as New' }))
    expect(onRestoreSnapshot).toHaveBeenCalledWith(snapshotId)
    fireEvent.click(screen.getByRole('button', { name: 'Restore Trash Entry 1' }))
    expect(onRestoreTrash).toHaveBeenCalledWith(trashId)
    fireEvent.click(screen.getByRole('button', { name: 'Move Current File to Trash' }))
    expect(onTrashCurrent).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Snapshot Preview').textContent).toContain('# Before')
  })

  it('filters, groups, colors, zooms, and opens bounded graph nodes accessibly', () => {
    const onCopyGraphPath = vi.fn()
    const onOpenGraphNode = vi.fn()
    const onSettingsChange = vi.fn()
    renderRoute({
      graph: { complete: true, edges: [], generation: 1, missing: [], nodes: [{ depth: 0, path: 'Lessons/One.md' }, { depth: 1, path: 'Other.md' }], orphans: [], path: null, scan: { bytes: 1, entries: 2, files: 2 }, truncated: false, truncationReason: null, warnings: [] },
      graphLayout: [{ depth: 0, path: 'Lessons/One.md', x: 100, y: 0 }, { depth: 1, path: 'Other.md', x: -100, y: 0 }],
      graphMode: 'global',
      settings: {
        attachmentFolder: 'Attachments', backlinksInDocument: false, defaultEditingMode: 'live-preview',
        graphColorBy: 'folder', graphDepth: 2, graphGroupBy: 'folder', graphIncludeAttachments: false,
        graphIncludeOrphans: true, graphIncludeTags: false, graphQuery: 'Lessons', journalFolder: 'Journals',
        pagePreview: true, recoveryIntervalMinutes: 5, snapshotRetentionDays: 7, templateFolder: 'Templates', webClipFolder: 'Clips',
      },
    }, { onCopyGraphPath, onOpenGraphNode, onSettingsChange })

    openNoteActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph view' }))
    expect(screen.getByLabelText('Workbench Utilities').getAttribute('data-view')).toBe('graph')
    expect(screen.queryByRole('heading', { name: 'File Recovery' })).toBeNull()
    const graphNode = screen.getByLabelText('Lessons/One.md Graph Node')
    expect(screen.queryByLabelText('Other.md Graph Node')).toBeNull()
    expect(graphNode.getAttribute('data-graph-group')).toBe('Lessons')
    expect(graphNode.getAttribute('style')).toContain('background-color')
    const initialLeft = (graphNode as HTMLElement).style.left
    fireEvent.click(screen.getByRole('button', { name: 'Zoom Graph In' }))
    expect((screen.getByLabelText('Lessons/One.md Graph Node') as HTMLElement).style.left).not.toBe(initialLeft)
    fireEvent.click(screen.getByRole('button', { name: 'Pan Graph Right' }))
    expect((screen.getByLabelText('Lessons/One.md Graph Node') as HTMLElement).style.left).toContain('45px')
    fireEvent.click(screen.getByRole('button', { name: 'Reset Graph Viewport' }))
    expect((screen.getByLabelText('Lessons/One.md Graph Node') as HTMLElement).style.left).toContain('20px')
    fireEvent.click(screen.getByRole('button', { name: 'Open Note Lessons/One.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Local Graph Lessons/One.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Graph Path Lessons/One.md' }))
    expect(onOpenGraphNode).toHaveBeenNthCalledWith(1, 'Lessons/One.md', 'note')
    expect(onOpenGraphNode).toHaveBeenNthCalledWith(2, 'Lessons/One.md', 'local')
    expect(onCopyGraphPath).toHaveBeenCalledWith('Lessons/One.md')
    fireEvent.change(screen.getByLabelText('Filter Graph Note Paths'), { target: { value: 'Other' } })
    fireEvent.change(screen.getByLabelText('Group Graph Nodes'), { target: { value: 'none' } })
    fireEvent.change(screen.getByLabelText('Color Graph Nodes'), { target: { value: 'none' } })
    expect(onSettingsChange).toHaveBeenCalledWith({ graphQuery: 'Other' })
    expect(onSettingsChange).toHaveBeenCalledWith({ graphGroupBy: 'none' })
    expect(onSettingsChange).toHaveBeenCalledWith({ graphColorBy: 'none' })
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

  it('shows a Notion-like result list with a focus-following note preview', () => {
    renderRoute({
      searchMatches: [
        { kind: 'content', line: 2, path: 'Notes/Lesson.md', preview: 'First lesson match' },
        { kind: 'content', line: 8, path: 'Notes/Lesson.md', preview: 'Second lesson match' },
      ],
      searchMode: 'query',
      searchOpen: true,
      searchQuery: 'lesson',
    })

    expect(screen.getByRole('radiogroup', { name: 'Search Mode' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Search Results' })).toBeTruthy()
    const preview = screen.getByRole('region', { name: 'Note Preview' })
    expect(preview.textContent).toContain('Lesson')
    expect(preview.textContent).toContain('First lesson match')

    fireEvent.focus(screen.getAllByRole('button', { name: 'Open Notes/Lesson.md' })[1]!)
    expect(preview.textContent).toContain('Second lesson match')
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

  it('hides query operators in Related mode', () => {
    renderRoute({ searchMode: 'related', searchOpen: true, searchQuery: 'lesson' })
    expect(screen.queryByRole('button', { name: 'Search Options' })).toBeNull()
  })

  it('renders and submits the shadcn New Note dialog', () => {
    const onSubmitDispatch = vi.fn()
    renderRoute({ dispatchDialog: 'new' }, { onSubmitDispatch })

    const dialog = screen.getByRole('dialog', { name: 'New Note' })
    expect(dialog.className).toContain('z-[2147483647]')
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
