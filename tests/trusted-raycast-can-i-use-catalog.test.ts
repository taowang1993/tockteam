import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE,
  TRUSTED_RAYCAST_CAN_I_USE_VISIBLE_FEATURE_LIMIT,
  createTrustedRaycastCanIUseCatalog,
  materializeTrustedRaycastCanIUseFeatureTable,
  searchTrustedRaycastCanIUseCatalog,
  selectTrustedRaycastCanIUseAgentRows,
} from '../src/trusted-raycast-can-i-use-catalog.ts'
import {
  TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES,
  TrustedRaycastCanIUseError,
} from '../src/trusted-raycast-can-i-use-errors.ts'

function assertCode(code: string, action: () => unknown): void {
  assert.throws(action, error => error instanceof TrustedRaycastCanIUseError && String(error.code) === code)
}

function featureEntries(): Array<{ slug: string; title: string; sourceIndex: number }> {
  return Array.from({ length: TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE }, (_, sourceIndex) => ({
    slug: `feature-${String(sourceIndex).padStart(3, '0')}`,
    title: `Feature ${sourceIndex}`,
    sourceIndex,
  }))
}

test('searches all 581 inert entries, preserves source order, and materializes only 64 rows', () => {
  const entries = featureEntries()
  entries[300] = { slug: 'late-feature', title: 'Needle Target', sourceIndex: 300 }
  const catalog = createTrustedRaycastCanIUseCatalog(entries)
  const all = searchTrustedRaycastCanIUseCatalog(catalog, '')
  assert.equal(all.totalCount, 581)
  assert.equal(all.matchCount, 581)
  assert.equal(all.visibleCount, TRUSTED_RAYCAST_CAN_I_USE_VISIBLE_FEATURE_LIMIT)
  assert.deepEqual(all.selected.map(entry => entry.sourceIndex), Array.from({ length: 64 }, (_, index) => index))

  const late = searchTrustedRaycastCanIUseCatalog(catalog, '  NEEDLE   TARGET  ')
  assert.equal(late.matchCount, 1)
  assert.deepEqual(late.selected.map(entry => entry.sourceIndex), [300])
  const table = materializeTrustedRaycastCanIUseFeatureTable(catalog, all)
  assert.equal(Object.entries(table).length, 64)
  assert.deepEqual(Object.keys(table), all.selected.map(entry => entry.slug))
  assert.equal(Object.isFrozen(catalog), true)
  assert.equal(Object.isFrozen(catalog.entries), true)
  assert.equal(Object.isFrozen(all), true)
  assert.equal(Object.isFrozen(table), true)
})

test('uses literal token matching with the documented Unicode and ASCII-fold rules', () => {
  const entries = featureEntries()
  entries[400] = { slug: 'cafe-feature', title: 'Café À La Carte', sourceIndex: 400 }
  const catalog = createTrustedRaycastCanIUseCatalog(entries)
  assert.deepEqual(searchTrustedRaycastCanIUseCatalog(catalog, 'CAFé  À'), {
    query: 'CAFé À',
    selected: [catalog.entries[400]],
    visibleCount: 1,
    matchCount: 1,
    totalCount: 581,
  })
  assert.equal(searchTrustedRaycastCanIUseCatalog(catalog, '\u00a0feature-000').query, '\u00a0feature-000')
  assert.equal(searchTrustedRaycastCanIUseCatalog(catalog, '\u00a0feature-000').matchCount, 0)
  for (const query of [
    '\tfeature',
    'feature\nname',
    '\u0000feature',
    'x'.repeat(1_025),
    Array.from({ length: 33 }, () => 'x').join(' '),
  ]) {
    assertCode(query.length > 1_024 || query.split(' ').length > 32 ? 'LIMIT_EXCEEDED' : 'QUERY_UNSUPPORTED', () => (
      searchTrustedRaycastCanIUseCatalog(catalog, query)
    ))
  }
  assertCode('QUERY_UNSUPPORTED', () => searchTrustedRaycastCanIUseCatalog(catalog, '\ud800'))
})

test('selects finite detail rows before rendering and drops Opera Mini or missing support', () => {
  const candidates = [
    { browser: 'op_mini', label: 'Opera Mini', sourceIndex: 0, hasSupport: true },
    { browser: 'chrome', label: 'Chrome', sourceIndex: 1, hasSupport: false },
    { browser: 'firefox', label: 'Firefox', sourceIndex: 2, hasSupport: true },
    ...Array.from({ length: 70 }, (_, index) => ({
      browser: `agent${index}`,
      label: `Agent ${index}`,
      sourceIndex: index + 3,
      hasSupport: true,
    })),
  ]
  const rows = selectTrustedRaycastCanIUseAgentRows(candidates)
  assert.equal(rows.length, 64)
  assert.equal(rows[0]?.browser, 'firefox')
  assert.equal(rows.some(row => row.browser === 'op_mini'), false)
  assert.deepEqual(rows.map(row => row.sourceIndex), Array.from({ length: 64 }, (_, index) => index + 2))
})

test('detail selection is keyed by unique browser agents, not browser-version targets', () => {
  const candidates = [
    { browser: 'op_mini', label: 'Opera Mini', sourceIndex: 0, hasSupport: true },
    { browser: 'chrome', label: 'Chrome', sourceIndex: 1, hasSupport: false },
    { browser: 'firefox', label: 'Firefox', sourceIndex: 2, hasSupport: true },
  ]
  assert.deepEqual(selectTrustedRaycastCanIUseAgentRows(candidates), [
    { browser: 'firefox', label: 'Firefox', sourceIndex: 2 },
  ])
  assertCode('DATA_UNAVAILABLE', () => selectTrustedRaycastCanIUseAgentRows([
    ...candidates, { browser: 'firefox', label: 'Firefox Again', sourceIndex: 3, hasSupport: true },
  ]))
})

test('rejects an incomplete or tampered immutable catalog before search', () => {
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.DATA_UNAVAILABLE, () => createTrustedRaycastCanIUseCatalog(featureEntries().slice(0, -1)))
  const catalog = createTrustedRaycastCanIUseCatalog(featureEntries())
  const tampered = { ...catalog, totalCount: 580 }
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.DATA_UNAVAILABLE, () => searchTrustedRaycastCanIUseCatalog(tampered as never, ''))
  const result = searchTrustedRaycastCanIUseCatalog(catalog, '')
  const forged = { ...result, selected: result.selected.slice(0, 1), visibleCount: 1 }
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.DATA_UNAVAILABLE, () => materializeTrustedRaycastCanIUseFeatureTable(catalog, forged as never))
})
