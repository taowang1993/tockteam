import assert from 'node:assert/strict'
import test from 'node:test'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performDesktopOpenPath } from '../src/desktop-open-path-native.ts'

for (const extension of ['md', 'markdown']) test(`default-app dispatch accepts bound non-executable .${extension} documents and reports OS failures`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-open-path-'))
  try {
    const file = join(root, `中文 Notes #1.${extension}`)
    await writeFile(file, '# Note')
    const canonicalPath = await realpath(file)
    const stats = await lstat(file, { bigint: true })
    const input = { canonicalPath, identity: { dev: String(stats.dev), ino: String(stats.ino) }, kind: 'file', operationId: 'open-1', vaultGeneration: 4, vaultId: 'vault-1' }
    const opened: string[] = []
    const operations = { openPath: async (path: string) => { opened.push(path); return '' } }
    assert.deepEqual(await performDesktopOpenPath(input, operations), { operationId: 'open-1', status: 'opened' })
    assert.deepEqual(opened, [canonicalPath])
    for (const patch of [{ kind: 'directory' }, { canonicalPath: 'relative.md' }, { canonicalPath: canonicalPath + '.command' }, { extra: true }]) {
      assert.equal((await performDesktopOpenPath({ ...input, ...patch }, operations)).status, 'denied')
    }
    assert.equal((await performDesktopOpenPath({ ...input, identity: { dev: input.identity.dev, ino: '0' } }, operations)).status, 'stale')
    // Windows chmod cannot set POSIX execute bits. Exercise the same guard on every OS.
    const executable = { ...stats, mode: stats.mode | 0o111n, isFile: () => stats.isFile() }
    assert.equal((await performDesktopOpenPath(input, { ...operations, lstat: async () => executable })).status, 'denied')
    assert.deepEqual(opened, [canonicalPath])
    assert.equal((await performDesktopOpenPath(input, { openPath: async () => 'No application is associated' })).status, 'unavailable')
    assert.equal((await performDesktopOpenPath(input, { openPath: async () => { throw new Error('OS failed') } })).status, 'unavailable')
    const controller = new AbortController()
    assert.equal((await performDesktopOpenPath(input, { ...operations, realpath: async () => { controller.abort(); return canonicalPath } }, controller.signal)).status, 'cancelled')
    assert.deepEqual(opened, [canonicalPath])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
