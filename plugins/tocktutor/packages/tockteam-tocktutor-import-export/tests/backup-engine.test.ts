import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type { NativeOperationIdentity } from '@tockteam/desktop/host'

import { verifyBackupArchive } from '../src/backup.ts'
import {
  ReviewedBackupEngine,
  type BackupDesktopPort,
  type BackupRuntimePort,
} from '../src/backup-engine.ts'
import { ImportExportError, sha256 } from '../src/core.ts'
const runtimeModule = new URL('../../tockbot-note-runtime/src/index.ts', import.meta.url).href
const { default: NoteVaultRuntime, Config, NoteVaultError } = await import(runtimeModule) as typeof import('tockbot-note-runtime')
const vault = { generation: 3, id: `vault:${'3'.repeat(64)}` }
const identity: NativeOperationIdentity = {
  operationId: 'backup-1',
  requestId: 'request-1',
  sessionId: 'main-session-1',
  vaultGeneration: vault.generation,
  vaultId: vault.id,
  windowId: 'main-window-1',
}
const secondIdentity: NativeOperationIdentity = {
  ...identity,
  operationId: 'backup-2',
  requestId: 'request-2',
}

class FakeRuntime implements BackupRuntimePort {
  changed = false
  state = { active: true as const, ...vault }

  async listTree(): Promise<never> {
    return {
      complete: true,
      cursor: null,
      entries: [
        { createdAt: 1, kind: 'document', modifiedAt: 1, path: 'Folder/Note.md', revision: this.changed ? 'changed' : 'note-rev', size: 7 },
        { createdAt: 1, kind: 'attachment', mediaKind: 'image', modifiedAt: 1, path: 'image.png', revision: 'image-rev', size: 2 },
      ],
      generation: vault.generation,
      scan: { entries: 2 },
      truncated: false,
      truncationReason: null,
      warnings: [],
    } as never
  }

  async listPassiveBackupEntries(): Promise<never> {
    return {
      entries: [{ path: '.obsidian/app.json', revision: this.changed ? 'changed' : 'config-rev', size: 17 }],
      generation: vault.generation,
    } as never
  }

  async openDocument(): Promise<never> {
    return { content: '# Note\n', digest: sha256('# Note\n'), generation: vault.generation, path: 'Folder/Note.md', revision: 'note-rev' } as never
  }

  async readPassiveBackupEntry(): Promise<never> {
    const data = new TextEncoder().encode('{"theme":"dark"}\n')
    return { data, digest: sha256(data), generation: vault.generation, path: '.obsidian/app.json', revision: 'config-rev', size: 17 } as never
  }

  async previewAttachment(): Promise<never> {
    return { data: new Uint8Array([1, 2]), digest: sha256(new Uint8Array([1, 2])), generation: vault.generation, mediaKind: 'image', mimeType: 'image/png', path: 'image.png', revision: 'image-rev', size: 2 } as never
  }
}

class FakeDesktop implements BackupDesktopPort {
  abortCleanup: 'retained' | 'scrubbed' = 'scrubbed'
  afterBegin: (() => void) | undefined
  beginStarted: (() => void) | undefined
  beginWait: Promise<void> | undefined
  readonly calls: string[] = []
  expiresAt = 500_000
  operationId = identity.operationId
  pickWait: Promise<void> | undefined
  planDigest = ''
  rejectFinalize = false
  written = new Uint8Array()

  async pick(): Promise<never> {
    this.calls.push('pick')
    await this.pickWait
    return { authorization: 'selection', label: 'backup.zip', operationId: this.operationId, status: 'selected' } as never
  }

  async lockDestinationPlan(request: { planDigest: string }): Promise<never> {
    this.calls.push('lock')
    this.planDigest = request.planDigest
    return { authorization: 'locked-plan', expectedState: { status: 'absent' }, expiresAt: this.expiresAt } as never
  }

  async beginDestination(): Promise<never> {
    this.calls.push('begin')
    this.beginStarted?.()
    await this.beginWait
    this.afterBegin?.()
    return { expectedState: { status: 'absent' }, expiresAt: 500_000, session: 'destination-session' } as never
  }

  async writeDestinationChunk(request: { bytes: Uint8Array }): Promise<never> {
    this.calls.push('write')
    this.written = new Uint8Array([...this.written, ...request.bytes])
    return { acceptedBytes: request.bytes.byteLength, nextOffset: this.written.byteLength } as never
  }

  async finalizeDestination(): Promise<never> {
    this.calls.push('finalize')
    if (this.rejectFinalize) throw new Error('finalize response lost')
    return { bytes: this.written.byteLength, cleanup: { status: 'complete' }, entries: 1, label: 'backup.zip', planDigest: this.planDigest, status: 'published' } as never
  }

  async abortDestination(): Promise<never> {
    this.calls.push('abort')
    return this.abortCleanup === 'retained'
      ? { cleanup: { status: 'retained', residualLabels: ['backup.zip'] }, stagedBytes: 0, stagedEntries: 0, status: 'already-closed' } as never
      : { cleanup: { status: 'scrubbed', residualLabels: ['stage'] }, stagedBytes: this.written.byteLength, stagedEntries: 1, status: 'aborted' } as never
  }

  async revokeDestinationPlan(): Promise<never> {
    this.calls.push('revoke')
    return { status: 'revoked' } as never
  }
}

function setup() {
  const runtime = new FakeRuntime()
  const desktop = new FakeDesktop()
  return {
    desktop,
    runtime,
    service: new ReviewedBackupEngine({
      desktop,
      now: () => 1_000,
      randomToken: () => 'backup-secret',
      runtime,
    }),
  }
}

test('backup preserves runtime-readable note aliases as independent restored documents', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-backup-alias-'))
  const root = join(temporary, 'vault')
  const context = new Context()
  const desktop = new FakeDesktop()
  let service: ReviewedBackupEngine | undefined
  try {
    await mkdir(root)
    const documents = [
      ['base', 'views:\r\n  - type: table\r\n    name: All\r\n'],
      ['canvas', '{"nodes":[],"edges":[]}\n'],
      ['markdown', '\uFEFF# Unicode note\n中文 🙂\n'],
      ['md', '# Original note\r\n\r\nExact source bytes\r\n'],
    ] as const
    for (const [extension, content] of documents) {
      await writeFile(join(root, `Original.${extension}`), content)
      await symlink(`Original.${extension}`, join(root, `Alias.${extension}`))
    }
    await context.plugin(NoteVaultRuntime, { ...Config(), stateRoot: null, vaultRoot: root })
    const runtime = context.noteVault
    const current = runtime.state
    assert.ok(current.active)
    const signal = AbortSignal.timeout(5_000)
    const inventory = await runtime.listTree({ expectedVault: current }, signal)
    for (const [extension, content] of documents) {
      const aliasPath = `Alias.${extension}`
      const alias = await runtime.openDocument(aliasPath, current, signal)
      const original = await runtime.openDocument(`Original.${extension}`, current, signal)
      assert.equal(alias.content, content)
      assert.equal(alias.revision, original.revision, 'editor opens must preserve canonical save revisions')
      const inventoried = inventory.entries.find(entry => entry.path === aliasPath)
      assert.ok(inventoried)
      assert.notEqual(inventoried.revision, alias.revision)
    }
    service = new ReviewedBackupEngine({ desktop, now: () => 1_000, randomToken: () => 'alias-review', runtime })
    const preview = await service.prepare({ identity: { ...identity, vaultId: current.id, vaultGeneration: current.generation } }, signal)
    const binding = { operationId: preview.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
    await service.approve(binding)
    assert.equal((await service.commit(binding, signal)).status, 'published')
    const restored = verifyBackupArchive(desktop.written)
    assert.deepEqual(restored.entries.map(entry => [entry.path, Buffer.from(entry.bytes).toString('utf8')]),
      ['Alias', 'Original'].flatMap(stem => documents.map(([extension, content]) => [`${stem}.${extension}`, content])))
    const restoredRoot = join(temporary, 'restored-vault')
    await mkdir(restoredRoot)
    const restoredVault = runtime.activate(restoredRoot, current.generation)
    assert.ok(restoredVault.active)
    for (const entry of restored.entries) {
      await runtime.createDocument({ path: entry.path, expectedVault: restoredVault,
        content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(entry.bytes) }, signal)
      assert.deepEqual(await readFile(join(restoredRoot, entry.path)), Buffer.from(entry.bytes))
      assert.equal((await lstat(join(restoredRoot, entry.path))).isSymbolicLink(), false)
    }
  } finally {
    await service?.dispose()
    await context.fiber.dispose()
    await rm(temporary, { recursive: true, force: true })
  }
})

test('backup rejects lossy UTF-8 note bytes even when decoded length matches', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-backup-encoding-'))
  const root = join(temporary, 'vault')
  const context = new Context()
  const desktop = new FakeDesktop()
  let service: ReviewedBackupEngine | undefined
  try {
    await mkdir(root)
    const bytes = Buffer.from([0xf0, 0x90, 0x80])
    assert.equal(Buffer.byteLength(bytes.toString('utf8'), 'utf8'), bytes.byteLength)
    await writeFile(join(root, 'Original.md'), bytes)
    await symlink('Original.md', join(root, 'Alias.md'))
    await context.plugin(NoteVaultRuntime, { ...Config(), stateRoot: null, vaultRoot: root })
    const runtime = context.noteVault
    const current = runtime.state
    assert.ok(current.active)
    service = new ReviewedBackupEngine({ desktop, now: () => 1_000, randomToken: () => 'alias-review', runtime })
    await assert.rejects(service.prepare({ identity: { ...identity, vaultId: current.id, vaultGeneration: current.generation } }, AbortSignal.timeout(5_000)),
      error => error instanceof ImportExportError && error.code === 'stale-vault')
    assert.deepEqual(desktop.calls, [])
    assert.equal(desktop.written.byteLength, 0)
  } finally {
    await service?.dispose()
    await context.fiber.dispose()
    await rm(temporary, { recursive: true, force: true })
  }
})

test('backup rejects a note alias retargeted after inventory before opening the destination', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-backup-retarget-'))
  const root = join(temporary, 'vault')
  const context = new Context()
  const desktop = new FakeDesktop()
  let service: ReviewedBackupEngine | undefined
  try {
    await mkdir(root)
    await writeFile(join(root, 'Original.md'), '# Original\n')
    await writeFile(join(root, 'Other.md'), '# Replacement\n')
    await symlink('Original.md', join(root, 'Alias.md'))
    await context.plugin(NoteVaultRuntime, { ...Config(), stateRoot: null, vaultRoot: root })
    const runtime = context.noteVault
    const current = runtime.state
    assert.ok(current.active)
    const open = runtime.openDocument.bind(runtime)
    let retargeted = false
    t.mock.method(runtime, 'openDocument', async (...args: Parameters<typeof open>) => {
      if (!retargeted && args[0] === 'Alias.md') {
        retargeted = true
        await unlink(join(root, 'Alias.md'))
        await symlink('Other.md', join(root, 'Alias.md'))
      }
      return await open(...args)
    })
    service = new ReviewedBackupEngine({ desktop, now: () => 1_000, randomToken: () => 'alias-review', runtime })
    await assert.rejects(service.prepare({ identity: { ...identity, vaultId: current.id, vaultGeneration: current.generation } }, AbortSignal.timeout(5_000)),
      error => error instanceof NoteVaultError && error.code === 'changed')
    assert.equal(retargeted, true)
    assert.deepEqual(desktop.calls, [])
    assert.equal(desktop.written.byteLength, 0)
  } finally {
    await service?.dispose()
    await context.fiber.dispose()
    await rm(temporary, { recursive: true, force: true })
  }
})

for (const target of ['outside-vault', 'wrong-document-kind', 'directory'] as const) {
  test(`backup rejects an unsafe note alias (${target}) before opening the destination`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-backup-unsafe-alias-'))
    const root = join(temporary, 'vault')
    const context = new Context()
    const desktop = new FakeDesktop()
    let service: ReviewedBackupEngine | undefined
    try {
      await mkdir(root)
      await writeFile(join(root, 'Original.md'), '# Original\n')
      await writeFile(join(temporary, 'Private.md'), '# Outside\n')
      await writeFile(join(root, 'Board.canvas'), '{"nodes":[],"edges":[]}')
      await mkdir(join(root, 'Folder'))
      await symlink(target === 'outside-vault' ? '../Private.md' : target === 'wrong-document-kind' ? 'Board.canvas' : 'Folder',
        join(root, 'Alias.md'))
      await context.plugin(NoteVaultRuntime, { ...Config(), stateRoot: null, vaultRoot: root })
      const runtime = context.noteVault
      const current = runtime.state
      assert.ok(current.active)
      service = new ReviewedBackupEngine({ desktop, now: () => 1_000, randomToken: () => 'alias-review', runtime })
      await assert.rejects(service.prepare({ identity: { ...identity, vaultId: current.id, vaultGeneration: current.generation } }, AbortSignal.timeout(5_000)),
        error => error instanceof ImportExportError && error.code === 'stale-vault')
      assert.deepEqual(desktop.calls, [])
      assert.equal(desktop.written.byteLength, 0)
    } finally {
      await service?.dispose()
      await context.fiber.dispose()
      await rm(temporary, { recursive: true, force: true })
    }
  })
}

test('backup captures every ordinary runtime cursor page before publishing', async t => {
  const { desktop, runtime, service } = setup()
  const full = await runtime.listTree() as Awaited<ReturnType<BackupRuntimePort['listTree']>>
  const cursors: Array<string | null | undefined> = []
  t.mock.method(runtime, 'listTree', async (request: Parameters<BackupRuntimePort['listTree']>[0]) => {
    cursors.push(request.cursor)
    const more = request.cursor == null
    return { ...full, entries: full.entries.slice(more ? 0 : 1, more ? 1 : 2), complete: !more,
      cursor: more ? 'next-page' : null, truncated: more, truncationReason: more ? 'result-limit' : null }
  })
  try {
    const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
    const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
    await service.approve(binding)
    assert.equal((await service.commit(binding, AbortSignal.timeout(5_000))).status, 'published')
    assert.deepEqual(verifyBackupArchive(desktop.written).manifest.entries.map(entry => entry.path),
      ['.obsidian/app.json', 'Folder/Note.md', 'image.png'])
    assert.deepEqual(cursors, [null, 'next-page', null, 'next-page', null, 'next-page'])
  } finally {
    await service.dispose()
  }
})

test('expired backup approval cannot open a destination after asynchronous preflight', async t => {
  const runtime = new FakeRuntime()
  const desktop = new FakeDesktop()
  let now = 1_000
  const service = new ReviewedBackupEngine({ desktop, now: () => now, randomToken: () => 'expiry-review', runtime })
  try {
    const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
    const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
    await service.approve(binding)
    const list = runtime.listPassiveBackupEntries.bind(runtime)
    t.mock.method(runtime, 'listPassiveBackupEntries', async () => {
      const result = await list()
      now = preview.expiresAt
      return result
    })
    await assert.rejects(service.commit(binding, AbortSignal.timeout(5_000)),
      (error: unknown) => error instanceof ImportExportError && error.code === 'expired')
    assert.deepEqual(desktop.calls, ['pick', 'lock', 'revoke'])
    assert.equal(desktop.written.byteLength, 0)
    await assert.rejects(service.commit(binding, AbortSignal.timeout(5_000)),
      (error: unknown) => error instanceof ImportExportError && error.code === 'replayed')
  } finally {
    await service.dispose()
  }
})

test('backup expiry cancels an unfinished destination write before publication', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let now = 1_000
  const desktop = new FakeDesktop()
  const runtime = new FakeRuntime()
  const service = new ReviewedBackupEngine({ desktop, now: () => now, randomToken: () => 'backup-secret', runtime })
  const preview = await service.prepare({ identity }, new AbortController().signal)
  const binding = { operationId: preview.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const write = desktop.writeDestinationChunk.bind(desktop)
  t.mock.method(desktop, 'writeDestinationChunk', async (request: Parameters<BackupDesktopPort['writeDestinationChunk']>[0], signal: AbortSignal) => {
    started.resolve()
    await release.promise
    signal.throwIfAborted()
    return await write(request)
  })
  const commit = service.commit(binding, new AbortController().signal)
  const rejected = assert.rejects(commit, error => error instanceof ImportExportError && error.code === 'expired')
  try {
    await started.promise
    t.mock.timers.tick(preview.expiresAt - now)
    now = preview.expiresAt
    release.resolve()
    await rejected
    assert.equal(desktop.written.byteLength, 0)
    assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', 'abort'])
  } finally {
    release.resolve()
    await commit.catch(() => undefined)
    await service.dispose()
  }
})

test('backup expiry during destination staging prevents publication and scrubs staged bytes', async t => {
  for (const phase of ['destination', 'chunk'] as const) {
    await t.test(phase, async t => {
      const runtime = new FakeRuntime()
      const desktop = new FakeDesktop()
      let now = 1_000
      const service = new ReviewedBackupEngine({ desktop, now: () => now, randomToken: () => 'expiry-review', runtime })
      try {
        const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
        const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
        await service.approve(binding)
        if (phase === 'destination') desktop.afterBegin = () => { now = preview.expiresAt }
        else {
          const write = desktop.writeDestinationChunk.bind(desktop)
          t.mock.method(desktop, 'writeDestinationChunk', async (request: { bytes: Uint8Array }) => {
            const result = await write(request)
            now = preview.expiresAt
            return result
          })
        }
        await assert.rejects(service.commit(binding, AbortSignal.timeout(5_000)),
          (error: unknown) => error instanceof ImportExportError && error.code === 'expired')
        assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', ...phase === 'chunk' ? ['write'] : [], 'abort'])
        await assert.rejects(service.commit(binding, AbortSignal.timeout(5_000)),
          (error: unknown) => error instanceof ImportExportError && error.code === 'replayed')
      } finally {
        await service.dispose()
      }
    })
  }
})

for (const reason of ['entry-limit', 'depth-limit', 'result-limit'] as const) {
  test(`backup rejects an incomplete tree without a resumable cursor (${reason})`, async t => {
    const { desktop, runtime, service } = setup()
    const full = await runtime.listTree() as Awaited<ReturnType<BackupRuntimePort['listTree']>>
    t.mock.method(runtime, 'listTree', async () => ({ ...full, complete: false, cursor: null,
      truncated: true, truncationReason: reason }))
    try {
      await assert.rejects(service.prepare({ identity }, AbortSignal.timeout(5_000)),
        (error: unknown) => error instanceof ImportExportError && error.code === 'stale-vault')
      assert.deepEqual(desktop.calls, [])
    } finally {
      await service.dispose()
    }
  })
}

test('prepares and publishes once while response-loss retries return the same evidence', async () => {
  const { desktop, service } = setup()
  let resumePick = (): void => {}
  desktop.pickWait = new Promise<void>(resolve => { resumePick = resolve })
  const preparing = service.prepare({ identity }, AbortSignal.timeout(5_000))
  const repeatedPreparation = service.prepare({ identity }, AbortSignal.timeout(5_000))
  assert.equal(preparing, repeatedPreparation)
  resumePick()
  const preview = await preparing
  assert.equal(preview.entries, 3)
  assert.equal(preview.destinationLabel, 'backup.zip')
  assert.equal(JSON.stringify(preview).includes('selection'), false)
  assert.deepEqual(
    await service.prepare({ identity }, AbortSignal.timeout(5_000)),
    preview,
  )
  assert.deepEqual(desktop.calls, ['pick', 'lock'])

  const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  await service.approve(binding)
  let resumeBegin = (): void => {}
  desktop.beginWait = new Promise<void>(resolve => { resumeBegin = resolve })
  const committing = service.commit(binding, AbortSignal.timeout(5_000))
  const repeatedCommit = service.commit(binding, AbortSignal.timeout(5_000))
  assert.equal(committing, repeatedCommit)
  resumeBegin()
  const result = await committing
  assert.equal(result.status, 'published')
  assert.deepEqual(result.cleanup, { status: 'complete' })
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', 'write', 'finalize'])
  assert.deepEqual(await service.commit(binding, AbortSignal.timeout(5_000)), result)
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', 'write', 'finalize'])
  assert.deepEqual(verifyBackupArchive(desktop.written).manifest.entries.map(entry => [entry.path, entry.kind]), [
    ['.obsidian/app.json', 'passive'],
    ['Folder/Note.md', 'document'],
    ['image.png', 'attachment'],
  ])

  desktop.operationId = secondIdentity.operationId
  desktop.written = new Uint8Array()
  const secondPreview = await service.prepare({ identity: secondIdentity }, AbortSignal.timeout(5_000))
  const secondBinding = {
    operationId: secondIdentity.operationId,
    planDigest: secondPreview.planDigest,
    reviewToken: secondPreview.reviewToken,
  }
  await service.approve(secondBinding)
  await service.commit(secondBinding, AbortSignal.timeout(5_000))
  assert.deepEqual(await service.commit(binding, AbortSignal.timeout(5_000)), result)
})

test('abandons a response-lost preparation without a review token', async () => {
  const { desktop, service } = setup()
  let resume = (): void => {}
  desktop.pickWait = new Promise<void>(resolve => { resume = resolve })
  const preparing = service.prepare({ identity }, AbortSignal.timeout(5_000))
  const abandoning = service.abandon({ identity })
  resume()
  await preparing
  assert.deepEqual(await abandoning, { status: 'cancelled' })
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'revoke'])
  await assert.rejects(
    service.prepare({ identity }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'replayed',
  )
})

test('normalizes cancellation during a Desktop picker await', async () => {
  const { desktop, service } = setup()
  let resume = (): void => {}
  desktop.pickWait = new Promise<void>(resolve => { resume = resolve })
  const abort = new AbortController()
  const preparing = service.prepare({ identity }, abort.signal)
  abort.abort()
  resume()
  await assert.rejects(
    preparing,
    (error: unknown) => error instanceof ImportExportError && error.code === 'aborted',
  )
})

test('bounds abandoned backups and automatically revokes an expired destination', async () => {
  const { desktop, service } = setup()
  const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
  await assert.rejects(
    service.prepare({ identity: secondIdentity }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'limit-exceeded',
  )
  assert.deepEqual(desktop.calls, ['pick', 'lock'])
  await service.cancel({ operationId: preview.operationId, reviewToken: preview.reviewToken })

  desktop.expiresAt = 1_001
  desktop.operationId = secondIdentity.operationId
  const expiring = await service.prepare({ identity: secondIdentity }, AbortSignal.timeout(5_000))
  await new Promise(resolve => setTimeout(resolve, 10))
  await assert.rejects(
    service.approve({ operationId: expiring.operationId, planDigest: expiring.planDigest, reviewToken: expiring.reviewToken }),
    (error: unknown) => error instanceof ImportExportError && error.code === 'not-found',
  )
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'revoke', 'pick', 'lock', 'revoke'])
})

test('bounded completed evidence does not block normal sequential backups', async () => {
  const { desktop, service } = setup()
  for (let index = 0; index < 5; index += 1) {
    const operationIdentity = {
      ...identity,
      operationId: `sequential-backup-${String(index)}`,
      requestId: `sequential-backup-request-${String(index)}`,
    }
    desktop.operationId = operationIdentity.operationId
    desktop.written = new Uint8Array()
    const plan = await service.prepare({ identity: operationIdentity }, AbortSignal.timeout(5_000))
    const binding = { operationId: plan.operationId, planDigest: plan.planDigest, reviewToken: plan.reviewToken }
    await service.approve(binding)
    await service.commit(binding, AbortSignal.timeout(5_000))
  }
  assert.equal(desktop.calls.filter(call => call === 'pick').length, 5)
})

test('recovers published evidence when the final Desktop response is lost', async () => {
  const { desktop, service } = setup()
  const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
  const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  desktop.abortCleanup = 'retained'
  desktop.rejectFinalize = true
  const result = await service.commit(binding, AbortSignal.timeout(5_000))
  assert.deepEqual(result, {
    bytes: preview.totalBytes,
    cleanup: { residualLabels: ['backup.zip'], status: 'retained' },
    label: preview.destinationLabel,
    operationId: preview.operationId,
    planDigest: preview.planDigest,
    status: 'published',
  })
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', 'write', 'finalize', 'abort'])
  assert.deepEqual(await service.commit(binding, AbortSignal.timeout(5_000)), result)
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', 'write', 'finalize', 'abort'])
})

test('rejects a destination picker result bound to another caller operation', async () => {
  const { desktop, service } = setup()
  desktop.operationId = 'foreign-operation'
  await assert.rejects(
    service.prepare({ identity }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'stale-vault',
  )
  assert.deepEqual(desktop.calls, ['pick'])
})

test('rejects a changed runtime snapshot before destination staging', async () => {
  const { desktop, runtime, service } = setup()
  const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
  await service.approve({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken })
  runtime.changed = true
  await assert.rejects(
    service.commit({ operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'stale-vault',
  )
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'revoke'])
  assert.equal(desktop.written.byteLength, 0)
})

test('revalidates the current runtime after destination awaits and aborts staging', async () => {
  const { desktop, runtime, service } = setup()
  const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
  const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  desktop.afterBegin = () => {
    runtime.state = { active: true, generation: vault.generation + 1, id: vault.id }
  }
  await assert.rejects(
    service.commit(binding, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'stale-vault',
  )
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', 'abort'])
  assert.equal(desktop.written.byteLength, 0)
})

test('unload aborts, scrubs, and awaits in-flight destination staging', async () => {
  const { desktop, service } = setup()
  const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
  const binding = { operationId: identity.operationId, planDigest: preview.planDigest, reviewToken: preview.reviewToken }
  await service.approve(binding)
  let resume = (): void => {}
  let started = (): void => {}
  const beginning = new Promise<void>(resolve => { started = resolve })
  desktop.beginStarted = started
  desktop.beginWait = new Promise<void>(resolve => { resume = resolve })
  const committing = service.commit(binding, AbortSignal.timeout(5_000)).then(
    () => 'resolved' as const,
    () => 'rejected' as const,
  )
  await beginning
  let disposed = false
  const disposing = service.dispose().then(() => { disposed = true })
  await Promise.resolve()
  assert.equal(disposed, false)
  resume()
  await disposing
  assert.equal(await committing, 'rejected')
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'begin', 'abort'])
})

test('cancel and unload revoke reviewed destinations without staging', async () => {
  const { desktop, service } = setup()
  const preview = await service.prepare({ identity }, AbortSignal.timeout(5_000))
  await service.cancel({ operationId: identity.operationId, reviewToken: preview.reviewToken })
  assert.deepEqual(desktop.calls, ['pick', 'lock', 'revoke'])
  await service.dispose()
})
