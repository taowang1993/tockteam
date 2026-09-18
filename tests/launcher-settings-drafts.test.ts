import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { launcherDraftValueEquals } from '../src/launcher-settings-draft-value.ts'

const hookSource = readFileSync(new URL('../src/launcher-settings-drafts.ts', import.meta.url), 'utf8')

test('clean numeric synchronized drafts adopt numeric snapshots after a source reset', () => {
  assert.equal(launcherDraftValueEquals('9', 9), true)
  assert.equal(launcherDraftValueEquals('9', 10), false)
  assert.equal(launcherDraftValueEquals('', 0), false)
})

test('rejected drafts remain dirty until the snapshot accepts their value', () => {
  assert.equal(launcherDraftValueEquals('{not json', '[]'), false)
  assert.match(hookSource, /commitDraft[\s\S]*equalsRef\.current\(draftRef\.current, value\)[\s\S]*dirtyRef\.current = false/u)
})
