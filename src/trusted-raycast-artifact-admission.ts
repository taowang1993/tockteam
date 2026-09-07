import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { TRUSTED_RAYCAST_RUNTIME } from './trusted-raycast-artifact.ts'

export const TRUSTED_RAYCAST_ARTIFACT_SHA256 = '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac'

export function admitTrustedRaycastArtifact(path: string, expected = TRUSTED_RAYCAST_ARTIFACT_SHA256): Buffer {
  const file = openSync(path, 'r')
  try {
    const stat = fstatSync(file)
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('trusted Raycast artifact exceeds its reviewed size bound')
    const buffer = Buffer.alloc(stat.size + 1)
    let size = 0
    while (size < buffer.length) {
      const read = readSync(file, buffer, size, buffer.length - size, null)
      if (read === 0) break
      size += read
    }
    const bytes = buffer.subarray(0, size)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== expected) throw new Error(`trusted Raycast artifact digest mismatch: ${digest}`)
    return bytes
  } finally { closeSync(file) }
}

/** Every load path shares this admission: pinned digest plus the reviewed command/runtime pairing. */
export function assertTrustedRaycastBuildIdentity(metadata: unknown, expected = TRUSTED_RAYCAST_ARTIFACT_SHA256): string {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) throw new Error('Translate build identity is missing')
  const record = metadata as Record<string, unknown>
  if (record.artifactSha256 !== expected || record.command !== 'translate' || record.react !== TRUSTED_RAYCAST_RUNTIME.react || record.reconciler !== TRUSTED_RAYCAST_RUNTIME.reconciler) throw new Error('Translate build identity mismatch')
  return expected
}
