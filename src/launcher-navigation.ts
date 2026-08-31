import {
  TOCKCODER_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_PREFIX,
} from '../plugins/sidebar/src/client/tocktutor-route.ts'

/** The only top-level destinations owned by TockTeam Desktop. */
export const LAUNCHER_ROUTE_DESTINATIONS = Object.freeze([
  'tockcoder',
  'tocktutor',
] as const)

export type TockTeamDestination = (typeof LAUNCHER_ROUTE_DESTINATIONS)[number]
export type LauncherRouteDestination = TockTeamDestination
export type LauncherWorkbenchRoute = Readonly<{ destination: TockTeamDestination }>
export type LauncherWorkbenchRouteEvent = LauncherWorkbenchRoute

export const LAUNCHER_WORKBENCH_ROUTE_CHANNEL = 'launcher:workbench-route' as const
export const LAUNCHER_WORKBENCH_ROUTE_READY_CHANNEL = 'launcher:workbench-route-ready' as const

const ROUTE_PATHS: Readonly<Record<TockTeamDestination, string>> = Object.freeze({
  tockcoder: TOCKCODER_ROUTE_PREFIX,
  tocktutor: TOCKTUTOR_ROUTE_PREFIX,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseLauncherDestination(value: unknown): TockTeamDestination {
  if (value !== 'tockcoder' && value !== 'tocktutor') {
    throw new Error('Invalid TockTeam launcher destination')
  }
  return value
}

/** Parse the main-to-workbench route event without accepting paths or metadata. */
export function parseLauncherWorkbenchRoute(value: unknown): LauncherWorkbenchRoute {
  if (!isRecord(value)
    || Object.keys(value).length !== 1
    || !Object.prototype.hasOwnProperty.call(value, 'destination')) {
    throw new Error('Invalid launcher workbench route')
  }
  return Object.freeze({ destination: parseLauncherDestination(value.destination) })
}

export function parseLauncherRouteDestination(value: unknown): TockTeamDestination {
  return parseLauncherDestination(value)
}

export function parseLauncherWorkbenchRouteEvent(value: unknown): LauncherWorkbenchRoute {
  return parseLauncherWorkbenchRoute(value)
}

export const LAUNCHER_ROUTE_PATHS = ROUTE_PATHS

export function resolveLauncherRoutePath(destination: TockTeamDestination): string {
  return ROUTE_PATHS[parseLauncherDestination(destination)]
}

export function isLauncherWorkbenchRoute(value: unknown): value is LauncherWorkbenchRoute {
  try {
    parseLauncherWorkbenchRoute(value)
    return true
  } catch {
    return false
  }
}
