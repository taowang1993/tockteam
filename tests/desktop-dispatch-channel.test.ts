import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopDispatchChannel } from '../src/desktop-dispatch-channel.ts'
import { DesktopDispatchProvider } from '../src/desktop-dispatch-provider.ts'

function channel(): DesktopDispatchChannel {
  return new DesktopDispatchChannel({
    identity: (operationId, requestId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 1,
      vaultId: 'vault',
      windowId: 'window',
    }),
    isAvailable: () => true,
  })
}

test('dispatch channel authenticates and provider subscribes without listener interference', async () => {
  const native = channel()
  const environment = await native.start()
  const unauthorized = await fetch(environment.endpoint, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'next' }),
  })
  assert.equal(unauthorized.status, 401)
  const provider = new DesktopDispatchProvider(environment, fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  const events: string[] = []
  const received = new Promise<void>(resolve => {
    provider.subscribe(() => { throw new Error('listener failure') })
    provider.subscribe(event => { events.push(event.kind); resolve() })
  })
  assert.equal(native.publishQuickAction('capture'), true)
  await received
  assert.deepEqual(events, ['quick-action'])
  await provider.dispose()
  await native.stop()
})

test('dispatch provider drops stale Runtime identities and channel stop settles long polls', async () => {
  const native = channel()
  const environment = await native.start()
  const provider = new DesktopDispatchProvider(environment, fetch, () => ({ active: false, generation: 0 }))
  let delivered = false
  provider.subscribe(() => { delivered = true })
  assert.equal(native.publishQuickAction('daily'), true)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(delivered, false)
  await native.stop()
  await provider.dispose()
})
