import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LauncherActionExpiredError, LauncherActionStore } from '../src/launcher-actions.ts'

function item(id = 'coder') {
  return {
    defaultAction: { argument: id, description: 'Focus', handlerKey: 'focus-workbench' },
    description: 'TockTeam composer',
    id,
    name: 'TockCoder',
    sourceExtension: 'TockTeam',
  }
}

test('launcher actions are opaque, owner-bound, expiring, replaced, and single-use', async () => {
  let now = 1_000
  let executed = 0
  let nextId = 0
  const store = new LauncherActionStore({
    createId: () => `fixed-${nextId++}`,
    execute: async record => { executed += 1; assert.ok(record.argument === 'coder' || record.argument === 'new') },
    now: () => now,
    ttlMs: 50,
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item()], owner })
  assert.equal(JSON.stringify(published).includes('focus-workbench'), false)
  assert.equal(JSON.stringify(published).includes('"argument"'), false)
  assert.equal(JSON.stringify(published).includes('"handlerKey"'), false)
  await assert.rejects(
    store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner: { ...owner, webContentsId: 42 } }),
    /another window/u,
  )
  now = 1_051
  await assert.rejects(
    store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner }),
    error => error instanceof LauncherActionExpiredError,
  )

  const current = store.publish({ items: [item()], owner })
  const replaced = store.publish({ items: [item('new')], owner })
  await assert.rejects(store.invoke({ actionId: current.items[0]!.defaultAction.actionId, owner }), /unknown/u)
  await store.invoke({ actionId: replaced.items[0]!.defaultAction.actionId, owner })
  await assert.rejects(store.invoke({ actionId: replaced.items[0]!.defaultAction.actionId, owner }), /already consumed/u)
  assert.equal(executed, 1)
})

test('explicit cancellation is owner- and result-set-bound and single-use', async () => {
  let release!: () => void
  let canceled = 0
  const store = new LauncherActionStore({
    cancel: async () => { canceled += 1; release(); return true },
    createId: () => 'fixed-cancel',
    execute: async () => await new Promise<void>(resolve => { release = resolve }),
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item()], owner })
  const actionId = published.items[0]!.defaultAction.actionId
  const invocation = store.invoke({ actionId, owner })
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(store.cancel({ actionId, owner, resultSetId: `launcher-results:${'1'.repeat(64)}` }), /result set/u)
  await assert.rejects(store.cancel({ actionId, owner, resultSetId: 'launcher-results:999' }), /result set|replaced/u)
  await assert.rejects(store.cancel({ actionId, owner: { ...owner, webContentsId: 42 }, resultSetId: published.resultSetId }), /another window|active/u)
  await store.cancel({ actionId, owner, resultSetId: published.resultSetId })
  await invocation
  assert.equal(canceled, 1)
  await assert.rejects(store.cancel({ actionId, owner, resultSetId: published.resultSetId }), /not active/u)
})

test('owner cleanup removes consumed active actions while their effect is settling', async () => {
  let release!: () => void
  const store = new LauncherActionStore({
    execute: async () => await new Promise<void>(resolve => { release = resolve }),
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item()], owner })
  const invocation = store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  await new Promise(resolve => setImmediate(resolve))
  store.clearOwner(owner)
  await assert.rejects(store.cancel({ actionId: published.items[0]!.defaultAction.actionId, owner, resultSetId: published.resultSetId }), /not active/u)
  release()
  await invocation
})

test('failed launcher effects are consumed and owner cleanup removes pending actions', async () => {
  const store = new LauncherActionStore({
    createId: (() => { let i = 0; return () => `id-${i++}` })(),
    execute: async () => { throw new Error('effect failed') },
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const first = store.publish({ items: [item()], owner })
  await assert.rejects(store.invoke({ actionId: first.items[0]!.defaultAction.actionId, owner }), /effect failed/u)
  await assert.rejects(store.invoke({ actionId: first.items[0]!.defaultAction.actionId, owner }), /already consumed/u)
  const second = store.publish({ items: [item('second')], owner })
  store.clearOwner(owner)
  await assert.rejects(store.invoke({ actionId: second.items[0]!.defaultAction.actionId, owner }), /unknown/u)
  assert.throws(() => store.publish({ items: Array.from({ length: 201 }, (_, i) => item(`item-${i}`)), owner }), /item limit/u)
})
