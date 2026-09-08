import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
// @ts-expect-error JavaScript owned-process helper.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'

test('Translate group cleanup kills descendants even when their leader has exited', { skip: process.platform === 'win32', timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(child.pid); child.unref()`], { detached: true })
  let descendant = 0
  try {
    descendant = await new Promise<number>((resolve, reject) => { child.stdout.once('data', data => resolve(Number(data.toString().trim()))); child.once('error', reject) })
    await new Promise(resolve => child.once('close', resolve))
    assert.ok(descendant > 0)
    await stopOwnedChild(child, 30, true)
    assert.throws(() => process.kill(descendant, 0), { code: 'ESRCH' })
  } finally {
    try { process.kill(-child.pid!, 'SIGKILL') } catch {}
  }
})

test('intentional owner close tears down silently instead of rendering an internal lifecycle error', { timeout: 5000 }, async () => {
  const { TrustedRaycastManager } = await import('../src/trusted-raycast-manager.ts')
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const workspace = mkdtempSync(join(tmpdir(), 'raycast-owner-close-'))
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true })
  const owner = { webContentsId: 1 }
  const messages: unknown[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage: (_owner, message) => messages.push(message) })
  Reflect.set(manager, 'session', { child, owner, input: { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: {} }, workspace, revision: 0, querySequence: 0, eventId: '', actions: new Map(), fields: new Map(), reject() {} })
  try {
    await manager.closeOwner(owner)
    assert.deepEqual(messages, [])
  } finally { await stopOwnedChild(child, 30, true); rmSync(workspace, { recursive: true, force: true }) }
})

test('failed termination retains workspace and child ownership, revokes input, and permits close retry', { timeout: 5000 }, async t => {
  const { TrustedRaycastManager } = await import('../src/trusted-raycast-manager.ts')
  const { mkdtempSync, existsSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const workspace = mkdtempSync(join(tmpdir(), 'raycast-stop-fault-'))
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true })
  const owner = { webContentsId: 1 }
  const input = { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate' as const, preferences: {} }
  const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage() {} })
  // Seed only the owned-process boundary; no fixture is admitted as an extension.
  Reflect.set(manager, 'session', { child, owner, input, workspace, revision: 0, eventId: 'e', reject() {} })
  const kill = process.kill.bind(process)
  let deny = true
  t.mock.method(process, 'kill', (pid: number, signal?: NodeJS.Signals | number) => {
    if (pid === -child.pid! && deny) throw new Error('injected termination failure')
    return kill(pid, signal)
  })
  try {
    await assert.rejects(manager.closeOwner(owner), /injected/)
    assert.equal(existsSync(workspace), true)
    await assert.rejects(manager.start(owner, input), /busy/)
    assert.throws(() => manager.send(owner, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 0, eventId: 'e', kind: 'searchChanged', value: 'latest' }), /stale/)
    deny = false
    await manager.closeOwner(owner)
    assert.equal(existsSync(workspace), false)
    assert.equal(manager.active, false)
  } finally { deny = false; await stopOwnedChild(child, 30, true); rmSync(workspace, { recursive: true, force: true }) }
})
