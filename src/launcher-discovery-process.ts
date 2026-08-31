import { spawn } from 'node:child_process'
import { lstat, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type LauncherFixedInvocation = Readonly<{ args: readonly string[]; executable: string }>

type DetachedChildProcess = Readonly<{
  kill?: () => unknown
  once: (event: 'error' | 'spawn', listener: ((error: Error) => void) | (() => void)) => unknown
  unref: () => unknown
}>
type SpawnDetachedProcess = (executable: string, args: readonly string[], options: Readonly<{ detached: true; stdio: 'ignore'; windowsHide: true; shell?: false; signal?: AbortSignal }>) => DetachedChildProcess

const spawnDetachedProcess: SpawnDetachedProcess = (executable, args, options) => spawn(executable, [...args], options)
const WINDOWS_STORE_APPLICATION_PATTERN = /^shell:AppsFolder\\[A-Za-z0-9._!{}-]{1,512}$/u
const MAX_TARGET_LENGTH = 16_384
const MAX_URL_LENGTH = 8_192
const POWERSHELL_PREFIX = Object.freeze(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'])

function bounded(value: unknown, maxLength = MAX_TARGET_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/u.test(value)
}

function isAbsolute(value: string): boolean {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\')
}

function identityPart(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value.toString(10) : undefined
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined
  return typeof value === 'string' && /^[0-9]+$/u.test(value) ? value.replace(/^0+(?=\d)/u, '') : undefined
}

export type LauncherPathIdentity = Readonly<{ dev: string; ino: string }>
export type LauncherPathExpectation = Readonly<{
  identity?: LauncherPathIdentity
  kind: 'directory' | 'file'
  root?: string
}>

export function launcherPathIdentity(stats: Readonly<{ dev: unknown; ino: unknown }>): LauncherPathIdentity | undefined {
  const dev = identityPart(stats.dev)
  const ino = identityPart(stats.ino)
  return dev === undefined || ino === undefined ? undefined : Object.freeze({ dev, ino })
}

function isWindowsAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\')
}

function pathEqual(left: string, right: string): boolean {
  const normalize = (value: string) => isWindowsAbsolute(value) ? path.win32.normalize(value).toLocaleLowerCase('en-US') : path.normalize(value)
  return normalize(left) === normalize(right)
}

function isRegularExecutable(stats: { isFile(): boolean; isSymbolicLink(): boolean }): boolean {
  return stats.isFile() && !stats.isSymbolicLink()
}

function knownWindowsVSCodeInstallRoot(directory: string, implementation: typeof path | typeof path.win32): string | undefined {
  const base = implementation.basename(directory)
  if (/^Microsoft VS Code(?: Insiders)?$/iu.test(base)) return directory
  if (base.toLocaleLowerCase('en-US') !== 'bin') return undefined
  const root = implementation.dirname(directory)
  return /^Microsoft VS Code(?: Insiders)?$/iu.test(implementation.basename(root)) ? root : undefined
}

async function regularFile(target: string): Promise<string | undefined> {
  try {
    const selected = await lstat(target)
    return isRegularExecutable(selected) ? target : undefined
  } catch { return undefined }
}

async function canonicalRegularFile(target: string): Promise<string | undefined> {
  try {
    const canonical = await realpath(target)
    const selected = await lstat(canonical)
    return isRegularExecutable(selected) ? canonical : undefined
  } catch { return undefined }
}

export async function resolveLauncherExecutable(
  command: unknown,
  platform: 'Linux' | 'macOS' | 'Windows',
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string | undefined> {
  if (!bounded(command, 1_024)) return undefined
  if (platform === 'Windows') {
    const direct = isAbsolute(command)
    if (direct) {
      const implementation = isWindowsAbsolute(command) ? path.win32 : path
      const base = implementation.basename(command)
      const parent = implementation.dirname(command)
      const root = knownWindowsVSCodeInstallRoot(parent, implementation) ?? knownWindowsVSCodeInstallRoot(implementation.dirname(parent), implementation)
      if (root === undefined || !/^(?:code|code\.cmd|code\.exe|Code\.exe)$/iu.test(base)) return undefined
      return await regularFile(implementation.join(root, 'Code.exe'))
    }
    if (!/^(?:code|code\.cmd|code\.exe)$/iu.test(command)) return undefined
  } else if (!/^code$/iu.test(command) && !isAbsolute(command)) return undefined
  if (isAbsolute(command)) {
    const implementation = isWindowsAbsolute(command) ? path.win32 : path
    if (/\.(?:cmd|bat)$/iu.test(implementation.basename(command))) return undefined
    return platform === 'Windows' ? command : await canonicalRegularFile(command)
  }
  const pathValue = environment.PATH ?? environment.Path
  if (!bounded(pathValue, 16_384)) return undefined
  const markers = platform === 'Windows' ? ['code.cmd', 'code.exe'] : [command]
  for (const directory of pathValue.split(platform === 'Windows' ? ';' : ':').slice(0, 64)) {
    if (!bounded(directory, 4_096) || !isAbsolute(directory)) continue
    const implementation = isWindowsAbsolute(directory) ? path.win32 : path
    if (platform === 'Windows') {
      const root = knownWindowsVSCodeInstallRoot(directory, implementation)
      if (root === undefined) continue
      let markerFound = false
      for (const marker of markers) {
        if (await regularFile(implementation.join(directory, marker)) !== undefined) { markerFound = true; break }
      }
      if (markerFound) {
        const executable = await regularFile(implementation.join(root, 'Code.exe'))
        if (executable !== undefined) return implementation.normalize(executable)
      }
      continue
    }
    const executable = await canonicalRegularFile(implementation.join(directory, command))
    if (executable !== undefined) return implementation.normalize(executable)
  }
  return undefined
}

export function isLauncherPathWithin(root: string, candidate: string): boolean {
  if (!bounded(root) || !bounded(candidate) || !isAbsolute(root) || !isAbsolute(candidate)) return false
  const implementation = isWindowsAbsolute(root) || isWindowsAbsolute(candidate) ? path.win32 : path
  const relative = implementation.relative(implementation.resolve(root), implementation.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !implementation.isAbsolute(relative))
}

/** Revalidate an identity-bound native path immediately before its effect. */
export async function revalidateLauncherPath(target: string, expectation: LauncherPathExpectation): Promise<boolean> {
  if (!bounded(target) || !isAbsolute(target) || expectation.identity === undefined || !bounded(expectation.root ?? target)) return false
  try {
    const selected = await lstat(target, { bigint: true })
    if (selected.isSymbolicLink()) return false
    const canonicalPath = await realpath(target)
    if (expectation.root !== undefined) {
      const canonicalRoot = await realpath(expectation.root)
      if (!isLauncherPathWithin(canonicalRoot, canonicalPath)) return false
    }
    const current = await lstat(canonicalPath, { bigint: true })
    const kind = current.isDirectory() ? 'directory' : current.isFile() ? 'file' : undefined
    if (kind !== expectation.kind) return false
    const identity = launcherPathIdentity(current)
    return identity !== undefined && (expectation.identity === undefined
      || (identity.dev === expectation.identity.dev && identity.ino === expectation.identity.ino))
  } catch { return false }
}

export async function revalidateLauncherExecutable(target: string, expectation: Readonly<{ identity?: LauncherPathIdentity; root?: string }> = {}): Promise<boolean> {
  return await revalidateLauncherPath(target, { ...expectation, kind: 'file' })
}

export function revalidateLauncherWindowsStoreId(target: unknown): target is string {
  return typeof target === 'string' && WINDOWS_STORE_APPLICATION_PATTERN.test(target)
}

export function normalizeLauncherHttpUrl(value: string): string | undefined {
  if (!bounded(value, MAX_URL_LENGTH)) return undefined
  try {
    const parsed = new URL(value)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname || parsed.username || parsed.password) return undefined
    return parsed.href
  } catch { return undefined }
}

export async function revalidateLauncherUrl(value: string, expectedUrl?: string): Promise<boolean> {
  const normalized = normalizeLauncherHttpUrl(value)
  return normalized !== undefined && (expectedUrl === undefined || normalized === normalizeLauncherHttpUrl(expectedUrl))
}

export async function revalidateLauncherVscodeUri(value: string, expectation: Readonly<{ identity?: LauncherPathIdentity }> = {}): Promise<boolean> {
  if (!bounded(value, MAX_URL_LENGTH)) return false
  let parsed: URL
  try { parsed = new URL(value) } catch { return false }
  if (parsed.protocol === 'file:' && parsed.hostname === '') {
    try {
      const target = fileURLToPath(parsed)
      const pathExpectation = expectation.identity === undefined ? undefined : { identity: expectation.identity }
      return await revalidateLauncherPath(target, { kind: 'file', ...(pathExpectation ?? {}) })
        || await revalidateLauncherPath(target, { kind: 'directory', ...(pathExpectation ?? {}) })
    } catch { return false }
  }
  return parsed.protocol === 'vscode-remote:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password
}

export function resolveLinuxDesktopEntryInvocation(target: string): Readonly<{ args: readonly string[]; executable: 'gio' }> {
  if (!bounded(target) || !path.posix.isAbsolute(target) || path.posix.extname(target) !== '.desktop') throw new Error('Invalid Linux desktop entry path')
  return Object.freeze({ args: Object.freeze(['launch', target]), executable: 'gio' })
}

export function resolveWindowsApplicationElevationInvocation(target: string): LauncherFixedInvocation {
  if (!bounded(target) || (!path.win32.isAbsolute(target) && !WINDOWS_STORE_APPLICATION_PATTERN.test(target))) throw new Error('Invalid Windows application target')
  return Object.freeze({
    args: Object.freeze([
      ...POWERSHELL_PREFIX,
      "$target=$args[0]; if ([string]::IsNullOrWhiteSpace($target)) { throw 'Missing application target' }; Start-Process -FilePath $target -Verb RunAs",
      target,
    ]),
    executable: 'powershell.exe',
  })
}

export type LauncherDetachedLaunchOptions = Readonly<{
  signal?: AbortSignal
  timeoutMs?: number
}>

export async function launchDetachedLauncherExecutable(
  executable: string,
  args: readonly string[],
  spawnProcess: SpawnDetachedProcess = spawnDetachedProcess,
  options: LauncherDetachedLaunchOptions = {},
): Promise<void> {
  if (!bounded(executable, 4_096) || /\.(?:cmd|bat)$/iu.test(executable) || !Array.isArray(args) || args.length > 16 || args.some(argument => !bounded(argument))) throw new Error('Invalid detached launcher invocation')
  if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error('Detached launcher invocation canceled')
  const spawnOptions = options.signal === undefined
    ? { detached: true as const, stdio: 'ignore' as const, windowsHide: true as const }
    : { detached: true as const, shell: false as const, signal: options.signal, stdio: 'ignore' as const, windowsHide: true as const }
  const child = spawnProcess(executable, args, spawnOptions)
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.min(options.timeoutMs as number, 15_000)) : options.signal === undefined ? undefined : 15_000
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (reason?: Error): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      if (reason === undefined) resolve()
      else reject(reason)
    }
    const onAbort = (): void => {
      try { child.kill?.() } catch { /* best effort */ }
      finish(options.signal?.reason instanceof Error ? options.signal.reason : new Error('Detached launcher invocation canceled'))
    }
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
      try { child.kill?.() } catch { /* best effort */ }
      finish(new Error('Detached launcher invocation timed out'))
    }, timeoutMs)
    child.once('error', error => finish(error))
    child.once('spawn', () => finish())
    if (options.signal === undefined) return
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  })
  if (options.signal?.aborted) {
    try { child.kill?.() } catch { /* best effort */ }
    throw options.signal.reason instanceof Error ? options.signal.reason : new Error('Detached launcher invocation canceled')
  }
  child.unref()
}

export async function statLauncherPathIdentity(target: string): Promise<LauncherPathIdentity | undefined> {
  try { return launcherPathIdentity(await stat(target, { bigint: true })) } catch { return undefined }
}
