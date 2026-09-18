import { isAbsolute } from 'node:path'

/** The exact optional Host service name consumed by note runtime. */
export const TOCKTEAM_DESKTOP_REVEAL_SERVICE = 'tockTeamDesktopReveal' as const

/** Authenticated child-to-main endpoint path; no other operation is accepted. */
export const DESKTOP_REVEAL_CHANNEL_PATH = '/tockteam/desktop-reveal'
export const MAX_DESKTOP_REVEAL_OPERATION_ID = 256
export const MAX_DESKTOP_REVEAL_PATH = 8_192
export const MAX_DESKTOP_REVEAL_VAULT_ID = 256
export const MAX_DESKTOP_REVEAL_BODY_BYTES = 32 * 1024
export const MAX_DESKTOP_REVEAL_RESULT_BYTES = 1_024

export type DesktopRevealKind = 'file' | 'directory'

export interface DesktopRevealIdentity {
  dev: string
  ino: string
}

export interface DesktopRevealInput {
  canonicalPath: string
  identity: DesktopRevealIdentity
  kind: DesktopRevealKind
  operationId: string
  vaultGeneration: number
  vaultId: string
}

export type DesktopRevealStatus =
  | 'cancelled'
  | 'denied'
  | 'revealed'
  | 'stale'
  | 'unavailable'

export interface DesktopRevealResult {
  operationId: string
  status: DesktopRevealStatus
}

/** Structural owner service used until the runtime package is composed. */
export interface TockTeamDesktopRevealService {
  reveal(input: DesktopRevealInput, signal: AbortSignal): Promise<DesktopRevealResult>
}

interface RecordValue {
  [key: string]: unknown
}

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : undefined
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function unsignedDecimal(value: unknown): value is string {
  return typeof value === 'string'
    && /^(?:0|[1-9]\d*)$/u.test(value)
    && value.length <= 128
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return Object.keys(value).length === expected.size
    && Object.keys(value).every(key => expected.has(key))
}

/** Validate an untrusted child-channel payload against the locked runtime shape. */
export function validateDesktopRevealInput(value: unknown): DesktopRevealInput | undefined {
  const input = record(value)
  const identity = input === undefined ? undefined : record(input.identity)
  if (input === undefined || identity === undefined
    || !exactKeys(input, [
      'canonicalPath',
      'identity',
      'kind',
      'operationId',
      'vaultGeneration',
      'vaultId',
    ])
    || !exactKeys(identity, ['dev', 'ino'])
    || !bounded(input.canonicalPath, MAX_DESKTOP_REVEAL_PATH)
    || !isAbsolute(input.canonicalPath)
    || !bounded(input.operationId, MAX_DESKTOP_REVEAL_OPERATION_ID)
    || !bounded(input.vaultId, MAX_DESKTOP_REVEAL_VAULT_ID)
    || (input.kind !== 'file' && input.kind !== 'directory')
    || !unsignedDecimal(identity.dev)
    || !unsignedDecimal(identity.ino)
    || typeof input.vaultGeneration !== 'number'
    || !Number.isSafeInteger(input.vaultGeneration)
    || input.vaultGeneration < 0) return undefined
  return Object.freeze({
    canonicalPath: input.canonicalPath,
    identity: Object.freeze({ dev: identity.dev, ino: identity.ino }),
    kind: input.kind,
    operationId: input.operationId,
    vaultGeneration: input.vaultGeneration,
    vaultId: input.vaultId,
  }) as DesktopRevealInput
}

/** Validate the bounded result returned by the native owner. */
export function validateDesktopRevealResult(value: unknown): DesktopRevealResult | undefined {
  const result = record(value)
  if (result === undefined
    || !exactKeys(result, ['operationId', 'status'])
    || !bounded(result.operationId, MAX_DESKTOP_REVEAL_OPERATION_ID)
    || !['cancelled', 'denied', 'revealed', 'stale', 'unavailable'].includes(String(result.status))) {
    return undefined
  }
  return Object.freeze({
    operationId: result.operationId,
    status: result.status as DesktopRevealStatus,
  })
}

export function cancelledReveal(operationId: string): DesktopRevealResult {
  return { operationId, status: 'cancelled' }
}
