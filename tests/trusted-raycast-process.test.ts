import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
// @ts-expect-error JavaScript helper is exercised as an executable process seam.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'

test('owned child stop escalates and waits for a non-cooperative process', async () => {
  const child = spawn(process.execPath, ['-e', "process.stdout.write('READY\\n'); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"])
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child did not become ready')), 1000)
    child.stdout?.on('data', chunk => { if (chunk.toString().includes('READY')) { clearTimeout(timer); resolve() } })
  })
  const closed = new Promise<number | null>(resolve => child.once('close', (_code, signal) => resolve(signal === 'SIGKILL' ? 9 : null)))
  await stopOwnedChild(child, 20)
  assert.equal(await closed, 9)
  assert.equal(child.signalCode, 'SIGKILL')
})
