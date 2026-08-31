import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeLauncherDirtyValues, readPersistedLauncherState } from '../src/launcher-settings-model.ts'

test('settings model projects bounded renderer interaction preferences', () => {
  const state = readPersistedLauncherState({
    externalGrantStatus: 'none', logs: [], missingSensitiveKeys: [], recoveredSettings: false, settingsSource: 'managed', values: {
      'appearance.searchBarAppearance': 'underline', 'appearance.searchBarPlaceholderText': 'Find TockTeam', 'appearance.searchBarSize': 'small', 'appearance.searchResultListLayout': 'detailed', 'appearance.showSearchIcon': false,
      'general.language': 'zh-CN', 'keyboardAndMouse.doubleClickBehavior': 'selectSearchResultItem', 'keyboardAndMouse.singleClickBehavior': 'invokeSearchResultItem', 'window.hideWindowOn': ['escapePressed'], 'window.scrollBehavior': 'instant',
    },
  })
  assert.equal(state.preferences.searchBarAppearance, 'underline')
  assert.equal(state.preferences.placeholder, 'Find TockTeam')
  assert.equal(state.preferences.searchBarSize, 'small')
  assert.equal(state.preferences.searchResultLayout, 'detailed')
  assert.equal(state.preferences.showSearchIcon, false)
  assert.equal(state.preferences.language, 'zh-CN')
  assert.equal(state.preferences.singleClickBehavior, 'invokeSearchResultItem')
  assert.deepEqual(state.preferences.hideWindowOn, ['escapePressed'])
  assert.equal(state.preferences.scrollBehavior, 'instant')
})

test('settings model starts with the Tockbot search chrome', () => {
  const state = readPersistedLauncherState({
    externalGrantStatus: 'none', logs: [], missingSensitiveKeys: [], recoveredSettings: false, settingsSource: 'managed', values: {},
  })
  assert.equal(state.preferences.placeholder, 'Type here...')
  assert.equal(state.preferences.showSearchIcon, false)
})

test('settings snapshot merge preserves dirty values over an external reload', () => {
  const snapshot = { externalGrantStatus: 'none', logs: [], missingSensitiveKeys: [], recoveredSettings: false, settingsSource: 'managed', values: { 'general.preserveUserInput': true } } as const
  const merged = mergeLauncherDirtyValues(snapshot, new Map([['general.preserveUserInput', false]]))
  assert.equal(merged.values['general.preserveUserInput'], false)
  assert.equal(Object.isFrozen(merged), true)
  assert.equal(Object.isFrozen(merged.values), true)
})

test('settings model never projects queries while history is disabled', () => {
  const state = readPersistedLauncherState({
    externalGrantStatus: 'none',
    logs: [],
    missingSensitiveKeys: [],
    recoveredSettings: false,
    settingsSource: 'managed',
    values: {
      'general.searchHistory.enabled': false,
      'general.searchHistory.history': ['private query'],
      'general.searchHistory.limit': 10,
    },
  })
  assert.equal(state.preferences.historyEnabled, false)
  assert.deepEqual(state.history, [])
})
