import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it } from 'vitest'
import { LinkedNotePane } from '../src/linked-note-pane.tsx'
import { WorkbenchRouteController, TockTutorRouteView, type WorkbenchRouteRemote } from '../src/route.tsx'

const vault = { id: `vault:${'f'.repeat(64)}`, generation: 1 }
const revision = `file:${'a'.repeat(64)}`
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
afterEach(cleanup)

async function fixture() {
  const source = '---\nname: One\naliases: [Original]\n---\n# One\n'
  const files = new Map([['One.md', source]])
  let failSave = false
  const remote = { $on: () => () => {}, tocktutorWorkbench: {
    currentVault: () => ok({ displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault }),
    listTree: () => ok({ complete: true, cursor: null, entries: [{ kind: 'document', path: 'One.md', revision, size: source.length, createdAt: 1, modifiedAt: 1 }], generation: 1, scan: { entries: 1 }, truncated: false, truncationReason: null, warnings: [] }),
    openDocument: (path: string) => ok({ content: files.get(path), digest: `sha256:${'a'.repeat(64)}`, generation: 1, path, revision }),
    readDraft: () => ok({ draft: null, generation: 1 }),
    saveDraft: () => ok({ generation: 1 }), clearDraft: () => ok({ generation: 1 }),
    saveDocument: (request: { path: string; content: string }) => { if (failSave) return Promise.reject(new Error('Disk full')); files.set(request.path, request.content); return ok({ generation: 1, path: request.path, revision, status: 'saved' }) },
    links: ({ path }: { path: string }) => ok({ generation: 1, path, backlinks: [], backlinkDetails: [], outgoing: [], outgoingDetails: [], unlinkedMentions: [], complete: true, truncated: false, warnings: [] }),
  } } as unknown as WorkbenchRouteRemote
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  await controller.syncLocation('/tocktutor/One.md')
  controller.setMode('source')
  const owner = controller.getSnapshot().focusedPaneId
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} assistantPanel={<input aria-label="Assistant Draft" />} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => controller.toggleTask(index)} />
  }
  return { controller, owner, files, source, Harness, setFailSave: (failed: boolean) => { failSave = failed } }
}

it('omits the extra Properties toolbar without removing the note editor', async () => {
  const { controller, owner, Harness } = await fixture()
  await controller.openLinkedView(owner, 'properties')
  const view = render(<Harness />)
  try {
    const sidebar = screen.getByRole('complementary', { name: 'Right Sidebar' })
    const properties = within(sidebar).getByRole('region', { name: 'Properties Linked View' })
    await waitFor(() => expect(within(properties).getByLabelText('Property name')).toBeTruthy())
    for (const name of ['Unlink', 'Pin', 'Unpin', 'Close Properties Linked View']) expect(within(properties).queryByRole('button', { name, exact: true })).toBeNull()
    expect(within(properties).queryByText('Bound', { exact: true })).toBeNull()
    expect(within(properties).getByLabelText('Property name')).toBeTruthy()
    expect(screen.getByRole('tabpanel', { name: 'Note Editor' })).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Toggle Right Sidebar' })
    fireEvent.click(toggle)
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(controller.getSnapshot().panes.some(pane => pane.id === owner)).toBe(true)
    fireEvent.click(toggle)
    expect(within(sidebar).getByLabelText('Property name')).toBeTruthy()
  } finally { view.unmount(); await controller.dispose() }
})

it('preserves Properties and Assistant drafts without the extra toolbar and retains Save and retry', async () => {
  const { controller, owner, Harness, files, source, setFailSave } = await fixture()
  await controller.openLinkedView(owner, 'properties')
  const view = render(<Harness />)
  try {
    const sidebar = screen.getByRole('complementary', { name: 'Right Sidebar' })
    const chooser = within(sidebar).getByRole('radiogroup', { name: 'Right Sidebar View' })
    await waitFor(() => expect(within(sidebar).getByLabelText('Property name')).toBeTruthy())
    fireEvent.blur(within(sidebar).getByLabelText('Property name'), { target: { value: 'Changed' } })
    const listDraft = within(sidebar).getByLabelText('New aliases Value') as HTMLInputElement
    fireEvent.change(listDraft, { target: { value: 'Unsubmitted' } })
    fireEvent.click(within(chooser).getByRole('radio', { name: 'Assistant' }))
    const assistantDraft = within(sidebar).getByLabelText('Assistant Draft') as HTMLInputElement
    fireEvent.change(assistantDraft, { target: { value: 'Unsent question' } })
    fireEvent.click(within(chooser).getByRole('radio', { name: 'Properties' }))
    expect(listDraft.value).toBe('Unsubmitted')
    expect((within(sidebar).getByLabelText('Property name') as HTMLInputElement).value).toBe('Changed')
    setFailSave(true)
    await act(async () => { fireEvent.click(within(sidebar).getByRole('button', { name: 'Save', exact: true })) })
    expect(files.get('One.md')).toBe(source)
    expect(within(sidebar).getByRole('alert')).toBeTruthy()
    expect(listDraft.value).toBe('Unsubmitted')
    setFailSave(false)
    await act(async () => { fireEvent.click(within(sidebar).getByRole('button', { name: 'Save', exact: true })) })
    await waitFor(() => expect(within(sidebar).queryByRole('button', { name: 'Save', exact: true })).toBeNull())
    expect(files.get('One.md')).toBe(source.replace('name: One', 'name: Changed'))
    expect(listDraft.value).toBe('Unsubmitted')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Right Sidebar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Right Sidebar' }))
    expect(within(sidebar).getByLabelText('New aliases Value')).toBe(listDraft)
    fireEvent.click(within(chooser).getByRole('radio', { name: 'Assistant' }))
    expect(within(sidebar).getByLabelText('Assistant Draft')).toBe(assistantDraft)
    expect(assistantDraft.value).toBe('Unsent question')
  } finally { view.unmount(); await controller.dispose() }
})

it('retains relationship controls on other linked panes', async () => {
  const { controller, owner } = await fixture()
  await controller.openLinkedView(owner, 'backlinks')
  const id = controller.getSnapshot().panes.find(pane => pane.linkedView?.kind === 'backlinks')!.id
  const view = render(<LinkedNotePane controller={controller} id={id} />)
  try {
    const backlinks = screen.getByRole('region', { name: 'Backlinks Linked View' })
    expect(within(backlinks).getByRole('button', { name: 'Unlink', exact: true })).toBeTruthy()
    expect(within(backlinks).getByRole('button', { name: 'Pin', exact: true })).toBeTruthy()
    expect(within(backlinks).getByRole('button', { name: 'Close Backlinks Linked View' })).toBeTruthy()
  } finally { view.unmount(); await controller.dispose() }
})
