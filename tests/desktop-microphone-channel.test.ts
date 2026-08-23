import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopMicrophoneChannel } from '../src/desktop-microphone-channel.ts'
import { DesktopMicrophoneOwner } from '../src/desktop-microphone-owner.ts'
import { DesktopMicrophoneProvider } from '../src/desktop-microphone-provider.ts'

const identity = {
  operationId: 'microphone-channel',
  requestId: 'request',
  sessionId: 'session',
  vaultGeneration: 1,
  vaultId: 'vault',
  windowId: 'window',
}

test('microphone channel authenticates and provider gates live Runtime identity', async () => {
  const owner = new DesktopMicrophoneOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    requestAccess: async () => true,
  })
  const channel = new DesktopMicrophoneChannel(owner)
  const environment = await channel.start()
  const unauthorized = await fetch(environment.endpoint, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: JSON.stringify({ identity }),
  })
  assert.equal(unauthorized.status, 401)
  const provider = new DesktopMicrophoneProvider(environment, fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  assert.deepEqual(await provider.request({ identity }, new AbortController().signal), {
    operationId: identity.operationId,
    status: 'granted',
  })
  assert.equal(owner.consumePermission(), true)
  await provider.dispose()
  await channel.stop()
})

test('microphone provider rejects stale vault before native request', async () => {
  let called = false
  const provider = new DesktopMicrophoneProvider({ endpoint: 'http://127.0.0.1:1/microphone', token: 'token' }, async () => {
    called = true
    throw new Error('must not call')
  }, () => ({ active: true, generation: 2, id: 'other' }))
  assert.deepEqual(await provider.request({ identity }, new AbortController().signal), {
    operationId: identity.operationId,
    status: 'stale',
  })
  assert.equal(called, false)
  await provider.dispose()
})

test('microphone provider unload revokes a grant whose reply was gated', async () => {
  const owner = new DesktopMicrophoneOwner({ isAvailable: () => true, isCurrent: () => true, requestAccess: async () => true })
  let granted!: () => void
  const nativeGranted = new Promise<void>(resolve => { granted = resolve })
  let releaseReply!: () => void
  const replyBlocked = new Promise<void>(resolve => { releaseReply = resolve })
  const originalRequest = owner.request.bind(owner)
  owner.request = (async (request, signal) => {
    const result = await originalRequest(request, signal)
    granted()
    await replyBlocked
    return result
  }) as typeof owner.request
  const channel = new DesktopMicrophoneChannel(owner)
  const provider = new DesktopMicrophoneProvider(await channel.start(), fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  const requesting = provider.request({ identity }, new AbortController().signal)
  await nativeGranted
  let disposeSettled = false
  const disposing = provider.dispose().then(() => { disposeSettled = true })
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(disposeSettled, false)
  releaseReply()
  assert.equal((await requesting).status, 'granted')
  await disposing
  assert.equal(owner.checkPermission(), false)
  assert.equal(owner.consumePermission(), false)
  await channel.stop()
})
