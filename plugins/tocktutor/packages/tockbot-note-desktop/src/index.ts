import type { Context } from '@deepseek-ai/cordis'
import {
  TOCKTEAM_DESKTOP_CALLER_SERVICE,
  TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
  TOCKTEAM_DESKTOP_PICKER_SERVICE,
  TOCKTEAM_DESKTOP_POPOUT_SERVICE,
  TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE,
  TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE,
} from '@tockteam/desktop/host'
import { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts'
import { TockTutorDesktopGateway } from './host-actions.ts'

export const name = 'tockbot-note-desktop'

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
] as const

export function apply(ctx: Context): void {
  assertDesktopSurface(ctx.get(TOCKTEAM_SURFACE_SERVICE))
  ctx.plugin(TockTutorDesktopGateway)
}

export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts'
export * from './host-actions.ts'
