import { fireEvent, render, screen } from '@testing-library/react'
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
  document.body.replaceChildren()
})

function renderRoute(overrides: Partial<WorkbenchRouteSnapshot> = {}, props: {
  onActivateRecentVault?(id: string): void
  onBack?(): void
  onCancelDispatch?(): void
  onCloseCommandPalette?(): void
  onCloseTab?(paneId: string, path: string): void
  onEdit?(source: string): void
  onMode?(mode: 'live-preview' | 'reading' | 'source'): void
  onMoveTab?(paneId: string, path: string, direction: -1 | 1): void
  onOpenRecovery?(): void
  onOpenSandboxVault?(): void
  onReadSnapshot?(id: string): void
  onRemoveRecentVault?(id: string): void
  onReopenClosedTab?(): void
  onRestoreSnapshot?(id: string): void
  onRestoreTrash?(id: string): void
  onRunSearch?(): void
  onSearchMode?(mode: 'query' | 'related'): void
  onSubmitDispatch?(draft: { path: string } | { text: string; title: string }): void
  onToggleFocusMode?(): void
  onTogglePinTab?(paneId: string, path: string): void
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

describe('TockTutor titlebar panel controls', () => {
  it('opens and closes the Files sidebar and Assistant panel', () => {
    renderRoute()

    const searchButton = screen.getByRole('button', { name: 'Search Notes' })
    expect(searchButton.className).toContain('border-0')

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
    const onTogglePinTab = vi.fn()
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
      onTogglePinTab,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }))
    expect(onBack).toHaveBeenCalledOnce()
    const firstTab = screen.getByRole('tab', { name: 'First.md' })
    fireEvent.keyDown(firstTab, { altKey: true, key: 'ArrowRight' })
    expect(onMoveTab).toHaveBeenCalledWith('main', 'First.md', 1)
    fireEvent.click(screen.getByRole('button', { name: 'Pin First.md' }))
    expect(onTogglePinTab).toHaveBeenCalledWith('main', 'First.md')
    fireEvent.click(screen.getByRole('button', { name: 'Close First.md' }))
    expect(onCloseTab).toHaveBeenCalledWith('main', 'First.md')
  })

  it('filters and executes searchable command controls', () => {
    const onCloseCommandPalette = vi.fn()
    const onToggleFocusMode = vi.fn()
    renderRoute({ commandPaletteOpen: true }, {
      onCloseCommandPalette,
      onToggleFocusMode,
    })

    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search Commands'), { target: { value: 'focus' } })
    fireEvent.click(screen.getByRole('option', { name: 'Toggle Focus Mode' }))
    expect(onToggleFocusMode).toHaveBeenCalledOnce()
    expect(onCloseCommandPalette).toHaveBeenCalledOnce()
  })

  it('renders editable source-preserving Live Preview chrome', () => {
    const onEdit = vi.fn()
    const onMode = vi.fn()
    const onToggleTask = vi.fn()
    const source = '# Lesson\n- [ ] Review\n> [!tip]- Fold\n> Body\n'
    renderRoute({
      documentKind: 'markdown',
      mode: 'live-preview',
      panes: [{ activePath: 'Lesson.md', id: 'main', tabs: [{ dirty: false, mode: 'live-preview', path: 'Lesson.md' }] }],
      path: 'Lesson.md',
      phase: 'ready',
      source,
    }, { onEdit, onMode, onToggleTask })

    expect(screen.getByRole('button', { name: 'Live Preview' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(onMode).toHaveBeenCalledWith('source')
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark Task on Line 2 as Complete/u }))
    expect(onToggleTask).toHaveBeenCalledWith(0)
    fireEvent.change(screen.getByLabelText('Live Preview Line 1'), { target: { value: '# Updated' } })
    expect(onEdit).toHaveBeenCalledWith('# Updated\n- [ ] Review\n> [!tip]- Fold\n> Body\n')
    expect(screen.getByRole('button', { name: 'Expand Line 3' })).toBeTruthy()
  })

  it('opens opaque recent and sandbox vault controls without paths', () => {
    const id = `vault:${'a'.repeat(64)}`
    const onActivateRecentVault = vi.fn()
    const onOpenSandboxVault = vi.fn()
    const onRemoveRecentVault = vi.fn()
    renderRoute({
      recentVaults: [{ id, lastOpenedAt: 1 }],
      vault: { generation: 2, id: `vault:${'b'.repeat(64)}` },
    }, { onActivateRecentVault, onOpenSandboxVault, onRemoveRecentVault })

    fireEvent.click(screen.getByRole('button', { name: /TockTutor Vault/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Sandbox Vault' }))
    expect(onOpenSandboxVault).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onActivateRecentVault).toHaveBeenCalledWith(id)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Recent Vault 1' }))
    expect(onRemoveRecentVault).toHaveBeenCalledWith(id)
    expect(document.body.textContent).not.toContain(id)
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

    fireEvent.click(screen.getByRole('button', { name: /Choose Vault/u }))
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

  it('renders bounded keyword and Related search results', () => {
    const onRunSearch = vi.fn()
    const onSearchMode = vi.fn()
    renderRoute({
      searchMatches: [{ kind: 'content', line: 2, path: 'Note.md', preview: 'Lesson match' }],
      searchMode: 'query',
      searchOpen: true,
      searchQuery: 'lesson',
    }, { onRunSearch, onSearchMode })

    fireEvent.click(screen.getByRole('button', { name: 'Related' }))
    expect(onSearchMode).toHaveBeenCalledWith('related')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onRunSearch).toHaveBeenCalledOnce()
    expect(screen.getByRole('list', { name: 'Vault Search Results' }).textContent).toContain('Lesson match')
  })

  it('renders and submits the shadcn New Note dialog', () => {
    const onSubmitDispatch = vi.fn()
    renderRoute({ dispatchDialog: 'new' }, { onSubmitDispatch })

    expect(screen.getByRole('dialog', { name: 'New Note' })).toBeTruthy()
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
