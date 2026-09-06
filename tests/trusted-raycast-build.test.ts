import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Build helper is JavaScript.

import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'

test('build omits absent candidate and rejects unapproved bytes before compilation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-build-test-'))
  try {
    await buildTrustedRaycast(root, undefined)
    assert.equal(existsSync(join(root, 'trusted-raycast')), false)
    const bad = join(root, 'bad.tar'); writeFileSync(bad, 'not reviewed')
    await assert.rejects(buildTrustedRaycast(root, bad), /digest mismatch/)
    assert.equal(existsSync(join(root, 'trusted-raycast')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('configured build records exact original archive identity', async t => {
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!artifact) return t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR')
  const root = mkdtempSync(join(tmpdir(), 'raycast-build-test-'))
  try {
    await buildTrustedRaycast(root, artifact)
    assert.deepEqual(readFileSync(join(root, 'trusted-raycast', 'artifact.tar')), readFileSync(artifact))
    const metadata = JSON.parse(readFileSync(join(root, 'trusted-raycast', 'build.json'), 'utf8'))
    assert.equal(metadata.artifactSha256, '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac')
    assert.equal(existsSync(join(root, 'trusted-raycast', 'child.mjs')), true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
