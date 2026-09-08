import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  admitTrustedRaycastArtifact,
  assertTrustedRaycastBuildIdentity,
  attestTrustedRaycastBuildIdentity,
} from '../src/trusted-raycast-artifact-admission.ts'
import { TRUSTED_RAYCAST_EXTENSION_IDS, getTrustedRaycastDescriptor } from '../src/trusted-raycast-descriptors.ts'

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')

test('artifact admission resolves only descriptor-owned digests before reading bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-admission-test-'))
  try {
    const path = join(root, 'artifact.tar')
    writeFileSync(path, 'unapproved')
    assert.throws(() => admitTrustedRaycastArtifact(getTrustedRaycastDescriptor('google-translate')!, path), /digest mismatch/)
    assert.throws(() => admitTrustedRaycastArtifact(undefined as never, join(root, 'missing')), /extension identity/)
    truncateSync(path, 16 * 1024 * 1024 + 1)
    assert.throws(() => admitTrustedRaycastArtifact(getTrustedRaycastDescriptor('google-translate')!, path), /size bound/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('both repository-owned archives match their immutable descriptors', () => {
  for (const id of TRUSTED_RAYCAST_EXTENSION_IDS) {
    const descriptor = getTrustedRaycastDescriptor(id)!
    const path = join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor', descriptor.vendorFile)
    assert.ok(admitTrustedRaycastArtifact(descriptor, path).length > 0)
  }
})

test('build identity cannot select another descriptor, command, or artifact digest', () => {
  const payload = {
    artifactSha256: getTrustedRaycastDescriptor('google-translate')!.artifactSha256,
    childSha256: digest('child'),
    command: 'translate' as const,
    extensionId: 'google-translate' as const,
    react: '19.0.0',
    reconciler: '0.31.0',
    resolutionSha256: digest('resolution'),
  }
  const identity = { ...payload, metadataSha256: attestTrustedRaycastBuildIdentity(payload) }
  assert.equal(assertTrustedRaycastBuildIdentity(identity, getTrustedRaycastDescriptor('google-translate')!).extensionId, 'google-translate')
  assert.throws(() => assertTrustedRaycastBuildIdentity(identity, getTrustedRaycastDescriptor('kaomoji-search')!), /identity mismatch/)
  assert.throws(() => assertTrustedRaycastBuildIdentity({ ...identity, command: 'index' }, getTrustedRaycastDescriptor('google-translate')!), /identity mismatch|attestation/)
  assert.throws(() => assertTrustedRaycastBuildIdentity({ ...identity, artifactSha256: '0'.repeat(64) }, getTrustedRaycastDescriptor('google-translate')!), /identity mismatch/)
})
