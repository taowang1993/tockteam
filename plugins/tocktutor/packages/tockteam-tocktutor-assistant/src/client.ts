import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import assistantRemote from '@tockteam/tocktutor-assistant/remote'
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from '@tockteam/tocktutor-workbench/client'
import {
  TockTutorAssistantPanel,
  type AssistantPanelRemote,
  type AssistantPanelSessions,
} from './assistant-panel.tsx'

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
        return child.slots.inject(
          TOCKTUTOR_ASSISTANT_PANEL_SLOT,
          () => child.slots.register({
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
