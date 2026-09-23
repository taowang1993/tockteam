import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { EditorView } from '@codemirror/view'
import { undo, undoDepth } from '@codemirror/commands'
import { afterEach, expect, it } from 'vitest'
import { TockTutorRouteView, WorkbenchRouteController, type WorkbenchRouteRemote } from '../src/route.tsx'

const vault = { id: `vault:${'f'.repeat(64)}`, generation: 1 }
const revision = `file:${'a'.repeat(64)}`
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
afterEach(cleanup)

it.each(['editors', 'assistant', 'tabs', 'live-preview'] as const)('mounts real independent editors and keeps their seats through nested splits: %s', async check => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const files = new Map([['One.md', 'alpha\n'], ['Two.md', 'second\n']])
  const remote = { $on: () => () => {}, tocktutorWorkbench: {
    currentVault: () => ok({ displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault }),
    listTree: () => ok({ complete: true, cursor: null, entries: [...files.keys()].map(path => ({ kind: 'document', path, revision, size: 10, createdAt: 1, modifiedAt: 1 })), generation: 1, scan: { entries: 2 }, truncated: false, truncationReason: null, warnings: [] }),
    openDocument: (path: string) => ok({ content: files.get(path), digest: `sha256:${'a'.repeat(64)}`, generation: 1, path, revision }),
    readDraft: () => ok({ draft: null, generation: 1 }),
    saveDraft: () => ok({ generation: 1 }), clearDraft: () => ok({ generation: 1 }),
    saveDocument: (request: { path: string; content: string }) => { files.set(request.path, request.content); return ok({ generation: 1, path: request.path, revision, status: 'saved' }) },
  } } as unknown as WorkbenchRouteRemote
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  await controller.syncLocation('/tocktutor/One.md')
  controller.setMode(check === 'live-preview' ? 'live-preview' : 'source')
  const left = controller.getSnapshot().focusedPaneId
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onActivateTab={(id, path) => { void controller.activateTab(id, path) }} onFocusPane={id => { void controller.focusPane(id) }} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => controller.toggleTask(index)} onClosePane={id => { void controller.closePane(id) }} />
  }
  const view = render(<Harness />)
  await waitFor(() => expect(view.container.querySelectorAll('.cm-content')).toHaveLength(1))
  const original = view.container.querySelector('.cm-editor')!
  if (check === 'tabs') {
    for (const tab of screen.getAllByRole('tab')) {
      const panel = document.getElementById(tab.getAttribute('aria-controls')!)
      expect(panel?.getAttribute('role')).toBe('tabpanel')
      expect(panel?.closest('[data-pane-id]')?.getAttribute('data-pane-id')).toBe(left)
    }
  }
  if (check === 'assistant') {
    const toggle = screen.getByRole('button', { name: 'Open Assistant' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Assistant Panel').getAttribute('aria-hidden')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByLabelText('Assistant Panel').getAttribute('aria-hidden')).toBe('true')
  }

  fireEvent.pointerDown(screen.getByRole('button', { name: 'More Note Actions' }), { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Split Right' }))
  const right = controller.getSnapshot().focusedPaneId
  await waitFor(() => expect(view.container.querySelectorAll('.cm-content')).toHaveLength(2))
  expect(view.container.querySelector('.cm-editor')).toBe(original)
  if (check === 'tabs') {
    for (const tab of screen.getAllByRole('tab')) {
      const panel = document.getElementById(tab.getAttribute('aria-controls')!)
      expect(panel?.getAttribute('role')).toBe('tabpanel')
      expect(panel?.closest('[data-pane-id]')?.getAttribute('data-pane-id')).toBe(controller.getSnapshot().focusedPaneId)
    }
  }
  if (check === 'assistant') {
    const toggles = screen.getAllByRole('button', { name: 'Open Assistant' })
    fireEvent.click(toggles[0]!)
    expect(toggles.every(toggle => toggle.getAttribute('aria-expanded') === 'true')).toBe(true)
    fireEvent.click(toggles[1]!)
    expect(toggles.every(toggle => toggle.getAttribute('aria-expanded') === 'false')).toBe(true)
  }
  const seats = () => Array.from(view.container.querySelectorAll<HTMLElement>('[data-pane-id]'))
  const editor = (id: string) => EditorView.findFromDOM(seats().find(node => node.dataset.paneId === id)!.querySelector('.cm-editor')!)!
  act(() => editor(left).dispatch({ changes: { from: 0, to: 5, insert: 'omega' } }))
  await waitFor(() => expect(editor(right).state.doc.toString()).toBe('omega\n'))
  expect(undoDepth(editor(right).state)).toBe(0)
  act(() => editor(right).dispatch({ changes: { from: 0, to: 5, insert: 'sigma' } }))
  await waitFor(() => expect(editor(left).state.doc.toString()).toBe('sigma\n'))
  expect(undoDepth(editor(left).state)).toBe(0)
  expect(undo(editor(left))).toBe(false)
  // Search state is local, even while both panes show the same document.
  fireEvent.keyDown(seats().find(node => node.dataset.paneId === left)!, { key: 'f', ctrlKey: true })
  expect(within(seats().find(node => node.dataset.paneId === left)!).getByRole('searchbox', { name: 'Find in Note' })).toBeTruthy()
  expect(within(seats().find(node => node.dataset.paneId === right)!).queryByRole('searchbox', { name: 'Find in Note' })).toBeNull()
  fireEvent.pointerDown(within(seats().find(node => node.dataset.paneId === right)!).getByRole('button', { name: 'More Note Actions' }), { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Split Down' }))
  const down = controller.getSnapshot().focusedPaneId
  await waitFor(() => expect(view.container.querySelectorAll('.cm-content')).toHaveLength(3))
  expect(view.container.querySelector('.cm-editor')).toBe(original)
  const handle = screen.getByRole('separator', { name: 'Resize Down Split' })
  fireEvent.keyDown(handle, { key: 'End' })
  expect(handle.getAttribute('aria-valuenow')).toBe('85')
  expect(handle.getAttribute('aria-orientation')).toBe('horizontal')
  Object.assign(handle, { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} })
  Object.assign(screen.getByLabelText('Note Panes'), { getBoundingClientRect: () => ({ x: 0, y: 0, width: 1000, height: 1000, top: 0, left: 0, right: 1000, bottom: 1000, toJSON() {} }) })
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 850 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 500 })
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: 500 })
  expect(handle.getAttribute('aria-valuenow')).toBe('50')
  await act(async () => { await controller.closePane(down); await controller.focusPane(right); await controller.select('Two.md'); controller.setMode('source') })
  expect(screen.queryByRole('separator', { name: 'Resize Down Split' })).toBeNull()
  await waitFor(() => expect(editor(right).state.doc.toString()).toBe('second\n'))
  act(() => editor(left).dispatch({ changes: { from: 0, to: 5, insert: 'left' } }))
  act(() => editor(right).dispatch({ changes: { from: 0, to: 6, insert: 'right' } }))
  expect(controller.getPaneSnapshot(left).source).toBe('left\n')
  expect(controller.getPaneSnapshot(right).source).toBe('right\n')
  await act(async () => { await controller.saveAll() })
  const layout = controller.getSnapshot().layout
  view.unmount()
  await controller.dispose()
  const restored = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  await restored.syncLocation('/tocktutor')
  expect(restored.getSnapshot().layout).toEqual(layout)
  expect(restored.getPaneSnapshot(left).source).toBe('left\n')
  expect(restored.getPaneSnapshot(right).source).toBe('right\n')
  expect(restored.getPaneSnapshot(left).mode).toBe(check === 'live-preview' ? 'live-preview' : 'source')
  expect(restored.getPaneSnapshot(right).mode).toBe('source')
  await restored.dispose()
})

it('switches only the protected pane to Source Mode after another pane was focused', async () => {
  const protectedSource = '> [!note]\n> Keep this exact.\n'
  const otherSource = '# Other\n'
  const otherDraft = '# Other draft\n'
  const files = new Map([['Protected.md', protectedSource], ['Other.md', otherSource]])
  const remote = { $on: () => () => {}, tocktutorWorkbench: {
    currentVault: () => ok({ displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault }),
    listTree: () => ok({ complete: true, cursor: null, entries: [...files.keys()].map(path => ({ kind: 'document', path, revision, size: 10, createdAt: 1, modifiedAt: 1 })), generation: 1, scan: { entries: 2 }, truncated: false, truncationReason: null, warnings: [] }),
    openDocument: (path: string) => ok({ content: files.get(path), digest: `sha256:${'a'.repeat(64)}`, generation: 1, path, revision }),
    readDraft: () => ok({ draft: null, generation: 1 }),
    saveDraft: () => ok({ generation: 1 }), clearDraft: () => ok({ generation: 1 }),
  } } as unknown as WorkbenchRouteRemote
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Protected.md')
  controller.setMode('live-preview')
  const owner = controller.getSnapshot().focusedPaneId
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onActivateTab={(id, path) => { void controller.activateTab(id, path) }} onFocusPane={id => { void controller.focusPane(id) }} onEdit={text => { controller.edit(text) }} onMode={mode => { controller.setMode(mode) }} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => { controller.toggleTask(index) }} onClosePane={id => { void controller.closePane(id) }} />
  }
  const view = render(<Harness />)
  try {
    await waitFor(() => expect(view.container.querySelectorAll('.cm-editor')).toHaveLength(1), { timeout: 15_000 })
    await act(async () => { await controller.splitPane(owner, 'horizontal') })
    const other = controller.getSnapshot().focusedPaneId
    await act(async () => { await controller.select('Other.md'); controller.edit(otherDraft) })
    expect(controller.getSnapshot().focusedPaneId).toBe(other)
    expect(controller.getPaneSnapshot(other).source).toBe(otherDraft)
    expect(controller.getPaneSnapshot(other).saveStatus).toBe('unsaved')
    expect(controller.getPaneSnapshot(other).mode).toBe('live-preview')

    const ownerSeat = () => Array.from(view.container.querySelectorAll<HTMLElement>('[data-pane-id]')).find(node => node.dataset.paneId === owner)!
    await waitFor(() => expect(within(ownerSeat()).getByRole('button', { name: 'More Note Actions' })).toBeTruthy(), { timeout: 15_000 })
    expect(controller.getSnapshot().focusedPaneId).toBe(other)
    const ownerActions = within(ownerSeat()).getByRole('button', { name: 'More Note Actions' })
    fireEvent.keyDown(ownerActions, { key: 'Enter' })
    const sourceMode = await screen.findByRole('menuitemcheckbox', { name: 'Source Mode' })
    fireEvent.click(sourceMode)
    await waitFor(() => expect(controller.getPaneSnapshot(owner).mode).toBe('source'))
    expect(controller.getPaneSnapshot(owner).source).toBe(protectedSource)
    expect(controller.getPaneSnapshot(owner).saveStatus).toBe('saved')
    expect(controller.getPaneSnapshot(other).mode).toBe('live-preview')
    expect(controller.getPaneSnapshot(other).source).toBe(otherDraft)
    expect(controller.getPaneSnapshot(other).saveStatus).toBe('unsaved')
  } finally {
    view.unmount()
    await controller.dispose()
  }
})

it('renders a fresh Source embed after unrelated typing invalidates an in-flight target read', async () => {
  let release!: () => void
  let entered!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  let targetReads = 0
  const remote = { $on: () => () => {}, tocktutorWorkbench: {
    currentVault: () => ok({ displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault }),
    listTree: () => ok({ complete: true, cursor: null, entries: ['One.md', 'Second.md'].map(path => ({ kind: 'document', path, revision, size: 10, createdAt: 1, modifiedAt: 1 })), generation: 1, scan: { entries: 2 }, truncated: false, truncationReason: null, warnings: [] }),
    openDocument: async (path: string) => {
      if (path === 'Second.md' && ++targetReads === 1) { entered(); await pending }
      return ok({ content: path === 'Second.md' ? '# Rendered target body' : 'Before\n', digest: `sha256:${'a'.repeat(64)}`, generation: 1, path, revision })
    },
    readDraft: () => ok({ draft: null, generation: 1 }),
    saveDraft: () => ok({ generation: 1 }), clearDraft: () => ok({ generation: 1 }),
  } } as unknown as WorkbenchRouteRemote
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/One.md')
  controller.setMode('source')
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onActivateTab={() => {}} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => {}} onSelect={() => {}} onMoveCanvas={() => {}} onToggleTask={() => {}} />
  }
  const component = render(<Harness />)
  try {
    await waitFor(() => expect(component.container.querySelector('.cm-content')).toBeTruthy())
    act(() => controller.edit('Before\n\n![[Second.md]]\n'))
    await started
    const editor = EditorView.findFromDOM(component.container.querySelector('.cm-editor')!)!
    act(() => { const end = editor.state.doc.length; editor.dispatch({ changes: { from: end, insert: '\nUnrelated typing' }, selection: { anchor: end + 17 } }) })
    expect(targetReads).toBe(1)
    await act(async () => { release(); await pending })
    await waitFor(() => expect(component.container.querySelector('.tocktutor-source-embed-widget')?.textContent).toContain('Rendered target body'))
    expect(targetReads).toBe(2)
    expect(controller.getSnapshot().path).toBe('One.md')
    expect(controller.getSnapshot().source).toContain('Unrelated typing')
  } finally { release(); component.unmount(); await controller.dispose() }
})
