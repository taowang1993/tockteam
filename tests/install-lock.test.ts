import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { acquireInstallLock } from '../scripts/install-lock.mjs'

for (const live of [false, true]) test(`installer ${live ? 'preserves live' : 'recovers abandoned'} recovery ownership`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'launcher-install-lock-'))
  const lock = join(root, 'lock')
  try {
    await mkdir(join(lock, '.recovery'), { recursive: true })
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ createdAt: Date.now(), pid: 2147483647 }))
    await writeFile(join(lock, '.recovery', 'owner.json'), JSON.stringify({ createdAt: Date.now(), pid: live ? process.pid : 2147483647 }))
    if (live) await assert.rejects(acquireInstallLock(lock, 'busy'), /busy/u)
    else {
      await acquireInstallLock(lock, 'busy')
      assert.equal(JSON.parse(await readFile(join(lock, 'owner.json'), 'utf8')).pid, process.pid)
      await assert.rejects(readFile(join(lock, '.recovery', 'owner.json')), /ENOENT/u)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
