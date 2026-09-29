import { LEGACY_PORCELAIN_ID, SKIN_IDS, type SkinId } from './skin-ids.ts'

export { SKIN_IDS, type SkinId }
export type FallbackTheme = 'light' | 'dark' | 'system'

export interface SkinPreferences {
  activeId: SkinId | typeof LEGACY_PORCELAIN_ID | null
  fallbackTheme: FallbackTheme
  version?: 2
  originalModePending?: true | undefined
  porcelainMigrationPending?: true | undefined
}

/** Browser compatibility aliases retained for the existing public API. */
export const DESKTOP_SKIN_IDS = SKIN_IDS
export type DesktopSkinId = SkinId
export type DesktopFallbackTheme = FallbackTheme
export type DesktopSkinPreferences = SkinPreferences

export const ACTIVE_SKIN_KEY = 'tockteam.skins.active'
export const FALLBACK_THEME_KEY = 'tockteam.skins.fallback'
export const PREFERENCES_VERSION_KEY = 'tockteam.skins.version'
export const ORIGINAL_MODE_PENDING_KEY = 'tockteam.skins.original-mode-pending'
export const PORCELAIN_MIGRATION_PENDING_KEY = 'tockteam.skins.porcelain-migration-pending'
export const PREFERENCES_API_PATH = '/tockteam/skins/preferences'
export const DEFAULT_SKIN_PREFERENCES: SkinPreferences = Object.freeze({
  activeId: null,
  fallbackTheme: 'system',
})

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string'
    && (SKIN_IDS as readonly string[]).includes(value)
}

export const isDesktopSkinId = isSkinId

export function isFallbackTheme(value: unknown): value is FallbackTheme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function parseSkinPreferences(value: unknown): SkinPreferences | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const input = value as Record<string, unknown>
  if (input.activeId !== null && !isSkinId(input.activeId) && input.activeId !== LEGACY_PORCELAIN_ID) return undefined
  if (!isFallbackTheme(input.fallbackTheme)) return undefined
  if (input.version !== undefined && input.version !== 2) return undefined
  if (input.originalModePending !== undefined && input.originalModePending !== true) return undefined
  if (input.porcelainMigrationPending !== undefined && input.porcelainMigrationPending !== true) return undefined
  return Object.freeze({
    activeId: input.activeId,
    fallbackTheme: input.fallbackTheme,
    ...(input.version === 2 ? { version: 2 as const } : {}),
    ...(input.originalModePending === true ? { originalModePending: true as const } : {}),
    ...(input.porcelainMigrationPending === true ? { porcelainMigrationPending: true as const } : {}),
  }) as SkinPreferences
}
