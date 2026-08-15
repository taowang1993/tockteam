/** Host half of TockTeam skins: durable preferences on the surface origin. */

import {
  mountDesktopSkinPreferences,
  type DesktopCapability,
  type DesktopSkinPreferencesHostContext,
} from './preferences-server.ts'
import { mountTuiSkins } from './tui-adapter.ts'
import {
  hasBrowserSurface,
  TOCKTEAM_SURFACE_SERVICE,
  type TockTeamSurface,
} from '../../shared/surface.ts'

interface HostContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  inject(names: string[], callback: (ctx: HostContext) => void): void
  logger: DesktopSkinPreferencesHostContext['logger']
}

export const name = 'tockteam-skins'
export const inject: string[] = []

function mountSurface(ctx: HostContext): void {
  const surface = ctx.get(TOCKTEAM_SURFACE_SERVICE) as TockTeamSurface | undefined
  const legacy = ctx.get('desktop') as DesktopCapability | undefined
  const dataRoot = surface?.dataRoot ?? legacy?.appDataPath ?? ''
  if (dataRoot === '') {
    ctx.logger.warn('tockteam-skins: no writable data root; skin preferences disabled')
    return
  }

  if (surface?.kind === 'tui') {
    const tuiConfigRoot = process.env.TOCKTEAM_TUI_CONFIG_HOME
    ctx.effect(() => {
      mountTuiSkins(dataRoot, tuiConfigRoot)
    }, 'tockteam-skins: TUI palette adapter')
    return
  }

  if (!hasBrowserSurface(surface?.kind) && legacy === undefined) {
    ctx.logger.warn('tockteam-skins: unsupported surface; skin preferences disabled')
    return
  }
  ctx.inject(['webServer'], browserCtx => {
    const webServer = browserCtx.get('webServer') as
      DesktopSkinPreferencesHostContext['webServer'] | undefined
    if (webServer === undefined) {
      browserCtx.logger.warn('tockteam-skins: browser preferences server is unavailable')
      return
    }
    browserCtx.effect(
      () => mountDesktopSkinPreferences({ logger: browserCtx.logger, webServer }, {
        appDataPath: dataRoot,
      }),
      'tockteam-skins: skin preferences',
    )
  })
}

export function apply(ctx: HostContext): void {
  // Static injection would make the TUI wait forever for webServer. Listen
  // for the common surface first, then require browser services only for a
  // browser-capable surface.
  ctx.inject([TOCKTEAM_SURFACE_SERVICE], mountSurface)
}
