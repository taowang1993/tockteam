import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { Service } from '@deepseek-ai/cordis'
import { dshRoot, repositoryRoot } from '../../../test-utils.ts'

const run = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const {
  boot,
  composeEntries,
  loadOverlayPatches,
} = await import(pathToFileURL(join(dshRoot, 'packages/boot/app-boot/lib/index.js')).href)

// Cordis FiberState.ACTIVE is a const enum with runtime value 2.
const ACTIVE = 2

const packages = [
  'tockbot-note-runtime',
  '@tockteam/note-vault-tools',
  '@tockteam/tocktutor-workbench',
  'tockbot-note-desktop',
  '@tockteam/tocktutor-assistant',
  '@tockteam/tocktutor-import-export',
  'tockbot-web-clip',
]

function fakeModules(events: { disposed: string[]; loaded: string[] }) {
  return new Map(packages.map((packageName, index) => {
    const service = `aggregate-component-${String(index)}`
    const previous = index === 0 ? undefined : `aggregate-component-${String(index - 1)}`
    class FakeComponent extends Service {
      static inject = previous === undefined ? [] : [previous]

      constructor(ctx: ConstructorParameters<typeof Service>[0]) {
        super(ctx, service)
        events.loaded.push(packageName)
        ctx.effect(() => () => { events.disposed.push(packageName) })
      }
    }
    return [packageName, { default: FakeComponent }]
  }))
}

async function fixtureRoot(): Promise<{ config: string; dispose(): Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), 'tocktutor-bundle-loader-'))
  const config = join(directory, 'cordis.yml')
  await mkdir(directory, { recursive: true })
  await writeFile(config, '[]\n')
  return {
    config,
    async dispose() { await rm(directory, { force: true, recursive: true }) },
  }
}

test('pinned Loader activates each row once and reloads the dependency chain cleanly', async () => {
  const fixture = await fixtureRoot()
  const events = { disposed: [] as string[], loaded: [] as string[] }
  const modules = fakeModules(events)
  const patches = loadOverlayPatches('tocktutor-bundle-test', join(root, 'cordis.patch.yml'))
  const context = await boot('tocktutor-bundle-test', fixture.config, patches, (ctx) => {
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        const plugin = modules.get(specifier)
        if (plugin === undefined) throw new Error(`missing aggregate package ${specifier}`)
        return plugin
      },
    } as NonNullable<typeof ctx.loader.internal>
  })
  try {
    assert.deepEqual(events.loaded, packages)
    const active = () => [...context.loader.entries()]
      .filter(entry => packages.includes(entry.options.name) && entry.fiber?.state === ACTIVE)
      .map(entry => entry.options.name)
    assert.deepEqual(active(), packages)

    const runtime = [...context.loader.entries()].find(entry => entry.options.name === packages[0])
    assert.ok(runtime)
    await runtime.update({ disabled: true })
    await context.loader.await()
    assert.deepEqual(active(), [])
    assert.deepEqual([...events.disposed].sort(), [...packages].sort())

    await runtime.update({ disabled: false })
    await context.loader.await()
    assert.deepEqual(active(), packages)
    assert.deepEqual(events.loaded, [...packages, ...packages])
  } finally {
    await context.fiber.dispose()
    await fixture.dispose()
  }
  assert.deepEqual(events.disposed.length, packages.length * 2)
})

test('pinned Loader fails closed when one required package cannot resolve', async () => {
  const fixture = await fixtureRoot()
  const events = { disposed: [] as string[], loaded: [] as string[] }
  const modules = fakeModules(events)
  const missing = '@tockteam/tocktutor-import-export'
  modules.delete(missing)
  const patches = loadOverlayPatches('tocktutor-bundle-test', join(root, 'cordis.patch.yml'))
  try {
    await assert.rejects(
      boot('tocktutor-bundle-test', fixture.config, patches, (ctx) => {
        ctx.loader.internal = {
          version: 'v2',
          async import(specifier: string) {
            const plugin = modules.get(specifier)
            if (plugin === undefined) throw new Error(`missing aggregate package ${specifier}`)
            return plugin
          },
        } as NonNullable<typeof ctx.loader.internal>
      }),
      new RegExp(`missing aggregate package ${missing}`),
    )
  } finally {
    await fixture.dispose()
  }
  assert.equal(events.loaded.length > 0, true)
  assert.deepEqual([...events.disposed].sort(), [...events.loaded].sort())
  assert.equal(new Set(events.disposed).size, events.disposed.length)
})

test('real Desktop and user layers replace Runtime config without mutating the aggregate', async () => {
  const fixture = await fixtureRoot()
  try {
    const desktopArtifact = join(repositoryRoot, 'tockteam-desktop-0.1.13.tgz')
    const desktopPatch = join(dirname(fixture.config), 'desktop.patch.yml')
    const extracted = await run('tar', [
      '-xOf',
      desktopArtifact,
      'package/dist/cordis.patch.yml',
    ])
    await writeFile(desktopPatch, extracted.stdout)
    const aggregate = loadOverlayPatches('tocktutor-bundle-test', join(root, 'cordis.patch.yml'))
    const desktop = loadOverlayPatches('tocktutor-bundle-test', desktopPatch)
      .filter(patch => patch.id === 'note-vault-runtime')
    assert.deepEqual(desktop, [{
      id: 'note-vault-runtime',
      name: 'tockbot-note-runtime',
      config: { stateRoot: null, vaultRoot: null },
    }])
    const user = [{
      id: 'note-vault-runtime',
      config: { stateRoot: '/user-state', vaultRoot: '/user-vault' },
    }]
    const warnings: string[] = []
    const composed = composeEntries([aggregate, desktop, user], message => warnings.push(message))
    const runtime = composed.find(entry => entry.id === 'note-vault-runtime')
    assert.deepEqual(warnings, [])
    assert.deepEqual(runtime?.config, user[0]?.config)
    assert.deepEqual(aggregate[0]?.insert?.[0]?.config, { vaultRoot: null })
  } finally {
    await fixture.dispose()
  }
})
