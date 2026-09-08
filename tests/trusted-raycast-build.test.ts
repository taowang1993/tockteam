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

test('ordinary builds use only the two repository-owned reviewed archives', () => {
  const vendor = join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor')
  const translate = join(vendor, 'google-translate.tar')
  const kaomoji = join(vendor, 'kaomoji-search.tar')
  assert.equal(createHash('sha256').update(readFileSync(translate)).digest('hex'), TRUSTED_RAYCAST_ARTIFACT_SHA256)
  assert.equal(createHash('sha256').update(readFileSync(kaomoji)).digest('hex'), '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f')
  const build = readFileSync(join(resolve('.'), 'scripts', 'build.mjs'), 'utf8')
  assert.doesNotMatch(build, /TRUSTED_RAYCAST_ARTIFACT_TAR/)
  assert.match(build, /google-translate\.tar'\), 'google-translate'/)
  assert.match(build, /kaomoji-search\.tar'\), 'kaomoji-search'/)
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
test('reviewed build records exact original archive identity', async () => {
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR ?? join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor', 'google-translate.tar')
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
test('Kaomoji build is descriptor-bound and compiles without loading the candidate', async () => {
  const artifact = join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor', 'kaomoji-search.tar')
  const root = mkdtempSync(join(tmpdir(), 'raycast-kaomoji-build-test-'))
  try {
    await buildTrustedRaycast(root, artifact, 'kaomoji-search')
    const output = join(root, 'trusted-raycast-kaomoji')
    const metadata = JSON.parse(readFileSync(join(output, 'build.json'), 'utf8'))
    assert.equal(metadata.extensionId, 'kaomoji-search')
    assert.equal(metadata.command, 'index')
    assert.equal(metadata.artifactSha256, '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f')
    assert.equal(metadata.projectionSha256, createHash('sha256').update(readFileSync(join(resolve('.'), 'src', 'trusted-raycast-projection.ts'))).digest('hex'))
    assert.deepEqual(readFileSync(join(output, 'artifact.tar')), readFileSync(artifact))
    assert.equal(existsSync(join(output, 'google-translate.png')), false)
    assert.equal(existsSync(join(output, 'kaomoji-search.png')), true)
    const child = readFileSync(join(output, 'child.mjs'), 'utf8')
    assert.doesNotMatch(child, /tockteam-raycast-artifact\/source\/src\/translate/)
    assert.match(child, /projectTrustedRaycastRoot/)
    assert.doesNotMatch(child, /@tockteam\/trusted-raycast-projection|\.\/trusted-raycast-projection\.ts/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('reviewed rebuilds are byte-identical: fixed work root keeps every emitted file deterministic', async () => {
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR ?? join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor', 'google-translate.tar')
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
