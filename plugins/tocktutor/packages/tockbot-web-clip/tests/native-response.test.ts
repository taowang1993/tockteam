import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const fixture = fileURLToPath(new URL('./fixtures/native-response.mjs', import.meta.url))

for (const status of [200, 204, 205, 304, 404, 600]) {
  test(`native HTTP ${status} responses settle without crashing the Host`, t => {
    const child = spawnSync(process.execPath, [fixture, String(status)], { timeout: 5_000, encoding: 'utf8' })
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
    t.diagnostic(`Local HTTP fixture process ${child.pid} stopped; it spawned no descendants.`)
    assert.equal(child.error, undefined)
    assert.equal(child.status, 0, child.stderr)
  })
}
