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
  const dispose = await client.apply({
    remote: {
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
  } as never)
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
