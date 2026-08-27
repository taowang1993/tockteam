import type { LauncherActionOwner, LauncherActionStore, LauncherInternalResultItem } from './launcher-actions.ts'
import { LauncherActionExpiredError } from './launcher-actions.ts'
import {
  LAUNCHER_IPC_CHANNELS,
  LAUNCHER_SURFACE_IPC_CHANNELS,
  parseLauncherInvokeActionArgs,
  parseLauncherSearchArgs,
  type LauncherSearchResponse,
  type LauncherSurfaceSettings,
} from './launcher-contract.ts'
import type { LauncherCoreStatus, LauncherSearchOptions } from './launcher-core-search.ts'
import type { LauncherIpcGuard, LauncherIpcMain } from './launcher-window-ipc.ts'
import { registerLauncherOwnedIpcHandlers } from './launcher-window-ipc.ts'

export type LauncherSearchProvider = (
  searchTerm: string,
  options: LauncherSearchOptions,
) => Promise<Readonly<{
  after: readonly LauncherInternalResultItem[]
  before: readonly LauncherInternalResultItem[]
  status: LauncherCoreStatus
}>>

type LauncherActions = Pick<LauncherActionStore, 'clearOwner' | 'invoke' | 'publish'>

type LauncherSearchIpcArgs = Readonly<{
  actions: LauncherActions
  guard: LauncherIpcGuard
  ipcMain: LauncherIpcMain
  rescan: () => Promise<LauncherCoreStatus>
  search: LauncherSearchProvider
  surface?: Readonly<{
    getSettings: () => LauncherSurfaceSettings
    recordSearch: (query: string) => Promise<LauncherSurfaceSettings> | LauncherSurfaceSettings
  }>
}>

function senderId(event: unknown, owner: LauncherActionOwner): number {
  const sender = (event as { sender?: unknown } | null)?.sender
  if (typeof sender !== 'object' || sender === null) throw new Error('Launcher IPC sender is unavailable')
  return owner.webContentsId
}

function assertNoArguments(channel: string, args: readonly unknown[]): void {
  if (args.length !== 0) throw new Error(`${channel} does not accept arguments`)
}

function operationFailure(): Error {
  return new Error('TockLauncher operation failed')
}

export function registerLauncherIpcHandlers(args: LauncherSearchIpcArgs): () => void {
  const latestSearchTokens = new Map<number, object>()
  const registrations: Array<[string, (...args: any[]) => unknown]> = [
    [
      LAUNCHER_IPC_CHANNELS.search,
      async (event: unknown, input: unknown, ...extra: unknown[]): Promise<LauncherSearchResponse> => {
        const owner = args.guard.assert(event, 'launcher')
        assertNoArguments(LAUNCHER_IPC_CHANNELS.search, extra)
        const request = parseLauncherSearchArgs(input)
        const token = Object.freeze({})
        const id = senderId(event, owner)
        latestSearchTokens.set(id, token)
        let result
        try {
          result = await args.search(request.searchTerm, {
            fuzziness: request.fuzziness,
            maxSearchResultItems: request.maxSearchResultItems,
            searchEngineId: request.searchEngineId,
          })
        } catch { throw operationFailure() }
        if (latestSearchTokens.get(id) !== token) throw new Error('TockLauncher search was superseded')
        const activeOwner = args.guard.assert(event, 'launcher')
        if (activeOwner.webContentsId !== owner.webContentsId) {
          throw new Error('TockLauncher search owner changed')
        }
        const beforeCount = result.before.length
        let published
        try {
          published = args.actions.publish({
            items: [...result.before, ...result.after],
            owner: activeOwner,
          })
        } catch { throw operationFailure() }
        return Object.freeze({
          after: Object.freeze(published.items.slice(beforeCount)),
          before: Object.freeze(published.items.slice(0, beforeCount)),
          resultSetId: published.resultSetId,
          status: result.status,
        })
      },
    ],
    [
      LAUNCHER_IPC_CHANNELS.rescan,
      async (event: unknown, ...rawArgs: unknown[]): Promise<LauncherCoreStatus> => {
        const owner = args.guard.assert(event, 'launcher')
        assertNoArguments(LAUNCHER_IPC_CHANNELS.rescan, rawArgs)
        args.actions.clearOwner(owner)
        try { return await args.rescan() }
        catch { throw operationFailure() }
      },
    ],
    [
      LAUNCHER_IPC_CHANNELS.invokeAction,
      async (event: unknown, input: unknown, ...extra: unknown[]): Promise<Readonly<{ ok: true } | { ok: false; reason: 'expired' }>> => {
        const owner = args.guard.assert(event, 'launcher')
        assertNoArguments(LAUNCHER_IPC_CHANNELS.invokeAction, extra)
        const { actionId } = parseLauncherInvokeActionArgs(input)
        try {
          return await args.actions.invoke({ actionId, owner })
        } catch (error) {
          if (error instanceof LauncherActionExpiredError) return Object.freeze({ ok: false as const, reason: 'expired' as const })
          throw operationFailure()
        }
      },
    ],
  ]
  if (args.surface !== undefined) {
    registrations.push(
      [LAUNCHER_SURFACE_IPC_CHANNELS.getSettings, (event: unknown, ...rawArgs: unknown[]): LauncherSurfaceSettings => {
        args.guard.assert(event, 'launcher')
        assertNoArguments(LAUNCHER_SURFACE_IPC_CHANNELS.getSettings, rawArgs)
        try { return args.surface!.getSettings() }
        catch { throw operationFailure() }
      }],
      [LAUNCHER_SURFACE_IPC_CHANNELS.recordSearch, async (event: unknown, rawQuery: unknown, ...extra: unknown[]): Promise<LauncherSurfaceSettings> => {
        args.guard.assert(event, 'launcher')
        assertNoArguments(LAUNCHER_SURFACE_IPC_CHANNELS.recordSearch, extra)
        if (typeof rawQuery !== 'string' || rawQuery.length > 512 || /[\0\r\n]/u.test(rawQuery)) throw new Error('Invalid launcher search history query')
        try { return await args.surface!.recordSearch(rawQuery) }
        catch { throw operationFailure() }
      }],
    )
  }
  return registerLauncherOwnedIpcHandlers(args.ipcMain, registrations)
}
