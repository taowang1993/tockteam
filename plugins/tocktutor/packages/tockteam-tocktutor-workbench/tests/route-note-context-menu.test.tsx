import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { TockTutorRouteView, WorkbenchRouteController, type WorkbenchRouteRemote } from '../src/route.tsx'
import { SidebarNoteMenu } from '../src/sidebar-note-menu.tsx'

const vault = { id: `vault:${'f'.repeat(64)}`, generation: 1 }
const revision = `file:${'a'.repeat(64)}`
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
afterEach(cleanup)

it('right-click and keyboard menus preserve dirty A while opening, renaming and duplicating B', async () => {
  const files = new Map([['A.md', '# A\n'], ['B.md', '# B\n'], ['Unavailable.md', '# Unavailable\n']])
  const saved: string[] = []
  const remote = { $on: () => () => {}, tocktutorWorkbench: {
    currentVault: () => ok({ displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault }),
    listTree: () => ok({ complete: true, cursor: null, entries: [...files.keys()].map(path => ({ kind: 'document', path, revision, size: 10, createdAt: 1, modifiedAt: 1 })), generation: 1, scan: { entries: files.size }, truncated: false, truncationReason: null, warnings: [] }),
    openDocument: (path: string) => ok({ content: files.get(path), digest: `sha256:${'a'.repeat(64)}`, generation: 1, path, revision }),
    readDraft: () => ok({ draft: null, generation: 1 }), saveDraft: () => ok({ generation: 1 }), clearDraft: () => ok({ generation: 1 }),
    saveDocument: (request: { path: string; content: string }) => { saved.push(request.path); files.set(request.path, request.content); return ok({ generation: 1, path: request.path, revision, status: 'saved' }) },
    renameDocument: (request: { fromPath: string; toPath: string }) => { files.set(request.toPath, files.get(request.fromPath)!); files.delete(request.fromPath); return ok({ fromPath: request.fromPath, path: request.toPath, generation: 1, revision, status: 'moved', rewrittenPaths: [], rewriteSnapshots: [] }) },
    duplicateDocument: (request: { fromPath: string; toPath: string }) => { files.set(request.toPath, files.get(request.fromPath)!); return ok({ fromPath: request.fromPath, path: request.toPath, generation: 1, revision, status: 'duplicated' }) },
  } } as unknown as WorkbenchRouteRemote
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/A.md'); controller.setMode('source'); controller.edit('Dirty A')
  const left = controller.getSnapshot().focusedPaneId
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onActivateTab={() => {}} onFocusPane={() => {}} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => {}} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={() => {}} />
  }
  const view = render(<Harness />)
  try {
    const row = screen.getByRole('button', { name: 'B.md', exact: true })
    fireEvent.contextMenu(row, { clientX: 100, clientY: 150 })
    const menu = await screen.findByRole('menu', { name: 'Note Actions' })
    expect(controller.getSnapshot().path).toBe('A.md')
    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(row)
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true })
    fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    const more = screen.getByRole('button', { name: 'Note Actions for B.md', exact: true })
    expect(more.closest('button button')).toBeNull()
    fireEvent.click(more)
    expect(controller.getSnapshot().path).toBe('A.md')
    expect(more.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(more))
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename Note…' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Renamed B' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename Note' }))
    await waitFor(() => expect(files.has('Renamed B.md')).toBe(true))
    expect(controller.getSnapshot().source).toBe('Dirty A')
    expect(saved).toEqual([])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Renamed B.md', exact: true }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open to the Right' }))
    await waitFor(() => expect(controller.getSnapshot().panes).toHaveLength(2))
    expect(controller.getPaneSnapshot(left).source).toBe('Dirty A')
    expect(controller.getPaneSnapshot(left).saveStatus).toBe('unsaved')
    await act(async () => { controller.edit('Dirty B') })
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Renamed B.md', exact: true }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate', exact: true }))
    await waitFor(() => expect(files.get('Renamed B Copy.md')).toBe('Dirty B'))
    expect(saved).toEqual(['Renamed B.md'])
    expect(controller.getPaneSnapshot(left).source).toBe('Dirty A')
    remote.tocktutorWorkbench.openDocument = async () => { throw new Error('Unavailable target') }
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Unavailable.md', exact: true }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'File Recovery', exact: true }))
    await waitFor(() => expect(controller.getSnapshot().message).toBe('Unavailable target'))
    expect(screen.queryByRole('heading', { name: 'File Recovery', exact: true })).toBeNull()
  } finally { view.unmount(); await controller.dispose() }
})
it('keeps its 12 actions in TockTutor, targets the clicked row and restores focus on Escape', async () => {
  const row = document.createElement('button'); document.body.append(row)
  const onAction = vi.fn(), onClose = vi.fn()
  render(<SidebarNoteMenu anchor={{ x: 20, y: 30, row }} bookmarked={false} markdown nativeAvailable onAction={onAction} onClose={onClose} />)
  const menu = await screen.findByRole('menu', { name: 'Note Actions' })
  expect(within(menu).queryByRole('menuitem', { name: 'Open in Default App', exact: true })).toBeNull()
  expect(within(menu).getAllByRole('menuitem')).toHaveLength(12)
  expect(within(menu).queryByText(/Side Peek|Claudian|Copy Link|Note Stats/)).toBeNull()
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Open to the Right' }))
  expect(onAction).toHaveBeenCalledWith('right')
  cleanup()
  render(<SidebarNoteMenu anchor={{ x: 20, y: 30, row }} bookmarked={false} markdown nativeAvailable onAction={onAction} onClose={onClose} />)
  fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  cleanup(); row.remove()
})
