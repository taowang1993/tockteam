import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  handleUnexpectedRuntimeExit,
  stopLiveRuntimeForMarketplace,
} from '../src/runtime-lifecycle.ts'

test('marketplace stop clears transition only when splash or teardown fails', async () => {
  const events: string[] = []
  let transitioning = false
  await stopLiveRuntimeForMarketplace({
    setTransitioning: value => { transitioning = value; events.push(`transition:${String(value)}`) },
    showSplash: async () => { events.push('splash') },
    stopRuntime: async () => { events.push('stop') },
  })
  assert.equal(transitioning, true)
  assert.deepEqual(events, ['transition:true', 'splash', 'stop'])

  await assert.rejects(stopLiveRuntimeForMarketplace({
    setTransitioning: value => { transitioning = value },
    showSplash: async () => { throw new Error('splash failed') },
    stopRuntime: async () => { throw new Error('must not stop') },
  }), /splash failed/u)
  assert.equal(transitioning, false)

  await assert.rejects(stopLiveRuntimeForMarketplace({
    setTransitioning: value => { transitioning = value },
    showSplash: async () => {},
    stopRuntime: async () => { throw new Error('stop failed') },
  }), /stop failed/u)
  assert.equal(transitioning, false)
})

test('runtime exit cleanup logs stop failure, shows the stopped splash, and settles transition', async () => {
  const events: string[] = []
  let transitioning = true
  await handleUnexpectedRuntimeExit({
    setTransitioning: value => { transitioning = value; events.push(`transition:${String(value)}`) },
    stopRuntime: async () => { events.push('stop'); throw new Error('channel cleanup failed') },
    showStoppedSplash: async () => { events.push('splash') },
    log: error => { events.push(`log:${error instanceof Error ? error.message : String(error)}`) },
  })
  assert.equal(transitioning, false)
  assert.deepEqual(events, [
    'stop',
    'log:channel cleanup failed',
    'splash',
    'transition:false',
  ])
})
