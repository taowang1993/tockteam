import { trustedRaycastDescriptors, type TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'
import type { TrustedRaycastFirstUseRequest } from './trusted-raycast-contract.ts'
import type { TrustedRaycastTrustStore } from './trusted-raycast-trust.ts'
import type { createTrustedRaycastMutex } from './trusted-raycast-mutex.ts'

type Lease = { owner: number; extensionId: TrustedRaycastExtensionId; canceled: boolean; busy: boolean; consumed: boolean; launching: boolean }
/** One launcher owner, one explicit consent operation. Cancellation is synchronous, outside the mutation queue. */
export function createTrustedRaycastFirstUse(deps: {
  mutex: ReturnType<typeof createTrustedRaycastMutex>
  active: () => boolean
  store: (extensionId: TrustedRaycastExtensionId) => Pick<TrustedRaycastTrustStore, 'status' | 'stage' | 'preview' | 'apply' | 'enable'> | undefined
  rescan: () => Promise<unknown>
  launch: (owner: number, extensionId: TrustedRaycastExtensionId, check: () => void) => Promise<void>
}) {
  let lease: Lease | undefined
  const cancel = (owner?: number): void => { if (lease && (owner === undefined || lease.owner === owner)) lease.canceled = true }
  const begin = (owner: number, extensionId: TrustedRaycastExtensionId): Lease => {
    cancel()
    lease = { owner, extensionId, canceled: false, busy: false, consumed: false, launching: false }
    return lease
  }
  const guard = (current: Lease): (() => void) => () => {
    if (lease !== current || current.canceled || !deps.active()) throw new Error('Extension opening canceled')
  }
  return {
    begin, cancel,
    invalidate: (extensionId: TrustedRaycastExtensionId): void => { if (lease?.extensionId === extensionId) cancel() },
    captureLaunch: (owner: number, extensionId: TrustedRaycastExtensionId): (() => void) => guard(
      lease?.owner === owner && lease.extensionId === extensionId && lease.launching ? lease : begin(owner, extensionId),
    ),
    async run(owner: number, request: TrustedRaycastFirstUseRequest): Promise<void> {
      const current = lease
      if (!current || current.owner !== owner || current.extensionId !== request.extensionId) throw new Error('Open the command to review it first')
      const check = guard(current); check()
      if (current.busy) throw new Error('Extension opening is busy')
      if (current.consumed) throw new Error('Extension approval was consumed')
      current.busy = true
      try {
        await deps.mutex(async () => {
          check()
          const store = deps.store(request.extensionId)
          if (!store) throw new Error('Reviewed extension is unavailable')
          const state = store.status()
          if (state.recovery) throw new Error('Recover the installation explicitly in Extensions')
          if (request.mode === 'enable') {
            if (!state.installed || !state.digestApproved || state.digest !== request.digest) throw new Error('Installed candidate changed; review it again')
          } else {
            if (state.installed) throw new Error('Use Enable and Open for an installed extension')
            if (!state.candidateAvailable || state.candidateDigest !== request.digest || request.digest !== trustedRaycastDescriptors[request.extensionId].artifactSha256) throw new Error('Reviewed candidate changed; review it again')
            check(); store.stage()
            check(); await store.preview()
            check(); store.apply(false)
          }
          // Atomic rotation may finish, but cancellation must never continue enablement or launch.
          check(); store.enable()
          check(); await deps.rescan()
          check()
        })
        check(); current.launching = true
        await deps.launch(owner, request.extensionId, check)
        check(); current.consumed = true
      } finally { current.busy = false; current.launching = false }
    },
  }
}
