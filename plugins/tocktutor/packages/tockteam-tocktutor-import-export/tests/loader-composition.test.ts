import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { runInThisContext } from 'node:vm'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import {
  desktopArtifact,
  dshRoot,
  packedClientModuleSystemOptions,
  packPlugin,
  packUi,
} from '../../../test-utils.ts'

const exec = promisify(execFile)
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const packageName = '@tockteam/tocktutor-import-export'
const runtimeName = 'tockbot-note-runtime'
const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  version: string
}

async function installPacked(consumer: string, tarball: string, artifacts: string): Promise<NodeJS.Require> {
  const workbenchArtifact = await packPlugin('tockteam-tocktutor-workbench', artifacts)
  const uiArtifact = await packUi(artifacts)
  const runtimeArtifact = await packPlugin('tockbot-note-runtime', artifacts)
  const vaultArtifact = await packPlugin('tockbot-note-vault', artifacts)
  const dependencies = {
    [packageName]: `file:${tarball}`,
    '@deepseek-ai/cordis': `link:${join(dshRoot, 'vendor/cordis')}`,
    '@deepseek-ai/cordis-plugin-include': manifest.devDependencies['@deepseek-ai/cordis-plugin-include']!,
    '@deepseek-ai/cordis-plugin-loader': manifest.devDependencies['@deepseek-ai/cordis-plugin-loader']!,
    '@deepseek-ai/dsh-client-runtime': `link:${join(dshRoot, 'packages/client/runtime')}`,
    '@deepseek-ai/dsh-client-ui-slots': `link:${join(dshRoot, 'packages/client/ui-slots')}`,
    '@deepseek-ai/dsh-typert-protocol': `link:${join(dshRoot, 'packages/typert/protocol')}`,
    '@tockteam/desktop': `file:${desktopArtifact}`,
    '@tockteam/tocktutor-workbench': `file:${workbenchArtifact}`,
    '@tockteam/ui': `file:${uiArtifact}`,
    react: manifest.devDependencies.react!,
    'react-dom': manifest.devDependencies['react-dom']!,
    [runtimeName]: `file:${runtimeArtifact}`,
    'tockbot-note-vault': `file:${vaultArtifact}`,
    zod: manifest.dependencies.zod!,
  }
  await writeFile(join(consumer, 'package.json'), `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`)
  await writeFile(join(consumer, 'pnpm-workspace.yaml'), [
    'autoInstallPeers: false',
    'allowBuilds:',
    '  esbuild: true',
    'overrides:',
    ...Object.entries(dependencies)
      .filter(([, specifier]) => specifier.startsWith('file:') || specifier.startsWith('link:'))
      .map(([name, specifier]) => `  '${name}': ${specifier}`),
    '',
  ].join('\n'))
  await exec('pnpm', ['install', '--force', '--reporter', 'append-only'], { cwd: consumer, env: { ...process.env, PNPM_CONFIG_LOGLEVEL: 'info' } })
  return createRequire(join(consumer, 'package.json'))
}

async function verifyHostLoader(consumer: string, require: NodeJS.Require): Promise<void> {
  const vault = join(consumer, 'vault')
  const state = join(consumer, 'state')
  await mkdir(vault)
  await mkdir(state)
  await writeFile(join(vault, 'Note.md'), '# Packed Loader\n')
  const fakeCaller = join(consumer, 'fake-caller.mjs')
  await writeFile(fakeCaller, [
    "import { Service } from '@deepseek-ai/cordis'",
    'export default class FakeCaller extends Service {',
    "  constructor(ctx) { super(ctx, 'tockTeamDesktopCaller') }",
    '}',
    '',
  ].join('\n'))
  const fakePicker = join(consumer, 'fake-picker.mjs')
  await writeFile(fakePicker, [
    "import { Service } from '@deepseek-ai/cordis'",
    'export default class FakePicker extends Service {',
    "  constructor(ctx) { super(ctx, 'tockTeamDesktopPicker') }",
    '}',
    '',
  ].join('\n'))
  const config = join(consumer, 'cordis.yml')
  await writeFile(config, [
    '- id: runtime',
    `  name: '${runtimeName}'`,
    '  config:',
    `    vaultRoot: ${JSON.stringify(vault)}`,
    `    stateRoot: ${JSON.stringify(state)}`,
    '- id: caller',
    `  name: ${JSON.stringify(fakeCaller)}`,
    '- id: picker',
    `  name: ${JSON.stringify(fakePicker)}`,
    '- id: import-export',
    `  name: '${packageName}'`,
    '',
  ].join('\n'))

  const resolved = require.resolve(packageName)
  assert.equal(resolved.startsWith(repositoryRoot), false, resolved)
  assert.equal(resolved.endsWith('/dist/index.js'), true)
  const context = new Context()
  context.baseUrl = pathToFileURL(join(consumer, 'package.json')).href
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier === fakeCaller) return import(pathToFileURL(fakeCaller).href)
      if (specifier === fakePicker) return import(pathToFileURL(fakePicker).href)
      if (specifier !== runtimeName && specifier !== packageName) throw new Error(`unexpected Loader import: ${specifier}`)
      return import(pathToFileURL(require.resolve(specifier)).href)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await context.loader.await()
  assert.equal(context.get('noteVault')?.state.active, true)
  assert.ok(context.get('tocktutor-import-export'))
  await context.fiber.dispose()
  assert.equal(context.get('tocktutor-import-export'), undefined)
}

async function verifyPackedDesktopDenial(consumer: string, require: NodeJS.Require): Promise<void> {
  const vault = join(consumer, 'desktop-vault')
  const state = join(consumer, 'desktop-state')
  await mkdir(vault)
  await mkdir(state)
  await writeFile(join(vault, 'Note.md'), '# Desktop Caller\n')
  const fakeTools = join(consumer, 'fake-tools.mjs')
  await writeFile(fakeTools, [
    "import { Service } from '@deepseek-ai/cordis'",
    'export default class FakeTools extends Service {',
    "  constructor(ctx) { super(ctx, 'tools') }",
    '  register() { return () => {} }',
    '}',
    '',
  ].join('\n'))
  const config = join(consumer, 'desktop-caller.yml')
  await writeFile(config, [
    '- id: tools',
    `  name: ${JSON.stringify(fakeTools)}`,
    '- id: runtime',
    `  name: '${runtimeName}'`,
    '  config:',
    `    vaultRoot: ${JSON.stringify(vault)}`,
    `    stateRoot: ${JSON.stringify(state)}`,
    '- id: desktop',
    "  name: '@tockteam/desktop'",
    '- id: import-export',
    `  name: '${packageName}'`,
    '',
  ].join('\n'))

  const context = new Context()
  context.baseUrl = pathToFileURL(join(consumer, 'package.json')).href
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier === fakeTools) return import(pathToFileURL(fakeTools).href)
      if (![runtimeName, '@tockteam/desktop', packageName].includes(specifier)) {
        throw new Error(`unexpected Loader import: ${specifier}`)
      }
      return import(pathToFileURL(require.resolve(specifier)).href)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  const endpoint = process.env.DSH_DESKTOP_CALLER_ENDPOINT
  const token = process.env.DSH_DESKTOP_CALLER_TOKEN
  delete process.env.DSH_DESKTOP_CALLER_ENDPOINT
  delete process.env.DSH_DESKTOP_CALLER_TOKEN
  try {
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await context.loader.await()
    const gateway = context.get('tocktutor-import-export') as {
      inspect(request: { authorization: string; format: 'markdown-folder' }, signal: AbortSignal): Promise<unknown>
    }
    assert.ok(gateway)
    await assert.rejects(
      gateway.inspect({ authorization: 'foreign-popout', format: 'markdown-folder' }, AbortSignal.timeout(5_000)),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'owner-lost',
    )
  } finally {
    if (endpoint === undefined) delete process.env.DSH_DESKTOP_CALLER_ENDPOINT
    else process.env.DSH_DESKTOP_CALLER_ENDPOINT = endpoint
    if (token === undefined) delete process.env.DSH_DESKTOP_CALLER_TOKEN
    else process.env.DSH_DESKTOP_CALLER_TOKEN = token
    await context.fiber.dispose()
  }
}

async function verifyPackedClient(require: NodeJS.Require): Promise<void> {
  const packageManifest = require.resolve(`${packageName}/package.json`)
  const root = dirname(packageManifest)
  const clientPath = join(root, 'dist/client.js')
  const { ClientModuleSystem } = await import(pathToFileURL(join(dshRoot, 'packages/client/modules/lib/types/client/system.js')).href)
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
  try {
    const modules = new ClientModuleSystem(packedClientModuleSystemOptions({
      modules: [{ id: packageName, rev: 'packed', url: pathToFileURL(clientPath).href }],
      staticModules: {
        react: await import(pathToFileURL(require.resolve('react')).href),
        'react/jsx-runtime': await import(pathToFileURL(require.resolve('react/jsx-runtime')).href),
        '@tockteam/tocktutor-workbench/client': await import(pathToFileURL(require.resolve('@tockteam/tocktutor-workbench/client')).href),
      },
      loadBundle: async (url: string) => {
        const path = fileURLToPath(url)
        runInThisContext(await readFile(path, 'utf8'), { filename: path })
      },
    }))
    const client = await modules.import(packageName) as {
      ImportExportReviewController: new (remote: unknown) => {
        getSnapshot(): { error: string | null; phase: string }
        startImport(format: string): Promise<void>
      }
      apply(ctx: unknown): Promise<() => Promise<void>>
      name: string
    }
    assert.equal(client.name, packageName)

    let inspected = false
    const controller = new client.ImportExportReviewController({
      'tocktutor-import-export': {
        inspect: async () => {
          inspected = true
          throw new Error('pop-out reached Remote')
        },
      },
    })
    await controller.startImport('markdown-folder')
    assert.equal(inspected, false)
    assert.equal(controller.getSnapshot().phase, 'error')
    assert.match(controller.getSnapshot().error ?? '', /trusted TockTeam Desktop window/u)

    const captured: unknown[] = []
    ;(globalThis as { dshDesktop?: unknown }).dshDesktop = {
      tockTutor: {
        authorize: async (operation: string) => ({ authorization: `packed-${operation}` }),
      },
    }
    const trusted = new client.ImportExportReviewController({
      'tocktutor-import-export': {
        inspect: async (request: unknown) => {
          captured.push(request)
          return { ok: true, value: {
            collisionPolicy: 'preserve-existing',
            createdAt: 1,
            expiresAt: 2,
            items: [],
            operationId: 'main-derived',
            planDigest: `sha256:${'a'.repeat(64)}`,
            reviewToken: 'review-token',
            schemaVersion: 1,
            skipped: [],
            source: { digest: `sha256:${'b'.repeat(64)}`, fingerprint: 'root', format: 'markdown-folder', label: 'Source', size: 0 },
            totalBytes: 0,
            vault: { generation: 1, id: `vault:${'c'.repeat(64)}` },
            warnings: [],
          } }
        },
      },
    })
    await trusted.startImport('markdown-folder')
    assert.deepEqual(captured, [{ authorization: 'packed-import-source', format: 'markdown-folder' }])
    assert.equal(trusted.getSnapshot().phase, 'review')

    const cleanup: string[] = []
    let declaration: (() => () => void) | undefined
    const dispose = await client.apply({
      remote: {
        async $mount(contribution: { package?: string }) {
          assert.equal(contribution.package, packageName)
          return async () => { cleanup.push('remote') }
        },
      },
      slots: {
        inject(name: string, callback: () => () => void) {
          assert.equal(name, 'tockteam.tocktutor.workbench.review')
          declaration = callback
          return () => { cleanup.push('inject') }
        },
        register(options: Record<string, unknown>, component: unknown) {
          assert.deepEqual(options, {
            id: 'tocktutor-import-export',
            name: 'tockteam.tocktutor.workbench.review',
            order: 10,
            registrant: packageName,
          })
          assert.equal(typeof component, 'function')
          return () => { cleanup.push('panel') }
        },
      },
    })
    assert.ok(declaration)
    const off = declaration()
    off()
    await dispose()
    assert.deepEqual(cleanup, ['panel', 'inject', 'remote'])

    const reload: string[] = []
    const disposeReload = await client.apply({
      remote: {
        async $mount(contribution: { package?: string }) {
          assert.equal(contribution.package, packageName)
          reload.push('mount')
          return async () => { reload.push('remote') }
        },
      },
      slots: {
        inject(name: string, callback: () => () => void) {
          assert.equal(name, 'tockteam.tocktutor.workbench.review')
          const offPanel = callback()
          return () => { offPanel(); reload.push('inject') }
        },
        register(options: Record<string, unknown>, component: unknown) {
          assert.equal(options.id, 'tocktutor-import-export')
          assert.equal(typeof component, 'function')
          return () => { reload.push('panel') }
        },
      },
    })
    await disposeReload()
    assert.deepEqual(reload, ['mount', 'panel', 'inject', 'remote'])
  } finally {
    delete (globalThis as { dshDesktop?: unknown }).dshDesktop
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
  }
}

test('fresh packed artifact composes through pinned Host and browser Loaders', { timeout: 180_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-import-export-packed-'))
  const pack = join(temporary, 'pack')
  const consumer = join(temporary, 'consumer')
  try {
    await mkdir(pack)
    await mkdir(consumer)
    await exec('pnpm', ['pack', '--pack-destination', pack], { cwd: repositoryRoot })
    const tarball = join(pack, `tockteam-tocktutor-import-export-${manifest.version}.tgz`)
    const archive = (await exec('tar', ['-tzf', tarball])).stdout.split('\n').filter(Boolean)
    assert.equal(archive.includes('package/dist/index.js'), true)
    assert.equal(archive.includes('package/dist/client.js'), true)
    assert.equal(archive.includes('package/dist/typert.remote-client.js'), true)
    assert.equal(archive.includes('package/cordis.patch.yml'), true)
    assert.equal(archive.some(path => path.startsWith('package/src/') || path.startsWith('package/tests/')), false)
    const digest = createHash('sha256').update(await readFile(tarball)).digest('hex')
    assert.match(digest, /^[0-9a-f]{64}$/u)
    const require = await installPacked(consumer, tarball, pack)
    await verifyHostLoader(consumer, require)
    await verifyPackedDesktopDenial(consumer, require)
    await verifyPackedClient(require)
  } finally {
    await rm(temporary, { force: true, recursive: true })
  }
})
