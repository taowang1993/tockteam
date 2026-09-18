import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RuntimeStartCancelledError, RuntimeStartGate } from '../src/runtime-start-gate.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

test('runtime start is single-flight and invalidation fences a delayed owner', async () => {
  const gate = new RuntimeStartGate<string>()
  const release = deferred<string>()
  let starts = 0
  const first = gate.start(async token => {
    starts += 1
    assert.equal(token.isCurrent(), true)
    const value = await release.promise
    assert.equal(token.isCurrent(), false)
    return value
  })
  assert.equal(gate.start(async () => 'second'), first)
  await Promise.resolve()
  assert.equal(starts, 1)
  gate.invalidate()
  release.resolve('late')
  await assert.rejects(first, error => error instanceof RuntimeStartCancelledError)
  assert.equal(starts, 1)
})

test('runtime quit fences a queued start and rejects later starts', async () => {
  const gate = new RuntimeStartGate<void>()
  const started = gate.start(async token => {
    assert.equal(token.isCurrent(), true)
  })
  gate.close()
  await assert.rejects(started, RuntimeStartCancelledError)
  await assert.rejects(gate.start(() => {}), RuntimeStartCancelledError)
})
