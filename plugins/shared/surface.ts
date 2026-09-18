/**
 * TockTeam surface contract: every packaged shell identifies the interaction
 * form it provides through one `tockTeamSurface` service. Built-in plugins read
 * this service and adapt explicitly per surface instead of guessing from
 * environment variables or window presence.
 *
 * - `desktop` — the Electron shell (`@tockteam/desktop`): native windows and
 *   menus, the Electron bridge, and the full local capability set.
 * - `web` — the browser shell (`@tockteam/web`): the DSH web UI served over
 *   HTTP. The browser client graph matches desktop wherever the host
 *   services exist (skins, pinned summary, sidebar, terminal dock); only
 *   Electron-bound surfaces (native chrome, the marketplace bridge) differ.
 * - `tui` — the future terminal shell (`@tockteam/tui`): no browser client
 *   graph, and host plugins that need `webServer` never activate.
 */

/** The three interaction forms a shell can provide. */
export type TockTeamSurfaceKind = 'desktop' | 'web' | 'tui'

/** Host-plane surface facts provided by the active shell bundle. */
export interface TockTeamSurface {
  dataRoot: string
  kind: TockTeamSurfaceKind
  platform: NodeJS.Platform
  profile: string
  version: string
}

/** Service name shells provide the surface under (host plane). */
export const TOCKTEAM_SURFACE_SERVICE = 'tockTeamSurface' as const

/** Browser-plane surface facts reflected by the active shell client. */
export interface TockTeamSurfaceView {
  kind: TockTeamSurfaceKind
}

/** Service name shell clients reflect the surface under (client plane). */
export const TOCKTEAM_SURFACE_VIEW_SERVICE = 'tockTeamSurface' as const

/** Whether a browser-visible surface exists for a host plugin to mount on. */
export function hasBrowserSurface(kind: TockTeamSurfaceKind | undefined): boolean {
  return kind === 'desktop' || kind === 'web'
}
