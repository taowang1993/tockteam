import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LAUNCHER_FILE_SEARCH_QUERY_PREFIX,
  LAUNCHER_IPC_CHANNELS,
  LAUNCHER_MAX_SEARCH_TERM_LENGTH,
  parseLauncherInvokeActionArgs,
  parseLauncherInvokeResult,
  parseLauncherSearchArgs,
  parseLauncherSearchResponse,
} from '../src/launcher-contract.ts'

test('launcher search contract accepts bounded engine arguments and rejects authority fields', () => {
  assert.deepEqual(parseLauncherSearchArgs({
    fuzziness: 0.5,
    maxSearchResultItems: 50,
    searchEngineId: 'fuzzysort',
    searchTerm: 'coder',
  }), {
    fuzziness: 0.5,
    maxSearchResultItems: 50,
    searchEngineId: 'fuzzysort',
    searchTerm: 'coder',
  })
  for (const value of [
    { fuzziness: -0.1, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: '' },
    { fuzziness: 0.5, maxSearchResultItems: 201, searchEngineId: 'fuzzysort', searchTerm: '' },
    { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'shell', searchTerm: '' },
    { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: 'x'.repeat(513) },
    { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: '', handlerKey: 'shell' },
  ]) assert.throws(() => parseLauncherSearchArgs(value), /search term/u)
})

test('file-search IPC reserves the prefix outside the 512-character user query budget', () => {
  const valid = `${LAUNCHER_FILE_SEARCH_QUERY_PREFIX}${'x'.repeat(LAUNCHER_MAX_SEARCH_TERM_LENGTH)}`
  assert.equal(parseLauncherSearchArgs({ fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: valid }).searchTerm, valid)
  assert.throws(() => parseLauncherSearchArgs({ fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: `${valid}x` }), /search term/u)
})

test('launcher public responses contain opaque action IDs only', () => {
  assert.deepEqual(LAUNCHER_IPC_CHANNELS, {
    cancelAction: 'launcher:cancel-action',
    invokeAction: 'launcher:invoke-action',
    rescan: 'launcher:rescan',
    search: 'launcher:search',
  })
  assert.deepEqual(parseLauncherInvokeActionArgs({ actionId: 'launcher-action:abc' }), {
    actionId: 'launcher-action:abc',
  })
  assert.throws(() => parseLauncherInvokeActionArgs({ actionId: 'launcher-action:../etc' }), /action ID/u)
  const response = parseLauncherSearchResponse({
    after: [{
      defaultAction: { actionId: 'launcher-action:abc', description: 'Focus' },
      description: 'TockTeam composer',
      id: 'tockteam:tockcoder',
      name: 'TockCoder',
      sourceExtension: 'TockTeam',
    }],
    before: [],
    resultSetId: 'launcher-results:1',
    status: { indexedItemCount: 1, rescanStatus: 'idle' },
  })
  assert.equal(response.after[0]?.defaultAction.actionId, 'launcher-action:abc')
  assert.throws(() => parseLauncherSearchResponse({
    after: [{
      defaultAction: {
        actionId: 'launcher-action:abc',
        argument: 'tockcoder',
        description: 'Focus',
        handlerKey: 'open-workbench',
      },
      description: 'Unsafe',
      id: 'unsafe',
      name: 'Unsafe',
      sourceExtension: 'TockTeam',
    }],
    before: [],
    resultSetId: 'launcher-results:1',
    status: { indexedItemCount: 1, rescanStatus: 'idle' },
  }), /action result/u)
  assert.deepEqual(parseLauncherInvokeResult({ ok: false, reason: 'expired' }), { ok: false, reason: 'expired' })
})
