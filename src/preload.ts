import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopBridge,
  DesktopCommand,
  DesktopInfo,
  DesktopRuntimeSnapshot,
  TockTutorDesktopDispatchCompletionRequest,
  TockTutorDesktopDispatchEvent,
  WebClipBlockedNavigation,
} from './contracts.ts'
import type { MarketplaceCommand, MarketplaceSnapshot } from '../plugins/plugin-marketplace/src/protocol.ts'
import type { DesktopCallerOperation } from './host-contract.ts'
import {
  DESKTOP_APP_UPDATE_CHANNELS,
  parseDesktopAppUpdateActionResult,
  parseDesktopAppUpdateState,
} from './desktop-app-update.ts'
import {
  LAUNCHER_WORKBENCH_ROUTE_CHANNEL,
  LAUNCHER_WORKBENCH_ROUTE_READY_CHANNEL,
  parseLauncherWorkbenchRoute,
  parseLauncherThemeSource,
  parseLauncherWindowAcknowledgement,
  type LauncherThemeSource,
} from './launcher-window-contract.ts'
import type { LauncherWorkbenchRoute } from './launcher-navigation.ts'
import {
  LAUNCHER_WINDOW_IPC_CHANNELS,
  assertNoLauncherIpcArguments,
  parseDesktopLauncherState,
} from './launcher-window-contract.ts'

const commandListeners = new Set<(command: DesktopCommand) => void>()
const commandQueue: DesktopCommand[] = []
const routeListeners = new Set<(route: LauncherWorkbenchRoute) => void>()
let pendingRoute: LauncherWorkbenchRoute | undefined
const updateListeners = new Set<(state: ReturnType<typeof parseDesktopAppUpdateState>) => void>()
let pendingUpdate: ReturnType<typeof parseDesktopAppUpdateState> | undefined

ipcRenderer.on('desktop:command', (_event, command: DesktopCommand) => {
  if (commandListeners.size === 0) {
    if (commandQueue.length < 128) commandQueue.push(command)
    return
  }
  for (const listener of commandListeners) listener(command)
})
ipcRenderer.on(LAUNCHER_WORKBENCH_ROUTE_CHANNEL, (_event, raw: unknown) => {
  let route: LauncherWorkbenchRoute
  try { route = parseLauncherWorkbenchRoute(raw) } catch { return }
  if (routeListeners.size === 0) {
    pendingRoute = route
    return
  }
  for (const listener of routeListeners) listener(route)
})
ipcRenderer.on(DESKTOP_APP_UPDATE_CHANNELS.state, (_event, raw: unknown) => {
  let state: ReturnType<typeof parseDesktopAppUpdateState>
  try { state = parseDesktopAppUpdateState(raw) } catch { return }
  pendingUpdate = state
  for (const listener of updateListeners) listener(state)
})

const bridge: DesktopBridge = Object.freeze({
  chooseWorkspace: async (): Promise<string[]> => {
    return await ipcRenderer.invoke('desktop:choose-workspace') as string[]
  },
  launcher: Object.freeze({
    getState: async (...args: unknown[]) => {
      assertNoLauncherIpcArguments(args)
      return parseDesktopLauncherState(
        await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.getState),
      )
    },
    show: async (...args: unknown[]) => {
      assertNoLauncherIpcArguments(args)
      return parseDesktopLauncherState(
        await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.show),
      )
    },
  }),
  appUpdate: Object.freeze({
    getState: async () => parseDesktopAppUpdateState(
      await ipcRenderer.invoke(DESKTOP_APP_UPDATE_CHANNELS.getState),
    ),
    check: async (...args: unknown[]) => {
      assertNoLauncherIpcArguments(args)
      return parseDesktopAppUpdateActionResult(await ipcRenderer.invoke(DESKTOP_APP_UPDATE_CHANNELS.check))
    },
    download: async (...args: unknown[]) => {
      assertNoLauncherIpcArguments(args)
      return parseDesktopAppUpdateActionResult(await ipcRenderer.invoke(DESKTOP_APP_UPDATE_CHANNELS.download))
    },
    install: async (...args: unknown[]) => {
      assertNoLauncherIpcArguments(args)
      return parseDesktopAppUpdateActionResult(await ipcRenderer.invoke(DESKTOP_APP_UPDATE_CHANNELS.install))
    },
    onStateChange: (listener: (state: ReturnType<typeof parseDesktopAppUpdateState>) => void): (() => void) => {
      if (typeof listener !== 'function') throw new Error('Desktop updater listener is invalid')
      updateListeners.add(listener)
      if (pendingUpdate !== undefined) listener(pendingUpdate)
      return () => { updateListeners.delete(listener) }
    },
  }),
  launchOnStart: Object.freeze({
    get: async (...args: unknown[]): Promise<boolean> => {
      assertNoLauncherIpcArguments(args)
      const value = await ipcRenderer.invoke('desktop:launch-on-start:get')
      if (typeof value !== 'boolean') throw new Error('Invalid Launch on Start state')
      return value
    },
    set: async (enabled: boolean, ...extra: unknown[]): Promise<boolean> => {
      assertNoLauncherIpcArguments(extra)
      if (typeof enabled !== 'boolean') throw new Error('Launch on Start must be a boolean')
      const value = await ipcRenderer.invoke('desktop:launch-on-start:set', enabled)
      if (typeof value !== 'boolean') throw new Error('Invalid Launch on Start state')
      return value
    },
  }),
  getInfo: async (): Promise<DesktopInfo> => await ipcRenderer.invoke('desktop:get-info') as DesktopInfo,
  getRuntimeSnapshot: async (): Promise<DesktopRuntimeSnapshot> => {
    return await ipcRenderer.invoke('desktop:get-runtime-snapshot') as DesktopRuntimeSnapshot
  },
  onCommand: (listener: (command: DesktopCommand) => void): (() => void) => {
    if (typeof listener !== 'function') throw new Error('Desktop command listener is invalid')
    commandListeners.add(listener)
    const queued = commandQueue.splice(0)
    for (const command of queued) listener(command)
    return () => { commandListeners.delete(listener) }
  },
  onRoute: (listener: (route: LauncherWorkbenchRoute) => void): (() => void) => {
    if (typeof listener !== 'function') throw new Error('Desktop route listener is invalid')
    routeListeners.add(listener)
    const queued = pendingRoute
    pendingRoute = undefined
    if (queued !== undefined) listener(queued)
    return () => { routeListeners.delete(listener) }
  },
  syncLauncherTheme: async (source: LauncherThemeSource): Promise<void> => {
    const parsed = parseLauncherThemeSource(source)
    parseLauncherWindowAcknowledgement(await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.syncThemeSource, parsed))
  },
  openExternal: async (url: string): Promise<void> => {
    await ipcRenderer.invoke('desktop:open-external', url)
  },
  setTockTutorActive: async (active: boolean): Promise<void> => {
    await ipcRenderer.invoke('desktop:set-tocktutor-active', active)
  },
  pluginMarketplace: Object.freeze({
    dispatch: async (command: MarketplaceCommand): Promise<MarketplaceSnapshot> => {
      return await ipcRenderer.invoke('desktop:plugin-marketplace-dispatch', command) as MarketplaceSnapshot
    },
    getSnapshot: async (): Promise<MarketplaceSnapshot> => {
      return await ipcRenderer.invoke('desktop:plugin-marketplace-snapshot') as MarketplaceSnapshot
    },
  }),
  tockTutor: Object.freeze({
    authorize: async (operation: DesktopCallerOperation, expectedVault?: Readonly<{ generation: number; id: string }>) => {
      return await ipcRenderer.invoke('desktop:tocktutor-authorize', { expectedVault, operation }) as { authorization: string }
    },
    cancelDispatch: async () => {
      await ipcRenderer.invoke('desktop:tocktutor-dispatch-cancel')
    },
    completeDispatch: async (request: TockTutorDesktopDispatchCompletionRequest) => {
      return await ipcRenderer.invoke('desktop:tocktutor-dispatch-complete', request) as 'handled' | 'stale' | 'unavailable'
    },
    nextDispatch: async () => {
      return await ipcRenderer.invoke('desktop:tocktutor-dispatch-next') as TockTutorDesktopDispatchEvent | null
    },
  }),
  webClip: Object.freeze({
    authorizeDocument: async (frameId: number, html: string): Promise<string> => {
      return await ipcRenderer.invoke('desktop:web-clip-authorize-document', { frameId, html }) as string
    },
    onNavigationBlocked: (listener: (navigation: WebClipBlockedNavigation) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, raw: unknown): void => {
        if (typeof raw !== 'object' || raw === null) return
        const value = raw as Record<string, unknown>
        if (!Number.isSafeInteger(value.frameId) || typeof value.url !== 'string') return
        listener({ frameId: value.frameId as number, url: value.url })
      }
      ipcRenderer.on('desktop:web-clip-navigation-blocked', wrapped)
      return () => { ipcRenderer.removeListener('desktop:web-clip-navigation-blocked', wrapped) }
    },
  }),
})

contextBridge.exposeInMainWorld('dshDesktop', bridge)

// Splash documents also use this preload. Only a trusted runtime document can
// complete the readiness handshake; the main process rejects every other URL.
if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
  void ipcRenderer.invoke(LAUNCHER_WORKBENCH_ROUTE_READY_CHANNEL).catch(() => {})
}
