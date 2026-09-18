import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'
import type { createTrustedRaycastCanIUseData } from './trusted-raycast-can-i-use-data.ts'
import { validateTrustedRaycastCanIUseContext, type TrustedRaycastCanIUseActionRegistry, type TrustedRaycastCanIUseRevisionContext } from './trusted-raycast-can-i-use-actions.ts'
import { materializeTrustedRaycastCanIUseFeatureTable, searchTrustedRaycastCanIUseCatalog } from './trusted-raycast-can-i-use-catalog.ts'
import { createTrustedRaycastCanIUseSnapshot } from './trusted-raycast-can-i-use-aliases.ts'
import { prepareTrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'

/** Host-only: invalidate first, search all data, then construct the finite source input. */
export function prepareTrustedRaycastCanIUseRoot(data: ReturnType<typeof createTrustedRaycastCanIUseData>, preferences: unknown,
  context: TrustedRaycastCanIUseRevisionContext, registry: TrustedRaycastCanIUseActionRegistry, query: unknown) {
  registry.startError(context)
  const bound = validateTrustedRaycastCanIUseContext(context)
  const prepared = prepareTrustedRaycastCanIUsePreferences(preferences, { canonicalTargets: data.canonicalTargets })
  const snapshot = createTrustedRaycastCanIUseSnapshot({ identity: bound.snapshotIdentity, generation: bound.snapshotGeneration,
    defaultQuery: prepared.preferences.defaultQuery, environment: prepared.preferences.environment, canonicalTargets: data.canonicalTargets })
  const result = searchTrustedRaycastCanIUseCatalog(data.catalog, query)
  const table = materializeTrustedRaycastCanIUseFeatureTable(data.catalog, result)
  const targets = snapshot.targets.filter(target => target !== 'op_mini all')
  const features = Object.values(table).map(row => {
    const identity = { slug: row.slug, sourceIndex: row.sourceIndex }
    return Object.freeze({ ...row, status: data.statusBySlug[row.slug]!.status,
      supported: targets.length === 0 ? null : data.support(identity, targets.join(',')).allSupported })
  })
  const ticket = registry.startSearch(bound, result.selected)
  const message = JSON.stringify({ type: 'can-i-use-root', revision: ticket.revision, context: bound, snapshot,
    query: result.query, matchCount: result.matchCount, totalCount: result.totalCount, features })
  if (Buffer.byteLength(message) > 32768) {
    registry.startError(bound)
    return failTrustedRaycastCanIUse('LIMIT_EXCEEDED')
  }
  return Object.freeze({ message, ticket, rows: result.selected, preferences: prepared.preferences })
}
