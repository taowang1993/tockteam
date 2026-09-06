import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const TRUSTED_RAYCAST_ARTIFACT_SHA256 = '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac'

export function admitTrustedRaycastArtifact(path: string, expected = TRUSTED_RAYCAST_ARTIFACT_SHA256): Buffer {
  const bytes = readFileSync(path)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== expected) throw new Error(`trusted Raycast artifact digest mismatch: ${digest}`)
  return bytes
}
