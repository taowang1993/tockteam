import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
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

// Execute the production Unix branch with a stubbed probe; never enumerate or signal real processes.
test('Unix process-tree inspection accepts only no-match and bounds failed probes', async t => {
  const source = cleanupSource.slice(
    cleanupSource.indexOf('export async function assertProcessTreeGone('),
    cleanupSource.indexOf('export async function stopChildProcess('),
  ).replace('export ', '')
  const noMatch = Object.assign(new Error('no match'), { code: 1, killed: false, signal: null })
  const cases = [
    { name: 'no-match', error: noMatch, absent: true },
    { name: 'timeout', error: Object.assign(new Error('timed out'), { code: null, killed: true, signal: 'SIGKILL' }), absent: false },
    { name: 'killed-exit-one', error: Object.assign(new Error('killed'), { code: 1, killed: true, signal: 'SIGKILL' }), absent: false },
    { name: 'signalled-exit-one', error: Object.assign(new Error('signalled'), { code: 1, killed: false, signal: 'SIGTERM' }), absent: false },
    { name: 'spawn-failure', error: Object.assign(new Error('missing pgrep'), { code: 'ENOENT' }), absent: false },
    { name: 'permission-failure', error: Object.assign(new Error('denied'), { code: 'EACCES' }), absent: false },
    { name: 'other-exit', error: Object.assign(new Error('pgrep failed'), { code: 2, killed: false, signal: null }), absent: false },
    { name: 'incomplete-exit-one', error: Object.assign(new Error('unknown'), { code: 1 }), absent: false },
  ]
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let options: { timeout?: number, killSignal?: string } | undefined
      let calls = 0
      const inspect = runInNewContext(`${source}\nassertProcessTreeGone`, {
        process: { platform: 'darwin' },
        execFileAsync: async (file: string, args: string[], probeOptions: typeof options) => {
          calls += 1
          assert.equal(file, '/usr/bin/pgrep')
          assert.deepEqual(Array.from(args), ['-g', '123'])
          options = probeOptions
          throw scenario.error
        },
        setTimeout,
      })
      if (scenario.absent) await inspect({ pid: 123 })
      else await assert.rejects(() => inspect({ pid: 123 }), error => error === scenario.error)
      assert.equal(calls, 1, 'failed inspection must not retry or certify absence')
      assert.equal(options?.timeout, 2000)
      assert.equal(options?.killSignal, 'SIGKILL')
    })
  }
  await t.test('successful probe is not no-match, even with empty output', async () => {
    const inspect = runInNewContext(`${source}\nassertProcessTreeGone`, {
      process: { platform: 'linux' }, execFileAsync: async () => ({ stdout: '' }), setTimeout,
    })
    await assert.rejects(() => inspect({ pid: 123 }, 1), /process tree for 123 did not stop/u)
  })
})
