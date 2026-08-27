/** Stable Desktop route seat contributed by the TockTeam shell. */
export const TOCKTUTOR_ROUTE_SLOT = 'tockteam.tocktutor.route' as const

export type TockTutorNavigationMode = 'push' | 'replace'

export interface TockTutorRouteLocation {
  hash: string
  pathname: string
  search: string
}

/** Owner props supplied by TockTeam to the TockTutor route contribution. */
export interface TockTutorRouteOwnerProps {
  active?: boolean
  location: TockTutorRouteLocation
  navigate: (path: string, mode?: TockTutorNavigationMode) => void
}

export const TOCKCODER_ROUTE_PREFIX = '/tockcoder'
export const TOCKTUTOR_ROUTE_PREFIX = '/tocktutor'

const TOCKTUTOR_ROUTE_STATE = Symbol.for('tockteam.tocktutor.route-state')
const MAX_REMEMBERED_ROUTE_LENGTH = 4_096

interface SharedTockTutorRouteState {
  rememberedPath: string
}

function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isTockCoderPath(pathname: string): boolean {
  return matchesRoute(pathname, TOCKCODER_ROUTE_PREFIX)
}

export function isTockTutorPath(pathname: string): boolean {
  return matchesRoute(pathname, TOCKTUTOR_ROUTE_PREFIX)
}

function validSharedTockTutorPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length === 0 || path.length > MAX_REMEMBERED_ROUTE_LENGTH) return false
  if (/[\u0000-\u001f\u007f]/u.test(path)) return false
  let url: URL
  try {
    const base = typeof window === 'undefined' ? 'http://tockteam.invalid/' : window.location.href
    url = new URL(path, base)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (typeof window !== 'undefined' && url.origin !== window.location.origin) return false
  if (!isTockTutorPath(url.pathname)) return false
  try {
    return !/[\u0000-\u001f\u007f]/u.test(decodeURIComponent(url.pathname + url.search + url.hash))
  } catch {
    return false
  }
}

function sharedTockTutorRouteState(): SharedTockTutorRouteState {
  const globalState = globalThis as typeof globalThis & {
    [TOCKTUTOR_ROUTE_STATE]?: unknown
  }
  const current = globalState[TOCKTUTOR_ROUTE_STATE]
  if (typeof current === 'object' && current !== null && 'rememberedPath' in current
    && validSharedTockTutorPath(current.rememberedPath)) {
    return current as SharedTockTutorRouteState
  }
  const state: SharedTockTutorRouteState = { rememberedPath: TOCKTUTOR_ROUTE_PREFIX }
  Object.defineProperty(globalState, TOCKTUTOR_ROUTE_STATE, {
    configurable: false,
    enumerable: false,
    value: state,
    writable: false,
  })
  return state
}

export function rememberTockTutorPath(location: Pick<TockTutorRouteLocation, 'hash' | 'pathname' | 'search'>): void {
  if (typeof location?.pathname !== 'string' || typeof location.search !== 'string'
    || typeof location.hash !== 'string' || !isTockTutorPath(location.pathname)) return
  const path = `${location.pathname}${location.search}${location.hash}`
  if (!validSharedTockTutorPath(path)) return
  sharedTockTutorRouteState().rememberedPath = path
}

export function readLastTockTutorPath(): string {
  const path = sharedTockTutorRouteState().rememberedPath
  return validSharedTockTutorPath(path) ? path : TOCKTUTOR_ROUTE_PREFIX
}

export function canonicalTockTeamPath(pathname: string): string {
  return pathname === '/' ? TOCKCODER_ROUTE_PREFIX : pathname
}

export function readTockTutorRouteLocation(): TockTutorRouteLocation {
  return Object.freeze({
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
  })
}

/** Resolve one bounded same-origin SPA path without allowing a new origin. */
export function resolveTockTutorNavigation(path: string): URL | undefined {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4_096) return undefined
  let url: URL
  try {
    url = new URL(path, window.location.href)
  } catch {
    return undefined
  }
  if (url.origin !== window.location.origin
    || (url.protocol !== 'http:' && url.protocol !== 'https:')) return undefined
  let decoded: string
  try {
    decoded = decodeURIComponent(url.pathname + url.search + url.hash)
  } catch {
    return undefined
  }
  if (/[\u0000-\u001f\u007f]/u.test(decoded)) return undefined
  return url
}
