import { spawn } from 'node:child_process'
import path from 'node:path'
import type { LauncherTerminalLaunchRequest, LauncherTerminalPlatform } from './launcher-terminal.ts'

export type LauncherTerminalInvocation = Readonly<{
  args: readonly string[]
  cwd: string
  executable: string
  waitForExit: boolean
}>

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
