import {
  LAUNCHER_IPC_CHANNELS,
  parseLauncherCoreStatus,
  parseLauncherInvokeActionArgs,
  parseLauncherInvokeResult,
  parseLauncherSearchArgs,
  parseLauncherSearchResponse,
  type LauncherInvokeResult,
  type LauncherSearchResponse,
} from './launcher-contract.ts'
import {
  LAUNCHER_WINDOW_IPC_CHANNELS,
  parseLauncherWindowAcknowledgement,
} from './launcher-window-contract.ts'
import type { LauncherCoreStatus, LauncherSearchOptions } from './launcher-core-search.ts'

type IpcInvoker = Readonly<{
  invoke: (channel: string, args?: unknown) => Promise<unknown>
}>

export type LauncherPreloadBridge = Readonly<{
  dismiss: (...args: unknown[]) => Promise<void>
  invokeAction: (actionId: string) => Promise<LauncherInvokeResult>
  rescan: () => Promise<LauncherCoreStatus>
  search: (searchTerm: string, options: LauncherSearchOptions) => Promise<LauncherSearchResponse>
}>

export function createLauncherPreloadBridge(ipcRenderer: IpcInvoker): LauncherPreloadBridge {
  return Object.freeze({
    dismiss: async (...args: unknown[]): Promise<void> => {
      if (args.length !== 0) throw new Error('TockLauncher dismiss does not accept arguments')
      parseLauncherWindowAcknowledgement(await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.dismiss))
    },
    invokeAction: async (actionId: string): Promise<LauncherInvokeResult> => {
      const input = parseLauncherInvokeActionArgs({ actionId })
      return parseLauncherInvokeResult(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.invokeAction, input))
    },
    rescan: async (): Promise<LauncherCoreStatus> => {
      return parseLauncherCoreStatus(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.rescan))
    },
    search: async (searchTerm: string, options: LauncherSearchOptions): Promise<LauncherSearchResponse> => {
      const input = parseLauncherSearchArgs({ searchTerm, ...options })
      return parseLauncherSearchResponse(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.search, input))
    },
  })
}
