import { execFile as execFileCallback } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

export const workspaceRoot = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = join(workspaceRoot, '..', '..')
export const dshRoot = join(repositoryRoot, '.cache', 'dsh-source', 'b150a551b8d4')
const desktopPackage = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
  version: string
}
export const desktopArtifact = join(
  repositoryRoot,
  '.cache',
  'tocktutor-tests',
  `tockteam-desktop-${desktopPackage.version}.tgz`,
)

export function pluginRoot(directory: string): string {
  return join(workspaceRoot, 'packages', directory)
}

interface PackedClientModuleRow {
  external?: string[]
  id: string
  immediately?: boolean
  inject?: string[]
  rev: string
  url: string
}

interface PackedClientModuleOptions {
  loadBundle(url: string): Promise<void>
  modules: readonly PackedClientModuleRow[]
  staticModules: Record<string, unknown>
}

/** Build rc.2 ClientModuleSystem inputs around the HTML loader facade used in production. */
export function packedClientModuleSystemOptions(options: PackedClientModuleOptions) {
  const pendingQueue: unknown[] = []
  const registrationTarget = {
    mode: 'queue' as 'live' | 'queue',
    pendingQueue,
    load(registration: unknown) { pendingQueue.push(registration) },
    create(): never { throw new Error('packed test loader bootstrap is already complete') },
  }
  Object.defineProperty(globalThis, '__ModuleLoader__', {
    configurable: true,
    value: registrationTarget,
  })
  return {
    bootstrapModule: {
      exports: {},
      id: '@deepseek-ai/dsh-client-modules',
    },
    loadBundle: options.loadBundle,
    manifest: {
      modules: options.modules.map(row => ({
        external: row.external ?? [],
        id: row.id,
        rev: row.rev,
        url: row.url,
      })),
      plugins: options.modules.map(row => ({
        id: row.id,
        immediately: row.immediately === true,
        inject: row.inject ?? [],
      })),
      rev: 'packed',
    },
    registrationTarget,
    staticModules: options.staticModules,
  }
}

async function packPackage(root: string, output: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    name: string
    version: string
  }
  await execFile('pnpm', ['pack', '--pack-destination', output], {
    cwd: root,
    env: { ...process.env, PNPM_CONFIG_LOGLEVEL: 'warn' },
  })
  const filename = `${manifest.name.replace(/^@/u, '').replace('/', '-')}-${manifest.version}.tgz`
  return join(output, filename)
}

export async function packPlugin(directory: string, output: string): Promise<string> {
  return packPackage(pluginRoot(directory), output)
}

export async function packUi(output: string): Promise<string> {
  return packPackage(join(repositoryRoot, 'plugins', 'ui'), output)
}
