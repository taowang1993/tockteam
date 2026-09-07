import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadTrustedRaycastPreferenceState,
  saveTrustedRaycastPreferences,
} from '../src/trusted-raycast-preferences.ts'
import { TRUSTED_RAYCAST_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-contract.ts'

test('Translate preferences begin unconfigured, persist exact values, and reject unsafe writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-preferences-'))
  const path = join(root, 'preferences.json')
  try {
    assert.deepEqual(loadTrustedRaycastPreferenceState(path), {
      configured: false,
      values: TRUSTED_RAYCAST_PREFERENCE_DEFAULTS,
    })
    const values = { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, langFrom: 'auto', lang1: 'en', lang2: 'zh-CN' }
    saveTrustedRaycastPreferences(path, values)
    assert.equal(existsSync(path), true)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).lang2, 'zh-CN')
    assert.deepEqual(loadTrustedRaycastPreferenceState(path), { configured: true, values })
    assert.throws(() => saveTrustedRaycastPreferences(path, { ...values, lang1: '<script>' }), /preferences/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Translate preference persistence refuses a symlink destination', () => {
  const root = mkdtempSync(join(tmpdir(), 'raycast-preferences-link-'))
  const target = join(root, 'target.json')
  const path = join(root, 'preferences.json')
  try {
    symlinkSync(target, path)
    assert.throws(() => saveTrustedRaycastPreferences(path, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS), /symlink/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
