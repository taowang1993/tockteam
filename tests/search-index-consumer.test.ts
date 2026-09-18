import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { stopChildProcess } from '../scripts/process-cleanup.mjs'

for (const signal of ['SIGINT', 'SIGTERM'] as const) test(`${signal} drains the detached consumer command and removes its credential copy`, { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'consumer-interrupt-test-'))
  const home = join(root, 'source'), temporary = join(root, 'temporary'), receipt = join(root, 'proof.json')
  await mkdir(home); await mkdir(temporary)
  await writeFile(join(home, '.env'), 'NON_SECRET_TEST_FIXTURE=1\n', { mode: 0o600 })
  const child = spawn(process.execPath, ['scripts/test-search-index-consumer.mjs', receipt, '--interrupt-control'], {
    env: { ...process.env, DSH_HOME: home, TMPDIR: temporary }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  })
  const pids: number[] = []
  let stdout = '', stderr = ''
  child.stdout.on('data', chunk => {
    stdout += chunk
    for (const line of stdout.split('\n').slice(0, -1)) {
      const entry = JSON.parse(line)
      if (entry.phase && !pids.includes(entry.pid)) { assert.ok(Number.isSafeInteger(entry.pid) && entry.pid > 1); pids.push(entry.pid); child.kill(signal) }
    }
  })
  child.stderr.on('data', chunk => { stderr += chunk })
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15000)
  try {
    const result = await new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }))
    })
    assert.deepEqual(result, { code: 1, signal: null }, stderr)
    assert.equal(pids.length, 1)
    const proof = JSON.parse(await readFile(receipt, 'utf8'))
    assert.equal(proof.accepted, false)
    assert.equal(proof.credentialCopyRemoved, true)
    assert.equal(proof.emergencyCleanup, false)
    for (const directory of await readdir(temporary)) assert.equal(existsSync(join(temporary, directory, 'home')), false)
    for (const pid of pids) assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
  } finally {
    clearTimeout(timeout)
    // Also clean the intentional RED version, where default SIGTERM bypasses finally.
    for (const pid of [...pids, child.pid!]) { try { process.kill(-pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
    for (const pid of pids) {
      for (let check = 0; check < 50; check++) {
        try { process.kill(-pid, 0) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') break }
        await delay(20)
      }
      assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
    }
    await rm(root, { recursive: true, force: true })
  }
})

// Opt-in: uses the configured credential, fresh packages, and two real model tasks.
test('a signal during successful consumer finalization cannot publish acceptance', {
  skip: process.platform !== 'darwin' || process.env.TOCKTEAM_INDEX_CONSUMER_MODEL !== '1',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'consumer-finalization-test-'))
  const preload = join(root, 'interrupt.mjs'), receipt = join(root, 'proof.json')
  await writeFile(preload, `
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
const remove = fs.promises.rm
let interrupted = false
fs.promises.rm = async function (path, options) {
  if (!interrupted && String(path).includes('/tockteam-index-consumer-') && String(path).endsWith('/home')) {
    interrupted = true
    process.kill(process.pid, 'SIGTERM')
    await delay(50)
  }
  return remove(path, options)
}
syncBuiltinESMExports()
`)
  const child = spawn(process.execPath, ['--import', preload, 'scripts/test-search-index-consumer.mjs', receipt], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', timer: ReturnType<typeof setTimeout> | undefined
  child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.resume()
  try {
    const outcome = await Promise.race([
      new Promise(resolve => { child.once('error', error => resolve({ error })); child.once('close', (code, signal) => resolve({ code, signal })) }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Consumer finalization control timed out')), 360000) }),
    ])
    assert.deepEqual(outcome, { code: 1, signal: null })
    const proof = JSON.parse(await readFile(receipt, 'utf8'))
    assert.equal(proof.accepted, false)
    assert.equal(proof.failure, 'Consumer interrupted')
    assert.equal(proof.calls.length, 2, 'Both real model tasks must pass before this signal')
    assert.equal(proof.credentialCopyRemoved, true)
    assert.equal(proof.fixtureRemoved, true)
    assert.equal(proof.emergencyCleanup, false)
    assert.equal(JSON.parse(stdout.trim().split('\n').at(-1)!).accepted, false)
  } finally { clearTimeout(timer); await stopChildProcess(child, 20000); await rm(root, { recursive: true, force: true }) }
})
