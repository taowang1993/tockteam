import { TOCKTUTOR_ROUTE_SLOT, } from '@tockteam/desktop/client';
import workbenchRemote from '@tockteam/tocktutor-workbench/remote';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from "./assistant-panel.js";
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT } from "./native-actions.js";
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from "./review-panel.js";
import { TockTutorRoute } from "./route.js";
/** Browser Loader identity for the native TockTutor workbench. */
export const name = '@tockteam/tocktutor-workbench';
/** Required transport and route registry supplied by the pinned Desktop client graph. */
export const inject = ['remote', 'slots'];
/** Mount strict transport first, then contribute one lifecycle-owned Desktop route. */
export async function apply(ctx) {
    const disposeRemote = await ctx.remote.$mount(workbenchRemote);
    const routeFiber = ctx.inject(['remote', 'remote.tocktutorWorkbench', 'slots'], child => {
        const mountedRemote = child.remote;
        const remote = {
            $on: mountedRemote.$on.bind(mountedRemote),
            tocktutorWorkbench: mountedRemote.tocktutorWorkbench,
        };
        return child.slots.inject(TOCKTUTOR_ROUTE_SLOT, () => child.slots.register({
            children: {
                [TOCKTUTOR_ASSISTANT_PANEL_SLOT]: { kind: 'single', scope: 'root' },
                [TOCKTUTOR_NATIVE_ACTIONS_SLOT]: { kind: 'list', scope: 'root' },
                [TOCKTUTOR_REVIEW_PANEL_SLOT]: { kind: 'list', scope: 'root' },
            },
            inject: () => ({ remote }),
            name: TOCKTUTOR_ROUTE_SLOT,
            registrant: name,
        }, TockTutorRoute));
    });
    try {
        await routeFiber;
    }
    catch (error) {
        await routeFiber.dispose();
        await disposeRemote();
        throw error;
    }
    return async () => {
        await routeFiber.dispose();
        await disposeRemote();
    };
}
export * from "./assistant-panel.js";
export * from "./native-actions.js";
export * from "./review-panel.js";
export * from "./route.js";
export * from "./types.js";
export * from "./vault-events.js";
//# sourceMappingURL=client-api.js.map