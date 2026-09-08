import { lstatSync, readFileSync } from 'node:fs'
import { atomicWrite } from './launcher-persistence.ts'

export type KaomojiPreferences = Readonly<{
  displayMode: 'grid' | 'list'
  primaryAction: 'copy-to-clipboard' | 'paste-to-active-app'
}>
export type KaomojiPreferenceState = Readonly<{ configured: boolean; values: KaomojiPreferences }>

export const KAOMOJI_PREFERENCE_DEFAULTS: KaomojiPreferences = Object.freeze({
  displayMode: 'list',
  primaryAction: 'paste-to-active-app',
})

export function isKaomojiPreferences(value: unknown): value is KaomojiPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['displayMode', 'primaryAction'])) return false
  return (record.displayMode === 'grid' || record.displayMode === 'list')
    && (record.primaryAction === 'copy-to-clipboard' || record.primaryAction === 'paste-to-active-app')
}

export function loadKaomojiPreferenceState(path: string): KaomojiPreferenceState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isKaomojiPreferences(parsed)) throw new Error('invalid')
    return Object.freeze({ configured: true, values: Object.freeze({ ...parsed }) })
  } catch { return Object.freeze({ configured: false, values: KAOMOJI_PREFERENCE_DEFAULTS }) }
}

export async function saveKaomojiPreferences(path: string, values: unknown): Promise<void> {
  if (!isKaomojiPreferences(values)) throw new Error('Invalid Kaomoji preferences')
  try { if (lstatSync(path).isSymbolicLink()) throw new Error('Kaomoji preferences path is a symlink') } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error
  }
  await atomicWrite(path, `${JSON.stringify(values)}\n`, { backup: false })
}
