import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { runInThisContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  desktopArtifact,
  dshRoot,
  packedClientModuleSystemOptions,
  packPlugin,
  packUi,
} from '../../../test-utils.ts'

const execFileAsync = promisify(execFile)
const packageName = '@tockteam/tocktutor-workbench'
const runtimeName = 'tockbot-note-runtime'
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

interface InstalledPackage {
  dsh?: {
    bundle?: { patch?: string }
    client?: { immediately?: boolean; inject?: string[]; platform?: string }
  }
  name?: string
  version?: string
}

async function installFreshPackage(root: string): Promise<{
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
    env: process.env,
  })
  const names = (await readdir(artifacts)).filter(name => name.endsWith('.tgz'))
  assert.deepEqual(names, ['tockteam-tocktutor-workbench-0.1.7.tgz'])
  const artifact = join(artifacts, names[0]!)
  const runtimeArtifact = await packPlugin('tockbot-note-runtime', artifacts)
  const vaultArtifact = await packPlugin('tockbot-note-vault', artifacts)
  const uiArtifact = await packUi(artifacts)
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({
    name: 'tocktutor-workbench-packed-consumer',
    private: true,
    dependencies: {
      '@deepseek-ai/cordis': `link:${join(dshRoot, 'vendor/cordis')}`,
      '@deepseek-ai/dsh-client-runtime': `link:${join(dshRoot, 'packages/client/runtime')}`,
      '@deepseek-ai/dsh-client-ui-slots': `link:${join(dshRoot, 'packages/client/ui-slots')}`,
      '@deepseek-ai/dsh-typert-protocol': `link:${join(dshRoot, 'packages/typert/protocol')}`,
      '@tockteam/desktop': `file:${desktopArtifact}`,
      '@tockteam/ui': `file:${uiArtifact}`,
      [packageName]: `file:${artifact}`,
      react: '18.3.1',
      'react-dom': '18.3.1',
      [runtimeName]: `file:${runtimeArtifact}`,
      'tockbot-note-vault': `file:${vaultArtifact}`,
    },
  }, undefined, 2) + '\n')
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
    'install',
    '--offline',
    '--ignore-scripts',
    '--no-frozen-lockfile',
    '--config.engine-strict=false',
  ], { cwd: consumerRoot, env: process.env })
  return {
    artifact,
    consumerRoot,
    require: createRequire(join(consumerRoot, 'package.json')),
  }
}

async function loadHost(
  consumerRoot: string,
  consumerRequire: NodeJS.Require,
  vaultRoot: string,
  stateRoot: string,
): Promise<Context> {
  const configPath = join(consumerRoot, 'cordis.yml')
  await writeFile(configPath, [
    `- id: runtime`,
    `  name: '${runtimeName}'`,
    '  config:',
    `    vaultRoot: ${JSON.stringify(vaultRoot)}`,
    `    stateRoot: ${JSON.stringify(stateRoot)}`,
    `- id: workbench`,
    `  name: '${packageName}'`,
    '',
  ].join('\n'))
  const resolved = consumerRequire.resolve(packageName)
  assert.equal(relative(consumerRoot, resolved).startsWith(`node_modules${sep}`), true)
  assert.equal(resolved.endsWith(join('dist', 'index.js')), true)

  const context = new Context()
  context.baseUrl = pathToFileURL(join(consumerRoot, 'package.json')).href
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== runtimeName && specifier !== packageName) {
        throw new Error(`unexpected Loader import: ${specifier}`)
      }
      return import(pathToFileURL(consumerRequire.resolve(specifier)).href)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

async function verifyPackedClient(
  consumerRoot: string,
  consumerRequire: NodeJS.Require,
): Promise<void> {
  const manifestPath = consumerRequire.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as InstalledPackage
  assert.equal(manifest.name, packageName)
  assert.equal(manifest.version, '0.1.7')
  assert.deepEqual(manifest.dsh?.bundle, { patch: './cordis.patch.yml' })
  assert.deepEqual(manifest.dsh?.client, {
    inject: ['@deepseek-ai/dsh-client-runtime', '@tockteam/desktop'],
    platform: 'web',
    immediately: true,
  })
  const packageRoot = fileURLToPath(new URL('.', pathToFileURL(manifestPath)))
  assert.equal(await readFile(join(packageRoot, 'cordis.patch.yml'), 'utf8'), [
    '- insert:',
    '    - id: tocktutor-workbench',
    `      name: '${packageName}'`,
    '',
  ].join('\n'))

  const clientPath = join(packageRoot, 'dist/client.js')
  assert.equal(relative(consumerRoot, clientPath).startsWith(`node_modules${sep}`), true)
  assert.equal(clientPath.endsWith(join('dist', 'client.js')), true)
  const { ClientModuleSystem } = await import(
    pathToFileURL(join(dshRoot, 'packages/client/modules/lib/types/client/system.js')).href
  )
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
  try {
    const react = await import(pathToFileURL(consumerRequire.resolve('react')).href)
    const reactServer = await import(pathToFileURL(consumerRequire.resolve('react-dom/server')).href)
    const modules = new ClientModuleSystem(packedClientModuleSystemOptions({
      modules: [{ id: packageName, rev: 'packed', url: pathToFileURL(clientPath).href }],
      staticModules: {
        react,
        'react-dom': await import(pathToFileURL(consumerRequire.resolve('react-dom')).href),
        'react/jsx-runtime': await import(pathToFileURL(consumerRequire.resolve('react/jsx-runtime')).href),
        '@tockteam/desktop/client': await import(
          pathToFileURL(consumerRequire.resolve('@tockteam/desktop/client')).href
        ),
      },
      loadBundle: async (url: string) => {
        const path = fileURLToPath(url)
        runInThisContext(await readFile(path, 'utf8'), { filename: path })
      },
    }))
    const client = await modules.import(packageName) as {
      apply(context: unknown): Promise<() => Promise<void>>
      name: string
      TOCKTUTOR_ASSISTANT_PANEL_SLOT: string
      TOCKTUTOR_NATIVE_ACTIONS_SLOT: string
      TOCKTUTOR_REVIEW_PANEL_SLOT: string
    }
    assert.equal(client.name, packageName)
    assert.equal(client.TOCKTUTOR_ASSISTANT_PANEL_SLOT, 'tockteam.tocktutor.workbench.assistant')
    assert.equal(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT, 'tockteam.tocktutor.workbench.native-actions')
    assert.equal(client.TOCKTUTOR_REVIEW_PANEL_SLOT, 'tockteam.tocktutor.workbench.review')

    const cleanup: string[] = []
    const registered: Array<{
      active: boolean
      component: unknown
      options: Record<string, unknown>
    }> = []
    const clientContext = new Context()
    const namespace = { marker: 'packed-tocktutor-workbench' }
    let removeNamespace: (() => void) | undefined
    const provideNamespace = (): void => {
      removeNamespace = clientContext.reflect.provide('remote.tocktutorWorkbench', namespace)
    }
    const remote = {
      get tocktutorWorkbench() { return clientContext.get('remote.tocktutorWorkbench') },
      $on() { return () => {} },
      async $mount(contribution: { package?: string }) {
        assert.equal(contribution.package, packageName)
        provideNamespace()
        return async () => {
          removeNamespace?.()
          cleanup.push('remote')
        }
      },
    }
    clientContext.reflect.provide('remote', remote)
    clientContext.reflect.provide('slots', {
      inject(name: string, callback: () => () => void) {
        assert.equal(name, 'tockteam.tocktutor.route')
        const dispose = callback()
        return () => {
          dispose()
          cleanup.push('inject')
        }
      },
      register(options: Record<string, unknown>, component: unknown) {
        const registration = { active: true, component, options }
        registered.push(registration)
        return () => {
          if (!registration.active) return
          registration.active = false
          cleanup.push('route')
        }
      },
    })
    const clientFiber = clientContext.plugin(client as never, undefined as never)
    await clientFiber
    assert.equal(registered.length, 1)
    assert.equal(registered[0]?.active, true)
    assert.equal(
      (registered[0]?.options.inject as () => { remote: { tocktutorWorkbench: unknown } })()
        .remote.tocktutorWorkbench,
      namespace,
    )

    removeNamespace?.()
    for (let index = 0; index < 12; index += 1) await Promise.resolve()
    assert.equal(registered[0]?.active, false)
    provideNamespace()
    for (let index = 0; index < 12; index += 1) await Promise.resolve()
    assert.equal(registered.length, 2)
    const activeRegistration = registered[1]
    assert.equal(activeRegistration?.active, true)
    assert.equal(activeRegistration?.options.name, 'tockteam.tocktutor.route')
    assert.equal(activeRegistration?.options.registrant, packageName)
    assert.equal(typeof activeRegistration?.component, 'function')
    assert.deepEqual(activeRegistration?.options.children, {
      'tockteam.tocktutor.workbench.assistant': { kind: 'single', scope: 'root' },
      'tockteam.tocktutor.workbench.native-actions': { kind: 'list', scope: 'root' },
      'tockteam.tocktutor.workbench.review': { kind: 'list', scope: 'root' },
    })

    let nativeOwner: {
      activePath: string | null
      handleDispatch(event: {
        action: 'search'
        kind: 'quick-action'
        operationId: string
      }): Promise<'failed' | 'handled' | 'stale'>
      vault: unknown
    } | undefined
    const html = reactServer.renderToStaticMarkup(react.createElement(
      activeRegistration?.component as never,
      {
        location: { hash: '', pathname: '/tocktutor', search: '' },
        navigate() {},
        remote: (activeRegistration?.options.inject as () => { remote: unknown })().remote,
        renderSlot(key: string, owner: unknown, options?: { fallback?: unknown }) {
          if (key === client.TOCKTUTOR_NATIVE_ACTIONS_SLOT) nativeOwner = owner as typeof nativeOwner
          return options?.fallback
        },
      },
    ))
    assert.match(html, /aria-label="Native Actions"/u)
    assert.ok(nativeOwner)
    assert.deepEqual(Object.keys(nativeOwner).sort(), ['activePath', 'handleDispatch', 'vault'])
    assert.equal(nativeOwner.activePath, null)
    assert.equal(nativeOwner.vault, null)
    assert.equal(await nativeOwner.handleDispatch({
      action: 'search',
      kind: 'quick-action',
      operationId: 'packed-search',
    }), 'stale')

    const core = new SlotCore()
    const registerCore = (options: object): (() => void) =>
      (core.register as unknown as (options: object, component: () => null) => () => void)
        .call(core, options, () => null)
    const disposeDesktop = registerCore({
      children: {
        'tockteam.tocktutor.route': { kind: 'single', scope: 'root' },
      },
      name: 'root',
      registrant: '@tockteam/desktop',
    })
    const mountRoute = (): (() => void) => registerCore({
      children: activeRegistration?.options.children,
      name: 'tockteam.tocktutor.route',
      registrant: client.name,
    })
    const disposeCoreRoute = mountRoute()
    assert.deepEqual(core.spec(client.TOCKTUTOR_ASSISTANT_PANEL_SLOT), {
      kind: 'single',
      scope: 'root',
    })
    assert.deepEqual(core.spec(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT), {
      kind: 'list',
      scope: 'root',
    })
    assert.deepEqual(core.spec(client.TOCKTUTOR_REVIEW_PANEL_SLOT), {
      kind: 'list',
      scope: 'root',
    })
    assert.equal(core.entries(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT).length, 0)
    assert.equal(core.entries(client.TOCKTUTOR_REVIEW_PANEL_SLOT).length, 0)
    const disposeRestore = registerCore({
      id: 'restore',
      name: client.TOCKTUTOR_REVIEW_PANEL_SLOT,
      order: 20,
      registrant: '@tockteam/tocktutor-restore',
    })
    const disposeImport = registerCore({
      id: 'import',
      name: client.TOCKTUTOR_REVIEW_PANEL_SLOT,
      order: 10,
      registrant: '@tockteam/tocktutor-import-export',
    })
    const disposeAssistant = registerCore({
      name: client.TOCKTUTOR_ASSISTANT_PANEL_SLOT,
      registrant: '@tockteam/tockbot-note-assistant',
    })
    const disposePrint = registerCore({
      id: 'print',
      name: client.TOCKTUTOR_NATIVE_ACTIONS_SLOT,
      order: 20,
      registrant: '@tockteam/desktop',
    })
    const disposeReveal = registerCore({
      id: 'reveal',
      name: client.TOCKTUTOR_NATIVE_ACTIONS_SLOT,
      order: 10,
      registrant: '@tockteam/desktop',
    })
    assert.deepEqual(
      core.entries(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT).map(entry => entry.options.id),
      ['reveal', 'print'],
    )
    assert.deepEqual(
      core.entries(client.TOCKTUTOR_REVIEW_PANEL_SLOT).map(entry => entry.options.id),
      ['import', 'restore'],
    )
    assert.equal(core.entries(client.TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 1)
    disposeCoreRoute()
    assert.equal(core.spec(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT), undefined)
    assert.equal(core.entries(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT).length, 0)
    assert.equal(core.spec(client.TOCKTUTOR_REVIEW_PANEL_SLOT), undefined)
    assert.equal(core.entries(client.TOCKTUTOR_REVIEW_PANEL_SLOT).length, 0)
    assert.equal(core.spec(client.TOCKTUTOR_ASSISTANT_PANEL_SLOT), undefined)
    disposeRestore()
    disposeImport()
    disposeAssistant()
    disposePrint()
    disposeReveal()

    const disposeReplacement = mountRoute()
    registerCore({
      id: 'import',
      name: client.TOCKTUTOR_REVIEW_PANEL_SLOT,
      registrant: '@tockteam/tocktutor-import-export',
    })
    registerCore({
      id: 'reveal',
      name: client.TOCKTUTOR_NATIVE_ACTIONS_SLOT,
      registrant: '@tockteam/desktop',
    })
    assert.equal(core.entries(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT).length, 1)
    assert.equal(core.entries(client.TOCKTUTOR_REVIEW_PANEL_SLOT).length, 1)
    assert.equal(core.entries(client.TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 0)
    disposeDesktop()
    assert.equal(core.spec(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT), undefined)
    assert.equal(core.entries(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT).length, 0)
    assert.equal(core.spec(client.TOCKTUTOR_REVIEW_PANEL_SLOT), undefined)
    assert.equal(core.entries(client.TOCKTUTOR_REVIEW_PANEL_SLOT).length, 0)
    disposeReplacement()

    await clientFiber.dispose()
    assert.equal(activeRegistration?.active, false)
    assert.deepEqual(cleanup.slice(-3), ['route', 'inject', 'remote'])
    await clientContext.fiber.dispose()
  } finally {
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
  }
}

test('fresh packed plugin composes through pinned Host and client Loaders', {
  timeout: 120_000,
}, async () => {
  const fixture = await realpath(await mkdtemp(join(tmpdir(), 'tocktutor-workbench-packed-')))
  const vaultRoot = join(fixture, 'Vault')
  let context: Context | undefined
  try {
    await mkdir(vaultRoot)
    const marker = `Release-${crypto.randomUUID()}.md`
    const documentPath = join(vaultRoot, marker)
    await writeFile(documentPath, '# Before\n')
    const installed = await installFreshPackage(fixture)
    assert.equal((await readFile(installed.artifact)).byteLength > 0, true)
    await verifyPackedClient(installed.consumerRoot, installed.require)

    context = await loadHost(
      installed.consumerRoot,
      installed.require,
      vaultRoot,
      join(fixture, 'state'),
    )
    const runtimeModule = await import(pathToFileURL(installed.require.resolve(runtimeName)).href)
    const NoteVaultError = runtimeModule.NoteVaultError as {
      new (...args: never[]): Error & { code: string }
    }
    const state = context.noteVault.state
    assert.equal(state.active, true)
    if (!state.active) assert.fail('packed runtime must activate the fixture vault')
    assert.ok(context.tocktutorWorkbench)
    assert.equal(
      [...context.loader.entries()].filter(entry =>
        entry.options.name === packageName
        && entry.fiber !== undefined
        && entry.fiber.uid !== null,
      ).length,
      1,
    )

    const signal = new AbortController().signal
    const expectedVault = { generation: state.generation, id: state.id }
    const tree = await context.tocktutorWorkbench.listTree({ expectedVault, limit: 20 }, signal)
    assert.equal(tree.entries.some(entry => entry.path === marker), true)
    const opened = await context.tocktutorWorkbench.openDocument(marker, expectedVault, signal)
    assert.equal(opened.content, '# Before\n')

    await writeFile(documentPath, '# External\n')
    await assert.rejects(context.tocktutorWorkbench.saveDocument({
      content: '# Lost\n',
      expectedRevision: opened.revision,
      expectedVault,
      path: marker,
    }, signal), error => error instanceof NoteVaultError && error.code === 'conflict')
    assert.equal(await readFile(documentPath, 'utf8'), '# External\n')

    const refreshed = await context.tocktutorWorkbench.openDocument(marker, expectedVault, signal)
    const saved = await context.tocktutorWorkbench.saveDocument({
      content: '# After\n',
      expectedRevision: refreshed.revision,
      expectedVault,
      path: marker,
    }, signal)
    assert.equal(saved.status, 'saved')
    assert.equal(await readFile(documentPath, 'utf8'), '# After\n')

    await assert.rejects(context.tocktutorWorkbench.openDocument(
      marker,
      { ...expectedVault, generation: expectedVault.generation + 1 },
      signal,
    ), error => error instanceof NoteVaultError && error.code === 'stale-vault')

    const entry = [...context.loader.entries()].find(item => item.options.name === packageName)
    if (entry?.fiber === undefined) assert.fail('packed workbench Loader entry must be active')
    await entry.fiber.dispose()
    assert.equal(context.get('tocktutorWorkbench'), undefined)
    assert.ok(context.get('noteVault'))
    assert.equal(
      [...context.loader.entries()].filter(item =>
        item.options.name === packageName
        && item.fiber !== undefined
        && item.fiber.uid !== null,
      ).length,
      0,
    )

    await context.loader.create({ name: packageName })
    await context.loader.await()
    assert.ok(context.get('tocktutorWorkbench'))
    assert.equal(
      [...context.loader.entries()].filter(item =>
        item.options.name === packageName
        && item.fiber !== undefined
        && item.fiber.uid !== null,
      ).length,
      1,
    )
  } finally {
    if (context !== undefined) {
      await context.fiber.dispose()
      assert.equal(context.get('tocktutorWorkbench'), undefined)
      assert.equal(context.get('noteVault'), undefined)
    }
    await rm(fixture, { recursive: true, force: true })
  }
})
