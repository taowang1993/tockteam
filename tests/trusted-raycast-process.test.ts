import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
// @ts-expect-error JavaScript helper is exercised as an executable process seam.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'

test('owned child stop escalates when necessary and waits for process closure', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write('READY\\n')"])
  const closed = new Promise<NodeJS.Signals | null>(resolve => child.once('close', (_code, signal) => resolve(signal)))
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('child did not become ready')), 5000)
      child.once('error', reject)
      child.stdout?.on('data', chunk => { if (chunk.toString().includes('READY')) { clearTimeout(timer); resolve() } })
    })
    await stopOwnedChild(child, 20)
    const signal = await closed
    // Windows force-terminates on either signal; POSIX must escalate past the installed handler.
    if (process.platform === 'win32') assert.ok(signal === 'SIGTERM' || signal === 'SIGKILL')
    else assert.equal(signal, 'SIGKILL')
    assert.equal(child.signalCode, signal)
  } finally {
    clearTimeout(timer)
    await stopOwnedChild(child, 20)
  }
})
