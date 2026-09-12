import { lstatSync } from 'node:fs'
import { atomicWrite } from './launcher-persistence.ts'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'
import { prepareTrustedRaycastCanIUsePreferences, readTrustedRaycastCanIUsePreferences, type TrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'
import type { TrustedRaycastCanIUseQueryOptions } from './trusted-raycast-can-i-use-query.ts'

/** Decode without rewriting user files; the manager revalidates against its staged snapshot. */
export function loadTrustedRaycastCanIUsePreferences(path: string): TrustedRaycastCanIUsePreferences | Readonly<Record<string, never>> {
  try { return readTrustedRaycastCanIUsePreferences(JSON.parse(readBoundedRegularFile(path, 16384))) }
  catch { return Object.freeze({}) }
}

export async function saveTrustedRaycastCanIUsePreferences(path: string, values: unknown, options: TrustedRaycastCanIUseQueryOptions): Promise<void> {
  const { preferences } = prepareTrustedRaycastCanIUsePreferences(values, options)
  try { if (!lstatSync(path).isFile()) throw new Error('Can I Use preferences path is not a regular file') }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
  await atomicWrite(path, `${JSON.stringify(preferences)}\n`, { backup: false })
}
