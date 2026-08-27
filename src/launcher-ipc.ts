import type { LauncherActionOwner, LauncherActionStore, LauncherInternalResultItem } from './launcher-actions.ts'
import { LauncherActionExpiredError } from './launcher-actions.ts'
import {
  LAUNCHER_IPC_CHANNELS,
  parseLauncherInvokeActionArgs,
  parseLauncherSearchArgs,
  type LauncherSearchResponse,
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

type LauncherActions = Pick<LauncherActionStore, 'invoke' | 'publish'>

type LauncherSearchIpcArgs = Readonly<{
  actions: LauncherActions
  guard: LauncherIpcGuard
  ipcMain: LauncherIpcMain
  rescan: () => Promise<LauncherCoreStatus>
  search: LauncherSearchProvider
}>

function senderId(event: unknown, owner: LauncherActionOwner): number {
  const sender = (event as { sender?: unknown } | null)?.sender
  if (typeof sender !== 'object' || sender === null) throw new Error('Launcher IPC sender is unavailable')
  return owner.webContentsId
}

function assertNoArguments(channel: string, args: readonly unknown[]): void {
  if (args.length !== 0) throw new Error(`${channel} does not accept arguments`)
}

export function registerLauncherIpcHandlers(args: LauncherSearchIpcArgs): () => void {
  const latestSearchTokens = new Map<number, object>()
  return registerLauncherOwnedIpcHandlers(args.ipcMain, [
    [
      LAUNCHER_IPC_CHANNELS.search,
      async (event: unknown, input: unknown): Promise<LauncherSearchResponse> => {
        const owner = args.guard.assert(event, 'launcher')
        const request = parseLauncherSearchArgs(input)
        const token = Object.freeze({})
        const id = senderId(event, owner)
        latestSearchTokens.set(id, token)
        const result = await args.search(request.searchTerm, {
          fuzziness: request.fuzziness,
          maxSearchResultItems: request.maxSearchResultItems,
          searchEngineId: request.searchEngineId,
        })
        if (latestSearchTokens.get(id) !== token) throw new Error('TockLauncher search was superseded')
        const activeOwner = args.guard.assert(event, 'launcher')
        if (activeOwner.webContentsId !== owner.webContentsId) {
          throw new Error('TockLauncher search owner changed')
        }
        const beforeCount = result.before.length
        const published = args.actions.publish({
          items: [...result.before, ...result.after],
          owner: activeOwner,
        })
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
        args.guard.assert(event, 'launcher')
        assertNoArguments(LAUNCHER_IPC_CHANNELS.rescan, rawArgs)
        return await args.rescan()
      },
    ],
    [
      LAUNCHER_IPC_CHANNELS.invokeAction,
      async (event: unknown, input: unknown): Promise<Readonly<{ ok: true } | { ok: false; reason: 'expired' }>> => {
        const owner = args.guard.assert(event, 'launcher')
        const { actionId } = parseLauncherInvokeActionArgs(input)
        try {
          return await args.actions.invoke({ actionId, owner })
        } catch (error) {
          if (error instanceof LauncherActionExpiredError) return Object.freeze({ ok: false as const, reason: 'expired' as const })
          throw error
        }
      },
    ],
  ])
}
