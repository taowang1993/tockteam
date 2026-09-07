import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { admitTrustedRaycastArtifact, assertTrustedRaycastBuildIdentity } from '../src/trusted-raycast-artifact-admission.ts'

const PINNED_SHA256 = '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac'

test('owning package, build, staging and notices admit Desktop capability without browser injection', () => {
  const manifest = JSON.parse(readFileSync('plugins/trusted-raycast/package.json', 'utf8'))
  assert.deepEqual(Object.keys(manifest.exports), ['.', './host', './contract', './runtime', './renderer', './package.json'])
  assert.equal(manifest.dsh?.client, undefined)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  assert.ok(pkg.files.includes('dist/trusted-raycast/**'))
  assert.ok(pkg.build.files.includes('dist/trusted-raycast/**'))
  assert.match(readFileSync('scripts/stage-dsh.mjs', 'utf8'), /plugins\/trusted-raycast/)
  assert.match(readFileSync('THIRD_PARTY_NOTICES.md', 'utf8'), /7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac/)
  // The distribution ships the reviewed archive plus its build identity; the install/trust surface adds no new third-party code.
  const distIdentity = join('dist', 'trusted-raycast', 'build.json')
  if (existsSync(distIdentity)) {
    const metadata = JSON.parse(readFileSync(distIdentity, 'utf8'))
    assertTrustedRaycastBuildIdentity(metadata)
    assert.equal(metadata.artifactSha256, PINNED_SHA256)
    const archive = readFileSync(join('dist', 'trusted-raycast', 'artifact.tar'))
    assert.equal(createHash('sha256').update(archive).digest('hex'), PINNED_SHA256)
    for (const file of ['child.mjs', 'resolution.mjs']) assert.ok(readFileSync(join('dist', 'trusted-raycast', file)).length > 0, file)
  }
})
test('configured archive preserves all 35 source files and notice/dependency inventory', t => {
  const path = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!path) return t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR for source hash checks')
  const bytes = admitTrustedRaycastArtifact(path)
  const work = mkdtempSync(join(tmpdir(), 'raycast-source-check-'))
  try {
    execFileSync('/usr/bin/tar', ['xf', '-', '-C', work], { input: bytes, timeout: 15000 })
    const root = join(work, 'tockteam-raycast-artifact')
    const checks = readFileSync(join(root, 'SOURCE-CHECKS.sha256'), 'utf8').trim().split('\n')
    assert.equal(checks.length, 35)
    for (const check of checks) {
      const [, hash, path] = /^([a-f0-9]{64})  (.+)$/.exec(check)!
      assert.equal(createHash('sha256').update(readFileSync(join(root, 'source', path!))).digest('hex'), hash)
    }
    const inventory = JSON.parse(readFileSync(join(root, 'LICENSE-INVENTORY.json'), 'utf8'))
    assert.ok(inventory.some((item: { name: string; version: string }) => item.name === 'axios' && item.version === '0.31.1'))
    for (const [name, expected] of [['react', '19.0.0'], ['react-reconciler', '0.31.0'], ['scheduler', '0.25.0']]) assert.equal(JSON.parse(readFileSync(join(root, 'runtime/node_modules', name!, 'package.json'), 'utf8')).version, expected)
  } finally { rmSync(work, { recursive: true, force: true }) }
})
