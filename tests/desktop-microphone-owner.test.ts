import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopMicrophoneOwner } from '../src/desktop-microphone-owner.ts'
import type { NativeOperationIdentity } from '../src/host-contract.ts'

const identity: NativeOperationIdentity = {
  operationId: 'microphone-operation',
  requestId: 'microphone-request',
  sessionId: 'microphone-session',
  vaultGeneration: 1,
  vaultId: 'vault',
  windowId: 'window',
}

test('microphone owner grants one current permission handoff and consumes it once', async () => {
  let current = true
  const owner = new DesktopMicrophoneOwner({
    isAvailable: () => true,
    isCurrent: () => current,
    requestAccess: async () => true,
  })
  assert.deepEqual(await owner.request({ identity }, new AbortController().signal), {
    operationId: identity.operationId,
    status: 'granted',
  })
  assert.equal(owner.checkPermission(), true)
  assert.equal(owner.consumePermission(), true)
  assert.equal(owner.consumePermission(), false)
  current = false
  assert.deepEqual(await owner.request({ identity }, new AbortController().signal), {
    operationId: identity.operationId,
    status: 'stale',
  })
  owner.dispose()
})

test('microphone owner is single-flight and aborts late native completion', async () => {
  let finish!: (value: boolean) => void
  const access = new Promise<boolean>(resolve => { finish = resolve })
  const owner = new DesktopMicrophoneOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    requestAccess: async () => await access,
  })
  const controller = new AbortController()
  const first = owner.request({ identity }, controller.signal)
  assert.deepEqual(await owner.request({ identity: { ...identity, operationId: 'second' } }, new AbortController().signal), {
    operationId: 'second',
    status: 'denied',
  })
  controller.abort()
  finish(true)
  assert.deepEqual(await first, { operationId: identity.operationId, status: 'cancelled' })
  assert.equal(owner.checkPermission(), false)
  owner.dispose()
})

test('microphone owner settles promptly when native access ignores abort', async () => {
  const owner = new DesktopMicrophoneOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    requestAccess: async () => await new Promise<boolean>(() => {}),
  })
  const controller = new AbortController()
  const pending = owner.request({ identity }, controller.signal)
  controller.abort()
  const result = await Promise.race([
    pending,
    new Promise<never>((_resolve, reject) => { setTimeout(() => { reject(new Error('microphone abort timed out')) }, 50) }),
  ])
  assert.deepEqual(result, { operationId: identity.operationId, status: 'cancelled' })
  owner.dispose()
})

test('microphone owner rejects malformed extra fields and expires grants', async () => {
  let now = 1
  const owner = new DesktopMicrophoneOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    now: () => now,
    requestAccess: async () => true,
  })
  assert.equal((await owner.request({ identity, notePath: 'must-stay-in-adapter' } as never, new AbortController().signal)).status, 'denied')
  assert.equal((await owner.request({ identity }, new AbortController().signal)).status, 'granted')
  now += 30_001
  assert.equal(owner.checkPermission(), false)
  owner.dispose()
})
