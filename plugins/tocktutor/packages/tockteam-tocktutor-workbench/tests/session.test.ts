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
  createDirtySaveGate,
} from '../src/session.ts'

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
    [{ dirty: false, mode: 'reading', path: 'Folder/Renamed.md', pinned: false }],
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
