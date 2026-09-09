import { trustedRaycastCanIUseError } from './trusted-raycast-can-i-use-errors.ts'
import {
  isTrustedRaycastCanIUseCanonicalTarget,
  isTrustedRaycastCanIUseEnvironment,
  normalizeTrustedRaycastCanIUseQuery,
  type TrustedRaycastCanIUseQueryOptions,
} from './trusted-raycast-can-i-use-query.ts'

const WORKSPACE_CONFIG_TOKEN = '@workspace-config-v1'

type SnapshotInput = Readonly<{
  identity: string
  generation: number
  defaultQuery: string
  environment: string
  canonicalTargets: TrustedRaycastCanIUseQueryOptions['canonicalTargets']
}>

export type TrustedRaycastCanIUseSnapshot = Readonly<{
  identity: string
  generation: number
  defaultQuery: string
  environment: string
  targets: readonly string[]
}>

export type TrustedRaycastCanIUseSnapshotCurrent = (identity: string, generation: number) => boolean
export type TrustedRaycastCanIUseBrowserslistAlias = (...args: unknown[]) => string[]

function fail(code: 'DATA_UNAVAILABLE' | 'PATH_UNSUPPORTED' | 'QUERY_UNSUPPORTED' | 'SNAPSHOT_STALE' | 'WORKSPACE_UNAVAILABLE'): never {
  throw trustedRaycastCanIUseError(code)
}

function trimAsciiQuery(value: string): string {
  return value.replace(/^[ \t\n]+/, '').replace(/[ \t\n]+$/, '')
}

function readDataProperties(value: unknown, names: readonly string[]): Record<string, PropertyDescriptor> {
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

function snapshotOptions(input: unknown): {
  identity: string
  generation: number
  defaultQuery: string
  environment: string
  queryOptions: TrustedRaycastCanIUseQueryOptions
} {
  const descriptors = readDataProperties(input, ['identity', 'generation', 'defaultQuery', 'environment', 'canonicalTargets'])
  const identity = descriptors.identity!.value
  const generation = descriptors.generation!.value
  const defaultQuery = descriptors.defaultQuery!.value
  const environment = descriptors.environment!.value
  if (typeof identity !== 'string' || identity.length === 0
    || !Number.isSafeInteger(generation) || generation < 0
    || typeof defaultQuery !== 'string'
    || !isTrustedRaycastCanIUseEnvironment(environment)) {
    fail('DATA_UNAVAILABLE')
  }
  const queryOptions: TrustedRaycastCanIUseQueryOptions = {
    canonicalTargets: descriptors.canonicalTargets!.value,
  }
  return { identity, generation, defaultQuery, environment, queryOptions }
}

/** Build an immutable finite snapshot from Host-owned canonical target data. */
export function createTrustedRaycastCanIUseSnapshot(input: SnapshotInput): TrustedRaycastCanIUseSnapshot {
  const { identity, generation, defaultQuery, environment, queryOptions } = snapshotOptions(input)
  const targets = normalizeTrustedRaycastCanIUseQuery(defaultQuery, queryOptions)
  const canonicalDefaultQuery = trimAsciiQuery(defaultQuery) === 'defaults' ? 'defaults' : targets.join(',')
  return Object.freeze({
    identity,
    generation,
    defaultQuery: canonicalDefaultQuery,
    environment,
    targets: Object.freeze([...targets]),
  })
}

function copySnapshot(snapshot: TrustedRaycastCanIUseSnapshot): TrustedRaycastCanIUseSnapshot {
  const descriptors = readDataProperties(snapshot, ['identity', 'generation', 'defaultQuery', 'environment', 'targets'])
  const identity = descriptors.identity!.value
  const generation = descriptors.generation!.value
  const defaultQuery = descriptors.defaultQuery!.value
  const environment = descriptors.environment!.value
  const targetsValue = descriptors.targets!.value
  if (typeof identity !== 'string' || identity.length === 0
    || !Number.isSafeInteger(generation) || generation < 0
    || typeof defaultQuery !== 'string'
    || !isTrustedRaycastCanIUseEnvironment(environment)
    || !Array.isArray(targetsValue) || targetsValue.length === 0 || targetsValue.length > 256) {
    fail('SNAPSHOT_STALE')
  }
  const targets = targetsValue.slice()
  if (targets.some(target => !isTrustedRaycastCanIUseCanonicalTarget(target))) fail('SNAPSHOT_STALE')
  if (new Set(targets).size !== targets.length || targets.some((target, index) => index > 0 && targets[index - 1]! >= target)) {
    fail('SNAPSHOT_STALE')
  }
  if (defaultQuery === 'defaults') fail('SNAPSHOT_STALE')
  try {
    const normalized = normalizeTrustedRaycastCanIUseQuery(defaultQuery, { canonicalTargets: new Set(targets) })
    if (normalized.length !== targets.length || normalized.some((target, index) => target !== targets[index])) fail('SNAPSHOT_STALE')
  } catch {
    fail('SNAPSHOT_STALE')
  }
  return Object.freeze({ identity, generation, defaultQuery, environment, targets: Object.freeze(targets) })
}

function isWorkspaceOptions(value: unknown, environment: string): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return false
    const keys = Reflect.ownKeys(value)
    if (keys.length !== 2 || keys.some(key => typeof key !== 'string' || key !== 'path' && key !== 'env')) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const path = descriptors.path
    const env = descriptors.env
    return path !== undefined && env !== undefined
      && path.get === undefined && path.set === undefined
      && env.get === undefined && env.set === undefined
      && path.value === WORKSPACE_CONFIG_TOKEN && env.value === environment
  } catch {
    return false
  }
}

/** The only supported os alias: the source must not learn the real home path. */
export const trustedRaycastCanIUseOsAlias = Object.freeze({
  homedir: (..._args: unknown[]): never => fail('PATH_UNSUPPORTED'),
})

/** The only supported path alias: lexical path behavior is intentionally unavailable. */
export const trustedRaycastCanIUsePathAlias = Object.freeze({
  default: Object.freeze({
    join: (..._args: unknown[]): never => fail('PATH_UNSUPPORTED'),
  }),
})

/** Bind the filesystem-free Browserslist alias to one immutable Host snapshot. */
export function createTrustedRaycastCanIUseAliases(
  snapshot: TrustedRaycastCanIUseSnapshot,
  isCurrent: TrustedRaycastCanIUseSnapshotCurrent,
): Readonly<{
  os: typeof trustedRaycastCanIUseOsAlias
  path: typeof trustedRaycastCanIUsePathAlias
  browserslist: TrustedRaycastCanIUseBrowserslistAlias
}> {
  const bound = copySnapshot(snapshot)
  const assertCurrent = (): void => {
    let current = false
    try { current = isCurrent(bound.identity, bound.generation) === true } catch { current = false }
    if (!current) fail('SNAPSHOT_STALE')
  }
  const browserslist: TrustedRaycastCanIUseBrowserslistAlias = (...args) => {
    assertCurrent()
    if (args.length === 1 && typeof args[0] === 'string' && args[0] === bound.defaultQuery) return bound.targets.slice()
    // Reserved syntax is not workspace authority. No anchored snapshot capability is admitted yet.
    if (args.length === 2 && args[0] === null && isWorkspaceOptions(args[1], bound.environment)) fail('WORKSPACE_UNAVAILABLE')
    fail('QUERY_UNSUPPORTED')
  }
  return Object.freeze({ os: trustedRaycastCanIUseOsAlias, path: trustedRaycastCanIUsePathAlias, browserslist })
}
