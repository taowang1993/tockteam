import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  parseWindowsProcessSnapshot,
  windowsOwnedProcessQuery,
  windowsProcessTreePids,
  windowsTasklistPids,
  stopChildProcess,
} from '../scripts/process-cleanup.mjs'

const cleanupSource = readFileSync(join(import.meta.dirname, '..', 'scripts', 'process-cleanup.mjs'), 'utf8')

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

test('Windows ownership inspection excludes its own PowerShell query process', () => {
  const query = windowsOwnedProcessQuery('C:\\Apps\\TockTeam Desktop.exe', 'C:\\Apps\\TockTeam')
  assert.match(query, /\$ErrorActionPreference = 'Stop'/u)
  assert.match(query, /\$process\.ProcessId -ne \$PID/u)
  assert.match(query, /TockTeam Desktop\.exe/u)
  assert.doesNotMatch(cleanupSource, /tasklist\.exe'[\s\S]{0,200}catch\(\(\) => \(\{ stdout: '' \}\)\)/u)
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
