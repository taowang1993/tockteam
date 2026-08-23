import { TOCKTEAM_DESKTOP_DISPATCH_SERVICE, TOCKTEAM_DESKTOP_MICROPHONE_SERVICE, TOCKTEAM_DESKTOP_PICKER_SERVICE, TOCKTEAM_DESKTOP_POPOUT_SERVICE, TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE, TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE, } from '@tockteam/desktop/host';
import { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
export const name = 'tockbot-note-desktop';
/**
 * Every native owner is supplied by Desktop 0.1.6 and Runtime 0.1.2. This row
 * deliberately contributes no second bridge or authority; it only makes the
 * complete Desktop dependency set atomic and fail-closed.
 */
export const inject = [
    TOCKTEAM_SURFACE_SERVICE,
    TOCKTEAM_DESKTOP_PICKER_SERVICE,
    TOCKTEAM_DESKTOP_DISPATCH_SERVICE,
    TOCKTEAM_DESKTOP_POPOUT_SERVICE,
    TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
    TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE,
    TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE,
    'tockTeamDesktopReveal',
    'noteVault',
];
export function apply(ctx) {
    assertDesktopSurface(ctx.get(TOCKTEAM_SURFACE_SERVICE));
}
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
//# sourceMappingURL=index.js.map