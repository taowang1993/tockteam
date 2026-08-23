import { randomBytes } from 'node:crypto'
import {
  type DesktopDispatchCompletionRequest,
  type DesktopDispatchCompletionResult,
  type DesktopDispatchEvent,
  type DesktopQuickAction,
  type NativeOperationIdentity,
} from './host-contract.ts'
import { parseTockTutorProtocol } from './desktop-native-policy.ts'

const MAX_PENDING_EVENTS = 64
const MAX_ID_BYTES = 256

export interface DesktopDispatchOwnerOptions {
  identity(operationId: string, requestId: string): NativeOperationIdentity | undefined
  isAvailable(): boolean
  randomId?: () => string
}

interface Waiter {
  resolve(event: DesktopDispatchEvent | undefined): void
  signal: AbortSignal
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= MAX_ID_BYTES
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

/** Main-owned bounded queue for native menu and protocol dispatch. */
export class DesktopDispatchOwner {
  private readonly queue: DesktopDispatchEvent[] = []
  private readonly delivered = new Map<string, DesktopDispatchEvent>()
  private readonly superseded = new Set<string>()
  private readonly waiters = new Set<Waiter>()
  private readonly options: DesktopDispatchOwnerOptions & { randomId: () => string }
  private disposed = false

  constructor(options: DesktopDispatchOwnerOptions) {
    this.options = {
      ...options,
      randomId: options.randomId ?? (() => randomBytes(24).toString('base64url')),
    }
  }

  publishQuickAction(action: DesktopQuickAction): boolean {
    if (!['new', 'daily', 'capture', 'search'].includes(action)) return false
    return this.publish(operationId => ({
      action,
      identity: this.identity(operationId),
      kind: 'quick-action',
    }))
  }

  publishProtocol(raw: string): boolean {
    const request = parseTockTutorProtocol(raw)
    if (request === null) return false
    return this.publish(operationId => ({
      identity: this.identity(operationId),
      kind: 'protocol',
      request,
    }))
  }

  async next(signal: AbortSignal): Promise<DesktopDispatchEvent | undefined> {
    if (signal.aborted || this.disposed || !this.options.isAvailable()) return undefined
    const queued = this.queue.shift()
    if (queued !== undefined) {
      this.delivered.set(queued.identity.operationId, queued)
      return queued
    }
    return await new Promise(resolve => {
      const waiter: Waiter = { resolve, signal }
      const abort = (): void => {
        this.waiters.delete(waiter)
        resolve(undefined)
      }
      signal.addEventListener('abort', abort, { once: true })
      waiter.resolve = event => {
        signal.removeEventListener('abort', abort)
        this.waiters.delete(waiter)
        if (event !== undefined) this.delivered.set(event.identity.operationId, event)
        resolve(event)
      }
      this.waiters.add(waiter)
    })
  }

  async complete(request: DesktopDispatchCompletionRequest, signal: AbortSignal): Promise<DesktopDispatchCompletionResult> {
    if (signal.aborted) return { operationId: text(request?.operationId) ? request.operationId : '', status: 'cancelled' }
    if (typeof request !== 'object' || request === null
      || Object.keys(request).some(key => key !== 'operationId' && key !== 'status')
      || !text(request.operationId)
      || request.status !== 'handled' && request.status !== 'failed' && request.status !== 'stale') {
      return { operationId: text(request?.operationId) ? request.operationId : '', status: 'denied' }
    }
    const event = this.delivered.get(request.operationId)
    if (event === undefined) return { operationId: request.operationId, status: 'stale' }
    this.delivered.delete(request.operationId)
    if (this.superseded.delete(request.operationId) || request.status === 'stale') {
      return { operationId: request.operationId, status: 'stale' }
    }
    if (request.status === 'failed') return { operationId: request.operationId, status: 'unavailable' }
    return { operationId: request.operationId, status: 'handled' }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.queue.splice(0)
    this.delivered.clear()
    this.superseded.clear()
    for (const waiter of [...this.waiters]) waiter.resolve(undefined)
  }

  private identity(operationId: string): NativeOperationIdentity {
    const requestId = this.options.randomId()
    const identity = this.options.identity(operationId, requestId)
    if (identity === undefined) throw new Error('Desktop dispatch identity is unavailable')
    return identity
  }

  private publish(create: (operationId: string) => DesktopDispatchEvent): boolean {
    if (this.disposed || !this.options.isAvailable()) return false
    let event: DesktopDispatchEvent
    try { event = create(this.options.randomId()) } catch { return false }
    const supersedable = event.kind === 'protocol' && event.request.action === 'choose-vault'
    if (supersedable) {
      for (const queued of this.queue.splice(0, this.queue.length)) {
        if (queued.kind === 'protocol' && queued.request.action === 'choose-vault') {
          this.superseded.add(queued.identity.operationId)
        } else {
          this.queue.push(queued)
        }
      }
      for (const delivered of this.delivered.values()) {
        if (delivered.kind === 'protocol' && delivered.request.action === 'choose-vault') {
          this.superseded.add(delivered.identity.operationId)
        }
      }
    }
    const waiter = this.waiters.values().next().value as Waiter | undefined
    if (waiter !== undefined) waiter.resolve(event)
    else {
      this.queue.push(event)
      while (this.queue.length > MAX_PENDING_EVENTS) this.queue.shift()
    }
    return true
  }
}
