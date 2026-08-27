import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LAUNCHER_SETTINGS_IPC_CHANNELS,
  LAUNCHER_WINDOW_IPC_CHANNELS,
  registerLauncherWindowIpcHandlers,
  registerWorkbenchLauncherIpcHandlers,
} from '../src/launcher-window-ipc.ts'

class FakeIpcMain {
  readonly handlers = new Map<string, (...args: any[]) => unknown>()
  readonly removed: string[] = []
  handle(channel: string, handler: (...args: any[]) => unknown): void {
    if (this.handlers.has(channel)) throw new Error(`duplicate ${channel}`)
    this.handlers.set(channel, handler)
  }
  removeHandler(channel: string): void {
    this.removed.push(channel)
    this.handlers.delete(channel)
  }
}

test('launcher IPC registration owns only dismiss and disposes idempotently', async () => {
  const ipcMain = new FakeIpcMain()
  let guardCalls = 0
  let hides = 0
  const dispose = registerLauncherWindowIpcHandlers({
    controller: { hide: () => { hides += 1 } },
    guard: { assert: () => { guardCalls += 1; return { role: 'launcher', webContentsId: 1 } } },
    ipcMain,
  })
  const handler = ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.dismiss)
  assert.ok(handler)
  await handler?.({})
  assert.equal(hides, 1)
  assert.equal(guardCalls, 1)
  assert.throws(() => handler?.({}, 'extra'), /does not accept arguments/u)
  assert.equal(hides, 1)
  dispose()
  dispose()
  assert.deepEqual(ipcMain.removed, [LAUNCHER_WINDOW_IPC_CHANNELS.dismiss])
})

test('launcher theme and settings operations remain owner-bound and strict', async () => {
  const ipcMain = new FakeIpcMain()
  let hides = 0
  let settings = 0
  const dispose = registerLauncherWindowIpcHandlers({
    controller: { hide: () => { hides += 1 } },
    getTheme: () => ({ mode: 'dark', skinId: null, revision: 3 }),
    guard: { assert: () => ({ role: 'launcher', webContentsId: 2 }) },
    ipcMain,
    openSettings: () => { settings += 1 },
  })
  const getTheme = ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.getTheme)
  const openSettings = ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.openSettings)
  assert.deepEqual(await getTheme?.({}), { mode: 'dark', skinId: null, revision: 3 })
  await openSettings?.({})
  assert.equal(hides, 1)
  assert.equal(settings, 1)
  await assert.rejects(async () => await getTheme?.({}, 'extra'), /arguments/u)
  dispose()
})

test('workbench settings handlers guard before parsing and keep native effects argument-free', async () => {
  const ipcMain = new FakeIpcMain()
  let trusted = true
  const calls: string[] = []
  const dispose = registerWorkbenchLauncherIpcHandlers({
    assertTrustedMainIpc: () => { if (!trusted) throw new Error('untrusted') },
    controller: { getState: () => ({ visible: false } as never), show: async () => {} },
    ipcMain,
    settings: {
      getSnapshot: () => ({ externalGrantStatus: 'none', logs: [], missingSensitiveKeys: [], recoveredSettings: false, settingsSource: 'managed', values: {} }),
      updateSetting: async (key, value) => { calls.push(`${key}:${String(value)}`); return { ok: true } },
      importSettings: async () => { calls.push('import'); return { ok: true } },
      exportSettings: async () => { calls.push('export'); return { canceled: true, ok: true } },
      resetSettings: async () => { calls.push('reset'); return { ok: true } },
      selectExternalSettings: async () => { calls.push('select-external'); return { ok: true } },
      revokeExternalSettings: async () => { calls.push('revoke-external'); return { ok: true } },
      selectCustomBrowser: async () => { calls.push('select-browser'); return { ok: true } },
      revokeCustomBrowser: async () => { calls.push('revoke-browser'); return { ok: true } },
    },
  })
  const get = ipcMain.handlers.get(LAUNCHER_SETTINGS_IPC_CHANNELS.getSnapshot)!
  const update = ipcMain.handlers.get(LAUNCHER_SETTINGS_IPC_CHANNELS.updateSetting)!
  const exportSettings = ipcMain.handlers.get(LAUNCHER_SETTINGS_IPC_CHANNELS.exportSettings)!
  assert.deepEqual(get({}), { externalGrantStatus: 'none', logs: [], missingSensitiveKeys: [], recoveredSettings: false, settingsSource: 'managed', values: {} })
  await (update({}, { key: 'general.language', value: 'fr-FR' }) as Promise<unknown>)
  await assert.rejects(Promise.resolve(update({}, { key: 'general.language', value: 'fr-FR' }, 'extra')), /arguments/u)
  await assert.rejects(Promise.resolve(update({}, { key: 'general.browser.customWebBrowserName', value: 'spoof' })), /Invalid launcher setting/u)
  await assert.deepEqual(await Promise.resolve(exportSettings({})), { canceled: true, ok: true })
  trusted = false
  assert.throws(() => get({}), /untrusted/u)
  assert.deepEqual(calls, ['general.language:fr-FR', 'export'])
  dispose()
  assert.deepEqual(ipcMain.removed.sort(), [
    LAUNCHER_SETTINGS_IPC_CHANNELS.exportSettings,
    LAUNCHER_SETTINGS_IPC_CHANNELS.getSnapshot,
    LAUNCHER_SETTINGS_IPC_CHANNELS.importSettings,
    LAUNCHER_SETTINGS_IPC_CHANNELS.resetSettings,
    LAUNCHER_SETTINGS_IPC_CHANNELS.revokeCustomBrowser,
    LAUNCHER_SETTINGS_IPC_CHANNELS.revokeExternalSettings,
    LAUNCHER_SETTINGS_IPC_CHANNELS.selectCustomBrowser,
    LAUNCHER_SETTINGS_IPC_CHANNELS.selectExternalSettings,
    LAUNCHER_SETTINGS_IPC_CHANNELS.updateSetting,
    LAUNCHER_WINDOW_IPC_CHANNELS.show,
    LAUNCHER_WINDOW_IPC_CHANNELS.getState,
  ].sort())
})

test('workbench settings handlers replace path-bearing operation errors with a fixed renderer-safe failure', async () => {
  const ipcMain = new FakeIpcMain()
  const missingPath = '/private/user/secrets/missing.json'
  const failing = async (): Promise<Readonly<{ ok: true }>> => { throw new Error(`ENOENT: ${missingPath}`) }
  const dispose = registerWorkbenchLauncherIpcHandlers({
    assertTrustedMainIpc: () => {},
    controller: { getState: () => ({ visible: false } as never), show: async () => {} },
    ipcMain,
    settings: {
      getSnapshot: () => { throw new Error(`snapshot ${missingPath}`) },
      updateSetting: async () => await failing(),
      importSettings: failing,
      exportSettings: failing,
      resetSettings: failing,
      selectExternalSettings: failing,
      revokeExternalSettings: failing,
      selectCustomBrowser: failing,
      revokeCustomBrowser: failing,
    },
  })
  assert.throws(
    () => ipcMain.handlers.get(LAUNCHER_SETTINGS_IPC_CHANNELS.getSnapshot)?.({}),
    error => error instanceof Error && error.message === 'TockLauncher settings operation failed' && !error.message.includes(missingPath),
  )
  await assert.rejects(
    Promise.resolve(ipcMain.handlers.get(LAUNCHER_SETTINGS_IPC_CHANNELS.importSettings)?.({})),
    error => error instanceof Error && error.message === 'TockLauncher settings operation failed' && !error.message.includes(missingPath),
  )
  await assert.rejects(
    Promise.resolve(ipcMain.handlers.get(LAUNCHER_SETTINGS_IPC_CHANNELS.updateSetting)?.({}, { key: 'general.language', value: 'fr-FR' })),
    error => error instanceof Error && error.message === 'TockLauncher settings operation failed' && !error.message.includes(missingPath),
  )
  dispose()
})

test('workbench launcher handlers deliver readiness and finite theme facts', async () => {
  const ipcMain = new FakeIpcMain()
  let ready = 0
  let synced: unknown
  const dispose = registerWorkbenchLauncherIpcHandlers({
    assertTrustedMainIpc: () => {},
    controller: {
      getState: () => ({ visible: false } as never),
      show: async () => {},
    },
    ipcMain,
    onRouteReady: () => { ready += 1 },
    syncTheme: (_event, source) => { synced = source; return { ok: true } },
  })
  await ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.routeReady)?.({})
  await ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.syncTheme)?.({}, { mode: 'light', skinId: null })
  assert.equal(ready, 1)
  assert.deepEqual(synced, { mode: 'light', skinId: null })
  await assert.rejects(
    async () => await ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.syncTheme)?.({}, { mode: 'light', skinId: 'unknown' }),
    /skin/u,
  )
  dispose()
})

test('stale workbench frames cannot mark the current generation ready or sync theme', async () => {
  const ipcMain = new FakeIpcMain()
  const currentFrame = {}
  const staleFrame = {}
  let ready = 0
  let synced = 0
  const currentWindow = { sender: { mainFrame: currentFrame }, senderFrame: currentFrame }
  const dispose = registerWorkbenchLauncherIpcHandlers({
    assertTrustedMainIpc: event => {
      const value = event as typeof currentWindow
      if (value.senderFrame !== value.sender.mainFrame || value.senderFrame !== currentFrame) throw new Error('stale frame')
    },
    controller: { getState: () => ({ visible: false } as never), show: async () => {} },
    ipcMain,
    onRouteReady: () => { ready += 1 },
    syncTheme: () => { synced += 1; return { ok: true } },
  })
  await assert.rejects(
    async () => { await ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.routeReady)?.({ sender: currentWindow.sender, senderFrame: staleFrame }) },
    /stale frame/u,
  )
  await assert.rejects(
    async () => { await ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.syncTheme)?.({ sender: currentWindow.sender, senderFrame: staleFrame }, { mode: 'light', skinId: null }) },
    /stale frame/u,
  )
  assert.equal(ready, 0)
  assert.equal(synced, 0)
  dispose()
})

test('workbench launcher handlers guard before side effects and reject arguments', async () => {
  const ipcMain = new FakeIpcMain()
  let trusted = true
  let stateCalls = 0
  let showCalls = 0
  const dispose = registerWorkbenchLauncherIpcHandlers({
    assertTrustedMainIpc: () => {
      if (!trusted) throw new Error('untrusted')
    },
    controller: {
      getState: () => { stateCalls += 1; return { visible: false } as never },
      show: async () => { showCalls += 1 },
    },
    ipcMain,
  })
  const getState = ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.getState)
  const show = ipcMain.handlers.get(LAUNCHER_WINDOW_IPC_CHANNELS.show)
  assert.ok(getState)
  assert.ok(show)
  await getState?.({})
  assert.equal(stateCalls, 1)
  trusted = false
  await assert.rejects(() => Promise.resolve(show?.({})), /untrusted/u)
  assert.equal(showCalls, 0)
  trusted = true
  await assert.rejects(() => show?.({}, 'extra') as Promise<unknown>, /does not accept arguments/u)
  assert.equal(showCalls, 0)
  dispose()
  assert.deepEqual(ipcMain.removed.sort(), [
    LAUNCHER_WINDOW_IPC_CHANNELS.getState,
    LAUNCHER_WINDOW_IPC_CHANNELS.show,
  ].sort())
})
