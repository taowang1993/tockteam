import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Test-only, read-only stack sampling. No suspension, heap dumps, shell commands, or network symbols.
export function captureNativeStack(debuggerPath: string) {
  assert.equal(process.platform, 'win32')
  const cwd = mkdtempSync(join(tmpdir(), 'tockteam-native-stack-'))
  try {
    return spawnSync(debuggerPath, [
      '-pvr', '-pd', '-noshell', '-nosqm', '-sins', '-netsyms:no',
      '-y', cwd, '-p', String(process.pid), '-c', '~* k; q',
    ], {
      cwd, encoding: 'utf8', windowsHide: true,
      timeout: 5_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
      env: { SystemRoot: process.env.SystemRoot, TEMP: cwd, TMP: cwd },
    })
  } finally {
    rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

// Real Windows preflight: sample an owned Node process with a blocked worker,
// then prove both the parent and worker can continue after CDB exits.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const debuggerPath = process.env.TOCKTEAM_NATIVE_DEBUGGER
  assert.ok(debuggerPath)
  const { Worker } = await import('node:worker_threads')
  const shared = new SharedArrayBuffer(4)
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    parentPort.postMessage('waiting');
    Atomics.wait(new Int32Array(workerData), 0, 0);
    parentPort.postMessage('resumed');
  `, { eval: true, workerData: shared })
  try {
    assert.deepEqual(await once(worker, 'message'), ['waiting'])
    const result = captureNativeStack(debuggerPath)
    console.log(JSON.stringify({ ownerPid: process.pid, debuggerPid: result.pid, status: result.status, signal: result.signal, error: result.error?.message }))
    console.log(result.stdout ?? '')
    console.error(result.stderr ?? '')
    assert.equal(result.status, 0)
    assert.match(result.stdout ?? '', /Child-SP\s+RetAddr/u)
    const resumed = once(worker, 'message')
    Atomics.store(new Int32Array(shared), 0, 1)
    Atomics.notify(new Int32Array(shared), 0)
    assert.deepEqual(await resumed, ['resumed'])
    console.log('Native stack preflight passed; parent and worker resumed.')
  } finally {
    await worker.terminate()
  }
}
