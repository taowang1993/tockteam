// @ts-expect-error Shared first-party process-group cleanup owns build descendants.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { digestFiles, readFiles } from './user-raycast-install.ts'
import { validMenuIcon } from './user-raycast-menu.ts'
import type { UserRaycastSourceCandidate } from './user-raycast-registry.ts'

async function tool(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Extension build was canceled')
  const child = spawn(file, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const limit = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeout)])
  let bytes = 0
  const result = new Promise<void>((resolve, reject) => {
    const output = (chunk: Buffer) => { bytes += chunk.length; if (bytes > 128 * 1024) reject(new Error('Build output exceeded its bound')) }
    child.stdout.on('data', output); child.stderr.on('data', output)
    child.once('error', error => reject(error))
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Build tool failed (${code ?? 'signal'})`)))
  })
  let detach = () => {}
  const cancel = new Promise<never>((_resolve, reject) => {
    const aborted = () => reject(new Error('Extension build was canceled or timed out'))
    if (limit.aborted) { aborted(); return }
    limit.addEventListener('abort', aborted, { once: true })
    detach = () => limit.removeEventListener('abort', aborted)
  })
  try { await Promise.race([result, cancel]) } finally { detach(); await stopOwnedChild(child, 250, true) }
}

/** Call only after explicit native approval. npm lifecycle scripts remain disabled. */
export async function buildUserRaycastSource(options: Readonly<{ source: string; candidate: UserRaycastSourceCandidate; workspace: string; nodePath: string; npmPath?: string; signal?: AbortSignal }>): Promise<string> {
  const { source, candidate, workspace, nodePath, npmPath = 'npm', signal } = options
  if (signal?.aborted) throw new Error('Extension build was canceled')
  if (!isAbsolute(workspace) || !lstatSync(workspace).isDirectory() || !isAbsolute(nodePath) || !lstatSync(nodePath).isFile() || existsSync(join(workspace, 'source')) || existsSync(join(workspace, 'built'))) throw new Error('Build workspace or Node runtime is unavailable')
  const files = readFiles(source)
  if (digestFiles(files) !== candidate.digest || candidate.license !== 'MIT' || candidate.source !== `https://github.com/raycast/extensions/tree/${candidate.revision}/extensions/${candidate.extensionId}`) throw new Error('Public source changed before building')
  const manifest = JSON.parse(files.get('package.json')?.toString('utf8') ?? 'null') as Record<string, unknown> | null
  if (!manifest || manifest.name !== candidate.extensionId || manifest.license !== 'MIT' || manifest.title !== candidate.title || !Array.isArray(manifest.commands) || !manifest.commands.some(item => item?.name === candidate.command && item.mode === candidate.mode)) throw new Error('Public source manifest changed before building')
  const name = manifest.icon
  const icon = candidate.mode === 'menu-bar' && typeof name === 'string' && /^[a-zA-Z0-9_.-]{1,128}\.png$/.test(name) ? files.get(`assets/${name}`) : undefined
  if (candidate.mode === 'menu-bar' && !validMenuIcon(icon)) throw new Error('Menu icon is missing or unsupported')
  const sourceCopy = join(workspace, 'source'), built = join(workspace, 'built'), home = join(workspace, 'home')
  mkdirSync(sourceCopy, { mode: 0o700 }); mkdirSync(built, { mode: 0o700 }); mkdirSync(home, { mode: 0o700 })
  for (const [relative, bytes] of files) { const path = join(sourceCopy, relative); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }) }
  const userconfig = join(home, 'user.npmrc'), globalconfig = join(home, 'global.npmrc')
  writeFileSync(userconfig, '', { flag: 'wx', mode: 0o600 }); writeFileSync(globalconfig, '', { flag: 'wx', mode: 0o600 })
  const env: NodeJS.ProcessEnv = { HOME: home, TMPDIR: home, PATH: `${dirname(nodePath)}:${process.env.PATH ?? '/usr/bin:/bin'}`, npm_config_cache: join(home, 'cache'), npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig, npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  await tool(npmPath, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], sourceCopy, env, 180_000, signal)
  const esbuild = join(sourceCopy, 'node_modules/esbuild/bin/esbuild')
  if (!existsSync(esbuild) || !lstatSync(esbuild).isFile()) throw new Error('The selected extension did not install its build tool')
  const entry = ['.tsx', '.ts', '.jsx', '.js'].map(ext => `src/${candidate.command}${ext}`).find(path => existsSync(join(sourceCopy, path)))
  if (!entry) throw new Error('The selected command source is unavailable')
  await tool(nodePath, [esbuild, entry, '--bundle', '--platform=node', '--format=cjs', '--jsx=automatic', '--external:@raycast/api', '--external:react', '--external:react/*', '--log-level=error', `--outfile=../built/${candidate.command}.js`], sourceCopy, env, 30_000, signal)
  writeFileSync(join(built, 'package.json'), JSON.stringify({ ...manifest, repository: candidate.source }), { flag: 'wx', mode: 0o600 })
  if (icon) writeFileSync(join(built, 'icon.png'), icon, { flag: 'wx', mode: 0o600 })
  readFiles(built) // Reject links and oversized output before it reaches the installer.
  return built
}
