import { execFile as execFileCallback } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

export const workspaceRoot = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = join(workspaceRoot, '..', '..')
export const dshRoot = join(repositoryRoot, '.cache', 'dsh-source', '47f943859bef')
const desktopPackage = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
  version: string
}
export const desktopArtifact = join(repositoryRoot, `tockteam-desktop-${desktopPackage.version}.tgz`)

export function pluginRoot(directory: string): string {
  return join(workspaceRoot, 'packages', directory)
}

export async function packPlugin(directory: string, output: string): Promise<string> {
  const root = pluginRoot(directory)
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
