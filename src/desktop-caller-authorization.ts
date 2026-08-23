import { randomBytes } from 'node:crypto'
import type { NativeOperationIdentity } from './host-contract.ts'

export const DESKTOP_CALLER_OPERATIONS = [
  'activate',
  'reveal',
  'popout-open',
  'popout-close',
  'microphone',
  'print',
  'export-html',
  'export-pdf',
] as const

export type DesktopCallerOperation = typeof DESKTOP_CALLER_OPERATIONS[number]

export interface DesktopCallerAuthorization {
  authorization: string
}

export interface DesktopCallerClaimRequest {
  authorization: string
  operation: DesktopCallerOperation
  sessionId: string
  vaultGeneration: number
  vaultId: string | null
}

interface AuthorizationRecord {
  expiresAt: number
  operation: DesktopCallerOperation
  operationId: string
  requestId: string
  windowId: string
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
  sessionId: string,
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
    if (this.disposed || record === undefined || record.expiresAt < this.now()) return undefined
    if (!operation(request.operation) || request.operation !== record.operation || !bounded(request.sessionId)
      || !Number.isSafeInteger(request.vaultGeneration) || request.vaultGeneration < 0
      || (request.vaultId !== null && !bounded(request.vaultId))) return undefined
    const identity = createIdentity(record.operationId, record.requestId, record.windowId, request.sessionId)
    if (identity.vaultGeneration !== request.vaultGeneration || identity.vaultId !== request.vaultId
      || identity.windowId !== record.windowId || identity.operationId !== record.operationId
      || identity.requestId !== record.requestId || identity.sessionId !== request.sessionId) return undefined
    return identity
  }

  revokeWindow(windowId: string): void {
    for (const [authorization, record] of this.authorizations) {
      if (record.windowId === windowId) this.authorizations.delete(authorization)
    }
  }

  dispose(): void {
    this.disposed = true
    this.authorizations.clear()
  }

  private sweep(): void {
    const now = this.now()
    for (const [authorization, record] of this.authorizations) {
      if (record.expiresAt < now) this.authorizations.delete(authorization)
    }
  }
}
