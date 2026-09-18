import { spawn } from 'node:child_process'
import path from 'node:path'

export type OwnedProcessOptions = Readonly<{
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string | undefined>>
  signal: AbortSignal
  maxOutputBytes?: number
  /** Host-only admission around actual launch, after asynchronous platform preparation. */
  admit?: (launch: () => Promise<OwnedProcess>) => Promise<OwnedProcess>
  /** Host-selected Windows shells only: arguments are already quoted for that shell. */
  windowsVerbatimArguments?: boolean
}>

export type OwnedProcessResult = Readonly<{
  code: number | null
  signal: NodeJS.Signals | null
  stdoutBytes: number
  stderrBytes: number
}>

export type OwnedProcess = Readonly<{
  pid: number
  completion: Promise<OwnedProcessResult>
  /** Resolves only after the owned lifetime is verified stopped, even after an operation failure. */
  terminate(): Promise<void>
}>

export const OWNED_PROCESS_EXIT_DEADLINE_MS = 5_000
const MAX_OUTPUT_BYTES = 1024 * 1024

/** Host-only lifetime ownership, not filesystem or account confinement. */
export async function spawnOwnedProcess(options: OwnedProcessOptions): Promise<OwnedProcess> {
  const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024
  if (!path.isAbsolute(options.executable) || !path.isAbsolute(options.cwd)
    || /\0/u.test(options.executable + options.cwd)
    || options.args.length > 1024 || options.args.some(arg => typeof arg !== 'string' || arg.includes('\0'))
    || Object.entries(options.env).some(([key, value]) => !key || /[=\0]/u.test(key) || (value !== undefined && (typeof value !== 'string' || value.includes('\0'))))
    || (options.admit !== undefined && typeof options.admit !== 'function')
    || (options.windowsVerbatimArguments !== undefined && typeof options.windowsVerbatimArguments !== 'boolean')
    || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > MAX_OUTPUT_BYTES) {
    throw new Error('Invalid owned process invocation')
  }
  if (options.signal.aborted) throw new Error('Owned process cancelled')
  // Windows must use creation-time Job ownership, never taskkill or a plain detached spawn.
  if (process.platform === 'win32') {
    if (process.arch !== 'x64') throw new Error('Owned processes require a verified x64 Windows host')
    return (await import('./owned-process-windows.ts')).spawnWindowsOwnedProcess(options)
  }
  if (options.admit) {
    const { admit, ...invocation } = options
    return admit(() => spawnOwnedProcess(invocation))
  }
  const child = spawn(options.executable, [...options.args], {
    cwd: options.cwd, env: { ...options.env }, detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let rootExited = false
  let closed = false
  let finished = false
  let stoppingAt: number | undefined
  let failure: Error | undefined
  let code: number | null = null
  let signal: NodeJS.Signals | null = null
  let stdoutBytes = 0
  let stderrBytes = 0
  const outcome = Promise.withResolvers<OwnedProcessResult>()
  const cleanup = Promise.withResolvers<void>()
  // Observe early failures while the caller is still awaiting the spawn handshake.
  void outcome.promise.catch(() => {})
  void cleanup.promise.catch(() => {})
  let timer: ReturnType<typeof setInterval> | undefined
  const finish = (cleanupError?: Error): void => {
    if (finished) return
    finished = true
    clearInterval(timer)
    options.signal.removeEventListener('abort', cancel)
    if (cleanupError) {
      // Release Host event-loop resources, not ownership proof. Both promises
      // remain rejected; callers must quarantine this failed owner/path.
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
      cleanup.reject(cleanupError)
      outcome.reject(cleanupError)
    } else {
      cleanup.resolve()
      if (failure) outcome.reject(failure)
      else outcome.resolve({ code, signal, stdoutBytes, stderrBytes })
    }
  }
  const poll = (): void => {
    if (finished || stoppingAt === undefined) return
    // Deliberately conservative: even zombie-only groups remain unverified.
    let groupGone = child.pid === undefined
    if (child.pid !== undefined) {
      try { process.kill(-child.pid, 0) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') groupGone = true
      }
    }
    if (groupGone && rootExited && closed) { finish(); return }
    if (performance.now() - stoppingAt >= OWNED_PROCESS_EXIT_DEADLINE_MS) {
      finish(new Error('Owned process cleanup could not be verified'))
    }
  }
  const stop = (error?: Error): void => {
    failure ??= error
    if (finished || stoppingAt !== undefined) return
    stoppingAt = performance.now()
    if (child.pid !== undefined) {
      try { process.kill(-child.pid, 'SIGKILL') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failure ??= error as Error
      }
    }
    timer = setInterval(poll, 20)
    poll()
  }
  const cancel = (): void => stop(new Error('Owned process cancelled'))
  const count = (stream: 'stdout' | 'stderr', data: Buffer): void => {
    if (stream === 'stdout') stdoutBytes += data.byteLength
    else stderrBytes += data.byteLength
    if (stdoutBytes + stderrBytes > maxOutputBytes) stop(new Error('Owned process output limit exceeded'))
  }
  child.stdout.on('data', (chunk: Buffer) => count('stdout', chunk))
  child.stderr.on('data', (chunk: Buffer) => count('stderr', chunk))
  child.once('exit', (exitCode, exitSignal) => {
    rootExited = true; code = exitCode; signal = exitSignal
    // A normal root exit does not release descendants that retained its group or pipes.
    stop()
  })
  child.once('close', () => { closed = true; poll() })
  child.once('error', error => {
    rootExited = child.pid === undefined
    stop(error)
  })
  options.signal.addEventListener('abort', cancel, { once: true })
  if (options.signal.aborted) cancel()
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  }).catch(async error => { await cleanup.promise; throw error })
  return { pid: child.pid!, completion: outcome.promise, terminate: () => { stop(); return cleanup.promise } }
}
