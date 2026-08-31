import assert from 'node:assert/strict'
import { test } from 'node:test'
import { launcherDraftValueEquals } from '../src/launcher-settings-draft-value.ts'

test('clean numeric synchronized drafts adopt numeric snapshots after a source reset', () => {
  assert.equal(launcherDraftValueEquals('9', 9), true)
  assert.equal(launcherDraftValueEquals('9', 10), false)
  assert.equal(launcherDraftValueEquals('', 0), false)
})
