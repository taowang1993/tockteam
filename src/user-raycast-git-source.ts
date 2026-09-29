// @ts-expect-error First-party process-group cleanup owns every Git descendant.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

const remote = 'https://github.com/raycast/extensions.git'
const SHA = /^[a-f0-9]{40}$/
const MAX_BYTES = 16 * 1024 * 1024

/** Rate-limit fallback: no checkout, hooks, credential helpers, or user Git settings. */
export async function fetchUserRaycastGitSource(extensionId: string, options: Readonly<{ repositoryUrl?: string; gitPath?: string; allowLocalTest?: boolean }> = {}, signal?: AbortSignal): Promise<{ revision: string; tree: string; files: Map<string, Buffer> }> {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(extensionId)) throw new Error('Invalid public extension name')
  const url = options.repositoryUrl ?? remote
  if (url !== remote && !(options.allowLocalTest && url.startsWith('file://'))) throw new Error('Unsupported public Git source')
  const gitPath = options.gitPath ?? ['/opt/homebrew/bin/git', '/usr/local/bin/git'].find(existsSync)
  if (!gitPath || !isAbsolute(gitPath) || !statSync(gitPath).isFile()) throw new Error('Git is unavailable; try the public source again later')
  const root = mkdtempSync(join(tmpdir(), 'tockteam-raycast-git-'))
  const checkout = join(root, 'repo')
  for (const name of ['home', 'tmp', 'template']) mkdirSync(join(root, name), { mode: 0o700 })
  const env: NodeJS.ProcessEnv = { HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'), PATH: `${dirname(gitPath)}:/usr/bin:/bin`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', GCM_INTERACTIVE: 'never', GIT_TEMPLATE_DIR: join(root, 'template'), GIT_LFS_SKIP_SMUDGE: '1' }
  const deadline = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(180_000)])
  const run = async (args: string[], maximum: number): Promise<Buffer> => {
    if (deadline.aborted) throw new Error('Public source download was canceled or timed out')
    const child = spawn(gitPath, ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null', '-c', `protocol.file.allow=${options.allowLocalTest ? 'always' : 'never'}`, ...args], { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let bytes = 0; const output: Buffer[] = []
    let detach = () => {}
    const done = new Promise<Buffer>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > maximum) reject(new Error('Public Git source exceeded its byte bound')); else output.push(Buffer.from(chunk)) })
      let diagnostics = 0
      child.stderr.on('data', (chunk: Buffer) => { diagnostics += chunk.length; if (diagnostics > 64 * 1024) reject(new Error('Public Git diagnostics exceeded their bound')) })
      child.once('error', reject)
      child.once('close', code => code === 0 ? resolve(Buffer.concat(output)) : reject(new Error(`Public Git source failed (${code ?? 'signal'})`)))
    })
    const cancel = new Promise<never>((_resolve, reject) => {
      const aborted = () => reject(new Error('Public source download was canceled or timed out'))
      if (deadline.aborted) { aborted(); return }
      deadline.addEventListener('abort', aborted, { once: true })
      detach = () => deadline.removeEventListener('abort', aborted)
    })
    try { return await Promise.race([done, cancel]) } finally { detach(); await stopOwnedChild(child, 250, true) }
  }
  try {
    await run(['clone', '--filter=tree:0', '--depth=1', '--no-checkout', '--single-branch', '--branch', 'main', url, checkout], 64 * 1024)
    const git = (args: string[], max = 4 * 1024 * 1024) => run(['-C', checkout, ...args], max)
    const revision = (await git(['rev-parse', 'HEAD'], 128)).toString('utf8').trim()
    if (!SHA.test(revision)) throw new Error('Public Git revision is invalid')
    const treeLine = (await git(['ls-tree', 'HEAD', `extensions/${extensionId}`], 512)).toString('utf8').trim()
    const selected = /^040000 tree ([a-f0-9]{40})\textensions\/[a-z0-9_-]+$/.exec(treeLine)?.[1]
    if (!selected) throw new Error('Selected public extension was not found')
    const listing = (await git(['ls-tree', '-r', 'HEAD', `extensions/${extensionId}`])).toString('utf8').trim()
    const lines = listing ? listing.split('\n') : []
    if (!lines.length || lines.length > 128) throw new Error('Public Git source exceeds its file bound')
    const files = new Map<string, Buffer>()
    let total = 0
    for (const line of lines) {
      const match = /^([0-7]{6}) blob ([a-f0-9]{40})\textensions\/[a-z0-9_-]+\/(.+)$/.exec(line)
      if (!match || match[1] !== '100644') throw new Error('Public Git source contains an unsupported link or file mode')
      const [, , sha, relative] = match
      if (!relative || !/^[a-zA-Z0-9_.\/-]+$/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..' || part.length > 128) || relative.split('/').length > 8 || files.has(relative) || relative === '.npmrc' || relative === 'npm-shrinkwrap.json') throw new Error('Public Git source path or package configuration is unsupported')
      const bytes = await git(['cat-file', 'blob', sha!], MAX_BYTES - total)
      if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== sha) throw new Error('Public Git blob digest mismatch')
      total += bytes.length
      files.set(relative, bytes)
    }
    return { revision, tree: selected, files }
  } finally { rmSync(root, { recursive: true, force: true }) }
}
