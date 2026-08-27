import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_IPC_CHANNELS } from '../src/launcher-contract.ts'
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
  dispose()
  assert.deepEqual(ipc.removed.sort(), Object.values(LAUNCHER_IPC_CHANNELS).sort())
})
