import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import { attestTrustedRaycastBuildIdentity } from '../src/trusted-raycast-artifact-admission.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'

for (const failure of ['approval', 'promotion', 'promoted'] as const) test(`selected extension recovery survives a failure at ${failure}`, t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'tocklauncher-recovery-save-'))
  const source = join(root, 'chosen')
  const data = join(root, 'data')
  fs.mkdirSync(source)
  fs.writeFileSync(join(source, 'package.json'), JSON.stringify({
    name: 'recovery-fixture', title: 'Recovery Fixture',
    commands: [{ name: 'index', mode: 'view' }],
  }))
  const module = join(source, 'index.js')
  const trust = join(data, 'trust.json')
  const store = new UserRaycastInstall(data)
  const rename = fs.renameSync
  try {
    fs.writeFileSync(module, 'approved previous bytes')
    const first = store.prepare(source)
    store.approve(first.digest)
    fs.writeFileSync(module, 'approved current bytes')
    store.approve(store.prepare(source).digest)
    store.enable()
    const decision = fs.readFileSync(trust)
    t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
      if (failure === 'approval' && String(to) === trust || failure === 'promotion' && String(from) === join(data, 'previous')) throw new Error('recovery publication failed')
      rename(from, to)
      if (failure === 'promoted' && String(from) === join(data, 'previous')) throw new Error('recovery publication failed')
    })
    syncBuiltinESMExports()
    assert.throws(() => store.recoverPrevious(), /recovery publication failed/)
    t.mock.restoreAll(); syncBuiltinESMExports()
    if (failure === 'approval') assert.deepEqual(fs.readFileSync(trust), decision)
    if (failure !== 'promoted') assert.equal(fs.readFileSync(join(data, 'previous', 'index.js'), 'utf8'), 'approved previous bytes')
    const reopened = new UserRaycastInstall(data)
    if (failure === 'promoted') assert.equal(reopened.status().installed, true, 'the promoted backup already has its approval after restart')
    else reopened.recoverPrevious()
    assert.equal(reopened.status().installed, true)
    assert.equal(reopened.status().digest, first.digest)
    assert.equal(reopened.status().enabled, false)
    assert.equal(fs.readFileSync(join(data, 'current', 'index.js'), 'utf8'), 'approved previous bytes')
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

for (const failure of ['approval', 'promotion', 'promoted'] as const) test(`bundled extension recovery survives a failure at ${failure}`, async t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'tocklauncher-bundled-recovery-save-'))
  const candidate = join(root, 'candidate')
  const install = join(root, 'install')
  const state = join(root, 'trust.json')
  const sha256 = (bytes: string) => createHash('sha256').update(bytes).digest('hex')
  const artifact = 'offline approved recovery fixture'
  const descriptor = { ...trustedRaycastDescriptors['google-translate'], artifactSha256: sha256(artifact) }
  const store = () => new TrustedRaycastTrustStore({ descriptor, candidateDir: candidate, installRoot: install, stateFile: state, preview: async () => '' })
  const writeCandidate = (child: string) => {
    fs.writeFileSync(join(candidate, 'child.mjs'), child)
    const identity = {
      artifactSha256: descriptor.artifactSha256, childSha256: sha256(child),
      command: descriptor.command, extensionId: descriptor.extensionId,
      react: descriptor.react, reconciler: descriptor.reconciler, resolutionSha256: sha256('offline resolver'),
    }
    fs.writeFileSync(join(candidate, 'build.json'), JSON.stringify({ ...identity, metadataSha256: attestTrustedRaycastBuildIdentity(identity) }))
  }
  const rename = fs.renameSync
  try {
    fs.mkdirSync(candidate)
    fs.writeFileSync(join(candidate, 'artifact.tar'), artifact)
    fs.writeFileSync(join(candidate, 'resolution.mjs'), 'offline resolver')
    writeCandidate('approved previous child')
    const currentStore = store()
    currentStore.stage(); await currentStore.preview(); currentStore.apply(true)
    writeCandidate('approved current child')
    currentStore.stage(); await currentStore.preview(); currentStore.apply()
    fs.writeFileSync(join(install, 'current', 'child.mjs'), 'damaged current child')
    const decision = fs.readFileSync(state)
    t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
      if (failure === 'approval' && String(to) === state || failure === 'promotion' && String(from) === join(install, 'previous')) throw new Error('recovery publication failed')
      rename(from, to)
      if (failure === 'promoted' && String(from) === join(install, 'previous')) throw new Error('recovery publication failed')
    })
    syncBuiltinESMExports()
    assert.throws(() => currentStore.recover(), /recovery publication failed/)
    t.mock.restoreAll(); syncBuiltinESMExports()
    if (failure === 'approval') assert.deepEqual(fs.readFileSync(state), decision)
    const reopened = store()
    const recovered = reopened.recover()
    assert.equal(recovered.installed, true, 'retry must restore the approved previous child')
    assert.equal(recovered.enabled, true)
    assert.equal(recovered.recovery, '')
    assert.equal(fs.readFileSync(join(install, 'current', 'child.mjs'), 'utf8'), 'approved previous child')
    assert.equal(reopened.runtimeDir(), join(install, 'current'))
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
