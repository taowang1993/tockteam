import { spawn } from 'node:child_process'
import path from 'node:path'
import type { LauncherTerminalPlatform } from './launcher-terminal-config.ts'

export type LauncherWorkflowCommandRequest = Readonly<{
  command: string
  platform: LauncherTerminalPlatform
  signal: AbortSignal
  workingDirectory: string
}>

export type LauncherWorkflowCommandResult = Readonly<{
  stderrBytes: number
  stdoutBytes: number
}>

export type LauncherWorkflowCommandInvocation = Readonly<{
  args: readonly string[]
  cwd: string
  executable: string
}>

export type LauncherWorkflowTerminationInvocation = Readonly<{
  args: readonly string[]
  executable: 'taskkill.exe'
}>

type WorkflowChildProcess = Readonly<{
  kill: (signal?: NodeJS.Signals) => boolean
  once: {
    (event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
    (event: 'error', listener: (error: Error) => void): unknown
  }
  pid?: number
  stderr: Readonly<{ on: (event: 'data', listener: (chunk: Uint8Array | string) => void) => unknown }>
  stdout: Readonly<{ on: (event: 'data', listener: (chunk: Uint8Array | string) => void) => unknown }>
}>

type SpawnWorkflowProcess = (
  executable: string,
  args: readonly string[],
  options: Readonly<{
    cwd: string
    detached: true
    env: Readonly<Record<string, string>>
    shell: false
    stdio: readonly ['ignore', 'pipe', 'pipe']
    windowsHide: true
  }>,
) => WorkflowChildProcess

type WorkflowTerminationProcess = Readonly<{
  once: {
    (event: 'close', listener: (code: number | null) => void): unknown
    (event: 'error', listener: (error: Error) => void): unknown
  }
  unref: () => void
}>

type SpawnWorkflowTerminationProcess = (
  executable: string,
  args: readonly string[],
  options: Readonly<{
    env: Readonly<Record<string, string>>
    shell: false
    stdio: readonly ['ignore', 'ignore', 'ignore']
    windowsHide: true
  }>,
) => WorkflowTerminationProcess

const DEFAULT_OUTPUT_BYTES = 64 * 1024
const HARD_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000
const HARD_TIMEOUT_MS = 60_000
const PROCESS_DRAIN_TIMEOUT_MS = 250
const WINDOWS_KILL_TIMEOUT_MS = 5_000

const spawnWorkflowProcess: SpawnWorkflowProcess = (executable, args, options) => {
  const child = spawn(executable, [...args], {
    ...options,
    env: { ...options.env },
    stdio: [...options.stdio],
  })
  if (!child.stdout || !child.stderr) throw new Error('TockLauncher Workflow child process has no output pipes')
  return {
    kill: signal => child.kill(signal),
    once: child.once.bind(child) as WorkflowChildProcess['once'],
    ...(child.pid === undefined ? {} : { pid: child.pid }),
    stderr: child.stderr,
    stdout: child.stdout,
  }
}

const spawnWorkflowTerminationProcess: SpawnWorkflowTerminationProcess = (executable, args, options) => (
  spawn(executable, [...args], { ...options, env: { ...options.env }, stdio: [...options.stdio] }) as unknown as WorkflowTerminationProcess
)

function assertCommand(platform: LauncherTerminalPlatform, command: unknown, workingDirectory: unknown): asserts command is string {
  const absolute = typeof workingDirectory === 'string' && (platform === 'Windows'
    ? path.win32.isAbsolute(workingDirectory)
    : path.posix.isAbsolute(workingDirectory))
  if ((platform !== 'Linux' && platform !== 'macOS' && platform !== 'Windows')
    || typeof command !== 'string'
    || typeof workingDirectory !== 'string'
    || !absolute
    || workingDirectory.length === 0
    || workingDirectory.length > 4_096
    || /[\0\r\n]/u.test(workingDirectory)
    || command.length === 0
    || command.trim().length === 0
    || command.length > 2_048
    || /[\0\r\n]/u.test(command)) {
    throw new Error('Invalid TockLauncher Workflow command invocation')
  }
}

export function resolveWorkflowCommandInvocation(
  platform: LauncherTerminalPlatform,
  command: string,
  workingDirectory: string,
): LauncherWorkflowCommandInvocation {
  assertCommand(platform, command, workingDirectory)
  return Object.freeze(platform === 'Windows'
    ? { args: Object.freeze(['/D', '/S', '/C', command]), cwd: workingDirectory, executable: 'cmd.exe' }
    : { args: Object.freeze(['-lc', command]), cwd: workingDirectory, executable: '/bin/sh' })
}

function boundedSystemRoot(value: unknown): string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && /^[A-Za-z]:\\[^\0\r\n]*$/u.test(value)
    ? value.replace(/[\\/]+$/u, '')
    : 'C:\\Windows'
}

function boundedLanguage(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_.@-]{1,64}$/u.test(value) ? value : 'C.UTF-8'
}

function boundedEnvironment(
  platform: LauncherTerminalPlatform,
  workingDirectory: string,
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  if (platform === 'Windows') {
    const systemRoot = boundedSystemRoot(environment.SystemRoot ?? environment.SystemRoot)
    return Object.freeze({
      ComSpec: `${systemRoot}\\System32\\cmd.exe`,
      PATH: `${systemRoot}\\System32;${systemRoot}`,
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      SystemRoot: systemRoot,
      USERPROFILE: workingDirectory,
    })
  }
  return Object.freeze({
    HOME: workingDirectory,
    LANG: boundedLanguage(environment.LANG),
    PATH: platform === 'macOS'
      ? '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
      : '/usr/local/bin:/usr/bin:/bin',
  })
}

export function resolveWorkflowTerminationInvocation(pid: number): LauncherWorkflowTerminationInvocation {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid TockLauncher Workflow process ID')
  return Object.freeze({ args: Object.freeze(['/PID', String(pid), '/T', '/F']), executable: 'taskkill.exe' })
}

function hardKillChild(child: WorkflowChildProcess): void {
  try { child.kill('SIGKILL') } catch { /* already exited */ }
}

function waitForChildClose(child: WorkflowChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const finish = (closed: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(closed)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.once('close', () => finish(true))
    child.once('error', () => finish(true))
  })
}

async function terminateChild(
  child: WorkflowChildProcess,
  platform: LauncherTerminalPlatform,
  environment: Readonly<Record<string, string>>,
  spawnTerminationProcess: SpawnWorkflowTerminationProcess,
  killProcess: (pid: number, signal: NodeJS.Signals) => void,
): Promise<void> {
  if (platform === 'Windows' && child.pid !== undefined && Number.isSafeInteger(child.pid) && child.pid > 0) {
    const invocation = resolveWorkflowTerminationInvocation(child.pid)
    let killerFinished = false
    await new Promise<void>(resolve => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        killerFinished = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(finish, WINDOWS_KILL_TIMEOUT_MS)
      try {
        const killer = spawnTerminationProcess(invocation.executable, invocation.args, {
          env: environment,
          shell: false,
          stdio: ['ignore', 'ignore', 'ignore'],
          windowsHide: true,
        })
        killer.once('error', finish)
        killer.once('close', code => { if (code === 0) finish(); else { hardKillChild(child); finish() } })
        killer.unref()
      } catch {
        hardKillChild(child)
        finish()
      }
    })
    // A successful taskkill is not proof that the child handle has closed yet.
    if (killerFinished && !await waitForChildClose(child, PROCESS_DRAIN_TIMEOUT_MS)) hardKillChild(child)
    await waitForChildClose(child, PROCESS_DRAIN_TIMEOUT_MS)
    return
  }
  if (child.pid !== undefined && Number.isSafeInteger(child.pid) && child.pid > 0) {
    try { killProcess(-child.pid, 'SIGKILL') } catch { /* fall back to the child handle */ }
  }
  if (!await waitForChildClose(child, PROCESS_DRAIN_TIMEOUT_MS)) {
    hardKillChild(child)
    await waitForChildClose(child, PROCESS_DRAIN_TIMEOUT_MS)
  }
}

function finiteBound(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, value as number)) : fallback
}

export async function runBoundedWorkflowCommand(
  request: LauncherWorkflowCommandRequest,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>
    killProcess?: (pid: number, signal: NodeJS.Signals) => void
    maxOutputBytes?: number
    spawnProcess?: SpawnWorkflowProcess
    spawnTerminationProcess?: SpawnWorkflowTerminationProcess
    timeoutMs?: number
  }> = {},
): Promise<LauncherWorkflowCommandResult> {
  resolveWorkflowCommandInvocation(request.platform, request.command, request.workingDirectory)
  if (request.signal.aborted) throw new Error('Workflow command cancelled')
  const maxOutputBytes = finiteBound(options.maxOutputBytes, DEFAULT_OUTPUT_BYTES, HARD_OUTPUT_BYTES)
  const timeoutMs = finiteBound(options.timeoutMs, DEFAULT_TIMEOUT_MS, HARD_TIMEOUT_MS)
  const environment = boundedEnvironment(request.platform, request.workingDirectory, options.environment ?? process.env)
  let child: WorkflowChildProcess
  try {
    child = (options.spawnProcess ?? spawnWorkflowProcess)(
      request.platform === 'Windows' ? 'cmd.exe' : '/bin/sh',
      request.platform === 'Windows' ? ['/D', '/S', '/C', request.command] : ['-lc', request.command],
      {
        cwd: request.workingDirectory,
        detached: true,
        env: environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
  } catch (error) {
    throw error instanceof Error ? error : new Error('Workflow command could not start')
  }

  return await new Promise<LauncherWorkflowCommandResult>((resolve, reject) => {
    let settled = false
    let stopping = false
    let stdoutBytes = 0
    let stderrBytes = 0
    let timeout: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      request.signal.removeEventListener('abort', cancel)
      if (error === undefined) resolve(Object.freeze({ stderrBytes, stdoutBytes }))
      else reject(error)
    }
    const stop = (error: Error): void => {
      if (settled || stopping) return
      stopping = true
      void terminateChild(
        child,
        request.platform,
        environment,
        options.spawnTerminationProcess ?? spawnWorkflowTerminationProcess,
        options.killProcess ?? ((pid, signal) => process.kill(pid, signal)),
      ).then(() => finish(error), () => finish(error))
    }
    const cancel = (): void => stop(new Error('Workflow command cancelled'))
    const count = (stream: 'stdout' | 'stderr', chunk: Uint8Array | string): void => {
      const bytes = typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.byteLength
      if (stream === 'stdout') stdoutBytes += bytes
      else stderrBytes += bytes
      if (stdoutBytes + stderrBytes > maxOutputBytes) stop(new Error('Workflow command output limit exceeded'))
    }

    child.stdout.on('data', chunk => count('stdout', chunk))
    child.stderr.on('data', chunk => count('stderr', chunk))
    child.once('error', error => { if (!stopping) finish(error) })
    child.once('close', code => { if (!stopping) finish(code === 0 ? undefined : new Error('Workflow command failed')) })
    timeout = setTimeout(() => stop(new Error('Workflow command timed out')), timeoutMs)
    request.signal.addEventListener('abort', cancel, { once: true })
    // Register listeners before checking so a post-spawn abort cannot strand a child.
    if (request.signal.aborted) cancel()
  })
}
