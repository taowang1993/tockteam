import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLauncherSettingsOperations } from '../src/launcher-settings-operations.ts'
import { launcherSettingRequiresProviderRescan } from '../src/launcher-setting-keys.ts'
import { attemptSecureRelaunchWithRecovery } from '../src/launcher-lifecycle.ts'
import { LAUNCHER_CORE_ACTION_HANDLERS, createLauncherCoreSearch } from '../src/launcher-core-search.ts'
import type { LauncherInternalResultItem } from '../src/launcher-actions.ts'

function item(id: string): LauncherInternalResultItem {
  return {
    defaultAction: { argument: id, description: `Open ${id}`, handlerKey: 'focus-workbench' },
    description: `${id} destination`,
    id,
    name: id,
    sourceExtension: 'TockTeam',
  }
}

const owner = { role: 'launcher' as const, webContentsId: 1 }

function favoriteAction(id: string, actionId = id) {
  return {
    actionId: `launcher-action:${actionId}`,
    argument: id,
    expiresAt: 2_000,
    handlerKey: LAUNCHER_CORE_ACTION_HANDLERS.addFavorite,
    hideWindowAfterInvocation: false,
    owner,
    requiresConfirmation: false,
    resultSetId: 'launcher-results:1',
    sourceExtension: 'TockTeam',
  } as const
}

test('settings replacement fences accepted core action persistence', async () => {
  const operations = createLauncherSettingsOperations({ isUnavailable: () => false })
  let state: Readonly<Record<string, unknown>> = {}
  let writes = 0
  let releaseFirstWrite: (() => void) | undefined
  const core = createLauncherCoreSearch({
    initialIndexedItems: [item('first'), item('second')],
    loadIndexedItems: async () => [item('first'), item('second')],
    persistSettings: async values => await operations.run(async () => {
      writes += 1
      if (writes === 1) await new Promise<void>(resolve => { releaseFirstWrite = resolve })
      state = values
    }, { mutation: true }),
  })
  await core.search('', { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' })

  const first = core.executeAction(favoriteAction('first'))
  while (releaseFirstWrite === undefined) await new Promise<void>(resolve => { setImmediate(resolve) })
  const second = core.executeAction(favoriteAction('second'))
  const reset = operations.run(async () => { state = {} }, {
    blockMutationsAfterSuccess: true,
    mutation: true,
  })

  releaseFirstWrite()
  await first
  await reset
  await assert.rejects(second, /mutations are closed/u)
  assert.deepEqual(state, {})
  assert.equal(writes, 1)
})

test('canceled settings replacement leaves later mutations available', async () => {
  const operations = createLauncherSettingsOperations({ isUnavailable: () => false })
  await operations.run(async () => ({ canceled: true as const, ok: true as const }), {
    blockMutationsAfterSuccess: true,
    mutation: true,
  })
  assert.equal(await operations.run(async () => 1, { mutation: true }), 1)
})

test('failed secure relaunch recovery reopens the settings mutation gate', async () => {
  const operations = createLauncherSettingsOperations({ isUnavailable: () => false })
  const persisted: string[] = []
  await operations.run(async () => { persisted.push('replacement') }, {
    blockMutationsAfterSuccess: true,
    mutation: true,
  })
  await assert.rejects(operations.run(async () => { persisted.push('blocked') }, { mutation: true }), /mutations are closed/u)

  let recoveries = 0
  const relaunched = await attemptSecureRelaunchWithRecovery({
    reconcile: async () => {
      recoveries += 1
      operations.reopenMutations()
    },
    relaunch: () => { throw new Error('relaunch unavailable') },
    report: () => {},
    requestQuit: () => {},
  })
  assert.equal(relaunched, false)
  assert.equal(recoveries, 1)
  await operations.run(async () => { persisted.push('ordinary') }, { mutation: true })
  assert.deepEqual(persisted, ['replacement', 'ordinary'])
})

test('presentation settings skip provider rescans while provider settings retain them', () => {
  assert.equal(launcherSettingRequiresProviderRescan('searchEngine.fuzziness'), false)
  assert.equal(launcherSettingRequiresProviderRescan('appearance.searchBarSize'), false)
  assert.equal(launcherSettingRequiresProviderRescan('window.alwaysOnTop'), false)
  assert.equal(launcherSettingRequiresProviderRescan('general.hotkey.enabled'), true)
  assert.equal(launcherSettingRequiresProviderRescan('extension[ApplicationSearch].macOsFolders'), true)
  assert.equal(launcherSettingRequiresProviderRescan('extensions.enabledExtensionIds'), true)
})

test('settings operation bounds queued mutation work', async () => {
  const operations = createLauncherSettingsOperations({ isUnavailable: () => false })
  let release!: () => void
  const first = operations.run(() => new Promise<void>(resolve => { release = resolve }), { mutation: true })
  await new Promise<void>(resolve => { setImmediate(resolve) })
  const queued = Array.from({ length: 64 }, () => operations.run(async () => undefined, { mutation: true }))
  await assert.rejects(operations.run(async () => undefined, { mutation: true }), /queue is full/u)
  release()
  await first
  await Promise.all(queued)
})

test('settings operation close drains accepted work and rejects new work', async () => {
  const operations = createLauncherSettingsOperations({ isUnavailable: () => false })
  let release: (() => void) | undefined
  const accepted = operations.run(async () => await new Promise<number>(resolve => {
    release = () => { resolve(1) }
  }), { mutation: true })
  let closed = false
  const close = operations.close().then(() => { closed = true })
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(closed, false)
  release?.()
  assert.equal(await accepted, 1)
  await close
  await assert.rejects(operations.run(async () => 2), /operations are closed/u)
})
