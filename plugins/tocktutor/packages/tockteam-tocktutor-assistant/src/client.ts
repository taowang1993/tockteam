import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import assistantRemote from '@tockteam/tocktutor-assistant/remote'
import {
  TOCKTUTOR_ASSISTANT_PANEL_SLOT,
  type TockTutorSlots,
} from '@tockteam/tocktutor-workbench/client'
import {
  TockTutorAssistantPanel,
  type AssistantPanelRemote,
  type AssistantPanelSessions,
} from './assistant-panel.tsx'

type Context = CordisContext & { slots: TockTutorSlots }

/** Browser Loader identity for the inline TockTutor assistant. */
export const name = '@tockteam/tocktutor-assistant'

/** Required generated transport and Workbench presentation services. */
export const inject = ['remote', 'sessions', 'slots']

/** Mount transport first, then contribute one lifecycle-owned nested Workbench panel. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(assistantRemote)
  let panelFiber: ReturnType<Context['inject']> | undefined
  try {
    panelFiber = ctx.inject(
      ['remote', 'remote.tocktutorAssistant', 'sessions', 'slots'],
      child => {
        const mountedRemote = child.remote as unknown as AssistantPanelRemote
        const remote: AssistantPanelRemote = {
          tocktutorAssistant: mountedRemote.tocktutorAssistant,
        }
        const sessions = child.sessions as unknown as AssistantPanelSessions
        const slots = (child as Context).slots
        return slots.inject(
          TOCKTUTOR_ASSISTANT_PANEL_SLOT,
          () => slots.register({
            inject: () => ({ remote, sessions }),
            name: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
            registrant: name,
          }, TockTutorAssistantPanel),
        )
      },
    )
    await panelFiber
  } catch (error) {
    await panelFiber?.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await panelFiber.dispose()
    await disposeRemote()
  }
}

export type * from './remote-types.ts'
