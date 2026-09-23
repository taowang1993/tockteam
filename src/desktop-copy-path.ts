import { isAbsolute } from 'node:path'

/** The exact optional Host service name consumed by note runtime. */
export const TOCKTEAM_DESKTOP_COPY_PATH_SERVICE = 'tockTeamDesktopCopyPath' as const

/** Authenticated child-to-main endpoint path; no arbitrary clipboard API is exposed. */
export const DESKTOP_COPY_PATH_CHANNEL_PATH = '/tockteam/desktop-copy-path'
export const MAX_DESKTOP_COPY_PATH_OPERATION_ID = 256
export const MAX_DESKTOP_COPY_PATH = 8_192
export const MAX_DESKTOP_COPY_PATH_VAULT_ID = 256
export const MAX_DESKTOP_COPY_PATH_BODY_BYTES = 32 * 1024
export const MAX_DESKTOP_COPY_PATH_RESULT_BYTES = 1_024

export interface DesktopCopyPathIdentity {
  dev: string
  ino: string
}

export interface DesktopCopyPathInput {
  canonicalPath: string
  identity: DesktopCopyPathIdentity
  kind: 'file'
  operationId: string
  vaultGeneration: number
  vaultId: string
}

export type DesktopCopyPathStatus =
  | 'cancelled'
  | 'copied'
  | 'denied'
  | 'stale'
  | 'unavailable'

export interface DesktopCopyPathResult {
  operationId: string
  status: DesktopCopyPathStatus
}

/** Structural owner service used until the runtime package is composed. */
export interface TockTeamDesktopCopyPathService {
  copy(input: DesktopCopyPathInput, signal: AbortSignal): Promise<DesktopCopyPathResult>
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
export function validateDesktopCopyPathInput(value: unknown): DesktopCopyPathInput | undefined {
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
    || !bounded(input.canonicalPath, MAX_DESKTOP_COPY_PATH)
    || !isAbsolute(input.canonicalPath)
    || !bounded(input.operationId, MAX_DESKTOP_COPY_PATH_OPERATION_ID)
    || !bounded(input.vaultId, MAX_DESKTOP_COPY_PATH_VAULT_ID)
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
  }) as DesktopCopyPathInput
}

/** Validate the bounded result returned by the native owner. */
export function validateDesktopCopyPathResult(value: unknown): DesktopCopyPathResult | undefined {
  const result = record(value)
  if (result === undefined
    || !exactKeys(result, ['operationId', 'status'])
    || !bounded(result.operationId, MAX_DESKTOP_COPY_PATH_OPERATION_ID)
    || !['cancelled', 'copied', 'denied', 'stale', 'unavailable'].includes(String(result.status))) {
    return undefined
  }
  return Object.freeze({
    operationId: result.operationId,
    status: result.status as DesktopCopyPathStatus,
  })
}

export function cancelledDesktopCopyPath(operationId: string): DesktopCopyPathResult {
  return { operationId, status: 'cancelled' }
}
