import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
// @ts-expect-error First-party process-group cleanup.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  admitTrustedRaycastArtifact,
  assertTrustedRaycastBuildIdentity,
  attestTrustedRaycastBuildIdentity,
  upgradeLegacyGoogleTranslateBuildIdentity,
} from '../src/trusted-raycast-artifact-admission.ts'
import { TRUSTED_RAYCAST_EXTENSION_IDS, getTrustedRaycastDescriptor } from '../src/trusted-raycast-descriptors.ts'

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')

test('bounded artifact reads reject a FIFO without waiting for a writer', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-admission-fifo-'))
  let child: ReturnType<typeof spawn> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const fifo = join(root, 'asset')
    execFileSync('/usr/bin/mkfifo', [fifo], { timeout: 1000 })
    const reader = new URL('../src/trusted-raycast-artifact-admission.ts', import.meta.url).href
    child = spawn(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { readTrustedRaycastFile } from ${JSON.stringify(reader)};
      assert.throws(() => readTrustedRaycastFile(process.argv[1], 1024), /not a regular file/);
    `, fifo], { cwd: root, detached: true, env: { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root }, stdio: ['ignore', 'ignore', 'pipe'] })
    let diagnostic = ''
    child.stderr!.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4096) })
    const code = await new Promise<number | null>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Bounded reader blocked on a FIFO')), 1500)
      child!.once('error', reject)
      child!.once('exit', resolve)
    })
    assert.equal(code, 0, diagnostic)
  } finally {
    clearTimeout(timer)
    if (child) {
      await stopOwnedChild(child, 250, true)
      t.diagnostic(JSON.stringify({ pid: child.pid, processGroupGone: true }))
    }
    rmSync(root, { recursive: true, force: true })
  }
})

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
  const { extensionId: _extensionId, ...legacyPayload } = payload
  const legacyIdentity = { ...legacyPayload, metadataSha256: digest(JSON.stringify(legacyPayload)) }
  assert.throws(() => assertTrustedRaycastBuildIdentity(legacyIdentity, getTrustedRaycastDescriptor('google-translate')!), /incomplete/)
  assert.equal(upgradeLegacyGoogleTranslateBuildIdentity(legacyIdentity, getTrustedRaycastDescriptor('google-translate')!).extensionId, 'google-translate')
  assert.throws(() => upgradeLegacyGoogleTranslateBuildIdentity(legacyIdentity, getTrustedRaycastDescriptor('kaomoji-search')!), /unavailable/)
  assert.throws(() => upgradeLegacyGoogleTranslateBuildIdentity({ ...legacyIdentity, childSha256: digest('tampered') }, getTrustedRaycastDescriptor('google-translate')!), /attestation/)
  assert.throws(() => assertTrustedRaycastBuildIdentity(identity, getTrustedRaycastDescriptor('kaomoji-search')!), /identity mismatch/)
  assert.throws(() => assertTrustedRaycastBuildIdentity({ ...identity, command: 'index' }, getTrustedRaycastDescriptor('google-translate')!), /identity mismatch|attestation/)
  assert.throws(() => assertTrustedRaycastBuildIdentity({ ...identity, artifactSha256: '0'.repeat(64) }, getTrustedRaycastDescriptor('google-translate')!), /identity mismatch/)
})
