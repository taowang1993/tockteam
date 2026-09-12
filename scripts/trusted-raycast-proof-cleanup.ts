import { execFile as execFileCallback } from 'node:child_process'
import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const PREFIX = 'tockteam-trusted-raycast-'
const OWNED_NAME = /^tockteam-trusted-raycast-[A-Za-z0-9]{6}$/u

export function trustedRaycastLsofPath(platform = process.platform): string {
  if (platform === 'darwin') return '/usr/sbin/lsof'
  if (platform === 'linux') return '/usr/bin/lsof'
  throw new Error(`Unsupported platform for trusted workspace cleanup: ${platform}`)
}

export async function snapshotTrustedRaycastWorkspaces(tempRoot: string): Promise<string[]> {
  return (await readdir(tempRoot)).filter(name => name.startsWith(PREFIX)).sort()
}

async function assertNoSymlinks(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    const stat = await lstat(child)
    if (stat.isSymbolicLink()) throw new Error('Post-baseline trusted workspace contains a symbolic link')
    if (stat.isDirectory()) await assertNoSymlinks(child)
  }
}

async function assertNoProcessReferences(path: string): Promise<void> {
  let openOutput = ''
  try {
    openOutput = (await execFile(trustedRaycastLsofPath(), ['-nP', '-F', 'pn', '+D', path], { maxBuffer: 2 * 1024 * 1024, timeout: 15_000 })).stdout
  } catch (error) {
    const result = error as { code?: number; stdout?: string }
    if (result.code !== 1) throw new Error('Could not prove the trusted workspace has no open files or listeners')
    openOutput = result.stdout ?? ''
  }
  if (openOutput.trim() !== '') throw new Error('Post-baseline trusted workspace has open files or process references')
  const processes = await execFile('/bin/ps', ['-Aeww', '-o', 'pid=,command='], { maxBuffer: 8 * 1024 * 1024, timeout: 15_000 })
  if (processes.stdout.includes(path)) throw new Error('Post-baseline trusted workspace appears in a process cwd, environment, or argv')
}

/** Remove only unambiguous workspaces created after the captured baseline. */
export async function cleanupPostBaselineTrustedRaycastWorkspaces(
  tempRoot: string,
  baseline: readonly string[],
  options: Readonly<{ expectedUid?: number }> = {},
): Promise<Readonly<{ removed: readonly string[] }>> {
  const rootReal = await realpath(tempRoot)
  const current = await snapshotTrustedRaycastWorkspaces(tempRoot)
  const baselineSet = new Set(baseline)
  const newcomers = current.filter(name => !baselineSet.has(name))
  const expectedUid = options.expectedUid ?? process.getuid?.()
  if (expectedUid === undefined) throw new Error('Could not establish the proof user identity')
  const verified: Array<{ name: string; path: string }> = []
  for (const name of newcomers) {
    if (!OWNED_NAME.test(name)) throw new Error('Post-baseline trusted workspace name is not proof-owned')
    const path = join(tempRoot, name)
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) throw new Error('Post-baseline trusted workspace is a symbolic link')
    if (!stat.isDirectory()) throw new Error('Post-baseline trusted workspace is not a directory')
    if (stat.uid !== expectedUid) throw new Error('Post-baseline trusted workspace is not owned by the proof user')
    if ((stat.mode & 0o777) !== 0o700) throw new Error('Post-baseline trusted workspace permissions are not private')
    const pathReal = await realpath(path)
    if (dirname(pathReal) !== rootReal || relative(rootReal, pathReal).startsWith(`..${sep}`)) throw new Error('Post-baseline trusted workspace escapes the temporary root')
    await assertNoSymlinks(path)
    await assertNoProcessReferences(pathReal)
    verified.push({ name, path })
  }
  for (const candidate of verified) await rm(candidate.path, { recursive: true, force: false })
  const restored = await snapshotTrustedRaycastWorkspaces(tempRoot)
  if (JSON.stringify(restored) !== JSON.stringify([...baseline].sort())) throw new Error('Trusted workspace baseline was not restored')
  return Object.freeze({ removed: Object.freeze(verified.map(candidate => candidate.name)) })
}
