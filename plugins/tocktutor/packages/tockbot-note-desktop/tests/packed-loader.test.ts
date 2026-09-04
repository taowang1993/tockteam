import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { runInThisContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import {
  desktopArtifact,
  loadDshClientModules,
  packedClientModuleSystemOptions,
  packPlugin,
  packUi,
} from '../../../test-utils.ts'

const execFileAsync = promisify(execFile)
const packageName = 'tockbot-note-desktop'
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

async function installPacked(root: string): Promise<{
  artifact: string
  consumerRoot: string
  require: NodeJS.Require
}> {
  const artifacts = join(root, 'artifacts')
  const consumerRoot = join(root, 'consumer')
  await mkdir(artifacts)
  await mkdir(consumerRoot)
  await execFileAsync('pnpm', ['pack', '--pack-destination', artifacts], {
    cwd: repositoryRoot,
    env: { ...process.env, PNPM_CONFIG_LOGLEVEL: 'warn' },
  })
  const names = (await readdir(artifacts)).filter(name => name.endsWith('.tgz'))
  assert.deepEqual(names, ['tockbot-note-desktop-0.1.2.tgz'])
  const artifact = join(artifacts, names[0]!)
  const runtimeArtifact = await packPlugin('tockbot-note-runtime', artifacts)
  const vaultArtifact = await packPlugin('tockbot-note-vault', artifacts)
  const workbenchArtifact = await packPlugin('tockteam-tocktutor-workbench', artifacts)
  const uiArtifact = await packUi(artifacts)
  await writeFile(join(consumerRoot, 'package.json'), `${JSON.stringify({
    name: 'tockbot-note-desktop-packed-consumer',
    private: true,
    dependencies: {
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-client-runtime': '0.1.1-rc.2',
      '@deepseek-ai/dsh-client-ui-slots': '0.1.1-rc.2',
      '@deepseek-ai/dsh-typert-protocol': '0.1.1-rc.2',
      '@tockteam/desktop': `file:${desktopArtifact}`,
      '@tockteam/tocktutor-workbench': `file:${workbenchArtifact}`,
      '@tockteam/ui': `file:${uiArtifact}`,
      [packageName]: `file:${artifact}`,
      react: '18.3.1',
      'tockbot-note-runtime': `file:${runtimeArtifact}`,
      'tockbot-note-vault': `file:${vaultArtifact}`,
    },
  }, undefined, 2)}\n`)
  await writeFile(join(consumerRoot, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - .',
    '',
    'autoInstallPeers: false',
    'overrides:',
    `  '@tockteam/ui': file:${uiArtifact}`,
    '',
  ].join('\n'))
  await execFileAsync('pnpm', [
    'install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile', '--config.engine-strict=false',
  ], { cwd: consumerRoot, env: { ...process.env, PNPM_CONFIG_LOGLEVEL: 'warn' } })
  return { artifact, consumerRoot, require: createRequire(join(consumerRoot, 'package.json')) }
}

async function loadHost(
  consumerRoot: string,
  consumerRequire: NodeJS.Require,
  surface: 'desktop' | 'web' | 'tui',
): Promise<Context> {
  const config = join(consumerRoot, `cordis-${surface}.yml`)
  await writeFile(config, [
    '- id: adapter',
    `  name: '${packageName}'`,
    '',
  ].join('\n'))
  const context = new Context()
  context.baseUrl = pathToFileURL(join(consumerRoot, 'package.json')).href
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier === packageName) {
        const plugin = await import(pathToFileURL(consumerRequire.resolve(packageName)).href)
        return {
          ...plugin,
          inject: [],
          apply(ctx: Context) {
            ctx.provide('tockTeamSurface', Object.freeze({ kind: surface }))
            for (const key of ['tockTeamDesktopCaller', 'tockTeamDesktopPicker', 'tockTeamDesktopPopOut',
              'tockTeamDesktopMicrophone', 'tockTeamDesktopPrintExport', 'tockTeamDesktopVaultSelection',
              'tockTeamDesktopReveal', 'noteVault']) ctx.provide(key, Object.freeze({}))
            plugin.assertDesktopSurface({ kind: surface })
            ctx.plugin(plugin.TockTutorDesktopGateway)
          },
        }
      }
      throw new Error(`unexpected Loader import: ${specifier}`)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  try {
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(config).href },
    })
    await context.loader.await()
  } catch (error) {
    if (surface === 'desktop') throw error
    assert.match(String(error), /Desktop surface is required/u)
  }
  return context
}

async function verifyClient(consumerRequire: NodeJS.Require): Promise<void> {
  const manifestPath = consumerRequire.resolve(`${packageName}/package.json`)
  const packageRoot = fileURLToPath(new URL('.', pathToFileURL(manifestPath)))
  for (const path of [
    'cordis.patch.yml', 'dist/index.js', 'dist/index.d.ts',
    'dist/client.js', 'dist/client-api.js', 'dist/client.d.ts',
  ]) assert.equal((await readFile(join(packageRoot, path))).byteLength > 0, true, path)

  const { ClientModuleSystem } = await loadDshClientModules()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
  try {
    const clientPath = join(packageRoot, 'dist/client.js')
    const modules = new ClientModuleSystem(packedClientModuleSystemOptions({
      modules: [{ id: packageName, rev: 'packed', url: pathToFileURL(clientPath).href }],
      staticModules: {
        react: await import(pathToFileURL(consumerRequire.resolve('react')).href),
        'react/jsx-runtime': await import(
          pathToFileURL(consumerRequire.resolve('react/jsx-runtime')).href
        ),
      },
      loadBundle: async (url: string) => {
        const path = fileURLToPath(url)
        runInThisContext(await readFile(path, 'utf8'), { filename: path })
      },
    }))
    const client = await modules.import(packageName) as {
      apply(ctx: unknown): Promise<() => Promise<void>>
      name: string
    }
    assert.equal(client.name, packageName)
    const cleanup: string[] = []
    const registered: Array<{ component: unknown; options: Record<string, unknown> }> = []
    ;(globalThis as { dshDesktop?: unknown }).dshDesktop = {
      tockTutor: {
        authorize: async () => ({ authorization: 'fixture' }),
        async cancelDispatch() { cleanup.push('dispatch') },
        completeDispatch: async () => 'handled',
        nextDispatch: async () => null,
      },
    }
    const clientContext = {
      get: () => ({ kind: 'desktop' }),
      inject(deps: string[], callback: (ctx: unknown) => () => void) {
        assert.deepEqual(deps, ['remote', 'remote.tocktutorDesktop', 'slots'])
        const disposeChild = callback(clientContext)
        return Object.assign(Promise.resolve(), {
          async dispose() { disposeChild() },
        })
      },
      remote: {
        tocktutorDesktop: Object.freeze({}),
        async $mount(contribution: { package?: string }) {
          assert.equal(contribution.package, packageName)
          return async () => { cleanup.push('remote') }
        },
      },
      slots: {
        inject(name: string, register: () => () => void) {
          assert.equal(name, 'tockteam.tocktutor.workbench.native-actions')
          const disposeRegistration = register()
          return () => { cleanup.push('slot'); disposeRegistration() }
        },
        register(options: Record<string, unknown>, component: unknown) {
          registered.push({ component, options })
          return () => { cleanup.push('registration') }
        },
      },
    }
    const dispose = await client.apply(clientContext)
    assert.equal(registered.length, 1)
    assert.equal(registered[0]?.options.id, packageName)
    assert.equal(typeof registered[0]?.component, 'function')
    await dispose()
    assert.deepEqual(cleanup, ['slot', 'registration', 'dispatch', 'remote'])
    await assert.rejects(
      client.apply({ get: () => ({ kind: 'web' }) }),
      /Desktop surface is required/u,
    )
  } finally {
    delete (globalThis as { dshDesktop?: unknown }).dshDesktop
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
  }
}

test('fresh packed bundle activates only through the pinned Desktop Host/client Loaders', {
  timeout: 120_000,
}, async () => {
  const fixture = await realpath(await mkdtemp(join(tmpdir(), 'tockbot-note-desktop-packed-')))
  let desktop: Context | undefined
  let web: Context | undefined
  try {
    const installed = await installPacked(fixture)
    assert.equal((await readFile(installed.artifact)).byteLength > 0, true)
    await verifyClient(installed.require)

    desktop = await loadHost(installed.consumerRoot, installed.require, 'desktop')
    const adapter = [...desktop.loader.entries()].find(entry => entry.options.name === packageName)
    assert.ok(adapter?.fiber?.uid)

    web = await loadHost(installed.consumerRoot, installed.require, 'web')
    const rejected = [...web.loader.entries()].find(entry => entry.options.name === packageName)
    assert.equal(rejected, undefined)
  } finally {
    await web?.fiber.dispose()
    await desktop?.fiber.dispose()
    await rm(fixture, { force: true, recursive: true })
  }
})
