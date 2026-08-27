import { randomBytes } from 'node:crypto'
import {
  type DesktopDispatchCompletionRequest,
  type DesktopDispatchCompletionResult,
  type DesktopDispatchEvent,
  type DesktopQuickAction,
  type NativeOperationIdentity,
  type TockTutorBrowserProtocolRequest,
  type TockTutorProtocolRequest,
} from './host-contract.ts'
import {
  parseTockTutorProtocol,
  type ResolvedTockTutorProtocolRequest,
} from './desktop-native-policy.ts'

const MAX_PENDING_EVENTS = 64
const MAX_ID_BYTES = 256
const DELIVERY_LIFETIME_MS = 5 * 60 * 1000

export interface DesktopDispatchOwnerOptions {
  identity(operationId: string, requestId: string): NativeOperationIdentity | undefined
  isAvailable(): boolean
  onCallback?(url: string, status: 'success' | 'error'): void
  onDeliveryExpired?(operationId: string, consumerId: string): void
  randomId?: () => string
  now?: () => number
  resolveProtocol?(request: TockTutorProtocolRequest): ResolvedTockTutorProtocolRequest | null
}

interface DeliveredEvent {
  consumerId: string
  event: DesktopDispatchEvent
  expiresAt: number
}

interface Waiter {
  consumerId: string
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
  private readonly delivered = new Map<string, DeliveredEvent>()
  private readonly superseded = new Set<string>()
  private readonly waiters = new Set<Waiter>()
  private readonly options: DesktopDispatchOwnerOptions & { now: () => number; randomId: () => string }
  private disposed = false

  constructor(options: DesktopDispatchOwnerOptions) {
    this.options = {
      ...options,
      now: options.now ?? (() => Date.now()),
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
    const parsed = parseTockTutorProtocol(raw)
    if (parsed === null) return false
    const resolved = this.options.resolveProtocol?.(parsed)
      ?? this.resolveWithoutSensitiveFields(parsed)
    if (resolved === null) {
      if (parsed.xError !== undefined) this.options.onCallback?.(parsed.xError, 'error')
      return false
    }
    return this.publish(operationId => ({
      identity: this.identity(operationId),
      kind: 'protocol',
      request: resolved.request,
    }))
  }

  async next(signal: AbortSignal, consumerId = 'host-provider'): Promise<DesktopDispatchEvent | undefined> {
    this.sweep()
    if (signal.aborted || this.disposed || !text(consumerId) || !this.options.isAvailable()) return undefined
    const queued = this.queue.shift()
    if (queued !== undefined) {
      this.rememberDelivered(queued, consumerId)
      return queued
    }
    return await new Promise(resolve => {
      const waiter: Waiter = { consumerId, resolve, signal }
      const abort = (): void => {
        this.waiters.delete(waiter)
        resolve(undefined)
      }
      signal.addEventListener('abort', abort, { once: true })
      waiter.resolve = event => {
        signal.removeEventListener('abort', abort)
        this.waiters.delete(waiter)
        if (event !== undefined) this.rememberDelivered(event, consumerId)
        resolve(event)
      }
      this.waiters.add(waiter)
    })
  }

  async complete(
    request: DesktopDispatchCompletionRequest,
    signal: AbortSignal,
    consumerId = 'host-provider',
  ): Promise<DesktopDispatchCompletionResult> {
    this.sweep()
    if (signal.aborted) return { operationId: text(request?.operationId) ? request.operationId : '', status: 'cancelled' }
    if (typeof request !== 'object' || request === null
      || Object.keys(request).some(key => key !== 'operationId' && key !== 'status')
      || !text(request.operationId)
      || request.status !== 'handled' && request.status !== 'failed' && request.status !== 'stale') {
      return { operationId: text(request?.operationId) ? request.operationId : '', status: 'denied' }
    }
    const delivered = this.delivered.get(request.operationId)
    if (delivered === undefined || delivered.consumerId !== consumerId) {
      return { operationId: request.operationId, status: 'stale' }
    }
    this.delivered.delete(request.operationId)
    const event = delivered.event
    const current = this.options.identity(event.identity.operationId, event.identity.requestId)
    const expectedVaultId = event.kind === 'protocol' && event.request.vaultId !== undefined
      ? event.request.vaultId
      : event.identity.vaultId
    const switchedVault = event.kind === 'protocol' && event.request.vaultId !== undefined
    if (current === undefined || current.vaultId !== expectedVaultId
      || !switchedVault && current.vaultGeneration !== event.identity.vaultGeneration
      || current.sessionId !== event.identity.sessionId || current.windowId !== event.identity.windowId) {
      this.superseded.delete(request.operationId)
      if (event.kind === 'protocol') this.notifyCallback(event.request, 'error')
      return { operationId: request.operationId, status: 'stale' }
    }
    if (this.superseded.delete(request.operationId) || request.status === 'stale') {
      if (event.kind === 'protocol') this.notifyCallback(event.request, 'error')
      return { operationId: request.operationId, status: 'stale' }
    }
    if (request.status === 'failed') {
      if (event.kind === 'protocol') this.notifyCallback(event.request, 'error')
      return { operationId: request.operationId, status: 'unavailable' }
    }
    if (event.kind === 'protocol') this.notifyCallback(event.request, 'success')
    return { operationId: request.operationId, status: 'handled' }
  }

  rollbackDelivery(operationId: string, consumerId?: string): void {
    const delivered = this.delivered.get(operationId)
    if (delivered === undefined || (consumerId !== undefined && delivered.consumerId !== consumerId)) return
    this.delivered.delete(operationId)
    if (this.superseded.delete(operationId)) this.drop(delivered.event)
    else this.queue.unshift(delivered.event)
  }

  disposeConsumer(consumerId: string): void {
    const requeue: DesktopDispatchEvent[] = []
    for (const [operationId, delivered] of this.delivered) {
      if (delivered.consumerId !== consumerId) continue
      this.delivered.delete(operationId)
      if (this.superseded.delete(operationId)) this.drop(delivered.event)
      else requeue.push(delivered.event)
    }
    this.queue.unshift(...requeue)
    while (this.queue.length > MAX_PENDING_EVENTS) {
      const dropped = this.queue.pop()
      if (dropped !== undefined) this.drop(dropped)
    }
    for (const waiter of [...this.waiters]) {
      if (waiter.consumerId === consumerId) waiter.resolve(undefined)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.queue.splice(0)
    this.delivered.clear()
    this.superseded.clear()
    for (const waiter of [...this.waiters]) waiter.resolve(undefined)
  }

  private rememberDelivered(event: DesktopDispatchEvent, consumerId: string): void {
    this.delivered.set(event.identity.operationId, {
      consumerId,
      event,
      expiresAt: this.options.now() + DELIVERY_LIFETIME_MS,
    })
    while (this.delivered.size > MAX_PENDING_EVENTS) {
      const oldest = this.delivered.keys().next().value as string | undefined
      if (oldest === undefined) break
      const removed = this.delivered.get(oldest)
      this.delivered.delete(oldest)
      if (removed !== undefined) this.options.onDeliveryExpired?.(oldest, removed.consumerId)
      if (removed === undefined) continue
      if (this.superseded.delete(oldest)) this.drop(removed.event)
      else this.queue.unshift(removed.event)
    }
  }

  private rememberSuperseded(operationId: string): void {
    this.superseded.add(operationId)
    while (this.superseded.size > MAX_PENDING_EVENTS) {
      const oldest = this.superseded.values().next().value as string | undefined
      if (oldest === undefined) break
      this.superseded.delete(oldest)
    }
  }

  private sweep(): void {
    const now = this.options.now()
    const requeue: DesktopDispatchEvent[] = []
    for (const [operationId, delivered] of this.delivered) {
      if (delivered.expiresAt > now) continue
      this.delivered.delete(operationId)
      this.options.onDeliveryExpired?.(operationId, delivered.consumerId)
      if (this.superseded.delete(operationId)) this.drop(delivered.event)
      else requeue.push(delivered.event)
    }
    this.queue.unshift(...requeue)
    while (this.queue.length > MAX_PENDING_EVENTS) {
      const dropped = this.queue.pop()
      if (dropped !== undefined) this.drop(dropped)
    }
  }

  private identity(operationId: string): NativeOperationIdentity {
    const requestId = this.options.randomId()
    const identity = this.options.identity(operationId, requestId)
    if (identity === undefined) throw new Error('Desktop dispatch identity is unavailable')
    return identity
  }

  private resolveWithoutSensitiveFields(request: TockTutorProtocolRequest): ResolvedTockTutorProtocolRequest | null {
    if (request.vault !== undefined || request.path !== undefined || request.clipboard === true) return null
    const { vault: _vault, path: _path, clipboard: _clipboard, ...safe } = request
    return { request: safe as TockTutorBrowserProtocolRequest }
  }

  private notifyCallback(request: TockTutorBrowserProtocolRequest, status: 'success' | 'error'): void {
    const url = status === 'success' ? request.xSuccess : request.xError
    if (url !== undefined) this.options.onCallback?.(url, status)
  }

  private drop(event: DesktopDispatchEvent): void {
    if (event.kind === 'protocol') this.notifyCallback(event.request, 'error')
  }

  private publish(create: (operationId: string) => DesktopDispatchEvent): boolean {
    if (this.disposed || !this.options.isAvailable()) return false
    let event: DesktopDispatchEvent
    try { event = create(this.options.randomId()) } catch { return false }
    const supersedable = event.kind === 'protocol'
      && (event.request.action === 'choose-vault' || event.request.vaultId !== undefined)
    if (supersedable) {
      for (const queued of this.queue.splice(0, this.queue.length)) {
        if (queued.kind === 'protocol'
          && (queued.request.action === 'choose-vault' || queued.request.vaultId !== undefined)) {
          this.drop(queued)
        } else {
          this.queue.push(queued)
        }
      }
      for (const { event: delivered } of this.delivered.values()) {
        if (delivered.kind === 'protocol'
          && (delivered.request.action === 'choose-vault' || delivered.request.vaultId !== undefined)) {
          this.rememberSuperseded(delivered.identity.operationId)
        }
      }
    }
    const waiter = this.waiters.values().next().value as Waiter | undefined
    if (waiter !== undefined) waiter.resolve(event)
    else {
      this.queue.push(event)
      while (this.queue.length > MAX_PENDING_EVENTS) {
        const dropped = this.queue.shift()
        if (dropped !== undefined) this.drop(dropped)
      }
    }
    return true
  }
}
