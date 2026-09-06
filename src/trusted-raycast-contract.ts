const MAX_TEXT = 16 * 1024
const MAX_MESSAGE = 1024 * 1024
const MAX_DEPTH = 32
const MAX_NODES = 4096
const MAX_PREFERENCES = 64
const MAX_PREFERENCE_KEY = 128
const MAX_PREFERENCE_TOTAL = 128 * 1024

export const TRUSTED_RAYCAST_COMMAND = 'translate' as const
export type TrustedRaycastPreference = boolean | string
export type TrustedRaycastViewOpen = Readonly<{
  sessionId: string
  generation: string
  command: typeof TRUSTED_RAYCAST_COMMAND
  preferences: Readonly<Record<string, TrustedRaycastPreference>>
}>
export type TrustedRaycastViewEvent = Readonly<{
  sessionId: string
  generation: string
  revision: number
  eventId: string
  kind: 'searchChanged' | 'action' | 'navigation' | 'fieldChanged' | 'submit'
  value?: string
}>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  return JSON.stringify(actual) === JSON.stringify([...expected].sort())
}
const boundedString = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && value.length <= max

function jsonSafe(value: unknown, depth = 0, count = { value: 0 }): boolean {
  if (++count.value > MAX_NODES || depth > MAX_DEPTH) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return typeof value !== 'number' || Number.isFinite(value)
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(entry => jsonSafe(entry, depth + 1, count))
  if (!isRecord(value)) return false
  return Object.entries(value).every(([key, entry]) => boundedString(key, MAX_PREFERENCE_KEY) && jsonSafe(entry, depth + 1, count))
}

export function isTrustedRaycastViewOpen(value: unknown): value is TrustedRaycastViewOpen {
  if (!isRecord(value) || !exactKeys(value, ['sessionId', 'generation', 'command', 'preferences'])) return false
  if (!boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || value.command !== TRUSTED_RAYCAST_COMMAND || !isRecord(value.preferences)) return false
  const entries = Object.entries(value.preferences)
  if (entries.length > MAX_PREFERENCES || entries.some(([key, entry]) => key.length > MAX_PREFERENCE_KEY || (typeof entry !== 'string' && typeof entry !== 'boolean'))) return false
  return Buffer.byteLength(JSON.stringify(value.preferences), 'utf8') <= MAX_PREFERENCE_TOTAL
}

export function isTrustedRaycastViewEvent(value: unknown): value is TrustedRaycastViewEvent {
  if (!isRecord(value)) return false
  const keys = ['sessionId', 'generation', 'revision', 'eventId', 'kind', ...(Object.hasOwn(value, 'value') ? ['value'] : [])]
  if (!exactKeys(value, keys) || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !boundedString(value.eventId, 128)) return false
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !['searchChanged', 'action', 'navigation', 'fieldChanged', 'submit'].includes(value.kind as string)) return false
  if (!Object.hasOwn(value, 'value')) return value.kind === 'navigation'
  if (!boundedString(value.value)) return false
  const max = value.kind === 'searchChanged' ? MAX_TEXT : value.kind === 'submit' ? 4096 : 128
  return value.value.length <= max && (value.kind !== 'navigation' || value.value.startsWith('language:'))
}

export function isBoundedTrustedRaycastMessage(value: unknown): boolean {
  try { return jsonSafe(value) && Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_MESSAGE } catch { return false }
}
