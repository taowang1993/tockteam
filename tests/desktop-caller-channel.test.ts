import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
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
    identity: (operationId, requestId, windowId, _frameId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 4,
      vaultId: 'vault-4',
      windowId,
    }),
  })
  const environment = await channel.start()
  const issued = authorizations.issue('microphone', 'main-window', 'frame-1', { generation: 4, id: 'vault-4' })
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
  assert.deepEqual(await provider.claim({
    authorization: issued.authorization,
    operation: 'microphone',
  }, new AbortController().signal), claimed)

  await provider.dispose()
  await channel.stop()
})

test('provider binds activation to inactive Runtime and rejects unavailable vault operations', async () => {
  const authorizations = registry()
  const channel = new DesktopCallerChannel({
    authorizations,
    identity: (operationId, requestId, windowId, _frameId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 0,
      vaultId: null,
      windowId,
    }),
  })
  const provider = new DesktopCallerProvider(await channel.start(), fetch, () => ({ active: false, generation: 0 }))
  const inactiveVault = { generation: 0, id: null }
  const activate = authorizations.issue('activate-vault', 'main-window', 'frame-1', inactiveVault)
  const microphone = authorizations.issue('microphone', 'main-window', 'frame-1', inactiveVault)

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

test('provider rejects a claim when the active vault changes during identity fetch', async () => {
  let current = { active: true as const, generation: 1, id: 'vault-1' }
  const provider = new DesktopCallerProvider({
    endpoint: 'http://127.0.0.1:1234/tockteam/desktop-caller',
    token: 'token',
  }, async () => {
    current = { active: true, generation: 2, id: 'vault-2' }
    return new Response(JSON.stringify({
      operationId: 'operation',
      requestId: 'request',
      sessionId: 'session',
      vaultGeneration: 2,
      vaultId: 'vault-2',
      windowId: 'window',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }, () => current)

  await assert.rejects(provider.claim({ authorization: 'authorization', operation: 'print' }, new AbortController().signal), /stale/u)
  await provider.dispose()
})

test('caller cancellation aborts the in-flight provider request', async () => {
  let observed: AbortSignal | null = null
  const provider = new DesktopCallerProvider({
    endpoint: 'http://127.0.0.1:1234/tockteam/desktop-caller',
    token: 'token',
  }, ((_input: RequestInfo | URL, init?: RequestInit) => {
    observed = init?.signal instanceof AbortSignal ? init.signal : null
    return new Promise<Response>((_resolve, reject) => {
      observed?.addEventListener('abort', () => reject(observed?.reason), { once: true })
    })
  }) as typeof fetch, () => ({ active: true, generation: 1, id: 'vault-1' }))
  const caller = new AbortController()
  const claim = provider.claim({ authorization: 'authorization', operation: 'print' }, caller.signal)
  caller.abort()
  await assert.rejects(claim, /unavailable|cancelled/u)
  assert.equal((observed as AbortSignal | null)?.aborted, true)
  await provider.dispose()
})

test('channel stop destroys an authenticated partial request without hanging', async () => {
  const authorizations = registry()
  const channel = new DesktopCallerChannel({
    authorizations,
    identity: (operationId, requestId, windowId, _frameId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 0,
      vaultId: null,
      windowId,
    }),
  })
  const environment = await channel.start()
  const endpoint = new URL(environment.endpoint)
  const request = httpRequest({
    headers: { authorization: `Bearer ${environment.token}`, 'content-type': 'application/json' },
    hostname: endpoint.hostname,
    method: 'POST',
    path: endpoint.pathname,
    port: endpoint.port,
  })
  request.on('error', () => {})
  request.write('{')
  await new Promise(resolve => setTimeout(resolve, 10))
  await Promise.race([
    channel.stop(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('channel stop timed out')), 500)),
  ])
  request.destroy()
})

test('provider unload aborts pending claims and channel stop clears authorizations', async () => {
  const authorizations = registry()
  const channel = new DesktopCallerChannel({
    authorizations,
    identity: (operationId, requestId, windowId, _frameId, sessionId) => ({
      operationId,
      requestId,
      sessionId,
      vaultGeneration: 0,
      vaultId: null,
      windowId,
    }),
  })
  const environment = await channel.start()
  const issued = authorizations.issue('activate-vault', 'main-window', 'frame-1', { generation: 0, id: null })
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
