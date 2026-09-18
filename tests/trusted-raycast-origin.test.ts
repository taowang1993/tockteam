import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TrustedRaycastOrigin, type TrustedRaycastPriorApp } from '../src/trusted-raycast-native.ts'

const app = (name: string): TrustedRaycastPriorApp => ({ name, capturedAt: Date.now() })

test('each launcher opening replaces the native target, including failed capture', async () => {
  const origin = new TrustedRaycastOrigin()
  await origin.capture(async () => app('B'))
  assert.equal(origin.current?.name, 'B')
  origin.clear()
  await origin.capture(async () => app('C'))
  assert.equal(origin.current?.name, 'C')
  await origin.capture(async () => undefined)
  assert.equal(origin.current, undefined)
  await origin.capture(async () => app('D'))
  await assert.rejects(origin.capture(async () => { throw new Error('capture failed') }))
  assert.equal(origin.current, undefined)
})

test('a late capture cannot overwrite a newer opening or survive closure', async () => {
  const origin = new TrustedRaycastOrigin()
  const old = Promise.withResolvers<TrustedRaycastPriorApp>()
  const first = origin.capture(() => old.promise)
  assert.equal(origin.current?.name, undefined)
  await origin.capture(async () => app('C'))
  old.resolve(app('B')); await first
  assert.equal(origin.current?.name, 'C')
  const closing = Promise.withResolvers<TrustedRaycastPriorApp>()
  const pending = origin.capture(() => closing.promise)
  origin.clear()
  closing.resolve(app('D')); await pending
  assert.equal(origin.current, undefined)
})
