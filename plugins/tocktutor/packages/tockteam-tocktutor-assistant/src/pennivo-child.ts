import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  SubprocessHandle,
  SubprocessRuntime,
  SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'

const PROTOCOL_VERSION = '2025-11-25'
const PENNIVO_VERSION = '1.4.0'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_RESTART_DELAY_MS = 250
const DEFAULT_LIFETIME_MS = 30 * 60_000
const DEFAULT_MAX_LINE_BYTES = 1024 * 1024
const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024
const DEFAULT_MAX_PENDING = 32
const DEFAULT_MAX_RESTARTS = 3
const DEFAULT_GRACE_MS = 2_000
const MAX_TIMER_MS = 2_147_483_647
const BINDING_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

export type PennivoWritePermission = 'read-only' | 'propose'

export interface PennivoBinding {
  vaultId: string
  vaultGeneration: number
  writePermission: PennivoWritePermission
}

export interface PennivoChildInfo {
  instanceId: string
  binding: PennivoBinding
}

export interface PennivoChildOptions {
  resolveArgv?: (runtime: SubprocessRuntime) => Promise<readonly string[]>
  randomId?: () => string
  requestTimeoutMs?: number
  restartDelayMs?: number
  lifetimeMs?: number
  maxLineBytes?: number
  maxRequestBytes?: number
  maxPending?: number
  maxRestarts?: number
  graceMs?: number
  tempRoot?: string
  onInstanceChange?: (currentInstanceId: string | null, previousInstanceId: string | null) => void
}

export type PennivoChildErrorCode =
  | 'DISPOSED'
  | 'CHILD_REPLACED'
  | 'CHILD_EXITED'
  | 'TIMEOUT'
  | 'PROTOCOL'
  | 'VERSION_MISMATCH'
  | 'TOO_MANY_PENDING'
  | 'REQUEST_TOO_LARGE'
  | 'START_FAILED'

const MESSAGES: Record<PennivoChildErrorCode, string> = {
  DISPOSED: 'The Pennivo child manager is disposed.',
  CHILD_REPLACED: 'The Pennivo child was replaced.',
  CHILD_EXITED: 'The Pennivo child exited.',
  TIMEOUT: 'The Pennivo child request timed out.',
  PROTOCOL: 'The Pennivo child sent an invalid response.',
  VERSION_MISMATCH: 'The packaged Pennivo child has an unexpected version.',
  TOO_MANY_PENDING: 'The Pennivo child has too many pending requests.',
  REQUEST_TOO_LARGE: 'The Pennivo child request is too large.',
  START_FAILED: 'The Pennivo child could not start.',
}

export class PennivoChildError extends Error {
  readonly code: PennivoChildErrorCode

  constructor(code: PennivoChildErrorCode) {
    super(MESSAGES[code])
    this.name = 'PennivoChildError'
    this.code = code
  }
}

interface PendingRequest {
  instanceId: string
  resolve(value: unknown): void
  reject(error: PennivoChildError): void
  timer: ReturnType<typeof setTimeout>
}

interface ChildState {
  instanceId: string
  binding: PennivoBinding
  scratch: string
  handle: SubprocessHandle
  pending: Map<number, PendingRequest>
  stdoutBuffer: string
  lifetimeTimer: ReturnType<typeof setTimeout>
  onData(chunk: Buffer | string): void
  failed: boolean
  stopping: boolean
  stopTask?: Promise<void>
}

function error(code: PennivoChildErrorCode): PennivoChildError {
  return new PennivoChildError(code)
}

function positiveInteger(value: number, field: string, maximum = MAX_TIMER_MS): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${field} must be a positive safe integer no greater than ${maximum}`)
  }
  return value
}

function nonnegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`)
  return value
}

function binding(value: PennivoBinding): PennivoBinding {
  if (!BINDING_ID.test(value.vaultId)) throw new TypeError('vaultId must be a bounded opaque identifier')
  nonnegativeInteger(value.vaultGeneration, 'vaultGeneration')
  if (value.writePermission !== 'read-only' && value.writePermission !== 'propose') {
    throw new TypeError('writePermission must be read-only or propose')
  }
  return { ...value }
}

function sameBinding(left: PennivoBinding, right: PennivoBinding): boolean {
  return left.vaultId === right.vaultId
    && left.vaultGeneration === right.vaultGeneration
    && left.writePermission === right.writePermission
}

/** Tombstone every ambient variable except the small platform/runtime allowlist. */
export function restrictedPennivoEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = new Set([
    'LANG', 'LC_ALL', 'LC_CTYPE', 'NO_COLOR', 'PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR',
  ])
  const result: NodeJS.ProcessEnv = { NO_COLOR: '1' }
  for (const [key, value] of Object.entries(environment)) {
    result[key] = allowed.has(key) ? value : undefined
  }
  return result
}

export async function resolvePennivoArgv(runtime: SubprocessRuntime): Promise<readonly string[]> {
  const entry = fileURLToPath(import.meta.resolve('@pennivo/mcp-server'))
  const root = dirname(dirname(entry))
  const script = join(root, 'dist', 'bin', 'cli.js')
  const node = await runtime.resolveExecutable(process.execPath)
  return [node, script]
}

function childInfo(state: ChildState): PennivoChildInfo {
  return { instanceId: state.instanceId, binding: { ...state.binding } }
}

function responseId(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return undefined
  return value
}

export class PennivoChildManager {
  private readonly runtime: SubprocessRuntime
  private readonly resolveArgv: (runtime: SubprocessRuntime) => Promise<readonly string[]>
  private readonly randomId: () => string
  private readonly requestTimeoutMs: number
  private readonly restartDelayMs: number
  private readonly lifetimeMs: number
  private readonly maxLineBytes: number
  private readonly maxRequestBytes: number
  private readonly maxPending: number
  private readonly maxRestarts: number
  private readonly graceMs: number
  private readonly tempRoot: string
  private readonly onInstanceChange: (currentInstanceId: string | null, previousInstanceId: string | null) => void
  private activeState: ChildState | null = null
  private desiredBinding: PennivoBinding | null = null
  private transition: Promise<void> | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private restarts = 0
  private nextRequestId = 1
  private publishedInstanceId: string | null = null
  private disposed = false

  constructor(runtime: SubprocessRuntime, options: PennivoChildOptions = {}) {
    this.runtime = runtime
    this.resolveArgv = options.resolveArgv ?? resolvePennivoArgv
    this.randomId = options.randomId ?? randomUUID
    this.requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 'requestTimeoutMs')
    this.restartDelayMs = nonnegativeInteger(options.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS, 'restartDelayMs')
    this.lifetimeMs = positiveInteger(options.lifetimeMs ?? DEFAULT_LIFETIME_MS, 'lifetimeMs')
    this.maxLineBytes = positiveInteger(options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES, 'maxLineBytes')
    this.maxRequestBytes = positiveInteger(options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES, 'maxRequestBytes')
    this.maxPending = positiveInteger(options.maxPending ?? DEFAULT_MAX_PENDING, 'maxPending', 1_000)
    this.maxRestarts = nonnegativeInteger(options.maxRestarts ?? DEFAULT_MAX_RESTARTS, 'maxRestarts')
    this.graceMs = positiveInteger(options.graceMs ?? DEFAULT_GRACE_MS, 'graceMs')
    this.tempRoot = options.tempRoot ?? tmpdir()
    this.onInstanceChange = options.onInstanceChange ?? (() => undefined)
  }

  active(): PennivoChildInfo | null {
    return this.activeState === null ? null : childInfo(this.activeState)
  }

  async ensure(nextBinding: PennivoBinding): Promise<PennivoChildInfo> {
    if (this.disposed) throw error('DISPOSED')
    const requested = binding(nextBinding)
    if (this.desiredBinding === null || !sameBinding(this.desiredBinding, requested)) {
      this.clearRestart()
      this.restarts = 0
    }
    this.desiredBinding = requested

    while (true) {
      if (this.disposed) throw error('DISPOSED')
      if (this.desiredBinding === null || !sameBinding(this.desiredBinding, requested)) throw error('CHILD_REPLACED')
      const current = this.activeState
      if (current !== null && sameBinding(current.binding, requested)) return childInfo(current)
      if (this.transition === null) {
        const operation = this.replaceWith(requested)
        const transition = operation.finally(() => {
          if (this.transition === transition) this.transition = null
        })
        this.transition = transition
      }
      await this.transition
    }
  }

  async listTools(nextBinding: PennivoBinding): Promise<unknown> {
    const info = await this.ensure(nextBinding)
    const state = this.activeState
    if (state === null || state.instanceId !== info.instanceId) throw error('CHILD_REPLACED')
    return this.request(state, 'tools/list', {})
  }

  async stop(): Promise<void> {
    this.desiredBinding = null
    this.clearRestart()
    const state = this.activeState
    if (state !== null) await this.stopState(state, 'CHILD_REPLACED')
    const transition = this.transition
    if (transition !== null) await transition.catch(() => undefined)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.desiredBinding = null
    this.clearRestart()
    const state = this.activeState
    if (state !== null) await this.stopState(state, 'DISPOSED')
    const transition = this.transition
    if (transition !== null) await transition.catch(() => undefined)
  }

  private async replaceWith(nextBinding: PennivoBinding): Promise<void> {
    const previous = this.activeState
    if (previous !== null) await this.stopState(previous, 'CHILD_REPLACED')
    if (this.disposed) throw error('DISPOSED')
    if (this.desiredBinding === null || !sameBinding(this.desiredBinding, nextBinding)) throw error('CHILD_REPLACED')
    await this.start(nextBinding)
  }

  private async start(nextBinding: PennivoBinding): Promise<void> {
    this.assertStartupCurrent(nextBinding)
    const scratch = await mkdtemp(join(this.tempRoot, 'tocktutor-pennivo-'))
    let state: ChildState | undefined
    let handle: SubprocessHandle | undefined
    try {
      this.assertStartupCurrent(nextBinding)
      const argv = await this.resolveArgv(this.runtime)
      this.assertStartupCurrent(nextBinding)
      if (argv.length === 0 || argv.some(item => typeof item !== 'string' || item.length === 0)) throw error('START_FAILED')
      const spec: SubprocessSpawnSpec = {
        argv: [...argv, '--workspace', '.'],
        cwd: scratch,
        stdio: {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: { maxBytes: 8 * 1024 },
        },
        graceMs: this.graceMs,
        env: restrictedPennivoEnvironment(),
      }
      handle = this.runtime.spawn(spec)
      if (handle.stdin === undefined || handle.stdout === undefined) throw error('START_FAILED')
      const instanceId = this.randomId()
      if (!BINDING_ID.test(instanceId)) throw error('START_FAILED')
      const onData = (chunk: Buffer | string): void => { this.onData(state as ChildState, chunk) }
      const lifetimeTimer = setTimeout(() => {
        this.desiredBinding = null
        if (state !== undefined) void this.stopState(state, 'CHILD_EXITED')
      }, this.lifetimeMs)
      state = {
        instanceId,
        binding: { ...nextBinding },
        scratch,
        handle,
        pending: new Map(),
        stdoutBuffer: '',
        lifetimeTimer,
        onData,
        failed: false,
        stopping: false,
      }
      this.activeState = state
      this.publishInstance(instanceId)
      handle.stdout.setEncoding('utf8')
      handle.stdout.on('data', onData)
      void handle.done.then(
        () => this.onExit(state as ChildState),
        () => this.onExit(state as ChildState),
      )
      const initialized = await this.request(state, 'initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'tocktutor-assistant', version: '0.1.5' },
      })
      this.assertInitialized(initialized)
      this.notify(state, 'notifications/initialized', {})
    } catch (cause) {
      if (state !== undefined) {
        await this.stopState(state, cause instanceof PennivoChildError ? cause.code : 'START_FAILED')
      } else {
        if (handle !== undefined) await this.stopUnpublished(handle)
        await rm(scratch, { recursive: true, force: true })
      }
      throw cause instanceof PennivoChildError ? cause : error('START_FAILED')
    }
  }

  private assertStartupCurrent(nextBinding: PennivoBinding): void {
    if (this.disposed) throw error('DISPOSED')
    if (this.desiredBinding === null || !sameBinding(this.desiredBinding, nextBinding)) {
      throw error('CHILD_REPLACED')
    }
  }

  private async stopUnpublished(handle: SubprocessHandle): Promise<void> {
    try { handle.stdin?.end() } catch { /* Continue to termination. */ }
    try { handle.terminate() } catch { /* Continue to settlement. */ }
    await handle.done.catch(() => undefined)
    await handle.waitForExit().catch(() => false)
  }

  private assertInitialized(value: unknown): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw error('PROTOCOL')
    const response = value as Record<string, unknown>
    const serverInfo = response.serverInfo
    if (response.protocolVersion !== PROTOCOL_VERSION || typeof serverInfo !== 'object' || serverInfo === null) {
      throw error('PROTOCOL')
    }
    if ((serverInfo as Record<string, unknown>).version !== PENNIVO_VERSION) throw error('VERSION_MISMATCH')
  }

  private async request(state: ChildState, method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.disposed) throw error('DISPOSED')
    if (this.activeState !== state || state.failed || state.stopping) throw error('CHILD_REPLACED')
    if (state.pending.size >= this.maxPending) throw error('TOO_MANY_PENDING')
    const id = this.nextRequestId++
    const line = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`
    if (Buffer.byteLength(line, 'utf8') > this.maxRequestBytes) throw error('REQUEST_TOO_LARGE')
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id)
        reject(error('TIMEOUT'))
      }, this.requestTimeoutMs)
      state.pending.set(id, { instanceId: state.instanceId, resolve, reject, timer })
      state.handle.stdin?.write(line, (writeError) => {
        if (writeError === null || writeError === undefined) return
        const pending = state.pending.get(id)
        if (pending === undefined) return
        clearTimeout(pending.timer)
        state.pending.delete(id)
        pending.reject(error('CHILD_EXITED'))
      })
    })
  }

  private notify(state: ChildState, method: string, params: Record<string, unknown>): void {
    if (this.activeState !== state || state.failed || state.stopping) return
    const line = `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`
    if (Buffer.byteLength(line, 'utf8') > this.maxRequestBytes) throw error('REQUEST_TOO_LARGE')
    state.handle.stdin?.write(line)
  }

  private onData(state: ChildState, chunk: Buffer | string): void {
    if (this.activeState !== state || state.failed || state.stopping) return
    state.stdoutBuffer += String(chunk)
    if (Buffer.byteLength(state.stdoutBuffer, 'utf8') > this.maxLineBytes) {
      void this.protocolFailure(state)
      return
    }
    let newline = state.stdoutBuffer.indexOf('\n')
    while (newline >= 0) {
      const line = state.stdoutBuffer.slice(0, newline)
      state.stdoutBuffer = state.stdoutBuffer.slice(newline + 1)
      if (Buffer.byteLength(line, 'utf8') > this.maxLineBytes) {
        void this.protocolFailure(state)
        return
      }
      if (line.trim()) this.onLine(state, line)
      newline = state.stdoutBuffer.indexOf('\n')
    }
  }

  private onLine(state: ChildState, line: string): void {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      void this.protocolFailure(state)
      return
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      void this.protocolFailure(state)
      return
    }
    const message = value as Record<string, unknown>
    if (message.jsonrpc !== '2.0') {
      void this.protocolFailure(state)
      return
    }
    if (message.id === undefined) return
    const id = responseId(message.id)
    if (id === undefined) {
      void this.protocolFailure(state)
      return
    }
    const pending = state.pending.get(id)
    if (pending === undefined || pending.instanceId !== state.instanceId) return
    clearTimeout(pending.timer)
    state.pending.delete(id)
    if (message.error !== undefined) {
      pending.reject(error('PROTOCOL'))
      return
    }
    pending.resolve(message.result)
  }

  private async protocolFailure(state: ChildState): Promise<void> {
    if (state.failed || state.stopping) return
    state.failed = true
    await this.stopState(state, 'PROTOCOL')
    this.scheduleRestart(state.binding)
  }

  private async onExit(state: ChildState): Promise<void> {
    if (this.activeState !== state || state.stopping) return
    state.failed = true
    await this.stopState(state, 'CHILD_EXITED')
    this.scheduleRestart(state.binding)
  }

  private scheduleRestart(previousBinding: PennivoBinding): void {
    if (
      this.disposed
      || this.restartTimer !== null
      || this.desiredBinding === null
      || !sameBinding(this.desiredBinding, previousBinding)
      || this.restarts >= this.maxRestarts
    ) return
    this.restarts += 1
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      const desired = this.desiredBinding
      if (desired === null || this.disposed || this.transition !== null) return
      const operation = this.replaceWith(desired)
      const transition = operation.finally(() => {
        if (this.transition === transition) this.transition = null
      })
      this.transition = transition
      void transition.catch(() => undefined)
    }, this.restartDelayMs)
  }

  private async stopState(state: ChildState, reason: PennivoChildErrorCode): Promise<void> {
    if (state.stopTask !== undefined) return state.stopTask
    state.stopping = true
    const stopTask = (async () => {
      if (this.activeState === state) {
        this.activeState = null
        this.publishInstance(null)
      }
      clearTimeout(state.lifetimeTimer)
      state.handle.stdout?.off('data', state.onData)
      state.stdoutBuffer = ''
      for (const [id, pending] of state.pending) {
        clearTimeout(pending.timer)
        pending.reject(error(reason))
        state.pending.delete(id)
      }
      state.handle.stdin?.end()
      state.handle.terminate()
      await state.handle.done.catch(() => undefined)
      await state.handle.waitForExit().catch(() => false)
      await rm(state.scratch, { recursive: true, force: true })
    })()
    state.stopTask = stopTask
    await stopTask
  }

  private publishInstance(instanceId: string | null): void {
    const previous = this.publishedInstanceId
    if (previous === instanceId) return
    this.publishedInstanceId = instanceId
    try {
      this.onInstanceChange(instanceId, previous)
    } catch {
      // Proposal approval still compares the exact live instance; cleanup must continue.
    }
  }

  private clearRestart(): void {
    if (this.restartTimer === null) return
    clearTimeout(this.restartTimer)
    this.restartTimer = null
  }
}
