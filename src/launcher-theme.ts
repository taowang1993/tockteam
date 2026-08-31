import { tockTeamSkin } from '../plugins/skins/src/skins.ts'
import type { SkinId } from '../plugins/skins/src/skin-ids.ts'

export type LauncherThemeMode = 'light' | 'dark'

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
