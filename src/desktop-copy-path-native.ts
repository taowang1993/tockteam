import { lstat as defaultLstat, realpath as defaultRealpath } from 'node:fs/promises'
import {
  cancelledDesktopCopyPath,
  MAX_DESKTOP_COPY_PATH_OPERATION_ID,
  validateDesktopCopyPathInput,
  type DesktopCopyPathInput,
  type DesktopCopyPathResult,
} from './desktop-copy-path.ts'

export interface DesktopCopyPathStats {
  dev: bigint | number
  ino: bigint | number
  isFile(): boolean
}

export interface DesktopCopyPathNativeOperations {
  isAvailable(): boolean
  lstat(path: string): Promise<DesktopCopyPathStats>
  realpath(path: string): Promise<string>
  writeText(path: string): void
}

const defaultOperations: DesktopCopyPathNativeOperations = {
  isAvailable: () => true,
  lstat: async path => await defaultLstat(path, { bigint: true }),
  realpath: async path => await defaultRealpath(path),
  writeText: () => { throw new Error('Desktop copy-path effect is unavailable') },
}

function stale(input: DesktopCopyPathInput): DesktopCopyPathResult {
  return { operationId: input.operationId, status: 'stale' }
}

/** Revalidate the Host-owned canonical regular file immediately before clipboard write. */
export async function performDesktopCopyPath(
  rawInput: unknown,
  operations: Partial<DesktopCopyPathNativeOperations> = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<DesktopCopyPathResult> {
  const input = validateDesktopCopyPathInput(rawInput)
  if (input === undefined) {
    const operationId = typeof rawInput === 'object' && rawInput !== null
      && 'operationId' in rawInput && typeof rawInput.operationId === 'string'
      ? rawInput.operationId.slice(0, MAX_DESKTOP_COPY_PATH_OPERATION_ID)
      : ''
    return { operationId, status: 'denied' }
  }
  if (signal.aborted) return cancelledDesktopCopyPath(input.operationId)
  const effect = { ...defaultOperations, ...operations }
  try {
    if (!effect.isAvailable()) return { operationId: input.operationId, status: 'unavailable' }
    const canonicalPath = await effect.realpath(input.canonicalPath)
    if (signal.aborted) return cancelledDesktopCopyPath(input.operationId)
    if (canonicalPath !== input.canonicalPath) return stale(input)
    const stats = await effect.lstat(canonicalPath)
    if (signal.aborted) return cancelledDesktopCopyPath(input.operationId)
    if (!stats.isFile()
      || String(stats.dev) !== input.identity.dev
      || String(stats.ino) !== input.identity.ino) return stale(input)
    if (!effect.isAvailable()) return { operationId: input.operationId, status: 'unavailable' }
    signal.throwIfAborted()
    effect.writeText(canonicalPath)
    return { operationId: input.operationId, status: 'copied' }
  } catch {
    return signal.aborted
      ? cancelledDesktopCopyPath(input.operationId)
      : { operationId: input.operationId, status: 'unavailable' }
  }
}
