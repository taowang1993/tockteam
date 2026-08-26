import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../plugins/pinned-summary/src/client.ts', import.meta.url), 'utf8')

test('pinned summary reconciles a replaced binding under the same session ID', () => {
  assert.match(source, /#currentSession: ObservableSnapshot<unknown> \| undefined/u)
  assert.match(source, /currentId !== this\.#currentId \|\| currentSession !== this\.#currentSession/u)
  assert.match(source, /this\.#currentSession = currentSession/u)
})
