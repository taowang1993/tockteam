import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_CORE_ACTION_HANDLERS, createLauncherCoreSearch } from '../src/launcher-core-search.ts'
import type { LauncherInternalResultItem } from '../src/launcher-actions.ts'

function item(id: string, name: string): LauncherInternalResultItem {
  return {
    defaultAction: { argument: id, description: `Open ${name}`, handlerKey: 'focus-workbench' },
    description: `${name} destination`,
    id,
    name,
    sourceExtension: 'TockTeam',
  }
}

const options = { fuzziness: 0.5, maxSearchResultItems: 1, searchEngineId: 'fuzzysort' as const }

test('core search matches both engines, instant ordering, empty ordering, limits, favorites, and exclusions', async () => {
  for (const searchEngineId of ['fuzzysort', 'Fuse.js'] as const) {
    const core = createLauncherCoreSearch({
      initialFavoriteItemIds: ['contacts'],
      loadIndexedItems: async () => [item('coder', 'TockCoder'), item('contacts', 'Contacts'), item('chat', 'Chat')],
      searchInstant: async () => ({ before: [item('instant-before', 'Instant Before')], after: [item('instant-after', 'Instant After')] }),
    })
    const empty = await core.search('', { ...options, maxSearchResultItems: 1, searchEngineId })
    assert.deepEqual(empty.before.map(result => result.id), ['contacts'])
    assert.deepEqual(empty.after.map(result => result.id), ['chat'])
    const result = await core.search('code', { ...options, searchEngineId })
    assert.deepEqual(result.after.map(result => result.id), ['instant-before', 'coder', 'instant-after'])
    assert.equal(result.after[1]?.additionalActions?.some(action => action.handlerKey === 'launcher-add-favorite'), true)
    await core.search('', { ...options, maxSearchResultItems: 50, searchEngineId })
    await core.executeAction({
      actionId: 'launcher-action:core',
      argument: 'chat',
      expiresAt: 2_000,
      handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.exclude,
      hideWindowAfterInvocation: false,
      owner: { role: 'launcher', webContentsId: 1 },
      requiresConfirmation: false,
      resultSetId: 'launcher-results:1',
      sourceExtension: 'TockTeam',
    })
    assert.deepEqual((await core.search('', { ...options, searchEngineId })).after.map(result => result.id), ['coder'])
  }
})

test('core search serializes a stale in-flight index write before publishing the newest write', async () => {
  const persisted: string[][] = []
  let load = 0
  let releaseStaleLoad: ((values: readonly LauncherInternalResultItem[]) => void) | undefined
  let releaseCurrentLoad: ((values: readonly LauncherInternalResultItem[]) => void) | undefined
  let releaseStaleWrite: (() => void) | undefined
  let staleWriteStarted = false
  const core = createLauncherCoreSearch({
    loadIndexedItems: async () => {
      load += 1
      if (load === 1) return [item('initial', 'Initial')]
      return await new Promise<readonly LauncherInternalResultItem[]>(resolve => {
        if (load === 2) releaseStaleLoad = resolve
        else releaseCurrentLoad = resolve
      })
    },
    persistIndex: async values => {
      if (values[0]?.id === 'old' && !staleWriteStarted) {
        staleWriteStarted = true
        await new Promise<void>(resolve => { releaseStaleWrite = resolve })
      }
      persisted.push(values.map(value => value.id))
    },
  })
  await core.search('', options)
  const staleRescan = core.rescan()
  releaseStaleLoad?.([item('old', 'Old')])
  while (!staleWriteStarted) await new Promise<void>(resolve => { setImmediate(resolve) })
  const currentRescan = core.rescan()
  releaseCurrentLoad?.([item('new', 'New')])
  releaseStaleWrite?.()
  await Promise.all([staleRescan, currentRescan])
  assert.deepEqual(persisted.slice(-2), [['old'], ['new']])
})

test('core search keeps newest instant status and index persistence after races and failures', async () => {
  let releaseStale: (() => void) | undefined
  const stale = new Promise<void>(resolve => { releaseStale = resolve })
  const persisted: string[][] = []
  let load = 0
  let releaseOldRescan: ((values: readonly LauncherInternalResultItem[]) => void) | undefined
  let releaseNewRescan: ((values: readonly LauncherInternalResultItem[]) => void) | undefined
  const core = createLauncherCoreSearch({
    loadIndexedItems: async () => {
      load += 1
      if (load === 1) return [item('old', 'Old')]
      return await new Promise<readonly LauncherInternalResultItem[]>(resolve => {
        if (load === 2) releaseOldRescan = resolve
        else releaseNewRescan = resolve
      })
    },
    persistIndex: async values => { persisted.push(values.map(value => value.id)) },
    searchInstant: async term => {
      if (term === 'old') {
        await stale
        throw new Error('stale failure')
      }
      return { before: [], after: [] }
    },
  })
  await core.search('', options)
  const oldSearch = core.search('old', options)
  const current = await core.search('new', options)
  assert.deepEqual((await current).status.lastError, undefined)
  releaseStale?.()
  await oldSearch

  const staleRescan = core.rescan()
  const currentRescan = core.rescan()
  releaseNewRescan?.([item('new', 'New')])
  await currentRescan
  releaseOldRescan?.([item('old', 'Old')])
  await staleRescan
  assert.equal((await core.search('', options)).status.lastError, undefined)
  assert.deepEqual(persisted.at(-1), ['new'])
})

test('core search persists a queued snapshot after its successor fails', async () => {
  const persisted: string[][] = []
  let load = 0
  let releaseSeedWrite: (() => void) | undefined
  let seedWriteStarted = false
  const core = createLauncherCoreSearch({
    loadIndexedItems: async () => {
      load += 1
      if (load === 1) return [item('initial', 'Initial')]
      if (load === 2) return [item('seed', 'Seed')]
      if (load === 3) return [item('a', 'A')]
      throw new Error('B failed')
    },
    persistIndex: async values => {
      if (values[0]?.id === 'seed') {
        seedWriteStarted = true
        await new Promise<void>(resolve => { releaseSeedWrite = resolve })
      }
      persisted.push(values.map(value => value.id))
    },
  })
  await core.search('', options)
  persisted.length = 0
  const seedRescan = core.rescan()
  while (!seedWriteStarted) await new Promise<void>(resolve => { setImmediate(resolve) })
  const aRescan = core.rescan()
  await new Promise<void>(resolve => { setImmediate(resolve) })
  const bRescan = core.rescan()
  await bRescan
  releaseSeedWrite?.()
  await Promise.all([seedRescan, aRescan])
  assert.deepEqual(persisted, [['seed'], ['a']])
})

test('core search serializes concurrent favorite and exclusion persistence', async () => {
  const persisted: Array<Readonly<Record<string, unknown>>> = []
  let releaseFirst: (() => void) | undefined
  const core = createLauncherCoreSearch({
    initialIndexedItems: [item('a', 'A'), item('b', 'B'), item('c', 'C')],
    loadIndexedItems: async () => [item('a', 'A'), item('b', 'B'), item('c', 'C')],
    persistSettings: async values => {
      persisted.push(values)
      if (persisted.length === 1) await new Promise<void>(resolve => { releaseFirst = resolve })
    },
  })
  await core.search('', { ...options, maxSearchResultItems: 50 })
  const owner = { role: 'launcher' as const, webContentsId: 1 }
  const addFavorite = core.executeAction({
    actionId: 'launcher-action:add',
    argument: 'a',
    expiresAt: 2_000,
    handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.addFavorite,
    hideWindowAfterInvocation: false,
    owner,
    requiresConfirmation: false,
    resultSetId: 'launcher-results:1',
    sourceExtension: 'TockTeam',
  })
  const exclude = core.executeAction({
    actionId: 'launcher-action:exclude',
    argument: 'b',
    expiresAt: 2_000,
    handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.exclude,
    hideWindowAfterInvocation: false,
    owner,
    requiresConfirmation: false,
    resultSetId: 'launcher-results:1',
    sourceExtension: 'TockTeam',
  })
  while (persisted.length < 1) await new Promise<void>(resolve => { setImmediate(resolve) })
  releaseFirst?.()
  await Promise.all([addFavorite, exclude])
  assert.deepEqual(persisted, [
    { favorites: ['a'] },
    { favorites: ['a'], 'searchEngine.excludedItems': ['b'] },
  ])
  const result = await core.search('', { ...options, maxSearchResultItems: 50 })
  assert.deepEqual(result.before.map(value => value.id), ['a'])
  assert.deepEqual(result.after.map(value => value.id), ['c'])
})

test('core search rejects slow instant results from a superseded index generation', async () => {
  let releaseInstant: (() => void) | undefined
  const instantReady = new Promise<void>(resolve => { releaseInstant = resolve })
  let load = 0
  const core = createLauncherCoreSearch({
    loadIndexedItems: async () => {
      load += 1
      return load === 1 ? [item('old', 'Old')] : [item('new', 'New')]
    },
    searchInstant: async () => {
      await instantReady
      return { before: [item('instant-old', 'Instant Old')], after: [] }
    },
  })
  await core.search('', options)
  const slowSearch = core.search('old', options)
  await new Promise<void>(resolve => { setImmediate(resolve) })
  await core.rescan()
  releaseInstant?.()
  await assert.rejects(slowSearch, /superseded/u)
  const current = await core.search('', options)
  assert.deepEqual(current.after.map(value => value.id), ['new'])
  assert.equal(current.status.lastError, undefined)
})
