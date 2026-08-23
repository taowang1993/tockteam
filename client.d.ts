/** Public client contract for Desktop route contributions. */
export type DesktopCallerOperation =
  | 'activate-vault'
  | 'reveal-entry'
  | 'popout-open'
  | 'popout-close'
  | 'popout-close-all'
  | 'microphone'
  | 'print'
  | 'export-html'
  | 'export-pdf'
  | 'import-source'
  | 'backup'
  | 'restore-backup'
export interface TockTutorDesktopCallerBridge {
  authorize(operation: DesktopCallerOperation): Promise<{ authorization: string }>
}
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
