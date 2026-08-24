import assert from 'node:assert/strict'
import test from 'node:test'

import { TockTeamDesktopGrantError, type NativeOperationIdentity } from '@tockteam/desktop/host'
import { ImportExportError, sha256 } from '../src/core.ts'
import {
  ReviewedOperationEngine,
  type DesktopPickerPort,
  type RuntimePort,
} from '../src/engine.ts'

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)
const vault = { generation: 4, id: `vault:${'4'.repeat(64)}` }
const identity: NativeOperationIdentity = {
  operationId: 'operation-1',
  requestId: 'request-1',
  sessionId: 'main-session-1',
  vaultGeneration: vault.generation,
  vaultId: vault.id,
  windowId: 'main-window-1',
}
const secondIdentity: NativeOperationIdentity = {
  ...identity,
  operationId: 'operation-2',
  requestId: 'request-2',
}

class FakePicker implements DesktopPickerPort {
  afterRevalidate: (() => void) | undefined
  changed = false
  expiresAt = 500_000
  operationId = identity.operationId
  picked = 0
  pickWait: Promise<void> | undefined
  released = 0
  revalidateWait: Promise<void> | undefined
  private readonly files = new Map([
    ['a', { bytes: encode('# A\n'), path: 'A.md', revision: 'file-a' }],
    ['image', { bytes: new Uint8Array([1, 2, 3]), path: 'image.png', revision: 'file-image' }],
  ])

  async pick(_request: never): Promise<never> {
    this.picked += 1
    await this.pickWait
    return { authorization: 'authorization', label: 'Course Export', operationId: this.operationId, status: 'selected' } as never
  }

  async beginSource(): Promise<never> {
    return { expiresAt: this.expiresAt, root: { kind: 'directory', revision: 'root-1' }, session: 'source-session' } as never
  }

  async listSource(): Promise<never> {
    return {
      complete: true,
      cursor: null,
      entries: [
        { entryId: 'image', kind: 'file', relativePath: 'image.png', revision: 'file-image', size: 3 },
        { entryId: 'a', kind: 'file', relativePath: 'A.md', revision: 'file-a', size: 4 },
        { kind: 'rejected', label: 'unsafe-link', reason: 'symlink' },
      ],
      rootRevision: 'root-1',
      scannedBytes: 7,
      scannedEntries: 3,
      truncated: false,
      truncationReason: null,
    } as never
  }

  async readSource(request: { entryId: string; offset: number }): Promise<never> {
    const file = this.files.get(request.entryId)
    assert.ok(file)
    assert.equal(request.offset, 0)
    return {
      bytes: file.bytes,
      complete: true,
      nextOffset: file.bytes.byteLength,
      revision: file.revision,
      size: file.bytes.byteLength,
    } as never
  }

  async revalidateSource(): Promise<never> {
    if (this.changed) throw new TockTeamDesktopGrantError('changed')
    await this.revalidateWait
    this.afterRevalidate?.()
    return { revision: 'root-1', status: 'unchanged' } as never
  }

  async releaseSource(): Promise<never> {
    this.released += 1
    return { status: this.released === 1 ? 'released' : 'already-released' } as never
  }
}

class FakeRuntime implements RuntimePort {
  readonly created: string[] = []
  existing = new Set<string>()
  failCode = 'unavailable'
  failPath: string | null = null
  state: { active: true; generation: number; id: string } = { active: true, ...vault }

  async listTree(): Promise<never> {
    return {
      complete: true,
      cursor: null,
      entries: [...this.existing].map(path => ({
        createdAt: 1,
        kind: path.endsWith('.md') ? 'document' : 'attachment',
        mediaKind: 'image',
        modifiedAt: 1,
        path,
        revision: `revision:${path}`,
        size: 1,
      })),
      generation: vault.generation,
      scan: { entries: this.existing.size },
      truncated: false,
      truncationReason: null,
      warnings: [],
    } as never
  }

  async createDocument(request: { content: string; path: string }): Promise<never> {
    if (this.failPath === request.path) {
      if (this.failCode === 'partial') {
        this.existing.add(request.path)
        this.created.push(request.path)
      }
      throw Object.assign(new Error('write failed'), { code: this.failCode })
    }
    if (this.existing.has(request.path)) throw Object.assign(new Error('exists'), { code: 'exists' })
    this.existing.add(request.path)
    this.created.push(request.path)
    return { digest: sha256(request.content), generation: vault.generation, path: request.path, revision: 'created', status: 'created' } as never
  }

  async storeAttachment(request: { data: Uint8Array; path: string }): Promise<never> {
    if (this.failPath === request.path) {
      if (this.failCode === 'partial') {
        this.existing.add(request.path)
        this.created.push(request.path)
      }
      throw Object.assign(new Error('write failed'), { code: this.failCode })
    }
    if (this.existing.has(request.path)) throw Object.assign(new Error('exists'), { code: 'exists' })
    this.existing.add(request.path)
    this.created.push(request.path)
    return { digest: sha256(request.data), generation: vault.generation, path: request.path, revision: 'stored', status: 'stored' } as never
  }
}

function engine(picker = new FakePicker(), runtime = new FakeRuntime()) {
  let token = 0
  return {
    picker,
    runtime,
    service: new ReviewedOperationEngine({
      now: () => 1_000,
      picker,
      randomToken: () => `secret-${String(++token)}`,
      runtime,
    }),
  }
}

test('coalesces an in-flight inspection retry without opening another picker', async () => {
  const { picker, service } = engine()
  let resume = (): void => {}
  picker.pickWait = new Promise<void>(resolve => { resume = resolve })
  const first = service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  const second = service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  assert.equal(first, second)
  assert.equal(picker.picked, 1)
  resume()
  assert.deepEqual(await second, await first)
})

test('abandons a response-lost inspection without a review token', async () => {
  const { picker, service } = engine()
  let resume = (): void => {}
  picker.pickWait = new Promise<void>(resolve => { resume = resolve })
  const inspecting = service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  const abandoning = service.abandon({ format: 'markdown-folder', identity })
  resume()
  await inspecting
  assert.deepEqual(await abandoning, { status: 'cancelled' })
  assert.equal(picker.released, 1)
  await assert.rejects(
    service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'replayed',
  )
})

test('normalizes cancellation during a picker await to the aborted contract', async () => {
  const { picker, service } = engine()
  let resume = (): void => {}
  picker.pickWait = new Promise<void>(resolve => { resume = resolve })
  const abort = new AbortController()
  const inspecting = service.inspect({ format: 'markdown-folder', identity }, abort.signal)
  abort.abort('caller-disconnected')
  resume()
  await assert.rejects(
    inspecting,
    (error: unknown) => error instanceof ImportExportError && error.code === 'aborted',
  )
})

test('bounds abandoned plans and automatically releases an expired source', async () => {
  const { picker, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  await assert.rejects(
    service.inspect({ format: 'markdown-folder', identity: secondIdentity }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'limit-exceeded',
  )
  assert.equal(picker.picked, 1)
  await service.cancel({ operationId: preview.operationId, reviewToken: preview.reviewToken })

  picker.expiresAt = 1_001
  picker.operationId = secondIdentity.operationId
  const expiring = await service.inspect({ format: 'markdown-folder', identity: secondIdentity }, AbortSignal.timeout(5_000))
  await new Promise(resolve => setTimeout(resolve, 10))
  await assert.rejects(
    service.approve({ operationId: expiring.operationId, planDigest: expiring.planDigest, reviewToken: expiring.reviewToken }),
    (error: unknown) => error instanceof ImportExportError && error.code === 'not-found',
  )
  assert.equal(picker.released, 2)
})

test('runs reviewed commit once and returns the same result after response loss', async () => {
  const { picker, runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  assert.deepEqual(preview.items.map(item => item.destination), ['A.md', 'image.png'])
  assert.deepEqual(preview.skipped, [{ label: 'unsafe-link', reason: 'symlink' }])
  assert.equal(JSON.stringify(preview).includes('source-session'), false)
  assert.equal(JSON.stringify(preview).includes('# A'), false)
  assert.deepEqual(
    await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000)),
    preview,
  )
  assert.equal(picker.picked, 1)

  await service.approve({
    operationId: identity.operationId,
    planDigest: preview.planDigest,
    reviewToken: preview.reviewToken,
  })
  const binding = {
    operationId: identity.operationId,
    planDigest: preview.planDigest,
    reviewToken: preview.reviewToken,
  }
  let resume = (): void => {}
  picker.revalidateWait = new Promise<void>(resolve => { resume = resolve })
  const committing = service.commit(binding, AbortSignal.timeout(5_000))
  const repeated = service.commit(binding, AbortSignal.timeout(5_000))
  assert.equal(committing, repeated)
  resume()
  const result = await committing
  assert.equal(result.status, 'committed')
  assert.deepEqual(result.committed.map(item => item.destination), ['A.md', 'image.png'])
  assert.deepEqual(result.recovery, { snapshots: [], status: 'not-needed', trash: [] })
  assert.equal(picker.released, 1)
  assert.deepEqual(runtime.created, ['A.md', 'image.png'])
  const retried = await service.commit(binding, AbortSignal.timeout(5_000))
  assert.deepEqual(retried, result)
  assert.deepEqual(runtime.created, ['A.md', 'image.png'])

  runtime.existing.clear()
  picker.operationId = secondIdentity.operationId
  const secondPreview = await service.inspect({ format: 'markdown-folder', identity: secondIdentity }, AbortSignal.timeout(5_000))
  const secondBinding = {
    operationId: secondIdentity.operationId,
    planDigest: secondPreview.planDigest,
    reviewToken: secondPreview.reviewToken,
  }
  await service.approve(secondBinding)
  await service.commit(secondBinding, AbortSignal.timeout(5_000))
  assert.deepEqual(await service.commit(binding, AbortSignal.timeout(5_000)), result)
})

test('bounded completed evidence does not block normal sequential imports', async () => {
  const { picker, runtime, service } = engine()
  for (let index = 0; index < 5; index += 1) {
    const operationIdentity = {
      ...identity,
      operationId: `sequential-${String(index)}`,
      requestId: `sequential-request-${String(index)}`,
    }
    picker.operationId = operationIdentity.operationId
    runtime.existing.clear()
    const plan = await service.inspect({ format: 'markdown-folder', identity: operationIdentity }, AbortSignal.timeout(5_000))
    const binding = { operationId: plan.operationId, planDigest: plan.planDigest, reviewToken: plan.reviewToken }
    await service.approve(binding)
    await service.commit(binding, AbortSignal.timeout(5_000))
  }
  assert.equal(picker.picked, 5)
})

test('rejects a picker result bound to another caller operation', async () => {
  const { picker, runtime, service } = engine()
  picker.operationId = 'foreign-operation'
  await assert.rejects(
    service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'stale-source',
  )
  assert.deepEqual(runtime.created, [])
})

test('fails a changed source before the first runtime mutation and consumes approval once', async () => {
  const { picker, runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  await service.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken })
  picker.changed = true
  await assert.rejects(
    service.commit({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'stale-source',
  )
  assert.deepEqual(runtime.created, [])
  assert.equal(picker.released, 1)
})

test('revalidates the current runtime after awaiting source identity', async () => {
  const { picker, runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  await service.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken })
  picker.afterRevalidate = () => {
    runtime.state = { active: true, generation: vault.generation + 1, id: vault.id }
  }
  await assert.rejects(
    service.commit({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'stale-vault',
  )
  assert.deepEqual(runtime.created, [])
})

test('preflights commit-time collisions, preserves them, and commits remaining files', async () => {
  const { runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  await service.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken })
  runtime.existing.add('A.md')
  const result = await service.commit({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }, AbortSignal.timeout(5_000))
  assert.equal(result.status, 'partial')
  assert.deepEqual(result.skipped, [{ destination: 'A.md', reason: 'exists' }])
  assert.deepEqual(result.committed.map(item => item.destination), ['image.png'])
  assert.deepEqual(runtime.created, ['image.png'])
})

test('rejects malformed approval and a vault-generation change before the first write', async () => {
  const { runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  await assert.rejects(
    service.approve({ operationId: identity.operationId, planDigest: `sha256:${'0'.repeat(64)}`, reviewToken: preview.reviewToken }),
    (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-plan',
  )
  await service.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken })
  runtime.state = { active: true, generation: vault.generation + 1, id: vault.id }
  await assert.rejects(
    service.commit({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'stale-vault',
  )
  assert.deepEqual(runtime.created, [])
})

test('returns honest partial failure evidence without rewriting committed creates', async () => {
  const { runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  await service.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken })
  runtime.failPath = 'image.png'
  const result = await service.commit({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }, AbortSignal.timeout(5_000))
  assert.equal(result.status, 'partial')
  assert.deepEqual(result.committed.map(item => item.destination), ['A.md'])
  assert.deepEqual(result.failed, [{ destination: 'image.png', reason: 'unavailable' }])
  assert.deepEqual(result.recovery, { snapshots: [], status: 'not-needed', trash: [] })
})

test('requires recovery and stops after Runtime reports a partial create', async () => {
  const { runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  runtime.failCode = 'partial'
  runtime.failPath = 'A.md'
  const result = await service.commit(binding, AbortSignal.timeout(5_000))
  assert.deepEqual(result.failed, [{ destination: 'A.md', reason: 'partial' }])
  assert.deepEqual(result.skipped, [{ destination: 'image.png', reason: 'cancelled' }])
  assert.deepEqual(result.recovery, { snapshots: [], status: 'required', trash: [] })
  assert.deepEqual(runtime.created, ['A.md'])
})

test('does not report cancellation after a reviewed commit has started', async () => {
  const { picker, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  let resume = (): void => {}
  picker.revalidateWait = new Promise<void>(resolve => { resume = resolve })
  const committing = service.commit(binding, AbortSignal.timeout(5_000))
  await assert.rejects(
    service.cancel({ operationId: identity.operationId, reviewToken: preview.reviewToken }),
    (error: unknown) => error instanceof ImportExportError && error.code === 'replayed',
  )
  resume()
  assert.equal((await committing).status, 'committed')
})

test('unload aborts and awaits an in-flight runtime commit', async () => {
  const { picker, runtime, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  let resume = (): void => {}
  picker.revalidateWait = new Promise<void>(resolve => { resume = resolve })
  const committing = service.commit(binding, AbortSignal.timeout(5_000)).then(
    () => 'resolved' as const,
    () => 'rejected' as const,
  )
  let disposed = false
  const disposing = service.dispose().then(() => { disposed = true })
  await Promise.resolve()
  assert.equal(disposed, false)
  resume()
  await disposing
  assert.equal(await committing, 'rejected')
  assert.deepEqual(runtime.created, [])
  assert.ok(picker.released >= 1)
})

test('cancellation, unload, and restart release sessions and invalidate plans', async () => {
  const { picker, service } = engine()
  const preview = await service.inspect({ format: 'markdown-folder', identity }, AbortSignal.timeout(5_000))
  await service.dispose()
  assert.equal(picker.released, 1)
  await assert.rejects(
    service.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }),
    (error: unknown) => error instanceof ImportExportError && error.code === 'not-found',
  )
  const restarted = engine().service
  await assert.rejects(
    restarted.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }),
    (error: unknown) => error instanceof ImportExportError && error.code === 'not-found',
  )
  await restarted.dispose()
})
