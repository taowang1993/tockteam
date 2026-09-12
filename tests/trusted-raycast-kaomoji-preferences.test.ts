import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  KAOMOJI_PREFERENCE_DEFAULTS,
  isKaomojiPreferences,
  loadKaomojiPreferenceState,
  saveKaomojiPreferences,
} from '../src/trusted-raycast-kaomoji-preferences.ts'

test('Kaomoji preferences admit exactly the two reviewed enums', () => {
  assert.deepEqual(KAOMOJI_PREFERENCE_DEFAULTS, { displayMode: 'list', primaryAction: 'paste-to-active-app' })
  for (const displayMode of ['list', 'grid']) for (const primaryAction of ['copy-to-clipboard', 'paste-to-active-app']) {
    assert.equal(isKaomojiPreferences({ displayMode, primaryAction }), true)
  }
  for (const value of [{}, { displayMode: 'table', primaryAction: 'paste-to-active-app' }, { displayMode: 'list', primaryAction: 'open' }, { ...KAOMOJI_PREFERENCE_DEFAULTS, extra: true }, null, []]) {
    assert.equal(isKaomojiPreferences(value), false)
  }
})

test('Kaomoji preferences use bounded atomic persistence without following symlinks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kaomoji-preferences-'))
  const path = join(root, 'preferences.json')
  try {
    assert.deepEqual(loadKaomojiPreferenceState(path), { configured: false, values: KAOMOJI_PREFERENCE_DEFAULTS })
    await saveKaomojiPreferences(path, { displayMode: 'grid', primaryAction: 'copy-to-clipboard' })
    assert.deepEqual(loadKaomojiPreferenceState(path), { configured: true, values: { displayMode: 'grid', primaryAction: 'copy-to-clipboard' } })
    assert.equal(readFileSync(path, 'utf8'), '{"displayMode":"grid","primaryAction":"copy-to-clipboard"}\n')
    await assert.rejects(saveKaomojiPreferences(path, { displayMode: 'grid', primaryAction: 'open' }), /Invalid Kaomoji preferences/)
    writeFileSync(path, 'x'.repeat(4097))
    assert.deepEqual(loadKaomojiPreferenceState(path), { configured: false, values: KAOMOJI_PREFERENCE_DEFAULTS })
    rmSync(path)
    const target = join(root, 'target'); writeFileSync(target, 'owned')
    symlinkSync(target, path)
    assert.deepEqual(loadKaomojiPreferenceState(path), { configured: false, values: KAOMOJI_PREFERENCE_DEFAULTS })
    await assert.rejects(saveKaomojiPreferences(path, KAOMOJI_PREFERENCE_DEFAULTS), /symlink/)
    assert.equal(readFileSync(target, 'utf8'), 'owned')
    assert.equal(existsSync(path), true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
