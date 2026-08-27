import type { IpcMain } from 'electron'
import type {
  DesktopLauncherState,
  LauncherThemeProjection,
  LauncherThemeSource,
  LauncherWindowAcknowledgement,
} from './launcher-window-contract.ts'
import {
  LAUNCHER_SETTINGS_IPC_CHANNELS,
  LAUNCHER_WINDOW_IPC_CHANNELS,
  assertNoLauncherIpcArguments,
  parseLauncherThemeProjection,
  parseLauncherThemeSource,
} from './launcher-window-contract.ts'
import {
  parseLauncherSettingUpdateArgs,
} from './launcher-settings-contract.ts'
import type { LauncherWorkbenchRoute } from './launcher-navigation.ts'
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

type WorkbenchWindow = Readonly<{ webContents: Readonly<{ id: number }> }>

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
  getTheme?: () => LauncherThemeProjection
  guard: LauncherIpcGuard
  ipcMain: LauncherIpcMain
  openSettings?: () => Promise<void> | void
}>): () => void {
  const registrations: Array<[string, LauncherIpcHandler]> = [[
    LAUNCHER_WINDOW_IPC_CHANNELS.dismiss,
    (event: unknown, ...rawArgs: unknown[]): LauncherWindowAcknowledgement => {
      args.guard.assert(event, 'launcher')
      assertNoLauncherIpcArguments(rawArgs)
      args.controller.hide()
      return Object.freeze({ ok: true })
    },
  ]]
  if (args.getTheme !== undefined) registrations.push([
    LAUNCHER_WINDOW_IPC_CHANNELS.getThemeSource,
    (event: unknown, ...rawArgs: unknown[]): LauncherThemeProjection => {
      args.guard.assert(event, 'launcher')
      assertNoLauncherIpcArguments(rawArgs)
      return parseLauncherThemeProjection(args.getTheme?.())
    },
  ])
  if (args.openSettings !== undefined) registrations.push([
    LAUNCHER_WINDOW_IPC_CHANNELS.openSettings,
    async (event: unknown, ...rawArgs: unknown[]): Promise<LauncherWindowAcknowledgement> => {
      args.guard.assert(event, 'launcher')
      assertNoLauncherIpcArguments(rawArgs)
      args.controller.hide()
      await args.openSettings?.()
      return Object.freeze({ ok: true })
    },
  ])
  return registerAll(args.ipcMain, registrations)
}

export type LauncherSettingsIpcOperations = Readonly<{
  exportSettings: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>
  getSnapshot: () => unknown
  importSettings: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>
  resetSettings: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>
  revokeCustomBrowser: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>
  revokeExternalSettings: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>
  selectCustomBrowser: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>
  selectExternalSettings: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>
  updateSetting: (key: string, value: unknown) => Promise<Readonly<{ canceled?: boolean; ok: true }>>
}>

export function registerWorkbenchLauncherIpcHandlers(args: Readonly<{
  assertTrustedMainIpc: (event: unknown) => void
  controller: Pick<LauncherWindowIpcController, 'getState' | 'show'>
  ipcMain: LauncherIpcMain
  onRouteReady?: (event: unknown) => void
  settings?: LauncherSettingsIpcOperations
  syncTheme?: (event: unknown, source: LauncherThemeSource) => LauncherWindowAcknowledgement
}>): () => void {
  const registrations: Array<[string, LauncherIpcHandler]> = [
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
  ]
  if (args.onRouteReady !== undefined) registrations.push([
    LAUNCHER_WINDOW_IPC_CHANNELS.routeReady,
    (event: unknown, ...rawArgs: unknown[]): LauncherWindowAcknowledgement => {
      args.assertTrustedMainIpc(event)
      assertNoLauncherIpcArguments(rawArgs)
      args.onRouteReady?.(event)
      return Object.freeze({ ok: true })
    },
  ])
  if (args.syncTheme !== undefined) registrations.push([
    LAUNCHER_WINDOW_IPC_CHANNELS.syncThemeSource,
    (event: unknown, raw: unknown, ...rawArgs: unknown[]): LauncherWindowAcknowledgement => {
      args.assertTrustedMainIpc(event)
      assertNoLauncherIpcArguments(rawArgs)
      return args.syncTheme?.(event, parseLauncherThemeSource(raw)) ?? Object.freeze({ ok: true })
    },
  ])
  const settings = args.settings
  if (settings !== undefined) {
    registrations.push(
      [LAUNCHER_SETTINGS_IPC_CHANNELS.getSnapshot, (event: unknown, ...rawArgs: unknown[]): unknown => {
        args.assertTrustedMainIpc(event)
        assertNoLauncherIpcArguments(rawArgs)
        return settings.getSnapshot()
      }],
      [LAUNCHER_SETTINGS_IPC_CHANNELS.updateSetting, async (event: unknown, raw: unknown, ...rawArgs: unknown[]): Promise<Readonly<{ ok: true }>> => {
        args.assertTrustedMainIpc(event)
        assertNoLauncherIpcArguments(rawArgs)
        const update = parseLauncherSettingUpdateArgs(raw)
        await settings.updateSetting(update.key, update.value)
        return Object.freeze({ ok: true })
      }],
    )
    const native = (channel: string, operation: () => Promise<Readonly<{ canceled?: boolean; ok: true }>>): void => {
      registrations.push([channel, async (event: unknown, ...rawArgs: unknown[]): Promise<Readonly<{ canceled?: boolean; ok: true }>> => {
        args.assertTrustedMainIpc(event)
        assertNoLauncherIpcArguments(rawArgs)
        return await operation()
      }])
    }
    native(LAUNCHER_SETTINGS_IPC_CHANNELS.importSettings, settings.importSettings)
    native(LAUNCHER_SETTINGS_IPC_CHANNELS.exportSettings, settings.exportSettings)
    native(LAUNCHER_SETTINGS_IPC_CHANNELS.resetSettings, settings.resetSettings)
    native(LAUNCHER_SETTINGS_IPC_CHANNELS.selectExternalSettings, settings.selectExternalSettings)
    native(LAUNCHER_SETTINGS_IPC_CHANNELS.revokeExternalSettings, settings.revokeExternalSettings)
    native(LAUNCHER_SETTINGS_IPC_CHANNELS.selectCustomBrowser, settings.selectCustomBrowser)
    native(LAUNCHER_SETTINGS_IPC_CHANNELS.revokeCustomBrowser, settings.revokeCustomBrowser)
  }
  return registerAll(args.ipcMain, registrations)
}

export type { LauncherWorkbenchRoute, WorkbenchWindow }
