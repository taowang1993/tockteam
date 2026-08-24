export interface TockTeamSurfaceView {
  kind: 'desktop' | 'web' | 'tui'
}

export const TOCKTEAM_SURFACE_SERVICE = 'tockTeamSurface'

/** Refuse every profile except the surface explicitly reported by TockTeam. */
export function assertDesktopSurface(value: unknown): asserts value is TockTeamSurfaceView & { kind: 'desktop' } {
  if (typeof value !== 'object' || value === null
    || (value as { kind?: unknown }).kind !== 'desktop') {
    throw new Error('tockbot-note-desktop: TockTeam Desktop surface is required')
  }
}
