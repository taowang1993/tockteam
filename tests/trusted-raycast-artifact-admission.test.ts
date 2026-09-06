import test from 'node:test'
import assert from 'node:assert/strict'
import { admitTrustedRaycastArtifact } from '../src/trusted-raycast-artifact-admission.ts'

test('admit exact prepared artifact', (t) => {
  const path = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!path) { t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR for the explicit artifact integration check'); return }
  assert.ok(admitTrustedRaycastArtifact(path).length > 0)
  assert.throws(() => admitTrustedRaycastArtifact(path, '0'.repeat(64)), /digest mismatch/)
})
