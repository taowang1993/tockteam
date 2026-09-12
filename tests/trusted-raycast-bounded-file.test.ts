import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

test('bounded file admission rejects FIFOs without waiting for a writer', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'bounded-file-fifo-')); const fifo = join(root, 'state.json')
  try {
    assert.equal(spawnSync('/usr/bin/mkfifo', [fifo]).status, 0)
    const module = pathToFileURL(resolve('src/trusted-raycast-bounded-file.ts')).href
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import { readBoundedRegularFile } from ${JSON.stringify(module)}; try { readBoundedRegularFile(process.argv[1], 128); process.exit(2) } catch { process.exit(0) }`, fifo], { timeout: 1500, killSignal: 'SIGKILL' })
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
    assert.equal(child.status, 0, child.error?.message ?? child.stderr.toString())
  } finally { rmSync(root, { recursive: true, force: true }) }
})
