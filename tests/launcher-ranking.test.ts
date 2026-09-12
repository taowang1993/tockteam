import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LAUNCHER_RANKING_MAX_ENTRIES,
  parseLauncherRanking,
  rankLauncherItems,
  recordLauncherUsage,
  type LauncherRankingEntry,
} from '../src/launcher-ranking.ts'

const item = (id: string, name = id) => ({ id, name })

function entry(id: string, score: number, lastUsedAt: number, useCount = 1): LauncherRankingEntry {
  return { id, lastUsedAt, score, useCount }
}

test('launcher ranking records bounded decaying usage with deterministic ties', () => {
  const now = 30 * 24 * 60 * 60 * 1000
  const state = recordLauncherUsage(recordLauncherUsage([], 'alpha', 0), 'alpha', now)
  assert.deepEqual(state, [{ id: 'alpha', lastUsedAt: now, score: 1.5, useCount: 2 }])

  const ranked = rankLauncherItems([
    item('zeta', 'Zeta'),
    item('alpha', 'Alpha'),
    item('beta', 'Beta'),
  ], [
    entry('zeta', 1, now),
    entry('beta', 1, now),
    entry('alpha', 1.5, now - 30 * 24 * 60 * 60 * 1000),
  ], now)
  assert.deepEqual(ranked.map(value => value.id), ['beta', 'zeta', 'alpha'])
})

test('launcher ranking rejects malformed or oversized state and bounds new entries', () => {
  assert.throws(() => parseLauncherRanking([{ id: 'duplicate', lastUsedAt: 1, score: 1, useCount: 1 }, { id: 'duplicate', lastUsedAt: 2, score: 1, useCount: 1 }]), /ranking/u)
  assert.throws(() => parseLauncherRanking(Array.from({ length: LAUNCHER_RANKING_MAX_ENTRIES + 1 }, (_, index) => entry(`item-${index}`, 1, 1))), /ranking/u)

  const bounded = Array.from({ length: LAUNCHER_RANKING_MAX_ENTRIES }, (_, index) => entry(`item-${index}`, 1, index + 1))
  const next = recordLauncherUsage(bounded, 'new-item', 10_000)
  assert.equal(next.length, LAUNCHER_RANKING_MAX_ENTRIES)
  assert.equal(next.some(value => value.id === 'new-item'), true)
})
