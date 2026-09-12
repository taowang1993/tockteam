import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { trustedRaycastDataPaths } from '../src/trusted-raycast-paths.ts'

test('trusted extension data paths preserve Translate and isolate Kaomoji state', () => {
  const root = '/managed/user-data'
  const google = trustedRaycastDataPaths(root, 'google-translate')
  assert.deepEqual(google, {
    installRoot: join(root, 'launcher', 'trusted-raycast-install'),
    preferencesFile: join(root, 'launcher', 'trusted-raycast-preferences.json'),
    stateFile: join(root, 'launcher', 'trusted-raycast-state.json'),
    trustFile: join(root, 'launcher', 'trusted-raycast-trust.json'),
  })
  const kaomoji = trustedRaycastDataPaths(root, 'kaomoji-search')
  assert.deepEqual(kaomoji, {
    installRoot: join(root, 'launcher', 'trusted-raycast-install', 'kaomoji-search'),
    preferencesFile: join(root, 'launcher', 'trusted-raycast-preferences-kaomoji-search.json'),
    stateFile: join(root, 'launcher', 'trusted-raycast-state-kaomoji-search.json'),
    trustFile: join(root, 'launcher', 'trusted-raycast-trust-kaomoji-search.json'),
  })
  assert.equal(new Set([...Object.values(google), ...Object.values(kaomoji)]).size, 8)
  assert.throws(() => trustedRaycastDataPaths(root, 'unknown' as never), /extension identity/)
})
