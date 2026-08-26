export { apply, inject } from './client/plugin.tsx'
export type { WorkspaceTools } from './client/plugin.tsx'
export {
  canonicalTockTeamPath,
  isTockCoderPath,
  isTockTutorPath,
  readTockTutorRouteLocation,
  resolveTockTutorNavigation,
  TOCKCODER_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_SLOT,
} from './client/tocktutor-route.ts'
export type {
  TockTutorNavigationMode,
  TockTutorRouteLocation,
  TockTutorRouteOwnerProps,
} from './client/tocktutor-route.ts'
export { DesktopSidebarService } from './client/sidebar-service.ts'
export type {
  DesktopSidebar,
  DesktopSidebarRenderProps,
  DesktopSidebarSnapshot,
  DesktopSidebarTab,
  DesktopSidebarTabDescriptor,
  DesktopSidebarTabSeed,
  DesktopSidebarViewerDescriptor,
  OpenTabResult,
  SidebarFileFetchStrategy,
} from './client/sidebar-service.ts'
