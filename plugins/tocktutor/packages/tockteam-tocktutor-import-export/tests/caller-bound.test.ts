import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { TockTeamDesktopGrantError, type NativeOperationIdentity } from '@tockteam/desktop/host'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import * as plugin from '../dist/index.js'
import { TockTutorImportExportGateway } from '../dist/index.js'
import { ImportExportReviewController, type ReviewPanelRemote } from '../dist/review-panel.js'
import type { InspectRequest, ReviewPlanView } from '../src/types.ts'

const vault = { generation: 7, id: `vault:${'7'.repeat(64)}` }
const identity: NativeOperationIdentity = {
  operationId: 'main-operation',
  requestId: 'main-request',
  sessionId: 'main-session',
  vaultGeneration: vault.generation,
  vaultId: vault.id,
  windowId: 'main-window',
}

const preview: ReviewPlanView = {
  collisionPolicy: 'preserve-existing',
  createdAt: 1,
  expiresAt: 10_000,
  items: [],
  operationId: identity.operationId,
  planDigest: `sha256:${'b'.repeat(64)}`,
  reviewToken: 'review-secret',
  schemaVersion: 1,
  skipped: [],
  source: { digest: `sha256:${'c'.repeat(64)}`, fingerprint: 'root', format: 'markdown-folder', label: 'Course', size: 0 },
  totalBytes: 0,
  vault,
  warnings: [],
}

const ok = <Value,>(value: Value): RemoteResult<Value> => ({ ok: true, value })

class FakeRuntime extends Service {
  state = { active: true as const, ...vault }
  synchronizations = 0
  constructor(ctx: Context) { super(ctx, 'noteVault') }
  async synchronizeDesktopSelection(): Promise<typeof this.state> {
    this.synchronizations += 1
    return this.state
  }
}

class FakePicker extends Service {
  picks: unknown[] = []
  constructor(ctx: Context) { super(ctx, 'tockTeamDesktopPicker') }
  async pick(request: unknown): Promise<never> {
    this.picks.push(request)
    return { operationId: identity.operationId, status: 'cancelled' } as never
  }
}

class FakeCaller extends Service {
  afterClaim: (() => void) | undefined
  claims: unknown[] = []
  denied = false
  constructor(ctx: Context) { super(ctx, 'tockTeamDesktopCaller') }
  async claim(request: unknown): Promise<NativeOperationIdentity> {
    this.claims.push(request)
    if (this.denied) throw new TockTeamDesktopGrantError('stale')
    this.afterClaim?.()
    return identity
  }
}

async function host(): Promise<{ caller: FakeCaller; context: Context; gateway: TockTutorImportExportGateway; picker: FakePicker; runtime: FakeRuntime }> {
  const context = new Context()
  await context.plugin(FakeRuntime)
  await context.plugin(FakePicker)
  await context.plugin(FakeCaller)
  await context.plugin(plugin)
  return {
    caller: context.tockTeamDesktopCaller as FakeCaller,
    context,
    gateway: context.get('tocktutor-import-export') as TockTutorImportExportGateway,
    picker: context.tockTeamDesktopPicker as unknown as FakePicker,
    runtime: context.noteVault as unknown as FakeRuntime,
  }
}

test('browser obtains trusted-main authorization and sends no caller identity', async () => {
  const requests: InspectRequest[] = []
  const kinds: string[] = []
  const remote = {
    'tocktutor-import-export': {
      inspect: async (request: InspectRequest) => { requests.push(request); return ok(preview) },
    },
  } as unknown as ReviewPanelRemote
  const controller = new ImportExportReviewController(remote, {
    async authorize(kind) {
      kinds.push(kind)
      return { authorization: `trusted-${kind}` }
    },
  })

  await controller.startImport('markdown-folder')
  assert.deepEqual(kinds, ['import-source'])
  assert.deepEqual(requests, [{ authorization: 'trusted-import-source', format: 'markdown-folder' }])
  assert.equal(JSON.stringify(requests).includes('sessionId'), false)
  assert.equal(JSON.stringify(requests).includes('windowId'), false)
  assert.equal(JSON.stringify(requests).includes('vault'), false)
})

test('restore and backup request their distinct trusted-main authorization kinds', async () => {
  const kinds: string[] = []
  const remote = {
    'tocktutor-import-export': {
      inspect: async () => ok({ ...preview, source: { ...preview.source, format: 'restore-backup' } }),
      'prepare-backup': async () => ok({
        archiveDigest: `sha256:${'d'.repeat(64)}`,
        createdAt: 1,
        destinationLabel: 'backup.zip',
        entries: 1,
        expiresAt: 10_000,
        operationId: 'backup-operation',
        planDigest: `sha256:${'e'.repeat(64)}`,
        reviewToken: 'backup-secret',
        totalBytes: 3,
        vault,
      }),
    },
  } as unknown as ReviewPanelRemote
  const bridge = { async authorize(kind: 'import-source' | 'backup' | 'restore-backup') { kinds.push(kind); return { authorization: kind } } }
  const controller = new ImportExportReviewController(remote, bridge)

  await controller.startImport('restore-backup')
  await controller.startBackup()
  assert.deepEqual(kinds, ['restore-backup', 'backup'])
})

test('browser rejects malformed bridge authorization before Remote transport', async () => {
  let inspected = false
  const controller = new ImportExportReviewController({
    'tocktutor-import-export': {
      inspect: async () => { inspected = true; return ok(preview) },
    },
  } as unknown as ReviewPanelRemote, {
    authorize: async () => ({ authorization: '' }),
  })
  await controller.startImport('markdown-folder')
  assert.equal(controller.getSnapshot().phase, 'error')
  assert.equal(inspected, false)
})

test('Host claims the opaque authorization and derives all picker identity in Desktop', async () => {
  const { caller, context, gateway, picker, runtime } = await host()
  await assert.rejects(
    gateway.inspect({ authorization: 'trusted-main', format: 'markdown-folder' }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'aborted',
  )
  assert.equal(runtime.synchronizations, 1)
  assert.deepEqual(caller.claims, [{ authorization: 'trusted-main', operation: 'import-source' }])
  assert.deepEqual(picker.picks, [{ identity, kind: 'source', purpose: 'markdown-folder' }])
  await context.fiber.dispose()
})

test('Host rejects malformed authorization before the caller service', async () => {
  const { caller, context, gateway, picker } = await host()
  await assert.rejects(
    gateway.inspect({ authorization: '', format: 'markdown-folder' }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'invalid-plan',
  )
  assert.deepEqual(caller.claims, [])
  assert.deepEqual(picker.picks, [])
  await context.fiber.dispose()
})

test('Host rejects an unsupported runtime format before caller claim or picker', async () => {
  const { caller, context, gateway, picker } = await host()
  await assert.rejects(
    gateway.inspect({ authorization: 'trusted-main', format: 'arbitrary' as never }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'unsupported-type',
  )
  assert.deepEqual(caller.claims, [])
  assert.deepEqual(picker.picks, [])
  await context.fiber.dispose()
})

test('Host revalidates the current Runtime after awaiting the caller claim', async () => {
  const { caller, context, gateway, picker, runtime } = await host()
  caller.afterClaim = () => {
    runtime.state = { active: true, generation: vault.generation + 1, id: vault.id }
  }
  await assert.rejects(
    gateway.inspect({ authorization: 'trusted-main', format: 'markdown-folder' }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'stale-vault',
  )
  assert.deepEqual(picker.picks, [])
  await context.fiber.dispose()
})

test('Host can abandon an exact caller operation after the active vault changes', async () => {
  const { caller, context, gateway, picker, runtime } = await host()
  runtime.state = { active: true, generation: vault.generation + 1, id: vault.id }
  assert.deepEqual(
    await gateway.abandonImport(
      { authorization: 'trusted-main', format: 'markdown-folder' },
      AbortSignal.timeout(5_000),
    ),
    { status: 'cancelled' },
  )
  assert.deepEqual(caller.claims, [{ authorization: 'trusted-main', operation: 'import-source' }])
  assert.deepEqual(picker.picks, [])
  await context.fiber.dispose()
})

test('foreign or pop-out authorization denial reaches no native picker', async () => {
  const { caller, context, gateway, picker } = await host()
  caller.denied = true
  await assert.rejects(
    gateway.inspect({ authorization: 'foreign', format: 'markdown-folder' }, AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof TockTeamDesktopGrantError && error.code === 'stale',
  )
  assert.deepEqual(picker.picks, [])
  await context.fiber.dispose()
})
