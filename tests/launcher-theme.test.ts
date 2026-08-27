import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createLauncherThemeProjector,
  parseLauncherThemeProjection,
  parseLauncherThemeSource,
  projectLauncherThemeSource,
} from '../src/launcher-theme.ts'

test('launcher theme projection is finite and validates shared skins', () => {
  const source = projectLauncherThemeSource({
    active: { id: 'tockteam-skin-deep-current', colorScheme: 'dark', tokens: { secret: 'no' } },
  })
  assert.deepEqual(source, { mode: 'dark', skinId: 'tockteam-skin-deep-current' })
  assert.deepEqual(projectLauncherThemeSource({
    active: { id: 'third-party-theme', colorScheme: 'light', tokens: {} },
  }), { mode: 'light', skinId: null })
  assert.deepEqual(parseLauncherThemeSource(source), source)
  assert.throws(() => parseLauncherThemeSource({ mode: 'dark', skinId: 'arbitrary' }), /skin/u)
  assert.throws(() => parseLauncherThemeSource({ mode: 'dark', skinId: null, tokens: {} }), /theme/u)
})

test('main theme projector assigns monotonic revisions and parser rejects stale shape', () => {
  const projector = createLauncherThemeProjector()
  const first = projector.update({ mode: 'light', skinId: null })
  const second = projector.update({ mode: 'dark', skinId: 'tockteam-skin-ember-dusk' })
  assert.equal(second.revision > first.revision, true)
  assert.deepEqual(parseLauncherThemeProjection(second), second)
  assert.throws(() => parseLauncherThemeProjection({ mode: 'dark', skinId: null, revision: 0, themes: [] }), /projection/u)
})
