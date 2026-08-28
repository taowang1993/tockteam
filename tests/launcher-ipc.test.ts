import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LauncherActionExpiredError } from '../src/launcher-actions.ts'
import { LAUNCHER_IPC_CHANNELS, LAUNCHER_SURFACE_IPC_CHANNELS } from '../src/launcher-contract.ts'
import { registerLauncherIpcHandlers } from '../src/launcher-ipc.ts'

class FakeIpc {
  readonly handlers = new Map<string, (...args: any[]) => any>()
  readonly removed: string[] = []
  handle(channel: string, handler: (...args: any[]) => any): void { this.handlers.set(channel, handler) }
  removeHandler(channel: string): void { this.removed.push(channel); this.handlers.delete(channel) }
}

test('launcher search IPC guards, publishes opaque actions, rejects stale requests, and disposes', async () => {
  const ipc = new FakeIpc()
  const owners = new Map<object, number>()
  let releaseOld: (() => void) | undefined
  const old = new Promise<void>(resolve => { releaseOld = resolve })
  let published = 0
  const dispose = registerLauncherIpcHandlers({
    actions: {
      cancel: async () => ({ ok: true as const }),
      clearOwner: () => {},
      invoke: async () => ({ ok: true as const }),
      publish: ({ owner }) => {
        published += 1
        return { items: [{ defaultAction: { actionId: 'launcher-action:opaque', description: 'Focus' }, description: 'TockCoder', id: 'coder', name: 'TockCoder', sourceExtension: 'TockTeam' }], resultSetId: `launcher-results:${published}` }
      },
    },
    guard: { assert: () => ({ role: 'launcher', webContentsId: 41 }) },
    ipcMain: ipc,
    rescan: async () => ({ indexedItemCount: 1, rescanStatus: 'idle' as const }),
    search: async term => {
      if (term === 'old') await old
      return { after: [], before: [{ defaultAction: { argument: 'coder', description: 'Focus', handlerKey: 'focus-workbench' }, description: 'TockCoder', id: 'coder', name: 'TockCoder', sourceExtension: 'TockTeam' }], status: { indexedItemCount: 1, rescanStatus: 'idle' as const } }
    },
  })
  const sender = {}
  const event = { sender }
  const input = (searchTerm: string) => ({ fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm })
  const stale = ipc.handlers.get(LAUNCHER_IPC_CHANNELS.search)!(event, input('old')) as Promise<unknown>
  const current = ipc.handlers.get(LAUNCHER_IPC_CHANNELS.search)!(event, input('new')) as Promise<unknown>
  await current
  releaseOld?.()
  await assert.rejects(stale, /superseded/u)
  assert.equal(published, 1)
  await assert.rejects(ipc.handlers.get(LAUNCHER_IPC_CHANNELS.rescan)!(event, 'extra') as Promise<unknown>, /arguments/u)
  await assert.rejects(ipc.handlers.get(LAUNCHER_IPC_CHANNELS.search)!(event, input('extra'), 'extra') as Promise<unknown>, /arguments/u)
  await assert.rejects(ipc.handlers.get(LAUNCHER_IPC_CHANNELS.invokeAction)!(event, { actionId: 'launcher-action:opaque' }, 'extra') as Promise<unknown>, /arguments/u)
  const cancel = ipc.handlers.get(LAUNCHER_IPC_CHANNELS.cancelAction)!
  assert.deepEqual(await cancel(event, { actionId: 'launcher-action:opaque', resultSetId: 'launcher-results:1' }), { ok: true })
  await assert.rejects(cancel(event, { actionId: 'launcher-action:opaque', resultSetId: 'launcher-results:1' }, 'extra') as Promise<unknown>, /arguments/u)
  await assert.rejects(cancel(event, { actionId: 'launcher-action:opaque', resultSetId: 'launcher-results:bad' }) as Promise<unknown>, /cancellation|operation/u)
  dispose()
  assert.deepEqual(ipc.removed.sort(), Object.values(LAUNCHER_IPC_CHANNELS).sort())
})

test('launcher IPC rechecks ownership after search and maps expiry without exposing internals', async () => {
  const ipc = new FakeIpc()
  let release: (() => void) | undefined
  const pending = new Promise<void>(resolve => { release = resolve })
  let guardCalls = 0
  let published = 0
  const dispose = registerLauncherIpcHandlers({
    actions: {
      cancel: async () => ({ ok: true as const }),
      clearOwner: () => {},
      invoke: async () => { throw new LauncherActionExpiredError() },
      publish: () => {
        published += 1
        return { items: [], resultSetId: 'launcher-results:1' }
      },
    },
    guard: {
      assert: () => {
        guardCalls += 1
        if (guardCalls > 1) throw new Error('launcher window was replaced')
        return { role: 'launcher', webContentsId: 41 }
      },
    },
    ipcMain: ipc,
    rescan: async () => ({ indexedItemCount: 0, rescanStatus: 'idle' as const }),
    search: async () => {
      await pending
      return { after: [], before: [], status: { indexedItemCount: 0, rescanStatus: 'idle' as const } }
    },
  })
  const search = ipc.handlers.get(LAUNCHER_IPC_CHANNELS.search)!
  const event = { sender: {} }
  const request = search(event, { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: 'coder' }) as Promise<unknown>
  release?.()
  await assert.rejects(request, /replaced/u)
  assert.equal(published, 0)
  guardCalls = 0

  const invoke = ipc.handlers.get(LAUNCHER_IPC_CHANNELS.invokeAction)!
  const result = await invoke(event, { actionId: 'launcher-action:expired' })
  assert.deepEqual(result, { ok: false, reason: 'expired' })
  dispose()
})

test('overlay operations invalidate actions on rescan and hide downstream path errors', async () => {
  const ipc = new FakeIpc()
  const cleared: number[] = []
  const path = '/private/user/secrets/settings.json'
  const dispose = registerLauncherIpcHandlers({
    actions: {
      cancel: async () => { throw new Error('cancel unavailable') },
      clearOwner: owner => { cleared.push(owner.webContentsId) },
      invoke: async () => { throw new Error(`EACCES ${path}`) },
      publish: () => ({ items: [], resultSetId: 'launcher-results:1' }),
    },
    guard: { assert: () => ({ role: 'launcher', webContentsId: 41 }) },
    ipcMain: ipc,
    rescan: async owner => {
      if (owner !== undefined) cleared.push(owner.webContentsId)
      throw new Error(`ENOENT ${path}`)
    },
    search: async () => { throw new Error(`lstat ${path}`) },
    surface: {
      getSettings: () => { throw new Error(`read ${path}`) },
      recordSearch: async () => { throw new Error(`write ${path}`) },
    },
  })
  const event = { sender: {} }
  const safe = (error: unknown): boolean => error instanceof Error && error.message === 'TockLauncher operation failed' && !error.message.includes(path)
  await assert.rejects(
    ipc.handlers.get(LAUNCHER_IPC_CHANNELS.search)!(event, { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: '' }),
    safe,
  )
  await assert.rejects(ipc.handlers.get(LAUNCHER_IPC_CHANNELS.rescan)!(event), safe)
  assert.deepEqual(cleared, [41])
  await assert.rejects(ipc.handlers.get(LAUNCHER_IPC_CHANNELS.invokeAction)!(event, { actionId: 'launcher-action:opaque' }), safe)
  assert.throws(() => ipc.handlers.get(LAUNCHER_SURFACE_IPC_CHANNELS.getSettings)!(event), safe)
  await assert.rejects(ipc.handlers.get(LAUNCHER_SURFACE_IPC_CHANNELS.recordSearch)!(event, 'query'), safe)
  dispose()
})
