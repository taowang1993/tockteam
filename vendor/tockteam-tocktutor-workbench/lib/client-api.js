import { TOCKTUTOR_ROUTE_SLOT, } from '@tockteam/desktop/client';
import workbenchRemote from '@tockteam/tocktutor-workbench/remote';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from "./assistant-panel.js";
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from "./review-panel.js";
import { TockTutorRoute } from "./route.js";
/** Browser Loader identity for the native TockTutor workbench. */
export const name = '@tockteam/tocktutor-workbench';
/** Required transport and route registry supplied by the pinned Desktop client graph. */
export const inject = ['remote', 'slots'];
/** Mount strict transport first, then contribute one lifecycle-owned Desktop route. */
export async function apply(ctx) {
    const disposeRemote = await ctx.remote.$mount(workbenchRemote);
    let disposeRoute;
    try {
        disposeRoute = ctx.slots.inject(TOCKTUTOR_ROUTE_SLOT, () => ctx.slots.register({
            children: {
                [TOCKTUTOR_ASSISTANT_PANEL_SLOT]: { kind: 'single', scope: 'root' },
                [TOCKTUTOR_REVIEW_PANEL_SLOT]: { kind: 'list', scope: 'root' },
            },
            inject: () => ({ remote: ctx.remote }),
            name: TOCKTUTOR_ROUTE_SLOT,
            registrant: name,
        }, TockTutorRoute));
    }
    catch (error) {
        await disposeRemote();
        throw error;
    }
    return async () => {
        disposeRoute?.();
        await disposeRemote();
    };
}
export * from "./assistant-panel.js";
export * from "./review-panel.js";
export * from "./route.js";
export * from "./types.js";
export * from "./vault-events.js";
//# sourceMappingURL=client-api.js.map