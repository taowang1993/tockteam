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
  location: TockTutorRouteLocation
  navigate: (path: string, mode?: TockTutorNavigationMode) => void
}

export const TOCKTUTOR_ROUTE_PREFIX = '/tocktutor'

export function isTockTutorPath(pathname: string): boolean {
  return pathname === TOCKTUTOR_ROUTE_PREFIX
    || pathname.startsWith(`${TOCKTUTOR_ROUTE_PREFIX}/`)
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
