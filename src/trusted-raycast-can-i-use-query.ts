import { trustedRaycastCanIUseError, type TrustedRaycastCanIUseErrorCode } from './trusted-raycast-can-i-use-errors.ts'

const MAX_QUERY_BYTES = 4_096
const MAX_QUERY_CLAUSES = 64
const MAX_RESULT_TARGETS = 256
const MAX_TARGET_BYTES = 64

const TARGET_PATTERN = /^([a-z][a-z0-9_]*)([ \t]+)((?:0|[1-9][0-9]{0,3})(?:\.(?:0|[1-9][0-9]{0,2})){0,2}(?:-(?:0|[1-9][0-9]{0,3})(?:\.(?:0|[1-9][0-9]{0,2})){0,2})?|all|TP)$/
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export type TrustedRaycastCanIUseTargetCollection = readonly string[] | ReadonlySet<string>

export type TrustedRaycastCanIUseQueryOptions = Readonly<{
  canonicalTargets: TrustedRaycastCanIUseTargetCollection
}>

function fail(code: TrustedRaycastCanIUseErrorCode): never {
  throw trustedRaycastCanIUseError(code)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function trimAsciiQuery(value: string): string {
  return value.replace(/^[ \t\n]+/, '').replace(/[ \t\n]+$/, '')
}

function trimAsciiHSpace(value: string): string {
  return value.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')
}

function asciiSort(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

function canonicalTargetFromClause(value: string): string {
  const match = TARGET_PATTERN.exec(value)
  if (!match) fail('QUERY_UNSUPPORTED')
  const target = `${match[1]!} ${match[3]!}`
  if (byteLength(target) > MAX_TARGET_BYTES) fail('LIMIT_EXCEEDED')
  return target
}

export function isTrustedRaycastCanIUseCanonicalTarget(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[\x00-\x7f]*$/.test(value)) return false
  const match = TARGET_PATTERN.exec(value)
  return match !== null
    && `${match[1]!} ${match[3]!}` === value
    && byteLength(value) <= MAX_TARGET_BYTES
}

function canonicalTargetFromData(value: unknown): string {
  if (!isTrustedRaycastCanIUseCanonicalTarget(value)) fail('DATA_UNAVAILABLE')
  return value
}

function readCollection(value: unknown, code: TrustedRaycastCanIUseErrorCode): string[] {
  if (Array.isArray(value)) return value.slice()
  if (value instanceof Set) return [...value]
  fail(code)
}

function copyCanonicalTargets(value: unknown, code: TrustedRaycastCanIUseErrorCode): Set<string> {
  const values = readCollection(value, code)
  const result = new Set<string>()
  for (const entry of values) result.add(canonicalTargetFromData(entry))
  return result
}

function readQueryOptions(value: unknown): { canonicalTargets: Set<string> } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('DATA_UNAVAILABLE')
  let descriptors: Record<string, PropertyDescriptor>
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail('DATA_UNAVAILABLE')
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== 'string' || key !== 'canonicalTargets')) {
      fail('DATA_UNAVAILABLE')
    }
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    fail('DATA_UNAVAILABLE')
  }
  const canonicalDescriptor = descriptors.canonicalTargets
  if (!canonicalDescriptor || canonicalDescriptor.get || canonicalDescriptor.set) fail('DATA_UNAVAILABLE')
  return { canonicalTargets: copyCanonicalTargets(canonicalDescriptor.value, 'DATA_UNAVAILABLE') }
}

function parseClauses(value: string): string[] {
  const clauses: string[] = []
  let cursor = 0
  while (cursor < value.length) {
    const comma = value.indexOf(',', cursor)
    const lineFeed = value.indexOf('\n', cursor)
    let end = value.length
    if (comma >= 0 && comma < end) end = comma
    if (lineFeed >= 0 && lineFeed < end) end = lineFeed
    const clause = trimAsciiHSpace(value.slice(cursor, end))
    if (clause.length === 0) fail('QUERY_UNSUPPORTED')
    clauses.push(clause)
    if (clauses.length > MAX_QUERY_CLAUSES) fail('LIMIT_EXCEEDED')
    if (end === value.length) break
    cursor = end + 1
    while (cursor < value.length && (value[cursor] === ' ' || value[cursor] === '\t')) cursor++
    if (cursor === value.length) fail('QUERY_UNSUPPORTED')
  }
  if (clauses.length === 0) fail('QUERY_UNSUPPORTED')
  return clauses
}

/** Normalize only the finite defaults-or-exact-target-union grammar. */
export function normalizeTrustedRaycastCanIUseQuery(
  query: unknown,
  options: TrustedRaycastCanIUseQueryOptions,
): readonly string[] {
  if (typeof query !== 'string') fail('QUERY_UNSUPPORTED')
  const normalized = query.replace(/\r\n/g, '\n')
  if (!/^[\x00-\x7f]*$/.test(normalized) || normalized.includes('\r')) fail('QUERY_UNSUPPORTED')
  if (byteLength(normalized) > MAX_QUERY_BYTES) fail('LIMIT_EXCEEDED')
  const trimmed = trimAsciiQuery(normalized)
  const { canonicalTargets } = readQueryOptions(options)

  // The reviewed defaults fixture is intentionally absent in this checkpoint.
  if (trimmed === 'defaults') fail('DATA_UNAVAILABLE')

  const clauses = parseClauses(trimmed)
  const targets = new Set<string>()
  for (const clause of clauses) {
    const target = canonicalTargetFromClause(clause)
    if (!canonicalTargets.has(target)) fail('QUERY_UNSUPPORTED')
    targets.add(target)
  }
  if (targets.size > MAX_RESULT_TARGETS) fail('LIMIT_EXCEEDED')
  return Object.freeze([...targets].sort(asciiSort))
}

/** Validate the environment spelling used by the finite Browserslist alias. */
export function isTrustedRaycastCanIUseEnvironment(value: unknown): value is string {
  return typeof value === 'string' && ENVIRONMENT_PATTERN.test(value)
}
