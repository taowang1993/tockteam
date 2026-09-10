import { failTrustedRaycastCanIUse as fail } from './trusted-raycast-can-i-use-errors.ts'
import { validateTrustedRaycastCanIUseContext, validateTrustedRaycastCanIUseDetailRows, type TrustedRaycastCanIUseRevisionContext } from './trusted-raycast-can-i-use-actions.ts'

// Only JSON wire input reaches these closed records; no live objects or accessors.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) return fail('RENDER_INVALID')
  return value as Record<string, unknown>
}

/** One selected feature, supplied by authenticated Host navigation, never a catalog or file reader. */
export function createTrustedRaycastCanIUseSourceDetail(message: unknown, expected: TrustedRaycastCanIUseRevisionContext,
  isCurrent: (revision: number) => boolean, isSelected: (slug: string) => boolean) {
  if (typeof message !== 'string') return fail('RENDER_INVALID')
  if (Buffer.byteLength(message) > 32768) return fail('LIMIT_EXCEEDED')
  let decoded: unknown
  try { decoded = JSON.parse(message) } catch { return fail('RENDER_INVALID') }
  const value = record(decoded, ['type', 'revision', 'context', 'feature', 'agents'])
  if (value.type !== 'can-i-use-detail' || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return fail('RENDER_INVALID')
  const revision = value.revision as number
  const context = validateTrustedRaycastCanIUseContext(value.context)
  const bound = validateTrustedRaycastCanIUseContext(expected)
  if (Object.keys(bound).some(key => context[key as keyof typeof context] !== bound[key as keyof typeof bound])) return fail('SNAPSHOT_STALE')
  const assertCurrent = (): void => { if (!isCurrent(revision)) fail('SNAPSHOT_STALE') }
  assertCurrent()
  if (typeof value.feature !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value.feature) || !isSelected(value.feature)) return fail('ACTION_DENIED')
  const feature = value.feature
  if (!Array.isArray(value.agents) || value.agents.length > 64) return fail('RENDER_INVALID')
  const rows = value.agents.map(agent => record(agent, ['browser', 'label', 'sourceIndex', 'flags', 'release_date']))
  const selected = validateTrustedRaycastCanIUseDetailRows(rows.map(row => ({ browser: row.browser, label: row.label, sourceIndex: row.sourceIndex })))
  const support: Record<string, Readonly<Record<string, number>>> = {}
  const agents: Record<string, Readonly<{ browser: string; release_date: Readonly<Record<string, number | null>> }>> = {}
  rows.forEach((row, index) => {
    const flags = record(row.flags, ['y', 'a', 'x', 'u'])
    for (const number of Object.values(flags)) if (number !== null && (typeof number !== 'number' || !Number.isFinite(number) || number < 0)) fail('RENDER_INVALID')
    const keys = ['y', 'a', 'x'].filter(key => flags[key] !== null).map(key => String(flags[key]))
    if (typeof row.release_date !== 'object' || row.release_date === null || Array.isArray(row.release_date)) fail('RENDER_INVALID')
    const dates = row.release_date as Record<string, unknown>
    if (Object.keys(dates).length > 3 || Object.keys(dates).some(key => !keys.includes(key))) fail('RENDER_INVALID')
    for (const date of Object.values(dates)) if (date !== null && (!Number.isSafeInteger(date) || (date as number) < 0 || (date as number) > 8640000000000)) fail('RENDER_INVALID')
    const browser = selected[index]!.browser
    support[browser] = Object.freeze(Object.fromEntries(Object.entries(flags).filter((entry): entry is [string, number] => entry[1] !== null)))
    agents[browser] = Object.freeze({ browser: selected[index]!.label, release_date: Object.freeze({ ...dates }) as Readonly<Record<string, number | null>> })
  })
  const table = Object.freeze(support)
  return Object.freeze({ revision, feature, agents: Object.freeze(agents),
    getSupport(...args: unknown[]) {
      assertCurrent()
      if (args.length !== 1 || args[0] !== feature) return fail('DATA_UNAVAILABLE')
      return table
    },
  })
}
