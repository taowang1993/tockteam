import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addPaneGroup,
  closePaneGroup,
  captureOperation,
  createWorkbenchSession,
  hydrateWorkbenchSession,
  isCurrentOperation,
  markTabDirty,
  openNoteTab,
  renameNoteTabPath,
  mergeNoteTabPath,
  openLinkedPane,
  createDirtySaveGate,
} from '../src/session.ts'

test('merge coalesces existing destinations while retaining active, pinned and linked bindings', () => {
  let session = createWorkbenchSession('route', { id: 'vault', generation: 1 })
  session = openNoteTab(session, 'group-1', 'Destination.md')
  const destinationId = session.groups[0]!.activeTabId
  session = openNoteTab(session, 'group-1', 'Source.md', { pinned: true })
  session = openLinkedPane(session, 'group-1', 'outline').session
  const result = mergeNoteTabPath(session, 'Source.md', 'Destination.md')
  assert.equal(result.groups[0]!.tabs.length, 1)
  assert.equal(result.groups[0]!.activeTabId, destinationId)
  assert.equal(result.groups[0]!.tabs[0]!.pinned, true)
  assert.equal(result.groups[1]!.linkedView?.sourceTabId, destinationId)
  assert.equal(result.groups[1]!.linkedView?.path, 'Destination.md')
  assert.equal(session.groups[0]!.tabs.length, 2, 'input state remains unchanged')
})

test('hydrates only bounded, safe, unique pane and tab state', () => {
  const hydrated = hydrateWorkbenchSession({
    routeId: 'restored',
    vault: { id: 'vault-1', generation: 4 },
    focusedGroupId: 'group-1',
    groups: [
      {
        id: 'group-1',
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', path: 'Notes/one.md', pinned: false, mode: 'source', revision: 2, savedRevision: 2 },
          { id: 'tab-1', path: '../escape.md', pinned: true, mode: 'source', revision: 0, savedRevision: 0 },
          { id: 'tab-2', path: '/absolute.md', pinned: false, mode: 'reading', revision: 0, savedRevision: 0 },
        ],
      },
      { id: 'group-1', activeTabId: null, tabs: [] },
    ],
  })

  assert.equal(hydrated.routeId, 'restored')
  assert.equal(hydrated.groups.length, 1)
  assert.equal(hydrated.groups[0]?.tabs.length, 1)
  assert.equal(hydrated.groups[0]?.tabs[0]?.path, 'Notes/one.md')
  assert.equal(hydrated.groups[0]?.activeTabId, 'tab-1')
})

test('allocates a fresh pane id and deduplicates note tabs', () => {
  let session = createWorkbenchSession('route-1', { id: 'vault-1', generation: 1 })
  const first = addPaneGroup(session, 'left')
  session = first.session
  const second = addPaneGroup(session, 'left')
  assert.equal(first.groupId, 'left')
  assert.notEqual(second.groupId, 'left')

  session = openNoteTab(second.session, second.groupId, 'one.md')
  session = openNoteTab(session, second.groupId, 'one.md')
  assert.equal(session.groups.find(group => group.id === second.groupId)?.tabs.length, 1)
})

test('replaces an active unpinned note only when requested', () => {
  let session = createWorkbenchSession('route-1', { id: 'vault-1', generation: 1 })
  session = openNoteTab(session, session.focusedGroupId, 'one.md')
  const tabId = session.groups[0]?.tabs[0]?.id
  session = openNoteTab(session, session.focusedGroupId, 'two.md', { replaceActive: true })
  assert.deepEqual(session.groups[0]?.tabs.map(tab => tab.path), ['two.md'])
  assert.equal(session.groups[0]?.tabs[0]?.id, tabId)

  session = openNoteTab(session, session.focusedGroupId, 'three.md')
  assert.deepEqual(session.groups[0]?.tabs.map(tab => tab.path), ['two.md', 'three.md'])
})

test('renames the same note across every open pane without changing tab state', () => {
  let session = createWorkbenchSession('route-1', { id: 'vault-1', generation: 1 })
  session = openNoteTab(session, session.focusedGroupId, 'Folder/Note.md', { pinned: true, mode: 'source' })
  const second = addPaneGroup(session, 'pane-2')
  session = openNoteTab(second.session, second.groupId, 'Folder/Note.md', { mode: 'reading' })
  session = markTabDirty(session, 'group-1', 'Folder/Note.md', true)
  const renamed = renameNoteTabPath(session, 'Folder/Note.md', 'Folder/Renamed.md')

  assert.deepEqual(renamed.groups.map(group => group.tabs.map(tab => ({ dirty: tab.dirty, mode: tab.mode, path: tab.path, pinned: tab.pinned }))), [
    [{ dirty: true, mode: 'source', path: 'Folder/Renamed.md', pinned: true }],
    [{ dirty: true, mode: 'reading', path: 'Folder/Renamed.md', pinned: false }],
  ])
  assert.equal(renamed.groups.every(group => group.tabs.find(tab => tab.id === group.activeTabId)?.path === 'Folder/Renamed.md'), true)
  assert.equal(session.groups[0]?.tabs[0]?.path, 'Folder/Note.md')
  assert.equal(renameNoteTabPath(session, 'Folder/Note.md', 'Folder/../bad.md').groups[0]?.tabs[0]?.path, 'Folder/Note.md')
})

test('closes a focused pane onto its nearest sibling but keeps the final pane', () => {
  let session = createWorkbenchSession('route-1', { id: 'vault-1', generation: 1 })
  session = openNoteTab(session, session.focusedGroupId, 'one.md')
  const second = addPaneGroup(session, 'pane-2')
  session = openNoteTab(second.session, second.groupId, 'two.md')

  const closed = closePaneGroup(session, 'pane-2')
  assert.equal(closed.closed?.id, 'pane-2')
  assert.equal(closed.nextGroupId, 'group-1')
  assert.equal(closed.session.focusedGroupId, 'group-1')
  assert.deepEqual(closed.session.groups.map(group => group.id), ['group-1'])

  const protectedLast = closePaneGroup(closed.session, 'group-1')
  assert.equal(protectedLast.closed, null)
  assert.deepEqual(protectedLast.session.groups.map(group => group.id), ['group-1'])
})

test('coalesces a dirty save gate and blocks failed persistence', async () => {
  let session = createWorkbenchSession('route-1', { id: 'vault-1', generation: 1 })
  session = openNoteTab(session, session.focusedGroupId, 'one.md')
  session = markTabDirty(session, session.focusedGroupId, 'one.md', true)
  const tab = session.groups[0]?.tabs[0]
  if (tab === undefined) throw new Error('expected active tab')

  let saves = 0
  const gate = createDirtySaveGate(
    () => tab,
    async (candidate) => {
      saves += 1
      assert.equal(candidate.path, 'one.md')
      await Promise.resolve()
      return 'conflict' as const
    },
  )
  const [first, second] = await Promise.all([gate(), gate()])
  assert.deepEqual(first, { allowed: false, reason: 'conflict' })
  assert.deepEqual(second, first)
  assert.equal(saves, 1)
})

test('blocks a synchronous save failure instead of starting a transition', async () => {
  let session = createWorkbenchSession('route-1', { id: 'vault-1', generation: 1 })
  session = openNoteTab(session, session.focusedGroupId, 'one.md')
  session = markTabDirty(session, session.focusedGroupId, 'one.md', true)
  const tab = session.groups[0]?.tabs[0]
  if (tab === undefined) throw new Error('expected active tab')

  const gate = createDirtySaveGate(() => tab, () => {
    throw new Error('write failed')
  })
  assert.deepEqual(await gate(), { allowed: false, reason: 'failed' })
})

test('rejects late completions after vault, note, pane, or editor identity changes', () => {
  let session = createWorkbenchSession('route-1', { id: 'vault-1', generation: 1 })
  session = openNoteTab(session, session.focusedGroupId, 'one.md')
  const identity = captureOperation(session, session.focusedGroupId, 'one.md')
  assert.equal(isCurrentOperation(session, identity), true)

  const next = {
    ...session,
    vault: { id: 'vault-2', generation: 1 },
    editorRevision: session.editorRevision + 1,
  }
  assert.equal(isCurrentOperation(next, identity), false)
})

test('splits only the owning leaf, persists nested axes and collapses closed branches', async () => {
  const { splitPaneGroup, resizePaneSplit } = await import('../src/session.ts')
  const initial = openNoteTab(createWorkbenchSession('route'), 'group-1', 'Note.md', { mode: 'source' })
  const right = splitPaneGroup(initial, 'group-1', 'horizontal')
  const down = splitPaneGroup(right.session, right.groupId, 'vertical')
  assert.deepEqual(down.session.layout, { axis: 'horizontal', ratio: .5, children: [
    { groupId: 'group-1' }, { axis: 'vertical', ratio: .5, children: [{ groupId: right.groupId }, { groupId: down.groupId }] },
  ] })
  assert.equal(down.session.groups[2]?.tabs[0]?.path, 'Note.md')
  assert.equal(down.session.groups[2]?.tabs[0]?.mode, 'source')
  const resized = resizePaneSplit(down.session, [1], .7)
  assert.deepEqual(hydrateWorkbenchSession(JSON.parse(JSON.stringify(resized))).layout, resized.layout)
  assert.deepEqual(closePaneGroup(resized, down.groupId).session.layout, right.session.layout)
  for (const layout of [null, { groupId: 'missing' }, { axis: 'vertical', ratio: NaN, children: [] }, { axis: 'horizontal', ratio: .5, children: [{ groupId: 'group-1' }, { groupId: 'group-1' }] }]) {
    const repaired = hydrateWorkbenchSession({ ...down.session, layout })
    assert.deepEqual(repaired.groups, down.session.groups)
    assert.equal(JSON.stringify(repaired.layout).match(/groupId/g)?.length, 3)
  }
  const cyclic: any = { axis: 'horizontal', ratio: .5, children: [] }
  cyclic.children = [cyclic, cyclic]
  assert.equal(hydrateWorkbenchSession({ ...initial, layout: cyclic }).groups.length, 1)
})

test('bounds splits and repairs overdeep/orphaned layouts without dropping valid legacy tabs', async () => {
  const { splitPaneGroup, resizePaneSplit } = await import('../src/session.ts')
  let session = openNoteTab(createWorkbenchSession('route'), 'group-1', 'Note.md')
  for (let index = 0; index < 12; index += 1) session = splitPaneGroup(session, session.focusedGroupId, index % 2 ? 'vertical' : 'horizontal').session
  assert.equal(session.groups.length, 8)
  for (const group of session.groups) assert.equal(group.tabs[0]?.path, 'Note.md')
  const low = resizePaneSplit(session, [], -100)
  const high = resizePaneSplit(session, [], 100)
  assert.equal('ratio' in low.layout && low.layout.ratio, .15)
  assert.equal('ratio' in high.layout && high.layout.ratio, .85)
  const tooDeep = { axis: 'horizontal', ratio: .5, children: [session.layout, { groupId: 'orphan' }] }
  const restored = hydrateWorkbenchSession({ ...session, layout: tooDeep })
  assert.deepEqual(restored.groups, session.groups)
  assert.equal(JSON.stringify(restored.layout).match(/groupId/g)?.length, 8)
  const dirty = markTabDirty(session, 'group-1', 'Note.md', true)
  assert.equal(new Set(dirty.groups.flatMap(group => group.tabs.map(tab => tab.revision))).size, 1)
  assert.ok(dirty.groups.every(group => group.tabs.every(tab => tab.dirty)))
})

test('linked leaves bind a source tab, preserve pin ownership and detach to active-editor following', async () => {
  const { openLinkedPane, syncLinkedViews, setTabPinned, unlinkPane, toggleLinkedPanePin } = await import('../src/session.ts')
  let session = openNoteTab(createWorkbenchSession('linked', { id: 'vault-1', generation: 1 }), 'group-1', 'One.md')
  const sourceTabId = session.groups[0]!.activeTabId
  const opened = openLinkedPane(session, 'group-1', 'outline')
  session = opened.session
  const linked = () => session.groups.find(group => group.id === opened.groupId)!.linkedView!
  assert.equal(linked().sourceTabId, sourceTabId)
  assert.deepEqual(session.layout, { axis: 'horizontal', ratio: .5, children: [{ groupId: 'group-1' }, { groupId: opened.groupId }] })
  session = openNoteTab(session, 'group-1', 'Two.md', { replaceActive: true })
  assert.equal(linked().path, 'Two.md')
  session = toggleLinkedPanePin(session, opened.groupId)
  assert.equal(session.groups[0]!.tabs[0]!.pinned, true)
  session = openNoteTab(session, 'group-1', 'Three.md', { replaceActive: true })
  assert.equal(linked().path, 'Two.md')
  assert.equal(linked().pinned, true)
  session = setTabPinned(session, 'group-1', 'Two.md', false)
  session = unlinkPane(session, opened.groupId)
  assert.equal(linked().path, 'Three.md')
  assert.equal(linked().sourceGroupId, null)
  session = toggleLinkedPanePin(session, opened.groupId)
  session = openNoteTab(session, 'group-1', 'Four.md', { replaceActive: true })
  assert.equal(linked().path, 'Three.md')
  session = toggleLinkedPanePin(session, opened.groupId)
  assert.equal(linked().path, 'Four.md')
  assert.deepEqual(hydrateWorkbenchSession(JSON.parse(JSON.stringify(session))), session)
  session = closePaneGroup(session, 'group-1').session
  assert.equal(linked().path, null)
  assert.equal(syncLinkedViews(session).groups.length, 1)
})

test('normalizes malformed linked ownership, preserves detached pin and remaps retained paths', async () => {
  const { openLinkedPane, toggleLinkedPanePin, focusPaneGroup } = await import('../src/session.ts')
  let session = openNoteTab(createWorkbenchSession('linked', { id: 'vault-1', generation: 1 }), 'group-1', 'One.md')
  const sourceTab = session.groups[0]!.activeTabId!
  const opened = openLinkedPane(session, 'group-1', 'properties')
  session = toggleLinkedPanePin(opened.session, opened.groupId)
  assert.equal('axis' in session.layout && session.layout.axis, 'vertical')
  const detached = closePaneGroup(session, 'group-1').session
  assert.deepEqual(detached.groups[0]!.linkedView, { kind: 'properties', sourceGroupId: null, sourceTabId: null, path: 'One.md', pinned: true })
  assert.equal(renameNoteTabPath(detached, 'One.md', 'Renamed.md').groups[0]!.linkedView?.path, 'Renamed.md')
  for (const [sourceGroupId, sourceTabId] of [['missing', sourceTab], ['group-1', 'missing'], [opened.groupId, sourceTab]]) {
    const restored = hydrateWorkbenchSession({ ...session, groups: session.groups.map(group => group.linkedView ? { ...group, linkedView: { ...group.linkedView, sourceGroupId, sourceTabId } } : group) })
    assert.equal(restored.groups[1]!.linkedView?.sourceGroupId, null)
    assert.equal(restored.groups[1]!.linkedView?.pinned, true)
  }
  const unsafe = hydrateWorkbenchSession({ ...detached, groups: detached.groups.map(group => ({ ...group, linkedView: { ...group.linkedView, path: '../escape.md' } })) })
  assert.equal(unsafe.groups[0]!.linkedView?.path, null)
  const added = addPaneGroup(session, 'other')
  session = openNoteTab(added.session, 'other', 'Other.md')
  assert.equal(focusPaneGroup(session, opened.groupId).focusedGroupId, 'other')
  for (const kind of ['backlinks', 'outgoing-links', 'properties', 'outline', 'graph'] as const) {
    const result = openLinkedPane(session, 'group-1', kind)
    assert.equal(result.session.groups.at(-1)?.linkedView?.kind, kind)
    assert.equal(result.session.groups.at(-1)?.tabs.length, 0)
  }
})
