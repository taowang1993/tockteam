import { randomUUID } from 'node:crypto'
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { isTrustedRaycastPreferences, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, type TrustedRaycastPreference } from './trusted-raycast-contract.ts'

export type TrustedRaycastPreferences = Readonly<Record<string, TrustedRaycastPreference>>
export type TrustedRaycastPreferenceState = Readonly<{ configured: boolean; values: TrustedRaycastPreferences }>

/** User-owned preference file; missing or invalid entries fall back without rewriting it. */
export function loadTrustedRaycastPreferenceState(path: string): TrustedRaycastPreferenceState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isTrustedRaycastPreferences(parsed)) throw new Error('invalid')
    return Object.freeze({ configured: true, values: Object.freeze({ ...parsed }) })
  } catch { return Object.freeze({ configured: false, values: TRUSTED_RAYCAST_PREFERENCE_DEFAULTS }) }
}

export function loadTrustedRaycastPreferences(path: string): TrustedRaycastPreferences {
  return loadTrustedRaycastPreferenceState(path).values
}

/** Persist only a renderer-independent, fully validated preference projection. */
export function saveTrustedRaycastPreferences(path: string, values: unknown): void {
  if (!isTrustedRaycastPreferences(values)) throw new Error('Invalid Translate preferences')
  try { if (lstatSync(path).isSymbolicLink()) throw new Error('Translate preferences path is a symlink') } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error
  }
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`)
  let descriptor: number | undefined
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
    writeFileSync(descriptor, `${JSON.stringify(values)}\n`)
    fsyncSync(descriptor)
    closeSync(descriptor); descriptor = undefined
    renameSync(temporary, path)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
}
