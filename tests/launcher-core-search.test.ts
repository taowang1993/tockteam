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
