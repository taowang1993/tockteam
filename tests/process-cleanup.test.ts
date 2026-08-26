import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { stopChildProcess } from '../scripts/process-cleanup.mjs'

test('child cleanup handles prior signals and escalates ignored termination', async () => {
  const signalled = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
  await new Promise<void>(resolve => { signalled.once('spawn', resolve) })
  const closed = new Promise<void>(resolve => { signalled.once('close', () => { resolve() }) })
  signalled.kill('SIGKILL')
  await closed
  await stopChildProcess(signalled, 20, 20)

  if (process.platform === 'win32') return
  const stubborn = spawn(process.execPath, ['-e', [
    "process.on('SIGTERM', () => {})",
    "process.stdout.write('ready')",
    'setInterval(() => {}, 1000)',
  ].join(';')], { stdio: ['ignore', 'pipe', 'ignore'] })
  await new Promise<void>(resolve => { stubborn.stdout.once('data', () => { resolve() }) })
  await stopChildProcess(stubborn, 20, 500)
  assert.notEqual(stubborn.signalCode, null)
})
