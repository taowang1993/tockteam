import { execFile as execFileCallback } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { runInThisContext } from 'node:vm'

const execFile = promisify(execFileCallback)
type ClientBundleRegistration = import('@deepseek-ai/dsh-client-modules/client').ClientBundleRegistration

export const workspaceRoot = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = join(workspaceRoot, '..', '..')
const workspaceRequire = createRequire(join(workspaceRoot, 'package.json'))
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

export async function loadDshAppBoot(): Promise<typeof import('@deepseek-ai/dsh-app-boot')> {
  return import(pathToFileURL(workspaceRequire.resolve('@deepseek-ai/dsh-app-boot')).href)
}

export async function loadDshClientModules(): Promise<typeof import('@deepseek-ai/dsh-client-modules/client')> {
  let registration: ClientBundleRegistration | undefined
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { __ModuleLoader__: { load(value: typeof registration) { registration = value } } },
  })
  try {
    const path = workspaceRequire.resolve('@deepseek-ai/dsh-client-modules/client')
    runInThisContext(await readFile(path, 'utf8'), { filename: path })
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
  }
  if (registration?.id !== '@deepseek-ai/dsh-client-modules') {
    throw new Error('Published DSH client modules did not register')
  }
  return registration.factory((id) => { throw new Error(`unexpected client module import: ${id}`) }) as typeof import('@deepseek-ai/dsh-client-modules/client')
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
  const pendingQueue: ClientBundleRegistration[] = []
  const registrationTarget = {
    mode: 'queue' as 'live' | 'queue',
    pendingQueue,
    load(registration: ClientBundleRegistration) { pendingQueue.push(registration) },
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
