import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { PassThrough, Writable } from 'node:stream'
import test from 'node:test'
import type {
  SubprocessHandle,
  SubprocessOutcome,
  SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import {
  PennivoChildError,
  PennivoChildManager,
  type PennivoBinding,
} from '../src/pennivo-child.ts'

const binding: PennivoBinding = {
  vaultId: 'vault-1',
  vaultGeneration: 1,
  writePermission: 'propose',
}

class FakeHandle implements SubprocessHandle {
  readonly pid: number
  readonly stdout = new PassThrough()
  readonly stderr = undefined
  readonly collected = {
    stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
  }
  readonly stdin: Writable
  readonly messages: Array<Record<string, unknown>> = []
  readonly events: string[]
  respondToInitialize = true
  respondToTools = true
  exitBarrier?: Promise<void>
  terminated = false
  private settled = false
  private readonly outcome = Promise.withResolvers<SubprocessOutcome>()
  readonly done = this.outcome.promise

  constructor(pid: number, events: string[]) {
    this.pid = pid
    this.events = events
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        for (const line of String(chunk).split('\n').filter(Boolean)) this.onMessage(JSON.parse(line) as Record<string, unknown>)
        callback()
      },
    })
  }

  terminate(): void {
    this.events.push(`terminate:${this.pid}`)
    this.terminated = true
    this.exit(null, 'SIGTERM')
  }

  async waitForExit(): Promise<boolean> {
    this.events.push(`wait:${this.pid}`)
    await this.done
    await this.exitBarrier
    this.events.push(`exited:${this.pid}`)
    return true
  }

  crash(): void {
    this.exit(1, null)
  }

  send(value: unknown): void {
    this.stdout.write(`${JSON.stringify(value)}\n`)
  }

  private exit(exitCode: number | null, signal: NodeJS.Signals | null): void {
    if (this.settled) return
    this.settled = true
    ;(this.stdout as PassThrough | undefined)?.end()
    this.outcome.resolve({ exitCode, signal })
  }

  private onMessage(message: Record<string, unknown>): void {
    this.messages.push(message)
    const id = message.id
    if (message.method === 'initialize' && this.respondToInitialize) {
      queueMicrotask(() => this.send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          serverInfo: { name: 'fake-pennivo', version: '1.4.0' },
        },
      }))
    }
    if (message.method === 'tools/list' && this.respondToTools) {
      queueMicrotask(() => this.send({
        jsonrpc: '2.0',
        id,
        result: { tools: [{ name: 'read_file', inputSchema: { type: 'object' } }] },
      }))
    }
  }
}

class FakeSubprocess {
  readonly specs: SubprocessSpawnSpec[] = []
  readonly handles: FakeHandle[] = []
  readonly events: string[] = []
  respondToInitialize = true
  malformedStdio = false

  async resolveExecutable(command: string): Promise<string> {
    this.events.push(`resolve:${command}`)
    return command
  }

  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    this.specs.push(spec)
    const handle = new FakeHandle(100 + this.handles.length, this.events)
    handle.respondToInitialize = this.respondToInitialize
    if (this.malformedStdio) {
      Object.defineProperty(handle, 'stdout', { configurable: true, value: undefined })
    }
    this.handles.push(handle)
    this.events.push(`spawn:${handle.pid}`)
    return handle
  }
}

function manager(runtime: FakeSubprocess, overrides: Record<string, unknown> = {}) {
  let sequence = 0
  return new PennivoChildManager(runtime as never, {
    resolveArgv: async () => ['/usr/bin/node', '/package/pennivo-mcp.js'],
    randomId: () => `child-${++sequence}`,
    requestTimeoutMs: 50,
    restartDelayMs: 0,
    lifetimeMs: 60_000,
    ...overrides,
  })
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof PennivoChildError && error.code === code
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal(predicate(), true, 'condition did not become true before the test deadline')
}

test('starts the pinned child in a scratch workspace with a restricted environment', async () => {
  const runtime = new FakeSubprocess()
  const child = manager(runtime)
  try {
    const info = await child.ensure(binding)
    const tools = await child.listTools(binding)
    const spec = runtime.specs[0]!

    assert.equal(info.instanceId, 'child-1')
    assert.deepEqual(tools, { tools: [{ name: 'read_file', inputSchema: { type: 'object' } }] })
    assert.deepEqual(runtime.handles[0]?.messages.map(message => message.method), [
      'initialize',
      'notifications/initialized',
      'tools/list',
    ])
    assert.equal(runtime.handles[0]?.messages.some(message => message.method === 'tools/call'), false)
    assert.deepEqual(spec.argv.slice(-2), ['--workspace', '.'])
    assert.equal(spec.argv.includes('npx'), false)
    assert.equal(JSON.stringify(spec).includes(binding.vaultId), false)
    assert.equal(spec.stdio.stdin, 'pipe')
    assert.equal(spec.stdio.stdout, 'pipe')
    assert.equal(typeof spec.stdio.stderr, 'object')
    assert.equal(spec.env?.DEEPSEEK_API_KEY, undefined)
    assert.equal(spec.env?.DSH_HOME, undefined)
    await access(spec.cwd)
  } finally {
    const cwd = runtime.specs[0]?.cwd
    await child.dispose()
    if (cwd) await assert.rejects(access(cwd))
  }
})

test('concurrent callers wait for initialization before publishing or listing tools', async () => {
  const runtime = new FakeSubprocess()
  runtime.respondToInitialize = false
  const instances: Array<string | null> = []
  const child = manager(runtime, { requestTimeoutMs: 1_000, onInstanceChange: (id: string | null) => instances.push(id) })
  const starting = Promise.allSettled([child.ensure(binding)])
  let concurrent: Promise<PromiseSettledResult<unknown>[]> | undefined
  try {
    await waitFor(() => runtime.handles[0]?.messages[0]?.method === 'initialize')
    const handle = runtime.handles[0]!
    let settled = false
    concurrent = Promise.allSettled([child.ensure(binding), child.listTools(binding)]).then(results => { settled = true; return results })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(handle.messages.map(message => message.method), ['initialize'])
    assert.equal(settled, false)
    assert.equal(child.active(), null)
    assert.deepEqual(instances, [])

    handle.send({ jsonrpc: '2.0', id: handle.messages[0]!.id, result: {
      protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fake-pennivo', version: '1.4.0' },
    } })
    assert.equal((await starting)[0]!.status, 'fulfilled')
    assert.deepEqual((await concurrent).map(result => result.status), ['fulfilled', 'fulfilled'])
    assert.deepEqual(handle.messages.map(message => message.method), ['initialize', 'notifications/initialized', 'tools/list'])
    assert.deepEqual(instances, ['child-1'])
    assert.equal(child.active()?.instanceId, 'child-1')
  } finally {
    await child.dispose()
    await starting
    await concurrent
  }
})

test('failed initialization rejects every waiter without publishing a ready instance', async () => {
  const runtime = new FakeSubprocess()
  runtime.respondToInitialize = false
  const instances: Array<string | null> = []
  const child = manager(runtime, { requestTimeoutMs: 1_000, onInstanceChange: (id: string | null) => instances.push(id) })
  const starting = Promise.allSettled([child.ensure(binding)])
  let concurrent: Promise<PromiseSettledResult<unknown>[]> | undefined
  try {
    await waitFor(() => runtime.handles[0]?.messages[0]?.method === 'initialize')
    concurrent = Promise.allSettled([child.ensure(binding), child.listTools(binding)])
    const handle = runtime.handles[0]!
    handle.send({ jsonrpc: '2.0', id: handle.messages[0]!.id, result: {
      protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fake-pennivo', version: '0.0.0' },
    } })
    for (const result of [...await starting, ...await concurrent]) {
      assert.equal(result.status, 'rejected')
      if (result.status === 'rejected') assert.equal(expectCode(result.reason, 'VERSION_MISMATCH'), true)
    }
    assert.deepEqual(handle.messages.map(message => message.method), ['initialize'])
    assert.deepEqual(instances, [])
    assert.equal(child.active(), null)
    await assert.rejects(access(runtime.specs[0]!.cwd))
  } finally {
    await child.dispose()
    await starting
    await concurrent
  }
})

test('a superseding binding waits for initialization retirement then starts its own child', async () => {
  const runtime = new FakeSubprocess()
  runtime.respondToInitialize = false
  const child = manager(runtime, { requestTimeoutMs: 1_000 })
  const starting = assert.rejects(child.ensure(binding), error => expectCode(error, 'CHILD_REPLACED'))
  let replacement: Promise<PromiseSettledResult<unknown>[]> | undefined
  try {
    await waitFor(() => runtime.handles[0]?.messages[0]?.method === 'initialize')
    const handle = runtime.handles[0]!
    runtime.respondToInitialize = true
    replacement = Promise.allSettled([child.ensure({ ...binding, vaultGeneration: 2 })])
    handle.send({ jsonrpc: '2.0', id: handle.messages[0]!.id, result: {
      protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fake-pennivo', version: '1.4.0' },
    } })
    await starting
    assert.equal((await replacement)[0]!.status, 'fulfilled')
    assert.equal(child.active()?.binding.vaultGeneration, 2)
    assert.ok(runtime.events.indexOf('exited:100') < runtime.events.indexOf('spawn:101'))
  } finally {
    await child.dispose()
    await starting
    await replacement
  }
})

for (const cause of ['protocol', 'crash'] as const) {
  test(`replacement waits for ${cause} retirement and is not retired by the old restart timer`, async t => {
    const runtime = new FakeSubprocess()
    const child = manager(runtime, { restartDelayMs: 100 })
    const retired = deferred<void>()
    let replacement: ReturnType<PennivoChildManager['ensure']> | undefined
    try {
      await child.ensure(binding)
      runtime.handles[0]!.exitBarrier = retired.promise
      if (cause === 'protocol') runtime.handles[0]!.stdout.write('{not-json}\n')
      else runtime.handles[0]!.crash()
      await waitFor(() => runtime.events.includes('wait:100'))
      t.mock.timers.enable({ apis: ['setTimeout'] })
      replacement = child.ensure(binding)
      retired.resolve()
      const info = await replacement
      assert.ok(runtime.events.indexOf('exited:100') < runtime.events.indexOf('spawn:101'))
      await assert.rejects(access(runtime.specs[0]!.cwd))
      t.mock.timers.tick(100)
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(child.active()?.instanceId, info.instanceId, 'an old restart must not replace the ready child')
      assert.equal(runtime.handles.length, 2)
    } finally {
      retired.resolve()
      await replacement?.catch(() => undefined)
      await child.dispose()
    }
  })
}

test('replaces only after old-tree quiescence and drops late old-child results', async () => {
  const runtime = new FakeSubprocess()
  const instances: Array<string | null> = []
  const child = manager(runtime, { onInstanceChange: (current: string | null) => instances.push(current) })
  await child.ensure(binding)
  runtime.handles[0]!.respondToTools = false
  const pending = assert.rejects(child.listTools(binding), error => expectCode(error, 'CHILD_REPLACED'))

  const replacement = await child.ensure({ ...binding, vaultGeneration: 2 })
  runtime.handles[0]!.send({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'late' }] } })

  await pending
  assert.equal(replacement.instanceId, 'child-2')
  assert.deepEqual(instances, ['child-1', null, 'child-2'])
  assert.deepEqual(runtime.events.filter(event => /^(?:terminate|wait|spawn):/u.test(event)), [
    'spawn:100',
    'terminate:100',
    'wait:100',
    'spawn:101',
  ])
  await child.dispose()
})

test('malformed and oversized JSON-RPC fail closed and a later ensure restarts', async () => {
  const runtime = new FakeSubprocess()
  const child = manager(runtime, { maxLineBytes: 256 })
  const first = await child.ensure(binding)
  runtime.handles[0]!.stdout.write('{not-json}\n')
  await new Promise(resolve => setTimeout(resolve, 0))

  const restarted = await child.ensure(binding)
  assert.notEqual(restarted.instanceId, first.instanceId)

  runtime.handles[1]!.stdout.write(`${'x'.repeat(257)}\n`)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(runtime.handles[1]!.terminated, true)
  await child.dispose()
})

for (const action of ['stop', 'dispose'] as const) {
  test(`${action} waits for a protocol-failed child to finish retiring`, async () => {
    const runtime = new FakeSubprocess()
    const child = manager(runtime, { maxRestarts: 0 })
    const retired = deferred<void>()
    let stopping: Promise<void> | undefined
    try {
      await child.ensure(binding)
      runtime.handles[0]!.exitBarrier = retired.promise
      runtime.handles[0]!.stdout.write('{not-json}\n')
      await waitFor(() => runtime.events.includes('wait:100'))
      let settled = false
      stopping = Promise.all([child[action](), child[action]()]).then(() => { settled = true })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(settled, false, 'all callers must await whole-tree exit')
      assert.equal(child.active(), null)
      await access(runtime.specs[0]!.cwd)
      retired.resolve()
      await stopping
      await assert.rejects(access(runtime.specs[0]!.cwd))
      assert.equal(runtime.handles.length, 1)
    } finally {
      retired.resolve()
      await stopping
      await child.dispose()
    }
  })
}

test('bounds pending requests, timeout, crash restart, and complete disposal', async () => {
  const runtime = new FakeSubprocess()
  const child = manager(runtime, { requestTimeoutMs: 10, maxRestarts: 1 })
  try {
    await child.ensure(binding)
    runtime.handles[0]!.respondToTools = false

    await assert.rejects(child.listTools(binding), error => expectCode(error, 'TIMEOUT'))
    runtime.handles[0]!.crash()
    await waitFor(() => runtime.handles.length === 2)

    runtime.handles[1]!.respondToTools = false
    const pending = assert.rejects(
      child.listTools(binding),
      error => expectCode(error, 'DISPOSED') || expectCode(error, 'CHILD_REPLACED'),
    )
    await child.dispose()
    await pending
    assert.equal(runtime.handles.every(handle => handle.terminated || handle === runtime.handles[0]), true)
    assert.equal(child.active(), null)
  } finally {
    await child.dispose()
  }
})

test('caps concurrent requests and disposes a child still initializing', async () => {
  const runtime = new FakeSubprocess()
  const child = manager(runtime, { maxPending: 1, requestTimeoutMs: 100 })
  await child.ensure(binding)
  runtime.handles[0]!.respondToTools = false
  const first = assert.rejects(
    child.listTools(binding),
    error => expectCode(error, 'DISPOSED') || expectCode(error, 'CHILD_REPLACED'),
  )
  await new Promise(resolve => setTimeout(resolve, 0))
  await assert.rejects(child.listTools(binding), error => expectCode(error, 'TOO_MANY_PENDING'))
  await child.dispose()
  await first

  const initializingRuntime = new FakeSubprocess()
  initializingRuntime.respondToInitialize = false
  const initializing = manager(initializingRuntime, { requestTimeoutMs: 1_000 })
  const start = assert.rejects(initializing.ensure(binding), error => expectCode(error, 'DISPOSED'))
  while (initializingRuntime.handles.length === 0) await new Promise(resolve => setTimeout(resolve, 0))
  await initializing.dispose()
  await start
  assert.equal(initializingRuntime.handles[0]!.terminated, true)
  assert.equal(initializing.active(), null)
})

test('stop fences a startup still resolving argv before any spawn', async () => {
  const runtime = new FakeSubprocess()
  const argv = deferred<readonly string[]>()
  let resolving = false
  const child = manager(runtime, {
    resolveArgv: () => {
      resolving = true
      return argv.promise
    },
  })
  const starting = assert.rejects(child.ensure(binding), error => expectCode(error, 'CHILD_REPLACED'))
  await waitFor(() => resolving)
  const stopping = child.stop()
  argv.resolve(['/usr/bin/node', '/package/pennivo-mcp.js'])
  await stopping
  await starting

  assert.equal(runtime.handles.length, 0)
  assert.equal(child.active(), null)
  await child.dispose()
})

test('a spawned handle with malformed stdio is terminated before startup fails', async () => {
  const runtime = new FakeSubprocess()
  runtime.malformedStdio = true
  const child = manager(runtime)
  await assert.rejects(child.ensure(binding), error => expectCode(error, 'START_FAILED'))

  assert.equal(runtime.handles.length, 1)
  assert.equal(runtime.handles[0]?.terminated, true)
  assert.equal(child.active(), null)
  await child.dispose()
})

test('package pins Pennivo provenance and distribution notice', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
    files?: string[]
  }
  const provenance = await readFile(new URL('../PENNIVO_PROVENANCE.md', import.meta.url), 'utf8')
  const notice = await readFile(new URL('../THIRD_PARTY_NOTICES/Pennivo.txt', import.meta.url), 'utf8')

  assert.equal(manifest.dependencies?.['@pennivo/mcp-server'], '1.4.0')
  assert.equal(manifest.files?.includes('THIRD_PARTY_NOTICES'), true)
  assert.match(provenance, /eba774ce4e0422c7fcd61a16e4fd4da2dab59d6c/)
  assert.match(provenance, /runtime downloads are forbidden/i)
  assert.match(notice, /MIT License/)
  assert.match(notice, /Copyright \(c\) 2026 Paya Ebrahimi/)
})
