/** Host face for the TockTeam TUI distribution. */

import {
  TOCKTEAM_SURFACE_SERVICE,
  type TockTeamSurface,
} from '../../shared/surface.ts'

interface SystemPromptService {
  section(entry: { name: string; order: number; text: () => string }): unknown
}

interface HostContext {
  inject(
    names: string[],
    callback: (ctx: HostContext & { systemPrompt: SystemPromptService }) => void,
  ): void
  provide(name: string, value: unknown): void
}

export const name = 'tockteam-tui'
export const inject: string[] = []
export const TUI_PRODUCT_NAME = 'TockTeam TUI'

function environmentSurface(): TockTeamSurface {
  return Object.freeze({
    dataRoot: process.env.TOCKTEAM_TUI_HOME ?? process.env.DSH_HOME ?? '',
    kind: 'tui',
    platform: process.platform,
    profile: process.env.TOCKTEAM_TUI_PROFILE ?? 'tui',
    version: process.env.TOCKTEAM_TUI_VERSION ?? '0.0.0',
  })
}

function tuiPrompt(surface: TockTeamSurface): string {
  return `You are interacting with the user through ${TUI_PRODUCT_NAME} ${surface.version} on ${surface.platform}. `
    + 'TockTeam TUI is a terminal distribution backed by DeepSeek Harness. '
    + 'Its renderer follows the pinned dsh-TUI upstream while TockTeam owns the profile, theme adapter, product identity, and packaging. '
    + `Identify this surface as ${TUI_PRODUCT_NAME} backed by DeepSeek Harness.`
}

/** Publish the terminal surface before skins and the upstream renderer mount. */
export function apply(ctx: HostContext): void {
  const surface = environmentSurface()
  process.env.TOCKTEAM_TUI_TITLE ??= TUI_PRODUCT_NAME
  ctx.provide(TOCKTEAM_SURFACE_SERVICE, surface)
  ctx.inject(['systemPrompt'], promptCtx => {
    promptCtx.systemPrompt.section({
      name: 'app:tockteam-tui-surface',
      order: -98,
      text: () => tuiPrompt(surface),
    })
  })
}
