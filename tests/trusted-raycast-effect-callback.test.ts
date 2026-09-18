import assert from 'node:assert/strict'
import test from 'node:test'
import { afterSucceededEffect } from '../src/trusted-raycast-effect-callback.ts'

test('candidate callbacks run only after the main-owned effect succeeds', async () => {
  const order: string[] = []
  await afterSucceededEffect(async () => { order.push('effect') }, (value: string) => { order.push(`callback:${value}`) }, '(^_^)')
  assert.deepEqual(order, ['effect', 'callback:(^_^)'])

  let called = false
  await assert.rejects(afterSucceededEffect(async () => { throw new Error('denied') }, () => { called = true }, '(>_<)'), /denied/)
  assert.equal(called, false)
})
