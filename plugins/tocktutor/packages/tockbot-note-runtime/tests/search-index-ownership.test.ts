import assert from 'node:assert/strict'
import test from 'node:test'
import { adoptSearchIndex, retireSearchIndex, awaitSearchIndexSettlement, searchIndexOwnershipFailure } from '../src/search-index-ownership.ts'

// This file has its own test Host process: quarantine intentionally has no reset.
test('ownership barriers survive module reload and uncertain cleanup quarantines every generation', async () => {
  const held = Promise.withResolvers<void>()
  let closes = 0
  const first = { close: () => { closes++; return held.promise } }
  adoptSearchIndex(first)
  const closing = retireSearchIndex(first)
  assert.equal(closes, 1, 'retirement starts synchronously')
  assert.equal(retireSearchIndex(first), closing)
  const reloaded = await import(new URL('../src/search-index-ownership.ts?reload', import.meta.url).href)
  let released = false
  const barrier = reloaded.awaitSearchIndexSettlement().then(() => { released = true })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(released, false)
  held.resolve()
  await closing; await barrier
  assert.equal(searchIndexOwnershipFailure(), null)

  let siblingClosed = false
  adoptSearchIndex({ close: async () => { siblingClosed = true } })
  const uncertain = { close: async () => { throw new Error('unverified settlement') } }
  adoptSearchIndex(uncertain)
  await assert.rejects(retireSearchIndex(uncertain), /unverified settlement/u)
  assert.equal(siblingClosed, true)
  assert.ok(reloaded.searchIndexOwnershipFailure())
  await assert.rejects(awaitSearchIndexSettlement(), /unverified settlement/u)
  assert.throws(() => reloaded.adoptSearchIndex({ close: async () => {} }), /unverified settlement/u)
})
