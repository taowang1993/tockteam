import {
  LAUNCHER_IPC_CHANNELS,
  LAUNCHER_SURFACE_IPC_CHANNELS,
  parseLauncherCancelActionArgs,
  parseLauncherLocale,
  parseLauncherCoreStatus,
  parseLauncherInvokeActionArgs,
  parseLauncherInvokeResult,
  parseLauncherSuccessResult,
  parseLauncherSearchArgs,
  parseLauncherSearchResponse,
  parseLauncherSurfaceSettings,
  type LauncherInvokeResult,
  type LauncherSearchResponse,
} from './launcher-contract.ts'
import {
  LAUNCHER_WINDOW_IPC_CHANNELS,
  parseLauncherWindowAcknowledgement,
  parseLauncherThemeProjection,
  type LauncherThemeProjection,
} from './launcher-window-contract.ts'
import type { LauncherCoreStatus, LauncherSearchOptions } from './launcher-core-search.ts'
import { parseLauncherLocalExtensionSettings, type LauncherLocalExtensionSettings } from './launcher-local-extension-contract.ts'

type IpcInvoker = Readonly<{
  invoke: (channel: string, args?: unknown) => Promise<unknown>
  on?: (channel: string, listener: (...args: any[]) => void) => unknown
  removeListener?: (channel: string, listener: (...args: any[]) => void) => unknown
}>

export type LauncherPreloadBridge = Readonly<{
  dismiss: (...args: unknown[]) => Promise<void>
  getLocalExtensionSettings: (...args: unknown[]) => Promise<LauncherLocalExtensionSettings>
  getSurfaceSettings: (...args: unknown[]) => Promise<import('./launcher-contract.ts').LauncherSurfaceSettings>
  getTheme: (...args: unknown[]) => Promise<LauncherThemeProjection>
  cancelAction: (actionId: string, resultSetId: string) => Promise<Readonly<{ ok: true }>>
  invokeAction: (actionId: string) => Promise<LauncherInvokeResult>
  onLocale: (listener: (locale: import('./launcher-contract.ts').LauncherLocale) => void) => () => void
  onTheme: (listener: (projection: LauncherThemeProjection) => void) => () => void
  openSettings: (...args: unknown[]) => Promise<void>
  rescan: () => Promise<LauncherCoreStatus>
  recordSearch: (query: string) => Promise<import('./launcher-contract.ts').LauncherSurfaceSettings>
  search: (searchTerm: string, options: LauncherSearchOptions) => Promise<LauncherSearchResponse>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertArity(method: string, args: readonly unknown[], expected: number): void {
  if (args.length !== expected) throw new Error(`TockLauncher ${method} does not accept these arguments`)
}

export function createLauncherPreloadBridge(ipcRenderer: IpcInvoker): LauncherPreloadBridge {
  const localeListeners = new Set<(locale: import('./launcher-contract.ts').LauncherLocale) => void>()
  const themeListeners = new Set<(projection: LauncherThemeProjection) => void>()
  let latestLocale: import('./launcher-contract.ts').LauncherLocale | undefined
  let latestTheme: LauncherThemeProjection | undefined
  const receiveLocale = (_event: unknown, raw: unknown): void => {
    let locale: import('./launcher-contract.ts').LauncherLocale
    try { locale = parseLauncherLocale(raw) } catch { return }
    latestLocale = locale
    for (const listener of localeListeners) listener(locale)
  }
  const receiveTheme = (_event: unknown, raw: unknown): void => {
    let projection: LauncherThemeProjection
    try {
      projection = parseLauncherThemeProjection(raw)
    } catch {
      return
    }
    if (latestTheme !== undefined && projection.revision < latestTheme.revision) return
    latestTheme = projection
    for (const listener of themeListeners) listener(projection)
  }
  ipcRenderer.on?.(LAUNCHER_WINDOW_IPC_CHANNELS.locale, receiveLocale)
  ipcRenderer.on?.(LAUNCHER_WINDOW_IPC_CHANNELS.theme, receiveTheme)
  return Object.freeze({
    dismiss: async (...args: unknown[]): Promise<void> => {
      assertArity('dismiss', args, 0)
      parseLauncherWindowAcknowledgement(await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.dismiss))
    },
    getLocalExtensionSettings: async (...args: unknown[]): Promise<LauncherLocalExtensionSettings> => {
      assertArity('getLocalExtensionSettings', args, 0)
      return parseLauncherLocalExtensionSettings(await ipcRenderer.invoke(LAUNCHER_SURFACE_IPC_CHANNELS.getLocalExtensionSettings))
    },
    getSurfaceSettings: async (...args: unknown[]): Promise<import('./launcher-contract.ts').LauncherSurfaceSettings> => {
      assertArity('getSurfaceSettings', args, 0)
      return parseLauncherSurfaceSettings(await ipcRenderer.invoke(LAUNCHER_SURFACE_IPC_CHANNELS.getSettings))
    },
    getTheme: async (...args: unknown[]): Promise<LauncherThemeProjection> => {
      assertArity('getTheme', args, 0)
      return parseLauncherThemeProjection(await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.getThemeSource))
    },
    cancelAction: async (actionId: unknown, resultSetId: unknown, ...extra: unknown[]): Promise<Readonly<{ ok: true }>> => {
      assertArity('cancelAction', [actionId, resultSetId, ...extra], 2)
      const input = parseLauncherCancelActionArgs({ actionId, resultSetId })
      return parseLauncherSuccessResult(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.cancelAction, input))
    },
    invokeAction: async (actionId: unknown, ...extra: unknown[]): Promise<LauncherInvokeResult> => {
      assertArity('invokeAction', [actionId, ...extra], 1)
      const input = parseLauncherInvokeActionArgs({ actionId })
      return parseLauncherInvokeResult(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.invokeAction, input))
    },
    onLocale: (listener: (locale: import('./launcher-contract.ts').LauncherLocale) => void): (() => void) => {
      if (typeof listener !== 'function') throw new Error('TockLauncher locale listener is invalid')
      localeListeners.add(listener)
      if (latestLocale !== undefined) listener(latestLocale)
      return () => { localeListeners.delete(listener) }
    },
    onTheme: (listener: (projection: LauncherThemeProjection) => void): (() => void) => {
      if (typeof listener !== 'function') throw new Error('TockLauncher theme listener is invalid')
      themeListeners.add(listener)
      if (latestTheme !== undefined) listener(latestTheme)
      return () => { themeListeners.delete(listener) }
    },
    openSettings: async (...args: unknown[]): Promise<void> => {
      assertArity('openSettings', args, 0)
      parseLauncherWindowAcknowledgement(await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.openSettings))
    },
    recordSearch: async (query: unknown, ...extra: unknown[]): Promise<import('./launcher-contract.ts').LauncherSurfaceSettings> => {
      assertArity('recordSearch', [query, ...extra], 1)
      if (typeof query !== 'string') throw new Error('TockLauncher search history query is invalid')
      return parseLauncherSurfaceSettings(await ipcRenderer.invoke(LAUNCHER_SURFACE_IPC_CHANNELS.recordSearch, query))
    },
    rescan: async (...args: unknown[]): Promise<LauncherCoreStatus> => {
      assertArity('rescan', args, 0)
      return parseLauncherCoreStatus(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.rescan))
    },
    search: async (searchTerm: unknown, options: unknown, ...extra: unknown[]): Promise<LauncherSearchResponse> => {
      assertArity('search', [searchTerm, options, ...extra], 2)
      const optionRecord = isRecord(options) ? options : {}
      if (Object.prototype.hasOwnProperty.call(optionRecord, 'searchTerm')) {
        throw new Error('TockLauncher search options must not include searchTerm')
      }
      const input = parseLauncherSearchArgs({ ...optionRecord, searchTerm })
      return parseLauncherSearchResponse(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.search, input))
    },
  })
}
