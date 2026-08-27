import type { IpcMain } from 'electron'
import type {
  DesktopLauncherState,
  LauncherWindowAcknowledgement,
} from './launcher-window-contract.ts'
import {
  LAUNCHER_WINDOW_IPC_CHANNELS,
  assertNoLauncherIpcArguments,
} from './launcher-window-contract.ts'
import type { LauncherIpcIdentity } from './launcher-security.ts'

export { LAUNCHER_WINDOW_IPC_CHANNELS } from './launcher-window-contract.ts'

export type LauncherWindowIpcController = Readonly<{
  getState: () => DesktopLauncherState
  hide: () => void
  show: () => Promise<void>
}>

export type LauncherIpcGuard = Readonly<{
  assert: (event: unknown, expectedRole?: 'launcher') => LauncherIpcIdentity
}>

export type LauncherIpcMain = Pick<IpcMain, 'handle' | 'removeHandler'>
export type LauncherIpcHandler = (...args: any[]) => unknown

const ownedHandlers = new WeakMap<object, Map<string, LauncherIpcHandler>>()

function registerOwnedHandler(
  ipcMain: LauncherIpcMain,
  channel: string,
  handler: LauncherIpcHandler,
): () => void {
  const handlers = ownedHandlers.get(ipcMain) ?? new Map<string, LauncherIpcHandler>()
  if (handlers.has(channel)) throw new Error(`Launcher IPC channel is already registered: ${channel}`)
  ipcMain.handle(channel, handler)
  handlers.set(channel, handler)
  ownedHandlers.set(ipcMain, handlers)
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (handlers.get(channel) !== handler) return
    handlers.delete(channel)
    ipcMain.removeHandler(channel)
  }
}

function registerAll(
  ipcMain: LauncherIpcMain,
  registrations: readonly [string, LauncherIpcHandler][],
): () => void {
  const disposers: (() => void)[] = []
  try {
    for (const [channel, handler] of registrations) {
      disposers.push(registerOwnedHandler(ipcMain, channel, handler))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const dispose of disposers) dispose()
  }
}

export function registerLauncherOwnedIpcHandlers(
  ipcMain: LauncherIpcMain,
  registrations: readonly [string, LauncherIpcHandler][],
): () => void {
  return registerAll(ipcMain, registrations)
}

export function registerLauncherWindowIpcHandlers(args: Readonly<{
  controller: Pick<LauncherWindowIpcController, 'hide'>
  guard: LauncherIpcGuard
  ipcMain: LauncherIpcMain
}>): () => void {
  return registerAll(args.ipcMain, [[
    LAUNCHER_WINDOW_IPC_CHANNELS.dismiss,
    (event: unknown, ...rawArgs: unknown[]): LauncherWindowAcknowledgement => {
      args.guard.assert(event, 'launcher')
      assertNoLauncherIpcArguments(rawArgs)
      args.controller.hide()
      return Object.freeze({ ok: true })
    },
  ]])
}

export function registerWorkbenchLauncherIpcHandlers(args: Readonly<{
  assertTrustedMainIpc: (event: unknown) => void
  controller: Pick<LauncherWindowIpcController, 'getState' | 'show'>
  ipcMain: LauncherIpcMain
}>): () => void {
  return registerAll(args.ipcMain, [
    [
      LAUNCHER_WINDOW_IPC_CHANNELS.getState,
      (event: unknown, ...rawArgs: unknown[]): DesktopLauncherState => {
        args.assertTrustedMainIpc(event)
        assertNoLauncherIpcArguments(rawArgs)
        return args.controller.getState()
      },
    ],
    [
      LAUNCHER_WINDOW_IPC_CHANNELS.show,
      async (event: unknown, ...rawArgs: unknown[]): Promise<DesktopLauncherState> => {
        args.assertTrustedMainIpc(event)
        assertNoLauncherIpcArguments(rawArgs)
        await args.controller.show()
        return args.controller.getState()
      },
    ],
  ])
}
