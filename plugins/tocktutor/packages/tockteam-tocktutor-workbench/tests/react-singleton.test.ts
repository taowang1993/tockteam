import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const workbenchRequire = createRequire(import.meta.url)
const uiRequire = createRequire(workbenchRequire.resolve('@tockteam/ui/package.json'))

test('the workbench and shared UI resolve one React singleton', () => {
  assert.equal(uiRequire.resolve('react'), workbenchRequire.resolve('react'))
  assert.strictEqual(uiRequire('react'), workbenchRequire('react'))
})
