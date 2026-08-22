import type { SlotEntryDef } from '@deepseek-ai/dsh-client-ui-slots'

/** Public client contract for Desktop route contributions. */
export declare const TOCKTUTOR_ROUTE_PREFIX: '/tocktutor'
export declare const TOCKTUTOR_ROUTE_SLOT: 'tockteam.tocktutor.route'
export type TockTutorNavigationMode = 'push' | 'replace'
export interface TockTutorRouteLocation {
  hash: string
  pathname: string
  search: string
}
export interface TockTutorRouteOwnerProps {
  location: TockTutorRouteLocation
  navigate: (path: string, mode?: TockTutorNavigationMode) => void
}
export declare function isTockTutorPath(pathname: string): boolean
export declare function readTockTutorRouteLocation(): TockTutorRouteLocation
export declare function resolveTockTutorNavigation(path: string): URL | undefined

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'tockteam.tocktutor.route': SlotEntryDef & {
      kind: 'single'
      owner: TockTutorRouteOwnerProps
      scope: 'root'
    }
  }
}
