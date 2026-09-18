import { tockTeamSkin } from '../plugins/skins/src/skins.ts'
import type { SkinId } from '../plugins/skins/src/skin-ids.ts'

export type LauncherThemeMode = 'light' | 'dark'

const ORIGINAL_THEME_TOKENS = Object.freeze({
  light: Object.freeze({
    '--dsw-alias-bg-layer-1': '#FFFFFF',
    '--dsw-alias-bg-layer-2': 'rgb(0 0 0 / 0.04)',
    '--dsw-alias-bg-overlay': '#FFFFFF',
    '--dsw-alias-border-l1': '#D1D5DB',
    '--dsw-alias-border-l2': '#D1D5DB',
    '--dsw-alias-brand-primary': '#533AFD',
    '--dsw-alias-brand-text': '#533AFD',
    '--dsw-alias-interactive-bg-active': 'rgb(39 39 42 / 0.09)',
    '--dsw-alias-interactive-bg-hover': 'rgb(39 39 42 / 0.04)',
    '--dsw-alias-label-primary': '#27272A',
    '--dsw-alias-label-secondary': '#71717A',
    '--dsw-alias-state-error-primary': 'oklch(0.58 0.22 27)',
  }),
  dark: Object.freeze({
    '--dsw-alias-bg-layer-1': '#1B1B1B',
    '--dsw-alias-bg-layer-2': '#0E0E0E',
    '--dsw-alias-bg-overlay': '#1B1B1B',
    '--dsw-alias-border-l1': '#3A3A3A',
    '--dsw-alias-border-l2': '#3A3A3A',
    '--dsw-alias-brand-primary': '#533AFD',
    '--dsw-alias-brand-text': '#E0E0E0',
    '--dsw-alias-interactive-bg-active': 'rgb(224 224 224 / 0.09)',
    '--dsw-alias-interactive-bg-hover': 'rgb(224 224 224 / 0.04)',
    '--dsw-alias-label-primary': '#E0E0E0',
    '--dsw-alias-label-secondary': '#AAAAAA',
    '--dsw-alias-state-error-primary': 'oklch(0.704 0.191 22.216)',
  }),
} as const)

export function launcherOriginalThemeTokens(mode: LauncherThemeMode): Readonly<Record<string, string>> {
  return ORIGINAL_THEME_TOKENS[mode]
}

export type LauncherThemeSource = Readonly<{
  mode: LauncherThemeMode
  skinId: SkinId | null
}>

export type LauncherThemeProjection = Readonly<LauncherThemeSource & {
  revision: number
}>

type ThemeSnapshotLike = Readonly<{
  active: Readonly<{
    id: string
    colorScheme: string
    tokens?: Readonly<Record<string, string>>
  }>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMode(value: unknown): LauncherThemeMode {
  if (value !== 'light' && value !== 'dark') throw new Error('Invalid launcher theme mode')
  return value
}

function parseSkinId(value: unknown): SkinId | null {
  if (value === null) return null
  if (typeof value !== 'string' || tockTeamSkin(value) === undefined) {
    throw new Error('Invalid launcher theme skin')
  }
  return value as SkinId
}

export function parseLauncherThemeSource(value: unknown): LauncherThemeSource {
  if (!isRecord(value)
    || Object.keys(value).length !== 2
    || !Object.prototype.hasOwnProperty.call(value, 'mode')
    || !Object.prototype.hasOwnProperty.call(value, 'skinId')) {
    throw new Error('Invalid launcher theme source')
  }
  const mode = parseMode(value.mode)
  const skinId = parseSkinId(value.skinId)
  if (skinId !== null && tockTeamSkin(skinId)?.colorScheme !== mode) {
    throw new Error('Launcher theme skin color scheme does not match mode')
  }
  return Object.freeze({ mode, skinId })
}

export function parseLauncherThemeProjection(value: unknown): LauncherThemeProjection {
  if (!isRecord(value)
    || Object.keys(value).length !== 3
    || !Object.prototype.hasOwnProperty.call(value, 'mode')
    || !Object.prototype.hasOwnProperty.call(value, 'skinId')
    || !Object.prototype.hasOwnProperty.call(value, 'revision')) {
    throw new Error('Invalid launcher theme projection')
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw new Error('Invalid launcher theme revision')
  }
  const mode = parseMode(value.mode)
  const skinId = parseSkinId(value.skinId)
  if (skinId !== null && tockTeamSkin(skinId)?.colorScheme !== mode) {
    throw new Error('Launcher theme skin color scheme does not match mode')
  }
  return Object.freeze({ mode, skinId, revision: value.revision as number })
}

/** Reduce a DSH snapshot to the two facts the isolated launcher can consume. */
export function projectLauncherThemeSource(snapshot: ThemeSnapshotLike): LauncherThemeSource {
  const mode = parseMode(snapshot.active.colorScheme)
  const skin = tockTeamSkin(snapshot.active.id)
  return Object.freeze({
    mode,
    skinId: skin?.colorScheme === mode ? skin.id : null,
  })
}

export function createLauncherThemeProjector(initial: LauncherThemeProjection = Object.freeze({
  mode: 'light',
  skinId: null,
  revision: 0,
})): Readonly<{
  get: () => LauncherThemeProjection
  update: (source: unknown) => LauncherThemeProjection
}> {
  let current = parseLauncherThemeProjection(initial)
  return Object.freeze({
    get: () => current,
    update: (source: unknown): LauncherThemeProjection => {
      const next = parseLauncherThemeSource(source)
      const revision = current.revision >= Number.MAX_SAFE_INTEGER
        ? 0
        : current.revision + 1
      current = Object.freeze({ ...next, revision })
      return current
    },
  })
}
