import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { trustedRaycastDescriptors, type TrustedRaycastCommand, type TrustedRaycastDescriptor, type TrustedRaycastRuntimeExtensionId } from './trusted-raycast-descriptors.ts'

/** Compatibility export for existing Google Translate evidence and callers. */
export const TRUSTED_RAYCAST_ARTIFACT_SHA256 = trustedRaycastDescriptors['google-translate'].artifactSha256
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAX_DERIVED_FILE = 16 * 1024 * 1024

export type TrustedRaycastBuildIdentity = Readonly<{
  artifactSha256: string
  childSha256: string
  command: TrustedRaycastCommand
  extensionId: TrustedRaycastRuntimeExtensionId
  metadataSha256: string
  projectionSha256?: string
  react: string
  reconciler: string
  resolutionSha256: string
}>

/** Read one regular file through an O_NOFOLLOW descriptor; the descriptor is the checked object. */
export function readTrustedRaycastFile(path: string, maxBytes = MAX_DERIVED_FILE): Buffer {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0)
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

export function admitTrustedRaycastArtifact(descriptor: TrustedRaycastDescriptor, path: string): Buffer {
  if (descriptor === undefined || descriptor === null || descriptor.extensionId === undefined) throw new Error('Invalid trusted extension identity')
  const bytes = readTrustedRaycastFile(path)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== descriptor.artifactSha256) throw new Error(`trusted Raycast artifact digest mismatch: ${digest}`)
  return bytes
}

const identityPayload = (identity: Omit<TrustedRaycastBuildIdentity, 'metadataSha256'>): string => JSON.stringify({
  artifactSha256: identity.artifactSha256,
  childSha256: identity.childSha256,
  command: identity.command,
  extensionId: identity.extensionId,
  ...(identity.projectionSha256 === undefined ? {} : { projectionSha256: identity.projectionSha256 }),
  react: identity.react,
  reconciler: identity.reconciler,
  resolutionSha256: identity.resolutionSha256,
})

export function attestTrustedRaycastBuildIdentity(identity: Omit<TrustedRaycastBuildIdentity, 'metadataSha256'>): string {
  return createHash('sha256').update(identityPayload(identity)).digest('hex')
}

/** Admit the exact pre-extension-ID Google format and normalize it before comparison. */
export function upgradeLegacyGoogleTranslateBuildIdentity(metadata: unknown, descriptor: TrustedRaycastDescriptor): TrustedRaycastBuildIdentity {
  if (descriptor.extensionId !== 'google-translate' || typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) throw new Error('Legacy Google Translate build identity is unavailable')
  const record = metadata as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'artifactSha256,childSha256,command,metadataSha256,react,reconciler,resolutionSha256') throw new Error('Legacy Google Translate build identity is incomplete')
  if (record.artifactSha256 !== descriptor.artifactSha256 || record.command !== descriptor.command || record.react !== descriptor.react || record.reconciler !== descriptor.reconciler) throw new Error('Legacy Google Translate build identity mismatch')
  for (const key of ['artifactSha256', 'childSha256', 'metadataSha256', 'resolutionSha256'] as const) if (typeof record[key] !== 'string' || !SHA256_PATTERN.test(record[key])) throw new Error('Legacy Google Translate build identity digest is invalid')
  const legacyPayload = { artifactSha256: record.artifactSha256, childSha256: record.childSha256, command: record.command, react: record.react, reconciler: record.reconciler, resolutionSha256: record.resolutionSha256 }
  if (createHash('sha256').update(JSON.stringify(legacyPayload)).digest('hex') !== record.metadataSha256) throw new Error('Legacy Google Translate build metadata attestation mismatch')
  const identity = { artifactSha256: record.artifactSha256 as string, childSha256: record.childSha256 as string, command: descriptor.command, extensionId: descriptor.extensionId, react: descriptor.react, reconciler: descriptor.reconciler, resolutionSha256: record.resolutionSha256 as string } satisfies Omit<TrustedRaycastBuildIdentity, 'metadataSha256'>
  return Object.freeze({ ...identity, metadataSha256: attestTrustedRaycastBuildIdentity(identity) })
}

/** Every load path shares this admission: pinned archive, reviewed pairing, and attested derived bytes. */
export function assertTrustedRaycastBuildIdentity(metadata: unknown, descriptor: TrustedRaycastDescriptor): TrustedRaycastBuildIdentity {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) throw new Error('Trusted extension build identity is missing')
  const record = metadata as Record<string, unknown>
  const keys = Object.keys(record).sort().join(',')
  if (keys !== 'artifactSha256,childSha256,command,extensionId,metadataSha256,react,reconciler,resolutionSha256' && keys !== 'artifactSha256,childSha256,command,extensionId,metadataSha256,projectionSha256,react,reconciler,resolutionSha256') throw new Error('Trusted extension build identity is incomplete')
  if (record.extensionId !== descriptor.extensionId || record.artifactSha256 !== descriptor.artifactSha256 || record.command !== descriptor.command || record.react !== descriptor.react || record.reconciler !== descriptor.reconciler) throw new Error('Trusted extension build identity mismatch')
  for (const key of ['artifactSha256', 'childSha256', 'metadataSha256', 'resolutionSha256', ...(Object.hasOwn(record, 'projectionSha256') ? ['projectionSha256' as const] : [])] as const) if (typeof record[key] !== 'string' || !SHA256_PATTERN.test(record[key])) throw new Error('Trusted extension build identity digest is invalid')
  const identity = record as unknown as TrustedRaycastBuildIdentity
  const { metadataSha256: _metadataSha256, ...payload } = identity
  if (attestTrustedRaycastBuildIdentity(payload) !== identity.metadataSha256) throw new Error('Trusted extension build metadata attestation mismatch')
  return Object.freeze({ ...identity })
}

/** Verify metadata, archive, and every derived module before a preview or child spawn. */
export function readTrustedRaycastDerivedFile(path: string, expected: string): Buffer {
  const bytes = readTrustedRaycastFile(path)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) throw new Error(`trusted Raycast derived file digest mismatch: ${actual}`)
  return bytes
}

const verifyTrustedRaycastBuildFiles = (runtimeDir: string, descriptor: TrustedRaycastDescriptor, identity: TrustedRaycastBuildIdentity): TrustedRaycastBuildIdentity => {
  admitTrustedRaycastArtifact(descriptor, join(runtimeDir, 'artifact.tar'))
  for (const [name, digest] of [['child.mjs', identity.childSha256], ['resolution.mjs', identity.resolutionSha256]] as const) readTrustedRaycastDerivedFile(join(runtimeDir, name), digest)
  return identity
}

export function readTrustedRaycastBuildIdentity(runtimeDir: string, descriptor: TrustedRaycastDescriptor): TrustedRaycastBuildIdentity {
  const metadata = JSON.parse(readTrustedRaycastFile(join(runtimeDir, 'build.json'), 64 * 1024).toString('utf8')) as unknown
  return verifyTrustedRaycastBuildFiles(runtimeDir, descriptor, assertTrustedRaycastBuildIdentity(metadata, descriptor))
}

export function readLegacyGoogleTranslateBuildIdentity(runtimeDir: string, descriptor: TrustedRaycastDescriptor): TrustedRaycastBuildIdentity {
  const metadata = JSON.parse(readTrustedRaycastFile(join(runtimeDir, 'build.json'), 64 * 1024).toString('utf8')) as unknown
  return verifyTrustedRaycastBuildFiles(runtimeDir, descriptor, upgradeLegacyGoogleTranslateBuildIdentity(metadata, descriptor))
}
