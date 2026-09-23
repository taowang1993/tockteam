import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { TockTutorNativeActions, type DesktopActionRemote, type DesktopCallerBridge, type DesktopDispatchDelivery } from '../../tockbot-note-desktop/src/client-actions.tsx'
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT, type TockTutorNativeActionsOwnerProps } from '../src/native-actions.ts'
import { parseFrontmatterProperties } from '../src/properties.ts'
import { MarkdownDocumentHeader } from '../src/live-preview-editor.tsx'
import { NoteOutgoingLinks } from '../src/note-backlinks.tsx'
import { WorkbenchRouteController, TockTutorRoute, TockTutorRouteView, type WorkbenchRouteRemote } from '../src/route.tsx'

const vault = { id: `vault:${'f'.repeat(64)}`, generation: 1 }
const revision = `file:${'a'.repeat(64)}`
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
afterEach(cleanup)
function fixture() {
  const files = new Map([['One.md', '---\nname: One\n---\n# One\n[[Two]]\n'], ['Two.md', '# Two\n']])
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  let listener: (event: unknown) => void = () => {}
  const remote = { $on: (_name: string, callback: (event: unknown) => void) => { listener = callback; return () => { listener = () => {} } }, tocktutorWorkbench: {
    currentVault: () => ok({ displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault }),
    listTree: () => ok({ complete: true, cursor: null, entries: [...files.keys()].map(path => ({ kind: 'document', path, revision, size: 10, createdAt: 1, modifiedAt: 1 })), generation: 1, scan: { entries: 2 }, truncated: false, truncationReason: null, warnings: [] }),
    openDocument: (path: string) => files.has(path) ? ok({ content: files.get(path), digest: `sha256:${'a'.repeat(64)}`, generation: 1, path, revision }) : Promise.reject(new Error('Missing file')),
    readDraft: () => ok({ draft: null, generation: 1 }),
    saveDraft: () => ok({ generation: 1 }), clearDraft: () => ok({ generation: 1 }),
    saveDocument: (request: { path: string; content: string }) => { files.set(request.path, request.content); return ok({ generation: 1, path: request.path, revision, status: 'saved' }) },
    outline: ({ path }: { path: string }) => ok({ generation: 1, path, headings: [] }),
    links: ({ path }: { path: string }) => ok({ generation: 1, path, backlinks: [], backlinkDetails: [], outgoing: ['Two.md'], outgoingDetails: [{ sourcePath: path, resolvedPath: 'Two.md', status: 'resolved', line: 5, authoredTarget: 'Two', displayText: 'Two', kind: 'wiki', fragment: null, normalizedTarget: 'Two' }], unlinkedMentions: [], complete: true, truncated: false, warnings: [] }),
    graph: ({ path }: { path: string }) => ok({ generation: 1, path, nodes: [{ path, depth: 0 }], edges: [], orphans: [], missing: [], complete: true, truncated: false, warnings: [] }),
  } } as unknown as WorkbenchRouteRemote
  return { files, storage, remote, emit: (event: unknown) => listener(event), controller: new WorkbenchRouteController(remote, () => {}, () => new Date(), storage) }
}

it('keeps the root dispatch consumer alive when a window-producing protocol request changes the note tab', async () => {
  const { remote, controller: unusedController } = fixture()
  await unusedController.dispose()
  let controller!: WorkbenchRouteController
  const sync = WorkbenchRouteController.prototype.syncLocation
  const syncSpy = vi.spyOn(WorkbenchRouteController.prototype, 'syncLocation').mockImplementation(function (this: WorkbenchRouteController, ...args) { controller = this; return sync.apply(this, args) })
  const dispatchSpy = vi.spyOn(WorkbenchRouteController.prototype, 'handleDispatch').mockImplementation(async function (this: WorkbenchRouteController) { await this.select('Two.md'); return 'handled' })
  let deliver!: (event: DesktopDispatchDelivery | null) => void
  const bridge = { nextDispatch: vi.fn(() => new Promise<DesktopDispatchDelivery | null>(resolve => { deliver = resolve })), cancelDispatch: vi.fn(async () => {}), completeDispatch: vi.fn(async () => {}), authorize: vi.fn(async () => ({ authorization: 'window-token' })) } as unknown as DesktopCallerBridge
  const openPopOut = vi.fn(async () => ({ ok: true as const, value: { status: 'opened' as const } }))
  const nativeRemote = { tocktutorDesktop: { openPopOut } } as unknown as DesktopActionRemote
  const view = render(<TockTutorRoute location={{ pathname: '/tocktutor/One.md', search: '', hash: '' }} remote={remote as never} navigate={() => {}} renderSlot={(name, owner) => name === TOCKTUTOR_NATIVE_ACTIONS_SLOT ? <TockTutorNativeActions {...owner as TockTutorNativeActionsOwnerProps} bridge={bridge} remote={nativeRemote} /> : null} />)
  try {
    await waitFor(() => expect(controller?.getSnapshot().path).toBe('One.md'))
    vi.mocked(bridge.cancelDispatch).mockClear()
    await act(async () => { deliver({ deliveryId: 'delivery', operationId: 'operation', kind: 'protocol', request: { action: 'daily', file: 'Two.md', paneType: 'window' } } as DesktopDispatchDelivery) })
    await waitFor(() => expect(openPopOut).toHaveBeenCalledWith('window-token', 'Two.md', vault, expect.any(AbortSignal)))
    expect(bridge.completeDispatch).toHaveBeenCalledWith({ deliveryId: 'delivery', operationId: 'operation', status: 'handled' })
    expect(bridge.cancelDispatch).not.toHaveBeenCalled()
  } finally { view.unmount(); syncSpy.mockRestore(); dispatchSpy.mockRestore(); await controller?.dispose() }
})

it('keeps linked Properties on the source tab, edits its shared record, and restores bound layouts', async () => {
  const { controller, remote, storage } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  expect(await controller.openLinkedView(source, 'properties')).toBe(true)
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  await controller.splitPane(source, 'horizontal')
  const other = controller.getSnapshot().focusedPaneId
  await controller.select('Two.md')
  expect(controller.getPaneSnapshot(linked).path).toBe('One.md')
  expect(controller.bindLinkedProperty(linked)('name', 'Changed')).toBe(true)
  expect(controller.getPaneSnapshot(source).source).toContain('name: Changed')
  expect(controller.getPaneSnapshot(other).source).toBe('# Two\n')
  controller.toggleLinkedPin(linked)
  await controller.focusPane(source)
  await controller.select('Two.md')
  expect(controller.getPaneSnapshot(linked).path).toBe('One.md')
  controller.unlinkLinkedView(linked)
  expect(controller.getPaneSnapshot(linked).path).toBe('One.md')
  controller.toggleLinkedPin(linked)
  expect(controller.getPaneSnapshot(linked).path).toBe('Two.md')
  const layout = controller.getSnapshot().layout
  await controller.dispose()
  const restored = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  await restored.syncLocation('/tocktutor')
  expect(restored.getSnapshot().layout).toEqual(layout)
  expect(restored.getPaneSnapshot(linked).path).toBe('Two.md')
  expect(await restored.closePane(linked)).toBe(true)
  expect(restored.getSnapshot().panes.some(pane => pane.id === source)).toBe(true)
  await restored.dispose()
})

it('renders five real linked panes, edits represented Properties and navigates only the bound source', async () => {
  const { controller } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  controller.setMode('source')
  const source = controller.getSnapshot().focusedPaneId
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onFocusPane={id => { void controller.focusPane(id) }} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => controller.toggleTask(index)} onClosePane={id => { void controller.closePane(id) }} />
  }
  const view = render(<Harness />)
  try {
    for (const kind of ['backlinks', 'outgoing-links', 'properties', 'outline', 'graph'] as const) {
      await act(async () => { expect(await controller.openLinkedView(source, kind)).toBe(true) })
    }
    for (const title of ['Backlinks', 'Outgoing Links', 'Properties', 'Outline', 'Local Graph']) {
      expect(screen.getByRole('region', { name: `${title} Linked View` })).toBeTruthy()
    }
    await waitFor(() => expect(screen.getByLabelText('Property name')).toBeTruthy())
    fireEvent.blur(screen.getByLabelText('Property name'), { target: { value: 'Changed' } })
    expect(controller.getPaneSnapshot(source).source).toContain('name: Changed')
    await act(async () => { await controller.save() })
    const outgoing = screen.getByRole('region', { name: 'Outgoing Links Linked View' })
    await waitFor(() => expect(within(outgoing).getByRole('button', { name: 'Two · Two.md' })).toBeTruthy())
    fireEvent.click(within(outgoing).getByRole('button', { name: 'Two · Two.md' }))
    await waitFor(() => expect(controller.getPaneSnapshot(source).path).toBe('Two.md'))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Properties Linked View' })).queryByText('No properties.')).toBeTruthy())
    // The destination opens in Live Preview; settle its lazy module before counting editors.
    await act(async () => { await import('../src/live-preview-editor-runtime.tsx') })
    await waitFor(() => expect(view.container.querySelectorAll('.cm-editor, .ProseMirror')).toHaveLength(1))
    expect(controller.getPaneSnapshot(source).mode).toBe('live-preview')
    expect(view.container.querySelector('.ProseMirror')?.textContent).toContain('Two')
    fireEvent.click(screen.getByRole('button', { name: 'Close Properties Linked View' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Properties Linked View' })).toBeNull())
    expect(controller.getSnapshot().panes.some(pane => pane.id === source)).toBe(true)
  } finally { view.unmount(); await controller.dispose() }
})


it('invalidates deleted linked content without discarding an unsaved document record', async () => {
  const { controller, files, emit } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  controller.edit('---\nname: Draft\n---\n# Kept draft\n')
  files.delete('One.md')
  emit({ kind: 'tree', action: 'changed', vault })
  await waitFor(() => expect(controller.getPaneSnapshot(linked).documentUnavailable).toBe(true))
  expect(controller.getPaneSnapshot(source).source).toContain('Kept draft')
  expect(controller.bindLinkedProperty(linked)('name', 'Wrong')).toBe(false)
  await controller.dispose()
})

it('detaches on last source close, opens an editor from a detached result, and closes the final linked leaf safely', async () => {
  const { controller } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'outline')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  controller.toggleLinkedPin(linked)
  expect(await controller.closePane(source)).toBe(true)
  expect(controller.getSnapshot().panes).toHaveLength(1)
  expect(controller.getSnapshot().panes[0]!.linkedView?.sourceGroupId).toBeNull()
  expect(controller.getPaneSnapshot(linked).path).toBe('One.md')
  expect(await controller.navigateLinkedView(linked, 'Two.md')).toBe(true)
  const editor = controller.getSnapshot().panes.find(pane => !pane.linkedView)!
  expect(editor.activePath).toBe('Two.md')
  expect(await controller.closePane(editor.id)).toBe(true)
  expect(await controller.closePane(linked)).toBe(true)
  expect(controller.getSnapshot().panes).toHaveLength(1)
  expect(controller.getSnapshot().panes[0]!.linkedView).toBeUndefined()
  expect(controller.getSnapshot().path).toBeNull()
  await controller.dispose()
})

it('rejects late graph results after source navigation, close and unload without touching another graph', async () => {
  const { controller, remote } = fixture()
  const calls: Array<{ path: string; signal: AbortSignal | undefined; release(): void }> = []
  remote.tocktutorWorkbench.graph = (request, signal) => new Promise(resolve => {
    calls.push({ path: request.path!, signal, release: () => resolve({ ok: true, value: { generation: 1, path: request.path!, nodes: [{ path: request.path!, depth: 0 }], edges: [], orphans: [], missing: [], complete: true, truncated: false, warnings: [], scan: { bytes: 1, files: 1, entries: 1 }, truncationReason: null } }) })
  })
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  const opening = controller.openLinkedView(source, 'graph')
  await waitFor(() => expect(calls).toHaveLength(1))
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  await controller.select('Two.md')
  const next = controller.loadLinkedView(linked)
  await waitFor(() => expect(calls).toHaveLength(2))
  expect(calls[0]!.signal?.aborted).toBe(true)
  calls[1]!.release()
  expect(await next).toBe(true)
  calls[0]!.release()
  await opening
  expect(controller.getPaneSnapshot(linked).graph?.path).toBe('Two.md')
  expect(controller.getSnapshot().graph).toBeNull()
  const pendingClose = controller.loadLinkedView(linked)
  await waitFor(() => expect(calls).toHaveLength(3))
  await controller.closePane(linked)
  expect(calls[2]!.signal?.aborted).toBe(true)
  calls[2]!.release()
  expect(await pendingClose).toBe(false)
  const last = controller.openLinkedView(source, 'graph')
  await waitFor(() => expect(calls).toHaveLength(4))
  await controller.dispose()
  expect(calls[3]!.signal?.aborted).toBe(true)
  calls[3]!.release()
  await last
})

it('retains one shared relationship request when a linked consumer closes and rejects stale property callbacks', async () => {
  const { controller, remote } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const propertyPane = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  const stale = controller.bindLinkedProperty(propertyPane)
  controller.edit('---\nname: Newer\n---\n# Newer\n')
  expect(stale('name', 'Old')).toBe(false)
  expect(controller.getPaneSnapshot(source).source).toContain('Newer')
  await controller.save()
  let release!: () => void
  let entered = false
  let signal: AbortSignal | undefined
  remote.tocktutorWorkbench.links = async (request, abort) => {
    entered = true; signal = abort
    await new Promise<void>(resolve => { release = resolve })
    return { ok: true, value: { generation: 1, path: request.path, backlinks: [], backlinkDetails: [], outgoing: [], outgoingDetails: [], cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [], scan: { bytes: 1, files: 1, entries: 1 }, tagRelations: [] } }
  }
  const pending = controller.loadRelationships()
  await waitFor(() => expect(entered).toBe(true))
  await controller.closePane(propertyPane)
  expect(signal?.aborted).toBe(false)
  release()
  expect(await pending).toBe(true)
  expect(controller.getPaneSnapshot(source).links?.path).toBe('One.md')
  expect(stale('name', 'Closed')).toBe(false)
  await controller.dispose()
})

it('restores exact linked source tabs and retained pinned paths from a named workspace', async () => {
  const { controller } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  controller.toggleLinkedPin(linked)
  controller.resizeSplit([], .65)
  expect(controller.saveCurrentWorkspace('Linked')).toBe(true)
  const layout = controller.getSnapshot().layout
  const binding = controller.getSnapshot().panes.find(pane => pane.id === linked)!.linkedView
  await controller.closePane(linked)
  await controller.select('Two.md')
  expect(await controller.loadWorkspace('linked')).toBe(true)
  expect(controller.getSnapshot().layout).toEqual(layout)
  expect(controller.getSnapshot().panes.find(pane => pane.id === linked)!.linkedView).toEqual(binding)
  expect(controller.getPaneSnapshot(linked).source).toContain('name: One')
  await controller.dispose()
})

it('opens the five-item linked submenu with keyboard and creates the selected real pane', async () => {
  const { controller } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  controller.setMode('source')
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => controller.toggleTask(index)} />
  }
  const view = render(<Harness />)
  try {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More Note Actions' }), { button: 0, ctrlKey: false })
    const trigger = screen.getByRole('menuitem', { name: 'Open Linked View', exact: true })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    const item = await screen.findByRole('menuitem', { name: 'Outgoing Links', exact: true })
    const submenu = item.closest('[role="menu"]')!
    expect(within(submenu as HTMLElement).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Backlinks', 'Outgoing Links', 'Properties', 'Outline', 'Local Graph'])
    item.focus()
    fireEvent.keyDown(item, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('region', { name: 'Outgoing Links Linked View' })).toBeTruthy())
    expect(controller.getSnapshot().panes).toHaveLength(2)
    expect(controller.getSnapshot().layout).toMatchObject({ axis: 'vertical' })
  } finally { view.unmount(); await controller.dispose() }
})

it('remaps bound and detached pinned consumers on rename and rejects deleted cached content on retry', async () => {
  const { controller, files, remote, emit } = fixture()
  remote.tocktutorWorkbench.renameDocument = async request => {
    files.set(request.toPath, files.get(request.fromPath)!); files.delete(request.fromPath)
    return { ok: true, value: { generation: 1, fromPath: request.fromPath, path: request.toPath, revision, status: 'moved', rewriteSnapshots: [], rewrittenPaths: [] } }
  }
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const first = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  controller.toggleLinkedPin(first)
  controller.unlinkLinkedView(first)
  await controller.openLinkedView(source, 'outline')
  const second = controller.getSnapshot().panes.find(pane => pane.linkedView?.kind === 'outline')!.id
  expect(await controller.renameActiveTitle('Renamed')).toBe(true)
  expect(controller.getPaneSnapshot(first).path).toBe('Renamed.md')
  expect(controller.getPaneSnapshot(second).path).toBe('Renamed.md')
  expect(controller.getPaneSnapshot(first).source).toContain('name: One')
  files.delete('Renamed.md')
  emit({ kind: 'entry', action: 'trashed', fromPath: 'Renamed.md', path: '.trash/Renamed.md', vault })
  await waitFor(() => expect(controller.getPaneSnapshot(first).documentUnavailable).toBe(true))
  expect(await controller.loadLinkedView(first)).toBe(false)
  expect(controller.getPaneSnapshot(first).linkedError).toMatch(/unavailable/)
  await controller.dispose()
})

it('follows a clean external rename in an inactive source without rebinding to the focused editor', async () => {
  const { controller, files, emit } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  await controller.splitPane(source, 'horizontal')
  const other = controller.getSnapshot().focusedPaneId
  await controller.select('Two.md')
  files.set('Moved.md', files.get('One.md')!); files.delete('One.md')
  emit({ kind: 'entry', action: 'moved', fromPath: 'One.md', path: 'Moved.md', vault })
  await waitFor(() => expect(controller.getPaneSnapshot(linked).path).toBe('Moved.md'))
  expect(controller.getSnapshot().focusedPaneId).toBe(other)
  expect(controller.getSnapshot().path).toBe('Two.md')
  await controller.dispose()
})

it('shows graph pending, failure, retry and incomplete output without a global graph toggle', async () => {
  const { controller, remote } = fixture()
  let reject!: (error: Error) => void
  let first = true
  remote.tocktutorWorkbench.graph = async request => {
    if (first) { first = false; await new Promise<void>((_resolve, fail) => { reject = fail }) }
    return { ok: true, value: { generation: 1, path: request.path!, nodes: [], edges: [], orphans: [], missing: [], complete: false, truncated: true, warnings: [], scan: { bytes: 1, files: 1, entries: 1 }, truncationReason: 'result-limit' } }
  }
  await controller.syncLocation('/tocktutor/One.md')
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => controller.toggleTask(index)} />
  }
  const view = render(<Harness />)
  try {
    act(() => { void controller.openLinkedView(controller.getSnapshot().focusedPaneId, 'graph') })
    const pane = screen.getByRole('region', { name: 'Local Graph Linked View' })
    expect(within(pane).getByText('Loading local graph…')).toBeTruthy()
    await waitFor(() => expect(reject).toBeTypeOf('function'))
    await act(async () => { reject(new Error('Graph offline')) })
    await waitFor(() => expect(within(pane).getByText('Graph offline')).toBeTruthy())
    fireEvent.click(within(pane).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(pane).getByText('Graph results are incomplete because the vault scan reached its limit.')).toBeTruthy())
    expect(within(pane).getAllByText('No graph nodes.').length).toBeGreaterThan(0)
    expect(within(pane).queryByRole('button', { name: 'Global', exact: true })).toBeNull()
  } finally { view.unmount(); await controller.dispose() }
})

it('routes Outline jumps to the represented Reading pane without switching its mode or scrolling another editor', async () => {
  const { controller } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  controller.setMode('reading')
  await controller.openLinkedView(source, 'outline')
  await controller.splitPane(source, 'horizontal')
  const other = controller.getSnapshot().focusedPaneId
  await controller.select('Two.md')
  controller.setMode('reading')
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => controller.toggleTask(index)} />
  }
  const view = render(<Harness />)
  try {
    const seats = Array.from(view.container.querySelectorAll<HTMLElement>('[data-pane-id]'))
    let sourceScrolls = 0, otherScrolls = 0
    await waitFor(() => expect(seats.find(seat => seat.dataset.paneId === source)!.querySelector('.tocktutor-reading h1')).toBeTruthy())
    seats.find(seat => seat.dataset.paneId === source)!.querySelector<HTMLElement>('.tocktutor-reading h1')!.scrollIntoView = () => { sourceScrolls++ }
    seats.find(seat => seat.dataset.paneId === other)!.querySelector<HTMLElement>('.tocktutor-reading h1')!.scrollIntoView = () => { otherScrolls++ }
    const outline = screen.getByRole('region', { name: 'Outline Linked View' })
    fireEvent.click(await within(outline).findByRole('button', { name: 'Go to One' }))
    await waitFor(() => expect(sourceScrolls).toBe(1))
    expect(otherScrolls).toBe(0)
    expect(controller.getPaneSnapshot(source).mode).toBe('reading')
    expect(controller.getSnapshot().focusedPaneId).toBe(source)
  } finally { view.unmount(); await controller.dispose() }
})


it('reports outgoing empty, unresolved, ambiguous, incomplete and retry states explicitly', async () => {
  const { remote } = fixture()
  const response = await remote.tocktutorWorkbench.links({ expectedVault: vault, path: 'One.md' })
  if (!response.ok) throw new Error('fixture failed')
  const links = response.value
  const selected: string[] = []
  let retries = 0
  const props = { links: null, onSelect: (path: string) => { selected.push(path) }, onRetry: () => { retries++ } }
  const view = render(<NoteOutgoingLinks {...props} loading />)
  expect(screen.getByRole('status').textContent).toContain('Loading outgoing')
  view.rerender(<NoteOutgoingLinks {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(retries).toBe(1)
  view.rerender(<NoteOutgoingLinks {...props} links={{ ...links, outgoingDetails: [] }} />)
  expect(screen.getByText('No outgoing links.')).toBeTruthy()
  view.rerender(<NoteOutgoingLinks {...props} links={{ ...links, complete: false, outgoingDetails: [...links.outgoingDetails, { ...links.outgoingDetails[0]!, authoredTarget: 'Missing', displayText: 'Missing', status: 'unresolved', resolvedPath: null }, { ...links.outgoingDetails[0]!, authoredTarget: 'Duplicate', displayText: 'Duplicate', status: 'ambiguous', resolvedPath: null }] }} />)
  expect(screen.getByText('Missing · Unresolved Target')).toBeTruthy()
  expect(screen.getByText('Duplicate · Ambiguous Target')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('incomplete')
  fireEvent.click(screen.getByRole('button', { name: 'Two · Two.md' }))
  expect(selected).toEqual(['Two.md'])
})

it('cancels linked result navigation when its leaf closes during a deferred destination read', async () => {
  const { controller, remote } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'outgoing-links')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  const original = remote.tocktutorWorkbench.openDocument
  let release!: () => void
  let entered = false
  remote.tocktutorWorkbench.openDocument = async (...args) => {
    if (args[0] === 'Two.md') { entered = true; await new Promise<void>(resolve => { release = resolve }) }
    return original(...args)
  }
  const pending = controller.navigateLinkedView(linked, 'Two.md')
  await waitFor(() => expect(entered).toBe(true))
  await controller.closePane(linked)
  release()
  expect(await pending).toBe(false)
  expect(controller.getPaneSnapshot(source).path).toBe('One.md')
  await controller.dispose()
})

it('closing the final source tab follows a remaining editor, not its now-empty pane', async () => {
  const { controller } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'outline')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  await controller.splitPane(source, 'horizontal')
  const other = controller.getSnapshot().focusedPaneId
  await controller.select('Two.md')
  await controller.focusPane(source)
  expect(await controller.closeTab(source, 'One.md')).toBe(true)
  expect(controller.getPaneSnapshot(linked).path).toBe('Two.md')
  expect(controller.getSnapshot().focusedPaneId).toBe(other)
  expect(controller.getSnapshot().path).toBe('Two.md')
  await controller.dispose()
})

it('rejects prior-generation graph and property callbacks after vault reload', async () => {
  const { controller, remote } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const propertyPane = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  const staleProperty = controller.bindLinkedProperty(propertyPane)
  let release!: () => void
  let signal: AbortSignal | undefined
  remote.tocktutorWorkbench.graph = async (request, abort) => {
    signal = abort
    await new Promise<void>(resolve => { release = resolve })
    return { ok: true, value: { generation: 1, path: request.path!, nodes: [{ path: request.path!, depth: 0 }], edges: [], orphans: [], missing: [], complete: true, truncated: false, warnings: [], scan: { bytes: 1, files: 1, entries: 1 }, truncationReason: null } }
  }
  const pending = controller.openLinkedView(source, 'graph')
  await waitFor(() => expect(release).toBeTypeOf('function'))
  const graphPane = controller.getSnapshot().panes.find(pane => pane.linkedView?.kind === 'graph')!.id
  const nextVault = { ...vault, generation: 2 }
  remote.tocktutorWorkbench.currentVault = () => ok({ displayPath: '~/Fixture', generation: 2, name: 'Fixture', vault: nextVault })
  const tree = remote.tocktutorWorkbench.listTree
  remote.tocktutorWorkbench.listTree = async (...args) => {
    const result = await tree(...args)
    if (!result.ok) return result
    return { ok: true, value: { ...result.value, generation: 2 } }
  }
  const read = remote.tocktutorWorkbench.openDocument
  remote.tocktutorWorkbench.openDocument = async (...args) => {
    const result = await read(...args)
    if (!result.ok) return result
    return { ok: true, value: { ...result.value, content: '# New generation\n', generation: 2 } }
  }
  remote.tocktutorWorkbench.readDraft = () => ok({ draft: null, generation: 2 })
  await controller.reload()
  expect(signal?.aborted).toBe(true)
  expect(staleProperty('name', 'Wrong vault')).toBe(false)
  release()
  expect(await pending).toBe(false)
  expect(controller.getPaneSnapshot(propertyPane).source).toBe('# New generation\n')
  expect(controller.getPaneSnapshot(graphPane).graph).toBeNull()
  await controller.dispose()
})

it('keeps a detached pinned draft authoritative after all editor tabs stop representing it', async () => {
  const { controller, files } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  controller.toggleLinkedPin(linked)
  controller.unlinkLinkedView(linked)
  controller.togglePinTab(source, 'One.md')
  await controller.select('Two.md')
  expect(controller.getSnapshot().panes.find(pane => pane.id === source)!.tabs.map(tab => tab.path)).toEqual(['Two.md'])
  expect(controller.bindLinkedProperty(linked)('name', 'Detached')).toBe(true)
  expect(controller.getPaneSnapshot(linked).source).toContain('name: Detached')
  expect(controller.getSnapshot().source).toBe('# Two\n')
  expect(await controller.closePane(linked)).toBe(true)
  expect(files.get('One.md')).toContain('name: Detached')
  expect(controller.getSnapshot().path).toBe('Two.md')
  await controller.dispose()
})


it('validates typed property input and does not turn an untouched null into an empty string', () => {
  const changes: Array<[string, unknown]> = []
  render(<MarkdownDocumentHeader editableProperties source={'---\namount: 3\ntags: [one, two]\ndone: false\noptional: null\n---\n'} onSetProperty={(key, value) => { changes.push([key, value]); return true }} />)
  fireEvent.blur(screen.getByLabelText('Property optional'))
  expect(changes).toEqual([])
  fireEvent.blur(screen.getByLabelText('Property amount'), { target: { value: 'NaN' } })
  expect(screen.getByRole('alert').textContent).toContain('finite number')
  expect(changes).toEqual([])
  fireEvent.blur(screen.getByLabelText('Property tags'), { target: { value: '[1]' } })
  expect(screen.getByRole('alert').textContent).toContain('list of strings')
  expect(changes).toEqual([])
  fireEvent.blur(screen.getByLabelText('Property amount'), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'done' }))
  expect(changes).toEqual([['amount', 4], ['done', true]])
})

it('saves the represented Properties document explicitly and retains failures for retry without touching the active editor', async () => {
  const { controller, remote, files } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'properties')
  const linked = controller.getSnapshot().panes.find(pane => pane.linkedView)!.id
  controller.toggleLinkedPin(linked)
  controller.unlinkLinkedView(linked)
  controller.togglePinTab(source, 'One.md')
  await controller.select('Two.md')
  controller.bindLinkedProperty(linked)('name', 'Saved Through Properties')
  const save = remote.tocktutorWorkbench.saveDocument
  remote.tocktutorWorkbench.saveDocument = () => Promise.reject(new Error('Disk full'))
  expect(await controller.saveLinkedView(linked)).toBe(false)
  expect(controller.getPaneSnapshot(linked).saveStatus).toBe('save-failed')
  expect(controller.getPaneSnapshot(linked).message).toBe('Disk full')
  expect(controller.getSnapshot().path).toBe('Two.md')
  remote.tocktutorWorkbench.saveDocument = save
  expect(await controller.saveLinkedView(linked)).toBe(true)
  expect(files.get('One.md')).toContain('name: Saved Through Properties')
  expect(files.get('Two.md')).toBe('# Two\n')
  await controller.dispose()
})


it('isolates linked keyboard origins at the actual native route listener while explicit Save owns A', async () => {
  const { remote, files } = fixture()
  let controller!: WorkbenchRouteController
  const sync = WorkbenchRouteController.prototype.syncLocation
  const spy = vi.spyOn(WorkbenchRouteController.prototype, 'syncLocation').mockImplementation(function (this: WorkbenchRouteController, ...args) { controller = this; return sync.apply(this, args) })
  const save = vi.spyOn(remote.tocktutorWorkbench, 'saveDocument')
  const platform = vi.spyOn(navigator, 'platform', 'get')
  const view = render(<TockTutorRoute location={{ pathname: '/tocktutor/One.md', search: '', hash: '' }} remote={remote as never} navigate={() => {}} renderSlot={() => null} />)
  try {
    await waitFor(() => expect(controller?.getSnapshot().path).toBe('One.md'))
    await act(async () => {
      const source = controller.getSnapshot().focusedPaneId
      await controller.openLinkedView(source, 'properties')
      await controller.splitPane(source, 'horizontal')
      await controller.select('Two.md')
      controller.setMode('source')
      controller.edit('# Two dirty\n')
    })
    const input = await screen.findByLabelText('Property name')
    input.focus()
    for (const [os, modifier] of [['MacIntel', { metaKey: true }], ['Linux', { ctrlKey: true }]] as const) {
      platform.mockReturnValue(os)
      for (const key of ['b', 's']) {
        const event = new KeyboardEvent('keydown', { key, ...modifier, bubbles: true, cancelable: true })
        act(() => { input.dispatchEvent(event) })
        expect(event.defaultPrevented).toBe(true)
        expect(controller.getSnapshot().source).toBe('# Two dirty\n')
        expect(save).not.toHaveBeenCalled()
      }
      for (const key of ['a', 'c', 'v', 'z', 'ArrowLeft', 'Tab']) {
        const event = new KeyboardEvent('keydown', { key, ...modifier, bubbles: true, cancelable: true })
        input.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
    }
    for (const key of ['b', 'Tab', 'ArrowLeft', 'Backspace', 'Enter']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    fireEvent.blur(input, { target: { value: 'Only A' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Properties Linked View' })).getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => expect(files.get('One.md')).toContain('name: Only A'))
    expect(save.mock.calls.map(([request]) => request.path)).toEqual(['One.md'])
    expect(files.get('Two.md')).toBe('# Two\n')
  } finally { view.unmount(); await controller?.dispose(); spy.mockRestore(); save.mockRestore(); platform.mockRestore() }
})

it('round-trips an empty linked string-list input through source and typed parsing and edits it again', async () => {
  const { controller, files } = fixture()
  files.set('One.md', '---\naliases: [one]\n---\n# Body\n')
  await controller.syncLocation('/tocktutor/One.md')
  await controller.openLinkedView(controller.getSnapshot().focusedPaneId, 'properties')
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onEdit={() => {}} onMode={() => {}} onSave={() => {}} onSelect={() => {}} onMoveCanvas={() => {}} onToggleTask={() => false} />
  }
  const view = render(<Harness />)
  try {
    fireEvent.blur(await screen.findByLabelText('Property aliases'), { target: { value: '[]' } })
    expect(controller.getSnapshot().source).toContain('aliases: []\n')
    expect(parseFrontmatterProperties(controller.getSnapshot().source)).toEqual([{ key: 'aliases', type: 'list', value: [] }])
    fireEvent.blur(screen.getByLabelText('Property aliases'), { target: { value: '["again"]' } })
    expect(parseFrontmatterProperties(controller.getSnapshot().source)).toEqual([{ key: 'aliases', type: 'list', value: ['again'] }])
    expect(controller.getSnapshot().source).toContain('---\n# Body\n')
  } finally { view.unmount(); await controller.dispose() }
})

it('refreshes shared linked relationships when other notes change, disappear or resolve an outgoing target', async () => {
  const { controller, remote, files, emit } = fixture()
  files.set('One.md', '# One\n[[Missing]]\n')
  const calls: Array<{ path: string; signal?: AbortSignal }> = []
  remote.tocktutorWorkbench.links = async (request, signal) => {
    calls.push({ path: request.path, ...(signal ? { signal } : {}) })
    const backlinks = files.get('Two.md')?.includes('[[One]]') ? ['Two.md'] : []
    return { ok: true, value: { generation: 1, path: request.path, backlinks, backlinkDetails: [], outgoing: files.has('Missing.md') ? ['Missing.md'] : [], outgoingDetails: [{ sourcePath: request.path, resolvedPath: files.has('Missing.md') ? 'Missing.md' : null, status: files.has('Missing.md') ? 'resolved' : 'unresolved', line: 2, authoredTarget: 'Missing', displayText: 'Missing', kind: 'wiki', fragment: null, normalizedTarget: 'Missing' }], unlinkedMentions: [], cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [], scan: { entries: 2, bytes: 1, files: 2 }, tagRelations: [] } }
  }
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'backlinks')
  await controller.openLinkedView(source, 'outgoing-links')
  const linked = controller.getSnapshot().panes.filter(pane => pane.linkedView).map(pane => pane.id)
  expect(controller.getPaneSnapshot(linked[1]!).links?.outgoingDetails[0]?.status).toBe('unresolved')
  await controller.splitPane(source, 'horizontal')
  await controller.select('Two.md')
  for (const content of ['# Two\n[[One]]', '# Two\n', '# Two\n[[One]]']) {
    const before = calls.filter(call => call.path === 'One.md').length
    files.set('Two.md', content)
    emit({ kind: 'entry', action: 'updated', path: 'Two.md', vault })
    await waitFor(() => expect(calls.filter(call => call.path === 'One.md')).toHaveLength(before + 1))
    for (const id of linked) await waitFor(() => expect(controller.getPaneSnapshot(id).links?.backlinks).toEqual(content.includes('[[One]]') ? ['Two.md'] : []))
  }
  files.delete('Two.md')
  emit({ kind: 'entry', action: 'trashed', fromPath: 'Two.md', path: '.trash/Two.md', vault })
  await waitFor(() => expect(controller.getPaneSnapshot(linked[0]!).links?.backlinks).toEqual([]))
  files.set('Missing.md', '# Resolved\n')
  emit({ kind: 'entry', action: 'created', path: 'Missing.md', vault })
  await waitFor(() => expect(controller.getPaneSnapshot(linked[1]!).links?.outgoing).toEqual(['Missing.md']))
  expect(controller.getPaneSnapshot(linked[1]!).links?.outgoingDetails[0]?.status).toBe('resolved')
  expect(calls.filter(call => call.path === 'One.md').some(call => call.signal?.aborted)).toBe(false)
  await controller.dispose()
})

it('coalesces refreshed relationships across consumers and embedded backlinks, cancels superseded work and rejects old-vault delivery', async () => {
  const { controller, remote, emit } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'backlinks')
  await controller.openLinkedView(source, 'outgoing-links')
  controller.updateSettings({ backlinksInDocument: true })
  await controller.loadRelationships()
  const linked = controller.getSnapshot().panes.filter(pane => pane.linkedView).map(pane => pane.id)
  const pending: Array<{ signal: AbortSignal | undefined; release(backlinks: string[]): void }> = []
  remote.tocktutorWorkbench.links = (request, signal) => new Promise(resolve => {
    pending.push({ signal, release: backlinks => resolve({ ok: true, value: { generation: 1, path: request.path, backlinks, backlinkDetails: [], outgoing: [], outgoingDetails: [], cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [], scan: { entries: 2, bytes: 1, files: 2 }, tagRelations: [] } }) })
  })
  emit({ kind: 'tree', action: 'changed', vault })
  await waitFor(() => expect(pending).toHaveLength(1))
  await controller.closePane(linked[0]!)
  expect(pending[0]!.signal?.aborted).toBe(false)
  emit({ kind: 'tree', action: 'changed', vault })
  await waitFor(() => expect(pending).toHaveLength(2))
  expect(pending[0]!.signal?.aborted).toBe(true)
  expect(pending[1]!.signal?.aborted).toBe(false)
  pending[1]!.release([])
  await waitFor(() => expect(controller.getPaneSnapshot(linked[1]!).links?.backlinks).toEqual([]))
  pending[0]!.release(['Old.md'])
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(controller.getPaneSnapshot(linked[1]!).links?.backlinks).toEqual([])
  emit({ kind: 'tree', action: 'changed', vault })
  await waitFor(() => expect(pending).toHaveLength(3))
  remote.tocktutorWorkbench.currentVault = () => ok({ generation: 2, vault: null, name: null, displayPath: null })
  await controller.reload()
  expect(pending[2]!.signal?.aborted).toBe(true)
  pending[2]!.release(['Old-vault.md'])
  emit({ kind: 'tree', action: 'changed', vault })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(controller.getSnapshot().links).toBeNull()
  expect(controller.getSnapshot().vault).toBeNull()
  expect(pending).toHaveLength(3)
  await controller.dispose()
})

it('preserves exact source when linked Properties rejects authored structured list edits', async () => {
  const { controller, files } = fixture()
  const source = '---\nitems:\n  - child: original\n---\n# Body\n'
  files.set('One.md', source)
  await controller.syncLocation('/tocktutor/One.md')
  await controller.openLinkedView(controller.getSnapshot().focusedPaneId, 'properties')
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onEdit={() => {}} onMode={() => {}} onSave={() => {}} onSelect={() => {}} onMoveCanvas={() => {}} onToggleTask={() => false} />
  }
  const view = render(<Harness />)
  try {
    fireEvent.blur(await screen.findByLabelText('Property items'), { target: { value: '["child: original", "added"]' } })
    expect(controller.getSnapshot().source).toBe(source)
    expect(files.get('One.md')).toBe(source)
    expect(screen.getByRole('alert').textContent).toContain('Source Mode')
  } finally { view.unmount(); await controller.dispose() }
})

it('does not clear another editor utility snapshot when invalidating linked relationship hydration', async () => {
  const { controller, remote, emit } = fixture()
  await controller.syncLocation('/tocktutor/One.md')
  const source = controller.getSnapshot().focusedPaneId
  await controller.openLinkedView(source, 'backlinks')
  await controller.splitPane(source, 'horizontal')
  await controller.select('Two.md')
  await waitFor(() => expect(controller.getSnapshot().links?.path).toBe('Two.md'))
  emit({ kind: 'tree', action: 'changed', vault })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(controller.getSnapshot().links?.path).toBe('Two.md')
  let release!: () => void
  let signal: AbortSignal | undefined
  const links = remote.tocktutorWorkbench.links
  remote.tocktutorWorkbench.links = async (request, abort) => {
    if (request.path === 'Two.md') { signal = abort; await new Promise<void>(resolve => { release = resolve }) }
    return links(request, abort)
  }
  const pending = controller.loadRelationships()
  await waitFor(() => expect(release).toBeTypeOf('function'))
  emit({ kind: 'tree', action: 'changed', vault })
  expect(signal?.aborted).toBe(false)
  release()
  expect(await pending).toBe(true)
  expect(controller.getSnapshot().links?.path).toBe('Two.md')
  await controller.dispose()
})

it('refreshes shared linked relationships after a successful peer save without relying on a delivered notification', async () => {
  const { controller, remote, files } = fixture()
  const links = remote.tocktutorWorkbench.links
  let representedQueries = 0
  remote.tocktutorWorkbench.links = async (request, signal) => {
    const result = await links(request, signal)
    if (request.path !== 'One.md' || !result.ok) return result
    representedQueries++
    return { ...result, value: { ...result.value, backlinks: files.get('Two.md')?.includes('[[One]]') ? ['Two.md'] : [] } }
  }
  try {
    await controller.syncLocation('/tocktutor/One.md')
    const source = controller.getSnapshot().focusedPaneId
    await controller.openLinkedView(source, 'backlinks')
    await controller.openLinkedView(source, 'outgoing-links')
    const linked = controller.getSnapshot().panes.filter(pane => pane.linkedView).map(pane => pane.id)
    await controller.splitPane(source, 'horizontal')
    await controller.select('Two.md')
    const before = representedQueries
    controller.edit('# Two\n[[One]]\n')
    expect(await controller.save()).toBe(true)
    expect(files.get('Two.md')).toContain('[[One]]')
    for (const id of linked) await waitFor(() => expect(controller.getPaneSnapshot(id).links?.backlinks).toEqual(['Two.md']))
    expect(representedQueries).toBe(before + 1)
    controller.edit('# Two\n')
    expect(await controller.save()).toBe(true)
    for (const id of linked) await waitFor(() => expect(controller.getPaneSnapshot(id).links?.backlinks).toEqual([]))
    expect(representedQueries).toBe(before + 2)
  } finally { await controller.dispose() }
})

it('refreshes peers for Properties Save but not failed or prior-vault save completions', async () => {
  const { controller, remote } = fixture()
  const links = remote.tocktutorWorkbench.links
  let queries = 0
  remote.tocktutorWorkbench.links = (request, signal) => { if (request.path === 'One.md') queries++; return links(request, signal) }
  const save = remote.tocktutorWorkbench.saveDocument
  try {
    await controller.syncLocation('/tocktutor/One.md')
    const source = controller.getSnapshot().focusedPaneId
    await controller.openLinkedView(source, 'backlinks')
    await controller.openLinkedView(source, 'outgoing-links')
    await controller.splitPane(source, 'horizontal')
    await controller.select('Two.md')
    await controller.openLinkedView(controller.getSnapshot().focusedPaneId, 'properties')
    const property = controller.getSnapshot().panes.find(pane => pane.linkedView?.kind === 'properties')!.id
    const before = queries
    expect(controller.bindLinkedProperty(property)('title', 'Saved')).toBe(true)
    expect(await controller.saveLinkedView(property)).toBe(true)
    await waitFor(() => expect(queries).toBe(before + 1))
    remote.tocktutorWorkbench.saveDocument = () => Promise.reject(new Error('Disk full'))
    expect(controller.bindLinkedProperty(property)('title', 'Failed')).toBe(true)
    expect(await controller.saveLinkedView(property)).toBe(false)
    expect(queries).toBe(before + 1)
    let release!: () => void
    remote.tocktutorWorkbench.saveDocument = async request => {
      await new Promise<void>(resolve => { release = resolve })
      return { ok: true, value: { generation: 1, path: request.path, revision, status: 'saved' } }
    }
    const pending = controller.saveLinkedView(property)
    await waitFor(() => expect(release).toBeTypeOf('function'))
    remote.tocktutorWorkbench.currentVault = () => ok({ generation: 2, vault: null, name: null, displayPath: null })
    await controller.reload()
    release()
    expect(await pending).toBe(false)
    expect(queries).toBe(before + 1)
    expect(controller.getSnapshot().links).toBeNull()
  } finally { remote.tocktutorWorkbench.saveDocument = save; await controller.dispose() }
})
