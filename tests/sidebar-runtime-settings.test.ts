import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_SIDEBAR_RUNTIME_PREFERENCES,
  parseSidebarRuntimePreferences,
  SidebarRuntimeSettingsService,
} from '../plugins/sidebar/src/client/runtime-settings.ts'

test('sidebar runtime settings default missing upstream fields safely', () => {
  assert.deepEqual(parseSidebarRuntimePreferences({
    agentTerminalTools: true,
    interceptOpenPath: false,
  }), {
    ...DEFAULT_SIDEBAR_RUNTIME_PREFERENCES,
    agentTerminalTools: true,
    interceptOpenPath: false,
  })
})

test('sidebar runtime settings serialize revision-guarded updates', async () => {
  const writes: Array<{
    patch: Record<string, unknown>
    revision: number | undefined
  }> = []
  let value = { ...DEFAULT_SIDEBAR_RUNTIME_PREFERENCES }
  let revision = 4
  const service = new SidebarRuntimeSettingsService({
    settingsGet: async () => ({ revision, value }),
    settingsUpdate: async (patch, expectedRevision) => {
      writes.push({ patch, revision: expectedRevision })
      value = { ...value, ...patch }
      revision += 1
      return { revision, value }
    },
  })

  await service.start()
  await Promise.all([
    service.update({ agentTerminalTools: true }),
    service.update({ browserInterceptLinks: false }),
  ])

  assert.deepEqual(writes, [
    { patch: { agentTerminalTools: true }, revision: 4 },
    { patch: { browserInterceptLinks: false }, revision: 5 },
  ])
  assert.equal(service.getSnapshot().preferences.agentTerminalTools, true)
  assert.equal(service.getSnapshot().preferences.browserInterceptLinks, false)
  assert.equal(service.getSnapshot().revision, 6)
})

test('sidebar settings wait for startup before saving a reset', async () => {
  const loading = Promise.withResolvers<{ revision: number; value: unknown }>()
  const revisions: Array<number | undefined> = []
  const service = new SidebarRuntimeSettingsService({
    settingsGet: () => loading.promise,
    settingsUpdate: async (patch, revision) => {
      revisions.push(revision)
      return { revision: 8, value: patch }
    },
  })
  const starting = service.start()
  const resetting = service.reset()
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.deepEqual(revisions, [], 'a save must wait for the authoritative revision')
  loading.resolve({ revision: 7, value: { agentTerminalTools: true } })
  await Promise.all([starting, resetting])
  assert.deepEqual(revisions, [7])
  assert.equal(service.getSnapshot().revision, 8)
  assert.equal(service.getSnapshot().preferences.agentTerminalTools, false)
})

test('sidebar settings recover from another window changing the revision before a save', async () => {
  let value = { ...DEFAULT_SIDEBAR_RUNTIME_PREFERENCES }
  let revision = 4
  const service = new SidebarRuntimeSettingsService({
    settingsGet: async () => ({ revision, value }),
    settingsUpdate: async (patch, expectedRevision) => {
      if (expectedRevision !== revision) throw new Error('settings-conflict')
      value = { ...value, ...patch }
      return { revision: ++revision, value }
    },
  })
  await service.start()
  // Another window saves a separate setting after this window loaded.
  value = { ...value, browserInterceptLinks: false }
  revision += 1
  await service.update({ agentTerminalTools: true })
  assert.equal(service.getSnapshot().error, 'save')
  assert.equal(service.getSnapshot().revision, 5)
  assert.equal(service.getSnapshot().preferences.agentTerminalTools, false)
  assert.equal(service.getSnapshot().preferences.browserInterceptLinks, false)

  await service.update({ agentTerminalTools: true })
  assert.equal(service.getSnapshot().error, null)
  assert.equal(value.agentTerminalTools, true)
  assert.equal(value.browserInterceptLinks, false)
  assert.equal(revision, 6)
})

test('sidebar settings keep the last confirmed values when save and refresh both fail', async () => {
  let offline = false
  const service = new SidebarRuntimeSettingsService({
    settingsGet: async () => {
      if (offline) throw new Error('offline')
      return { revision: 7, value: { agentTerminalTools: true } }
    },
    settingsUpdate: async () => { throw new Error('offline') },
  })
  await service.start()
  const confirmed = service.getSnapshot().preferences
  offline = true
  await service.update({ agentTerminalTools: false })
  assert.deepEqual(service.getSnapshot(), {
    busy: false, error: 'save', preferences: confirmed, revision: 7,
  })
})

test('sidebar settings reconcile a committed save whose response was lost before queued edits', async () => {
  let value = { ...DEFAULT_SIDEBAR_RUNTIME_PREFERENCES }
  let revision = 1
  const service = new SidebarRuntimeSettingsService({
    settingsGet: async () => ({ revision, value }),
    settingsUpdate: async (patch, expectedRevision) => {
      assert.equal(expectedRevision, revision)
      value = { ...value, ...patch }
      revision += 1
      if (revision === 2) throw new Error('response lost')
      return { revision, value }
    },
  })
  await service.start()
  await Promise.all([
    service.update({ agentTerminalTools: true }),
    service.update({ browserInterceptLinks: false }),
  ])
  assert.deepEqual(service.getSnapshot(), {
    busy: false, error: null, preferences: value, revision: 3,
  })
  assert.equal(value.agentTerminalTools, true)
  assert.equal(value.browserInterceptLinks, false)
})
