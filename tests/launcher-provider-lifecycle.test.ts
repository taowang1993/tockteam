import assert from 'node:assert/strict'
import test from 'node:test'
import { createLauncherOsExtensions, type LauncherOsEffects } from '../src/launcher-os-extensions.ts'
import type { LauncherActionRecord } from '../src/launcher-actions.ts'
import { createLauncherProviderInvalidator } from '../src/launcher-provider-lifecycle.ts'

test('central launcher invalidation fences every provider before clearing its action owner', () => {
  const events: string[] = []
  const owner = { role: 'launcher' as const, webContentsId: 7 }
  const coordinator = createLauncherProviderInvalidator({
    actions: {
      clear: () => { events.push('actions.clear') },
      clearOwner: value => { events.push(`actions.clearOwner:${value.webContentsId}`) },
    },
    discovery: { invalidate: reason => { events.push(`discovery:${reason}`) } },
    fileSearch: { invalidate: reason => { events.push(`file:${reason}`) } },
    local: { invalidate: reason => { events.push(`local:${reason}`) } },
    network: { invalidate: reason => { events.push(`network:${reason}`) } },
    os: { invalidate: reason => { events.push(`os:${reason}`) } },
  })

  coordinator.invalidateAllLauncherProviders('window-clear', owner)
  assert.deepEqual(events, [
    'discovery:window-clear',
    'file:window-clear',
    'network:window-clear',
    'os:window-clear',
    'local:window-clear',
    'actions.clearOwner:7',
  ])

  events.length = 0
  coordinator.invalidateAllLauncherProviders('settings-mutation')
  assert.deepEqual(events, [
    'discovery:settings-mutation',
    'file:settings-mutation',
    'network:settings-mutation',
    'os:settings-mutation',
    'local:settings-mutation',
    'actions.clear',
  ])
})

test('central launcher invalidation includes workflow before clearing the action owner', () => {
  const events: string[] = []
  const coordinator = createLauncherProviderInvalidator({
    actions: { clear: () => { events.push('actions.clear') }, clearOwner: () => { events.push('actions.clearOwner') } },
    workflow: { invalidate: reason => { events.push(`workflow:${reason}`) } },
  })
  coordinator.invalidateAllLauncherProviders('workflow-settings')
  assert.deepEqual(events, ['workflow:workflow-settings', 'actions.clear'])
})

test('central mutation invalidation cancels consumed OS confirmation for import, reset, and external-source changes', async () => {
  for (const reason of ['launcher-settings-import', 'launcher-settings-reset', 'launcher-external-settings-select'] as const) {
    let release!: (value: boolean) => void
    let confirmationSignal: AbortSignal | undefined
    const effects: LauncherOsEffects = {
      confirmPrivilegedAction: async (_prompt, signal) => {
        confirmationSignal = signal
        return await new Promise<boolean>(resolve => { release = resolve })
      },
      invokeSystemCommand: async () => undefined,
      invokeUeliCommand: async () => undefined,
      openControlPanelItem: async () => undefined,
      openSystemSetting: async () => undefined,
      toggleAppearance: async () => undefined,
    }
    const provider = createLauncherOsExtensions({
      effects,
      enabledExtensionIds: () => ['SystemCommands'],
      getSetting: <T>(_key: string, fallback: T) => fallback,
      platform: 'Windows',
      scanControlPanelItems: async () => [],
    })
    const item = (await provider.loadIndexedItems()).find(value => value.name === 'Shut Down')!
    const record: LauncherActionRecord = {
      actionId: 'launcher-action:test', argument: item.defaultAction.argument, expiresAt: Date.now() + 30_000,
      handlerKey: item.defaultAction.handlerKey, hideWindowAfterInvocation: true,
      owner: { role: 'launcher', webContentsId: 1 }, requiresConfirmation: true,
      resultSetId: 'launcher-results:1', sourceExtension: item.sourceExtension,
    }
    const coordinator = createLauncherProviderInvalidator({ actions: { clear: () => {}, clearOwner: () => {} }, os: provider })
    const pending = provider.executeAction(record)
    await new Promise<void>(resolve => setImmediate(resolve))
    coordinator.invalidateAllLauncherProviders(reason)
    assert.equal(confirmationSignal?.aborted, true)
    release(true)
    await assert.rejects(pending, /canceled|current|invalidated/u)
    await provider.close()
  }
})
