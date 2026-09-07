import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { TRUSTED_RAYCAST_ARTIFACT_SHA256 } from '../src/trusted-raycast-artifact-admission.ts'
// @ts-expect-error Build helper is JavaScript.

import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'

test('trusted Translate child runtime pins Node 24: the unchanged playTTS download stalls on Node 26', () => {
  const stagingSource = readFileSync(join(resolve('.'), 'scripts', 'stage-dsh.mjs'), 'utf8')
  assert.match(stagingSource, /process\.env\.DSH_DESKTOP_NODE_VERSION \?\? '24\.20\.0'/, 'the packaged default must remain on the proven Node 24 runtime')
  const staged = join(resolve('.'), '.stage', 'node-runtime', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  if (!existsSync(staged)) return
  const version = execFileSync(staged, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim()
  assert.match(version, /^v24\./, `staged child runtime ${version} reproduces the upstream playTTS https.get stall; stage with DSH_DESKTOP_NODE_VERSION=24.20.0`)
})

test('the reviewed Google Translate archive is repository-owned for ordinary builds', () => {
  const artifact = join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor', 'google-translate.tar')
  assert.equal(existsSync(artifact), true)
  assert.equal(createHash('sha256').update(readFileSync(artifact)).digest('hex'), TRUSTED_RAYCAST_ARTIFACT_SHA256)
  assert.match(readFileSync(join(resolve('.'), 'scripts', 'build.mjs'), 'utf8'), /TRUSTED_RAYCAST_ARTIFACT_TAR \?\? .*google-translate\.tar/)
})

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
    assert.equal(existsSync(join(root, 'trusted-raycast', 'google-translate.png')), true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('configured rebuilds are byte-identical: fixed work root keeps every emitted file deterministic', async t => {
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!artifact) return t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR')
  const root = mkdtempSync(join(tmpdir(), 'raycast-repro-test-'))
  const digestOf = (dir: string): string => {
    const hash = createHash('sha256')
    for (const file of ['artifact.tar', 'child.mjs', 'resolution.mjs', 'build.json']) hash.update(readFileSync(join(dir, 'trusted-raycast', file)))
    return hash.digest('hex')
  }
  try {
    const first = join(root, 'first'); const second = join(root, 'second')
    await buildTrustedRaycast(first, artifact)
    await buildTrustedRaycast(second, artifact)
    const firstDigest = digestOf(first)
    const secondDigest = digestOf(second)
    assert.equal(firstDigest, secondDigest, 'rebuild must produce the identical digest')
    assert.ok(readFileSync(join(first, 'trusted-raycast', 'artifact.tar')).equals(readFileSync(artifact)))
    assert.equal(readFileSync(join(first, 'trusted-raycast', 'child.mjs'), 'utf8'), readFileSync(join(second, 'trusted-raycast', 'child.mjs'), 'utf8'))
    // No machine-local paths leak into the emitted bundle.
    assert.doesNotMatch(readFileSync(join(first, 'trusted-raycast', 'child.mjs'), 'utf8'), /(?:\/private\/var|\/var\/folders)/)
    const metadata = JSON.parse(readFileSync(join(second, 'trusted-raycast', 'build.json'), 'utf8'))
    assert.equal(metadata.artifactSha256, '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac')
    assert.equal(metadata.command, 'translate')
    assert.equal(metadata.react, '19.0.0')
    assert.equal(metadata.reconciler, '0.31.0')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
