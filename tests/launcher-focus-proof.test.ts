import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { installLauncherFocusProof, type LauncherFocusProofMessage } from '../src/launcher-focus-proof.ts'

const nonce = 'a'.repeat(64)

class FakeApp extends EventEmitter {
  exits: number[] = []
  exit(code = 0): void { this.exits.push(code) }
}
class FakeWindow extends EventEmitter {
  destroyed = false
  constructor(readonly id: number, private focused = false) { super() }
  destroy(): void { this.destroyed = true }
  isFocused(): boolean { return this.focused }
  setFocused(value: boolean): void { this.focused = value }
}
class FakeChannel extends EventEmitter {
  connected = true
  sent: LauncherFocusProofMessage[] = []
  callbacks: Array<(error: Error | null) => void> = []
  send(message: LauncherFocusProofMessage, callback: (error: Error | null) => void): boolean { this.sent.push(message); this.callbacks.push(callback); return true }
  flush(error: Error | null = null): void { this.callbacks.shift()?.(error) }
}

function setup(windows: FakeWindow[] = []) {
  const app = new FakeApp(); const channel = new FakeChannel(); const scheduled: Array<() => void> = []; const emergencyExits: number[] = []
  const proof = installLauncherFocusProof({ app, channel, enabled: true, getAllWindows: () => windows, nonce, scheduleExit: callback => { scheduled.push(callback) }, shutdown: code => { app.exit(code) }, emergencyExit: code => { emergencyExits.push(code) } })
  return { app, channel, emergencyExits, proof, scheduled, windows }
}

test('main installs the side-effect-free focus seam before bootstrap or any BrowserWindow construction', async () => {
  const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
  const seam = await readFile(new URL('../src/launcher-focus-proof.ts', import.meta.url), 'utf8')
  const install = main.indexOf('installLauncherFocusProof({')
  assert.ok(install >= 0 && install < main.indexOf('new BrowserWindow(') && install < main.indexOf('void bootstrap()'))
  assert.match(main, /emergencyExit: code => \{ const timer = setTimeout\(\(\) => \{ app\.exit\(code\) \}, 5_000\); timer\.unref\(\) \}/u)
  assert.match(main, /shutdown: \(\) => \{ void requestSecureQuit\('visual-proof'\) \}/u)
  const src = new URL('../src/', import.meta.url)
  for (const path of await readdir(src, { recursive: true })) if (/\.[cm]?tsx?$/u.test(path) && path !== 'main.ts') assert.doesNotMatch(await readFile(new URL(path, src), 'utf8'), /new BrowserWindow\s*\(/u, `${path} constructs a BrowserWindow before the focus seam can be installed`)
  assert.doesNotMatch(seam, /from ['"]electron['"]|new BrowserWindow|app\.activate|\.focus\(\)/u)
})

test('normal Desktop mode installs no proof listeners or IPC authority', () => {
  const app = new FakeApp(); const channel = new FakeChannel()
  const proof = installLauncherFocusProof({ app, channel, emergencyExit: code => { app.exit(code) }, enabled: false, getAllWindows: () => [], nonce: undefined, scheduleExit: callback => callback(), shutdown: code => { app.exit(code) } })
  assert.equal(proof.enabled, false); assert.equal(app.eventNames().length, 0); assert.equal(channel.eventNames().length, 0); assert.deepEqual(channel.sent, [])
})

test('installs app and per-window listeners before READY and latches pre-handshake activation', () => {
  const app = new FakeApp(); const channel = new FakeChannel(); const window = new FakeWindow(7)
  app.on('newListener', event => { if (event === 'browser-window-created' && app.listenerCount('activate') === 1) app.emit('activate') })
  installLauncherFocusProof({ app, channel, emergencyExit: code => { app.exit(code) }, enabled: true, getAllWindows: () => [window], nonce, scheduleExit: callback => callback(), shutdown: code => { app.exit(code) } })
  assert.equal(app.listenerCount('activate'), 1)
  assert.equal(app.listenerCount('browser-window-focus'), 1)
  assert.equal(app.listenerCount('browser-window-created'), 1)
  assert.deepEqual(channel.sent.map(message => message.type), ['FOCUS_FAULT', 'READY'])
  assert.equal(channel.sent[1]!.focusFaultCount, 1)
  app.emit('browser-window-created', {}, window)
  assert.equal(window.listenerCount('focus'), 1)
})

test('app activation with zero focused windows and transient window focus stay sticky', () => {
  const state = setup([]); state.channel.flush()
  state.app.emit('activate')
  const window = new FakeWindow(9); state.app.emit('browser-window-created', {}, window); window.emit('focus')
  state.channel.emit('message', { channel: 'tockteam-launcher-focus-proof', command: 'CHECKPOINT', nonce, sequence: 1 })
  assert.deepEqual(state.channel.sent.map(message => message.type), ['READY', 'FOCUS_FAULT', 'FOCUS_FAULT', 'CHECKPOINT_ACK'])
  const checkpoint = state.channel.sent.at(-1)!; assert.equal(checkpoint.focusFaultCount, 2); assert.equal(checkpoint.faulted, true)
})

test('nonce and command sequence violations reject shutdown while preserving cleanup', () => {
  const state = setup(); state.channel.flush()
  state.channel.emit('message', { channel: 'tockteam-launcher-focus-proof', command: 'CHECKPOINT', nonce: 'b'.repeat(64), sequence: 1 })
  state.channel.emit('message', { channel: 'tockteam-launcher-focus-proof', command: 'SHUTDOWN', nonce, sequence: 1 })
  assert.equal(state.channel.sent.at(-1)!.type, 'SHUTDOWN_REJECTED')
  state.channel.flush(); state.scheduled.shift()?.()
  assert.deepEqual(state.app.exits, [1])
})

test('focus after shutdown ACK is flushed and forces a failing exit', () => {
  const window = new FakeWindow(3); const state = setup([window]); state.channel.flush()
  state.channel.emit('message', { channel: 'tockteam-launcher-focus-proof', command: 'SHUTDOWN', nonce, sequence: 1 })
  assert.equal(state.channel.sent.at(-1)!.type, 'SHUTDOWN_ACK')
  window.emit('focus')
  state.channel.flush(); state.channel.flush(); state.scheduled.shift()?.()
  assert.deepEqual(state.channel.sent.map(message => message.type), ['READY', 'SHUTDOWN_ACK', 'FOCUS_FAULT'])
  assert.deepEqual(state.app.exits, [1])
})

test('ACK send failure and parent disconnect exit fail closed', () => {
  const ackFailure = setup(); ackFailure.channel.flush(); ackFailure.channel.emit('message', { channel: 'tockteam-launcher-focus-proof', command: 'SHUTDOWN', nonce, sequence: 1 })
  ackFailure.channel.flush(new Error('closed')); ackFailure.scheduled.shift()?.(); assert.deepEqual(ackFailure.app.exits, [1])
  const disconnected = setup(); disconnected.channel.emit('disconnect'); assert.deepEqual(disconnected.app.exits, [1])
})

test('parent disconnect forces exit when acknowledged secure teardown has stalled', () => {
  const state = setup(); state.channel.flush()
  state.channel.emit('message', { channel: 'tockteam-launcher-focus-proof', command: 'SHUTDOWN', nonce, sequence: 1 })
  state.channel.flush(); state.scheduled.shift()?.(); assert.deepEqual(state.app.exits, [0])
  state.channel.emit('disconnect')
  assert.deepEqual(state.emergencyExits, [1])
})
