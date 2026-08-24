import { TOCKTEAM_DESKTOP_CALLER_SERVICE, TOCKTEAM_DESKTOP_MICROPHONE_SERVICE, TOCKTEAM_DESKTOP_PICKER_SERVICE, TOCKTEAM_DESKTOP_POPOUT_SERVICE, TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE, TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE, } from '@tockteam/desktop/host';
import { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
import { TockTutorDesktopGateway } from "./host-actions.js";
export const name = 'tockbot-note-desktop';
/**
 * Desktop owns native authority and caller proof; Runtime owns vault authority.
 * This row contributes only their caller-bound TockTutor gateway.
 */
export const inject = [
    TOCKTEAM_SURFACE_SERVICE,
    TOCKTEAM_DESKTOP_CALLER_SERVICE,
    TOCKTEAM_DESKTOP_PICKER_SERVICE,
    TOCKTEAM_DESKTOP_POPOUT_SERVICE,
    TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
    TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE,
    TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE,
    'tockTeamDesktopReveal',
    'noteVault',
];
export function apply(ctx) {
    assertDesktopSurface(ctx.get(TOCKTEAM_SURFACE_SERVICE));
    ctx.plugin(TockTutorDesktopGateway);
}
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from "./guard.js";
export * from "./host-actions.js";
//# sourceMappingURL=index.js.map