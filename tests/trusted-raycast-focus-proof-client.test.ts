import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createFocusProofClient, findFocusProofResidue, focusProofDescendants, readFocusProofProcessSnapshot, type FocusProofChild } from '../scripts/trusted-raycast-focus-proof-client.ts'
import { isTrustedRaycastKaomojiSvg } from '../src/trusted-raycast-contract.ts'

const nonce = 'b'.repeat(64)
class FakeChild extends EventEmitter implements FocusProofChild {
  connected = true
  pid = 900
  commands: unknown[] = []
  disconnect(): void { this.connected = false; this.emit('disconnect'); this.emit('close', 1, null) }
  send(message: unknown, callback: (error: Error | null) => void): boolean { this.commands.push(message); callback(null); return true }
}
const ready = (sequence = 1) => ({ channel: 'tockteam-launcher-focus-proof', faulted: false, focusInconclusiveCount: 0, nonce, sequence, type: 'READY' })
const checkpoint = (requestSequence: number, sequence: number) => ({ channel: 'tockteam-launcher-focus-proof', faulted: false, focusInconclusiveCount: 0, focusedWindowCount: 0, nonce, requestSequence, sequence, type: 'CHECKPOINT_ACK', windows: [] })

test('Electron harness uses inherited IPC shutdown and read-only bounded residue checks', async () => {
  const harness = await readFile(new URL('../scripts/trusted-raycast-kaomoji-electron-proof.mts', import.meta.url), 'utf8')
  const renderer = await readFile(new URL('../src/trusted-raycast-renderer.ts', import.meta.url), 'utf8')
  assert.match(renderer, /key\.setAttribute\('aria-hidden', 'true'\)/u)
  assert.doesNotMatch(harness, /getByLabel\('Search Kaomoji'\)|allTextContents\(\)/u)
  assert.match(harness, /getByRole\('searchbox', \{ name: 'Search Kaomoji', exact: true \}\)/u)
  assert.match(harness, /menu\.getByRole\('button', \{ name, exact: true \}\)/u)
  assert.match(harness, /named\.and\(buttons\.nth\(candidate\)\)/u)
  assert.match(harness, /const before = \{ backVisible: await back\.isVisible\(\), formVisible: await form\.isVisible\(\), searchVisible: await searchbox\.isVisible\(\) \}/u)
  assert.match(harness, /searchFocused: await searchbox\.evaluate\(node => node === document\.activeElement\)/u)
  assert.match(harness, /isTrustedRaycastKaomojiSvg\(source, '#fff'\)/u)
  assert.match(harness, /isTrustedRaycastKaomojiSvg\(source, '#000'\)/u)
  assert.doesNotMatch(harness, /isTrustedRaycastKaomojiSvg\(Buffer\.from|isTrustedRaycastKaomojiSvg\(source\)/u)
  assert.match(harness, /stdio: \['ignore', 'pipe', 'pipe', 'ipc'\]/u)
  assert.match(harness, /TOCKTEAM_LAUNCHER_VISUAL_PROOF_NONCE: focusProofNonce/u)
  assert.match(harness, /createFocusProofClient\(electronChild, focusProofNonce\)/u)
  assert.match(harness, /shutdownAndWait\(\)[\s\S]*findFocusProofResidue/u)
  assert.match(harness, /Final Kaomoji evidence already exists/u)
  assert.match(harness, /publishTrustedRaycastProofExclusive\(evidence, finalEvidence\)/u)
  assert.doesNotMatch(harness, /process\.kill|stopChildProcess|assertProcessTreeGone|System Events|rm\(finalEvidence|renameSync\(evidence, finalEvidence/u)
})

test('every source extension proof launch isolates macOS Keychain, including restart and toggle', async () => {
  for (const [file, count] of [
    ['trusted-raycast-can-i-use-electron-proof.mts', 1],
    ['trusted-raycast-kaomoji-electron-proof.mts', 1],
    ['launcher-electron-smoke.mjs', 3],
  ] as const) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8')
    const launches = [...source.matchAll(/spawn\((?:electron|ensureElectronInstalled\(repository\)),\s*\[([\s\S]*?)\],\s*\{/gu)]
    assert.equal(launches.length, count, `${file}: cover every Electron launch site`)
    for (const launch of launches) {
      assert.match(launch[1]!, /\.\.\.\(process\.platform === 'darwin' \? \['--use-mock-keychain'\] : \[\]\)/u, `${file}: native macOS-only mock Keychain must reach actual argv`)
    }
    assert.doesNotMatch(source, /\b(?:HOME|USERPROFILE)\s*[:=]/u, `${file}: preserve the real home environment`)
  }
})

test('inactive Electron proof windows cannot accept focus and avoid implicit maximize activation', async () => {
  const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.equal(main.match(/focusable: !launcherInactiveVisualProofEnabled/g)?.length, 2)
  assert.match(main, /options.preview !== true && !launcherInactiveVisualProofEnabled\) window.maximize\(\)/)
})

test('Electron proof validates canonical Kaomoji data URLs with their rendered theme fill', () => {
  const decoded = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" >\n  <text dominant-baseline="middle" x="45" y="45" text-anchor="middle" fill="#fff" font-size="8px" text-length="90" length-adjust="spacing">\n    &#40;&#94;&#95;&#94;&#41;\n  </text>\n</svg>'
  const source = `data:image/svg+xml;base64,${Buffer.from(decoded).toString('base64')}`
  assert.equal(isTrustedRaycastKaomojiSvg(source, '#fff'), true)
  assert.equal(isTrustedRaycastKaomojiSvg(source, '#000'), false)
  assert.equal(isTrustedRaycastKaomojiSvg(decoded, '#fff'), false)
  assert.equal((isTrustedRaycastKaomojiSvg as (value: unknown, fill?: '#000' | '#fff') => boolean)(source), false)
})

test('attaches before READY and authenticates monotonic checkpoint traffic', async () => {
  const child = new FakeChild(); const client = createFocusProofClient(child, nonce, { timeoutMs: 100 })
  child.emit('message', ready()); await client.ready()
  const pending = client.checkpoint('workbench-ready'); child.emit('message', checkpoint(1, 2))
  assert.equal((await pending).checkpoint, 'workbench-ready')
  assert.deepEqual(child.commands, [{ channel: 'tockteam-launcher-focus-proof', command: 'CHECKPOINT', nonce, sequence: 1 }])
})

test('child process errors reject READY without an unhandled error event', async () => {
  const child = new FakeChild(); const client = createFocusProofClient(child, nonce, { timeoutMs: 20 })
  child.emit('error', new Error('spawn failed'))
  await assert.rejects(() => client.ready(), /Focus proof child process failed/u)
})

test('rejects malformed, replayed, wrong-nonce, and overflowed responses', async () => {
  for (const message of [
    { ...ready(), nonce: 'c'.repeat(64) },
    { ...ready(), extra: true },
    [ready()],
  ]) {
    const child = new FakeChild(); const client = createFocusProofClient(child, nonce, { timeoutMs: 20 }); child.emit('message', message)
    await assert.rejects(() => client.ready(), /focus proof protocol/u)
  }
  const child = new FakeChild(); const client = createFocusProofClient(child, nonce, { maxMessages: 1, timeoutMs: 20 }); child.emit('message', ready()); child.emit('message', { ...ready(), sequence: 2 })
  await assert.rejects(() => client.assertClean(), /bound|protocol/u)
})

test('gate-app focus after shutdown ACK remains inconclusive until exact child close', async () => {
  const child = new FakeChild(); const client = createFocusProofClient(child, nonce, { timeoutMs: 100 }); child.emit('message', ready()); await client.ready()
  const closing = client.shutdownAndWait()
  child.emit('message', { channel: 'tockteam-launcher-focus-proof', faulted: false, focusInconclusiveCount: 0, nonce, requestSequence: 1, sequence: 2, type: 'SHUTDOWN_ACK' })
  child.emit('message', { channel: 'tockteam-launcher-focus-proof', faulted: true, focusInconclusiveCount: 1, kind: 'window-focus', nonce, sequence: 3, type: 'FOCUS_INCONCLUSIVE', windowId: 3 })
  child.emit('close', 1, null)
  await assert.rejects(closing, /gate-app focus made proof inconclusive/u)
})

test('shutdown timeout disconnects the identity-owned channel and awaits close', async () => {
  const child = new FakeChild(); const client = createFocusProofClient(child, nonce, { timeoutMs: 20 }); child.emit('message', ready()); await client.ready()
  await assert.rejects(() => client.shutdownAndWait(), /shutdown acknowledgment timeout/u)
  assert.equal(child.connected, false)
})

test('child-close timeout disconnects after ACK and still observes exact close', async () => {
  const child = new FakeChild(); const client = createFocusProofClient(child, nonce, { timeoutMs: 20 }); child.emit('message', ready()); await client.ready()
  const closing = client.shutdownAndWait()
  child.emit('message', { channel: 'tockteam-launcher-focus-proof', faulted: false, focusInconclusiveCount: 0, nonce, requestSequence: 1, sequence: 2, type: 'SHUTDOWN_ACK' })
  await assert.rejects(closing, /child close timeout/u)
  assert.equal(child.connected, false)
  assert.equal(client.closed, true)
})

test('strict read-only process snapshots include the current test owner', { skip: process.platform === 'win32' ? 'POSIX /bin/ps process snapshot is unsupported on Windows' : false }, async () => {
  const rows = await readFocusProofProcessSnapshot()
  assert.ok(rows.some(row => row.pid === process.pid && row.command.length > 0))
})

test('residue detection covers original PGID and newly detached marker processes', () => {
  const baseline = [{ command: '/usr/bin/Code', pgid: 1, pid: 10, ppid: 1 }]
  assert.deepEqual(findFocusProofResidue(baseline, baseline, { gatePgid: 900, markers: ['/proof-root'] }), [])
  const live = [
    ...baseline,
    { command: '/Electron', pgid: 900, pid: 900, ppid: process.pid },
    { command: '/detached-runtime', pgid: 999, pid: 903, ppid: 900 },
  ]
  const observedDescendants = focusProofDescendants(live, 900)
  const residue = findFocusProofResidue(baseline, [
    ...baseline,
    { command: '/Electron Helper --type=renderer', pgid: 900, pid: 901, ppid: 1 },
    { command: '/helper --state=/proof-root', pgid: 999, pid: 902, ppid: 1 },
    { command: '/detached-runtime', pgid: 999, pid: 903, ppid: 1 },
  ], { gatePgid: 900, markers: ['/proof-root'], observedDescendants })
  assert.deepEqual(residue.map(row => row.pid), [901, 902, 903])
})
