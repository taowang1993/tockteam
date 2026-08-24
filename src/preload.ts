import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopBridge,
  DesktopCommand,
  DesktopInfo,
  DesktopRuntimeSnapshot,
  TockTutorDesktopDispatchEvent,
  WebClipBlockedNavigation,
} from './contracts.ts'
import type { MarketplaceCommand, MarketplaceSnapshot } from '../plugins/plugin-marketplace/src/protocol.ts'
import type { DesktopCallerOperation, DesktopDispatchCompletionRequest } from './host-contract.ts'

const bridge: DesktopBridge = Object.freeze({
  chooseWorkspace: async (): Promise<string[]> => {
    return await ipcRenderer.invoke('desktop:choose-workspace') as string[]
  },
  getInfo: async (): Promise<DesktopInfo> => await ipcRenderer.invoke('desktop:get-info') as DesktopInfo,
  getRuntimeSnapshot: async (): Promise<DesktopRuntimeSnapshot> => {
    return await ipcRenderer.invoke('desktop:get-runtime-snapshot') as DesktopRuntimeSnapshot
  },
  onCommand: (listener: (command: DesktopCommand) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: DesktopCommand): void => { listener(command) }
    ipcRenderer.on('desktop:command', wrapped)
    return () => { ipcRenderer.removeListener('desktop:command', wrapped) }
  },
  openExternal: async (url: string): Promise<void> => {
    await ipcRenderer.invoke('desktop:open-external', url)
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
    authorize: async (operation: DesktopCallerOperation) => {
      return await ipcRenderer.invoke('desktop:tocktutor-authorize', operation) as { authorization: string }
    },
    completeDispatch: async (request: DesktopDispatchCompletionRequest) => {
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
