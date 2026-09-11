import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveLauncherProofMode } from '../src/launcher-proof-mode.ts'
import { findFocusProofResidue } from '../scripts/trusted-raycast-focus-proof-client.ts'
// @ts-expect-error JavaScript harness helper is directly exercised here.
import { shouldRemoveInstalledSmokeRoot } from '../scripts/launcher-installed-smoke.mjs'

const base = {
  isPackaged: true,
  argv: ['electron', '--tockteam-launcher-installed-smoke', '--tockteam-launcher-installed-first-use-smoke'],
  packagedSmokeEnabled: true,
  inactiveRequested: true,
  denyEffectsRequested: true,
  ipcConnected: true,
  nonce: 'a'.repeat(64),
}

for (const [name, patch] of [
  ['not packaged', { isPackaged: false }],
  ['packaged smoke gate missing', { packagedSmokeEnabled: false }],
  ['inactive flag missing', { inactiveRequested: false }],
  ['effect denial missing', { denyEffectsRequested: false }],
  ['inherited IPC missing', { ipcConnected: false }],
  ['nonce missing', { nonce: undefined }],
  ['nonce malformed', { nonce: 'not-a-nonce' }],
] as const) {
  test(`installed first-use proof fails closed when ${name}`, () => {
    assert.throws(() => resolveLauncherProofMode({ ...base, ...patch }), /installed first-use proof requires packaged smoke, inactive mode, denied effects, authenticated IPC, and a valid nonce/u)
  })
}

test('ordinary packaged and development modes remain unchanged', () => {
  assert.deepEqual(resolveLauncherProofMode({ ...base, argv: ['electron'], inactiveRequested: false, denyEffectsRequested: false }), { installedFirstUse: false, inactive: false })
  assert.deepEqual(resolveLauncherProofMode({ ...base, isPackaged: false, argv: ['electron'], packagedSmokeEnabled: false, inactiveRequested: true, denyEffectsRequested: true }), { installedFirstUse: false, inactive: true })
})

test('dedicated flag cannot silently fall through to ordinary smoke', () => {
  assert.throws(() => resolveLauncherProofMode({ ...base, argv: ['electron', '--tockteam-launcher-installed-first-use-smoke'], packagedSmokeEnabled: false }), /requires packaged smoke/u)
})

test('installed first-use harness is inactive, authenticated, direct, and first-use-only', async () => {
  const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
  const packaged = await readFile(new URL('../scripts/launcher-packaged-smoke.mjs', import.meta.url), 'utf8')
  const installed = await readFile(new URL('../scripts/launcher-installed-smoke.mjs', import.meta.url), 'utf8')
  const canIUse = await readFile(new URL('../scripts/trusted-raycast-can-i-use-installed-proof.mjs', import.meta.url), 'utf8')
  assert.match(main, /resolveLauncherProofMode\(/u)
  assert.match(main, /launcherProofMode\.installedFirstUse/u)
  assert.match(main, /app\.isPackaged && !launcherProofMode\.installedFirstUse/u)
  assert.match(packaged, /stdio: inactiveVisualProof \? \['ignore', 'pipe', 'pipe', 'ipc'\]/u)
  assert.match(packaged, /clearStartupDialogs\(workbench, inactiveVisualProof \? clickExactTextInactive/u)
  assert.match(packaged, /async function clickExactTextInactive[\s\S]*element\.click\(\)/u)
  const inactiveClick = packaged.slice(packaged.indexOf('async function clickExactTextInactive'), packaged.indexOf('async function clearStartupDialogs'))
  assert.doesNotMatch(inactiveClick, /bringToFront|Input\.dispatchMouseEvent/u)
  const canIUseFlow = canIUse.slice(canIUse.indexOf('const wait'), canIUse.indexOf('const paths'))
  assert.doesNotMatch(canIUseFlow, /launcher\.clickSelector\(/u)
  assert.match(packaged, /--use-mock-keychain/u)
  assert.match(packaged, /LAUNCHER_INSTALLED_FIRST_USE_FLAG/u)
  assert.match(installed, /installedFirstUseSession[\s\S]*runCanIUseInstalledSmoke[\s\S]*firstUseOnly: true/u)
  assert.match(installed, /evidence = process\.argv\.includes\(LAUNCHER_INSTALLED_FIRST_USE_FLAG\)\s*\n\s*\? await runInstalledFirstUseSmoke\(artifact\)\s*\n\s*: process\.platform/u)
  assert.match(installed, /directExecutable: identity\.executable/u)
  assert.match(installed, /findFocusProofResidue[\s\S]*observedProcesses/u)
  assert.match(installed, /focusProofDescendants[\s\S]*pathMarkers/u)
  assert.doesNotMatch(installed, /tockteam-trusted-raycast-/u)
  assert.match(installed, /processEvidence[\s\S]*cleanup\(\)/u)
  assert.match(installed, /checkpoints: Object\.freeze\(\{ final: finalCheckpoint, startup: startupCheckpoint \}\)/u)
  assert.match(installed, /launch: Object\.freeze\(\{ argv: Object\.freeze\(\[\.\.\.\(launched\.child\.spawnargs/u)
  assert.match(installed, /cleanupEvidence: cleanup\.processEvidence/u)
  assert.doesNotMatch(canIUseFlow, /Approve and Open/u)
  assert.match(canIUse, /bundled Can I Use was not installed on first launch/u)
  const firstUse = installed.slice(installed.indexOf('async function runInstalledFirstUseSmoke'), installed.indexOf('async function runMacInstalledSmoke'))
  assert.doesNotMatch(firstUse, /processTreesGone: true/u)
  assert.doesNotMatch(installed, /finalCheckpoint\.focusInconclusiveCount/u)
  assert.doesNotMatch(installed, /runSecondInstanceSmoke\([^)]*firstUse/iu)
})

test('first-use cleanup failure preserves the disposable root', () => {
  assert.equal(shouldRemoveInstalledSmokeRoot({ firstUse: true, processTreesGone: false }), false)
  assert.equal(shouldRemoveInstalledSmokeRoot({ firstUse: true, processTreesGone: true }), true)
  assert.equal(shouldRemoveInstalledSmokeRoot({ firstUse: false, processTreesGone: false }), true)
})

test('detached descendant identity remains residue until owned cleanup', () => {
  const before = [{ command: '/usr/bin/other', pgid: 1, pid: 10, ppid: 1 }]
  const observed = [{ command: '/tmp/tockteam-trusted-raycast-unique/child.mjs', pgid: 901, pid: 901, ppid: 900 }]
  const after = [...before, ...observed]
  assert.deepEqual(findFocusProofResidue(before, after, { gatePgid: 900, markers: ['/tmp/tockteam-first-use'], observedDescendants: observed }), observed)
  assert.deepEqual(findFocusProofResidue(before, before, { gatePgid: 900, markers: ['/tmp/tockteam-first-use'], observedDescendants: observed }), [])
})
