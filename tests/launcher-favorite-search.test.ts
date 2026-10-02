import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLauncherCoreSearch } from '../src/launcher-core-search.ts'
import type { LauncherInternalResultItem } from '../src/launcher-actions.ts'

function item(id: string, name = 'Notes'): LauncherInternalResultItem {
  return {
    defaultAction: { argument: id, description: `Open ${name}`, handlerKey: 'focus-workbench' },
    description: 'Saved destination',
    id,
    name,
    sourceExtension: 'TockTeam',
  }
}

for (const searchEngineId of ['fuzzysort', 'Fuse.js'] as const) {
  test(`${searchEngineId} keeps the equally relevant pinned result when launch history is empty`, async () => {
    const core = createLauncherCoreSearch({
      initialFavoriteItemIds: ['pinned'],
      loadIndexedItems: async () => [item('ordinary'), item('pinned')],
    })
    try {
      const result = await core.search('Notes', { fuzziness: 0.5, maxSearchResultItems: 1, searchEngineId })
      assert.deepEqual(result.before.map(entry => entry.id), ['pinned'])
      assert.deepEqual(result.after, [])
      assert.deepEqual(result.sections.map(section => section.id), ['pinned'])
    } finally { await core.close() }
  })

  test(`${searchEngineId} applies pin and usage priority across large tied inventories`, async () => {
    const now = 100_000
    const inventory = [...Array.from({ length: 150 }, (_, index) => item(`ordinary-${index}`)), item('used'), item('pinned')]
    const core = createLauncherCoreSearch({
      initialFavoriteItemIds: ['pinned'],
      initialRanking: [{ id: 'used', lastUsedAt: now, score: 2, useCount: 2 }],
      loadIndexedItems: async () => inventory,
      now: () => now,
    })
    try {
      const options = { fuzziness: 0.5, maxSearchResultItems: 2, searchEngineId }
      const result = await core.search('Notes', options)
      assert.deepEqual(result.before.map(entry => entry.id), ['pinned'])
      assert.deepEqual(result.after.map(entry => entry.id), ['used'])
      core.replacePersistentSettings({ excludedItemIds: [], favoriteItemIds: [] })
      assert.equal((await core.search('Notes', options)).after[0]?.id, 'used')
      core.replaceRanking([])
      core.replacePersistentSettings({ excludedItemIds: [], favoriteItemIds: ['pinned'] })
      assert.deepEqual((await core.search('Notes', options)).before.map(entry => entry.id), ['pinned'])
    } finally { await core.close() }
  })

  test(`${searchEngineId} keeps a stronger ordinary match ahead of a weaker pinned match`, async () => {
    const core = createLauncherCoreSearch({
      initialFavoriteItemIds: ['pinned'],
      loadIndexedItems: async () => [item('pinned', 'Notes Archive'), item('ordinary')],
    })
    try {
      const result = await core.search('Notes', { fuzziness: 0.5, maxSearchResultItems: 1, searchEngineId })
      assert.deepEqual(result.before, [])
      assert.deepEqual(result.after.map(entry => entry.id), ['ordinary'])
    } finally { await core.close() }
  })
}
