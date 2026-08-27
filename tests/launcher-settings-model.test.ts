import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPersistedLauncherState } from '../src/launcher-settings-model.ts'

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
