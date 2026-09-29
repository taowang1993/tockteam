/** TUI adapter for the shared TockTeam skin catalog. */

import { createHash } from 'node:crypto'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  DEFAULT_SKIN_PREFERENCES,
  parseSkinPreferences,
  type FallbackTheme,
  type SkinPreferences,
} from './preferences.ts'
import { LEGACY_PORCELAIN_ID, type SkinId } from './skin-ids.ts'
import { TOCKTEAM_SKINS, type SkinColorScheme } from './skins.ts'

const BUILTIN_TUI_THEMES = new Set(['light', 'dark', 'dark-ansi'])
// Exact bytes of the old first-party generated file; customized files are never removed.
const GENERATED_PORCELAIN_SHA256 = '1cf00c8e2acc565d8820187c6ee8f14ac6e28b79862602d7a1319c7c2322972c'
export interface TuiSkinPaths {
  preferences: string
  themePreference: string
  themes: string
}

export interface TuiSkinActivation {
  activeId: SkinId | null
  theme: string | undefined
}

/** Resolve the two stores joined by the TUI adapter. */
export function tuiSkinPaths(
  dataRoot: string,
  tuiConfigRoot: string = join(homedir(), '.tockteam', 'tui'),
): TuiSkinPaths {
  return Object.freeze({
    preferences: join(dataRoot, 'skins.json'),
    themePreference: join(tuiConfigRoot, 'theme.json'),
    themes: join(tuiConfigRoot, 'themes'),
  })
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.next-${String(process.pid)}`
  writeFileSync(temporary, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
  try {
    renameSync(temporary, path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EEXIST' && code !== 'EPERM') {
      rmSync(temporary, { force: true })
      throw error
    }
    copyFileSync(temporary, path)
    rmSync(temporary, { force: true })
  }
}

function readThemePreference(path: string): string | undefined {
  const value = readJson(path)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const theme = (value as Record<string, unknown>).theme
  if (typeof theme !== 'string' || theme.length === 0) return undefined
  if (theme === '.' || theme === '..' || theme.includes('/') || theme.includes('\\')) return undefined
  return theme
}

function readPreferences(path: string): SkinPreferences {
  return parseSkinPreferences(readJson(path)) ?? DEFAULT_SKIN_PREFERENCES
}

function fallbackFor(theme: string, current: FallbackTheme): FallbackTheme {
  if (theme === 'light') return 'light'
  if (theme === 'dark' || theme === 'dark-ansi') return 'dark'
  return current
}

function samePreferences(left: SkinPreferences, right: SkinPreferences): boolean {
  return left.activeId === right.activeId
    && left.fallbackTheme === right.fallbackTheme
    && left.version === right.version
    && left.originalModePending === right.originalModePending
    && left.porcelainMigrationPending === right.porcelainMigrationPending
}

function nativeThemeId(id: SkinId, mode: SkinColorScheme): string {
  return mode === 'dark' ? id : `${id}-light`
}

function pathExists(path: string): boolean {
  try { lstatSync(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function retireGeneratedPorcelain(directory: string): void {
  const path = join(directory, `${LEGACY_PORCELAIN_ID}.json`)
  if (!pathExists(path)) return
  const before = lstatSync(path)
  if (!before.isFile()) return
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (digest !== GENERATED_PORCELAIN_SHA256) return
  const after = lstatSync(path)
  if (after.ino === before.ino && after.mtimeMs === before.mtimeMs && after.size === before.size) {
    unlinkSync(path)
  }
}

function installThemeFiles(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  retireGeneratedPorcelain(directory)
  for (const skin of TOCKTEAM_SKINS) {
    for (const mode of ['dark', 'light'] as const) {
      const id = nativeThemeId(skin.id, mode)
      const path = join(directory, `${id}.json`)
      const theme = {
        name: id,
        displayName: `TockTeam · ${skin.displayName} · ${mode === 'dark' ? 'Dark' : 'Light'}`,
        base: mode,
        colors: skin.palettes[mode].tui,
      }
      if (!pathExists(path)) writeJsonAtomic(path, theme)
    }
  }
}

/**
 * Join shared skin preferences to dsh-TUI's native `/theme` contract.
 * An existing native choice wins; without it, the shared family seeds the picker.
 */
export function mountTuiSkins(dataRoot: string, tuiConfigRoot?: string): TuiSkinActivation {
  const paths = tuiSkinPaths(dataRoot, tuiConfigRoot)
  installThemeFiles(paths.themes)

  const preferences = readPreferences(paths.preferences)
  const theme = readThemePreference(paths.themePreference)
  if (theme === LEGACY_PORCELAIN_ID || (theme === undefined && preferences.activeId === LEGACY_PORCELAIN_ID)) {
    const next: SkinPreferences = Object.freeze({ activeId: null, fallbackTheme: 'light', version: 2, porcelainMigrationPending: true })
    if (!samePreferences(preferences, next)) writeJsonAtomic(paths.preferences, next)
    writeJsonAtomic(paths.themePreference, { theme: 'light' })
    return Object.freeze({ activeId: null, theme: 'light' })
  }
  if (theme !== undefined) {
    const skin = TOCKTEAM_SKINS.find(entry => theme === entry.id || theme === nativeThemeId(entry.id, 'light'))
    const next: SkinPreferences = skin === undefined
      ? Object.freeze({
          ...preferences,
          activeId: null,
          fallbackTheme: fallbackFor(theme, preferences.fallbackTheme),
          originalModePending: undefined,
          porcelainMigrationPending: theme === 'light' && preferences.porcelainMigrationPending === true
            ? true
            : undefined,
        })
      : theme === skin.id && (preferences.version !== 2
        || (preferences.originalModePending === true && preferences.activeId === skin.id))
        // A matching native Dark choice is not a new picker action: preserve legacy
        // migration and Desktop's still-pending Original preference.
        ? Object.freeze({ ...preferences, activeId: skin.id })
        : Object.freeze({
            ...preferences,
            activeId: skin.id,
            fallbackTheme: theme === skin.id ? 'dark' : 'light',
            version: 2,
            originalModePending: undefined,
            porcelainMigrationPending: undefined,
          })
    if (!samePreferences(preferences, next)) writeJsonAtomic(paths.preferences, next)
    return Object.freeze({ activeId: next.activeId as SkinId | null, theme })
  }

  const seededTheme = preferences.activeId === null
    ? (preferences.fallbackTheme === 'system' ? undefined : preferences.fallbackTheme)
    : preferences.activeId === LEGACY_PORCELAIN_ID
      ? 'light'
      : nativeThemeId(preferences.activeId,
          preferences.version !== 2 || preferences.originalModePending === true
            ? 'dark'
            : preferences.fallbackTheme === 'light' ? 'light' : 'dark')
  if (seededTheme !== undefined) writeJsonAtomic(paths.themePreference, { theme: seededTheme })
  return Object.freeze({ activeId: preferences.activeId as SkinId | null, theme: seededTheme })
}
