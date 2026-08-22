/** Host face for the TockTeam Web browser distribution. */

import {
  TOCKTEAM_SURFACE_SERVICE,
  type TockTeamSurface,
} from '../../plugins/shared/surface.ts'

interface SystemPromptService {
  section(entry: {
    name: string
    order: number
    text: () => string
  }): unknown
}

interface BashEnvService {
  register(entry: {
    name: string
    variables: Record<string, { description: string }>
    resolve: () => Record<string, string>
  }): unknown
}

interface HostServices {
  systemPrompt: SystemPromptService
  bashEnv: BashEnvService
}

interface HostContext {
  inject(names: string[], callback: (ctx: HostContext & HostServices) => void): void
  provide(name: string, value: unknown): void
}

/** Stable Cordis plugin name. */
export const name = 'tockteam-web'

/**
 * Service name for the TockTeam Web surface. The capability itself is the
 * shared `tockTeamSurface` contract (see plugins/shared/surface.ts). It is
 * deliberately NOT provided under the name `web`: the dsh-base layer already
 * provides the `web` search-provider registry (`@deepseek-ai/dsh-web`), and
 * shadowing it would break every row that injects it.
 */
export const WEB_SURFACE_SERVICE = TOCKTEAM_SURFACE_SERVICE

function environmentSurface(): TockTeamSurface {
  return Object.freeze({
    dataRoot: process.env.TOCKTEAM_WEB_DATA ?? '',
    kind: 'web',
    platform: process.platform,
    profile: process.env.TOCKTEAM_WEB_PROFILE ?? 'web',
    version: process.env.TOCKTEAM_WEB_VERSION ?? '0.0.0',
  })
}

function webPrompt(surface: TockTeamSurface): string {
  return `You are interacting with the user through TockTeam Web ${surface.version} on ${surface.platform}. `
    + "TockTeam Web is a browser distribution backed by TockTeam's DSH runtime. "
    + 'The web UI is served over HTTP and opened in a regular browser; workspaces, files, skills, subagents, and other agent capabilities are composed through DSH plugins. '
    + 'When the user says “this page” or “the web UI” without naming another target, they mean the TockTeam Web interface. '
    + "Identify this surface as TockTeam Web backed by TockTeam's DSH runtime."
}

/** Mount the web distribution capability in the DSH graph. */
export function apply(ctx: HostContext): void {
  const surface = environmentSurface()
  // The unified three-surface contract: web shell (see
  // plugins/shared/surface.ts).
  ctx.provide(TOCKTEAM_SURFACE_SERVICE, surface)

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'app:tockteam-web-surface',
      order: -98,
      text: () => webPrompt(surface),
    })
  })

  ctx.inject(['bashEnv'], (runtimeCtx) => {
    runtimeCtx.bashEnv.register({
      name: 'tockteam-web-runtime',
      variables: {
        TOCKTEAM_WEB: { description: 'Set to 1 inside the TockTeam Web distribution.' },
        TOCKTEAM_WEB_DATA: { description: 'Writable data root owned by TockTeam Web.' },
        TOCKTEAM_WEB_PROFILE: { description: 'DSH profile mounted by TockTeam Web.' },
        TOCKTEAM_WEB_VERSION: { description: 'Installed TockTeam Web version.' },
      },
      resolve: () => ({
        TOCKTEAM_WEB: '1',
        TOCKTEAM_WEB_DATA: surface.dataRoot,
        TOCKTEAM_WEB_PROFILE: surface.profile,
        TOCKTEAM_WEB_VERSION: surface.version,
      }),
    })
  })
}
