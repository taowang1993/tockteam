import assert from 'node:assert/strict'
import test from 'node:test'
import { createDesktopOpenPathProvider } from '../src/desktop-open-path-provider.ts'
import { DesktopOpenPathChannel } from '../src/desktop-open-path-channel.ts'
import { MAX_DESKTOP_OPEN_PATH_BODY_BYTES, type DesktopOpenPathInput } from '../src/desktop-open-path.ts'
function input(overrides: Partial<DesktopOpenPathInput> = {}): DesktopOpenPathInput { return { canonicalPath: '/tmp/中文 #Note.md', identity: { dev: '1', ino: '2' }, kind: 'file', operationId: 'operation-1', vaultGeneration: 4, vaultId: 'vault-1', ...overrides } }

test('open-path provider forwards only the validated Host operation and fails closed on disposal', async () => {
  let request: RequestInit | undefined
  const provider = createDesktopOpenPathProvider({
    endpoint: 'http://127.0.0.1:43210/tockteam/desktop-open-path',
    token: 'test-token',
  }, async (_input, init) => {
    request = init
    return {
      ok: true,
      text: async () => JSON.stringify({ operationId: 'operation-1', status: 'opened' }),
    } as Response
  })
  assert.deepEqual(await provider.open(input(), new AbortController().signal), {
    operationId: 'operation-1',
    status: 'opened',
  })
  assert.equal(request?.method, 'POST')
  assert.equal((request?.headers as Record<string, string>).authorization, 'Bearer test-token')
  assert.deepEqual(JSON.parse(String(request?.body)), input())
  provider.dispose()
  await assert.rejects(provider.open(input({ operationId: 'operation-2' }), new AbortController().signal))
})

test('open-path channel authenticates, consumes replayed operations, and bounds bodies', async () => {
  const opened: DesktopOpenPathInput[] = []
  const channel = new DesktopOpenPathChannel({
    isAvailable: () => true,
    onOpen: async value => {
      opened.push(value)
      return { operationId: value.operationId, status: 'opened' }
    },
  })
  const environment = await channel.start()
  try {
    const response = await fetch(environment.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${environment.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input()),
    })
    assert.deepEqual(await response.json(), { operationId: 'operation-1', status: 'opened' })
    assert.equal(opened.length, 1)
    const replay = await fetch(environment.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${environment.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input()),
    })
    assert.deepEqual(await replay.json(), { operationId: 'operation-1', status: 'denied' })
    const unauthenticated = await fetch(environment.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input({ operationId: 'operation-2' })),
    })
    assert.equal(unauthenticated.status, 401)
    const oversized = await fetch(environment.endpoint, {
      body: Buffer.alloc(MAX_DESKTOP_OPEN_PATH_BODY_BYTES + 1),
      headers: { authorization: `Bearer ${environment.token}` },
      method: 'POST',
    })
    assert.equal(oversized.status, 413)
  } finally {
    await channel.stop()
  }
  await assert.rejects(fetch(environment.endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${environment.token}` },
    body: JSON.stringify(input({ operationId: 'operation-3' })),
  }))
})

test('open-path channel stops an in-flight open-path effect before it is committed', async () => {
  let started!: () => void
  let release!: () => void
  const began = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  let effects = 0
  const channel = new DesktopOpenPathChannel({
    isAvailable: () => true,
    onOpen: async (value, signal) => {
      started()
      await gate
      signal.throwIfAborted()
      effects += 1
      return { operationId: value.operationId, status: 'opened' }
    },
  })
  const environment = await channel.start()
  const request = fetch(environment.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${environment.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input()),
  })
  await began
  const stopping = channel.stop()
  release()
  await stopping
  assert.equal(effects, 0)
  assert.deepEqual(await (await request).json(), { operationId: 'operation-1', status: 'cancelled' })
})
