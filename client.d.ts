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
export type DesktopQuickAction = 'new' | 'daily' | 'capture' | 'search'
export type TockTutorProtocolRequest = {
  action: 'open' | 'new' | 'daily' | 'unique' | 'search' | 'choose-vault'
  vaultId?: string
  vaultGeneration?: number
  file?: string
  name?: string
  content?: string
  query?: string
  ifExists?: 'prepend' | 'append' | 'overwrite'
  silent?: true
  paneType?: 'tab' | 'split' | 'window'
  xSuccess?: string
  xError?: string
}
export type TockTutorDesktopDispatchEvent = {
  action: DesktopQuickAction
  deliveryId: string
  kind: 'quick-action'
  operationId: string
} | {
  deliveryId: string
  kind: 'protocol'
  operationId: string
  request: TockTutorProtocolRequest
}
export interface TockTutorDesktopDispatchCompletionRequest {
  deliveryId: string
  operationId: string
  status: 'handled' | 'failed' | 'stale'
}
export interface TockTutorDesktopCallerBridge {
  authorize(operation: DesktopCallerOperation, expectedVault?: Readonly<{ generation: number; id: string }>): Promise<{ authorization: string }>
  cancelDispatch(): Promise<void>
  completeDispatch(request: TockTutorDesktopDispatchCompletionRequest): Promise<'handled' | 'stale' | 'unavailable'>
  nextDispatch(): Promise<TockTutorDesktopDispatchEvent | null>
}
export declare const TOCKCODER_ROUTE_PREFIX: '/tockcoder'
export declare const TOCKTUTOR_ROUTE_PREFIX: '/tocktutor'
export declare const TOCKTUTOR_ROUTE_SLOT: 'tockteam.tocktutor.route'
export type TockTutorNavigationMode = 'push' | 'replace'
export interface TockTutorRouteLocation {
  hash: string
  pathname: string
  search: string
}
export interface TockTutorRouteOwnerProps {
  active?: boolean
  location: TockTutorRouteLocation
  navigate: (path: string, mode?: TockTutorNavigationMode) => void
}
export declare function canonicalTockTeamPath(pathname: string): string
export declare function isTockCoderPath(pathname: string): boolean
export declare function isTockTutorPath(pathname: string): boolean
export declare function readTockTutorRouteLocation(): TockTutorRouteLocation
export declare function resolveTockTutorNavigation(path: string): URL | undefined
