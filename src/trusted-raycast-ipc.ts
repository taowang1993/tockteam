import {
  TRUSTED_RAYCAST_IPC_CHANNELS,
  isTrustedRaycastViewEvent,
  type TrustedRaycastViewEvent,
} from './trusted-raycast-contract.ts'
import type { LauncherIpcGuard, LauncherIpcMain } from './launcher-window-ipc.ts'
import { registerLauncherOwnedIpcHandlers } from './launcher-window-ipc.ts'

export function registerTrustedRaycastIpcHandlers(args: Readonly<{
  guard: LauncherIpcGuard
  ipcMain: LauncherIpcMain
  onClose: (owner: Readonly<{ webContentsId: number }>) => Promise<void> | void
  onEvent: (owner: Readonly<{ webContentsId: number }>, event: TrustedRaycastViewEvent) => Promise<void> | void
}>): () => void {
  return registerLauncherOwnedIpcHandlers(args.ipcMain, [
    [TRUSTED_RAYCAST_IPC_CHANNELS.close, async (event: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher')
      if (extra.length !== 0) throw new Error('Trusted Translate close does not accept arguments')
      await args.onClose(owner)
      return Object.freeze({ ok: true as const })
    }],
    [TRUSTED_RAYCAST_IPC_CHANNELS.event, async (event: unknown, raw: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher')
      if (extra.length !== 0 || !isTrustedRaycastViewEvent(raw)) throw new Error('Invalid Trusted Translate view event')
      await args.onEvent(owner, raw)
      return Object.freeze({ ok: true as const })
    }],
  ])
}
