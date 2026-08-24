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
  let disposePanel: (() => void) | undefined
  try {
    disposePanel = ctx.slots.inject(
      TOCKTUTOR_ASSISTANT_PANEL_SLOT,
      () => ctx.slots.register({
        inject: () => ({
          remote: ctx.remote as unknown as AssistantPanelRemote,
          sessions: ctx.sessions as unknown as AssistantPanelSessions,
        }),
        name: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
        registrant: name,
      }, TockTutorAssistantPanel),
    )
  } catch (error) {
    await disposeRemote()
    throw error
  }
  return async () => {
    disposePanel?.()
    await disposeRemote()
  }
}

export type * from './remote-types.ts'
