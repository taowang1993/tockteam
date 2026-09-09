import { isTrustedRaycastCanIUseCanonicalTarget } from './trusted-raycast-can-i-use-query.ts'
import { failTrustedRaycastCanIUseStage2 } from './trusted-raycast-can-i-use-stage2-errors.ts'

export const TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE = 581
export const TRUSTED_RAYCAST_CAN_I_USE_VISIBLE_FEATURE_LIMIT = 64

const MAX_SEARCH_SCALARS = 256
const MAX_SEARCH_BYTES = 1_024
const MAX_SEARCH_TOKENS = 32
const MAX_TEXT_BYTES = 1_024
const FEATURE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/
const CONTROL_PATTERN = /\p{Cc}/u

export type TrustedRaycastCanIUseCatalogEntry = Readonly<{
  slug: string
  title: string
  sourceIndex: number
}>

export type TrustedRaycastCanIUseCatalog = Readonly<{
  entries: readonly TrustedRaycastCanIUseCatalogEntry[]
  totalCount: typeof TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE
}>

export type TrustedRaycastCanIUseSearchResult = Readonly<{
  query: string
  selected: readonly TrustedRaycastCanIUseCatalogEntry[]
  visibleCount: number
  matchCount: number
  totalCount: typeof TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE
}>

export type TrustedRaycastCanIUseBoundFeature = TrustedRaycastCanIUseCatalogEntry
export type TrustedRaycastCanIUseBoundFeatureTable = Readonly<Record<string, TrustedRaycastCanIUseBoundFeature>>

export type TrustedRaycastCanIUseAgentCandidate = Readonly<{
  target: string
  label: string
  sourceIndex: number
  hasSupport: boolean
}>

export type TrustedRaycastCanIUseAgentRow = Readonly<{
  target: string
  label: string
  sourceIndex: number
}>

function fail(code: 'DATA_UNAVAILABLE' | 'LIMIT_EXCEEDED' | 'QUERY_UNSUPPORTED'): never {
  return failTrustedRaycastCanIUseStage2(code)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return true
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function boundedText(value: unknown): value is string {
  return typeof value === 'string'
    && !hasUnpairedSurrogate(value)
    && !CONTROL_PATTERN.test(value)
    && value.length > 0
    && byteLength(value) <= MAX_TEXT_BYTES
}

function readDataObject(value: unknown, names: readonly string[]): Record<string, PropertyDescriptor> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('DATA_UNAVAILABLE')
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail('DATA_UNAVAILABLE')
    const keys = Reflect.ownKeys(value)
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) {
      fail('DATA_UNAVAILABLE')
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const name of names) {
      const descriptor = descriptors[name]
      if (!descriptor || descriptor.get || descriptor.set) fail('DATA_UNAVAILABLE')
    }
    return descriptors
  } catch {
    fail('DATA_UNAVAILABLE')
  }
}

function readArrayValues(value: unknown, maxLength: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxLength) {
    fail('DATA_UNAVAILABLE')
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1 || !keys.includes('length')
    || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)))) {
    fail('DATA_UNAVAILABLE')
  }
  const values: unknown[] = []
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || descriptor.get || descriptor.set) fail('DATA_UNAVAILABLE')
    values.push(descriptor.value)
  }
  return values
}

function readCatalogEntry(value: unknown, expectedIndex?: number): TrustedRaycastCanIUseCatalogEntry {
  const descriptors = readDataObject(value, ['slug', 'title', 'sourceIndex'])
  const slug = descriptors.slug!.value
  const title = descriptors.title!.value
  const sourceIndex = descriptors.sourceIndex!.value
  if (typeof slug !== 'string' || !FEATURE_SLUG_PATTERN.test(slug) || byteLength(slug) > MAX_TEXT_BYTES
    || !boundedText(title)
    || !Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE
    || (expectedIndex !== undefined && sourceIndex !== expectedIndex)) {
    fail('DATA_UNAVAILABLE')
  }
  return Object.freeze({ slug, title, sourceIndex })
}

function readAgentCandidate(value: unknown, expectedIndex: number): TrustedRaycastCanIUseAgentCandidate {
  const descriptors = readDataObject(value, ['target', 'label', 'sourceIndex', 'hasSupport'])
  const target = descriptors.target!.value
  const label = descriptors.label!.value
  const sourceIndex = descriptors.sourceIndex!.value
  const hasSupport = descriptors.hasSupport!.value
  if (!isTrustedRaycastCanIUseCanonicalTarget(target)
    || !boundedText(label)
    || !Number.isSafeInteger(sourceIndex) || sourceIndex !== expectedIndex
    || typeof hasSupport !== 'boolean') {
    fail('DATA_UNAVAILABLE')
  }
  return Object.freeze({ target, label, sourceIndex, hasSupport })
}

function readCatalog(value: unknown): readonly TrustedRaycastCanIUseCatalogEntry[] {
  const descriptors = readDataObject(value, ['entries', 'totalCount'])
  const totalCount = descriptors.totalCount!.value
  if (totalCount !== TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE) fail('DATA_UNAVAILABLE')
  const values = readArrayValues(descriptors.entries!.value, TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE)
  if (values.length !== TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE) fail('DATA_UNAVAILABLE')
  const entries: TrustedRaycastCanIUseCatalogEntry[] = []
  const slugs = new Set<string>()
  values.forEach((value, index) => {
    const entry = readCatalogEntry(value, index)
    if (slugs.has(entry.slug)) fail('DATA_UNAVAILABLE')
    slugs.add(entry.slug)
    entries.push(entry)
  })
  return entries
}

/** Build a frozen inert catalog in pinned source enumeration order. */
export function createTrustedRaycastCanIUseCatalog(value: readonly TrustedRaycastCanIUseCatalogEntry[]): TrustedRaycastCanIUseCatalog {
  const values = readArrayValues(value, TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE)
  if (values.length !== TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE) fail('DATA_UNAVAILABLE')
  const entries: TrustedRaycastCanIUseCatalogEntry[] = []
  const slugs = new Set<string>()
  values.forEach((entryValue, index) => {
    const entry = readCatalogEntry(entryValue, index)
    if (slugs.has(entry.slug)) fail('DATA_UNAVAILABLE')
    slugs.add(entry.slug)
    entries.push(entry)
  })
  return Object.freeze({
    entries: Object.freeze(entries),
    totalCount: TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE,
  })
}

function normalizeSearchQuery(value: unknown): { query: string; tokens: readonly string[] } {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value) || CONTROL_PATTERN.test(value)) fail('QUERY_UNSUPPORTED')
  if (Array.from(value).length > MAX_SEARCH_SCALARS || byteLength(value) > MAX_SEARCH_BYTES) fail('LIMIT_EXCEEDED')
  const query = value.replace(/^ +| +$/g, '').replace(/ +/g, ' ')
  const tokens = query === '' ? [] : query.split(' ')
  if (tokens.length > MAX_SEARCH_TOKENS) fail('LIMIT_EXCEEDED')
  return { query, tokens: Object.freeze(tokens) }
}

function asciiFold(value: string): string {
  return value.replace(/[A-Z]/g, character => character.toLowerCase())
}

function readSearchResult(value: unknown): TrustedRaycastCanIUseSearchResult {
  const descriptors = readDataObject(value, ['query', 'selected', 'visibleCount', 'matchCount', 'totalCount'])
  const { query, tokens } = normalizeSearchQuery(descriptors.query!.value)
  const selectedValues = readArrayValues(descriptors.selected!.value, TRUSTED_RAYCAST_CAN_I_USE_VISIBLE_FEATURE_LIMIT)
  const visibleCount = descriptors.visibleCount!.value
  const matchCount = descriptors.matchCount!.value
  const totalCount = descriptors.totalCount!.value
  if (typeof descriptors.query!.value !== 'string' || descriptors.query!.value !== query
    || !Number.isSafeInteger(visibleCount) || visibleCount !== selectedValues.length
    || !Number.isSafeInteger(matchCount) || matchCount < visibleCount || matchCount > TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE
    || totalCount !== TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE) {
    fail('DATA_UNAVAILABLE')
  }
  const selected: TrustedRaycastCanIUseCatalogEntry[] = []
  let previousSourceIndex = -1
  const slugs = new Set<string>()
  for (let index = 0; index < selectedValues.length; index++) {
    const entry = readCatalogEntry(selectedValues[index])
    if (entry.sourceIndex <= previousSourceIndex || slugs.has(entry.slug)) fail('DATA_UNAVAILABLE')
    previousSourceIndex = entry.sourceIndex
    slugs.add(entry.slug)
    if (tokens.length > 0) {
      const haystack = `${asciiFold(entry.title)}\u0000${asciiFold(entry.slug)}`
      if (tokens.some(token => !haystack.includes(asciiFold(token)))) fail('DATA_UNAVAILABLE')
    }
    selected.push(entry)
  }
  return Object.freeze({
    query,
    selected: Object.freeze(selected),
    visibleCount,
    matchCount,
    totalCount: TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE,
  })
}

/** Search the complete inert catalog before constructing any bounded feature table. */
export function searchTrustedRaycastCanIUseCatalog(
  catalog: TrustedRaycastCanIUseCatalog,
  value: unknown,
): TrustedRaycastCanIUseSearchResult {
  const { query, tokens } = normalizeSearchQuery(value)
  const entries = readCatalog(catalog)
  const selected: TrustedRaycastCanIUseCatalogEntry[] = []
  let matchCount = 0
  for (const entry of entries) {
    const haystack = `${asciiFold(entry.title)}\u0000${asciiFold(entry.slug)}`
    if (tokens.every(token => haystack.includes(asciiFold(token)))) {
      matchCount++
      if (selected.length < TRUSTED_RAYCAST_CAN_I_USE_VISIBLE_FEATURE_LIMIT) selected.push(entry)
    }
  }
  return Object.freeze({
    query,
    selected: Object.freeze(selected),
    visibleCount: selected.length,
    matchCount,
    totalCount: TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE,
  })
}

/**
 * Materialize only the Host-selected rows as the enumerable feature table.
 * Rechecking against the immutable catalog prevents a forged result widening
 * the table; support payload lookup is intentionally outside this stage.
 */
export function materializeTrustedRaycastCanIUseFeatureTable(
  catalog: TrustedRaycastCanIUseCatalog,
  value: TrustedRaycastCanIUseSearchResult,
): TrustedRaycastCanIUseBoundFeatureTable {
  const result = readSearchResult(value)
  const expected = searchTrustedRaycastCanIUseCatalog(catalog, result.query)
  if (result.matchCount !== expected.matchCount
    || result.visibleCount !== expected.visibleCount
    || result.selected.length !== expected.selected.length
    || result.selected.some((entry, index) => {
      const candidate = expected.selected[index]
      return candidate === undefined
        || entry.slug !== candidate.slug
        || entry.title !== candidate.title
        || entry.sourceIndex !== candidate.sourceIndex
    })) {
    fail('DATA_UNAVAILABLE')
  }
  const table: Record<string, TrustedRaycastCanIUseBoundFeature> = Object.create(null) as Record<string, TrustedRaycastCanIUseBoundFeature>
  for (const entry of result.selected) {
    if (Object.hasOwn(table, entry.slug)) fail('DATA_UNAVAILABLE')
    table[entry.slug] = Object.freeze({ ...entry })
  }
  return Object.freeze(table)
}

/** Select at most 64 finite detail rows before detail rendering. */
export function selectTrustedRaycastCanIUseAgentRows(
  value: readonly TrustedRaycastCanIUseAgentCandidate[],
): readonly TrustedRaycastCanIUseAgentRow[] {
  const values = readArrayValues(value, TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE)
  const selected: TrustedRaycastCanIUseAgentRow[] = []
  for (let index = 0; index < values.length; index++) {
    const candidate = readAgentCandidate(values[index], index)
    const browser = candidate.target.slice(0, candidate.target.indexOf(' '))
    if (browser === 'op_mini' || !candidate.hasSupport) continue
    if (selected.length < TRUSTED_RAYCAST_CAN_I_USE_VISIBLE_FEATURE_LIMIT) {
      selected.push(Object.freeze({
        target: candidate.target,
        label: candidate.label,
        sourceIndex: candidate.sourceIndex,
      }))
    }
  }
  return Object.freeze(selected)
}
