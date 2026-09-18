import { lstat as defaultLstat, realpath as defaultRealpath } from 'node:fs/promises'
import {
  cancelledReveal,
  validateDesktopRevealInput,
  type DesktopRevealInput,
  type DesktopRevealResult,
} from './desktop-reveal.ts'

export interface DesktopRevealStats {
  dev: bigint | number
  ino: bigint | number
  isDirectory(): boolean
  isFile(): boolean
}

export interface DesktopRevealNativeOperations {
  isAvailable(): boolean
  lstat(path: string): Promise<DesktopRevealStats>
  realpath(path: string): Promise<string>
  reveal(path: string): void
}

const defaultOperations: DesktopRevealNativeOperations = {
  isAvailable: () => true,
  lstat: async path => await defaultLstat(path, { bigint: true }),
  realpath: async path => await defaultRealpath(path),
  reveal: () => { throw new Error('Desktop reveal effect is unavailable') },
}

function stale(input: DesktopRevealInput): DesktopRevealResult {
  return { operationId: input.operationId, status: 'stale' }
}

/**
 * Revalidate the runtime-owned canonical target immediately before the native
 * effect. The injected operations keep filesystem and Electron effects
 * testable without moving vault authority into the browser.
 */
export async function performDesktopReveal(
  rawInput: unknown,
  operations: Partial<DesktopRevealNativeOperations> = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<DesktopRevealResult> {
  const input = validateDesktopRevealInput(rawInput)
  if (input === undefined) {
    const operationId = typeof rawInput === 'object' && rawInput !== null
      && 'operationId' in rawInput && typeof rawInput.operationId === 'string'
      ? rawInput.operationId.slice(0, 256)
      : ''
    return { operationId, status: 'denied' }
  }
  if (signal.aborted) return cancelledReveal(input.operationId)
  const effect = { ...defaultOperations, ...operations }
  try {
    if (!effect.isAvailable()) return { operationId: input.operationId, status: 'unavailable' }
    const canonicalPath = await effect.realpath(input.canonicalPath)
    if (signal.aborted) return cancelledReveal(input.operationId)
    if (canonicalPath !== input.canonicalPath) return stale(input)
    const stats = await effect.lstat(canonicalPath)
    if (signal.aborted) return cancelledReveal(input.operationId)
    const kind = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : undefined
    if (kind !== input.kind
      || String(stats.dev) !== input.identity.dev
      || String(stats.ino) !== input.identity.ino) return stale(input)
    if (!effect.isAvailable()) return { operationId: input.operationId, status: 'unavailable' }
    signal.throwIfAborted()
    effect.reveal(canonicalPath)
    return { operationId: input.operationId, status: 'revealed' }
  } catch {
    return signal.aborted
      ? cancelledReveal(input.operationId)
      : { operationId: input.operationId, status: 'unavailable' }
  }
}

export function cancelledDesktopReveal(operationId: string): DesktopRevealResult {
  return cancelledReveal(operationId)
}
