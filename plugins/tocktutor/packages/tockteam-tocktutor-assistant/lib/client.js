import assistantRemote from '@tockteam/tocktutor-assistant/remote';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT, } from '@tockteam/tocktutor-workbench/client';
import { TockTutorAssistantPanel, } from "./assistant-panel.js";
/** Browser Loader identity for the inline TockTutor assistant. */
export const name = '@tockteam/tocktutor-assistant';
/** Required generated transport and Workbench presentation services. */
export const inject = ['remote', 'sessions', 'slots'];
/** Mount transport first, then contribute one lifecycle-owned nested Workbench panel. */
export async function apply(ctx) {
    const disposeRemote = await ctx.remote.$mount(assistantRemote);
    let panelFiber;
    try {
        panelFiber = ctx.inject(['remote', 'remote.tocktutorAssistant', 'sessions', 'slots'], child => {
            const mountedRemote = child.remote;
            const remote = {
                tocktutorAssistant: mountedRemote.tocktutorAssistant,
            };
            const sessions = child.sessions;
            const slots = child.slots;
            return slots.inject(TOCKTUTOR_ASSISTANT_PANEL_SLOT, () => slots.register({
                inject: () => ({ remote, sessions }),
                name: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
                registrant: name,
            }, TockTutorAssistantPanel));
        });
        await panelFiber;
    }
    catch (error) {
        await panelFiber?.dispose();
        await disposeRemote();
        throw error;
    }
    return async () => {
        await panelFiber.dispose();
        await disposeRemote();
    };
}
//# sourceMappingURL=client.js.map