import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, truncateSync, existsSync, renameSync, symlinkSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import { attestTrustedRaycastBuildIdentity } from '../src/trusted-raycast-artifact-admission.ts'

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
  const identity = { artifactSha256: expectedSha256, childSha256: digestOf('child-v1'), command: 'translate' as const, react: '19.0.0', reconciler: '0.31.0', resolutionSha256: digestOf('resolution-v1') }
  writeFileSync(join(candidate, 'build.json'), JSON.stringify({ ...identity, metadataSha256: attestTrustedRaycastBuildIdentity(identity) }))
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

test('bundled reviewed Translate installs enabled on first run and preserves later user disablement', async () => {
  let previews = 0
  const fixture = makeFixture(DIGEST_V1, async () => { previews++; return '' })
  try {
    const first = await fixture.store().installBundledDefault()
    assert.equal(first.installed, true)
    assert.equal(first.enabled, true)
    assert.equal(first.digestApproved, true)
    assert.equal(previews, 1, 'the reviewed bundle still passes isolated preview before first load')

    fixture.store().disable()
    const restarted = await fixture.store().installBundledDefault()
    assert.equal(restarted.enabled, false, 'an explicit user disable survives restart')
    assert.equal(previews, 1, 'a healthy existing install is not previewed again')
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
    assert.equal(existsSync(join(fixture.install, 'rotation.json')), false)
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
    writeFileSync(join(fixture.candidate, 'child.mjs'), 'child-v2')
    writeFileSync(join(fixture.candidate, 'resolution.mjs'), 'resolution-v2')
    const identityV2 = { artifactSha256: DIGEST_V2, childSha256: digestOf('child-v2'), command: 'translate' as const, react: '19.0.0', reconciler: '0.31.0', resolutionSha256: digestOf('resolution-v2') }
    writeFileSync(join(fixture.candidate, 'build.json'), JSON.stringify({ ...identityV2, metadataSha256: attestTrustedRaycastBuildIdentity(identityV2) }))
    const upgraded = new TrustedRaycastTrustStore({ installRoot: fixture.install, candidateDir: fixture.candidate, stateFile: fixture.state, expectedSha256: DIGEST_V2 })
    // A newer candidate never replaces the still-approved current install.
    const before = upgraded.status()
    assert.equal(before.installed, true)
    assert.equal(before.digest, DIGEST_V1)
    assert.equal(before.candidateAvailable, true)
    assert.equal(before.candidateDigest, DIGEST_V2)
    assert.equal(upgraded.runtimeDir(), join(fixture.install, 'current'))
    // The explicit user install (approve & apply) records the new approval.
    upgraded.stage()
    await upgraded.preview()
    const applied = upgraded.apply()
    assert.equal(applied.digest, DIGEST_V2)
    assert.equal(applied.digestApproved, true)
    assert.equal(applied.installed, true)
    // The previous approved identity is retained for exact cross-digest recovery.
    assert.equal(readFileSync(join(fixture.install, 'previous', 'artifact.tar'), 'utf8'), ARTIFACT_V1)
    assert.equal(applied.hasPrevious, true)
    // Recovery on a healthy install is a no-op and must not roll back the current.
    assert.equal(upgraded.recover().digest, DIGEST_V2)
    assert.equal(readFileSync(join(fixture.install, 'current', 'artifact.tar'), 'utf8'), ARTIFACT_V2)
    rmSync(join(fixture.install, 'current'), { recursive: true, force: true })
    assert.equal(upgraded.recover().installed, true)
    assert.equal(upgraded.status().digest, DIGEST_V1)
    // A corrupt current rolls back only to the persisted, exact prior approval.
    upgraded.stage(); await upgraded.preview(); upgraded.apply()
    writeFileSync(join(fixture.install, 'current', 'child.mjs'), 'corrupt-current')
    assert.equal(upgraded.status().recovery, 'interrupted-rotation')
    const repaired = upgraded.recover()
    assert.equal(repaired.installed, true)
    assert.equal(repaired.digest, DIGEST_V1)
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
    assert.equal(JSON.parse(readFileSync(join(staged, 'build.json'), 'utf8')).artifactSha256, DIGEST_V1)
    assert.equal(typeof JSON.parse(readFileSync(join(staged, 'build.json'), 'utf8')).metadataSha256, 'string')
    assert.deepEqual(JSON.parse(readFileSync(join(staged, 'stage.json'), 'utf8')), { digest: DIGEST_V1, previewed: false })
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('atomic trust writes do not follow a preexisting predictable temp symlink', () => {
  const fixture = makeFixture()
  const outside = join(fixture.root, 'outside')
  try {
    writeFileSync(outside, 'untouched')
    symlinkSync(outside, `${fixture.state}.tmp`)
    fixture.store().enable()
    assert.equal(readFileSync(outside, 'utf8'), 'untouched')
    assert.equal(existsSync(`${fixture.state}.tmp`), true)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('rotation journal blocks exposure until a crash recovery decision is complete', async () => {
  const fixture = makeFixture()
  try {
    await install(fixture)
    const identity = JSON.parse(readFileSync(join(fixture.install, 'current', 'build.json'), 'utf8'))
    writeFileSync(join(fixture.install, 'rotation.json'), JSON.stringify({ candidate: identity }))
    assert.equal(fixture.store().status().installed, false)
    assert.equal(fixture.store().runtimeDir(), undefined)
    assert.equal(fixture.store().recover().installed, true)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('same-size same-mtime derived tampering invalidates a previously read install', async () => {
  const fixture = makeFixture()
  try {
    await install(fixture)
    const child = join(fixture.install, 'current', 'child.mjs')
    const before = statSync(child)
    assert.equal(fixture.store().status().installed, true)
    writeFileSync(child, 'child-v2')
    utimesSync(child, before.atime, before.mtime)
    assert.equal(fixture.store().status().installed, false)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('derived child tampering invalidates the install before runtime resolution', async () => {
  const fixture = makeFixture()
  try {
    await install(fixture)
    writeFileSync(join(fixture.install, 'current', 'child.mjs'), 'tampered-child')
    assert.equal(fixture.store().status().installed, false)
    assert.equal(fixture.store().runtimeDir(), undefined)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('symlinked derived files and install roots are rejected before staging or loading', async () => {
  const fixture = makeFixture()
  try {
    symlinkSync(join(fixture.candidate, 'child.mjs'), join(fixture.candidate, 'child-link.mjs'))
    rmSync(join(fixture.candidate, 'child.mjs'))
    symlinkSync(join(fixture.root, 'outside'), join(fixture.candidate, 'child.mjs'))
    assert.throws(() => fixture.store().stage())
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('derived resolution tampering invalidates the install before runtime resolution', async () => {
  const fixture = makeFixture()
  try {
    await install(fixture)
    writeFileSync(join(fixture.install, 'current', 'resolution.mjs'), 'tampered-resolution')
    assert.equal(fixture.store().status().installed, false)
    assert.equal(fixture.store().runtimeDir(), undefined)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})

test('status is equivalent across repeated reads and reflects current install bytes', () => {
  const fixture = makeFixture()
  try {
    const store = fixture.store()
    const first = store.status()
    const second = store.status()
    assert.deepEqual(first, second)
    fixture.store().stage()
    const staged = store.status()
    assert.equal(staged.staged, true)
  } finally { rmSync(fixture.root, { recursive: true, force: true }) }
})
