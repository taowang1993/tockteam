import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyTrustedRaycastText } from '../src/trusted-raycast-clipboard-proof.ts'

const exec = promisify(execFile)
test('production Copy delegates exact text, verifies readback and propagates native failures', async () => {
  const writes: string[] = []
  await copyTrustedRaycastText('controlled', { writeText: text => { writes.push(text) }, readText: () => 'controlled' })
  assert.deepEqual(writes, ['controlled'])
  await assert.rejects(copyTrustedRaycastText('controlled', { writeText() { throw new Error('denied') }, readText: () => '' }), /denied/)
  await assert.rejects(copyTrustedRaycastText('controlled', { writeText() {}, readText: () => '' }), /not accepted/)
})

test('same Swift owner rejects delayed/expired/exited/replayed Copy before any native mutation', { skip: process.platform !== 'darwin', timeout: 30000 }, async () => {
  // --self-test uses an in-memory fake pasteboard; never accesses NSPasteboard.general.
  const result = await exec('/usr/bin/swift', ['scripts/trusted-raycast-clipboard-proof.swift', '--self-test'], { timeout: 20000 })
  assert.match(result.stdout, /SELF_TEST_OK delayed expiry exit replay restoration failure external change/)
})
