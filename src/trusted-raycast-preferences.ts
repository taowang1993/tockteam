import { lstatSync } from 'node:fs'
import { isTrustedRaycastPreferences, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, type TrustedRaycastPreference } from './trusted-raycast-contract.ts'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'
import { atomicWrite } from './launcher-persistence.ts'

export type TrustedRaycastPreferences = Readonly<Record<string, TrustedRaycastPreference>>
export type TrustedRaycastPreferenceState = Readonly<{ configured: boolean; values: TrustedRaycastPreferences }>

/** User-owned preference file; missing or invalid entries fall back without rewriting it. */
export function loadTrustedRaycastPreferenceState(path: string): TrustedRaycastPreferenceState {
  try {
    const parsed: unknown = JSON.parse(readBoundedRegularFile(path, 4096))
    if (!isTrustedRaycastPreferences(parsed)) throw new Error('invalid')
    return Object.freeze({ configured: true, values: Object.freeze({ ...parsed }) })
  } catch { return Object.freeze({ configured: false, values: TRUSTED_RAYCAST_PREFERENCE_DEFAULTS }) }
}

export function loadTrustedRaycastPreferences(path: string): TrustedRaycastPreferences {
  return loadTrustedRaycastPreferenceState(path).values
}

/** Persist only a renderer-independent, fully validated preference projection. */
export async function saveTrustedRaycastPreferences(path: string, values: unknown): Promise<void> {
  if (!isTrustedRaycastPreferences(values)) throw new Error('Invalid Translate preferences')
  try { if (lstatSync(path).isSymbolicLink()) throw new Error('Translate preferences path is a symlink') } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error
  }
  await atomicWrite(path, `${JSON.stringify(values)}\n`, { backup: false })
}
