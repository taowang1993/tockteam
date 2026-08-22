import assert from 'node:assert/strict'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DesktopRevealChannel } from '../src/desktop-reveal-channel.ts'
import { performDesktopReveal } from '../src/desktop-reveal-native.ts'
import { createDesktopRevealProvider } from '../src/desktop-reveal-provider.ts'
import {
  validateDesktopRevealInput,
  type DesktopRevealInput,
} from '../src/desktop-reveal.ts'

function input(overrides: Partial<DesktopRevealInput> = {}): DesktopRevealInput {
  return {
    canonicalPath: '/tmp/tockteam-reveal/Plan.md',
    identity: { dev: '1', ino: '2' },
    kind: 'file',
    operationId: 'operation-1',
    vaultGeneration: 4,
    vaultId: 'vault-1',
    ...overrides,
  }
}

test('validates the locked reveal transport shape and rejects path/control abuse', () => {
  assert.deepEqual(validateDesktopRevealInput(input()), input())
  assert.equal(validateDesktopRevealInput({ ...input(), kind: 'socket' }), undefined)
  assert.equal(validateDesktopRevealInput({ ...input(), identity: { dev: '01', ino: '2' } }), undefined)
  assert.equal(validateDesktopRevealInput({ ...input(), canonicalPath: 'relative/path' }), undefined)
  assert.equal(validateDesktopRevealInput({ ...input(), operationId: 'bad\u0000operation' }), undefined)
  assert.equal(validateDesktopRevealInput({ ...input(), vaultGeneration: -1 }), undefined)
})

test('revalidates canonical path and file-directory identity before reveal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-reveal-'))
  const target = join(root, 'Plan.md')
  await writeFile(target, 'Plan')
  const canonicalPath = await realpath(target)
  const stats = await lstat(canonicalPath, { bigint: true })
  const revealed: string[] = []
  try {
    const result = await performDesktopReveal(input({
      canonicalPath,
      identity: { dev: String(stats.dev), ino: String(stats.ino) },
    }), {
      isAvailable: () => true,
      lstat: async () => stats,
      realpath: async () => canonicalPath,
      reveal: path => { revealed.push(path) },
    })
    assert.deepEqual(result, { operationId: 'operation-1', status: 'revealed' })
    assert.deepEqual(revealed, [canonicalPath])

    const stale = await performDesktopReveal(input({
      canonicalPath,
      identity: { dev: String(stats.dev), ino: String(stats.ino + 1n) },
    }), {
      isAvailable: () => true,
      lstat: async () => stats,
      realpath: async () => canonicalPath,
      reveal: path => { revealed.push(path) },
    })
    assert.deepEqual(stale, { operationId: 'operation-1', status: 'stale' })
    assert.deepEqual(revealed, [canonicalPath])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Host provider forwards the locked operation and fails closed on disposal', async () => {
  let request: RequestInit | undefined
  const provider = createDesktopRevealProvider({
    endpoint: 'http://127.0.0.1:43210/tockteam/desktop-reveal',
    token: 'test-token',
  }, async (_input, init) => {
    request = init
    return {
      ok: true,
      text: async () => JSON.stringify({ operationId: 'operation-1', status: 'revealed' }),
    } as Response
  })
  assert.deepEqual(await provider.reveal(input(), new AbortController().signal), {
    operationId: 'operation-1',
    status: 'revealed',
  })
  assert.equal(request?.method, 'POST')
  assert.equal((request?.headers as Record<string, string>).authorization, 'Bearer test-token')
  assert.deepEqual(JSON.parse(String(request?.body)), input())
  provider.dispose()
  await assert.rejects(provider.reveal(input({ operationId: 'operation-2' }), new AbortController().signal))

  const controller = new AbortController()
  controller.abort()
  const cancelled = createDesktopRevealProvider({
    endpoint: 'http://127.0.0.1:43210/tockteam/desktop-reveal',
    token: 'test-token',
  }, async () => { throw new Error('must not dispatch') })
  assert.deepEqual(await cancelled.reveal(input({ operationId: 'operation-3' }), controller.signal), {
    operationId: 'operation-3',
    status: 'cancelled',
  })
  cancelled.dispose()
})

test('channel stop aborts an in-flight reveal before the native effect', async () => {
  let started!: () => void
  let release!: () => void
  const began = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  let effects = 0
  const channel = new DesktopRevealChannel({
    isAvailable: () => true,
    onReveal: async (value, signal) => {
      started()
      await gate
      signal.throwIfAborted()
      effects += 1
      return { operationId: value.operationId, status: 'revealed' }
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
  assert.deepEqual(await (await request).json(), {
    operationId: 'operation-1',
    status: 'cancelled',
  })
})

test('client cancellation aborts the pending native reveal', async () => {
  let started!: () => void
  let release!: () => void
  let observedAbort!: () => void
  const began = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const aborted = new Promise<void>(resolve => { observedAbort = resolve })
  let effects = 0
  const channel = new DesktopRevealChannel({
    isAvailable: () => true,
    onReveal: async (value, signal) => {
      started()
      signal.addEventListener('abort', observedAbort, { once: true })
      await gate
      signal.throwIfAborted()
      effects += 1
      return { operationId: value.operationId, status: 'revealed' }
    },
  })
  const environment = await channel.start()
  const controller = new AbortController()
  const request = fetch(environment.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${environment.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input()),
    signal: controller.signal,
  })
  const settled = request.then(
    value => ({ error: undefined, value }),
    error => ({ error, value: undefined }),
  )
  await began
  controller.abort()
  await aborted
  release()
  const result = await settled
  assert.notEqual(result.error, undefined)
  await channel.stop()
  assert.equal(effects, 0)
})

test('child-to-main reveal channel authenticates and consumes each operation once', async () => {
  const requests: DesktopRevealInput[] = []
  const channel = new DesktopRevealChannel({
    isAvailable: () => true,
    onReveal: async value => {
      requests.push(value)
      return { operationId: value.operationId, status: 'revealed' }
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
    assert.deepEqual(await response.json(), { operationId: 'operation-1', status: 'revealed' })
    assert.equal(requests.length, 1)

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
  } finally {
    await channel.stop()
  }
  await assert.rejects(fetch(environment.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${environment.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input({ operationId: 'operation-3' })),
  }))
})
