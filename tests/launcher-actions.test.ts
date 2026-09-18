import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LauncherActionExpiredError, LauncherActionStore, launcherActionCompletion } from '../src/launcher-actions.ts'
import { createLauncherCoreSearch } from '../src/launcher-core-search.ts'

function item(id = 'coder', name = 'TockCoder') {
  return {
    defaultAction: { argument: id, description: 'Focus', handlerKey: 'focus-workbench' },
    description: 'TockTeam composer',
    id,
    name,
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

test('source-specific action TTLs keep deterministic fixture expiry scoped to one provider', async () => {
  let now = 1_000
  const store = new LauncherActionStore({
    createId: (() => { let next = 0; return () => `source-ttl-${next++}` })(),
    execute: async () => undefined,
    now: () => now,
    ttlMsForSource: source => source === 'Workflow' ? 50 : undefined,
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [{ ...item('workflow'), sourceExtension: 'Workflow' }, item('ordinary')], owner })
  const workflow = published.items[0]!
  const ordinary = published.items[1]!
  now = 1_051
  await assert.rejects(store.invoke({ actionId: workflow.defaultAction.actionId, owner }), error => error instanceof LauncherActionExpiredError)
  await store.invoke({ actionId: ordinary.defaultAction.actionId, owner })
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

test('active actions fence publication without invalidating their result set', async () => {
  let release!: () => void
  let canceled = 0
  const store = new LauncherActionStore({
    cancel: async () => { canceled += 1; release(); return true },
    createId: () => 'fixed-publication-fence',
    execute: async () => await new Promise<void>(resolve => { release = resolve }),
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item()], owner })
  const actionId = published.items[0]!.defaultAction.actionId
  const invocation = store.invoke({ actionId, owner })
  await new Promise(resolve => setImmediate(resolve))
  assert.throws(() => store.publish({ items: [item('late')], owner }), /active action/u)
  await store.cancel({ actionId, owner, resultSetId: published.resultSetId })
  await invocation
  assert.equal(canceled, 1)
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

test('only successfully completed default actions report their item identity', async () => {
  const observed: string[] = []
  const store = new LauncherActionStore({
    createId: (() => { let i = 0; return () => `observed-${i++}` })(),
    execute: async record => {
      if (record.argument === 'failed') throw new Error('effect failed')
    },
    onSuccessfulDefaultAction: record => { observed.push(record.resultItemId ?? 'missing'); return Promise.resolve() },
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({
    items: [{
      ...item('default'),
      additionalActions: [{ argument: 'additional', description: 'Additional', handlerKey: 'additional-action' }],
    }],
    owner,
  })
  await store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  await store.invoke({ actionId: published.items[0]!.additionalActions![0]!.actionId, owner })
  assert.deepEqual(observed, ['default'])

  const failed = store.publish({ items: [item('failed')], owner })
  await assert.rejects(store.invoke({ actionId: failed.items[0]!.defaultAction.actionId, owner }), /effect failed/u)
  assert.deepEqual(observed, ['default'])
})

test('usage observation failures do not fail a successful invocation', async () => {
  let executed = false
  const store = new LauncherActionStore({
    execute: async () => { executed = true },
    onSuccessfulDefaultAction: async () => { throw new Error('ranking persistence failed') },
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item('observed')], owner })
  await store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  assert.equal(executed, true)
})

test('successful default actions remain observable after invalidation clears active actions', async () => {
  const observed: string[] = []
  let store!: LauncherActionStore
  store = new LauncherActionStore({
    execute: async () => { store.clear() },
    onSuccessfulDefaultAction: record => { observed.push(record.resultItemId ?? 'missing'); return Promise.resolve() },
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item('self-invalidating')], owner })
  await store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  assert.deepEqual(observed, ['self-invalidating'])
})

test('denied default action completions do not report usage', async () => {
  const observed: string[] = []
  const store = new LauncherActionStore({
    execute: async () => launcherActionCompletion(true, false),
    onSuccessfulDefaultAction: record => { observed.push(record.resultItemId ?? 'missing'); return Promise.resolve() },
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item('denied')], owner })
  await store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  assert.deepEqual(observed, [])
})

test('invocation resolves with in-memory Recent while ranking persistence is deferred', async () => {
  let release!: () => void
  let persistenceStarted = false
  const persisted = new Promise<void>(resolve => { release = resolve })
  const core = createLauncherCoreSearch({
    initialIndexedItems: [item('first', 'First'), item('second', 'Second')],
    loadIndexedItems: async () => [item('first', 'First'), item('second', 'Second')],
    persistUsage: async () => {
      persistenceStarted = true
      await persisted
    },
  })
  await core.search('', { fuzziness: 0.5, maxSearchResultItems: 2, searchEngineId: 'fuzzysort' })
  const store = new LauncherActionStore({
    execute: async () => undefined,
    onSuccessfulDefaultAction: record => core.recordUsage(record.resultItemId ?? ''),
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item('second', 'Second')], owner })
  const invocation = store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  while (!persistenceStarted) await new Promise<void>(resolve => { setImmediate(resolve) })
  await invocation
  const immediate = await core.search('', { fuzziness: 0.5, maxSearchResultItems: 2, searchEngineId: 'fuzzysort' })
  assert.deepEqual(immediate.sections[0]?.items.map(result => result.id), ['second'])
  release()
  await core.flush()
})

test('canceled default actions do not report successful usage', async () => {
  let rejectExecution!: (error: Error) => void
  const store = new LauncherActionStore({
    cancel: async () => { rejectExecution(new Error('canceled')); return true },
    execute: async () => await new Promise<void>((_resolve, reject) => { rejectExecution = reject }),
    onSuccessfulDefaultAction: () => { throw new Error('must not be called') },
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item('canceled')], owner })
  const invocation = store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  await new Promise<void>(resolve => setImmediate(resolve))
  await store.cancel({ actionId: published.items[0]!.defaultAction.actionId, owner, resultSetId: published.resultSetId })
  await assert.rejects(invocation, /canceled/u)
})

test('cancellation suppresses usage even when the effect settles successfully', async () => {
  let release!: () => void
  let canceled = false
  const observed: string[] = []
  const store = new LauncherActionStore({
    cancel: async () => { canceled = true; release(); return true },
    execute: async () => await new Promise<void>(resolve => { release = resolve }),
    onSuccessfulDefaultAction: record => { observed.push(record.resultItemId ?? 'missing'); return Promise.resolve() },
  })
  const owner = { role: 'launcher' as const, webContentsId: 41 }
  const published = store.publish({ items: [item('settled')], owner })
  const invocation = store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  await new Promise<void>(resolve => setImmediate(resolve))
  await store.cancel({ actionId: published.items[0]!.defaultAction.actionId, owner, resultSetId: published.resultSetId })
  assert.equal(canceled, true)
  await invocation
  assert.deepEqual(observed, [])
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
