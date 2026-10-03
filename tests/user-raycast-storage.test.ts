import assert from 'node:assert/strict'
import fs, { mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createUserRaycastStorage } from '../src/user-raycast-storage.ts'

for (const change of ['link', 'growth'] as const) {
  test(`extension storage rejects ${change} between selection and opening without changing saved bytes`, t => {
    const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-race-'))
    const path = join(root, 'state.json')
    const target = join(root, 'outside.json')
    writeFileSync(path, JSON.stringify({ key: 'saved' }))
    writeFileSync(target, JSON.stringify({ key: 'outside data' }))
    const storage = createUserRaycastStorage(path)
    const original = fs.lstatSync
    let changed = false
    const selectedFile = t.mock.method(fs, 'lstatSync', ((selectedPath: fs.PathLike, options?: fs.StatOptions) => {
      const stat = original(selectedPath, options)
      if (String(selectedPath) === path && !changed) {
        changed = true
        if (change === 'link') {
          renameSync(path, join(root, 'original.json'))
          symlinkSync(target, path)
        } else writeFileSync(path, JSON.stringify({ key: 'x'.repeat(70_000) }))
      }
      return stat
    }) as typeof fs.lstatSync)
    syncBuiltinESMExports()
    try {
      assert.throws(() => storage.get('key'))
      assert.equal(changed, true, 'the state changed after the selected metadata was returned')
      assert.equal(readFileSync(target, 'utf8'), JSON.stringify({ key: 'outside data' }))
      if (change === 'link') assert.equal(readFileSync(join(root, 'original.json'), 'utf8'), JSON.stringify({ key: 'saved' }))
      else assert.equal(readFileSync(path, 'utf8'), JSON.stringify({ key: 'x'.repeat(70_000) }))
    } finally {
      selectedFile.mock.restore()
      syncBuiltinESMExports()
      rmSync(root, { recursive: true, force: true })
    }
  })
}
