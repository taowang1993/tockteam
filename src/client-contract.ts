export {
  isTockTutorPath,
  readTockTutorRouteLocation,
  resolveTockTutorNavigation,
  TOCKTUTOR_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_SLOT,
} from '../plugins/sidebar/src/client/tocktutor-route.ts'
export type { DesktopCallerOperation } from './host-contract.ts'
export type {
  TockTutorDesktopCallerBridge,
  TockTutorDesktopDispatchCompletionRequest,
  TockTutorDesktopDispatchEvent,
} from './contracts.ts'
export type {
  TockTutorNavigationMode,
  TockTutorRouteLocation,
  TockTutorRouteOwnerProps,
} from '../plugins/sidebar/src/client/tocktutor-route.ts'
