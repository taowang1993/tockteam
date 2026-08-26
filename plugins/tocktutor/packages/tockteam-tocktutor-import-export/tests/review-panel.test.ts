import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  IMPORT_CHOOSER_DELEGATIONS,
  ImportExportReviewController,
  ImportExportReviewPanelView,
  type ReviewPanelRemote,
} from '../dist/review-panel.js'
import type { CommitResult, InspectRequest, ReviewBindingRequest, ReviewPlanView } from '../src/types.ts'

const vault = { generation: 2, id: `vault:${'2'.repeat(64)}` }
const preview: ReviewPlanView = {
  collisionPolicy: 'preserve-existing',
  createdAt: 1,
  expiresAt: 10_000,
  items: [{ destination: 'A.md', digest: `sha256:${'a'.repeat(64)}`, id: 'item-1', kind: 'document', size: 3 }],
  operationId: 'operation-1',
  planDigest: `sha256:${'b'.repeat(64)}`,
  reviewToken: 'secret',
  schemaVersion: 1,
  skipped: [{ label: 'link', reason: 'symlink' }],
  source: { digest: `sha256:${'c'.repeat(64)}`, fingerprint: 'root', format: 'markdown-folder', label: 'Course', size: 3 },
  totalBytes: 3,
  vault,
  warnings: ['One source entry was skipped.'],
}

const ok = <Value,>(value: Value): RemoteResult<Value> => ({ ok: true, value })
const committedResult: CommitResult = {
  committed: [{ destination: 'A.md', digest: preview.items[0]!.digest, id: 'item-1' }],
  failed: [],
  operationId: preview.operationId,
  planDigest: preview.planDigest,
  recovery: { snapshots: [], status: 'not-needed', trash: [] },
  skipped: [],
  status: 'committed',
}

class FakeRemote implements ReviewPanelRemote {
  readonly calls: string[] = []
  commitFailures = 0
  readonly commitSignals: Array<AbortSignal | undefined> = []
  approveWait: Promise<RemoteResult<never>> | undefined
  commitWait: Promise<RemoteResult<never>> | undefined
  inspectFailureResult = false
  inspectFailures = 0
  readonly inspectRequests: InspectRequest[] = []
  readonly ['tocktutor-import-export'] = {
    inspect: async (request: InspectRequest): Promise<RemoteResult<ReviewPlanView>> => {
      this.calls.push('inspect')
      this.inspectRequests.push(request)
      if (this.inspectFailures > 0) {
        this.inspectFailures -= 1
        throw new Error('inspect response lost')
      }
      if (this.inspectFailureResult) {
        return { ok: false, error: { code: 'unsupported-type', details: {}, message: 'Unsupported source.' } }
      }
      return ok(preview)
    },
    'abandon-import': async (): Promise<RemoteResult<{ status: 'cancelled' }>> => {
      this.calls.push('abandon')
      return ok({ status: 'cancelled' })
    },
    'approve-import': async (): Promise<RemoteResult<{ status: 'approved' }>> => {
      this.calls.push('approve')
      if (this.approveWait !== undefined) return await this.approveWait
      return ok({ status: 'approved' })
    },
    'commit-import': async (_request: ReviewBindingRequest, signal?: AbortSignal): Promise<RemoteResult<never>> => {
      this.calls.push('commit')
      this.commitSignals.push(signal)
      if (this.commitFailures > 0) {
        this.commitFailures -= 1
        throw new Error('commit response lost')
      }
      return await this.commitWait ?? ok(committedResult as never)
    },
    'cancel-import': async (): Promise<RemoteResult<{ status: 'cancelled' }>> => {
      this.calls.push('cancel')
      return ok({ status: 'cancelled' })
    },
    'prepare-backup': async (): Promise<RemoteResult<never>> => {
      this.calls.push('prepare')
      throw new Error('unused')
    },
    'abandon-backup': async (): Promise<RemoteResult<{ status: 'cancelled' }>> => {
      this.calls.push('abandon-backup')
      return ok({ status: 'cancelled' })
    },
    'approve-backup': async (): Promise<RemoteResult<never>> => { throw new Error('unused') },
    'commit-backup': async (): Promise<RemoteResult<never>> => { throw new Error('unused') },
    'cancel-backup': async (): Promise<RemoteResult<never>> => { throw new Error('unused') },
  }
}

test('drives inspect, explicit approval, progress, and one commit through strict Remote methods', async () => {
  const remote = new FakeRemote()
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  await controller.startImport('markdown-folder')
  assert.equal(controller.getSnapshot().phase, 'review')
  const reviewed = controller.getSnapshot().preview
  assert.equal(reviewed !== null && 'source' in reviewed ? reviewed.source.label : null, 'Course')
  await controller.approveAndCommit()
  assert.equal(controller.getSnapshot().phase, 'complete')
  assert.deepEqual(remote.calls, ['inspect', 'approve', 'commit'])
})

test('retries a lost inspect response with the same opaque authorization', async () => {
  const remote = new FakeRemote()
  remote.inspectFailures = 1
  let authorizations = 0
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: `trusted-main-${String(++authorizations)}` }),
  })
  await controller.startImport('markdown-folder')
  assert.equal(controller.getSnapshot().phase, 'error')
  controller.setFormat('csv')
  assert.equal(controller.getSnapshot().format, 'markdown-folder')
  await controller.startBackup()
  assert.equal(remote.calls.length, 1)
  await controller.startImport('markdown-folder')
  assert.equal(controller.getSnapshot().phase, 'review')
  assert.equal(authorizations, 1)
  assert.deepEqual(remote.inspectRequests, [
    { authorization: 'trusted-main-1', format: 'markdown-folder' },
    { authorization: 'trusted-main-1', format: 'markdown-folder' },
  ])
})

test('abandons a no-preview plan when a lost response is disposed', async () => {
  const remote = new FakeRemote()
  remote.inspectFailures = 1
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  await controller.startImport('markdown-folder')
  controller.dispose()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(remote.calls, ['inspect', 'abandon'])
})

test('clears opaque retry state after a terminal Host failure', async () => {
  const remote = new FakeRemote()
  remote.inspectFailureResult = true
  let authorizations = 0
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: `trusted-main-${String(++authorizations)}` }),
  })
  await controller.startImport('markdown-folder')
  controller.setFormat('csv')
  assert.equal(controller.getSnapshot().format, 'csv')
  await controller.startBackup()
  assert.equal(authorizations, 2)
  assert.deepEqual(remote.calls, ['inspect', 'prepare'])
})

test('retries a lost commit response without repeating approval', async () => {
  const remote = new FakeRemote()
  remote.commitFailures = 1
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  await controller.startImport('markdown-folder')
  await controller.approveAndCommit()
  assert.equal(controller.getSnapshot().phase, 'error')
  assert.equal(controller.getSnapshot().preview?.operationId, preview.operationId)
  await controller.approveAndCommit()
  assert.equal(controller.getSnapshot().phase, 'complete')
  assert.deepEqual(controller.getSnapshot().result, committedResult)
  assert.deepEqual(remote.calls, ['inspect', 'approve', 'commit', 'commit'])
})

test('cancellation during approval preserves the authoritative commit result', async () => {
  const remote = new FakeRemote()
  let resolve = (_result: RemoteResult<never>): void => {}
  remote.approveWait = new Promise(result => { resolve = result })
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  await controller.startImport('markdown-folder')
  const committing = controller.approveAndCommit()
  while (!remote.calls.includes('approve')) await Promise.resolve()
  const cancelling = controller.cancel()
  resolve(ok({ status: 'approved' } as never))
  await Promise.all([committing, cancelling])
  assert.equal(remote.commitSignals[0]?.aborted, false)
  assert.equal(controller.getSnapshot().phase, 'complete')
  assert.deepEqual(remote.calls, ['inspect', 'approve', 'commit'])
})

test('cancellation waits for an authoritative in-flight commit result', async () => {
  const remote = new FakeRemote()
  let resolve = (_result: RemoteResult<never>): void => {}
  remote.commitWait = new Promise(result => { resolve = result })
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  await controller.startImport('markdown-folder')
  const committing = controller.approveAndCommit()
  while (!remote.calls.includes('commit')) await Promise.resolve()
  const cancelling = controller.cancel()
  assert.equal(remote.commitSignals[0]?.aborted, false)
  resolve(ok(committedResult as never))
  await Promise.all([committing, cancelling])
  assert.equal(controller.getSnapshot().phase, 'complete')
  assert.deepEqual(controller.getSnapshot().result, committedResult)
  assert.deepEqual(remote.calls, ['inspect', 'approve', 'commit'])
})

test('disposal does not abort or discard an authoritative commit result', async () => {
  const remote = new FakeRemote()
  let resolve = (_result: RemoteResult<never>): void => {}
  remote.commitWait = new Promise(result => { resolve = result })
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  await controller.startImport('markdown-folder')
  const committing = controller.approveAndCommit()
  while (!remote.calls.includes('commit')) await Promise.resolve()
  controller.dispose()
  assert.equal(remote.commitSignals[0]?.aborted, false)
  resolve(ok(committedResult as never))
  await committing
  assert.equal(controller.getSnapshot().phase, 'complete')
  assert.deepEqual(controller.getSnapshot().result, committedResult)
  assert.deepEqual(remote.calls, ['inspect', 'approve', 'commit'])
})

test('disposal cancels a held reviewed plan before dropping local state', async () => {
  const remote = new FakeRemote()
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  await controller.startImport('markdown-folder')
  controller.dispose()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(remote.calls, ['inspect', 'cancel'])
  assert.equal(controller.getSnapshot().phase, 'idle')
})

test('delegates explicit Craft, Notion, and Apple Notes choices to existing reviewed formats', async () => {
  assert.deepEqual(IMPORT_CHOOSER_DELEGATIONS, [
    { format: 'markdown-folder', id: 'craft-folder', label: 'Craft Markdown Folder' },
    { format: 'markdown-zip', id: 'craft-zip', label: 'Craft Markdown ZIP' },
    { format: 'html', id: 'notion-html', label: 'Notion HTML Export' },
    { format: 'markdown-folder', id: 'apple-notes-folder', label: 'Apple Notes Markdown Folder' },
    { format: 'markdown-zip', id: 'apple-notes-zip', label: 'Apple Notes Markdown ZIP' },
    { format: 'html', id: 'apple-notes-html', label: 'Apple Notes HTML Export' },
  ])
  for (const delegation of IMPORT_CHOOSER_DELEGATIONS) {
    const remote = new FakeRemote()
    const controller = new ImportExportReviewController(remote, {
      authorize: async () => ({ authorization: `trusted-${delegation.id}` }),
    })
    await controller.startImport(delegation.format)
    assert.deepEqual(remote.inspectRequests, [{ authorization: `trusted-${delegation.id}`, format: delegation.format }])
    assert.deepEqual(Object.keys(remote.inspectRequests[0]!).sort(), ['authorization', 'format'])
    controller.dispose()
  }
  const html = renderToStaticMarkup(createElement(ImportExportReviewPanelView, {
    onApprove() {},
    onCancel() {},
    onFormat() {},
    onStart() {},
    snapshot: { error: null, format: 'markdown-folder', kind: 'import', phase: 'idle', preview: null, result: null },
  }))
  for (const delegation of IMPORT_CHOOSER_DELEGATIONS) assert.match(html, new RegExp(delegation.label, 'u'))
})

test('renders an accessible bounded review without tokens, paths, or unrestricted content', () => {
  const html = renderToStaticMarkup(createElement(ImportExportReviewPanelView, {
    onApprove() {},
    onCancel() {},
    onFormat() {},
    onStart() {},
    snapshot: {
      error: null,
      format: 'markdown-folder',
      kind: 'import',
      phase: 'review',
      preview,
      result: null,
    },
  }))
  assert.match(html, /Import, Backup, and Restore/u)
  assert.match(html, /Review 1 Planned Item/u)
  assert.match(html, /One source entry was skipped\./u)
  assert.match(html, /Approve and Commit/u)
  assert.doesNotMatch(html, /secret|# A|\/Users\//u)
})

test('renders bounded committed, skipped, failed, and recovery evidence', () => {
  const html = renderToStaticMarkup(createElement(ImportExportReviewPanelView, {
    onApprove() {},
    onCancel() {},
    onFormat() {},
    onStart() {},
    snapshot: {
      error: null,
      format: 'markdown-folder',
      kind: 'import',
      phase: 'complete',
      preview,
      result: {
        committed: [{ destination: 'A.md', digest: preview.items[0]!.digest, id: 'item-1' }],
        failed: [{ destination: 'C.md', reason: 'unavailable' }],
        operationId: preview.operationId,
        planDigest: preview.planDigest,
        recovery: { snapshots: [], status: 'not-needed', trash: [] },
        skipped: [{ destination: 'B.md', reason: 'exists' }],
        status: 'partial',
      },
    },
  }))
  assert.match(html, /1 committed, 1 skipped, and 1 failed/u)
  assert.match(html, /Committed: A\.md/u)
  assert.match(html, /Skipped: B\.md/u)
  assert.match(html, /Failed: C\.md/u)
  assert.match(html, /Recovery: not-needed/u)
})

test('disposal cancels active browser work and ignores late completion', async () => {
  let resolve: ((result: RemoteResult<ReviewPlanView>) => void) | undefined
  const remote = new FakeRemote()
  remote['tocktutor-import-export'].inspect = () => new Promise(result => { resolve = result })
  const controller = new ImportExportReviewController(remote, {
    authorize: async () => ({ authorization: 'trusted-main' }),
  })
  const pending = controller.startImport('markdown-folder')
  controller.dispose()
  resolve?.(ok({ ...preview, operationId: 'operation-late' }))
  await pending
  assert.equal(controller.getSnapshot().phase, 'idle')
})
