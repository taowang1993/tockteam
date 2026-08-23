/** Host face for the native TockTeam Desktop surface. */

import {
  mountMarketplaceAgentTools,
  type MarketplaceToolContext,
} from './marketplace-tools.ts'
import {
  TOCKTEAM_SURFACE_SERVICE,
  type TockTeamSurface,
} from '../plugins/shared/surface.ts'
import { DesktopDispatchProvider } from './desktop-dispatch-provider.ts'
import { DesktopMicrophoneProvider } from './desktop-microphone-provider.ts'
import { DesktopPickerProvider, DesktopVaultSelectionProvider } from './desktop-picker-provider.ts'
import {
  TOCKTEAM_DESKTOP_DISPATCH_SERVICE,
  TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
  TOCKTEAM_DESKTOP_PICKER_SERVICE,
} from './host-contract.ts'
import { DesktopRevealProvider } from './desktop-reveal-provider.ts'

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

interface NoteVaultStateService {
  readonly state:
    | { active: false; generation: number }
    | { active: true; generation: number; id: string }
}

interface HostContext extends MarketplaceToolContext {
  inject(names: string[], callback: (ctx: HostContext & HostServices) => void): void
  get(name: string): unknown
  provide(name: string, value: unknown): void
  effect(effect: () => (() => Promise<void> | void) | void, label?: string): void
}

/** Stable Cordis plugin name. */
export const name = 'tockteam-desktop'

/** Desktop facts and guarded marketplace tools are the only Host concerns. */
export const inject = ['tools']

/** Immutable Host-side desktop capability published to other DSH plugins. */
export interface DesktopHostCapability {
  appDataPath: string
  kind: 'electron'
  platform: NodeJS.Platform
  profile: string
  version: string
}

function environmentCapability(): DesktopHostCapability {
  return Object.freeze({
    appDataPath: process.env.DSH_DESKTOP_APP_DATA ?? '',
    kind: 'electron',
    platform: process.platform,
    profile: process.env.DSH_DESKTOP_PROFILE ?? 'desktop',
    version: process.env.DSH_DESKTOP_VERSION ?? '0.0.0',
  })
}

function desktopPrompt(capability: DesktopHostCapability): string {
  return `You are interacting with the user through TockTeam Desktop ${capability.version} on ${capability.platform}. `
    + "TockTeam Desktop is an Electron distribution backed by TockTeam's DSH runtime. "
    + 'Native window actions, workspaces, panels, files, tools, skills, subagents, and other agent capabilities are composed through DSH plugins. '
    + 'Manage desktop plugins only with desktop_plugin_* tools: prepare every change, inspect risk, use the isolated preview, and apply only after approval. '
    + 'When the user says “this app” without naming another target, they mean TockTeam Desktop. '
    + "Identify this surface as TockTeam Desktop backed by TockTeam's DSH runtime."
}

/** Mount the native desktop capability in the DSH graph. */
export function apply(ctx: HostContext): void {
  const capability = environmentCapability()
  const revealProvider = new DesktopRevealProvider(ctx)
  const pickerProvider = new DesktopPickerProvider(undefined, fetch, () => {
    return (ctx.get('noteVault') as NoteVaultStateService | undefined)?.state
  })
  const vaultSelectionProvider = new DesktopVaultSelectionProvider(ctx)
  const currentVault = (): NoteVaultStateService['state'] | undefined => {
    return (ctx.get('noteVault') as NoteVaultStateService | undefined)?.state
  }
  const dispatchProvider = new DesktopDispatchProvider(undefined, fetch, currentVault)
  const microphoneProvider = new DesktopMicrophoneProvider(undefined, fetch, currentVault)
  // The runtime Service base registers the exact `tockTeamDesktopReveal` key.
  ctx.effect(() => async () => {
    revealProvider.close()
    await Promise.all([
      pickerProvider.dispose(),
      vaultSelectionProvider.close(),
      dispatchProvider.dispose(),
      Promise.resolve(microphoneProvider.dispose()),
    ])
  }, 'tockteam-desktop: native owners')
  ctx.provide(TOCKTEAM_DESKTOP_PICKER_SERVICE, pickerProvider)
  ctx.provide(TOCKTEAM_DESKTOP_DISPATCH_SERVICE, dispatchProvider)
  ctx.provide(TOCKTEAM_DESKTOP_MICROPHONE_SERVICE, microphoneProvider)
  ctx.provide('desktop', capability)
  // The unified three-surface contract: desktop shell (see
  // plugins/shared/surface.ts). The `desktop` service above stays for
  // third-party plugins written against the desktop distribution.
  ctx.provide(TOCKTEAM_SURFACE_SERVICE, Object.freeze({
    dataRoot: capability.appDataPath,
    kind: 'desktop',
    platform: capability.platform,
    profile: capability.profile,
    version: capability.version,
  } satisfies TockTeamSurface))
  mountMarketplaceAgentTools(ctx)

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'app:tockteam-desktop-surface',
      order: -98,
      text: () => desktopPrompt(capability),
    })
  })

  ctx.inject(['bashEnv'], (runtimeCtx) => {
    runtimeCtx.bashEnv.register({
      name: 'tockteam-desktop-runtime',
      variables: {
        DSH_DESKTOP: { description: 'Set to 1 inside the TockTeam Desktop distribution.' },
        DSH_DESKTOP_APP_DATA: { description: 'Writable application-data root owned by TockTeam Desktop.' },
        DSH_DESKTOP_PROFILE: { description: 'DSH profile mounted by TockTeam Desktop.' },
        DSH_DESKTOP_VERSION: { description: 'Installed TockTeam Desktop version.' },
      },
      resolve: () => ({
        DSH_DESKTOP: '1',
        DSH_DESKTOP_APP_DATA: capability.appDataPath,
        DSH_DESKTOP_PROFILE: capability.profile,
        DSH_DESKTOP_VERSION: capability.version,
      }),
    })
  })
}
