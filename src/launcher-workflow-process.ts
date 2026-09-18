import { spawn } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { OwnedProcess, OwnedProcessOptions, OwnedProcessResult } from 'tockbot-note-runtime/owned-process'
import type { LauncherTerminalPlatform } from './launcher-terminal-config.ts'
import { resolveWindowsSystemExecutable } from './launcher-discovery-process.ts'

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

export type LauncherWorkflowExecutableIdentity = Readonly<{ dev: string; ino: string }>
export type LauncherWorkflowExecutableCapture = (target: string) => Promise<Readonly<{
  canonicalPath: string
  identity: LauncherWorkflowExecutableIdentity
}> | undefined>

type WorkflowChildProcess = Readonly<{
  kill: (signal?: NodeJS.Signals) => boolean
  once: {
    (event: 'close' | 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
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
    signal: AbortSignal
    stdio: readonly ['ignore', 'pipe', 'pipe']
    windowsHide: true
  }>,
) => WorkflowChildProcess

const DEFAULT_OUTPUT_BYTES = 64 * 1024
const HARD_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000
const HARD_TIMEOUT_MS = 60_000
const PROCESS_DRAIN_TIMEOUT_MS = 250
export type LauncherTrustedWindowsSystemExecutable = 'cmd.exe' | 'control.exe' | 'powershell.exe' | 'rundll32.exe' | 'shutdown.exe' | 'taskkill.exe'
const WINDOWS_SYSTEM_EXECUTABLES = new Set<LauncherTrustedWindowsSystemExecutable>(['cmd.exe', 'control.exe', 'powershell.exe', 'rundll32.exe', 'shutdown.exe', 'taskkill.exe'])

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
  environment: Readonly<Record<string, string | undefined>> = {},
): LauncherWorkflowCommandInvocation {
  assertCommand(platform, command, workingDirectory)
  return Object.freeze(platform === 'Windows'
    ? { args: Object.freeze(['/D', '/S', '/C', command]), cwd: workingDirectory, executable: path.win32.join(boundedSystemRoot(environment.SystemRoot), 'System32', 'cmd.exe') }
    : { args: Object.freeze(['-lc', command]), cwd: workingDirectory, executable: '/bin/sh' })
}

function boundedSystemRoot(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(value)) return 'C:\\Windows'
  const normalized = path.win32.normalize(value.replace(/[\\/]+$/u, ''))
  return normalized.includes('..') || !path.win32.isAbsolute(normalized) ? 'C:\\Windows' : normalized
}

function identityPart(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value.toString(10) : undefined
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined
  return typeof value === 'string' && /^[0-9]+$/u.test(value) ? value.replace(/^0+(?=\d)/u, '') : undefined
}

function comparableWindowsPath(value: string): string {
  const normalized = path.win32.normalize(value)
  if (normalized.startsWith('\\\\?\\UNC\\')) return `\\\\${normalized.slice('\\\\?\\UNC\\'.length)}`.toLocaleLowerCase('en-US')
  if (normalized.startsWith('\\\\?\\')) return normalized.slice('\\\\?\\'.length).toLocaleLowerCase('en-US')
  return normalized.toLocaleLowerCase('en-US')
}

async function captureWorkflowWindowsExecutable(target: string): Promise<Readonly<{ canonicalPath: string; identity: LauncherWorkflowExecutableIdentity }> | undefined> {
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

export async function resolveTrustedWorkflowWindowsExecutable(
  executableName: LauncherTrustedWindowsSystemExecutable,
  environment: Readonly<Record<string, string | undefined>>,
  capture: LauncherWorkflowExecutableCapture = captureWorkflowWindowsExecutable,
): Promise<Readonly<{ executable: string; identity: LauncherWorkflowExecutableIdentity }>> {
  if (!WINDOWS_SYSTEM_EXECUTABLES.has(executableName)) throw new Error('Invalid TockLauncher Workflow Windows executable')
  const systemRoot = boundedSystemRoot(environment.SystemRoot)
  const candidate = executableName === 'powershell.exe'
    ? resolveWindowsSystemExecutable('powershell', { SystemRoot: systemRoot })
    : path.win32.join(systemRoot, 'System32', executableName)
  const selected = await capture(candidate)
  if (selected === undefined || !path.win32.isAbsolute(selected.canonicalPath) || comparableWindowsPath(selected.canonicalPath) !== comparableWindowsPath(candidate)) {
    throw new Error('TockLauncher Workflow Windows executable is unavailable')
  }
  return Object.freeze({ executable: selected.canonicalPath, identity: selected.identity })
}

export async function revalidateTrustedWorkflowWindowsExecutable(
  resolution: Readonly<{ executable: string; identity: LauncherWorkflowExecutableIdentity }>,
  capture: LauncherWorkflowExecutableCapture = captureWorkflowWindowsExecutable,
): Promise<boolean> {
  if (!path.win32.isAbsolute(resolution.executable)) return false
  const current = await capture(resolution.executable)
  return current !== undefined
    && comparableWindowsPath(current.canonicalPath) === comparableWindowsPath(resolution.executable)
    && current.identity.dev === resolution.identity.dev
    && current.identity.ino === resolution.identity.ino
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
    const systemRoot = boundedSystemRoot(environment.SystemRoot)
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
    child.once('error', () => undefined)
  })
}

async function terminateChild(
  child: WorkflowChildProcess,
  killProcess: (pid: number, signal: NodeJS.Signals) => void,
): Promise<void> {
  const waitForTermination = async (): Promise<void> => {
    if (await waitForChildClose(child, PROCESS_DRAIN_TIMEOUT_MS)) return
    hardKillChild(child)
    await waitForChildClose(child, PROCESS_DRAIN_TIMEOUT_MS)
  }
  if (child.pid !== undefined && Number.isSafeInteger(child.pid) && child.pid > 0) {
    try { killProcess(-child.pid, 'SIGKILL') } catch { hardKillChild(child) }
  }
  await waitForTermination()
}

function finiteBound(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, value as number)) : fallback
}

async function spawnWorkflowOwnedProcess(options: OwnedProcessOptions, runtimeRoot?: string): Promise<OwnedProcess> {
  // Desktop resolves from its staged runtime, never from the Electron bundle or
  // a user workspace. The default supports direct Node consumers of this module.
  const root = runtimeRoot === undefined ? undefined : await realpath(runtimeRoot)
  const entry = await realpath(createRequire(root === undefined ? import.meta.url : path.join(root, 'package.json')).resolve('tockbot-note-runtime/owned-process'))
  if (root !== undefined) {
    const relative = path.relative(root, entry)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Workflow owner is outside the staged runtime')
  }
  return (await import(pathToFileURL(entry).href)).spawnOwnedProcess(options)
}

async function runOwnedWindowsWorkflow(
  request: LauncherWorkflowCommandRequest, invocation: LauncherWorkflowCommandInvocation,
  environment: Readonly<Record<string, string>>, maxOutputBytes: number, timeoutMs: number,
  spawnOwner: (options: OwnedProcessOptions) => Promise<OwnedProcess>,
): Promise<LauncherWorkflowCommandResult> {
  const controller = new AbortController()
  let stopError: Error | undefined, failure: unknown, cleanupError: unknown
  let child: OwnedProcess | undefined, result: OwnedProcessResult | undefined
  const stop = (message: string): void => { stopError ??= new Error(message); controller.abort() }
  const cancel = (): void => stop('Workflow command cancelled')
  const timer = setTimeout(() => stop('Workflow command timed out'), timeoutMs)
  request.signal.addEventListener('abort', cancel, { once: true })
  if (request.signal.aborted) cancel()
  try {
    child = await spawnOwner({ ...invocation, args: ['/D', '/S', '/C', `"${request.command}"`], env: environment, signal: controller.signal, maxOutputBytes: Math.floor(maxOutputBytes), windowsVerbatimArguments: true })
    result = await child.completion
  } catch (error) { failure = error } finally {
    try { if (child) await child.terminate() } catch (error) { cleanupError = error }
    clearTimeout(timer); request.signal.removeEventListener('abort', cancel)
  }
  // Cleanup uncertainty outranks cancellation/timeout. Never race away ownership.
  if (cleanupError || (failure instanceof Error && /cleanup could not be verified/u.test(failure.message))) throw new Error('Workflow command cleanup failed', { cause: cleanupError ?? failure })
  if (stopError) throw stopError
  if (failure) {
    if (failure instanceof Error && /output limit/u.test(failure.message)) throw new Error('Workflow command output limit exceeded')
    throw new Error(child ? 'Workflow command failed' : 'Workflow command could not start', { cause: failure })
  }
  if (result?.code !== 0 || result.signal !== null) throw new Error('Workflow command failed')
  return Object.freeze({ stdoutBytes: result.stdoutBytes, stderrBytes: result.stderrBytes })
}

export async function runBoundedWorkflowCommand(
  request: LauncherWorkflowCommandRequest,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>
    killProcess?: (pid: number, signal: NodeJS.Signals) => void
    maxOutputBytes?: number
    spawnProcess?: SpawnWorkflowProcess
    spawnOwnedProcess?: (options: OwnedProcessOptions) => Promise<OwnedProcess>
    runtimeRoot?: string
    captureWindowsExecutable?: LauncherWorkflowExecutableCapture
    timeoutMs?: number
  }> = {},
): Promise<LauncherWorkflowCommandResult> {
  const rawEnvironment = options.environment ?? process.env
  const environment = boundedEnvironment(request.platform, request.workingDirectory, rawEnvironment)
  const invocation = resolveWorkflowCommandInvocation(request.platform, request.command, request.workingDirectory, rawEnvironment)
  if (request.signal.aborted) throw new Error('Workflow command cancelled')
  const maxOutputBytes = finiteBound(options.maxOutputBytes, DEFAULT_OUTPUT_BYTES, HARD_OUTPUT_BYTES)
  const timeoutMs = finiteBound(options.timeoutMs, DEFAULT_TIMEOUT_MS, HARD_TIMEOUT_MS)
  const captureWindowsExecutable = options.captureWindowsExecutable ?? captureWorkflowWindowsExecutable
  let executable = invocation.executable
  let child: WorkflowChildProcess
  try {
    if (request.platform === 'Windows') {
      const trusted = await resolveTrustedWorkflowWindowsExecutable('cmd.exe', environment, captureWindowsExecutable)
      if (!await revalidateTrustedWorkflowWindowsExecutable(trusted, captureWindowsExecutable)) throw new Error('Windows command executable changed')
      executable = trusted.executable
      return runOwnedWindowsWorkflow(request, { ...invocation, executable }, environment, maxOutputBytes, timeoutMs,
        options.spawnOwnedProcess ?? (ownedOptions => spawnWorkflowOwnedProcess(ownedOptions, options.runtimeRoot)))
    }
    child = (options.spawnProcess ?? spawnWorkflowProcess)(
      executable,
      invocation.args,
      {
        cwd: request.workingDirectory,
        detached: true,
        env: environment,
        shell: false,
        signal: request.signal,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
  } catch {
    throw new Error('Workflow command could not start')
  }

  return await new Promise<LauncherWorkflowCommandResult>((resolve, reject) => {
    let settled = false
    let stopping = false
    let stopError: Error | undefined
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
    const stop = (error?: Error): void => {
      if (error !== undefined) stopError ??= error
      if (settled || stopping) return
      stopping = true
      void terminateChild(
        child,
        options.killProcess ?? ((pid, signal) => process.kill(pid, signal)),
      ).then(() => finish(stopError), () => finish(stopError ?? new Error('Workflow command cleanup failed')))
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
    child.once('error', () => { stop(new Error('Workflow command could not start')) })
    // A shell may exit while background children still own its pipes/process group.
    child.once('exit', code => { stop(code === 0 ? undefined : new Error('Workflow command failed')) })
    child.once('close', code => { if (!stopping) finish(code === 0 ? undefined : new Error('Workflow command failed')) })
    timeout = setTimeout(() => stop(new Error('Workflow command timed out')), timeoutMs)
    request.signal.addEventListener('abort', cancel, { once: true })
    // Register listeners before checking so a post-spawn abort cannot strand a child.
    if (request.signal.aborted) cancel()
  })
}
