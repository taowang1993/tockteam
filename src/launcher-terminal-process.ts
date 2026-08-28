import { spawn } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { LauncherTerminalLaunchRequest, LauncherTerminalPlatform, LauncherTerminalId } from './launcher-terminal.ts'

export type LauncherTerminalInvocation = Readonly<{
  args: readonly string[]
  cwd: string
  executable: string
  waitForExit: boolean
}>

export type LauncherTerminalExecutableIdentity = Readonly<{ dev: string; ino: string }>
export type TrustedWindowsTerminalExecutable = Readonly<{
  executable: string
  identity: LauncherTerminalExecutableIdentity
}>
type TrustedWindowsTerminalCapture = Readonly<{
  canonicalPath: string
  identity: LauncherTerminalExecutableIdentity
}>
type TrustedWindowsTerminalCaptureEffect = (target: string) => Promise<TrustedWindowsTerminalCapture | undefined>

function identityPart(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value.toString(10) : undefined
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined
  return typeof value === 'string' && /^[0-9]+$/u.test(value) ? value.replace(/^0+(?=\d)/u, '') : undefined
}

async function captureTrustedWindowsTerminal(target: string): Promise<TrustedWindowsTerminalCapture | undefined> {
  try {
    const selected = await lstat(target, { bigint: true })
    if (!selected.isFile() || selected.isSymbolicLink()) return undefined
    const canonicalPath = await realpath(target)
    const canonical = await lstat(canonicalPath, { bigint: true })
    const dev = identityPart(canonical.dev)
    const ino = identityPart(canonical.ino)
    if (!canonical.isFile() || canonical.isSymbolicLink() || dev === undefined || ino === undefined) return undefined
    return Object.freeze({ canonicalPath, identity: Object.freeze({ dev, ino }) })
  } catch { return undefined }
}

function windowsAbsolute(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || /[\0\r\n]/u.test(value) || !path.win32.isAbsolute(value)) return undefined
  return path.win32.normalize(value)
}

function windowsEnvironmentValue(environment: Readonly<Record<string, string | undefined>>, key: string): string | undefined {
  return windowsAbsolute(environment[key])
}

function windowsTerminalCandidates(
  terminalId: LauncherTerminalId,
  environment: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  const systemRoot = windowsEnvironmentValue(environment, 'SystemRoot')
  const systemExecutable = (name: string): string | undefined => systemRoot === undefined ? undefined : path.win32.join(systemRoot, 'System32', name)
  if (terminalId === 'Command Prompt') return systemExecutable('cmd.exe') === undefined ? [] : [systemExecutable('cmd.exe')!]
  if (terminalId === 'Powershell') return systemExecutable('powershell.exe') === undefined ? [] : [systemExecutable('powershell.exe')!]
  if (terminalId === 'WSL') return systemExecutable('wsl.exe') === undefined ? [] : [systemExecutable('wsl.exe')!]
  if (terminalId !== 'Powershell Core') return []
  const candidates = [
    windowsEnvironmentValue(environment, 'ProgramFiles'),
    windowsEnvironmentValue(environment, 'LOCALAPPDATA'),
  ].flatMap(root => root === undefined ? [] : [
    path.win32.join(root, 'PowerShell', '7', 'pwsh.exe'),
    ...(root === windowsEnvironmentValue(environment, 'LOCALAPPDATA') ? [path.win32.join(root, 'Programs', 'PowerShell', '7', 'pwsh.exe')] : []),
  ])
  return [...new Set(candidates)]
}

export async function resolveTrustedWindowsTerminalExecutable(
  terminalId: LauncherTerminalId,
  options: Readonly<{
    captureIdentity?: TrustedWindowsTerminalCaptureEffect
    environment?: Readonly<Record<string, string | undefined>>
  }> = {},
): Promise<TrustedWindowsTerminalExecutable> {
  const captureIdentity = options.captureIdentity ?? captureTrustedWindowsTerminal
  for (const candidate of windowsTerminalCandidates(terminalId, options.environment ?? process.env)) {
    const captured = await captureIdentity(candidate)
    if (captured === undefined || !path.win32.isAbsolute(captured.canonicalPath)) continue
    return Object.freeze({ executable: captured.canonicalPath, identity: captured.identity })
  }
  throw new Error(`Trusted Windows terminal executable is unavailable: ${terminalId}`)
}

export async function revalidateTrustedWindowsTerminalExecutable(
  resolution: TrustedWindowsTerminalExecutable,
  captureIdentity: TrustedWindowsTerminalCaptureEffect = captureTrustedWindowsTerminal,
): Promise<boolean> {
  if (!path.win32.isAbsolute(resolution.executable)) return false
  const current = await captureIdentity(resolution.executable)
  if (current === undefined) return false
  return path.win32.normalize(current.canonicalPath).toLocaleLowerCase('en-US') === path.win32.normalize(resolution.executable).toLocaleLowerCase('en-US')
    && current.identity.dev === resolution.identity.dev
    && current.identity.ino === resolution.identity.ino
}

type DetachedChildProcess = Readonly<{
  kill: () => void
  once: (event: 'error' | 'spawn', listener: ((error: Error) => void) | (() => void)) => unknown
  unref: () => void
}>

export type SpawnTerminalProcess = (
  executable: string,
  args: readonly string[],
  options: Readonly<{
    cwd: string
    detached: true
    shell: false
    stdio: 'ignore'
    windowsHide: false
    signal?: AbortSignal
  }>,
) => DetachedChildProcess

const spawnTerminalProcess: SpawnTerminalProcess = (executable, args, options) => (
  spawn(executable, [...args], options) as DetachedChildProcess
)

export const MACOS_TERMINAL_SCRIPT = String.raw`on run argv
set launchCommand to item 1 of argv
set launchDirectory to item 2 of argv
tell application "Terminal"
  if not (exists window 1) then reopen
  activate
  do script "cd " & quoted form of launchDirectory & " && " & launchCommand in window 1
end tell
end run`

export const ITERM_SCRIPT = String.raw`on run argv
set launchCommand to item 1 of argv
set launchDirectory to item 2 of argv
tell application "iTerm"
  if not (exists window 1) then
    create window with default profile
  else
    tell current window to create tab with default profile
  end if
  activate
  tell first session of current tab of current window
    write text "cd " & quoted form of launchDirectory
    write text launchCommand
  end tell
end tell
end run`

function isKnownPlatform(value: LauncherTerminalPlatform): boolean {
  return value === 'Linux' || value === 'macOS' || value === 'Windows'
}

function isAbsolute(platform: LauncherTerminalPlatform, value: string): boolean {
  return platform === 'Windows' ? path.win32.isAbsolute(value) : path.posix.isAbsolute(value)
}

function assertRequest(platform: LauncherTerminalPlatform, request: LauncherTerminalLaunchRequest): void {
  if (!isKnownPlatform(platform)
    || typeof request.command !== 'string'
    || request.command.length === 0
    || request.command.length > 512
    || /[\0\r\n]/u.test(request.command)
    || typeof request.workingDirectory !== 'string'
    || request.workingDirectory.length === 0
    || request.workingDirectory.length > 4_096
    || /[\0\r\n]/u.test(request.workingDirectory)
    || !isAbsolute(platform, request.workingDirectory)) {
    throw new Error('Invalid TockLauncher Terminal invocation')
  }
}

export function resolveTerminalInvocation(
  platform: LauncherTerminalPlatform,
  request: LauncherTerminalLaunchRequest,
): LauncherTerminalInvocation {
  if (!isKnownPlatform(platform)) throw new Error('Unsupported TockLauncher platform')
  if (platform === 'Linux') throw new Error('Terminal Launcher is unsupported on Linux')
  assertRequest(platform, request)
  if (platform === 'macOS') {
    const script = request.terminalId === 'Terminal'
      ? MACOS_TERMINAL_SCRIPT
      : request.terminalId === 'iTerm' ? ITERM_SCRIPT : undefined
    if (script === undefined) throw new Error(`Unknown macOS terminal: ${request.terminalId}`)
    return Object.freeze({
      args: Object.freeze(['-e', script, '--', request.command, request.workingDirectory]),
      cwd: request.workingDirectory,
      executable: '/usr/bin/osascript',
      waitForExit: true,
    })
  }
  const fixed = (() => {
    switch (request.terminalId) {
      case 'Command Prompt': return { args: ['/D', '/K', request.command], executable: 'cmd.exe' }
      case 'Powershell': return { args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', request.command], executable: 'powershell.exe' }
      case 'Powershell Core': return { args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', request.command], executable: 'pwsh.exe' }
      case 'WSL': return { args: ['--cd', request.workingDirectory, 'sh', '-lc', `${request.command}; exec "$SHELL"`], executable: 'wsl.exe' }
      default: throw new Error(`Unknown Windows terminal: ${request.terminalId}`)
    }
  })()
  return Object.freeze({
    args: Object.freeze(fixed.args),
    cwd: request.workingDirectory,
    executable: fixed.executable,
    waitForExit: false,
  })
}

export async function launchDetachedTerminalInvocation(
  invocation: LauncherTerminalInvocation,
  options: Readonly<{
    signal?: AbortSignal
    spawnProcess?: SpawnTerminalProcess
    timeoutMs?: number
  }> = {},
): Promise<void> {
  if (invocation.waitForExit) throw new Error('A wait-for-exit invocation cannot be detached')
  if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error('Terminal launch canceled')
  const configuredTimeout = options.timeoutMs ?? 5_000
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.max(1, Math.min(configuredTimeout, 15_000)) : 5_000
  const spawnOptions = {
    cwd: invocation.cwd,
    detached: true as const,
    shell: false as const,
    stdio: 'ignore' as const,
    windowsHide: false as const,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
  const child = (options.spawnProcess ?? spawnTerminalProcess)(invocation.executable, invocation.args, spawnOptions)
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
      if (error === undefined) resolve()
      else reject(error)
    }
    const onAbort = (): void => {
      try { child.kill() } catch { /* best effort */ }
      finish(options.signal?.reason instanceof Error ? options.signal.reason : new Error('Terminal launch canceled'))
    }
    const timeout = setTimeout(() => {
      try { child.kill() } catch { /* best effort */ }
      finish(new Error('Terminal launch timed out'))
    }, timeoutMs)
    child.once('error', error => finish(error))
    child.once('spawn', () => finish())
    if (options.signal === undefined) return
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  })
  if (options.signal?.aborted) {
    try { child.kill() } catch { /* best effort */ }
    throw options.signal.reason instanceof Error ? options.signal.reason : new Error('Terminal launch canceled')
  }
  child.unref()
}
