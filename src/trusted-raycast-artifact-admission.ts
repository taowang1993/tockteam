import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { TRUSTED_RAYCAST_RUNTIME } from './trusted-raycast-artifact.ts'

export const TRUSTED_RAYCAST_ARTIFACT_SHA256 = '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAX_DERIVED_FILE = 16 * 1024 * 1024

export type TrustedRaycastBuildIdentity = Readonly<{
  artifactSha256: string
  childSha256: string
  command: 'translate'
  metadataSha256: string
  react: string
  reconciler: string
  resolutionSha256: string
}>

/** Read one regular file through an O_NOFOLLOW descriptor; the descriptor is the checked object. */
export function readTrustedRaycastFile(path: string, maxBytes = MAX_DERIVED_FILE): Buffer {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
  const file = openSync(path, flags)
  try {
    const stat = fstatSync(file)
    if (!stat.isFile()) throw new Error('trusted Raycast file is not a regular file')
    if (stat.size > maxBytes) throw new Error('trusted Raycast file exceeds its reviewed size bound')
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = readSync(file, bytes, offset, bytes.length - offset, null)
      if (read === 0) throw new Error('trusted Raycast file changed while reading')
      offset += read
    }
    return bytes
  } finally { closeSync(file) }
}

export function admitTrustedRaycastArtifact(path: string, expected = TRUSTED_RAYCAST_ARTIFACT_SHA256): Buffer {
  const bytes = readTrustedRaycastFile(path)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== expected) throw new Error(`trusted Raycast artifact digest mismatch: ${digest}`)
  return bytes
}

const identityPayload = (identity: Omit<TrustedRaycastBuildIdentity, 'metadataSha256'>): string => JSON.stringify({
  artifactSha256: identity.artifactSha256,
  childSha256: identity.childSha256,
  command: identity.command,
  react: identity.react,
  reconciler: identity.reconciler,
  resolutionSha256: identity.resolutionSha256,
})

export function attestTrustedRaycastBuildIdentity(identity: Omit<TrustedRaycastBuildIdentity, 'metadataSha256'>): string {
  return createHash('sha256').update(identityPayload(identity)).digest('hex')
}

/** Every load path shares this admission: pinned archive, reviewed pairing, and attested derived bytes. */
export function assertTrustedRaycastBuildIdentity(metadata: unknown, expected = TRUSTED_RAYCAST_ARTIFACT_SHA256): TrustedRaycastBuildIdentity {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) throw new Error('Translate build identity is missing')
  const record = metadata as Record<string, unknown>
  const keys = Object.keys(record).sort().join(',')
  if (keys !== 'artifactSha256,childSha256,command,metadataSha256,react,reconciler,resolutionSha256') throw new Error('Translate build identity is incomplete')
  if (record.artifactSha256 !== expected || record.command !== 'translate' || record.react !== TRUSTED_RAYCAST_RUNTIME.react || record.reconciler !== TRUSTED_RAYCAST_RUNTIME.reconciler) throw new Error('Translate build identity mismatch')
  for (const key of ['artifactSha256', 'childSha256', 'metadataSha256', 'resolutionSha256'] as const) if (typeof record[key] !== 'string' || !SHA256_PATTERN.test(record[key])) throw new Error('Translate build identity digest is invalid')
  const identity = record as unknown as TrustedRaycastBuildIdentity
  const { metadataSha256: _metadataSha256, ...payload } = identity
  if (attestTrustedRaycastBuildIdentity(payload) !== identity.metadataSha256) throw new Error('Translate build metadata attestation mismatch')
  return Object.freeze({ ...identity })
}

/** Verify metadata, archive, and every derived module before a preview or child spawn. */
export function readTrustedRaycastDerivedFile(path: string, expected: string): Buffer {
  const bytes = readTrustedRaycastFile(path)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) throw new Error(`trusted Raycast derived file digest mismatch: ${actual}`)
  return bytes
}

export function readTrustedRaycastBuildIdentity(runtimeDir: string, expected = TRUSTED_RAYCAST_ARTIFACT_SHA256): TrustedRaycastBuildIdentity {
  const metadata = JSON.parse(readTrustedRaycastFile(join(runtimeDir, 'build.json'), 64 * 1024).toString('utf8')) as unknown
  const identity = assertTrustedRaycastBuildIdentity(metadata, expected)
  admitTrustedRaycastArtifact(join(runtimeDir, 'artifact.tar'), expected)
  for (const [name, digest] of [['child.mjs', identity.childSha256], ['resolution.mjs', identity.resolutionSha256]] as const) readTrustedRaycastDerivedFile(join(runtimeDir, name), digest)
  return identity
}
