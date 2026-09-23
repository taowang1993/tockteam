import { extname, isAbsolute } from 'node:path'

/** The exact optional Host service name consumed by note runtime. */
export const TOCKTEAM_DESKTOP_OPEN_PATH_SERVICE = 'tockTeamDesktopOpenPath' as const

/** Authenticated child-to-main endpoint path; no arbitrary OS command API is exposed. */
export const DESKTOP_OPEN_PATH_CHANNEL_PATH = '/tockteam/desktop-open-path'
export const MAX_DESKTOP_OPEN_PATH_OPERATION_ID = 256
export const MAX_DESKTOP_OPEN_PATH = 8_192
export const MAX_DESKTOP_OPEN_PATH_VAULT_ID = 256
export const MAX_DESKTOP_OPEN_PATH_BODY_BYTES = 32 * 1024
export const MAX_DESKTOP_OPEN_PATH_RESULT_BYTES = 1_024

export interface DesktopOpenPathIdentity {
  dev: string
  ino: string
}

export interface DesktopOpenPathInput {
  canonicalPath: string
  identity: DesktopOpenPathIdentity
  kind: 'file'
  operationId: string
  vaultGeneration: number
  vaultId: string
}

export type DesktopOpenPathStatus =
  | 'cancelled'
  | 'opened'
  | 'denied'
  | 'stale'
  | 'unavailable'

export interface DesktopOpenPathResult {
  operationId: string
  status: DesktopOpenPathStatus
}

/** Structural owner service used until the runtime package is composed. */
export interface TockTeamDesktopOpenPathService {
  open(input: DesktopOpenPathInput, signal: AbortSignal): Promise<DesktopOpenPathResult>
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
export function validateDesktopOpenPathInput(value: unknown): DesktopOpenPathInput | undefined {
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
    || !bounded(input.canonicalPath, MAX_DESKTOP_OPEN_PATH)
    || !isAbsolute(input.canonicalPath)
    || !['.md', '.markdown', '.canvas', '.base'].includes(extname(input.canonicalPath).toLowerCase())
    || !bounded(input.operationId, MAX_DESKTOP_OPEN_PATH_OPERATION_ID)
    || !bounded(input.vaultId, MAX_DESKTOP_OPEN_PATH_VAULT_ID)
    || input.kind !== 'file'
    || !unsignedDecimal(identity.dev)
    || !unsignedDecimal(identity.ino)
    || typeof input.vaultGeneration !== 'number'
    || !Number.isSafeInteger(input.vaultGeneration)
    || input.vaultGeneration < 0) return undefined
  return Object.freeze({
    canonicalPath: input.canonicalPath,
    identity: Object.freeze({ dev: identity.dev, ino: identity.ino }),
    kind: 'file',
    operationId: input.operationId,
    vaultGeneration: input.vaultGeneration,
    vaultId: input.vaultId,
  }) as DesktopOpenPathInput
}

/** Validate the bounded result returned by the native owner. */
export function validateDesktopOpenPathResult(value: unknown): DesktopOpenPathResult | undefined {
  const result = record(value)
  if (result === undefined
    || !exactKeys(result, ['operationId', 'status'])
    || !bounded(result.operationId, MAX_DESKTOP_OPEN_PATH_OPERATION_ID)
    || !['cancelled', 'opened', 'denied', 'stale', 'unavailable'].includes(String(result.status))) {
    return undefined
  }
  return Object.freeze({
    operationId: result.operationId,
    status: result.status as DesktopOpenPathStatus,
  })
}

export function cancelledDesktopOpenPath(operationId: string): DesktopOpenPathResult {
  return { operationId, status: 'cancelled' }
}
