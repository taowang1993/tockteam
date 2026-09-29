import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createLauncherThemeProjector,
  launcherOriginalThemeTokens,
  parseLauncherThemeProjection,
  parseLauncherThemeSource,
  projectLauncherThemeSource,
} from '../src/launcher-theme.ts'
import { TOCKTEAM_SKINS } from '../plugins/skins/src/skins.ts'

test('launcher follows both built-in modes with a separately selected valid skin', () => {
  const snapshot = (mode: 'light' | 'dark', id: string = mode) => ({
    active: { id, colorScheme: mode, tokens: { secret: 'no' } },
  })
  const skinId = 'tockteam-skin-navy'
  const light = projectLauncherThemeSource(snapshot('light'), skinId)
  const dark = projectLauncherThemeSource(snapshot('dark'), skinId)
  assert.deepEqual(light, { mode: 'light', skinId })
  assert.deepEqual(dark, { mode: 'dark', skinId })
  assert.deepEqual(projectLauncherThemeSource(snapshot('light'), null), { mode: 'light', skinId: null })
  assert.deepEqual(projectLauncherThemeSource(snapshot('light', 'third-party-theme'), skinId), { mode: 'light', skinId: null })
  assert.deepEqual(parseLauncherThemeSource(light), light)
  assert.throws(() => parseLauncherThemeSource({ mode: 'dark', skinId: 'arbitrary' }), /skin/u)
  assert.throws(() => parseLauncherThemeSource({ mode: 'dark', skinId: null, tokens: {} }), /theme/u)
  assert.throws(() => projectLauncherThemeSource(snapshot('dark'), 'arbitrary'), /skin/u)
  for (const skin of TOCKTEAM_SKINS) {
    for (const mode of ['light', 'dark'] as const) {
      assert.deepEqual(parseLauncherThemeSource({ mode, skinId: skin.id }), { mode, skinId: skin.id })
    }
  }
})

test('original launcher theme supplies the Tockbot surface colors in both modes', () => {
  const light = launcherOriginalThemeTokens('light')
  assert.equal(light['--dsw-alias-bg-overlay'], '#FFFFFF')
  assert.equal(light['--dsw-alias-border-l2'], '#D1D5DB')
  assert.equal(light['--dsw-alias-label-primary'], '#27272A')
  assert.equal(light['--dsw-alias-label-secondary'], '#71717A')
  assert.equal(light['--dsw-alias-interactive-bg-active'], 'rgb(39 39 42 / 0.09)')
  const dark = launcherOriginalThemeTokens('dark')
  assert.equal(dark['--dsw-alias-bg-overlay'], '#1B1B1B')
  assert.equal(dark['--dsw-alias-border-l2'], '#3A3A3A')
  assert.equal(dark['--dsw-alias-label-primary'], '#E0E0E0')
  assert.equal(Object.isFrozen(light) && Object.isFrozen(dark), true)
})

test('main theme projector assigns monotonic revisions and parser rejects stale shape', () => {
  const projector = createLauncherThemeProjector()
  const first = projector.update({ mode: 'light', skinId: null })
  const second = projector.update({ mode: 'dark', skinId: 'tockteam-skin-ember' })
  assert.equal(second.revision > first.revision, true)
  assert.deepEqual(parseLauncherThemeProjection(second), second)
  assert.throws(() => parseLauncherThemeProjection({ mode: 'dark', skinId: null, revision: 0, themes: [] }), /projection/u)
})
