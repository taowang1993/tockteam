import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  loadTrustedRaycastPreferenceState,
  saveTrustedRaycastPreferences,
} from '../src/trusted-raycast-preferences.ts'
import { TRUSTED_RAYCAST_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-contract.ts'

test('Translate preferences begin unconfigured, persist exact values, and reject unsafe writes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-preferences-'))
  const path = join(root, 'preferences.json')
  try {
    assert.deepEqual(loadTrustedRaycastPreferenceState(path), {
      configured: false,
      values: TRUSTED_RAYCAST_PREFERENCE_DEFAULTS,
    })
    const values = { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, langFrom: 'auto', lang1: 'en', lang2: 'zh-CN' }
    await saveTrustedRaycastPreferences(path, values)
    assert.equal(existsSync(path), true)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).lang2, 'zh-CN')
    assert.deepEqual(loadTrustedRaycastPreferenceState(path), { configured: true, values })
    await assert.rejects(saveTrustedRaycastPreferences(path, { ...values, lang1: '<script>' }), /preferences/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Translate preference reads use bounded no-follow regular-file admission', () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-preferences-read-'))
  const path = join(root, 'preferences.json')
  const outside = join(root, 'outside.json')
  try {
    writeFileSync(path, 'x'.repeat(4097))
    assert.deepEqual(loadTrustedRaycastPreferenceState(path), { configured: false, values: TRUSTED_RAYCAST_PREFERENCE_DEFAULTS })
    rmSync(path)
    mkdirSync(path)
    assert.deepEqual(loadTrustedRaycastPreferenceState(path), { configured: false, values: TRUSTED_RAYCAST_PREFERENCE_DEFAULTS })
    rmSync(path, { recursive: true })
    writeFileSync(outside, JSON.stringify(TRUSTED_RAYCAST_PREFERENCE_DEFAULTS))
    symlinkSync(outside, path)
    assert.deepEqual(loadTrustedRaycastPreferenceState(path), { configured: false, values: TRUSTED_RAYCAST_PREFERENCE_DEFAULTS })

    if (process.platform !== 'win32') {
      rmSync(path)
      const fifo = join(root, 'fifo')
      assert.equal(spawnSync('/usr/bin/mkfifo', [fifo]).status, 0)
      const module = pathToFileURL(resolve('src/trusted-raycast-preferences.ts')).href
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import { loadTrustedRaycastPreferenceState } from ${JSON.stringify(module)}; if (loadTrustedRaycastPreferenceState(process.argv[1]).configured) process.exit(2)`, fifo], { timeout: 1500, killSignal: 'SIGKILL' })
      assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
      assert.equal(child.status, 0, child.error?.message ?? child.stderr.toString())
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Translate preference persistence refuses a symlink destination', async () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-preferences-link-'))
  const target = join(root, 'target.json')
  const path = join(root, 'preferences.json')
  try {
    symlinkSync(target, path)
    await assert.rejects(saveTrustedRaycastPreferences(path, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS), /symlink/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Translate preference persistence refuses a symlinked managed directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-preferences-parent-link-'))
  const target = join(root, 'outside')
  const directory = join(root, 'trusted-raycast')
  try {
    mkdirSync(target)
    symlinkSync(target, directory)
    await assert.rejects(saveTrustedRaycastPreferences(join(directory, 'preferences.json'), TRUSTED_RAYCAST_PREFERENCE_DEFAULTS), /directory.*symlink/i)
    assert.equal(existsSync(join(target, 'preferences.json')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
