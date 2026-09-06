import test from 'node:test'
import assert from 'node:assert/strict'
import { admitTrustedRaycastArtifact } from '../src/trusted-raycast-artifact-admission.ts'
import { mkdtempSync, writeFileSync, truncateSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('artifact admission fails closed on unapproved or oversized files without external configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-admission-test-'))
  try {
    const path = join(root, 'artifact.tar')
    writeFileSync(path, 'unapproved')
    assert.throws(() => admitTrustedRaycastArtifact(path), /digest mismatch/)
    truncateSync(path, 16 * 1024 * 1024 + 1)
    assert.throws(() => admitTrustedRaycastArtifact(path), /size bound/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('admit exact prepared artifact', (t) => {
  const path = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!path) { t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR for the explicit artifact integration check'); return }
  assert.ok(admitTrustedRaycastArtifact(path).length > 0)
  assert.throws(() => admitTrustedRaycastArtifact(path, '0'.repeat(64)), /digest mismatch/)
})
