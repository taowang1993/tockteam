import { randomBytes } from 'node:crypto'
import type { DesktopCallerClaimRequest, DesktopCallerOperation, NativeOperationIdentity } from './host-contract.ts'
export type { DesktopCallerOperation } from './host-contract.ts'

export const DESKTOP_CALLER_OPERATIONS = [
  'activate-vault',
  'reveal-entry',
  'popout-open',
  'popout-close',
  'popout-close-all',
  'microphone',
  'print',
  'export-html',
  'export-pdf',
  'import-source',
  'backup',
  'restore-backup',
] as const satisfies readonly DesktopCallerOperation[]

export interface DesktopCallerAuthorization {
  authorization: string
}

interface AuthorizationRecord {
  expiresAt: number
  operation: DesktopCallerOperation
  operationId: string
  requestId: string
  windowId: string
}

interface ClaimedRecord {
  expiresAt: number
  identity: NativeOperationIdentity
  operation: DesktopCallerOperation
}

interface DesktopCallerAuthorizationsOptions {
  lifetimeMs?: number
  maxAuthorizations?: number
  now?: () => number
  randomId?: () => string
}

type IdentityFactory = (
  operationId: string,
  requestId: string,
  windowId: string,
) => NativeOperationIdentity

const MAX_FIELD_BYTES = 256

function bounded(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= MAX_FIELD_BYTES
}

function operation(value: unknown): value is DesktopCallerOperation {
  return typeof value === 'string' && (DESKTOP_CALLER_OPERATIONS as readonly string[]).includes(value)
}

/** Main-process owner for one-use authorizations minted only for the trusted main frame. */
export class DesktopCallerAuthorizations {
  private readonly authorizations = new Map<string, AuthorizationRecord>()
  private readonly claimed = new Map<string, ClaimedRecord>()
  private readonly lifetimeMs: number
  private readonly maxAuthorizations: number
  private readonly now: () => number
  private readonly randomId: () => string
  private disposed = false

  constructor(options: DesktopCallerAuthorizationsOptions = {}) {
    this.lifetimeMs = options.lifetimeMs ?? 30_000
    this.maxAuthorizations = options.maxAuthorizations ?? 128
    this.now = options.now ?? Date.now
    this.randomId = options.randomId ?? (() => randomBytes(32).toString('base64url'))
  }

  get size(): number {
    this.sweep()
    return this.authorizations.size
  }

  issue(kind: DesktopCallerOperation, windowId: string): DesktopCallerAuthorization {
    if (this.disposed) throw new Error('Desktop caller authorization is unavailable')
    if (!operation(kind) || !bounded(windowId)) throw new Error('Desktop caller authorization request is invalid')
    this.sweep()
    if (this.authorizations.size >= this.maxAuthorizations) {
      throw new Error('Desktop caller authorization is unavailable')
    }
    const authorization = this.randomId()
    const operationId = this.randomId()
    const requestId = this.randomId()
    if (![authorization, operationId, requestId].every(bounded) || this.authorizations.has(authorization)) {
      throw new Error('Desktop caller authorization is unavailable')
    }
    this.authorizations.set(authorization, {
      expiresAt: this.now() + this.lifetimeMs,
      operation: kind,
      operationId,
      requestId,
      windowId,
    })
    return { authorization }
  }

  claim(request: DesktopCallerClaimRequest, createIdentity: IdentityFactory): NativeOperationIdentity | undefined {
    const authorization = typeof request?.authorization === 'string' ? request.authorization : ''
    const record = this.authorizations.get(authorization)
    if (record !== undefined) this.authorizations.delete(authorization)
    if (this.disposed) return undefined
    if (record === undefined) {
      const claimed = this.claimed.get(authorization)
      if (claimed === undefined || claimed.expiresAt < this.now() || claimed.operation !== request.operation) return undefined
      return claimed.identity
    }
    if (record.expiresAt < this.now()) return undefined
    if (!operation(request.operation) || request.operation !== record.operation) return undefined
    const identity = createIdentity(record.operationId, record.requestId, record.windowId)
    if (identity.windowId !== record.windowId || identity.operationId !== record.operationId
      || identity.requestId !== record.requestId || !bounded(identity.sessionId)
      || !Number.isSafeInteger(identity.vaultGeneration) || identity.vaultGeneration < 0
      || (identity.vaultId !== null && !bounded(identity.vaultId))) return undefined
    this.claimed.set(authorization, {
      expiresAt: record.expiresAt,
      identity: Object.freeze({ ...identity }),
      operation: record.operation,
    })
    return identity
  }

  clear(): void {
    this.authorizations.clear()
    this.claimed.clear()
  }

  revokeWindow(windowId: string): void {
    for (const [authorization, record] of this.authorizations) {
      if (record.windowId === windowId) this.authorizations.delete(authorization)
    }
    for (const [authorization, record] of this.claimed) {
      if (record.identity.windowId === windowId) this.claimed.delete(authorization)
    }
  }

  dispose(): void {
    this.disposed = true
    this.clear()
  }

  private sweep(): void {
    const now = this.now()
    for (const [authorization, record] of this.authorizations) {
      if (record.expiresAt < now) this.authorizations.delete(authorization)
    }
    for (const [authorization, record] of this.claimed) {
      if (record.expiresAt < now) this.claimed.delete(authorization)
    }
  }
}
