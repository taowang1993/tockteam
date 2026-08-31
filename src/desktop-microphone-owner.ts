import {
  type DesktopMicrophoneRequest,
  type DesktopMicrophoneResult,
  type NativeOperationIdentity,
} from './host-contract.ts'

const MAX_ID_BYTES = 256
const GRANT_LIFETIME_MS = 30_000

export interface DesktopMicrophoneOwnerOptions {
  isAvailable(): boolean
  isCurrent(identity: NativeOperationIdentity): boolean
  requestAccess(signal: AbortSignal): Promise<boolean>
  now?: () => number
}

interface PermissionGrant {
  expiresAt: number
  identity: NativeOperationIdentity
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= MAX_ID_BYTES
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

async function awaitAbortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  // Native permission APIs may ignore AbortSignal; race them without leaving a
  // late rejection unhandled after the caller has already been released.
  void operation.catch(() => undefined)
  if (signal.aborted) throw new Error('native microphone request was aborted')
  let rejectAbort!: (reason?: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const onAbort = (): void => { rejectAbort(new Error('native microphone request was aborted')) }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function identity(value: unknown): value is NativeOperationIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !['operationId', 'requestId', 'sessionId', 'vaultGeneration', 'vaultId', 'windowId'].includes(key))) return false
  if (!text(record.operationId) || !text(record.requestId) || !text(record.sessionId) || !text(record.windowId)) return false
  if (record.vaultId !== null && !text(record.vaultId)) return false
  return typeof record.vaultGeneration === 'number'
    && Number.isSafeInteger(record.vaultGeneration)
    && record.vaultGeneration >= 0
}

/** One-flight native microphone permission owner with one-use browser handoff. */
export class DesktopMicrophoneOwner {
  private readonly options: DesktopMicrophoneOwnerOptions & { now: () => number }
  private lifetime = new AbortController()
  private grant: PermissionGrant | undefined
  private pending = false
  private disposed = false

  constructor(options: DesktopMicrophoneOwnerOptions) {
    this.options = { ...options, now: options.now ?? (() => Date.now()) }
  }

  async request(request: DesktopMicrophoneRequest, signal: AbortSignal): Promise<DesktopMicrophoneResult> {
    const operationId = identity(request?.identity) ? request.identity.operationId : ''
    if (signal.aborted) return { operationId, status: 'cancelled' }
    if (this.disposed || !this.options.isAvailable()) return { operationId, status: 'unavailable' }
    if (typeof request !== 'object' || request === null || Object.keys(request).length !== 1
      || !identity(request.identity)) return { operationId, status: 'denied' }
    if (!this.options.isCurrent(request.identity)) return { operationId, status: 'stale' }
    if (this.pending) return { operationId, status: 'denied' }
    this.pending = true
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    try {
      const granted = await awaitAbortable(
        Promise.resolve().then(() => this.options.requestAccess(combined)),
        combined,
      )
      if (combined.aborted) return { operationId, status: 'cancelled' }
      if (!this.options.isAvailable()) return { operationId, status: 'unavailable' }
      if (!this.options.isCurrent(request.identity)) return { operationId, status: 'stale' }
      if (!granted) return { operationId, status: 'denied' }
      this.grant = { expiresAt: this.options.now() + GRANT_LIFETIME_MS, identity: request.identity }
      return { operationId, status: 'granted' }
    } catch {
      return combined.aborted
        ? { operationId, status: 'cancelled' }
        : { operationId, status: 'unavailable' }
    } finally {
      this.pending = false
    }
  }

  checkPermission(): boolean {
    return this.validGrant() !== undefined
  }

  consumePermission(): boolean {
    const grant = this.validGrant()
    if (grant === undefined) return false
    this.grant = undefined
    return true
  }

  disposeProvider(): void {
    this.grant = undefined
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.disposeProvider()
    this.lifetime.abort()
  }

  reopen(): void {
    this.disposed = false
    this.grant = undefined
    this.lifetime = new AbortController()
  }

  private validGrant(): PermissionGrant | undefined {
    const grant = this.grant
    if (grant === undefined) return undefined
    if (this.disposed || grant.expiresAt <= this.options.now()
      || !this.options.isAvailable() || !this.options.isCurrent(grant.identity)) {
      this.grant = undefined
      return undefined
    }
    return grant
  }
}
