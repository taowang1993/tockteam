import { lstat as defaultLstat, realpath as defaultRealpath } from 'node:fs/promises'
import {
  cancelledDesktopOpenPath,
  MAX_DESKTOP_OPEN_PATH_OPERATION_ID,
  validateDesktopOpenPathInput,
  type DesktopOpenPathInput,
  type DesktopOpenPathResult,
} from './desktop-open-path.ts'

export interface DesktopOpenPathStats {
  dev: bigint | number
  ino: bigint | number
  mode: bigint | number
  isFile(): boolean
}

export interface DesktopOpenPathNativeOperations {
  isAvailable(): boolean
  lstat(path: string): Promise<DesktopOpenPathStats>
  realpath(path: string): Promise<string>
  openPath(path: string): Promise<string>
}

const defaultOperations: DesktopOpenPathNativeOperations = {
  isAvailable: () => true,
  lstat: async path => await defaultLstat(path, { bigint: true }),
  realpath: async path => await defaultRealpath(path),
  openPath: async () => { throw new Error('Desktop open-path effect is unavailable') },
}

function stale(input: DesktopOpenPathInput): DesktopOpenPathResult {
  return { operationId: input.operationId, status: 'stale' }
}

/** Revalidate the Host-owned canonical regular file immediately before OS dispatch. */
export async function performDesktopOpenPath(
  rawInput: unknown,
  operations: Partial<DesktopOpenPathNativeOperations> = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<DesktopOpenPathResult> {
  const input = validateDesktopOpenPathInput(rawInput)
  if (input === undefined) {
    const operationId = typeof rawInput === 'object' && rawInput !== null
      && 'operationId' in rawInput && typeof rawInput.operationId === 'string'
      ? rawInput.operationId.slice(0, MAX_DESKTOP_OPEN_PATH_OPERATION_ID)
      : ''
    return { operationId, status: 'denied' }
  }
  if (signal.aborted) return cancelledDesktopOpenPath(input.operationId)
  const effect = { ...defaultOperations, ...operations }
  try {
    if (!effect.isAvailable()) return { operationId: input.operationId, status: 'unavailable' }
    const canonicalPath = await effect.realpath(input.canonicalPath)
    if (signal.aborted) return cancelledDesktopOpenPath(input.operationId)
    if (canonicalPath !== input.canonicalPath) return stale(input)
    const stats = await effect.lstat(canonicalPath)
    if (signal.aborted) return cancelledDesktopOpenPath(input.operationId)
    if (!stats.isFile()
      || String(stats.dev) !== input.identity.dev
      || String(stats.ino) !== input.identity.ino) return stale(input)
    if ((BigInt(stats.mode) & 0o111n) !== 0n) return { operationId: input.operationId, status: 'denied' }
    if (!effect.isAvailable()) return { operationId: input.operationId, status: 'unavailable' }
    signal.throwIfAborted()
    const error = await effect.openPath(canonicalPath)
    signal.throwIfAborted()
    if (error !== '') return { operationId: input.operationId, status: 'unavailable' }
    return { operationId: input.operationId, status: 'opened' }
  } catch {
    return signal.aborted
      ? cancelledDesktopOpenPath(input.operationId)
      : { operationId: input.operationId, status: 'unavailable' }
  }
}
