import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { remoteMethods, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import * as plugin from '../dist/index.js'
import { TockTutorImportExportGateway } from '../dist/index.js'

class FakeRuntime extends Service {
  state = { active: true as const, generation: 1, id: `vault:${'1'.repeat(64)}` }

  constructor(ctx: Context) { super(ctx, 'noteVault') }
}

class FakePicker extends Service {
  constructor(ctx: Context) { super(ctx, 'tockTeamDesktopPicker') }
}

class FakeCaller extends Service {
  constructor(ctx: Context) { super(ctx, 'tockTeamDesktopCaller') }
}

function namespaceContext<T extends object>(context: T): T & { inject: unknown } {
  return Object.assign(context, {
    inject(dependencies: string[], callback: (child: T) => (() => void)) {
      assert.deepEqual(dependencies, ['remote', 'remote.tocktutor-import-export', 'slots'])
      const settled = Promise.resolve().then(() => callback(context))
      return Object.assign(settled, { async dispose() { (await settled)() } })
    },
  })
}

test('publishes only strict reviewed-operation Remote methods and unloads the gateway', async () => {
  const context = new Context()
  await context.plugin(FakeRuntime)
  await context.plugin(FakePicker)
  await context.plugin(FakeCaller)
  const fiber = await context.plugin(plugin)
  const gateway = context.get('tocktutor-import-export')
  assert.ok(gateway instanceof TockTutorImportExportGateway)
  assert.deepEqual(remoteMethods(gateway), [
    { invocation: { kind: 'direct' }, method: 'inspect' },
    { exportName: 'abandon-import', invocation: { kind: 'direct' }, method: 'abandonImport' },
    { exportName: 'approve-import', invocation: { kind: 'direct' }, method: 'approveImport' },
    { exportName: 'commit-import', invocation: { kind: 'direct' }, method: 'commitImport' },
    { exportName: 'cancel-import', invocation: { kind: 'direct' }, method: 'cancelImport' },
    { exportName: 'prepare-backup', invocation: { kind: 'direct' }, method: 'prepareBackup' },
    { exportName: 'abandon-backup', invocation: { kind: 'direct' }, method: 'abandonBackup' },
    { exportName: 'approve-backup', invocation: { kind: 'direct' }, method: 'approveBackup' },
    { exportName: 'commit-backup', invocation: { kind: 'direct' }, method: 'commitBackup' },
    { exportName: 'cancel-backup', invocation: { kind: 'direct' }, method: 'cancelBackup' },
  ])
  await fiber.dispose()
  assert.equal(context.get('tocktutor-import-export'), undefined)
  await context.fiber.dispose()
})

test('client mounts generated Remote before the ordered Shared Review Panel and disposes in reverse', async () => {
  const client = await import('../dist/client-api.js')
  const generated = (await import('../dist/typert.remote-client.js')).default as TypertRemoteContribution
  const mounted: TypertRemoteContribution[] = []
  const registrations: Array<{ component: unknown; options: Record<string, unknown> }> = []
  const cleanup: string[] = []
  const dispose = await client.apply(namespaceContext({
    remote: {
      'tocktutor-import-export': {},
      async $mount(contribution: TypertRemoteContribution) {
        mounted.push(contribution)
        return async () => { cleanup.push('remote') }
      },
    },
    slots: {
      inject(name: string, register: () => () => void) {
        assert.equal(name, 'tockteam.tocktutor.workbench.review')
        const off = register()
        return () => { off(); cleanup.push('inject') }
      },
      register(options: Record<string, unknown>, component: unknown) {
        registrations.push({ component, options })
        return () => { cleanup.push('panel') }
      },
    },
  }) as never)
  assert.deepEqual(mounted, [generated])
  assert.equal(registrations.length, 1)
  assert.deepEqual(registrations[0]?.options, {
    id: 'tocktutor-import-export',
    name: 'tockteam.tocktutor.workbench.review',
    order: 10,
    registrant: '@tockteam/tocktutor-import-export',
  })
  assert.equal(typeof registrations[0]?.component, 'function')
  await dispose()
  assert.deepEqual(cleanup, ['panel', 'inject', 'remote'])
})

test('review panel uses its injected Remote namespace and withdraws across namespace loss', async () => {
  const client = await import('../dist/client-api.js')
  const context = new Context()
  const cleanup: string[] = []
  const calls: unknown[] = []
  const preview = {
    collisionPolicy: 'preserve-existing', createdAt: 1, expiresAt: 2, items: [],
    operationId: 'main-derived', planDigest: `sha256:${'a'.repeat(64)}`,
    reviewToken: 'review-token', schemaVersion: 1, skipped: [],
    source: { digest: `sha256:${'b'.repeat(64)}`, fingerprint: 'root', format: 'markdown-folder', label: 'Source', size: 0 },
    totalBytes: 0, vault: { generation: 1, id: `vault:${'c'.repeat(64)}` }, warnings: [],
  }
  const namespace = {
    async inspect(request: unknown) { calls.push(request); return { ok: true, value: preview } },
  }
  let removeNamespace: (() => void) | undefined
  const provideNamespace = () => {
    removeNamespace = context.reflect.provide('remote.tocktutor-import-export', namespace)
  }
  class Remote extends Service {
    constructor(ctx: Context) { super(ctx, 'remote') }
    get ['tocktutor-import-export']() {
      return (this.ctx as unknown as Record<string, unknown>)['remote.tocktutor-import-export']
    }
    async $mount() {
      provideNamespace()
      return async () => { removeNamespace?.(); cleanup.push('remote') }
    }
  }
  const registrations: Array<{ active: boolean; component: (props: unknown) => { props: { remote: never } } }> = []
  await context.plugin(Remote)
  context.reflect.provide('slots', {
    inject(_name: string, register: () => () => void) {
      const dispose = register()
      return () => { dispose(); cleanup.push('inject') }
    },
    register(_options: unknown, component: typeof registrations[number]['component']) {
      const registration = { active: true, component }
      registrations.push(registration)
      return () => { registration.active = false; cleanup.push('panel') }
    },
  })
  try {
    const fiber = context.plugin(client as never, undefined as never)
    await fiber
    const element = registrations[0]!.component({ activePath: null, vault: preview.vault })
    const controller = new client.ImportExportReviewController(element.props.remote, {
      authorize: async () => ({ authorization: 'desktop-import-authorization' }),
    })
    await controller.startImport('markdown-folder')
    assert.equal(controller.getSnapshot().phase, 'review', controller.getSnapshot().error ?? '')
    assert.deepEqual(calls, [{ authorization: 'desktop-import-authorization', format: 'markdown-folder' }])

    removeNamespace?.()
    for (let index = 0; index < 12; index += 1) await Promise.resolve()
    assert.equal(registrations[0]!.active, false)
    provideNamespace()
    for (let index = 0; index < 12; index += 1) await Promise.resolve()
    assert.equal(registrations.length, 2)
    assert.equal(registrations[1]!.active, true)
    await fiber.dispose()
    assert.equal(registrations[1]!.active, false)
    assert.deepEqual(cleanup.slice(-3), ['panel', 'inject', 'remote'])
  } finally {
    await context.fiber.dispose()
  }
})

test('keeps browser and Host source free of crossed filesystem authority', async () => {
  const [client, panel, host, engine] = await Promise.all([
    readFile(new URL('../src/client-api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/review-panel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/engine.ts', import.meta.url), 'utf8'),
  ])
  assert.doesNotMatch(`${client}\n${panel}`, /@tockteam\/desktop\/host|tockbot-note-runtime|node:fs|node:path|electron|window\.electronAPI/u)
  assert.doesNotMatch(`${host}\n${engine}`, /node:fs|from ['"]node:path|window\.electronAPI|child_process/u)
})
