import { failTrustedRaycastCanIUse as fail } from './trusted-raycast-can-i-use-errors.ts'
import { validateTrustedRaycastCanIUseContext, type TrustedRaycastCanIUseRevisionContext } from './trusted-raycast-can-i-use-actions.ts'
import { validateTrustedRaycastCanIUseSearchResult } from './trusted-raycast-can-i-use-catalog.ts'
import { createTrustedRaycastCanIUseAliases, type TrustedRaycastCanIUseSnapshot } from './trusted-raycast-can-i-use-aliases.ts'
import type { TrustedRaycastCanIUseFeatureStatus } from './trusted-raycast-can-i-use-data.ts'

// Input is serialized Host data, not a live object or general evaluation/configuration API.
function record(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).length !== names.length || Object.keys(value).some(key => !names.includes(key))) return fail('RENDER_INVALID')
  return value as Record<string, unknown>
}

/** Expected context comes from the Host bootstrap, never from the incoming packet. */
export function createTrustedRaycastCanIUseSourceRoot(message: unknown, expected: TrustedRaycastCanIUseRevisionContext,
  isCurrent: (revision: number) => boolean) {
  if (typeof message !== 'string') return fail('RENDER_INVALID')
  if (Buffer.byteLength(message) > 32768) return fail('LIMIT_EXCEEDED')
  let decoded: unknown
  try { decoded = JSON.parse(message) } catch { return fail('RENDER_INVALID') }
  const value = record(decoded, ['type', 'revision', 'context', 'snapshot', 'query', 'matchCount', 'totalCount', 'features'])
  if (value.type !== 'can-i-use-root' || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return fail('RENDER_INVALID')
  const revision = value.revision as number
  const context = validateTrustedRaycastCanIUseContext(value.context)
  const bound = validateTrustedRaycastCanIUseContext(expected)
  if (Object.keys(bound).some(key => context[key as keyof typeof context] !== bound[key as keyof typeof bound])) return fail('SNAPSHOT_STALE')
  const current = (): boolean => { try { return isCurrent(revision) === true } catch { return false } }
  const assertCurrent = (): void => { if (!current()) fail('SNAPSHOT_STALE') }
  assertCurrent()
  const snapshot = value.snapshot as TrustedRaycastCanIUseSnapshot
  // The alias validates and detaches the entire snapshot before it can be used.
  const aliases = createTrustedRaycastCanIUseAliases(snapshot, (identity, generation) =>
    identity === bound.snapshotIdentity && generation === bound.snapshotGeneration && current())
  const targets = aliases.browserslist(snapshot.defaultQuery).filter(target => target !== 'op_mini all')
  if (!Array.isArray(value.features) || value.features.length > 64) return fail('RENDER_INVALID')
  const rows = value.features.map(item => {
    const row = record(item, ['slug', 'title', 'sourceIndex', 'status', 'supported'])
    if (!['ls', 'rec', 'pr', 'cr', 'wd', 'other', 'unoff'].includes(row.status as string)
      || (targets.length === 0 ? row.supported !== null : typeof row.supported !== 'boolean')) return fail('RENDER_INVALID')
    return row
  })
  const result = validateTrustedRaycastCanIUseSearchResult({ query: value.query, selected: rows.map(row => ({ slug: row.slug, title: row.title, sourceIndex: row.sourceIndex })),
    visibleCount: rows.length, matchCount: value.matchCount, totalCount: value.totalCount })
  const metadata = new WeakMap<object, Readonly<{ title: string; status: TrustedRaycastCanIUseFeatureStatus }>>()
  const support = new Map<string, boolean | null>()
  const features = Object.freeze(Object.fromEntries(result.selected.map((row, index) => {
    const packed = Object.freeze({})
    metadata.set(packed, Object.freeze({ title: row.title, status: rows[index]!.status as TrustedRaycastCanIUseFeatureStatus }))
    support.set(row.slug, rows[index]!.supported as boolean | null)
    return [row.slug, packed]
  })))
  const feature = (packed: unknown) => {
    assertCurrent()
    if (packed === null || typeof packed !== 'object' || !metadata.has(packed)) return fail('DATA_UNAVAILABLE')
    return metadata.get(packed)!
  }
  const isSupported = (...args: unknown[]): boolean => {
    assertCurrent()
    const [slug, browsers] = args
    if (args.length !== 2 || typeof slug !== 'string' || !support.has(slug) || support.get(slug) === null
      || !Array.isArray(browsers) || Object.getPrototypeOf(browsers) !== Array.prototype
      || browsers.length !== targets.length || Reflect.ownKeys(browsers).length !== browsers.length + 1) return fail('QUERY_UNSUPPORTED')
    for (let index = 0; index < targets.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(browsers, String(index))
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value !== targets[index]) return fail('QUERY_UNSUPPORTED')
    }
    return support.get(slug)!
  }
  return Object.freeze({ revision, context, defaultQuery: snapshot.defaultQuery, environment: snapshot.environment,
    query: result.query, visibleCount: result.visibleCount, matchCount: result.matchCount,
    totalCount: result.totalCount, features, feature, isSupported, ...aliases })
}
