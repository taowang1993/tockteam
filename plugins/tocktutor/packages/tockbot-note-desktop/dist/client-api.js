import desktopRemote from 'tockbot-note-desktop/remote';
import { TockTutorNativeActions, } from "./client-actions.js";
import { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
export const name = 'tockbot-note-desktop';
const TOCKTUTOR_NATIVE_ACTIONS_SLOT = 'tockteam.tocktutor.workbench.native-actions';
export const inject = [TOCKTEAM_SURFACE_SERVICE, 'remote', 'slots'];
async function disposeClient(bridge, disposeRemote) {
    try {
        await bridge.cancelDispatch();
    }
    catch (error) {
        await disposeRemote();
        throw error;
    }
    await disposeRemote();
}
async function disposeMounted(slotFiber, bridge, disposeRemote) {
    let slotError;
    try {
        await slotFiber?.dispose();
    }
    catch (error) {
        slotError = error;
    }
    try {
        await disposeClient(bridge, disposeRemote);
    }
    catch (error) {
        if (slotError !== undefined) {
            throw new AggregateError([slotError, error], 'Desktop client cleanup failed.');
        }
        throw error;
    }
    if (slotError !== undefined)
        throw slotError;
}
function desktopBridge() {
    const bridge = window.dshDesktop?.tockTutor;
    if (bridge === undefined
        || typeof bridge.authorize !== 'function'
        || typeof bridge.cancelDispatch !== 'function'
        || typeof bridge.completeDispatch !== 'function'
        || typeof bridge.nextDispatch !== 'function')
        throw new Error('tockbot-note-desktop: trusted Desktop caller facade is unavailable');
    return bridge;
}
/** Mount the caller facade Remote and one root-scoped Workbench contribution. */
export async function apply(ctx) {
    assertDesktopSurface(ctx.get(TOCKTEAM_SURFACE_SERVICE));
    const bridge = desktopBridge();
    const disposeRemote = await ctx.remote.$mount(desktopRemote);
    let slotFiber;
    try {
        slotFiber = ctx.inject(['remote', 'remote.tocktutorDesktop', 'slots'], child => {
            const remote = {
                tocktutorDesktop: child.remote.tocktutorDesktop,
            };
            const slots = child.slots;
            return slots.inject(TOCKTUTOR_NATIVE_ACTIONS_SLOT, () => slots.register({
                id: name,
                inject: () => ({ bridge, remote }),
                name: TOCKTUTOR_NATIVE_ACTIONS_SLOT,
                registrant: name,
            }, TockTutorNativeActions));
        });
        await slotFiber;
    }
    catch (error) {
        try {
            await disposeMounted(slotFiber, bridge, disposeRemote);
        }
        catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Desktop client startup cleanup failed.');
        }
        throw error;
    }
    return async () => {
        await disposeMounted(slotFiber, bridge, disposeRemote);
    };
}
export * from "./client-actions.js";
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
//# sourceMappingURL=client-api.js.map