import assert from 'node:assert/strict'
import test from 'node:test'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDesktopCopyPathProvider,
  DesktopCopyPathProvider,
} from '../src/desktop-copy-path-provider.ts'
import { DesktopCopyPathChannel } from '../src/desktop-copy-path-channel.ts'
import { performDesktopCopyPath } from '../src/desktop-copy-path-native.ts'
import {
  MAX_DESKTOP_COPY_PATH_BODY_BYTES,
  validateDesktopCopyPathInput,
  type DesktopCopyPathInput,
} from '../src/desktop-copy-path.ts'

function input(overrides: Partial<DesktopCopyPathInput> = {}): DesktopCopyPathInput {
  return {
    canonicalPath: '/tmp/tockteam-copy-path/Plan.md',
    identity: { dev: '1', ino: '2' },
    kind: 'file',
    operationId: 'operation-1',
    vaultGeneration: 4,
    vaultId: 'vault-1',
    ...overrides,
  }
}

test('validates the locked copy-path transport shape without accepting renderer paths', async () => {
  assert.deepEqual(validateDesktopCopyPathInput(input()), input())
  assert.equal(validateDesktopCopyPathInput({ ...input(), canonicalPath: 'relative/path' }), undefined)
  assert.equal(validateDesktopCopyPathInput({ ...input(), kind: 'directory' }), undefined)
  assert.equal(validateDesktopCopyPathInput({ ...input(), operationId: 'bad\u0000operation' }), undefined)
  assert.equal(validateDesktopCopyPathInput({ ...input(), identity: { dev: '01', ino: '2' } }), undefined)
  const root = await mkdtemp(join(tmpdir(), 'tockteam-copy-path-'))
  const target = join(root, '中文 Notes #1.md')
  await writeFile(target, 'Plan')
  try {
    const canonicalPath = await realpath(target)
    const stats = await lstat(canonicalPath, { bigint: true })
    const copied: string[] = []
    assert.deepEqual(await performDesktopCopyPath(input({
      canonicalPath,
      identity: { dev: String(stats.dev), ino: String(stats.ino) },
    }), {
      isAvailable: () => true,
      lstat: async () => stats,
      realpath: async () => canonicalPath,
      writeText: value => { copied.push(value) },
    }), { operationId: 'operation-1', status: 'copied' })
    assert.deepEqual(copied, [canonicalPath])
    assert.deepEqual(await performDesktopCopyPath(input({
      canonicalPath,
      identity: { dev: String(stats.dev), ino: String(stats.ino + 1n) },
    }), {
      isAvailable: () => true,
      lstat: async () => stats,
      realpath: async () => canonicalPath,
      writeText: value => { copied.push(value) },
    }), { operationId: 'operation-1', status: 'stale' })
    assert.deepEqual(copied, [canonicalPath])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('copy-path provider forwards only the validated Host operation and fails closed on disposal', async () => {
  let request: RequestInit | undefined
  const provider = createDesktopCopyPathProvider({
    endpoint: 'http://127.0.0.1:43210/tockteam/desktop-copy-path',
    token: 'test-token',
  }, async (_input, init) => {
    request = init
    return {
      ok: true,
      text: async () => JSON.stringify({ operationId: 'operation-1', status: 'copied' }),
    } as Response
  })
  assert.deepEqual(await provider.copy(input(), new AbortController().signal), {
    operationId: 'operation-1',
    status: 'copied',
  })
  assert.equal(request?.method, 'POST')
  assert.equal((request?.headers as Record<string, string>).authorization, 'Bearer test-token')
  assert.deepEqual(JSON.parse(String(request?.body)), input())
  provider.dispose()
  await assert.rejects(provider.copy(input({ operationId: 'operation-2' }), new AbortController().signal))
})

test('copy-path channel authenticates, consumes replayed operations, and bounds bodies', async () => {
  const copied: DesktopCopyPathInput[] = []
  const channel = new DesktopCopyPathChannel({
    isAvailable: () => true,
    onCopy: async value => {
      copied.push(value)
      return { operationId: value.operationId, status: 'copied' }
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
    assert.deepEqual(await response.json(), { operationId: 'operation-1', status: 'copied' })
    assert.equal(copied.length, 1)
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
      body: Buffer.alloc(MAX_DESKTOP_COPY_PATH_BODY_BYTES + 1),
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

test('copy-path channel stops an in-flight clipboard effect before it is committed', async () => {
  let started!: () => void
  let release!: () => void
  const began = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  let effects = 0
  const channel = new DesktopCopyPathChannel({
    isAvailable: () => true,
    onCopy: async (value, signal) => {
      started()
      await gate
      signal.throwIfAborted()
      effects += 1
      return { operationId: value.operationId, status: 'copied' }
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

void DesktopCopyPathProvider
void httpRequest
