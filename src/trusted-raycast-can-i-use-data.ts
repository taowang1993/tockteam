import { createTrustedRaycastCanIUseCatalog, selectTrustedRaycastCanIUseAgentRows } from './trusted-raycast-can-i-use-catalog.ts'
import { isTrustedRaycastCanIUseCanonicalTarget, normalizeTrustedRaycastCanIUseQuery } from './trusted-raycast-can-i-use-query.ts'
import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'

export type TrustedRaycastCanIUseFeatureStatus = 'ls' | 'rec' | 'pr' | 'cr' | 'wd' | 'other' | 'unoff'
export type TrustedRaycastCanIUseFeatureId = Readonly<{ slug: string; sourceIndex: number }>
export type TrustedRaycastCanIUseStatusEntry = TrustedRaycastCanIUseFeatureId & Readonly<{ status: TrustedRaycastCanIUseFeatureStatus }>
export type TrustedRaycastCanIUseFlags = Readonly<{ y: number | null; a: number | null; x: number | null; u: number | null }>
export type TrustedRaycastCanIUseSupportRow = Readonly<{ browser: string; label: string; sourceIndex: number; flags: TrustedRaycastCanIUseFlags }>
export type TrustedRaycastCanIUseFeatureSupport = Readonly<{
  feature: TrustedRaycastCanIUseFeatureId
  targets: readonly Readonly<{ target: string; rawStatus: string; supported: boolean }>[]
  allSupported: boolean
  agents: readonly TrustedRaycastCanIUseSupportRow[]
}>
export type TrustedRaycastCanIUseFeatureDetail = Readonly<{
  feature: TrustedRaycastCanIUseFeatureId
  status: TrustedRaycastCanIUseFeatureStatus
  agents: readonly TrustedRaycastCanIUseSupportRow[]
}>
// Parent's independent read-only metadata attestation, relay 0f70c67b-0e0a-48d1-9579-f06a48b71f80.
// JSON-line scope SHA fe2507e1882491c94b9555d7f979817c37e38d8f3e4350d2896e3c9101688f1f;
// ordered {browser,label,sourceIndex} identity SHA ff53003ab4abe4a6b1489b405e2a51636cdb1e4d2c34178b345e2262427623e7.
const SCOPE = Object.freeze(['and_chr', 'and_ff', 'and_qq', 'and_uc', 'android', 'chrome', 'edge', 'firefox', 'ios_saf', 'kaios', 'op_mini', 'op_mob', 'opera', 'safari', 'samsung'])
const AGENTS = [
  ['ie', 'IE'], ['edge', 'Edge'], ['firefox', 'Firefox'], ['chrome', 'Chrome'], ['safari', 'Safari'], ['opera', 'Opera'],
  ['ios_saf', 'Safari on iOS'], ['op_mini', 'Opera Mini'], ['android', 'Android Browser'], ['bb', 'Blackberry Browser'],
  ['op_mob', 'Opera Mobile'], ['and_chr', 'Chrome for Android'], ['and_ff', 'Firefox for Android'], ['ie_mob', 'IE Mobile'],
  ['and_uc', 'UC Browser for Android'], ['samsung', 'Samsung Internet'], ['and_qq', 'QQ Browser'], ['baidu', 'Baidu Browser'], ['kaios', 'KaiOS Browser'],
] as const
const FLAG_NAMES = ['y', 'a', 'x', 'u'] as const
const RAW_STATUS = /^(?:[yanuxpd]|#[0-9]+)(?: (?:[yanuxpd]|#[0-9]+))*$/
const STATUS = ['ls', 'rec', 'pr', 'cr', 'wd', 'other', 'unoff'] as const
const SELECTORS = ['> 0.5%', 'last 2 versions', 'Firefox ESR', 'not dead']
function fail(): never { return failTrustedRaycastCanIUse('DATA_UNAVAILABLE') }

/** Inspect descriptors before reading values; no getters, inherited fields or open schemas. */
function record(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail()
  const keys = Reflect.ownKeys(value)
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail()
  return Object.fromEntries(names.map(name => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name)
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail()
    return [name, descriptor.value as unknown]
  }))
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) fail()
  if (Reflect.ownKeys(value).length !== value.length + 1) fail()
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail()
    return descriptor.value as unknown
  })
}
function targets(value: unknown, count: number): readonly string[] {
  const result = list(value, count)
  if (result.length !== count || !result.every(isTrustedRaycastCanIUseCanonicalTarget)
    || result.some((target, index) => index > 0 && result[index - 1]! >= target)) fail()
  return Object.freeze(result)
}

function dictionary(value: unknown, max: number): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail()
  const keys = Reflect.ownKeys(value)
  if (keys.length > max || keys.some(key => typeof key !== 'string')) fail()
  return record(value, keys as string[])
}
function readFlags(value: unknown): TrustedRaycastCanIUseFlags {
  const row = dictionary(value, 4)
  if (Object.keys(row).some(key => !FLAG_NAMES.includes(key as typeof FLAG_NAMES[number]))) fail()
  for (const number of Object.values(row)) if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) fail()
  return Object.freeze({ y: row.y as number ?? null, a: row.a as number ?? null, x: row.x as number ?? null, u: row.u as number ?? null })
}
function aggregate(versions: Readonly<Record<string, string>>): TrustedRaycastCanIUseFlags {
  const flags: { -readonly [K in keyof TrustedRaycastCanIUseFlags]: number | null } = { y: null, a: null, x: null, u: null }
  for (const [version, raw] of Object.entries(versions)) {
    const number = Number.parseFloat(version.split('-')[0]!)
    if (Number.isNaN(number)) continue // Literal all/TP have support states but no numeric thresholds.
    const tokens = raw.split(' ')
    for (const flag of FLAG_NAMES) {
      const previous = flags[flag]
      if (tokens.includes(flag) && (previous === null || (flag === 'y' ? number < previous : number > previous))) flags[flag] = number
    }
  }
  return Object.freeze(flags)
}

/** Disconnected pure data projection. No I/O, source evaluation, defaults token or runtime admission. */
export function createTrustedRaycastCanIUseData(input: unknown) {
  try {
    const data = record(input, ['defaults', 'canonicalTargets', 'catalog', 'agents', 'support'])
    const canonicalTargets = targets(data.canonicalTargets, 649)
    const defaults = record(data.defaults, ['epoch', 'selectors', 'targets'])
    const selectors = list(defaults.selectors, 4)
    if (defaults.epoch !== 1777030995000 || selectors.length !== 4 || selectors.some((value, index) => value !== SELECTORS[index])) fail()
    const defaultTargets = targets(defaults.targets, 36)
    if (defaultTargets.some(target => !canonicalTargets.includes(target))) fail()
    const rootTargets = Object.freeze(defaultTargets.filter(target => target !== 'op_mini all'))
    if (rootTargets.length !== 35) fail()
    const statuses: TrustedRaycastCanIUseStatusEntry[] = []
    const rows = list(data.catalog, 581).map(value => {
      const row = record(value, ['slug', 'title', 'status', 'sourceIndex'])
      if (!STATUS.includes(row.status as TrustedRaycastCanIUseFeatureStatus)) fail()
      statuses.push(Object.freeze({ slug: row.slug as string, sourceIndex: row.sourceIndex as number, status: row.status as TrustedRaycastCanIUseFeatureStatus }))
      return { slug: row.slug as string, title: row.title as string, sourceIndex: row.sourceIndex as number }
    })
    const catalog = createTrustedRaycastCanIUseCatalog(rows)
    const statusBySlug = Object.freeze(Object.fromEntries(statuses.map(row => [row.slug, row])))
    const membership = new Set(canonicalTargets)
    const agentValues = list(data.agents, 19)
    if (agentValues.length !== 19) fail()
    const seenTargets = new Set<string>()
    const agents = agentValues.map((value, index) => {
      const row = record(value, ['browser', 'label', 'sourceIndex', 'versions', 'release_date'])
      const [browser, label] = AGENTS[index]!
      if (row.browser !== browser || row.label !== label || row.sourceIndex !== index) fail()
      const versions = list(row.versions, 512)
      const unique = new Set<string>()
      for (const version of versions) {
        if (typeof version !== 'string' || !membership.has(`${browser} ${version}`) || unique.has(version)) fail()
        unique.add(version)
        seenTargets.add(`${browser} ${version}`)
      }
      // Exact source mapper: own version-keyed release_date values remain seconds/null.
      // Metadata is copied for validation only; never exposed in projections/action handles.
      const dates = dictionary(row.release_date, 512)
      for (const [version, date] of Object.entries(dates)) {
        if (!unique.has(version) || (date !== null && (typeof date !== 'number' || !Number.isSafeInteger(date) || date < 0))) fail()
      }
      return Object.freeze({ browser, label, sourceIndex: index, versions: Object.freeze([...unique]), release_date: Object.freeze(dates) })
    })
    if (seenTargets.size !== membership.size) fail()
    const inputSupport = record(data.support, ['scope', 'flags', 'stats'])
    const scope = list(inputSupport.scope, 15)
    if (scope.length !== 15 || scope.some((value, index) => value !== SCOPE[index])) fail()
    if (new Set(defaultTargets.map(target => target.split(' ')[0])).size !== 15
      || defaultTargets.some(target => !SCOPE.includes(target.split(' ')[0]!))) fail()
    const slugs = catalog.entries.map(row => row.slug)
    const inputFlags = record(inputSupport.flags, slugs)
    const inputStats = record(inputSupport.stats, slugs)
    const allStats: Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>> = {}
    const allRows: Record<string, readonly TrustedRaycastCanIUseSupportRow[]> = {}
    const browserNames: readonly string[] = agents.map(agent => agent.browser)
    for (const slug of slugs) {
      const browserStats = dictionary(inputStats[slug], 19)
      const copied: Record<string, Readonly<Record<string, string>>> = {}
      for (const [browser, value] of Object.entries(browserStats)) {
        if (!browserNames.includes(browser)) fail()
        const table = dictionary(value, 512)
        const entries: [string, string][] = []
        for (const [version, raw] of Object.entries(table)) {
          if (!membership.has(`${browser} ${version}`) || typeof raw !== 'string' || raw.length > 256 || !RAW_STATUS.test(raw)) fail()
          entries.push([version, raw])
        }
        copied[browser] = Object.freeze(Object.fromEntries(entries))
      }
      const flags = record(inputFlags[slug], SCOPE)
      const rows: TrustedRaycastCanIUseSupportRow[] = []
      for (const { browser, label, sourceIndex } of agents) {
        if (!SCOPE.includes(browser)) continue
        if (!Object.hasOwn(copied, browser)) fail()
        const expected = readFlags(flags[browser])
        const computed = aggregate(copied[browser]!)
        if (FLAG_NAMES.some(flag => expected[flag] !== computed[flag])) fail()
        rows.push(Object.freeze({ browser, label, sourceIndex, flags: computed }))
      }
      allStats[slug] = Object.freeze(copied)
      allRows[slug] = Object.freeze(rows)
    }
    Object.freeze(allStats)
    Object.freeze(allRows)
    const featureId = (value: unknown): TrustedRaycastCanIUseFeatureId => {
      try {
        const row = record(value, ['slug', 'sourceIndex'])
        if (typeof row.slug !== 'string' || !Object.hasOwn(statusBySlug, row.slug) || statusBySlug[row.slug]!.sourceIndex !== row.sourceIndex) fail()
        return Object.freeze({ slug: row.slug, sourceIndex: row.sourceIndex as number })
      } catch { return fail() }
    }
    const support = (value: unknown, query: unknown): TrustedRaycastCanIUseFeatureSupport => {
      const feature = featureId(value)
      const normalized = normalizeTrustedRaycastCanIUseQuery(query, { canonicalTargets })
      const selected = normalized.map(target => {
        const [browser, version] = target.split(' ') as [string, string]
        const table = allStats[feature.slug]![browser]
        if (!table || !Object.hasOwn(table, version)) fail()
        const rawStatus = table[version]!
        return Object.freeze({ target, rawStatus, supported: rawStatus === 'y' })
      })
      return Object.freeze({ feature, targets: Object.freeze(selected), allSupported: selected.every(row => row.supported), agents: allRows[feature.slug]! })
    }
    const detail = (value: unknown): TrustedRaycastCanIUseFeatureDetail => {
      const feature = featureId(value)
      const rows = allRows[feature.slug]!
      const selected = selectTrustedRaycastCanIUseAgentRows(agents.map(({ browser, label, sourceIndex }) => ({ browser, label, sourceIndex, hasSupport: SCOPE.includes(browser) })))
      return Object.freeze({ feature, status: statusBySlug[feature.slug]!.status, agents: Object.freeze(selected.map(row => rows.find(candidate => candidate.browser === row.browser)!)) })
    }
    return Object.freeze({ catalog, statusBySlug, defaultTargets, rootTargets, support, detail })
  } catch { return fail() }
}
