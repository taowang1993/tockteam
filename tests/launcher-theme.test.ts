import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createLauncherThemeProjector,
  parseLauncherThemeProjection,
  parseLauncherThemeSource,
  projectLauncherThemeSource,
} from '../src/launcher-theme.ts'
import { TOCKTEAM_SKINS } from '../plugins/skins/src/skins.ts'

test('launcher theme projection is finite and validates shared skins', () => {
  const source = projectLauncherThemeSource({
    active: { id: 'tockteam-skin-deep-current', colorScheme: 'dark', tokens: { secret: 'no' } },
  })
  assert.deepEqual(source, { mode: 'dark', skinId: 'tockteam-skin-deep-current' })
  assert.deepEqual(projectLauncherThemeSource({
    active: { id: 'third-party-theme', colorScheme: 'light', tokens: {} },
  }), { mode: 'light', skinId: null })
  assert.deepEqual(projectLauncherThemeSource({
    active: { id: 'tockteam-skin-deep-current', colorScheme: 'light', tokens: {} },
  }), { mode: 'light', skinId: null })
  assert.deepEqual(parseLauncherThemeSource(source), source)
  assert.throws(() => parseLauncherThemeSource({ mode: 'dark', skinId: 'arbitrary' }), /skin/u)
  assert.throws(() => parseLauncherThemeSource({ mode: 'dark', skinId: null, tokens: {} }), /theme/u)
  assert.throws(() => parseLauncherThemeSource({ mode: 'light', skinId: 'tockteam-skin-deep-current' }), /scheme/u)
  for (const skin of TOCKTEAM_SKINS) {
    assert.deepEqual(parseLauncherThemeSource({ mode: skin.colorScheme, skinId: skin.id }), {
      mode: skin.colorScheme,
      skinId: skin.id,
    })
  }
})

test('main theme projector assigns monotonic revisions and parser rejects stale shape', () => {
  const projector = createLauncherThemeProjector()
  const first = projector.update({ mode: 'light', skinId: null })
  const second = projector.update({ mode: 'dark', skinId: 'tockteam-skin-ember-dusk' })
  assert.equal(second.revision > first.revision, true)
  assert.deepEqual(parseLauncherThemeProjection(second), second)
  assert.throws(() => parseLauncherThemeProjection({ mode: 'dark', skinId: null, revision: 0, themes: [] }), /projection/u)
})
