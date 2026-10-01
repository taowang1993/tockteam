import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it } from 'vitest'
import { WorkbenchRouteController, TockTutorRouteView, type WorkbenchRouteRemote } from '../src/route.tsx'

const reference = { id: `vault:${'f'.repeat(64)}`, generation: 1 }
const revision = `file:${'a'.repeat(64)}`
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
afterEach(cleanup)

async function fixture() {
  let vault = reference
  let failFacets = false
  let facetsFlight: Promise<unknown> | null = null
  let failTypes = false
  let typesFlight: Promise<unknown> | null = null
  const assignments: Record<string, string> = {}
  const captured: string[] = []
  const source = '---\r\n# Keep\r\ncustom key: original\r\naliases: [Original]\r\n---\r\n# Body\r\n'
  const files = new Map([['One.md', source], ['Two.md', '# Two\n']])
  const remote = { $on: () => () => {}, tocktutorWorkbench: {
    currentVault: () => ok({ displayPath: '~/Fixture', generation: vault.generation, name: 'Fixture', vault }),
    listTree: () => ok({ complete: true, cursor: null, entries: [...files].map(([path, content]) => ({ kind: 'document', path, revision, size: content.length, createdAt: 1, modifiedAt: 1 })), generation: vault.generation, scan: { entries: files.size }, truncated: false, truncationReason: null, warnings: [] }),
    openDocument: (path: string) => ok({ content: files.get(path), digest: `sha256:${'a'.repeat(64)}`, generation: vault.generation, path, revision }),
    readDraft: () => ok({ draft: null, generation: vault.generation }), saveDraft: () => ok({ generation: vault.generation }), clearDraft: () => ok({ generation: vault.generation }),
    saveDocument: (request: { path: string; content: string }) => { files.set(request.path, request.content); return ok({ generation: vault.generation, path: request.path, revision, status: 'saved' }) },
    getObsidianPropertyRegistry: () => ok({ generation: vault.generation, revision: null, types: { ...assignments } }),
    setObsidianPropertyType: (request: { key: string; type: string }) => typesFlight ?? (failTypes ? Promise.reject(new Error('Settings changed; reload before retrying.')) : (assignments[request.key] = request.type, ok({ generation: vault.generation, revision, types: { ...assignments } }))),
    captureSnapshot: (request: { path: string; content: string }) => { captured.push(request.content); return ok({ generation: vault.generation, snapshot: { id: 'snapshot-1', path: request.path } }) },
    links: ({ path }: { path: string }) => ok({ generation: vault.generation, path, backlinks: [], backlinkDetails: [], outgoing: [], outgoingDetails: [], unlinkedMentions: [], complete: true, truncated: false, warnings: [] }),
    facets: () => facetsFlight ?? (failFacets ? Promise.reject(new Error('Unavailable')) : ok({ generation: vault.generation, tags: [{ tag: 'existing', count: 1 }], properties: [{ key: 'course', count: 1, types: ['string'] }], complete: false, truncated: true, warnings: [], scan: { entries: 1 } })),
  } } as unknown as WorkbenchRouteRemote
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  await controller.syncLocation('/tocktutor/One.md')
  controller.setMode('source')
  const owner = controller.getSnapshot().focusedPaneId
  function Harness() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} paneController={controller} onEdit={text => controller.edit(text)} onMode={mode => controller.setMode(mode)} onSave={() => { void controller.save() }} onSelect={path => { void controller.select(path) }} onMoveCanvas={() => {}} onToggleTask={index => controller.toggleTask(index)} />
  }
  return { controller, owner, Harness, source, files, assignments, captured, failTypes: (fail: boolean) => { failTypes = fail }, holdTypes: (flight: Promise<unknown> | null) => { typesFlight = flight }, changeVault: () => { vault = { id: `vault:${'e'.repeat(64)}`, generation: 2 } }, failFacets: (fail: boolean) => { failFacets = fail }, holdFacets: (flight: Promise<unknown> | null) => { facetsFlight = flight } }
}

it('binds rename, remove and set to an exact note lifetime and preserves saved bytes', async () => {
  const { controller, owner, source, files } = await fixture()
  try {
    const actions = controller.bindPropertyActions(owner)
    expect(actions.rename('custom key', 'new name')).toBe(true)
    expect(actions.set('new name', 'changed')).toBe(true)
    expect(actions.remove('aliases')).toBe(true)
    await controller.save()
    expect(files.get('One.md')).toBe(source.replace('custom key: original', 'new name: changed').replace('aliases: [Original]\r\n', ''))
    await controller.select('Two.md')
    expect(actions.set('wrong note', 'rejected')).toBe(false)
    expect(actions.rename('new name', 'wrong note')).toBe(false)
    expect(actions.remove('new name')).toBe(false)
    expect(controller.getSnapshot().source).toBe('# Two\n')
  } finally { await controller.dispose() }
})

it('keeps unfinished property input with its note across navigation and shares it with linked Properties', async () => {
  const { controller, owner } = await fixture()
  try {
    const drafts = controller.getPropertyDrafts(owner)
    drafts.set('unfinished', 'Keep this input')
    await controller.openLinkedView(owner, 'properties')
    const linked = controller.getSnapshot().panes.find(pane => pane.linkedView?.kind === 'properties')!.id
    expect(controller.getPropertyDrafts(linked)).toBe(drafts)
    await controller.select('Two.md')
    expect(controller.getPropertyDrafts(owner).size).toBe(0)
    await controller.select('One.md')
    expect(controller.getPropertyDrafts(owner).get('unfinished')).toBe('Keep this input')
  } finally { await controller.dispose() }
})

it('wires row actions in the actual Properties sidebar and saves the represented document', async () => {
  const { controller, owner, Harness, files, source } = await fixture()
  await controller.openLinkedView(owner, 'properties')
  const view = render(<Harness />)
  try {
    const sidebar = screen.getByRole('complementary', { name: 'Right Sidebar' })
    const button = await within(sidebar).findByRole('button', { name: 'Rename Property custom key' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    const input = within(sidebar).getByRole('textbox', { name: 'Rename Property custom key' })
    fireEvent.change(input, { target: { value: 'new name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(within(sidebar).getByLabelText('Property new name')).toBeTruthy())
    await act(async () => { fireEvent.click(within(sidebar).getByRole('button', { name: 'Save', exact: true })) })
    expect(files.get('One.md')).toBe(source.replace('custom key: original', 'new name: original'))
  } finally { view.unmount(); await controller.dispose() }
})

it('persists a conversion only after a recovery snapshot and keeps the original note on settings failure', async () => {
  const state = await fixture()
  try {
    state.controller.bindPropertyActions(state.owner).set('custom key', '42')
    const before = state.controller.getSnapshot().source
    state.failTypes(true)
    await expect(state.controller.changePropertyType(state.owner, 'custom key', 'number')).rejects.toThrow(/Settings changed/u)
    expect(state.controller.getSnapshot().source).toBe(before)
    expect(state.captured).toContain(before)
    state.failTypes(false)
    expect(await state.controller.changePropertyType(state.owner, 'custom key', 'number')).toBe(true)
    expect(state.assignments['custom key']).toBe('number')
    expect(state.controller.getSnapshot().source).toContain('custom key: 42\r\n')
    expect(state.controller.getSnapshot().source).toContain('# Keep\r\n')
  } finally { await state.controller.dispose() }
})

it('requires confirmation for loss and never edits a new note after a late type reply', async () => {
  const state = await fixture()
  try {
    state.controller.bindPropertyActions(state.owner).set('aliases', ['one', 'two'])
    await expect(state.controller.changePropertyType(state.owner, 'aliases', 'text')).rejects.toThrow(/confirm/iu)
    expect(state.assignments.aliases).toBeUndefined()
    const pending = Promise.withResolvers<unknown>()
    state.holdTypes(pending.promise)
    const change = state.controller.changePropertyType(state.owner, 'aliases', 'text', true)
    await waitFor(() => expect(state.captured.length).toBe(1))
    await state.controller.select('Two.md')
    pending.resolve({ ok: true, value: { generation: 1, revision, types: { aliases: 'text' } } })
    await expect(change).rejects.toThrow(/note changed/iu)
    expect(state.controller.getSnapshot().source).toBe('# Two\n')
    await state.controller.select('One.md')
    expect(state.controller.getSnapshot().source).toContain('  - one\r\n  - two\r\n')
  } finally { await state.controller.dispose() }
})

it('reports incomplete, failed and retried suggestions and rejects a late response from a previous vault', async () => {
  const state = await fixture()
  try {
    expect(await state.controller.loadFacets()).toBe(true)
    expect(state.controller.getPropertySuggestions()).toMatchObject({ names: ['course'], tags: ['existing'], status: 'ready', incomplete: true })
    state.failFacets(true)
    expect(await state.controller.loadFacets()).toBe(false)
    expect(state.controller.getPropertySuggestions().status).toBe('error')
    state.failFacets(false)
    expect(await state.controller.loadFacets()).toBe(true)
    const pending = Promise.withResolvers<unknown>()
    state.holdFacets(pending.promise)
    const old = state.controller.loadFacets()
    state.changeVault()
    await state.controller.reload()
    pending.resolve({ ok: true, value: { generation: 1, tags: [{ tag: 'old-vault', count: 1 }], properties: [], complete: true, truncated: false } })
    expect(await old).toBe(false)
    expect(state.controller.getPropertySuggestions().tags).not.toContain('old-vault')
  } finally { await state.controller.dispose() }
})
