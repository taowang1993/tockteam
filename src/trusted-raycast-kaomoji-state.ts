import { lstatSync } from 'node:fs'
import { atomicWrite } from './launcher-persistence.ts'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'

const MAX_FAVORITES = 1822
const MAX_RECENTS = 16
const MAX_STATE_BYTES = 512 * 1024
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength

export type KaomojiRecord = Readonly<{
  category: string
  description: string
  id: string
  name: string
}>
export type KaomojiState = Readonly<{
  favoriteKaomoji: readonly KaomojiRecord[]
  recentKaomoji: readonly KaomojiRecord[]
}>

export const EMPTY_KAOMOJI_STATE: KaomojiState = Object.freeze({
  favoriteKaomoji: Object.freeze([]),
  recentKaomoji: Object.freeze([]),
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: object, expected: readonly string[]): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())

function isDatasetRecord(value: unknown, dataset: ReadonlyMap<string, KaomojiRecord>): value is KaomojiRecord {
  if (!isRecord(value) || !exactKeys(value, ['category', 'description', 'id', 'name']) || typeof value.id !== 'string') return false
  const expected = dataset.get(value.id)
  return expected !== undefined
    && value.category === expected.category
    && value.description === expected.description
    && value.name === expected.name
}

function isDistinctDatasetList(value: unknown, dataset: ReadonlyMap<string, KaomojiRecord>, max: number): value is readonly KaomojiRecord[] {
  if (!Array.isArray(value) || value.length > max) return false
  const ids = new Set<string>()
  for (const entry of value) {
    if (!isDatasetRecord(entry, dataset) || ids.has(entry.id)) return false
    ids.add(entry.id)
  }
  return true
}

export function isKaomojiState(value: unknown, dataset: ReadonlyMap<string, KaomojiRecord>): value is KaomojiState {
  if (!isRecord(value) || !exactKeys(value, ['favoriteKaomoji', 'recentKaomoji'])) return false
  if (!isDistinctDatasetList(value.favoriteKaomoji, dataset, MAX_FAVORITES) || !isDistinctDatasetList(value.recentKaomoji, dataset, MAX_RECENTS)) return false
  try { return byteLength(JSON.stringify(value)) <= MAX_STATE_BYTES } catch { return false }
}

export function loadKaomojiState(path: string, dataset: ReadonlyMap<string, KaomojiRecord>): KaomojiState {
  try {
    const raw = readBoundedRegularFile(path, MAX_STATE_BYTES)
    if (byteLength(raw) > MAX_STATE_BYTES) throw new Error('invalid')
    const parsed: unknown = JSON.parse(raw)
    if (!isKaomojiState(parsed, dataset)) throw new Error('invalid')
    return Object.freeze({
      favoriteKaomoji: Object.freeze(parsed.favoriteKaomoji.map(entry => Object.freeze({ ...entry }))),
      recentKaomoji: Object.freeze(parsed.recentKaomoji.map(entry => Object.freeze({ ...entry }))),
    })
  } catch { return EMPTY_KAOMOJI_STATE }
}

export async function saveKaomojiState(path: string, value: unknown, dataset: ReadonlyMap<string, KaomojiRecord>): Promise<void> {
  if (!isKaomojiState(value, dataset)) throw new Error('Invalid Kaomoji state')
  try { if (lstatSync(path).isSymbolicLink()) throw new Error('Kaomoji state path is a symlink') } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error
  }
  await atomicWrite(path, `${JSON.stringify(value)}\n`, { backup: false })
}
