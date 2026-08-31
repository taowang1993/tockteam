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

function harness(platform: LauncherOsPlatform, enabled: readonly string[] = ['AppearanceSwitcher', 'SystemCommands', 'SystemSettings', 'UeliCommand', 'WindowsControlPanel'], linuxTrash = true) {
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
      ...(platform === 'Linux' && linuxTrash ? { linuxTrashCapability: { atomic: true, empty: async (_signal: AbortSignal) => undefined } } : null),
      platform,
      scanControlPanelItems: async () => [
        { canonicalName: 'Microsoft.System', name: 'System' },
        { canonicalName: 'Microsoft.NetworkAndSharingCenter', name: 'Network' },
      ],
    }),
    setHotkey(value: boolean) { hotkey = value },
  }
}

test('OS provider omits Linux Empty Trash without an atomic capability', async () => {
  const { provider } = harness('Linux', ['SystemCommands'], false)
  const items = await provider.loadIndexedItems()
  assert.equal(items.filter(item => item.sourceExtension === 'SystemCommands').length, 0)
  assert.match(provider.getLastError() ?? '', /SystemCommands is unavailable/u)
})

test('OS provider publishes exact supported catalog slices with an injected Linux capability', async () => {
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

test('OS provider keeps finite system setting targets actionable', async () => {
  const { provider, effects } = harness('Windows', ['SystemSettings'])
  const items = await provider.loadIndexedItems()
  const setting = items.find(item => item.details === 'ms-settings:display-advancedgraphics')!
  let target: string | undefined
  effects.openSystemSetting = async value => { target = value }
  await provider.executeAction(record(setting))
  assert.equal(target, 'ms-settings:display-advancedgraphics')
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

test('Ueli command catalog reflects hotkey setting after an immediate provider rescan', async () => {
  const { provider, setHotkey } = harness('macOS', ['UeliCommand'])
  let items = await provider.loadIndexedItems()
  assert.equal(items.find(item => item.id === 'ueliCommand:toggleHotkey')?.name, 'Disable hotkey')
  setHotkey(false)
  provider.invalidate()
  items = await provider.loadIndexedItems()
  assert.equal(items.find(item => item.id === 'ueliCommand:toggleHotkey')?.name, 'Enable hotkey')
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

test('OS provider cancels tracked discovery work when closed', async () => {
  let observedSignal: AbortSignal | undefined
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const provider = createLauncherOsExtensions({
    effects: { confirmPrivilegedAction: async () => true, invokeSystemCommand: async () => undefined, invokeUeliCommand: async () => undefined, openControlPanelItem: async () => undefined, openSystemSetting: async () => undefined, toggleAppearance: async () => undefined },
    enabledExtensionIds: () => ['WindowsControlPanel'],
    getSetting: <T>(_key: string, fallback: T) => fallback,
    platform: 'Windows',
    scanControlPanelItems: async signal => { observedSignal = signal; await pending; return [] },
  })
  const loading = provider.loadIndexedItems()
  await new Promise(resolve => setImmediate(resolve))
  const closing = provider.close()
  assert.equal(observedSignal?.aborted, true)
  release()
  await Promise.all([loading.catch(() => undefined), closing])
})

test('OS provider rechecks privileged catalog state after a confirmation dialog', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let provider: ReturnType<typeof createLauncherOsExtensions>
  const effects: LauncherOsEffects = {
    confirmPrivilegedAction: async () => { await gate; provider.invalidate(); return true },
    invokeSystemCommand: async () => { throw new Error('must not run') },
    invokeUeliCommand: async () => undefined,
    openControlPanelItem: async () => undefined,
    openSystemSetting: async () => undefined,
    toggleAppearance: async () => undefined,
  }
  provider = createLauncherOsExtensions({
    effects,
    enabledExtensionIds: () => ['SystemCommands'],
    getSetting: <T>(_key: string, fallback: T) => fallback,
    linuxTrashCapability: { atomic: true, empty: async () => undefined },
    platform: 'Linux',
    scanControlPanelItems: async () => [],
  })
  const item = (await provider.loadIndexedItems()).find(candidate => candidate.name === 'Empty Trash')!
  const pending = provider.executeAction(record(item))
  release()
  await assert.rejects(pending, /stale|canceled/i)
})

test('OS provider aborts confirmation and prevents the post-dialog effect on invalidation', async () => {
  let provider: ReturnType<typeof createLauncherOsExtensions>
  let release!: (value: boolean) => void
  let confirmationSignal: AbortSignal | undefined
  let invoked = 0
  const effects: LauncherOsEffects = {
    confirmPrivilegedAction: async (_prompt, signal) => {
      confirmationSignal = signal
      return await new Promise<boolean>(resolve => { release = resolve })
    },
    invokeSystemCommand: async (_command, _signal) => { invoked += 1 },
    invokeUeliCommand: async () => undefined,
    openControlPanelItem: async () => undefined,
    openSystemSetting: async () => undefined,
    toggleAppearance: async () => undefined,
  }
  provider = createLauncherOsExtensions({
    effects,
    enabledExtensionIds: () => ['SystemCommands'],
    getSetting: <T>(_key: string, fallback: T) => fallback,
    linuxTrashCapability: { atomic: true, empty: async () => undefined },
    platform: 'Linux',
    scanControlPanelItems: async () => [],
  })
  const item = (await provider.loadIndexedItems()).find(candidate => candidate.name === 'Empty Trash')!
  const pending = provider.executeAction(record(item))
  await new Promise(resolve => setImmediate(resolve))
  provider.invalidate()
  assert.equal(confirmationSignal?.aborted, true)
  release(true)
  await assert.rejects(pending, /stale|canceled/i)
  await provider.waitForIdle()
  assert.equal(invoked, 0)
})

test('OS provider aborts an in-flight native effect and waits for it on close', async () => {
  let effectSignal: AbortSignal | undefined
  let effectFinished!: () => void
  const effectDone = new Promise<void>(resolve => { effectFinished = resolve })
  const effects: LauncherOsEffects = {
    confirmPrivilegedAction: async () => true,
    invokeSystemCommand: async (_command, signal) => {
      effectSignal = signal
      await new Promise<void>(resolve => signal.addEventListener('abort', () => { effectFinished(); resolve() }, { once: true }))
      await effectDone
    },
    invokeUeliCommand: async () => undefined,
    openControlPanelItem: async () => undefined,
    openSystemSetting: async () => undefined,
    toggleAppearance: async () => undefined,
  }
  const provider = createLauncherOsExtensions({
    effects,
    enabledExtensionIds: () => ['SystemCommands'],
    getSetting: <T>(_key: string, fallback: T) => fallback,
    linuxTrashCapability: {
      atomic: true,
      empty: async signal => {
        effectSignal = signal
        await new Promise<void>(resolve => signal.addEventListener('abort', () => { effectFinished(); resolve() }, { once: true }))
        await effectDone
      },
    },
    platform: 'Linux',
    scanControlPanelItems: async () => [],
  })
  const item = (await provider.loadIndexedItems()).find(candidate => candidate.name === 'Empty Trash')!
  const pending = provider.executeAction(record(item))
  await new Promise(resolve => setImmediate(resolve))
  await provider.close()
  assert.equal(effectSignal?.aborted, true)
  await pending.catch(() => undefined)
})

test('OS provider keeps a mocked Control Panel action inert on non-Windows hosts', async () => {
  let opened = 0
  const effects: LauncherOsEffects = {
    confirmPrivilegedAction: async prompt => prompt.operation === 'invoke-system-command',
    invokeSystemCommand: async () => undefined,
    invokeUeliCommand: async () => undefined,
    openControlPanelItem: async () => { opened += 1 },
    openSystemSetting: async () => undefined,
    toggleAppearance: async () => undefined,
  }
  const provider = createLauncherOsExtensions({
    effects,
    enabledExtensionIds: () => ['WindowsControlPanel'],
    getSetting: <T>(_key: string, fallback: T) => fallback,
    includeControlPanelFixture: true,
    platform: 'macOS',
    scanControlPanelItems: async () => [{ canonicalName: 'Fixture.System', name: 'Fixture Control Panel' }],
  })
  const item = (await provider.loadIndexedItems()).find(candidate => candidate.name === 'Fixture Control Panel')
  assert.ok(item)
  assert.equal(await provider.executeAction(record(item)), true)
  assert.equal(opened, 0)
})

test('OS provider keeps renderer status generic while reporting the trusted native failure', async () => {
  const nativeFailure = new Error('native Control Panel scan failed')
  let reported: Error | undefined
  const provider = createLauncherOsExtensions({
    effects: {
      confirmPrivilegedAction: async () => true,
      invokeSystemCommand: async () => undefined,
      invokeUeliCommand: async () => undefined,
      openControlPanelItem: async () => undefined,
      openSystemSetting: async () => undefined,
      toggleAppearance: async () => undefined,
    },
    enabledExtensionIds: () => ['WindowsControlPanel'],
    getSetting: (_key, fallback) => fallback,
    onProviderError: (_id, error) => { reported = error },
    platform: 'Windows',
    scanControlPanelItems: async () => { throw nativeFailure },
  })
  await provider.loadIndexedItems()
  assert.match(provider.getProviderErrors().get('WindowsControlPanel') ?? '', /unavailable/u)
  assert.equal(reported, nativeFailure)
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
