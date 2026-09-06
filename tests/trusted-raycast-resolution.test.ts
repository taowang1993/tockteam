import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('private child resolution permits Node builtins but forbids ambient module fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-resolution-test-'))
  const hook = fileURLToPath(new URL('../src/trusted-raycast-resolution.ts', import.meta.url))
  try {
    const module = join(root, 'outside.mjs'); writeFileSync(module, 'export const value = true')
    const allowed = spawnSync(process.execPath, ['--import', hook, '-e', 'import("node:fs")'], { timeout: 2000 })
    assert.equal(allowed.status, 0, allowed.stderr.toString())
    const forbidden = spawnSync(process.execPath, ['--import', hook, '-e', `import(${JSON.stringify(pathToFileURL(module).href)})`], { timeout: 2000 })
    assert.notEqual(forbidden.status, 0)
    assert.match(forbidden.stderr.toString(), /outside the reviewed private runtime/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
