import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedRaycastMutex } from '../src/trusted-raycast-mutex.ts'

test('Translate/trust mutex serializes one pending operation, releases after failure, and stays bounded', async () => {
  const mutex = createTrustedRaycastMutex()
  let release!: () => void
  const order: string[] = []
  const first = mutex(async () => await new Promise<void>(resolve => { release = () => { order.push('first'); resolve() } }))
  const second = mutex(async () => { order.push('second') })
  await assert.rejects(mutex(async () => {}), /busy/)
  assert.deepEqual(order, [])
  release()
  await first
  await second
  assert.deepEqual(order, ['first', 'second'])
  await assert.rejects(mutex(async () => { throw new Error('operation failed') }), /operation failed/)
  await mutex(async () => undefined)
})
