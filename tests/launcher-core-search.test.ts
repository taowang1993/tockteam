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
    const empty = await core.search('', { ...options, maxSearchResultItems: 2, searchEngineId })
    assert.deepEqual(empty.before.map(result => result.id), ['contacts'])
    assert.deepEqual(empty.after.map(result => result.id), ['chat'])
    const whitespace = await core.search('   ', { ...options, maxSearchResultItems: 2, searchEngineId })
    assert.deepEqual(whitespace.before.map(result => result.id), ['contacts'])
    assert.deepEqual(whitespace.after.map(result => result.id), ['chat'])
    const result = await core.search('code', { ...options, searchEngineId })
    assert.deepEqual(result.after.map(result => result.id), ['instant-before', 'coder', 'instant-after'])
    assert.deepEqual(result.sections.map(section => section.id), ['results'])
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
    assert.deepEqual((await core.search('', { ...options, maxSearchResultItems: 2, searchEngineId })).after.map(result => result.id), ['coder'])
  }
})

test('core exclusions suppress instant results in both provider positions', async () => {
  const core = createLauncherCoreSearch({
    initialExcludedItemIds: ['hidden-before', 'hidden-after'],
    loadIndexedItems: async () => [],
    searchInstant: async () => ({ before: [item('hidden-before', 'Hidden'), item('visible', 'Visible')], after: [item('hidden-after', 'Hidden')] }),
  })
  try {
    const result = await core.search('query', options)
    assert.deepEqual(result.after.map(item => item.id), ['visible'])
    assert.deepEqual(result.sections.flatMap(section => section.items.map(item => item.id)), ['visible'])
  } finally { await core.close() }
})

test('empty search publishes decayed recent items before deduplicated command and application sections', async () => {
  const now = 1_000_000
  const persisted: Array<Readonly<{ itemId: string; now: number }>> = []
  const core = createLauncherCoreSearch({
    initialFavoriteItemIds: ['pinned'],
    initialIndexedItems: [item('pinned', 'Pinned'), item('recent-command', 'Recent Command'), item('recent-app', 'Recent App')],
    initialRanking: [
      { id: 'recent-command', lastUsedAt: now - 30 * 24 * 60 * 60 * 1000, score: 3, useCount: 3 },
      { id: 'recent-app', lastUsedAt: now, score: 1, useCount: 1 },
      { id: 'stale', lastUsedAt: 1, score: 0.01, useCount: 1 },
    ],
    loadIndexedItems: async () => [
      { ...item('pinned', 'Pinned'), sourceExtension: 'BrowserBookmarks' },
      { ...item('recent-command', 'Recent Command'), sourceExtension: 'SystemCommands' },
      { ...item('recent-app', 'Recent App'), sourceExtension: 'ApplicationSearch' },
      { ...item('later-command', 'Later Command'), sourceExtension: 'SystemCommands' },
      { ...item('later-app', 'Later App'), sourceExtension: 'ApplicationSearch' },
    ],
    now: () => now,
    persistUsage: async (itemId, timestamp) => { persisted.push({ itemId, now: timestamp }) },
  })

  const empty = await core.search('', { ...options, maxSearchResultItems: 5 })
  assert.deepEqual(empty.sections.map(section => section.id), ['pinned', 'recent', 'commands', 'applications'])
  assert.deepEqual(empty.sections.map(section => section.items.map(result => result.id)), [
    ['pinned'],
    ['recent-command', 'recent-app'],
    ['later-command'],
    ['later-app'],
  ])
  assert.equal(new Set([...empty.before, ...empty.after].map(result => result.id)).size, 5)

  await core.recordUsage('later-app')
  assert.deepEqual(persisted, [{ itemId: 'later-app', now }])
  const updated = await core.search('', { ...options, maxSearchResultItems: 5 })
  assert.deepEqual(updated.sections[1]?.items.map(result => result.id), ['recent-command', 'later-app', 'recent-app'])
  core.replaceRanking([])
  const reset = await core.search('', { ...options, maxSearchResultItems: 5 })
  assert.equal(reset.sections.some(section => section.id === 'recent'), false)
})

test('empty search publishes ordered pinned, command, and application sections without content flood', async () => {
  const core = createLauncherCoreSearch({
    initialFavoriteItemIds: ['bookmark', 'app'],
    loadIndexedItems: async () => [
      { ...item('bookmark', 'Saved Docs'), sourceExtension: 'BrowserBookmarks' },
      { ...item('app', 'Calendar'), sourceExtension: 'ApplicationSearch' },
      { ...item('tutor', 'TockTutor'), sourceExtension: 'TockTeam' },
      { ...item('z-command', 'Z Command'), sourceExtension: 'SystemCommands' },
      { ...item('notes', 'Notes'), sourceExtension: 'ApplicationSearch' },
      { ...item('bookmark-2', 'Alpha Bookmark'), sourceExtension: 'BrowserBookmarks' },
      { ...item('file', 'Project File'), sourceExtension: 'SimpleFileSearch' },
    ],
  })

  const empty = await core.search('', { ...options, maxSearchResultItems: 5 })
  assert.deepEqual(empty.sections.map(section => section.id), ['pinned', 'commands', 'applications'])
  assert.deepEqual(empty.sections.map(section => section.items.map(result => result.id)), [
    ['bookmark', 'app'],
    ['tutor', 'z-command'],
    ['notes'],
  ])
  assert.deepEqual(empty.before.map(result => result.id), ['bookmark', 'app'])
  assert.deepEqual(empty.after.map(result => result.id), ['tutor', 'z-command', 'notes'])

  const capped = await core.search('', { ...options, maxSearchResultItems: 1 })
  assert.deepEqual(capped.sections.map(section => section.items.map(result => result.id)), [['bookmark']])

  const typed = await core.search('Alpha', { ...options, maxSearchResultItems: 5 })
  assert.deepEqual(typed.after.map(result => result.id), ['bookmark-2'])
})

test('successful usage updates the opening screen before persistence settles', async () => {
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
  await core.search('', { ...options, maxSearchResultItems: 2 })
  const usage = core.recordUsage('second')
  while (!persistenceStarted) await new Promise<void>(resolve => { setImmediate(resolve) })
  const immediate = await core.search('', { ...options, maxSearchResultItems: 2 })
  assert.deepEqual(immediate.sections.map(section => section.id), ['recent', 'commands'])
  assert.deepEqual(immediate.sections[0]?.items.map(result => result.id), ['second'])
  release()
  await usage
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

test('empty core search surfaces indexed provider status after rescan', async () => {
  const core = createLauncherCoreSearch({
    getIndexedError: () => 'Simple File Search is unavailable. Check configured roots.',
    loadIndexedItems: async () => [],
  })
  const result = await core.search('', options)
  assert.equal(result.status.lastError, 'Simple File Search is unavailable. Check configured roots.')
})

test('core search surfaces bounded instant provider status', async () => {
  const core = createLauncherCoreSearch({
    loadIndexedItems: async () => [],
    searchInstant: async () => ({ before: [], after: [], lastError: 'File Search is unavailable. Check the native provider configuration.' }),
  })
  const result = await core.search('tockteam:file-search:report', options)
  assert.equal(result.status.lastError, 'File Search is unavailable. Check the native provider configuration.')
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

test('favorite persistence remains unique when settings are synchronized during the write', async () => {
  let synchronizeFavorites: ((favoriteItemIds: readonly string[]) => void) | undefined
  const core = createLauncherCoreSearch({
    initialIndexedItems: [item('a', 'A')],
    loadIndexedItems: async () => [item('a', 'A')],
    persistSettings: async values => {
      synchronizeFavorites?.(Array.isArray(values.favorites) ? values.favorites.filter((id): id is string => typeof id === 'string') : [])
    },
  })
  synchronizeFavorites = favoriteItemIds => core.replacePersistentSettings({ excludedItemIds: [], favoriteItemIds })
  await core.search('', { ...options, maxSearchResultItems: 50 })
  await core.executeAction({
    actionId: 'launcher-action:add',
    argument: 'a',
    expiresAt: 2_000,
    handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.addFavorite,
    hideWindowAfterInvocation: false,
    owner: { role: 'launcher', webContentsId: 1 },
    requiresConfirmation: false,
    resultSetId: 'launcher-results:1',
    sourceExtension: 'TockTeam',
  })
  assert.deepEqual((await core.search('', { ...options, maxSearchResultItems: 50 })).before.map(value => value.id), ['a'])
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

test('persisted cache cannot publish actions when current providers fail validation', async () => {
  const core = createLauncherCoreSearch({
    initialIndexedItems: [{
      ...item('evil-item', 'Cached Item'),
      defaultAction: { argument: 'evil-item', description: 'Add Favorite', handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.addFavorite },
    }],
    loadIndexedItems: async () => { throw new Error('provider unavailable') },
  })
  const result = await core.search('', { ...options, maxSearchResultItems: 50 })
  assert.deepEqual(result.before, [])
  assert.deepEqual(result.after, [])
  assert.equal(result.status.rescanStatus, 'error')
})

test('rescan start immediately revokes core actions from the previous generation', async () => {
  let loads = 0
  let release: ((items: readonly LauncherInternalResultItem[]) => void) | undefined
  const core = createLauncherCoreSearch({
    loadIndexedItems: async () => {
      loads += 1
      if (loads === 1) return [item('old', 'Old')]
      return await new Promise(resolve => { release = resolve })
    },
  })
  await core.search('', { ...options, maxSearchResultItems: 50 })
  const pending = core.rescan()
  while (release === undefined) await new Promise<void>(resolve => { setImmediate(resolve) })
  await assert.rejects(core.executeAction({
    actionId: 'launcher-action:old',
    argument: 'old',
    expiresAt: 2_000,
    handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.addFavorite,
    hideWindowAfterInvocation: false,
    owner: { role: 'launcher', webContentsId: 1 },
    requiresConfirmation: false,
    resultSetId: 'launcher-results:1',
    sourceExtension: 'TockTeam',
  }), /unknown/u)
  release([])
  await pending
})

test('core flush waits for accepted rescans and close fences new work', async () => {
  let release: ((items: readonly LauncherInternalResultItem[]) => void) | undefined
  const core = createLauncherCoreSearch({
    loadIndexedItems: async () => await new Promise(resolve => { release = resolve }),
  })
  const rescan = core.rescan()
  while (release === undefined) await new Promise<void>(resolve => { setImmediate(resolve) })
  let flushed = false
  const flush = core.flush().then(() => { flushed = true })
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(flushed, false)
  release([item('current', 'Current')])
  await Promise.all([rescan, flush])
  await core.close()
  await assert.rejects(core.rescan(), /closed/u)
  await assert.rejects(core.search('', options), /closed/u)
})

test('core parent cancellation fences a delayed rescan commit', async () => {
  let release!: (items: readonly LauncherInternalResultItem[]) => void
  let loads = 0
  const core = createLauncherCoreSearch({
    initialIndexedItems: [item('old', 'Old')],
    loadIndexedItems: async () => {
      loads += 1
      if (loads === 1) return [item('old', 'Old')]
      return await new Promise(resolve => { release = resolve })
    },
  })
  await core.search('', { ...options, maxSearchResultItems: 50 })
  const controller = new AbortController()
  const pending = core.rescan(controller.signal)
  while (release === undefined) await new Promise<void>(resolve => setImmediate(resolve))
  controller.abort(new Error('owner cleared'))
  release([item('new', 'New')])
  await pending
  assert.deepEqual((await core.search('', { ...options, maxSearchResultItems: 50 })).after.map(value => value.id), ['old'])
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

test('excluding a pinned item does not restore it when another item is pinned', async () => {
  const persisted: Array<Readonly<Record<string, unknown>>> = []
  const core = createLauncherCoreSearch({
    initialFavoriteItemIds: ['a', 'c'],
    loadIndexedItems: async () => [item('a', 'A'), item('b', 'B'), item('c', 'C')],
    persistSettings: async values => { persisted.push(values) },
  })
  const record = {
    actionId: 'launcher-action:core', expiresAt: 2_000, hideWindowAfterInvocation: false,
    owner: { role: 'launcher' as const, webContentsId: 1 }, requiresConfirmation: false,
    resultSetId: 'launcher-results:1', sourceExtension: 'TockTeam',
  }
  try {
    await core.search('', { ...options, maxSearchResultItems: 50 })
    await core.executeAction({ ...record, argument: 'a', handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.exclude })
    await core.search('', { ...options, maxSearchResultItems: 50 })
    await core.executeAction({ ...record, argument: 'b', handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.addFavorite })
    assert.deepEqual(persisted, [
      { favorites: ['c'], 'searchEngine.excludedItems': ['a'] },
      { favorites: ['c', 'b'] },
    ])
    assert.deepEqual((await core.search('', { ...options, maxSearchResultItems: 50 })).before.map(value => value.id), ['c', 'b'])
  } finally { await core.close() }
})

test('invalidating the first search cannot publish unvalidated cached items', async () => {
  let release!: (items: readonly LauncherInternalResultItem[]) => void
  const core = createLauncherCoreSearch({
    initialIndexedItems: [item('cached', 'Cached')],
    loadIndexedItems: async () => await new Promise(resolve => { release = resolve }),
  })
  try {
    const pending = core.search('', { ...options, maxSearchResultItems: 50 })
    const rejected = assert.rejects(pending, /superseded|invalidated/u)
    core.invalidate('owner cleared during initial scan')
    release([item('fresh', 'Fresh')])
    await rejected
  } finally { await core.close() }
})
