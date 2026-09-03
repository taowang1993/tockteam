import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addPaneGroup,
  captureOperation,
  createWorkbenchSession,
  hydrateWorkbenchSession,
  isCurrentOperation,
  markTabDirty,
  openNoteTab,
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
