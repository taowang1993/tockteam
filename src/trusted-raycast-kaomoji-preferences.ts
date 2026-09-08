import { lstatSync, readFileSync } from 'node:fs'
import { atomicWrite } from './launcher-persistence.ts'
import { KAOMOJI_PREFERENCE_DEFAULTS, isKaomojiPreferences, type KaomojiPreferences } from './trusted-raycast-contract.ts'

export { KAOMOJI_PREFERENCE_DEFAULTS, isKaomojiPreferences, type KaomojiPreferences } from './trusted-raycast-contract.ts'
export type KaomojiPreferenceState = Readonly<{ configured: boolean; values: KaomojiPreferences }>

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
