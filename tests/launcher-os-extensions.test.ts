import assert from 'node:assert/strict'
import test from 'node:test'
import { createLauncherOsExtensions, type LauncherOsEffects, type LauncherOsPlatform } from '../src/launcher-os-extensions.ts'
import type { LauncherActionRecord, LauncherInternalResultItem } from '../src/launcher-actions.ts'

function record(item: LauncherInternalResultItem): LauncherActionRecord {
  return Object.freeze({
    actionId: 'launcher-action:test',
    argument: item.defaultAction.argument,
    expiresAt: Date.now() + 30_000,
    handlerKey: item.defaultAction.handlerKey,
    hideWindowAfterInvocation: item.defaultAction.hideWindowAfterInvocation === true,
    owner: { role: 'launcher' as const, webContentsId: 41 },
    requiresConfirmation: item.defaultAction.requiresConfirmation === true,
    resultSetId: 'launcher-results:1',
    sourceExtension: item.sourceExtension,
  })
}

function harness(platform: LauncherOsPlatform, enabled: readonly string[] = ['AppearanceSwitcher', 'SystemCommands', 'SystemSettings', 'UeliCommand', 'WindowsControlPanel']) {
  let hotkey = true
  const effects: LauncherOsEffects = {
    confirmPrivilegedAction: async () => true,
    invokeSystemCommand: async () => undefined,
    invokeUeliCommand: async () => undefined,
    openControlPanelItem: async () => undefined,
    openSystemSetting: async () => undefined,
    toggleAppearance: async () => undefined,
  }
  return {
    effects: effects as { -readonly [K in keyof LauncherOsEffects]: LauncherOsEffects[K] },
    provider: createLauncherOsExtensions({
      effects,
      enabledExtensionIds: () => enabled,
      getAppearanceMode: () => false,
      getSetting: <T>(key: string, fallback: T) => key === 'general.hotkey.enabled' ? hotkey as T : fallback,
      isAppearanceOverridden: () => false,
      platform,
      scanControlPanelItems: async () => [
        { canonicalName: 'Microsoft.System', name: 'System' },
        { canonicalName: 'Microsoft.NetworkAndSharingCenter', name: 'Network' },
      ],
    }),
    setHotkey(value: boolean) { hotkey = value },
  }
}

test('OS provider publishes exact supported catalog slices', async () => {
  for (const [platform, expectedCommands, expectedSettings] of [['macOS', 6, 26], ['Windows', 7, 133], ['Linux', 1, 0] ] as const) {
    const { provider } = harness(platform)
    const items = await provider.loadIndexedItems()
    assert.equal(items.filter(item => item.sourceExtension === 'SystemCommands').length, expectedCommands)
    assert.equal(items.filter(item => item.sourceExtension === 'SystemSettings').length, expectedSettings)
    assert.equal(items.filter(item => item.sourceExtension === 'UeliCommand').length, 6)
    assert.equal(items.some(item => item.sourceExtension === 'AppearanceSwitcher'), platform !== 'Linux')
    assert.equal(items.some(item => item.sourceExtension === 'WindowsControlPanel'), platform === 'Windows')
  }
})

test('OS provider confirms privileged effects and rejects stale/tampered actions', async () => {
  const { provider, effects } = harness('Windows', ['SystemCommands', 'WindowsControlPanel'])
  const items = await provider.loadIndexedItems()
  const shutdown = items.find(item => item.name === 'Shut Down')!
  const control = items.find(item => item.name === 'System')!
  let confirmed = 0
  effects.confirmPrivilegedAction = async () => { confirmed += 1; return false }
  await provider.executeAction(record(shutdown))
  assert.equal(confirmed, 1)
  await assert.rejects(provider.executeAction({ ...record(control), argument: JSON.stringify({ canonicalName: 'evil', kind: 'control-panel', version: 1 }) }), /current|stale/i)
  provider.invalidate()
})

test('OS provider delegates Ueli commands and revokes actions on invalidation', async () => {
  const { provider, effects } = harness('Linux', ['UeliCommand'])
  const items = await provider.loadIndexedItems()
  const settings = items.find(item => item.id === 'ueliCommand:settings')!
  let command: string | undefined
  effects.invokeUeliCommand = async value => { command = value }
  await provider.executeAction(record(settings))
  assert.equal(command, 'openSettings')
  provider.invalidate()
  await assert.rejects(provider.executeAction(record(settings)), /current/i)
})

test('OS provider rejects appearance effects while host projection is overridden', async () => {
  const effects: LauncherOsEffects = {
    confirmPrivilegedAction: async () => true,
    invokeSystemCommand: async () => undefined,
    invokeUeliCommand: async () => undefined,
    openControlPanelItem: async () => undefined,
    openSystemSetting: async () => undefined,
    toggleAppearance: async () => undefined,
  }
  const provider = createLauncherOsExtensions({
    effects,
    enabledExtensionIds: () => ['AppearanceSwitcher'],
    getAppearanceMode: () => undefined,
    getSetting: (_key, fallback) => fallback,
    platform: 'macOS',
    scanControlPanelItems: async () => [],
  })
  const item = (await provider.loadIndexedItems())[0]!
  await assert.rejects(provider.executeAction(record(item)), /appearance.*unavailable/i)
})
