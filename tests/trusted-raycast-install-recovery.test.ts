import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, truncateSync, existsSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'

import type { TrustedRaycastTrustState } from '../src/trusted-raycast-contract.ts'

const digestOf = (bytes: string): string => createHash('sha256').update(bytes).digest('hex')
const ARTIFACT_V1 = 'reviewed-translate-artifact-v1'
const ARTIFACT_V2 = 'reviewed-translate-artifact-v2'
const DIGEST_V1 = digestOf(ARTIFACT_V1)
const DIGEST_V2 = digestOf(ARTIFACT_V2)

type Fixture = Readonly<{
  root: string
  candidate: string
  install: string
  state: string
  userData: string
  store: () => TrustedRaycastTrustStore
}>

function makeFixture(expectedSha256 = DIGEST_V1, preview: ((dir: string) => Promise<string>) | undefined = undefined): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'raycast-trust-test-'))
  const candidate = join(root, 'candidate')
  const install = join(root, 'install')
  const state = join(root, 'trust.json')
  const userData = join(root, 'user-data')
  mkdirSync(candidate, { recursive: true })
  writeFileSync(join(candidate, 'artifact.tar'), ARTIFACT_V1)
  writeFileSync(join(candidate, 'child.mjs'), 'child-v1')
  writeFileSync(join(candidate, 'resolution.mjs'), 'resolution-v1')
  writeFileSync(join(candidate, 'build.json'), JSON.stringify({ artifactSha256: expectedSha256, command: 'translate', react: '19.0.0', reconciler: '0.31.0' }))
  return Object.freeze({
    root, candidate, install, state, userData,
    store: () => new TrustedRaycastTrustStore({ installRoot: install, candidateDir: candidate, stateFile: state, expectedSha256, ...(preview === undefined ? {} : { preview }) }),
  })
}

const install = async (fixture: Fixture) => {
  const store = fixture.store()
  store.stage()
  await store.preview()
  return store.apply()
}

test('digest rejection: nothing loads from an unreviewed candidate or wrong staged bytes', () => {
  const fixture = makeFixture()
  try {
    // Candidate whose bytes do not match the reviewed pin must never stage.
    writeFileSync(join(fixture.candidate, 'artifact.tar'), ARTIFACT_V2)
    writeFileSync(join(fixture.candidate, 'build.json'), JSON.stringify({ artifactSha256: DIGEST_V2, command: 'translate', react: '19.0.0', reconciler: '0.31.0' }))
    assert.throws(() => fixture.store().stage(), /digest/)
    assert.equal(fixture.store().runtimeDir(), undefined)
    // Identity drift on the candidate is rejected too, even with matching bytes.
    writeFileSync(join(fixture.candidate, 'artifact.tar'), ARTIFACT_V1)
    writeFileSync(join(fixture.candidate, 'build.json'), JSON.stringify({ artifactSha256: DIGEST_V1, command: 'translate-form', react: '19.0.0', reconciler: '0.31.0' }))
    assert.throws(() => fixture.store().stage(), /digest or identity/)
    assert.equal(fixture.store().status().candidateAvailable, false)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('install lifecycle: stage -> pinned candidate -> isolated preview -> explicit apply keeps installed separate from enabled', async () => {
  const fixture = makeFixture()
  try {
    const fresh = fixture.store().status()
    assert.equal(fresh.installed, false)
    assert.equal(fresh.enabled, false)
    assert.equal(fresh.recovery, '')
    assert.equal(fresh.candidateAvailable, true)
    assert.equal(fresh.candidateDigest, DIGEST_V1)
    assert.equal(fixture.store().runtimeDir(), undefined)

    // Apply is blocked until the staged candidate passes its isolated preview.
    fixture.store().stage()
    const staged = fixture.store().status()
    assert.equal(staged.staged, true)
    assert.equal(staged.previewed, false)
    assert.throws(() => fixture.store().apply(), /preview/)
    await fixture.store().preview()
    assert.equal(fixture.store().status().previewed, true)
    const applied = fixture.store().apply()
    assert.equal(applied.installed, true)
    assert.equal(applied.enabled, false, 'installed is not enabled')
    assert.equal(applied.digest, DIGEST_V1)
    assert.equal(applied.digestApproved, true)
    assert.equal(applied.hasPrevious, false)
    assert.equal(applied.recovery, '')
    assert.equal(fixture.store().runtimeDir(), join(fixture.install, 'current'))
    // Stage was consumed; nothing staged remains and nothing was auto-applied again.
    assert.equal(fixture.store().status().staged, false)

    // Enable / disable / re-enable are independent of the installed copy.
    assert.equal(fixture.store().enable().enabled, true)
    assert.equal(fixture.store().disable().enabled, false)
    assert.equal(fixture.store().enable().enabled, true)
    assert.equal(fixture.store().status().installed, true)

    // Remove deletes the install but retains the trust record for re-install/re-enable.
    const removed = fixture.store().remove()
    assert.equal(removed.installed, false)
    assert.equal(removed.enabled, true, 'enable preference survives removal')
    assert.equal(removed.recovery, '')
    assert.equal(fixture.store().runtimeDir(), undefined)
    assert.equal(existsSync(fixture.state), true)
    assert.equal(existsSync(join(fixture.install, 'current')), false)

    // Re-install of the same reviewed digest works and honors the retained enable preference.
    const reinstalled = await install(fixture)
    assert.equal(reinstalled.installed, true)
    assert.equal(reinstalled.enabled, true)
    assert.equal(reinstalled.digest, DIGEST_V1)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('preview failure blocks apply and leaves the candidate unapproved', async () => {
  const previewCalls: string[] = []
  const fixture = makeFixture(DIGEST_V1, async dir => { previewCalls.push(dir); return 'isolated preview failed' })
  try {
    fixture.store().stage()
    await assert.rejects(fixture.store().preview(), /isolated preview failed/)
    assert.equal(previewCalls.length, 1)
    assert.equal(fixture.store().status().previewed, false)
    assert.throws(() => fixture.store().apply(), /preview/)
    // A later healthy preview admits the same pinned bytes.
    const recovering = new TrustedRaycastTrustStore({ installRoot: fixture.install, candidateDir: fixture.candidate, stateFile: fixture.state, expectedSha256: DIGEST_V1, preview: async () => '' })
    await recovering.preview()
    assert.equal(recovering.apply().installed, true)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('current and previous are retained across an explicit reviewed upgrade; only pinned digests load', async () => {
  const fixture = makeFixture(DIGEST_V1)
  try {
    await install(fixture)
    // A newly reviewed pin (code change = review gate) becomes the candidate; upgrade stays explicit.
    writeFileSync(join(fixture.candidate, 'artifact.tar'), ARTIFACT_V2)
    writeFileSync(join(fixture.candidate, 'build.json'), JSON.stringify({ artifactSha256: DIGEST_V2, command: 'translate', react: '19.0.0', reconciler: '0.31.0' }))
    const upgraded = new TrustedRaycastTrustStore({ installRoot: fixture.install, candidateDir: fixture.candidate, stateFile: fixture.state, expectedSha256: DIGEST_V2 })
    // No automatic upgrade: the old digest is no longer the pinned identity, so nothing loads from it.
    const before = upgraded.status()
    assert.equal(before.installed, false)
    assert.equal(before.candidateAvailable, true)
    assert.equal(before.candidateDigest, DIGEST_V2)
    assert.equal(upgraded.runtimeDir(), undefined)
    // The explicit user install (approve & apply) records the new approval.
    upgraded.stage()
    await upgraded.preview()
    const applied = upgraded.apply()
    assert.equal(applied.digest, DIGEST_V2)
    assert.equal(applied.digestApproved, true)
    assert.equal(applied.installed, true)
    // The previous install is retained on disk but a non-pinned digest never loads or rolls back.
    assert.equal(readFileSync(join(fixture.install, 'previous', 'artifact.tar'), 'utf8'), ARTIFACT_V1)
    assert.equal(applied.hasPrevious, false)
    rmSync(join(fixture.install, 'current'), { recursive: true, force: true })
    assert.equal(upgraded.recover().installed, false)
    // Within one pin, interruption rolls back to the retained previous install.
    upgraded.stage()
    await upgraded.preview()
    upgraded.apply()
    upgraded.stage()
    await upgraded.preview()
    upgraded.apply()
    const retained = upgraded.status()
    assert.equal(retained.installed, true)
    assert.equal(retained.hasPrevious, true)
    rmSync(join(fixture.install, 'current'), { recursive: true, force: true })
    assert.equal(upgraded.status().recovery, 'interrupted-rotation')
    const recovered = upgraded.recover()
    assert.equal(recovered.installed, true)
    assert.equal(recovered.digest, DIGEST_V2)
    assert.equal(recovered.hasPrevious, false)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('faults: torn writes, wrong digests, missing files and partial installs never load and recover cleanly', async () => {
  const fixture = makeFixture()
  try {
    await install(fixture)
    fixture.store().enable()
    const current = join(fixture.install, 'current')

    // Torn write: truncated artifact bytes.
    truncateSync(join(current, 'artifact.tar'), 4)
    let status = fixture.store().status()
    assert.equal(status.installed, false)
    assert.equal(status.recovery, 'invalid-install')
    assert.equal(fixture.store().runtimeDir(), undefined, 'nothing loads from a torn install')

    // Wrong digest: foreign bytes swapped into the install root.
    writeFileSync(join(current, 'artifact.tar'), ARTIFACT_V2)
    status = fixture.store().status()
    assert.equal(status.installed, false)
    assert.equal(status.recovery, 'invalid-install')

    // Missing file: partial install.
    rmSync(join(current, 'child.mjs'))
    status = fixture.store().status()
    assert.equal(status.installed, false)
    assert.equal(status.recovery, 'invalid-install')

    // Recovery clears the broken install and the user reinstalls explicitly.
    const cleared = fixture.store().recover()
    assert.equal(cleared.installed, false)
    assert.equal(cleared.recovery, '')
    assert.equal(cleared.enabled, true)
    const reinstalled = await install(fixture)
    assert.equal(reinstalled.installed, true)
    assert.equal(reinstalled.enabled, true)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('an interrupted stage never applies and is replaced by the next explicit stage', async () => {
  const fixture = makeFixture()
  try {
    fixture.store().stage()
    // Crash mid-rotation: the staged candidate vanished before apply.
    renameSync(join(fixture.install, 'stage'), join(fixture.install, 'stage.crash'))
    const after = fixture.store().status()
    assert.equal(after.staged, false)
    assert.equal(after.installed, false)
    // A stale stage.tmp from a torn copy is ignored and replaced.
    mkdirSync(join(fixture.install, 'stage.tmp'), { recursive: true })
    writeFileSync(join(fixture.install, 'stage.tmp', 'artifact.tar'), ARTIFACT_V1)
    fixture.store().stage()
    assert.equal(fixture.store().status().staged, true)
    assert.equal(existsSync(join(fixture.install, 'stage.tmp')), false)
    assert.throws(() => fixture.store().apply(), /preview/, 'orphaned staging still requires its preview')
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('trust state persists across restarts and install/remove never touches user data or notices', async () => {
  const fixture = makeFixture()
  try {
    mkdirSync(fixture.userData, { recursive: true })
    const preferences = Buffer.from(JSON.stringify({ langFrom: 'auto', lang1: 'zh-CN', lang2: 'en', autoInput: true }))
    const languageSets = Buffer.from(JSON.stringify({ savedSets: [{ langFrom: 'auto', langTo: ['fr'] }] }))
    const notices = Buffer.from('third-party notices for the reviewed archive')
    writeFileSync(join(fixture.userData, 'trusted-raycast-preferences.json'), preferences)
    writeFileSync(join(fixture.userData, 'trusted-raycast-state.json'), languageSets)
    writeFileSync(join(fixture.userData, 'THIRD_PARTY_NOTICES.md'), notices)
    const snapshot = (): string => [preferences, languageSets, notices].map(entry => entry.toString('base64')).join('|')

    await install(fixture)
    fixture.store().enable()
    fixture.store().disable()
    fixture.store().enable()
    fixture.store().remove()
    await install(fixture)

    // A new process instance sees the same persisted state.
    const restarted = new TrustedRaycastTrustStore({ installRoot: fixture.install, candidateDir: fixture.candidate, stateFile: fixture.state, expectedSha256: DIGEST_V1 })
    const status = restarted.status()
    assert.equal(status.installed, true)
    assert.equal(status.enabled, true)
    assert.equal(status.digest, DIGEST_V1)
    assert.equal(status.digestApproved, true)
    assert.equal(snapshot(), [preferences, languageSets, notices].map(entry => entry.toString('base64')).join('|'))
    assert.equal(readFileSync(join(fixture.userData, 'trusted-raycast-preferences.json'), 'utf8'), preferences.toString('utf8'))
    assert.equal(readFileSync(join(fixture.userData, 'trusted-raycast-state.json'), 'utf8'), languageSets.toString('utf8'))
    assert.equal(readFileSync(join(fixture.userData, 'THIRD_PARTY_NOTICES.md'), 'utf8'), notices.toString('utf8'))
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('staging copies the admitted bytes verbatim and never executes install scripts', async () => {
  const fixture = makeFixture()
  try {
    fixture.store().stage()
    const staged = join(fixture.install, 'stage')
    assert.equal(readFileSync(join(staged, 'artifact.tar'), 'utf8'), ARTIFACT_V1)
    assert.equal(readFileSync(join(staged, 'child.mjs'), 'utf8'), 'child-v1')
    assert.equal(readFileSync(join(staged, 'resolution.mjs'), 'utf8'), 'resolution-v1')
    assert.deepEqual(JSON.parse(readFileSync(join(staged, 'build.json'), 'utf8')), { artifactSha256: DIGEST_V1, command: 'translate', react: '19.0.0', reconciler: '0.31.0' })
    assert.deepEqual(JSON.parse(readFileSync(join(staged, 'stage.json'), 'utf8')), { digest: DIGEST_V1, previewed: false })
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('status is stable across repeated reads and refreshes only when the install changes', () => {
  const fixture = makeFixture()
  try {
    const store = fixture.store()
    const first = store.status()
    const second = store.status()
    assert.equal(first, second)
    fixture.store().stage()
    const staged = store.status()
    assert.equal(staged.staged, true)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})
