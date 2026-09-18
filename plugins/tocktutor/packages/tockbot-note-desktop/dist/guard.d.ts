export interface TockTeamSurfaceView {
    kind: 'desktop' | 'web' | 'tui';
}
export declare const TOCKTEAM_SURFACE_SERVICE = "tockTeamSurface";
/** Refuse every profile except the surface explicitly reported by TockTeam. */
export declare function assertDesktopSurface(value: unknown): asserts value is TockTeamSurfaceView & {
    kind: 'desktop';
};
//# sourceMappingURL=guard.d.ts.map