import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LauncherLifecycleController,
  LauncherToggleIntentQueue,
  SingleOwnedTray,
  attemptSecureRelaunch,
  readLaunchOnStart,
  resolveLauncherLifecycleSettings,
  setLaunchOnStart,
} from '../src/launcher-lifecycle.ts'

test('lifecycle settings use safe TockTeam fallbacks and reject malformed values', () => {
  const values = new Map<string, unknown>([
    ['window.alwaysOnTop', 'yes'],
    ['general.hotkey.enabled', false],
    ['appearance.showAppIconInDock', true],
    ['window.showOnStartup', true],
    ['general.tray.showIcon', 'no'],
    ['window.visibleOnAllWorkspaces', false],
  ])
  assert.deepEqual(resolveLauncherLifecycleSettings((key, fallback) => values.get(key) ?? fallback), {
    alwaysOnTop: true,
    hotkeyEnabled: false,
    showDockIcon: true,
    showOnStartup: true,
    showTrayIcon: true,
    visibleOnAllWorkspaces: false,
  })
})

test('toggle intents coalesce before readiness and drain once', async () => {
  const queue = new LauncherToggleIntentQueue()
  assert.equal(queue.capture(['app', '--toggle']), true)
  assert.equal(queue.capture(['app', '--toggle']), true)
  let toggles = 0
  await queue.drain(async () => { toggles += 1 })
  await queue.drain(async () => { toggles += 1 })
  assert.equal(toggles, 1)
  assert.equal(queue.capture(['app', '--other']), false)
})

test('toggle intent remains pending when startup toggle fails', async () => {
  const queue = new LauncherToggleIntentQueue()
  queue.capture(['app', '--toggle'])
  await assert.rejects(queue.drain(() => { throw new Error('overlay unavailable') }), /overlay unavailable/u)
  assert.equal(queue.hasPending(), true)
  let toggles = 0
  await queue.drain(() => { toggles += 1 })
  assert.equal(toggles, 1)
  assert.equal(queue.hasPending(), false)
})

test('relaunch failure reports without requesting quit', () => {
  const calls: string[] = []
  assert.equal(attemptSecureRelaunch({
    relaunch: () => { throw new Error('relaunch unavailable') },
    report: error => { calls.push(error instanceof Error ? error.message : String(error)) },
    requestQuit: () => { calls.push('quit') },
  }), false)
  assert.deepEqual(calls, ['relaunch unavailable'])
})

test('owned tray is singleton and destroys only its own instance', () => {
  const trays: Array<{ destroyed: boolean; destroy(): void; isDestroyed(): boolean }> = []
  const owner = new SingleOwnedTray(() => {
    const tray = { destroyed: false, destroy() { this.destroyed = true }, isDestroyed() { return this.destroyed } }
    trays.push(tray)
    return tray
  })
  owner.setVisible(true)
  owner.setVisible(true)
  assert.equal(trays.length, 1)
  owner.setVisible(false)
  assert.equal(trays[0]?.destroyed, true)
  owner.setVisible(true)
  assert.equal(trays.length, 2)
  owner.dispose()
  assert.equal(trays[1]?.destroyed, true)
})

test('login item helpers read back the app-owned setting', () => {
  let openAtLogin = false
  const app = {
    getLoginItemSettings: () => ({ openAtLogin }),
    setLoginItemSettings: ({ openAtLogin: value }: { openAtLogin: boolean }) => { openAtLogin = value },
  }
  assert.equal(readLaunchOnStart(app), false)
  assert.equal(setLaunchOnStart(app, true), true)
  assert.equal(readLaunchOnStart(app), true)
})

test('lifecycle routes native commands through one owner and relaunch callback', async () => {
  const calls: string[] = []
  const queue = new LauncherToggleIntentQueue()
  const lifecycle = new LauncherLifecycleController({
    getSetting: (_key, fallback) => fallback,
    openWorkbenchSettings: () => { calls.push('settings') },
    overlay: {
      applyWindowPreferences: () => {},
      setShortcutEnabled: enabled => { calls.push(`shortcut:${String(enabled)}`) },
      show: async () => { calls.push('show') },
      toggle: async () => { calls.push('toggle') },
    },
    queue,
    queueSecureRelaunch: reason => { calls.push(`relaunch:${reason}`) },
    requestSecureQuit: reason => { calls.push(`quit:${reason}`) },
    rescan: async () => { calls.push('rescan') },
    setDockVisible: () => {},
    setTrayVisible: () => {},
    updateSetting: async (key, value) => { calls.push(`update:${key}:${String(value)}`) },
  })
  let updaterStarts = 0
  let updaterDisposes = 0
  lifecycle.attachUpdater({ start: () => { updaterStarts += 1 }, dispose: () => { updaterDisposes += 1 } })
  await lifecycle.invokeCommand('openSettings')
  await lifecycle.invokeCommand('enableHotkey')
  await lifecycle.invokeCommand('rescanExtensions')
  await lifecycle.invokeCommand('quit')
  const result = await lifecycle.mutateSettingsAndRelaunch('launcher-settings-reset', async () => ({ ok: true }))
  assert.deepEqual(result, { ok: true })
  lifecycle.dispose()
  assert.equal(updaterStarts, 1)
  assert.equal(updaterDisposes, 1)
  assert.deepEqual(calls, [
    'settings',
    'update:general.hotkey.enabled:true',
    'shortcut:true',
    'rescan',
    'quit:launcher-command-quit',
    'shortcut:true',
    'relaunch:launcher-settings-reset',
  ])
})

test('lifecycle waits for workbench readiness before showing startup launcher', async () => {
  const calls: string[] = []
  let settingsUpdates = 0
  const queue = new LauncherToggleIntentQueue()
  queue.capture(['app', '--toggle'])
  const lifecycle = new LauncherLifecycleController({
    getSetting: (_key, fallback) => fallback,
    openWorkbenchSettings: () => { calls.push('settings') },
    overlay: {
      applyWindowPreferences: preferences => { calls.push(`preferences:${String(preferences.alwaysOnTop)}`) },
      setShortcutEnabled: enabled => { calls.push(`shortcut:${String(enabled)}`) },
      show: async () => { calls.push('show') },
      toggle: async () => { calls.push('toggle') },
    },
    queue,
    requestSecureQuit: () => { calls.push('quit') },
    rescan: async () => { calls.push('rescan') },
    setDockVisible: visible => { calls.push(`dock:${String(visible)}`) },
    setTrayVisible: visible => { calls.push(`tray:${String(visible)}`) },
    updateSetting: async () => { settingsUpdates += 1 },
  })
  await lifecycle.sync()
  assert.deepEqual(calls, ['dock:false', 'tray:true', 'shortcut:true', 'preferences:true'])
  await lifecycle.markReady()
  assert.deepEqual(calls, ['dock:false', 'tray:true', 'shortcut:true', 'preferences:true', 'toggle'])
  assert.equal(settingsUpdates, 0)
})
