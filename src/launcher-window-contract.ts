import type { LauncherThemeProjection, LauncherThemeSource } from './launcher-theme.ts'

export const LAUNCHER_WINDOW_IPC_CHANNELS = Object.freeze({
  dismiss: 'launcher-window:dismiss',
  focusSearch: 'launcher-window:focus-search',
  getState: 'launcher-window:getState',
  getTheme: 'launcher-window:get-theme',
  openSettings: 'launcher-window:open-settings',
  routeReady: 'launcher:workbench-route-ready',
  show: 'launcher-window:show',
  syncTheme: 'launcher:theme-sync',
  theme: 'launcher-window:theme',
  getThemeSource: 'launcher-window:get-theme',
  syncThemeSource: 'launcher:theme-sync',
})

export type LauncherRendererRole = 'launcher'
export {
  parseLauncherThemeProjection,
  parseLauncherThemeSource,
} from './launcher-theme.ts'
export {
  LAUNCHER_WORKBENCH_ROUTE_CHANNEL,
  LAUNCHER_WORKBENCH_ROUTE_READY_CHANNEL,
  parseLauncherDestination,
  parseLauncherRouteDestination,
  parseLauncherWorkbenchRoute,
  parseLauncherWorkbenchRouteEvent,
} from './launcher-navigation.ts'
export type { LauncherThemeProjection, LauncherThemeSource } from './launcher-theme.ts'
export type { LauncherWorkbenchRoute, TockTeamDestination } from './launcher-navigation.ts'

export type LauncherShortcutState = Readonly<{
  accelerator: string
  message: string | null
  status: 'registered' | 'unavailable'
}>

export type DesktopLauncherState = Readonly<{
  shortcut: LauncherShortcutState
  visible: boolean
}>

export type LauncherWindowAcknowledgement = Readonly<{ ok: true }>
export type LauncherWindowAck = LauncherWindowAcknowledgement

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum
}

export function parseLauncherShortcutState(value: unknown): LauncherShortcutState {
  if (!isExactRecord(value, ['accelerator', 'message', 'status'])
    || !boundedString(value.accelerator, 64)
    || (value.message !== null && !boundedString(value.message, 512))
    || (value.status !== 'registered' && value.status !== 'unavailable')) {
    throw new Error('Invalid desktop launcher shortcut state')
  }
  return Object.freeze({
    accelerator: value.accelerator,
    message: value.message,
    status: value.status,
  })
}

export function parseDesktopLauncherState(value: unknown): DesktopLauncherState {
  if (!isExactRecord(value, ['shortcut', 'visible']) || typeof value.visible !== 'boolean') {
    throw new Error('Invalid desktop launcher state')
  }
  return Object.freeze({
    shortcut: parseLauncherShortcutState(value.shortcut),
    visible: value.visible,
  })
}

export function parseLauncherWindowAcknowledgement(value: unknown): LauncherWindowAcknowledgement {
  if (!isExactRecord(value, ['ok']) || value.ok !== true) {
    throw new Error('Invalid launcher window acknowledgement')
  }
  return Object.freeze({ ok: true })
}

export const parseLauncherWindowAck = parseLauncherWindowAcknowledgement

export function assertNoLauncherIpcArguments(args: readonly unknown[]): void {
  if (args.length !== 0) throw new Error('Launcher IPC does not accept arguments')
}
