import type { DesktopSkinsMessage } from './client/i18n.ts'
import { SKIN_ID, type SkinId } from './skin-ids.ts'

export type SkinColorScheme = 'light' | 'dark'

/** Semantic colors consumed by the pinned terminal renderer. */
export type TuiSkinColors = Readonly<Record<string, string>>

/** One surface-neutral TockTeam skin with browser and terminal adapters. */
export interface SkinPalette {
  tokens: Readonly<Record<string, string>>
  tui: TuiSkinColors
  preview: string
  accent: string
}

export interface TockTeamSkin {
  id: SkinId
  palettes: Readonly<Record<SkinColorScheme, SkinPalette>>
  displayName: string
  label: DesktopSkinsMessage
  css?: string
}

/** Feed paired semantic values to DSH's own Appearance-aware token layer. */
export function pairedSkinTokens(skin: TockTeamSkin): Record<string, { light: string; dark: string }> {
  return Object.fromEntries(Object.keys(skin.palettes.dark.tokens).map(token => [token, {
    light: skin.palettes.light.tokens[token]!,
    dark: skin.palettes.dark.tokens[token]!,
  }]))
}

/** Compatibility name retained for the browser controller API. */
export type DesktopSkin = TockTeamSkin

function tuiColors(
  tokens: Readonly<Record<string, string>>,
  merged: string,
): TuiSkinColors {
  const value = (key: string): string => {
    const color = tokens[key]
    if (color === undefined || !color.startsWith('#')) {
      throw new Error(`skin token ${key} must be an opaque terminal color`)
    }
    return color
  }
  return Object.freeze({
    autoAccept: merged,
    bashBorder: value('--dsw-alias-brand-primary'),
    claude: value('--dsw-alias-brand-primary'),
    claudeShimmer: value('--dsw-alias-button-primary-hover'),
    claudeBlue_FOR_SYSTEM_SPINNER: value('--dsw-alias-brand-primary'),
    claudeBlueShimmer_FOR_SYSTEM_SPINNER: value('--dsw-alias-button-primary-hover'),
    permission: value('--dsw-alias-brand-primary'),
    permissionShimmer: value('--dsw-alias-button-primary-hover'),
    planMode: value('--dsw-alias-state-success-primary'),
    ide: value('--dsw-alias-brand-primary'),
    promptBorder: value('--dsw-alias-scrollbar-bg-l1'),
    promptBorderShimmer: value('--dsw-alias-brand-primary'),
    text: value('--dsw-alias-label-primary'),
    inverseText: value('--dsw-alias-brand-primary-invert'),
    inactive: value('--dsw-alias-label-tertiary'),
    inactiveShimmer: value('--dsw-alias-label-secondary'),
    subtle: value('--dsw-alias-label-tertiary'),
    suggestion: value('--dsw-alias-brand-primary'),
    remember: value('--dsw-alias-brand-text'),
    background: value('--dsw-alias-brand-primary'),
    success: value('--dsw-alias-state-success-primary'),
    error: value('--dsw-alias-state-error-primary'),
    warning: value('--dsw-alias-state-warn-primary'),
    merged,
    warningShimmer: value('--dsw-alias-state-warn-primary'),
    professionalBlue: value('--dsw-alias-brand-primary'),
    userMessageBackground: value('--dsw-specific-bubble'),
    userMessageBackgroundHover: value('--dsw-alias-bg-layer-3'),
    messageActionsBackground: value('--dsw-specific-menu'),
    selectionBg: value('--dsw-alias-scrollbar-bg-l1'),
    bashMessageBackgroundColor: value('--dsw-specific-input-major'),
    memoryBackgroundColor: value('--dsw-alias-bg-layer-2'),
    rate_limit_fill: value('--dsw-alias-brand-primary'),
    rate_limit_empty: value('--dsw-alias-bg-layer-3'),
    fastMode: value('--dsw-alias-state-warn-primary'),
    fastModeShimmer: value('--dsw-alias-button-primary-hover'),
    briefLabelYou: value('--dsw-alias-brand-text'),
    briefLabelClaude: value('--dsw-alias-brand-primary'),
  })
}

const DEEP_CURRENT_TOKENS = {
  '--dsw-alias-bg-base': '#071923',
  '--dsw-alias-bg-layer-1': '#0b2230',
  '--dsw-alias-bg-layer-2': '#0f2a39',
  '--dsw-alias-bg-layer-3': '#143445',
  '--dsw-alias-bg-overlay': '#193e50',
  '--dsw-alias-bg-module-platform': '#0f2a39',
  '--dsw-alias-border-l1': 'rgba(143, 214, 235, 0.08)',
  '--dsw-alias-border-l2': 'rgba(143, 214, 235, 0.14)',
  '--dsw-alias-border-l3': 'rgba(143, 214, 235, 0.22)',
  '--dsw-alias-brand-primary': '#49c8eb',
  '--dsw-alias-brand-primary-invert': '#06151d',
  '--dsw-alias-brand-text': '#bcecf8',
  '--dsw-alias-button-primary-fill': '#49c8eb',
  '--dsw-alias-button-primary-hover': '#6dd7f2',
  '--dsw-alias-interactive-bg-active': 'rgba(109, 215, 242, 0.16)',
  '--dsw-alias-interactive-bg-hover': 'rgba(109, 215, 242, 0.09)',
  '--dsw-alias-label-primary': '#e9f8fb',
  '--dsw-alias-label-secondary': '#b9dbe4',
  '--dsw-alias-label-tertiary': '#78a8b5',
  '--dsw-alias-markdown-code-block': '#06151e',
  '--dsw-alias-markdown-inline-code': '#123143',
  '--dsw-alias-scrollbar-bg-l1': '#214b5c',
  '--dsw-alias-scrollbar-hover-l1': '#49c8eb',
  '--dsw-alias-state-error-primary': '#ff7185',
  '--dsw-alias-state-success-primary': '#63d5ad',
  '--dsw-alias-state-warn-primary': '#f4c56a',
  '--dsw-specific-bubble': '#123143',
  '--dsw-specific-input-major': '#0a202c',
  '--dsw-specific-menu': '#103041',
  '--dsw-specific-sidebar-fill': '#0b2230',
  '--dsw-specific-sidebar-nav-item-active': '#123143',
  '--dsw-specific-sidebar-nav-item-hover': '#0d2938',
} as const

const DEEP_CURRENT_LIGHT_TOKENS = {
  '--dsw-alias-bg-base': '#eaf4f7',
  '--dsw-alias-bg-layer-1': '#f5fafb',
  '--dsw-alias-bg-layer-2': '#dcebf0',
  '--dsw-alias-bg-layer-3': '#cee4eb',
  '--dsw-alias-bg-overlay': '#ffffff',
  '--dsw-alias-bg-module-platform': '#dcebf0',
  '--dsw-alias-border-l1': 'rgba(21, 80, 99, 0.12)',
  '--dsw-alias-border-l2': 'rgba(21, 80, 99, 0.20)',
  '--dsw-alias-border-l3': 'rgba(21, 80, 99, 0.32)',
  '--dsw-alias-brand-primary': '#17667d',
  '--dsw-alias-brand-primary-invert': '#ffffff',
  '--dsw-alias-brand-text': '#145a70',
  '--dsw-alias-button-primary-fill': '#17667d',
  '--dsw-alias-button-primary-hover': '#10536b',
  '--dsw-alias-interactive-bg-active': 'rgba(23, 102, 125, 0.16)',
  '--dsw-alias-interactive-bg-hover': 'rgba(23, 102, 125, 0.09)',
  '--dsw-alias-label-primary': '#17313a',
  '--dsw-alias-label-secondary': '#395c67',
  '--dsw-alias-label-tertiary': '#4c707b',
  '--dsw-alias-markdown-code-block': '#dcebf0',
  '--dsw-alias-markdown-inline-code': '#d3e6ed',
  '--dsw-alias-scrollbar-bg-l1': '#b5d4df',
  '--dsw-alias-scrollbar-hover-l1': '#17667d',
  '--dsw-alias-state-error-primary': '#b34154',
  '--dsw-alias-state-success-primary': '#22765b',
  '--dsw-alias-state-warn-primary': '#8e6115',
  '--dsw-specific-bubble': '#dcebf0',
  '--dsw-specific-input-major': '#fcfefe',
  '--dsw-specific-menu': '#f5fafb',
  '--dsw-specific-sidebar-fill': '#f5fafb',
  '--dsw-specific-sidebar-nav-item-active': '#d3e6ed',
  '--dsw-specific-sidebar-nav-item-hover': '#e2eff3',
} as const

const JADE_CIRCUIT_TOKENS = {
  '--dsw-alias-bg-base': '#071a16',
  '--dsw-alias-bg-layer-1': '#0b241e',
  '--dsw-alias-bg-layer-2': '#102e26',
  '--dsw-alias-bg-layer-3': '#15392f',
  '--dsw-alias-bg-overlay': '#1b493b',
  '--dsw-alias-bg-module-platform': '#102e26',
  '--dsw-alias-border-l1': 'rgba(124, 236, 187, 0.08)',
  '--dsw-alias-border-l2': 'rgba(124, 236, 187, 0.14)',
  '--dsw-alias-border-l3': 'rgba(124, 236, 187, 0.22)',
  '--dsw-alias-brand-primary': '#52d6a0',
  '--dsw-alias-brand-primary-invert': '#071a16',
  '--dsw-alias-brand-text': '#bbf3d8',
  '--dsw-alias-button-primary-fill': '#52d6a0',
  '--dsw-alias-button-primary-hover': '#72e5b4',
  '--dsw-alias-interactive-bg-active': 'rgba(114, 229, 180, 0.16)',
  '--dsw-alias-interactive-bg-hover': 'rgba(114, 229, 180, 0.08)',
  '--dsw-alias-label-primary': '#e9fbf3',
  '--dsw-alias-label-secondary': '#b9ddce',
  '--dsw-alias-label-tertiary': '#78a795',
  '--dsw-alias-markdown-code-block': '#061510',
  '--dsw-alias-markdown-inline-code': '#14372d',
  '--dsw-alias-scrollbar-bg-l1': '#205240',
  '--dsw-alias-scrollbar-hover-l1': '#52d6a0',
  '--dsw-alias-state-error-primary': '#ff7185',
  '--dsw-alias-state-success-primary': '#52d6a0',
  '--dsw-alias-state-warn-primary': '#f3c966',
  '--dsw-specific-bubble': '#14372d',
  '--dsw-specific-input-major': '#0a211b',
  '--dsw-specific-menu': '#123329',
  '--dsw-specific-sidebar-fill': '#0b241e',
  '--dsw-specific-sidebar-nav-item-active': '#14372d',
  '--dsw-specific-sidebar-nav-item-hover': '#0e2b23',
} as const

const JADE_CIRCUIT_LIGHT_TOKENS = {
  '--dsw-alias-bg-base': '#eaf4eb',
  '--dsw-alias-bg-layer-1': '#f6faf5',
  '--dsw-alias-bg-layer-2': '#dbecde',
  '--dsw-alias-bg-layer-3': '#cce3d2',
  '--dsw-alias-bg-overlay': '#fcfffb',
  '--dsw-alias-bg-module-platform': '#dbecde',
  '--dsw-alias-border-l1': 'rgba(28, 89, 57, 0.12)',
  '--dsw-alias-border-l2': 'rgba(28, 89, 57, 0.20)',
  '--dsw-alias-border-l3': 'rgba(28, 89, 57, 0.32)',
  '--dsw-alias-brand-primary': '#246c4a',
  '--dsw-alias-brand-primary-invert': '#ffffff',
  '--dsw-alias-brand-text': '#205d41',
  '--dsw-alias-button-primary-fill': '#246c4a',
  '--dsw-alias-button-primary-hover': '#1c573b',
  '--dsw-alias-interactive-bg-active': 'rgba(36, 108, 74, 0.16)',
  '--dsw-alias-interactive-bg-hover': 'rgba(36, 108, 74, 0.09)',
  '--dsw-alias-label-primary': '#1b3529',
  '--dsw-alias-label-secondary': '#395c48',
  '--dsw-alias-label-tertiary': '#4b7058',
  '--dsw-alias-markdown-code-block': '#dbecde',
  '--dsw-alias-markdown-inline-code': '#d0e6d5',
  '--dsw-alias-scrollbar-bg-l1': '#b5d7be',
  '--dsw-alias-scrollbar-hover-l1': '#246c4a',
  '--dsw-alias-state-error-primary': '#b34154',
  '--dsw-alias-state-success-primary': '#246c4a',
  '--dsw-alias-state-warn-primary': '#8a6019',
  '--dsw-specific-bubble': '#dbecde',
  '--dsw-specific-input-major': '#fcfffb',
  '--dsw-specific-menu': '#f6faf5',
  '--dsw-specific-sidebar-fill': '#f6faf5',
  '--dsw-specific-sidebar-nav-item-active': '#d0e6d5',
  '--dsw-specific-sidebar-nav-item-hover': '#e1efe3',
} as const

// Source: dsh-dream-skin Ember. Opaque layered fills keep TockTeam and TUI legible.
const EMBER_TOKENS = {
  '--dsw-alias-bg-base': '#16110d',
  '--dsw-alias-bg-layer-1': '#211a15',
  '--dsw-alias-bg-layer-2': '#241c14',
  '--dsw-alias-bg-layer-3': '#231b15',
  '--dsw-alias-bg-overlay': '#2b2119',
  '--dsw-alias-bg-module-platform': '#1b1712',
  '--dsw-alias-border-l1': 'rgba(253, 186, 116, 0.10)',
  '--dsw-alias-border-l2': 'rgba(253, 186, 116, 0.18)',
  '--dsw-alias-border-l3': 'rgba(253, 186, 116, 0.26)',
  '--dsw-alias-brand-primary': '#f59e5b',
  '--dsw-alias-brand-primary-invert': '#1f0f06',
  '--dsw-alias-brand-text': '#f7c9a2',
  '--dsw-alias-button-primary-fill': '#f59e5b',
  '--dsw-alias-button-primary-hover': '#f8b06f',
  '--dsw-alias-interactive-bg-active': 'rgba(245, 158, 91, 0.22)',
  '--dsw-alias-interactive-bg-hover': 'rgba(245, 158, 91, 0.14)',
  '--dsw-alias-label-primary': '#fdf0e6',
  '--dsw-alias-label-secondary': '#d0a98a',
  '--dsw-alias-label-tertiary': '#a48266',
  '--dsw-alias-markdown-code-block': '#1b1712',
  '--dsw-alias-markdown-inline-code': '#30241a',
  '--dsw-alias-scrollbar-bg-l1': '#503a28',
  '--dsw-alias-scrollbar-hover-l1': '#f59e5b',
  '--dsw-alias-state-error-primary': '#ff7782',
  '--dsw-alias-state-success-primary': '#8bd0a1',
  '--dsw-alias-state-warn-primary': '#f6c574',
  '--dsw-specific-bubble': '#30261c',
  '--dsw-specific-input-major': '#2b2119',
  '--dsw-specific-menu': '#291f17',
  '--dsw-specific-sidebar-fill': '#211a15',
  '--dsw-specific-sidebar-nav-item-active': '#392819',
  '--dsw-specific-sidebar-nav-item-hover': '#2b2119',
} as const

// The source Ember is dark-only; pair it with a warm Light palette for Appearance.
const EMBER_LIGHT_TOKENS = {
  '--dsw-alias-bg-base': '#f8f2e9',
  '--dsw-alias-bg-layer-1': '#fffaf4',
  '--dsw-alias-bg-layer-2': '#efe3d2',
  '--dsw-alias-bg-layer-3': '#e7d4bf',
  '--dsw-alias-bg-overlay': '#fffdf8',
  '--dsw-alias-bg-module-platform': '#efe3d2',
  '--dsw-alias-border-l1': 'rgba(116, 73, 35, 0.12)',
  '--dsw-alias-border-l2': 'rgba(116, 73, 35, 0.20)',
  '--dsw-alias-border-l3': 'rgba(116, 73, 35, 0.32)',
  '--dsw-alias-brand-primary': '#96511c',
  '--dsw-alias-brand-primary-invert': '#fffdf8',
  '--dsw-alias-brand-text': '#854219',
  '--dsw-alias-button-primary-fill': '#96511c',
  '--dsw-alias-button-primary-hover': '#7e4318',
  '--dsw-alias-interactive-bg-active': 'rgba(150, 81, 28, 0.16)',
  '--dsw-alias-interactive-bg-hover': 'rgba(150, 81, 28, 0.09)',
  '--dsw-alias-label-primary': '#3b2a1b',
  '--dsw-alias-label-secondary': '#614a33',
  '--dsw-alias-label-tertiary': '#70543a',
  '--dsw-alias-markdown-code-block': '#efe3d2',
  '--dsw-alias-markdown-inline-code': '#e7d4bf',
  '--dsw-alias-scrollbar-bg-l1': '#d5bda1',
  '--dsw-alias-scrollbar-hover-l1': '#96511c',
  '--dsw-alias-state-error-primary': '#ac3c42',
  '--dsw-alias-state-success-primary': '#30704e',
  '--dsw-alias-state-warn-primary': '#835515',
  '--dsw-specific-bubble': '#efe3d2',
  '--dsw-specific-input-major': '#fffdf8',
  '--dsw-specific-menu': '#fffaf4',
  '--dsw-specific-sidebar-fill': '#fffaf4',
  '--dsw-specific-sidebar-nav-item-active': '#ead5bb',
  '--dsw-specific-sidebar-nav-item-hover': '#f3e5d4',
} as const

function palette(tokens: Readonly<Record<string, string>>, merged: string, preview: string): SkinPalette {
  return Object.freeze({
    tokens,
    tui: tuiColors(tokens, merged),
    preview,
    accent: tokens['--dsw-alias-brand-primary']!,
  })
}

export const TOCKTEAM_SKINS: readonly TockTeamSkin[] = Object.freeze([
  Object.freeze({
    id: SKIN_ID.deepCurrent,
    displayName: 'Navy',
    label: 'skins.name.deep-current',
    palettes: Object.freeze({
      dark: palette(DEEP_CURRENT_TOKENS, '#b995f5', 'linear-gradient(135deg, #071923 0%, #143445 64%, #49c8eb 145%)'),
      light: palette(DEEP_CURRENT_LIGHT_TOKENS, '#765fa4', 'linear-gradient(135deg, #eaf4f7 0%, #cee4eb 64%, #17667d 160%)'),
    }),
  }),
  Object.freeze({
    id: SKIN_ID.jadeCircuit,
    displayName: 'Jade',
    label: 'skins.name.jade-circuit',
    palettes: Object.freeze({
      dark: palette(JADE_CIRCUIT_TOKENS, '#a78bfa', 'linear-gradient(145deg, #071a16 0 42%, #154435 43% 62%, #52d6a0 150%)'),
      light: palette(JADE_CIRCUIT_LIGHT_TOKENS, '#765fa4', 'linear-gradient(145deg, #eaf4eb 0 42%, #cce3d2 43% 62%, #246c4a 160%)'),
    }),
  }),
  Object.freeze({
    id: SKIN_ID.emberDusk,
    displayName: 'Ember',
    label: 'skins.name.ember-dusk',
    palettes: Object.freeze({
      dark: palette(EMBER_TOKENS, '#f3a866', 'radial-gradient(circle at 78% 24%, #f59e5b 0%, transparent 38%), linear-gradient(145deg, #16110d 0%, #211a15 100%)'),
      light: palette(EMBER_LIGHT_TOKENS, '#9b6236', 'radial-gradient(circle at 78% 24%, #e6b078 0%, transparent 38%), linear-gradient(145deg, #f8f2e9 0%, #e7d4bf 100%)'),
    }),
  }),
])

/** Compatibility alias used by the browser-facing controller. */
export const DESKTOP_SKINS = TOCKTEAM_SKINS

export function tockTeamSkin(id: string): TockTeamSkin | undefined {
  return TOCKTEAM_SKINS.find(skin => skin.id === id)
}

export function desktopSkin(id: string): DesktopSkin | undefined {
  return tockTeamSkin(id)
}
