import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EMPTY_KAOMOJI_STATE,
  isKaomojiState,
  loadKaomojiState,
  saveKaomojiState,
  type KaomojiRecord,
} from '../src/trusted-raycast-kaomoji-state.ts'

const records: readonly KaomojiRecord[] = Object.freeze(Array.from({ length: 20 }, (_, index) => Object.freeze({
  category: index % 2 ? 'emotion' : 'people',
  description: `Face ${index}`,
  id: `(^_${index}^)-Face ${index}`,
  name: `(^_${index}^)`,
})))
const dataset = new Map(records.map(record => [record.id, record]))

test('Kaomoji state allows only exact fixed-dataset records and bounded keys', () => {
  assert.equal(isKaomojiState(EMPTY_KAOMOJI_STATE, dataset), true)
  assert.equal(isKaomojiState({ favoriteKaomoji: records.slice(0, 3), recentKaomoji: records.slice(0, 16) }, dataset), true)
  assert.equal(isKaomojiState({ favoriteKaomoji: records.slice(0, 1), recentKaomoji: records.slice(0, 17) }, dataset), false)
  assert.equal(isKaomojiState({ favoriteKaomoji: [records[0], records[0]], recentKaomoji: [] }, dataset), false)
  assert.equal(isKaomojiState({ favoriteKaomoji: [{ ...records[0], name: 'forged' }], recentKaomoji: [] }, dataset), false)
  assert.equal(isKaomojiState({ favoriteKaomoji: [{ category: 'people', description: 'Unknown', id: 'unknown', name: '?' }], recentKaomoji: [] }, dataset), false)
  assert.equal(isKaomojiState({ favoriteKaomoji: [], recentKaomoji: [], extra: [] }, dataset), false)
})

test('Kaomoji state enforces favorite and serialized bounds', () => {
  const tooMany = Array.from({ length: 1823 }, (_, index) => ({ category: 'people', description: `Face ${index}`, id: `id-${index}`, name: `name-${index}` }))
  const largeDataset = new Map(tooMany.map(record => [record.id, record]))
  assert.equal(isKaomojiState({ favoriteKaomoji: tooMany, recentKaomoji: [] }, largeDataset), false)
  const huge = { category: 'people', description: 'x'.repeat(512 * 1024), id: 'huge', name: 'x' }
  assert.equal(isKaomojiState({ favoriteKaomoji: [huge], recentKaomoji: [] }, new Map([['huge', huge]])), false)
})

test('Kaomoji state loads defensively and saves atomically without following symlinks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kaomoji-state-'))
  const path = join(root, 'state.json')
  try {
    assert.deepEqual(loadKaomojiState(path, dataset), EMPTY_KAOMOJI_STATE)
    const state = { favoriteKaomoji: records.slice(0, 2), recentKaomoji: records.slice(2, 5) }
    await saveKaomojiState(path, state, dataset)
    assert.deepEqual(loadKaomojiState(path, dataset), state)
    assert.equal(readFileSync(path, 'utf8').endsWith('\n'), true)
    writeFileSync(path, '{"favoriteKaomoji":[],"recentKaomoji":[],"extra":[]}', 'utf8')
    assert.deepEqual(loadKaomojiState(path, dataset), EMPTY_KAOMOJI_STATE)
    rmSync(path)
    const target = join(root, 'target'); writeFileSync(target, 'owned')
    symlinkSync(target, path)
    await assert.rejects(saveKaomojiState(path, state, dataset), /symlink/)
    assert.equal(readFileSync(target, 'utf8'), 'owned')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
