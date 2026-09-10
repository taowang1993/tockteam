import { createTrustedRaycastCanIUseSourceDetail } from './trusted-raycast-can-i-use-source-detail.ts'
import { createTrustedRaycastCanIUseSourceRoot } from './trusted-raycast-can-i-use-source-root.ts'
import { validateTrustedRaycastCanIUseContext } from './trusted-raycast-can-i-use-actions.ts'
import { prepareTrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'
import { failTrustedRaycastCanIUse as fail } from './trusted-raycast-can-i-use-errors.ts'
import { trustedRaycastCanIUseOsAlias, trustedRaycastCanIUsePathAlias } from './trusted-raycast-can-i-use-aliases.ts'

function environmentJson(name: string): unknown {
  const value = process.env[name]
  if (typeof value !== 'string' || Buffer.byteLength(value) > 32768) return fail('CONFIG_INVALID')
  try { return JSON.parse(value) } catch { return fail('CONFIG_INVALID') }
}
const context = validateTrustedRaycastCanIUseContext(environmentJson('TRUSTED_RAYCAST_CAN_I_USE_CONTEXT'))
if (process.env.TRUSTED_RAYCAST_EXTENSION_ID !== 'can-i-use' || context.sessionId !== process.env.TRUSTED_RAYCAST_SESSION_ID
  || context.workspaceId !== 'no-workspace') fail('ACTION_DENIED')
let current: ReturnType<typeof createTrustedRaycastCanIUseSourceRoot>
let lastRevision = 0
let invalidate: (() => void) | undefined
let detail: ReturnType<typeof createTrustedRaycastCanIUseSourceDetail> | undefined
let invalidateDetail: (() => void) | undefined
export let agents: Readonly<Record<string, Readonly<{ browser: string; release_date: Readonly<Record<string, number | null>> }>>> = Object.freeze({})
export let features: Readonly<Record<string, Readonly<object>>> = Object.freeze({})

/** Parent stdin controls replacement. This is not a renderer-callable RPC. */
export function replaceTrustedRaycastCanIUseRoot(message: unknown): void {
  invalidate?.()
  invalidateDetail?.()
  detail = undefined
  agents = Object.freeze({})
  features = Object.freeze({})
  const previous = lastRevision
  let live = true
  const next = createTrustedRaycastCanIUseSourceRoot(message, context, revision => live && revision > previous)
  if (current && (next.defaultQuery !== current.defaultQuery || next.environment !== current.environment)) fail('SNAPSHOT_STALE')
  current = next
  lastRevision = next.revision
  invalidate = () => { live = false }
  features = next.features
}
export function replaceTrustedRaycastCanIUseDetail(message: unknown): string {
  if (detail) return fail('ACTION_DENIED')
  const previous = lastRevision
  let live = true
  const next = createTrustedRaycastCanIUseSourceDetail(message, context, revision => live && revision > previous, slug => Object.hasOwn(features, slug))
  invalidate?.()
  features = Object.freeze({})
  detail = next
  agents = next.agents
  lastRevision = next.revision
  invalidateDetail = () => { live = false }
  return next.feature
}
replaceTrustedRaycastCanIUseRoot(process.env.TRUSTED_RAYCAST_CAN_I_USE_ROOT)
// The unchanged source initializes its query at module scope and catches query errors.
// Refuse invalid preferences before it can silently render without support indicators.
const rawPreferences = environmentJson('TRUSTED_RAYCAST_PREFERENCES')
const query = (rawPreferences as { defaultQuery?: unknown } | null)?.defaultQuery
const targets = current!.browserslist(query)
const prepared = prepareTrustedRaycastCanIUsePreferences(rawPreferences, { canonicalTargets: targets })
if (prepared.preferences.environment !== current!.environment) fail('CONFIG_INVALID')
current!.browserslist(prepared.preferences.defaultQuery)

export default function browserslist(...args: unknown[]): string[] { return current.browserslist(...args) }
export function feature(value: unknown) { return current.feature(value) }
export function isSupported(...args: unknown[]): boolean { return current.isSupported(...args) }
export const homedir = trustedRaycastCanIUseOsAlias.homedir
export const join = trustedRaycastCanIUsePathAlias.default.join
export function getSupport(...args: unknown[]) { return detail ? detail.getSupport(...args) : fail('DATA_UNAVAILABLE') }
export function trustedRaycastCanIUseRootCounts() {
  if (detail) {
    const count = Object.keys(detail.agents).length
    return Object.freeze({ visibleCount: count, matchCount: count, totalCount: count })
  }
  return Object.freeze({ visibleCount: current.visibleCount, matchCount: current.matchCount, totalCount: current.totalCount })
}
