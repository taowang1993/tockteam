import {
  TRUSTED_RAYCAST_IPC_CHANNELS,
  TRUSTED_RAYCAST_TRUST_IPC_CHANNELS,
  isTrustedRaycastTrustRequest,
  isTrustedRaycastTrustResult,
  isTrustedRaycastTrustStateEnvelope,
  isTrustedRaycastViewEvent,
  type TrustedRaycastTrustRequest,
  type TrustedRaycastTrustResult,
  type TrustedRaycastTrustStateEnvelope,
  type TrustedRaycastViewEvent,
} from './trusted-raycast-contract.ts'
import { getTrustedRaycastDescriptor, type TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'
import type { LauncherIpcGuard, LauncherIpcMain } from './launcher-window-ipc.ts'
import { registerLauncherOwnedIpcHandlers } from './launcher-window-ipc.ts'

export function registerTrustedRaycastIpcHandlers(args: Readonly<{
  guard: LauncherIpcGuard
  ipcMain: LauncherIpcMain
  getTrust: (extensionId: TrustedRaycastExtensionId) => TrustedRaycastTrustStateEnvelope
  onTrustAction: (request: TrustedRaycastTrustRequest) => Promise<TrustedRaycastTrustResult> | TrustedRaycastTrustResult
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
    [TRUSTED_RAYCAST_TRUST_IPC_CHANNELS.state, async (event: unknown, extensionId: unknown, ...extra: unknown[]) => {
      args.guard.assert(event, 'launcher')
      const descriptor = getTrustedRaycastDescriptor(extensionId)
      if (extra.length !== 0 || descriptor === undefined) throw new Error('Invalid Trusted Extensions state identity')
      const state = args.getTrust(descriptor.extensionId)
      if (!isTrustedRaycastTrustStateEnvelope(state) || state.extensionId !== extensionId) throw new Error('Invalid Trusted Extensions state')
      return state
    }],
    [TRUSTED_RAYCAST_TRUST_IPC_CHANNELS.action, async (event: unknown, raw: unknown, ...extra: unknown[]) => {
      args.guard.assert(event, 'launcher')
      if (extra.length !== 0 || !isTrustedRaycastTrustRequest(raw)) throw new Error('Invalid Trusted Extensions action')
      const result = await args.onTrustAction(raw)
      if (!isTrustedRaycastTrustResult(result) || result.extensionId !== raw.extensionId) throw new Error('Invalid Trusted Extensions action result')
      return result
    }],
  ])
}
