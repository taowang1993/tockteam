import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
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
