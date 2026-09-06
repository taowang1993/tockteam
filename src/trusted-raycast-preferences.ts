import { readFileSync } from 'node:fs'
import { isTrustedRaycastPreferences, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, type TrustedRaycastPreference } from './trusted-raycast-contract.ts'

export type TrustedRaycastPreferences = Readonly<Record<string, TrustedRaycastPreference>>

/** User-owned preference file; missing or invalid entries fall back per key and the file is never rewritten. */
export function loadTrustedRaycastPreferences(path: string): TrustedRaycastPreferences {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return Object.freeze({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, ...(isTrustedRaycastPreferences(parsed) ? parsed : {}) })
  } catch { return Object.freeze({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS }) }
}
