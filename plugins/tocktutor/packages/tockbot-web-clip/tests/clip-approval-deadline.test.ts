import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CreateDocumentRequest, NoteVaultState, WriteDocumentResult } from 'tockbot-note-runtime'
import WebClipHost, {
  ClipReviewError,
  defaultPublicFetchLimits,
  defaultReaderViewLimits,
  type ClipApproval,
  type ClipPreview,
} from '../src/index.ts'

class DelayedNoteVault extends Service {
  state: NoteVaultState = { active: true, generation: 7, id: 'vault:deadline' }
  beforeCommit: () => Promise<void> = async () => undefined
  afterCommit: () => Promise<void> = async () => undefined
  committed: CreateDocumentRequest[] = []

  constructor(ctx: Context) { super(ctx, 'noteVault') }

  async createDocument(request: CreateDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult> {
    await this.beforeCommit()
    signal.throwIfAborted()
    this.committed.push(request)
    await this.afterCommit()
    return {
      digest: `sha256:${createHash('sha256').update(request.content).digest('hex')}`,
      generation: request.expectedVault.generation,
      path: request.path,
      revision: 'file:deadline',
      status: 'created',
    }
  }
}

async function setup() {
  const context = new Context()
  await context.plugin(DelayedNoteVault)
  await context.plugin(WebClipHost, {
    ...defaultPublicFetchLimits,
    ...defaultReaderViewLimits,
    maxConcurrentRequests: 8,
  })
  return { context, host: context.webClip, runtime: context.get('noteVault') as unknown as DelayedNoteVault }
}

function preview(host: WebClipHost): ClipPreview {
  return host.createClipReview({
    capturedAt: new Date('2026-01-02T03:04:05.000Z'),
    content: 'Reviewed clipping.',
    destination: 'Clips/Deadline.md',
    sourceUrl: 'https://example.com/article',
    title: 'Deadline',
    vault: { generation: 7, id: 'vault:deadline' },
  })
}

function approval(value: ClipPreview): ClipApproval {
  return { ...value, permission: 'user-approved' }
}

test('clip approval expiry prevents a pending Runtime create from committing', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 })
  const { context, host, runtime } = await setup()
  const gate = Promise.withResolvers<void>()
  runtime.beforeCommit = async () => await gate.promise
  try {
    const reviewed = preview(host)
    const pending = host.applyClipReview(approval(reviewed), new AbortController().signal)
    const rejected = assert.rejects(pending, error => error instanceof ClipReviewError && error.code === 'expired')
    t.mock.timers.tick(reviewed.expiresAt - Date.now())
    gate.resolve()
    await rejected
    assert.deepEqual(runtime.committed, [])
    await assert.rejects(
      host.applyClipReview(approval(reviewed), new AbortController().signal),
      error => error instanceof ClipReviewError && error.code === 'missing',
    )
  } finally {
    gate.resolve()
    await context.fiber.dispose()
  }
})

test('a clip committed before expiry retains its successful late response', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 })
  const { context, host, runtime } = await setup()
  const gate = Promise.withResolvers<void>()
  const committed = Promise.withResolvers<void>()
  runtime.afterCommit = async () => { committed.resolve(); await gate.promise }
  try {
    const reviewed = preview(host)
    const pending = host.applyClipReview(approval(reviewed), new AbortController().signal)
    await committed.promise
    t.mock.timers.tick(reviewed.expiresAt - Date.now())
    gate.resolve()
    assert.equal((await pending).status, 'created')
    assert.equal(runtime.committed[0]?.content, reviewed.markdown)
    assert.equal(runtime.committed.length, 1)
  } finally {
    gate.resolve()
    await context.fiber.dispose()
  }
})

test('caller cancellation and unrelated Runtime failures retain their error identity', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 })
  const { context, host, runtime } = await setup()
  const gate = Promise.withResolvers<void>()
  runtime.beforeCommit = async () => await gate.promise
  try {
    const reviewed = preview(host)
    const caller = new AbortController()
    const reason = new DOMException('Caller cancelled clipping', 'AbortError')
    const pending = host.applyClipReview(approval(reviewed), caller.signal)
    const rejected = assert.rejects(pending, error => error === reason)
    caller.abort(reason)
    t.mock.timers.tick(reviewed.expiresAt - Date.now())
    gate.resolve()
    await rejected
    assert.deepEqual(runtime.committed, [])

    const next = preview(host)
    const conflict = Object.assign(new Error('Destination exists'), { code: 'exists' })
    runtime.beforeCommit = async () => {
      t.mock.timers.tick(next.expiresAt - Date.now())
      throw conflict
    }
    await assert.rejects(
      host.applyClipReview(approval(next), new AbortController().signal),
      error => error === conflict,
    )
    assert.deepEqual(runtime.committed, [])
  } finally {
    gate.resolve()
    await context.fiber.dispose()
  }
})
