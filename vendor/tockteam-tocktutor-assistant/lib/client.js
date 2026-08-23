import assistantRemote from '@tockteam/tocktutor-assistant/remote';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from '@tockteam/tocktutor-workbench/client';
import { TockTutorAssistantPanel, } from "./assistant-panel.js";
/** Browser Loader identity for the inline TockTutor assistant. */
export const name = '@tockteam/tocktutor-assistant';
/** Required generated transport and Workbench presentation services. */
export const inject = ['remote', 'sessions', 'slots'];
/** Mount transport first, then contribute one lifecycle-owned nested Workbench panel. */
export async function apply(ctx) {
    const disposeRemote = await ctx.remote.$mount(assistantRemote);
    let disposePanel;
    try {
        disposePanel = ctx.slots.inject(TOCKTUTOR_ASSISTANT_PANEL_SLOT, () => ctx.slots.register({
            inject: () => ({
                remote: ctx.remote,
                sessions: ctx.sessions,
            }),
            name: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
            registrant: name,
        }, TockTutorAssistantPanel));
    }
    catch (error) {
        await disposeRemote();
        throw error;
    }
    return async () => {
        disposePanel?.();
        await disposeRemote();
    };
}
//# sourceMappingURL=client.js.map