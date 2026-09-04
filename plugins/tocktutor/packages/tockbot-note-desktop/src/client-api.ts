import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { TockTutorSlots } from '@tockteam/tocktutor-workbench/client'
import desktopRemote from 'tockbot-note-desktop/remote'
import {
  type DesktopActionRemote,
  type DesktopCallerBridge,
  TockTutorNativeActions,
} from './client-actions.tsx'
import { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts'

type Context = CordisContext & { slots: TockTutorSlots }

export const name = 'tockbot-note-desktop'
const TOCKTUTOR_NATIVE_ACTIONS_SLOT = 'tockteam.tocktutor.workbench.native-actions'
export const inject = [TOCKTEAM_SURFACE_SERVICE, 'remote', 'slots']

async function disposeClient(
  bridge: DesktopCallerBridge,
  disposeRemote: () => Promise<void>,
): Promise<void> {
  try {
    await bridge.cancelDispatch()
  } catch (error) {
    await disposeRemote()
    throw error
  }
  await disposeRemote()
}

async function disposeMounted(
  slotFiber: ReturnType<Context['inject']> | undefined,
  bridge: DesktopCallerBridge,
  disposeRemote: () => Promise<void>,
): Promise<void> {
  let slotError: unknown
  try {
    await slotFiber?.dispose()
  } catch (error) {
    slotError = error
  }
  try {
    await disposeClient(bridge, disposeRemote)
  } catch (error) {
    if (slotError !== undefined) {
      throw new AggregateError([slotError, error], 'Desktop client cleanup failed.')
    }
    throw error
  }
  if (slotError !== undefined) throw slotError
}

function desktopBridge(): DesktopCallerBridge {
  const bridge = (window as unknown as {
    dshDesktop?: { tockTutor?: DesktopCallerBridge }
  }).dshDesktop?.tockTutor
  if (
    bridge === undefined
    || typeof bridge.authorize !== 'function'
    || typeof bridge.cancelDispatch !== 'function'
    || typeof bridge.completeDispatch !== 'function'
    || typeof bridge.nextDispatch !== 'function'
  ) throw new Error('tockbot-note-desktop: trusted Desktop caller facade is unavailable')
  return bridge
}

/** Mount the caller facade Remote and one root-scoped Workbench contribution. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  assertDesktopSurface(ctx.get(TOCKTEAM_SURFACE_SERVICE))
  const bridge = desktopBridge()
  const disposeRemote = await ctx.remote.$mount(desktopRemote)
  let slotFiber: ReturnType<Context['inject']> | undefined
  try {
    slotFiber = ctx.inject(
      ['remote', 'remote.tocktutorDesktop', 'slots'],
      child => {
        const remote: DesktopActionRemote = {
          tocktutorDesktop: (child.remote as unknown as DesktopActionRemote).tocktutorDesktop,
        }
        const slots = (child as Context).slots
        return slots.inject(
          TOCKTUTOR_NATIVE_ACTIONS_SLOT,
          () => slots.register({
            id: name,
            inject: () => ({ bridge, remote }),
            name: TOCKTUTOR_NATIVE_ACTIONS_SLOT,
            registrant: name,
          }, TockTutorNativeActions),
        )
      },
    )
    await slotFiber
  } catch (error) {
    try {
      await disposeMounted(slotFiber, bridge, disposeRemote)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Desktop client startup cleanup failed.')
    }
    throw error
  }
  return async () => {
    await disposeMounted(slotFiber, bridge, disposeRemote)
  }
}

export * from './client-actions.tsx'
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts'
