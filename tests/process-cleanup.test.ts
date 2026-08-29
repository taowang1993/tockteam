import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import {
  parseWindowsProcessSnapshot,
  windowsProcessTreePids,
  windowsTasklistPids,
  stopChildProcess,
} from '../scripts/process-cleanup.mjs'

test('Windows process snapshots retain root and descendant ownership', () => {
  const snapshot = parseWindowsProcessSnapshot(JSON.stringify([
    { ProcessId: 10, ParentProcessId: 1 },
    { ProcessId: 12, ParentProcessId: 11 },
    { ProcessId: 11, ParentProcessId: 10 },
    { ProcessId: 99, ParentProcessId: 10_000 },
  ]))
  assert.deepEqual(windowsProcessTreePids(snapshot, 10), [10, 11, 12])
  assert.deepEqual([...windowsTasklistPids('"root.exe","10","Console","1","1 K"\n"other.exe","99","Console","1","1 K"')], [10, 99])
  assert.deepEqual(parseWindowsProcessSnapshot('{malformed'), [])
})

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
