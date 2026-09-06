export const TOCKTEAM_SURFACE_SERVICE = 'tockTeamSurface';
/** Refuse every profile except the surface explicitly reported by TockTeam. */
export function assertDesktopSurface(value) {
    if (typeof value !== 'object' || value === null
        || value.kind !== 'desktop') {
        throw new Error('tockbot-note-desktop: a Desktop surface is required by TockTeam');
    }
}
//# sourceMappingURL=guard.js.map