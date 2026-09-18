import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCachedStateStore } from '../src/trusted-raycast-cached-state.ts'
import {
  MAX_TRANSLATE_STATE_BYTES,
  isTranslateState,
  loadTranslateState,
  saveTranslateState,
} from '../src/trusted-raycast-translate-state.ts'

const catalog = Object.freeze({ auto: {}, en: {}, 'zh-CN': {}, fr: {} })
const legacy = { langFrom: 'en', langTo: 'zh-CN' }
const current = { langFrom: 'auto', langTo: ['zh-CN', 'en'] }

function stateWithTargets(count: number) {
  return { selectedLanguageSet: { langFrom: 'auto', langTo: Array.from({ length: count }, () => 'fr') } }
}

test('Translate cache rejects missing, symlink, nonregular, oversized, malformed, and unknown-code files without rewriting them', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trusted-raycast-translate-state-'))
  try {
    const missing = join(directory, 'missing.json')
    assert.deepEqual(loadTranslateState(missing, catalog), {})
    assert.equal(existsSync(missing), false)

    const outside = join(directory, 'outside.json')
    const symlink = join(directory, 'symlink.json')
    writeFileSync(outside, JSON.stringify({ selectedLanguageSet: legacy }))
    symlinkSync(outside, symlink)
    assert.deepEqual(loadTranslateState(symlink, catalog), {})
    assert.equal(readlinkSync(symlink), outside)
    assert.equal(readFileSync(outside, 'utf8'), JSON.stringify({ selectedLanguageSet: legacy }))

    const nonregular = join(directory, 'directory.json')
    mkdirSync(nonregular)
    assert.deepEqual(loadTranslateState(nonregular, catalog), {})
    assert.equal(existsSync(nonregular), true)

    const cases: Array<[string, string]> = [
      ['oversized.json', 'x'.repeat(MAX_TRANSLATE_STATE_BYTES + 1)],
      ['malformed.json', '{"selectedLanguageSet":'],
      ['unknown-code.json', JSON.stringify({ selectedLanguageSet: { langFrom: 'en', langTo: 'unknown' } })],
    ]
    for (const [name, contents] of cases) {
      const path = join(directory, name)
      writeFileSync(path, contents)
      assert.deepEqual(loadTranslateState(path, catalog), {})
      assert.equal(readFileSync(path, 'utf8'), contents)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Translate cache preserves partial, legacy, duplicate, and ordered language-set shapes at the saved-set boundary', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'trusted-raycast-translate-state-'))
  const path = join(directory, 'state.json')
  try {
    assert.equal(isTranslateState({}, catalog), true)
    assert.equal(isTranslateState({ selectedLanguageSet: legacy, languages: [current, { langFrom: 'en', langTo: ['fr', 'fr'] }] }, catalog), true)
    assert.equal(isTranslateState({ selectedLanguageSet: { langFrom: 'en', langTo: [] } }, catalog), true)
    assert.equal(isTranslateState({ selectedLanguageSet: { langFrom: 'unknown', langTo: 'en' } }, catalog), false)
    assert.equal(isTranslateState({ selectedLanguageSet: { langFrom: 'en', langTo: ['fr'], name: 'invented' } }, catalog), false)
    assert.equal(isTranslateState({ selectedLanguageSet: { langFrom: 'en', langTo: ['fr', 'unknown'] } }, catalog), false)
    const sparseTargets: string[] = []
    sparseTargets.length = 1
    assert.equal(isTranslateState({ selectedLanguageSet: { langFrom: 'en', langTo: sparseTargets } }, catalog), false)
    const sparseSets: Array<typeof current> = []
    sparseSets.length = 1
    assert.equal(isTranslateState({ languages: sparseSets }, catalog), false)

    const maximumSets = { languages: Array.from({ length: 128 }, () => current) }
    assert.equal(isTranslateState(maximumSets, catalog), true)
    assert.equal(isTranslateState({ languages: [...maximumSets.languages, current] }, catalog), false)
    await saveTranslateState(path, maximumSets, catalog)
    assert.deepEqual(loadTranslateState(path, catalog), maximumSets)
    const beforeInvalid = readFileSync(path)
    await assert.rejects(saveTranslateState(path, { languages: [...maximumSets.languages, current] }, catalog), /Invalid Translate state/)
    assert.deepEqual(readFileSync(path), beforeInvalid)
    const outside = join(directory, 'outside.json')
    const symlink = join(directory, 'state-link.json')
    writeFileSync(outside, beforeInvalid)
    symlinkSync(outside, symlink)
    await assert.rejects(saveTranslateState(symlink, maximumSets, catalog), /symlink/)
    assert.equal(readFileSync(outside).equals(beforeInvalid), true)

    const duplicateTargets = { selectedLanguageSet: { langFrom: 'auto', langTo: ['fr', 'fr', 'en', 'fr'] }, languages: [legacy, current, legacy] }
    await saveTranslateState(path, duplicateTargets, catalog)
    assert.deepEqual(loadTranslateState(path, catalog), duplicateTargets)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Translate cache enforces the 512 KiB serialized boundary and rejects invalid store updates before memory or persistence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'trusted-raycast-translate-state-'))
  const path = join(directory, 'state.json')
  try {
    let accepted = 1
    while (isTranslateState(stateWithTargets(accepted * 2), catalog)) accepted *= 2
    let low = accepted / 2
    let high = accepted * 2
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (isTranslateState(stateWithTargets(middle), catalog)) low = middle
      else high = middle
    }
    const atBoundary = stateWithTargets(low)
    const overBoundary = stateWithTargets(high)
    assert.equal(isTranslateState(atBoundary, catalog), true)
    assert.equal(isTranslateState(overBoundary, catalog), false)
    await saveTranslateState(path, atBoundary, catalog)
    assert.deepEqual(loadTranslateState(path, catalog), atBoundary)
    const beforeInvalid = readFileSync(path)
    await assert.rejects(saveTranslateState(path, overBoundary, catalog), /Invalid Translate state/)
    assert.deepEqual(readFileSync(path), beforeInvalid)

    const initial = { selectedLanguageSet: legacy, languages: [current] }
    await saveTranslateState(path, initial, catalog)
    const store = createCachedStateStore({
      initial,
      validate: snapshot => isTranslateState(snapshot, catalog),
      persist: snapshot => saveTranslateState(path, snapshot, catalog),
    })
    assert.equal(store.update('languages', old => [...(old as typeof initial.languages), ...Array.from({ length: 128 }, () => current)]), false)
    assert.deepEqual(store.get('languages', []), initial.languages)
    await store.flush()
    assert.deepEqual(loadTranslateState(path, catalog), initial)

    const next = { selectedLanguageSet: legacy, languages: [current, { langFrom: 'en', langTo: ['fr', 'fr'] }] }
    assert.equal(store.update('languages', next.languages), true)
    await store.flush()
    assert.deepEqual(loadTranslateState(path, catalog), next)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
