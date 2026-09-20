#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn, execFile as execCallback } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { ensureElectronInstalled } from './electron-runtime.mjs'
import { stopChildProcess } from './process-cleanup.mjs'
import { createFocusProofClient } from './trusted-raycast-focus-proof-client.ts'

// Real Desktop composition, isolated data, hidden windows, and app-scoped CDP only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evidence = await mkdtemp(join(tmpdir(), 'settings-layout-electron-'))
const userData = join(evidence, 'profile')
await mkdir(userData)
await writeFile(join(userData, 'skins.json'), JSON.stringify({ activeId: null, fallbackTheme: 'dark' }))
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const execFile = promisify(execCallback)
const session = `settings-layout-${process.pid}`
const nonce = randomBytes(32).toString('hex')
const cli = async (...args) => {
  const { stdout } = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 90000, maxBuffer: 8 * 1024 * 1024 })
  await writeFile(join(evidence, 'interactions.txt'), stdout, { flag: 'a' })
  if (stdout.includes('### Error')) throw new Error(stdout)
  return stdout
}
let child, attached = false
try {
  child = spawn(ensureElectronInstalled(root), ['--use-mock-keychain', '.', `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`, '--force-device-scale-factor=2'], {
    cwd: root, detached: true,
    env: { ...process.env, TOCKTEAM_LAUNCHER_INACTIVE_VISUAL_PROOF: '1', TOCKTEAM_LAUNCHER_VISUAL_PROOF_NONCE: nonce, TOCKTEAM_TRUSTED_RAYCAST_DENY_EFFECTS_PROOF: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const client = createFocusProofClient(child, nonce)
  child.stdout.on('data', b => { void writeFile(join(evidence, 'app.log'), b, { flag: 'a' }) })
  child.stderr.on('data', b => { void writeFile(join(evidence, 'app.log'), b, { flag: 'a' }) })
  await client.ready()
  const deadline = Date.now() + 45000
  let ready = false
  while (Date.now() < deadline) {
    ready = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).then(pages => pages.some(p => p.url.startsWith('http://127.0.0.1:'))).catch(() => false)
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'Desktop renderer started')
  await cli('attach', `--cdp=http://127.0.0.1:${port}`); attached = true
  const output = await cli('run-code', (await readFile(join(root, 'scripts/settings-layout-electron-checks.js'), 'utf8')).replaceAll('EVIDENCE_DIRECTORY', evidence))
  const proof = JSON.parse(output.split('### Result\n')[1].split('\n### ')[0])
  await writeFile(join(evidence, 'proof.json'), JSON.stringify(proof, null, 2))
  const focus = await client.checkpoint('settings-layout')
  await writeFile(join(evidence, 'focus.json'), JSON.stringify(focus))
  assert.equal(focus.focusedWindowCount, 0, 'verification never focuses a Desktop window')
  console.log(JSON.stringify(proof, null, 2))
  assert.deepEqual(proof.captures.map(c => c.file), [
    'general.png', 'models.png', 'plugins-marketplace.png', 'plugins-plugin-config.png',
    'plugins-plugin-list.png', 'agent-presets.png', 'side-panel.png', 'tocklauncher.png',
  ], 'capture every settings page and Plugins tab')
  for (const capture of proof.captures) {
    const png = await readFile(join(evidence, capture.file))
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [3024, 1898])
  }
  assert.deepEqual(proof.failures, [], 'all settings titles share the same origin and geometry')
} finally {
  if (attached) await cli('detach').catch(() => {})
  if (child) await stopChildProcess(child)
  await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ electronPid: child?.pid, processTreeStopped: true }))
  console.log(JSON.stringify({ evidence }))
}
