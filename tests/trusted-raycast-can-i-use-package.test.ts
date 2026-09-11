import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// @ts-expect-error First-party source builder.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'
import { getTrustedRaycastRuntimeDescriptor } from '../src/trusted-raycast-descriptors.ts'
import { admitTrustedRaycastArtifact, readTrustedRaycastBuildIdentity } from '../src/trusted-raycast-artifact-admission.ts'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'

test('Can I Use ships its admitted artifact and surviving legal inventory without touching other extensions', { skip: process.platform === 'win32', timeout: 30000 }, async () => {
  const descriptor = getTrustedRaycastRuntimeDescriptor('can-i-use')!
  const artifact = resolve('plugins/trusted-raycast/vendor/can-i-use.tar')
  assert.ok(admitTrustedRaycastArtifact(descriptor, artifact).length > 0)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  for (const files of [pkg.files, pkg.build.files]) assert.ok(files.includes('dist/trusted-raycast-can-i-use/**'))
  assert.match(readFileSync('scripts/build.mjs', 'utf8'), /buildTrustedRaycast\(dist, join\(root, 'plugins', 'trusted-raycast', 'vendor', 'can-i-use.tar'\), 'can-i-use'\)/)
  const readMember = (name: string) => execFileSync('/usr/bin/tar', ['-xOf', artifact, `${descriptor.artifactRoot}/${name}`], { encoding: 'utf8', timeout: 15000 })
  const legal = readMember('LICENSE-FILES')
  for (const name of ['CAN_I_USE_ATTRIBUTION.md', 'THIRD_PARTY_NOTICES.md', ...['react', 'react-reconciler', 'scheduler'].map(name => `runtime/node_modules/${name}/LICENSE`)]) {
    assert.ok(readMember(name).length > 100, name)
  }
  assert.match(legal, /react\/LICENSE/)
  assert.match(readMember('LICENSE-INVENTORY.json'), /CC-BY-4.0/)
  assert.match(readMember('PROVENANCE.txt'), new RegExp(descriptor.sourceRevision))
  const root = mkdtempSync(join(tmpdir(), 'can-i-use-package-'))
  const manager = new TrustedRaycastManager({ runtimeDir: join(root, 'trusted-raycast-can-i-use'), nodePath: process.execPath, onMessage: () => {} })
  try {
    mkdirSync(join(root, 'profile'), { recursive: true })
    const legacy = ['google-translate', 'kaomoji-search'].map(id => join(root, 'profile', `${id}.json`))
    for (const file of legacy) writeFileSync(file, 'user-owned legacy state')
    await buildTrustedRaycast(root, artifact, 'can-i-use')
    const candidate = join(root, 'trusted-raycast-can-i-use')
    assert.equal(readTrustedRaycastBuildIdentity(candidate, descriptor).artifactSha256, descriptor.artifactSha256)
    const store = new TrustedRaycastTrustStore({ descriptor, candidateDir: candidate,
      installRoot: join(root, 'profile', 'can-i-use'), stateFile: join(root, 'profile', 'can-i-use-trust.json'),
      preview: directory => manager.previewRuntime(directory, 'can-i-use') })
    store.stage(); await store.preview(); store.apply(); store.enable()
    assert.equal(store.status().digestApproved, true)
    assert.equal(store.status().enabled, true)
    store.disable(); store.remove()
    assert.equal(store.status().installed, false)
    for (const file of legacy) assert.equal(readFileSync(file, 'utf8'), 'user-owned legacy state')
  } finally { await manager.close(); rmSync(root, { recursive: true, force: true }) }
})
