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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertArity(method: string, args: readonly unknown[], expected: number): void {
  if (args.length !== expected) throw new Error(`TockLauncher ${method} does not accept these arguments`)
}

export function createLauncherPreloadBridge(ipcRenderer: IpcInvoker): LauncherPreloadBridge {
  return Object.freeze({
    dismiss: async (...args: unknown[]): Promise<void> => {
      assertArity('dismiss', args, 0)
      parseLauncherWindowAcknowledgement(await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.dismiss))
    },
    invokeAction: async (...args: unknown[]): Promise<LauncherInvokeResult> => {
      assertArity('invokeAction', args, 1)
      const input = parseLauncherInvokeActionArgs({ actionId: args[0] })
      return parseLauncherInvokeResult(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.invokeAction, input))
    },
    rescan: async (...args: unknown[]): Promise<LauncherCoreStatus> => {
      assertArity('rescan', args, 0)
      return parseLauncherCoreStatus(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.rescan))
    },
    search: async (...args: unknown[]): Promise<LauncherSearchResponse> => {
      assertArity('search', args, 2)
      const [searchTerm, options] = args
      const optionRecord = isRecord(options) ? options : {}
      if (Object.prototype.hasOwnProperty.call(optionRecord, 'searchTerm')) {
        throw new Error('TockLauncher search options must not include searchTerm')
      }
      const input = parseLauncherSearchArgs({ ...optionRecord, searchTerm })
      return parseLauncherSearchResponse(await ipcRenderer.invoke(LAUNCHER_IPC_CHANNELS.search, input))
    },
  })
}
