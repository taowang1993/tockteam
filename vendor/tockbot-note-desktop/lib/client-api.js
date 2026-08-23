import { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
export const name = 'tockbot-note-desktop';
export const inject = [TOCKTEAM_SURFACE_SERVICE];
/** Browser-side composition guard; native methods remain owned by Desktop. */
export function apply(ctx) {
    assertDesktopSurface(ctx.get(TOCKTEAM_SURFACE_SERVICE));
}
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
//# sourceMappingURL=client-api.js.map