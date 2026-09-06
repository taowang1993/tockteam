import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

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
