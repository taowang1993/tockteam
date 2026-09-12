export const LAUNCHER_RANKING_MAX_ENTRIES = 500
export const LAUNCHER_RANKING_MAX_BYTES = 512 * 1024
export const LAUNCHER_RECENT_RESULT_LIMIT = 5
export const LAUNCHER_RANKING_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000
export const LAUNCHER_RANKING_STALE_AFTER_MS = 120 * 24 * 60 * 60 * 1000
const MIN_RETAINED_SCORE = 0.05
const MAX_ITEM_ID_LENGTH = 512
const MAX_SCORE = 1_000_000_000_000

export type LauncherRankingEntry = Readonly<{
  id: string
  lastUsedAt: number
  score: number
  useCount: number
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right)
}

function validItemId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_ITEM_ID_LENGTH
    && !/[\0\r\n]/u.test(value)
}

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_SCORE
}

function validUseCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function cloneEntry(entry: LauncherRankingEntry): LauncherRankingEntry {
  return Object.freeze({
    id: entry.id,
    lastUsedAt: entry.lastUsedAt,
    score: entry.score,
    useCount: entry.useCount,
  })
}

function ageMs(lastUsedAt: number, now: number): number {
  return Math.max(0, now - lastUsedAt)
}

export function decayedLauncherRankingScore(entry: LauncherRankingEntry, now = Date.now()): number {
  return entry.score * Math.pow(0.5, ageMs(entry.lastUsedAt, now) / LAUNCHER_RANKING_HALF_LIFE_MS)
}

function compareEntries(left: LauncherRankingEntry, right: LauncherRankingEntry, now: number): number {
  const score = decayedLauncherRankingScore(right, now) - decayedLauncherRankingScore(left, now)
  if (score !== 0) return score
  if (left.lastUsedAt !== right.lastUsedAt) return right.lastUsedAt - left.lastUsedAt
  if (left.useCount !== right.useCount) return right.useCount - left.useCount
  return compareIds(left.id, right.id)
}

export function parseLauncherRanking(value: unknown): readonly LauncherRankingEntry[] {
  if (!Array.isArray(value) || value.length > LAUNCHER_RANKING_MAX_ENTRIES) {
    throw new Error('TockLauncher ranking is invalid')
  }
  const ids = new Set<string>()
  const parsed: LauncherRankingEntry[] = []
  for (const raw of value) {
    if (!isRecord(raw)
      || Object.keys(raw).length !== 4
      || Object.keys(raw).some(key => !['id', 'lastUsedAt', 'score', 'useCount'].includes(key))
      || !validItemId(raw.id)
      || !validTimestamp(raw.lastUsedAt)
      || !validScore(raw.score)
      || !validUseCount(raw.useCount)
      || ids.has(raw.id)) {
      throw new Error('TockLauncher ranking entry is invalid')
    }
    ids.add(raw.id)
    parsed.push(cloneEntry({
      id: raw.id,
      lastUsedAt: raw.lastUsedAt,
      score: raw.score,
      useCount: raw.useCount,
    }))
  }
  return Object.freeze(parsed.toSorted((left, right) => compareIds(left.id, right.id)))
}

export function pruneLauncherRanking(state: readonly LauncherRankingEntry[], now = Date.now()): readonly LauncherRankingEntry[] {
  const byId = new Map<string, LauncherRankingEntry>()
  for (const entry of state) {
    if (ageMs(entry.lastUsedAt, now) > LAUNCHER_RANKING_STALE_AFTER_MS
      && decayedLauncherRankingScore(entry, now) < MIN_RETAINED_SCORE) continue
    const normalized = cloneEntry(entry)
    const existing = byId.get(entry.id)
    if (existing === undefined || compareEntries(normalized, existing, now) < 0) byId.set(entry.id, normalized)
  }
  return Object.freeze([...byId.values()]
    .toSorted((left, right) => compareEntries(left, right, now))
    .slice(0, LAUNCHER_RANKING_MAX_ENTRIES)
    .toSorted((left, right) => compareIds(left.id, right.id)))
}

export function recordLauncherUsage(
  state: readonly LauncherRankingEntry[],
  itemId: string,
  now = Date.now(),
): readonly LauncherRankingEntry[] {
  if (!validItemId(itemId)) throw new Error('TockLauncher ranking item ID is invalid')
  if (!validTimestamp(now)) throw new Error('TockLauncher ranking timestamp is invalid')
  const current = pruneLauncherRanking(state, now)
  const previous = current.find(entry => entry.id === itemId)
  const score = Math.min(MAX_SCORE, (previous === undefined ? 0 : decayedLauncherRankingScore(previous, now)) + 1)
  const useCount = Math.min(Number.MAX_SAFE_INTEGER, (previous?.useCount ?? 0) + 1)
  return pruneLauncherRanking([
    ...current.filter(entry => entry.id !== itemId),
    { id: itemId, lastUsedAt: now, score, useCount },
  ], now)
}

export function rankLauncherItems<T extends Readonly<{ id: string }>>(
  items: readonly T[],
  state: readonly LauncherRankingEntry[],
  now = Date.now(),
): readonly T[] {
  const entries = new Map(state.map(entry => [entry.id, entry]))
  const unique = new Map<string, T>()
  for (const item of items) if (!unique.has(item.id) && entries.has(item.id)) unique.set(item.id, item)
  return Object.freeze([...unique.values()].toSorted((left, right) => {
    const leftEntry = entries.get(left.id)!
    const rightEntry = entries.get(right.id)!
    return compareEntries(leftEntry, rightEntry, now)
  }))
}
