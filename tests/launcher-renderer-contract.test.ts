import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  LAUNCHER_COMPOSITION,
  launcherShortcutMatches,
  launcherShortcutLabel,
  normalizeLauncherLocale,
  parseLauncherSurfaceSettings,
  type LauncherSurfaceSettings,
} from '../src/launcher-contract.ts'
import { launcherSettingDisposition } from '../src/launcher-settings-model.ts'

const launcherSource = readFileSync(new URL('../src/launcher.ts', import.meta.url), 'utf8')

test('surface projection has bounded locale, appearance, interaction, and provider status facts', () => {
  const projection = parseLauncherSurfaceSettings({
    doubleClickBehavior: 'invokeSearchResultItem',
    dragAndDropEnabled: false,
    fuzziness: 0.5,
    history: [],
    historyEnabled: true,
    historyLimit: 10,
    hideWindowOn: ['blur', 'afterInvocation'],
    locale: 'zh-CN',
    maxSearchResultItems: 50,
    placeholder: '搜索 TockTeam',
    preserveUserInput: true,
    providerStatuses: LAUNCHER_COMPOSITION.extensionIds.map(extensionId => ({ extensionId, state: 'ready' as const })),
    searchBarAppearance: 'auto',
    searchBarSize: 'large',
    searchEngineId: 'fuzzysort',
    searchResultLayout: 'compact',
    scrollBehavior: 'smooth',
    showSearchIcon: true,
    singleClickBehavior: 'selectSearchResultItem',
  })
  assert.equal(projection.locale, 'zh-CN')
  assert.deepEqual(projection.hideWindowOn, ['blur', 'afterInvocation'])
  assert.equal(projection.providerStatuses.at(-1)?.extensionId, 'Workflow')
  assert.equal(Object.isFrozen(projection.providerStatuses), true)
  assert.equal(Object.isFrozen(projection), true)
  assert.throws(() => parseLauncherSurfaceSettings({
    doubleClickBehavior: 'invokeSearchResultItem', dragAndDropEnabled: false, fuzziness: 0.5, history: [], historyEnabled: true, historyLimit: 10,
    locale: 'en-US', maxSearchResultItems: 50, placeholder: 'Search', preserveUserInput: true, providerStatuses: [{ extensionId: 'Workflow', state: 'ready', messageKey: 'unavailable' }],
    searchBarAppearance: 'auto', searchBarSize: 'large', searchEngineId: 'fuzzysort', searchResultLayout: 'compact', scrollBehavior: 'smooth', showSearchIcon: true, singleClickBehavior: 'selectSearchResultItem',
  }), /provider status/u)
  assert.equal(normalizeLauncherLocale('fr-FR'), 'en-US')
})

test('launcher shortcut matching requires exact modifiers and supports finite provider shortcuts', () => {
  assert.equal(launcherShortcutMatches({ key: 'o', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, 'Cmd+O', 'macOS'), true)
  assert.equal(launcherShortcutMatches({ key: 'o', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }, 'Cmd+O', 'macOS'), false)
  assert.equal(launcherShortcutMatches({ key: 'Enter', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }, 'Shift+Enter', 'Windows'), true)
  assert.equal(launcherShortcutMatches({ key: 'Enter', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true }, 'Shift+Enter', 'Windows'), false)
  assert.equal(launcherShortcutLabel('Cmd+O', 'macOS'), 'Cmd+O')
})

test('action-menu activation closes the history menu', () => {
  assert.match(launcherSource, /if \(!actionMenuOpen\) \{[\s\S]{0,240}historyOpen = false/u)
  assert.match(launcherSource, /historyPanel\.hidden = true[\s\S]{0,120}historyToggle\.setAttribute\('aria-expanded', 'false'\)/u)
})

test('long result and action labels retain an inspection affordance', () => {
  assert.match(launcherSource, /button\.title = item\.name/u)
  assert.match(launcherSource, /actionButton\.title = action\.description/u)
})

test('every catalog row has an explicit renderer disposition', () => {
  for (const platform of ['macOS', 'Windows', 'Linux'] as const) {
    for (const key of ['appearance.searchBarSize', 'general.language', 'window.vibrancy', 'favorites']) {
      assert.ok(['effective', 'platform-disabled', 'status-only', 'internal'].includes(launcherSettingDisposition(key, platform)), `${platform}:${key}`)
    }
  }
})

const _surfaceTypeCheck: LauncherSurfaceSettings | undefined = undefined
void _surfaceTypeCheck
