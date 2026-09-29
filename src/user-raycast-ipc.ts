import { USER_RAYCAST_IPC, isUserRaycastApproval, isUserRaycastCandidate, isUserRaycastEvent, isUserRaycastMutation, isUserRaycastSourceCandidate, isUserRaycastSourceSelection, isUserRaycastStatus, type UserRaycastEvent, type UserRaycastMutation, type UserRaycastStatus } from './user-raycast-contract.ts'
import type { UserRaycastCandidate } from './user-raycast-install.ts'
import type { UserRaycastSourceCandidate } from './user-raycast-registry.ts'
import type { UserRaycastOwner } from './user-raycast-manager.ts'
import type { LauncherIpcGuard, LauncherIpcMain } from './launcher-window-ipc.ts'
import { registerLauncherOwnedIpcHandlers } from './launcher-window-ipc.ts'

export function registerUserRaycastIpcHandlers(args: Readonly<{
  guard: LauncherIpcGuard
  ipcMain: LauncherIpcMain
  getState: () => UserRaycastStatus
  choose: (owner: UserRaycastOwner) => Promise<UserRaycastCandidate | undefined>
  sourcePrepare: (owner: UserRaycastOwner, selection: Readonly<{ extensionId: string; command: string }>) => Promise<UserRaycastSourceCandidate>
  sourceBuild: (owner: UserRaycastOwner, digest: string) => Promise<UserRaycastStatus>
  approve: (owner: UserRaycastOwner, digest: string) => Promise<UserRaycastStatus>
  mutate: (action: UserRaycastMutation) => Promise<UserRaycastStatus> | UserRaycastStatus
  open: (owner: UserRaycastOwner) => Promise<void>
  send: (owner: UserRaycastOwner, event: UserRaycastEvent) => void
  close: (owner: UserRaycastOwner) => Promise<void>
}>): () => void {
  const noArgs = (name: string, extra: unknown[]): void => { if (extra.length) throw new Error(`${name} accepts no arguments`) }
  return registerLauncherOwnedIpcHandlers(args.ipcMain, [
    [USER_RAYCAST_IPC.state, (event: unknown, ...extra: unknown[]) => {
      args.guard.assert(event, 'launcher'); noArgs('Extension state', extra)
      const result = args.getState()
      if (!isUserRaycastStatus(result)) throw new Error('Invalid extension state')
      return result
    }],
    [USER_RAYCAST_IPC.choose, async (event: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher'); noArgs('Choose extension', extra)
      const result = await args.choose(owner)
      const current = args.guard.assert(event, 'launcher')
      if (current.webContentsId !== owner.webContentsId) throw new Error('Extension owner changed')
      if (result !== undefined && !isUserRaycastCandidate(result)) throw new Error('Invalid chosen extension')
      return result
    }],
    [USER_RAYCAST_IPC.sourcePrepare, async (event: unknown, selection: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher')
      if (extra.length || !isUserRaycastSourceSelection(selection)) throw new Error('Invalid public source selection')
      const result = await args.sourcePrepare(owner, selection)
      if (args.guard.assert(event, 'launcher').webContentsId !== owner.webContentsId || !isUserRaycastSourceCandidate(result)) throw new Error('Invalid public source result or owner')
      return result
    }],
    [USER_RAYCAST_IPC.sourceBuild, async (event: unknown, request: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher')
      if (extra.length || !isUserRaycastApproval(request) || args.getState().sourceCandidate?.digest !== request.digest) throw new Error('Public source digest must be reviewed again')
      const result = await args.sourceBuild(owner, request.digest)
      if (args.guard.assert(event, 'launcher').webContentsId !== owner.webContentsId || !isUserRaycastStatus(result)) throw new Error('Invalid public source build result or owner')
      return result
    }],
    [USER_RAYCAST_IPC.approve, async (event: unknown, request: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher')
      if (extra.length || !isUserRaycastApproval(request) || args.getState().candidate?.digest !== request.digest) throw new Error('Extension digest must be reviewed again')
      const result = await args.approve(owner, request.digest)
      if (args.guard.assert(event, 'launcher').webContentsId !== owner.webContentsId || !isUserRaycastStatus(result)) throw new Error('Invalid extension approval result')
      return result
    }],
    [USER_RAYCAST_IPC.mutate, async (event: unknown, action: unknown, ...extra: unknown[]) => {
      args.guard.assert(event, 'launcher')
      if (extra.length || !isUserRaycastMutation(action)) throw new Error('Invalid extension action')
      const result = await args.mutate(action)
      if (!isUserRaycastStatus(result)) throw new Error('Invalid extension result')
      return result
    }],
    [USER_RAYCAST_IPC.open, async (event: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher'); noArgs('Open extension', extra)
      if (!args.getState().installed || !args.getState().enabled) throw new Error('Extension is not approved and enabled')
      await args.open(owner)
      try { if (args.guard.assert(event, 'launcher').webContentsId !== owner.webContentsId) throw new Error('Extension owner changed') }
      catch (error) { await args.close(owner); throw error }
      return Object.freeze({ ok: true as const })
    }],
    [USER_RAYCAST_IPC.event, (event: unknown, raw: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher')
      if (extra.length || !isUserRaycastEvent(raw)) throw new Error('Invalid extension event')
      args.send(owner, raw)
      return Object.freeze({ ok: true as const })
    }],
    [USER_RAYCAST_IPC.close, async (event: unknown, ...extra: unknown[]) => {
      const owner = args.guard.assert(event, 'launcher'); noArgs('Close extension', extra)
      await args.close(owner)
      return Object.freeze({ ok: true as const })
    }],
  ])
}
