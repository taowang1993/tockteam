import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopCallerAuthorizations } from '../src/desktop-caller-authorization.ts'
import { DesktopCallerChannel } from '../src/desktop-caller-channel.ts'
import { DesktopCallerProvider } from '../src/desktop-caller-provider.ts'

function registry(): DesktopCallerAuthorizations {
  let next = 0
  return new DesktopCallerAuthorizations({ randomId: () => `caller-${String(++next)}` })
}

test('private Host channel claims one main-issued identity and rejects replay', async () => {
  const authorizations = registry()
  const channel = new DesktopCallerChannel({
    authorizations,
    identity: (operationId, requestId, windowId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 4,
      vaultId: 'vault-4',
      windowId,
    }),
  })
  const environment = await channel.start()
  const issued = authorizations.issue('microphone', 'main-window')
  const unauthorized = await fetch(environment.endpoint, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(unauthorized.status, 401)

  const provider = new DesktopCallerProvider(environment, fetch, () => ({ active: true, generation: 4, id: 'vault-4' }))
  const claimed = await provider.claim({
    authorization: issued.authorization,
    operation: 'microphone',
  }, new AbortController().signal)
  assert.equal(claimed.operationId, 'caller-2')
  assert.equal(claimed.requestId, 'caller-3')
  assert.equal(claimed.windowId, 'main-window')
  assert.equal(claimed.vaultId, 'vault-4')
  assert.ok(claimed.sessionId.length >= 32)
  await assert.rejects(provider.claim({
    authorization: issued.authorization,
    operation: 'microphone',
  }, new AbortController().signal), /stale/u)

  await provider.dispose()
  await channel.stop()
})

test('provider binds activation to inactive Runtime and rejects unavailable vault operations', async () => {
  const authorizations = registry()
  const channel = new DesktopCallerChannel({
    authorizations,
    identity: (operationId, requestId, windowId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 0,
      vaultId: null,
      windowId,
    }),
  })
  const provider = new DesktopCallerProvider(await channel.start(), fetch, () => ({ active: false, generation: 0 }))
  const activate = authorizations.issue('activate-vault', 'main-window')
  const microphone = authorizations.issue('microphone', 'main-window')

  assert.equal((await provider.claim({
    authorization: activate.authorization,
    operation: 'activate-vault',
  }, new AbortController().signal)).vaultId, null)
  await assert.rejects(provider.claim({
    authorization: microphone.authorization,
    operation: 'microphone',
  }, new AbortController().signal), /stale/u)

  await provider.dispose()
  await channel.stop()
})

test('provider unload aborts pending claims and channel stop clears authorizations', async () => {
  const authorizations = registry()
  const channel = new DesktopCallerChannel({
    authorizations,
    identity: (operationId, requestId, windowId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 0,
      vaultId: null,
      windowId,
    }),
  })
  const environment = await channel.start()
  const issued = authorizations.issue('activate-vault', 'main-window')
  let release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const provider = new DesktopCallerProvider(environment, async (input, init) => {
    await blocked
    return await fetch(input, init)
  }, () => ({ active: false, generation: 0 }))
  const claiming = provider.claim({
    authorization: issued.authorization,
    operation: 'activate-vault',
  }, new AbortController().signal)
  const disposing = provider.dispose()
  release()
  await assert.rejects(claiming, /cancelled|unavailable/u)
  await disposing
  await channel.stop()
  assert.equal(authorizations.size, 0)
})
