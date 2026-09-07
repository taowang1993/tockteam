import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
