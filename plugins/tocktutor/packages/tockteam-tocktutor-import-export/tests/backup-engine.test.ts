import assert from 'node:assert/strict'
import test from 'node:test'
import type { NativeOperationIdentity } from '@tockteam/desktop/host'

import { verifyBackupArchive } from '../src/backup.ts'
import {
  ReviewedBackupEngine,
  type BackupDesktopPort,
  type BackupRuntimePort,
} from '../src/backup-engine.ts'
import { ImportExportError, sha256 } from '../src/core.ts'
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

  async openDocument(): Promise<never> {
    return { content: '# Note\n', digest: sha256('# Note\n'), generation: vault.generation, path: 'Folder/Note.md', revision: 'note-rev' } as never
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

test('prepares and publishes once while response-loss retries return the same evidence', async () => {
  const { desktop, service } = setup()
  let resumePick = (): void => {}
  desktop.pickWait = new Promise<void>(resolve => { resumePick = resolve })
  const preparing = service.prepare({ identity }, AbortSignal.timeout(5_000))
  const repeatedPreparation = service.prepare({ identity }, AbortSignal.timeout(5_000))
  assert.equal(preparing, repeatedPreparation)
  resumePick()
  const preview = await preparing
  assert.equal(preview.entries, 2)
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
  assert.deepEqual(verifyBackupArchive(desktop.written).manifest.entries.map(entry => entry.path), ['Folder/Note.md', 'image.png'])

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
