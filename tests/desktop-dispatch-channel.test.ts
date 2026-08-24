import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopDispatchChannel } from '../src/desktop-dispatch-channel.ts'
import { DesktopDispatchOwner } from '../src/desktop-dispatch-owner.ts'
import { DesktopDispatchProvider } from '../src/desktop-dispatch-provider.ts'
import type { DesktopDispatchEvent } from '../src/host-contract.ts'

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

test('trusted-main dispatch consumer receives normalized work and completes exact delivery', async () => {
  const native = channel()
  await native.start()
  assert.equal(native.publishQuickAction('search'), true)
  const event = await native.next(new AbortController().signal)
  assert.equal(event?.kind, 'quick-action')
  assert.equal(event?.identity.vaultId, 'vault')
  assert.equal((await native.complete({
    operationId: event?.identity.operationId ?? '',
    status: 'handled',
  }, new AbortController().signal))?.status, 'handled')
  assert.equal((await native.complete({
    operationId: event?.identity.operationId ?? '',
    status: 'handled',
  }, new AbortController().signal))?.status, 'stale')
  await native.stop()
})

test('dispatch provider unload requeues an event whose poll reply was gated', async () => {
  const native = channel()
  const environment = await native.start()
  const owner = (native as unknown as { owner: DesktopDispatchOwner }).owner
  let delivered!: () => void
  const eventDelivered = new Promise<void>(resolve => { delivered = resolve })
  let releaseReply!: () => void
  const replyBlocked = new Promise<void>(resolve => { releaseReply = resolve })
  let captured: DesktopDispatchEvent | undefined
  const originalNext = owner.next.bind(owner)
  owner.next = (async (signal, consumerId) => {
    const event = await originalNext(signal, consumerId)
    if (event !== undefined) {
      captured = event
      delivered()
      await replyBlocked
    }
    return event
  }) as typeof owner.next
  const provider = new DesktopDispatchProvider(environment, fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  let listenerCalls = 0
  provider.subscribe(() => { listenerCalls += 1 })
  assert.equal(native.publishQuickAction('daily'), true)
  await eventDelivered
  const disposing = provider.dispose()
  releaseReply()
  await disposing
  assert.equal(listenerCalls, 0)
  assert.ok(captured)
  assert.equal((await owner.complete({ operationId: captured.identity.operationId, status: 'handled' }, new AbortController().signal)).status, 'stale')
  const redelivered = await owner.next(new AbortController().signal)
  assert.equal(redelivered?.identity.operationId, captured.identity.operationId)
  if (redelivered !== undefined) await owner.complete({ operationId: redelivered.identity.operationId, status: 'handled' }, new AbortController().signal)
  await native.stop()
})

test('disposing one dispatch consumer cannot requeue another consumer delivery', async () => {
  let next = 0
  const owner = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({
      operationId,
      requestId,
      sessionId: 'session',
      vaultGeneration: 1,
      vaultId: 'vault',
      windowId: 'window',
    }),
    isAvailable: () => true,
    randomId: () => `dispatch-${String(++next)}`,
  })
  assert.equal(owner.publishQuickAction('search'), true)
  const delivered = await owner.next(new AbortController().signal, 'trusted-main')
  assert.ok(delivered)
  owner.disposeConsumer('host-provider')
  assert.equal((await owner.complete({
    operationId: delivered.identity.operationId,
    status: 'handled',
  }, new AbortController().signal, 'trusted-main')).status, 'handled')
})

test('expired delivery leases are redelivered but superseded vault work is not', async () => {
  let now = 1_000
  let next = 0
  const expired: Array<{ consumerId: string; operationId: string }> = []
  const owner = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({
      operationId,
      requestId,
      sessionId: 'session',
      vaultGeneration: 1,
      vaultId: 'vault',
      windowId: 'window',
    }),
    isAvailable: () => true,
    now: () => now,
    onDeliveryExpired: (operationId, consumerId) => { expired.push({ consumerId, operationId }) },
    randomId: () => `dispatch-${String(++next)}`,
  })
  assert.equal(owner.publishQuickAction('daily'), true)
  const first = await owner.next(new AbortController().signal, 'host-provider')
  assert.ok(first)
  now += 5 * 60 * 1000 + 1
  const redelivered = await owner.next(AbortSignal.timeout(100), 'trusted-main')
  assert.equal(redelivered?.identity.operationId, first.identity.operationId)
  assert.deepEqual(expired, [{ consumerId: 'host-provider', operationId: first.identity.operationId }])
  assert.equal((await owner.complete({
    operationId: redelivered?.identity.operationId ?? '',
    status: 'handled',
  }, new AbortController().signal, 'trusted-main')).status, 'handled')

  assert.equal(owner.publishProtocol('tocktutor://choose-vault?'), true)
  const oldVault = await owner.next(new AbortController().signal, 'host-provider')
  assert.ok(oldVault)
  assert.equal(owner.publishProtocol('tocktutor://choose-vault?'), true)
  owner.disposeConsumer('host-provider')
  const currentVault = await owner.next(AbortSignal.timeout(100), 'trusted-main')
  assert.notEqual(currentVault?.identity.operationId, oldVault.identity.operationId)
  assert.equal(currentVault?.kind, 'protocol')
  if (currentVault?.kind === 'protocol') assert.equal(currentVault.request.action, 'choose-vault')
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
  await provider.dispose()
  await native.stop()
})
