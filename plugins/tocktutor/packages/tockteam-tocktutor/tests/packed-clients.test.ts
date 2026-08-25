import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { runInThisContext } from 'node:vm'
import {
  desktopArtifact,
  dshRoot,
  packedClientModuleSystemOptions,
  packPlugin,
} from '../../../test-utils.ts'

const run = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { loadOverlayPatches } = await import(pathToFileURL(
  join(dshRoot, 'packages/boot/app-boot/lib/index.js'),
).href)

interface ReleaseArtifact {
  client?: { immediately?: boolean; inject: string[]; platform: 'web' }
  directory: string
  name: string
  peers?: Record<string, string>
  row?: { config?: Record<string, unknown>; id: string; name: string }
  version: string
}

interface PackedRelease extends ReleaseArtifact {
  path: string
  sha256: string
}

const releases: ReleaseArtifact[] = [
  {
    directory: 'tockbot-note-runtime',
    name: 'tockbot-note-runtime',
    row: { id: 'note-vault-runtime', name: 'tockbot-note-runtime', config: { vaultRoot: null } },
    version: '0.1.2',
  },
  {
    directory: 'tockbot-note-vault',
    name: 'tockbot-note-vault',
    version: '0.6.0',
  },
  {
    directory: 'tockteam-note-vault-tools',
    name: '@tockteam/note-vault-tools',
    row: { id: 'note-vault-tools', name: '@tockteam/note-vault-tools' },
    version: '0.1.2',
  },
  {
    client: {
      inject: ['@deepseek-ai/dsh-client-runtime', '@tockteam/desktop'],
      platform: 'web',
      immediately: true,
    },
    directory: 'tockteam-tocktutor-workbench',
    name: '@tockteam/tocktutor-workbench',
    peers: {
      '@tockteam/desktop': '>=0.1.6 <0.2.0',
      'tockbot-note-runtime': '0.1.2',
    },
    row: { id: 'tocktutor-workbench', name: '@tockteam/tocktutor-workbench' },
    version: '0.1.7',
  },
  {
    client: {
      inject: [
        '@deepseek-ai/dsh-client-runtime',
        '@tockteam/desktop',
        '@tockteam/tocktutor-workbench',
      ],
      platform: 'web',
      immediately: true,
    },
    directory: 'tockbot-note-desktop',
    name: 'tockbot-note-desktop',
    peers: {
      '@tockteam/desktop': '>=0.1.11 <0.2.0',
      '@tockteam/tocktutor-workbench': '0.1.7',
      'tockbot-note-runtime': '0.1.2',
    },
    row: { id: 'tockbot-note-desktop', name: 'tockbot-note-desktop' },
    version: '0.1.2',
  },
  {
    client: {
      inject: ['@deepseek-ai/dsh-client-runtime', '@tockteam/tocktutor-workbench'],
      platform: 'web',
      immediately: true,
    },
    directory: 'tockteam-tocktutor-assistant',
    name: '@tockteam/tocktutor-assistant',
    peers: { '@tockteam/tocktutor-workbench': '0.1.7' },
    row: { id: 'tocktutor-assistant', name: '@tockteam/tocktutor-assistant', config: {} },
    version: '0.1.5',
  },
  {
    client: {
      inject: ['@deepseek-ai/dsh-client-runtime', '@tockteam/tocktutor-workbench'],
      platform: 'web',
      immediately: true,
    },
    directory: 'tockteam-tocktutor-import-export',
    name: '@tockteam/tocktutor-import-export',
    peers: {
      '@tockteam/desktop': '>=0.1.11 <0.2.0',
      '@tockteam/tocktutor-workbench': '>=0.1.7 <0.2.0',
      'tockbot-note-runtime': '0.1.2',
    },
    row: { id: 'tocktutor-import-export', name: '@tockteam/tocktutor-import-export' },
    version: '0.1.1',
  },
  {
    client: {
      inject: ['@tockteam/desktop', '@tockteam/sidebar'],
      platform: 'web',
    },
    directory: 'tockbot-web-clip',
    name: 'tockbot-web-clip',
    row: { id: 'web-clip', name: 'tockbot-web-clip' },
    version: '0.1.2',
  },
]

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function packReleases(output: string): Promise<PackedRelease[]> {
  await mkdir(output, { recursive: true })
  const packed: PackedRelease[] = []
  for (const release of releases) {
    const path = await packPlugin(release.directory, output)
    packed.push({ ...release, path, sha256: await sha256(path) })
  }
  return packed
}

async function extract(path: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true })
  await run('tar', ['-xzf', path, '-C', destination, '--strip-components=1'])
}

function clientExport(manifest: Record<string, unknown>): string {
  const exports = manifest.exports as Record<string, unknown>
  const declaration = exports['./client']
  if (typeof declaration === 'string') return declaration
  const fallback = (declaration as Record<string, unknown>).default
  assert.equal(typeof fallback, 'string')
  return fallback as string
}

test('every dependency resolves to the approved workspace package contract', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-bundle-artifacts-'))
  try {
    const packedReleases = await packReleases(join(temporary, 'artifacts'))
    for (const release of packedReleases) {
      assert.match(release.sha256, /^[0-9a-f]{64}$/u, release.name)
      const packageRoot = join(temporary, release.name.replaceAll('/', '__'))
      await extract(release.path, packageRoot)
      const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
      assert.equal(manifest.name, release.name)
      assert.equal(manifest.version, release.version)
      for (const [name, range] of Object.entries(release.peers ?? {})) {
        assert.equal(manifest.peerDependencies?.[name], range, `${release.name} peer ${name}`)
      }
      assert.deepEqual(manifest.dsh?.bundle, { patch: './cordis.patch.yml' })
      if (release.row === undefined) continue
      assert.deepEqual(
        loadOverlayPatches('tocktutor-bundle-test', join(packageRoot, 'cordis.patch.yml')),
        [{ insert: [release.row] }],
      )
      if (release.client !== undefined) assert.deepEqual(manifest.dsh?.client, release.client)
    }
  } finally {
    await rm(temporary, { force: true, recursive: true })
  }
})

test('every packed browser component activates exactly once through ClientModuleSystem', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-bundle-clients-'))
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    const packedReleases = await packReleases(join(temporary, 'artifacts'))
    const installed = new Map<string, { manifest: Record<string, any>; root: string }>()
    for (const release of packedReleases.filter(value => value.client !== undefined)) {
      const packageRoot = join(temporary, release.name.replaceAll('/', '__'))
      await extract(release.path, packageRoot)
      installed.set(release.name, {
        manifest: JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')),
        root: packageRoot,
      })
    }
    const shellRoot = join(temporary, 'tockteam-desktop')
    await extract(desktopArtifact, shellRoot)
    const shellManifest = JSON.parse(await readFile(join(shellRoot, 'package.json'), 'utf8'))
    const shellClient = shellManifest.exports['./client'].node as string
    const shellApi = await import(pathToFileURL(join(shellRoot, shellClient)).href)
    const packageRequire = createRequire(join(root, 'package.json'))
    const { ClientModuleSystem } = await import(pathToFileURL(
      join(dshRoot, 'packages/client/modules/lib/types/client/system.js'),
    ).href)
    const modules = [...installed].map(([id, value]) => {
      const release = packedReleases.find(candidate => candidate.name === id)
      assert.ok(release?.client)
      return {
        id,
        inject: release.client.inject,
        ...(release.client.immediately === true ? { immediately: true } : {}),
        rev: release.sha256.slice(0, 12),
        url: pathToFileURL(join(value.root, clientExport(value.manifest))).href,
      }
    })
    const loads = new Map<string, number>()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
    const system = new ClientModuleSystem(packedClientModuleSystemOptions({
      modules,
      staticModules: {
        react: await import(pathToFileURL(packageRequire.resolve('react')).href),
        'react-dom': await import(pathToFileURL(packageRequire.resolve('react-dom')).href),
        'react/jsx-runtime': await import(pathToFileURL(packageRequire.resolve('react/jsx-runtime')).href),
        '@tockteam/desktop/client': shellApi,
      },
      loadBundle: async (url: string) => {
        const id = modules.find(row => row.url === url)?.id
        assert.ok(id)
        loads.set(id, (loads.get(id) ?? 0) + 1)
        const path = fileURLToPath(url)
        runInThisContext(await readFile(path, 'utf8'), { filename: path })
      },
    }))
    for (const row of modules) await system.prefetch(row.id)
    const activated = new Map<string, unknown>()
    for (const row of modules) {
      const client = await system.import(row.id) as { apply?: unknown }
      assert.equal(typeof client.apply, 'function', row.id)
      assert.strictEqual(await system.import(row.id), client)
      assert.equal(loads.get(row.id), 1)
      activated.set(row.id, client)
    }
    for (const row of [...modules].reverse()) {
      system.invalidate(row.id)
      const reloaded = await system.import(row.id) as { apply?: unknown }
      assert.equal(typeof reloaded.apply, 'function', row.id)
      assert.notStrictEqual(reloaded, activated.get(row.id))
      assert.equal(loads.get(row.id), 2)
    }
  } finally {
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
    await rm(temporary, { force: true, recursive: true })
  }
})
