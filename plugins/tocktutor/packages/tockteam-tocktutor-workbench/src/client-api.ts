import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { SlotEntryDef } from '@deepseek-ai/dsh-client-ui-slots'
import {
  TOCKTUTOR_ROUTE_SLOT,
  type TockTutorRouteOwnerProps,
} from '@tockteam/desktop/client'
import workbenchRemote from '@tockteam/tocktutor-workbench/remote'
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from './assistant-panel.ts'
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT } from './native-actions.ts'
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from './review-panel.ts'
import { TockTutorRoute, type WorkbenchRouteRemote } from './route.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'tockteam.tocktutor.route': SlotEntryDef & {
      kind: 'single'
      owner: TockTutorRouteOwnerProps
      scope: 'root'
    }
  }
}

/** Browser Loader identity for the native TockTutor workbench. */
export const name = '@tockteam/tocktutor-workbench'

/** Required transport and route registry supplied by the pinned Desktop client graph. */
export const inject = ['remote', 'slots']

/** Mount strict transport first, then contribute one lifecycle-owned Desktop route. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(workbenchRemote)
  const routeFiber = ctx.inject(
    ['remote', 'remote.tocktutorWorkbench', 'slots'],
    child => {
      const mountedRemote = child.remote as unknown as WorkbenchRouteRemote
      const remote: WorkbenchRouteRemote = {
        $on: mountedRemote.$on.bind(mountedRemote),
        tocktutorWorkbench: mountedRemote.tocktutorWorkbench,
      }
      return child.slots.inject(
        TOCKTUTOR_ROUTE_SLOT,
        () => child.slots.register({
          children: {
            [TOCKTUTOR_ASSISTANT_PANEL_SLOT]: { kind: 'single', scope: 'root' },
            [TOCKTUTOR_NATIVE_ACTIONS_SLOT]: { kind: 'list', scope: 'root' },
            [TOCKTUTOR_REVIEW_PANEL_SLOT]: { kind: 'list', scope: 'root' },
          },
          inject: () => ({ remote }),
          name: TOCKTUTOR_ROUTE_SLOT,
          registrant: name,
        }, TockTutorRoute),
      )
    },
  )
  try {
    await routeFiber
  } catch (error) {
    await routeFiber.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await routeFiber.dispose()
    await disposeRemote()
  }
}

export * from './assistant-panel.ts'
export * from './native-actions.ts'
export * from './review-panel.ts'
export * from './route.tsx'
export * from './types.ts'
export * from './vault-events.ts'
