import type { WebContents } from 'electron'
import type { LauncherRendererRole } from './launcher-window-contract.ts'

export type LauncherRegistryWebContents = Pick<WebContents, 'getURL'> & Readonly<{
  id: number
  mainFrame: unknown
  session: unknown
  isDestroyed?: () => boolean
  on?: (event: 'destroyed' | 'render-process-gone', listener: () => void) => unknown
}>

export type LauncherRegistryWindow = Readonly<{
  isDestroyed?: () => boolean
  webContents: LauncherRegistryWebContents
  once?: (event: 'closed', listener: () => void) => unknown
}>

/** Owns the singleton launcher window without clearing unrelated window roles. */
export class LauncherWindowRegistry {
  private readonly windows = new Map<LauncherRendererRole, LauncherRegistryWindow>()

  register(role: LauncherRendererRole, window: LauncherRegistryWindow): () => void {
    const current = this.windows.get(role)
    if (current !== undefined && current !== window
      && !(typeof current.isDestroyed === 'function' && current.isDestroyed())) {
      throw new Error(`A ${role} window is already registered`)
    }
    this.windows.set(role, window)
    let disposed = false
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      if (this.windows.get(role) === window) this.windows.delete(role)
    }
    window.once?.('closed', dispose)
    window.webContents.on?.('destroyed', dispose)
    window.webContents.on?.('render-process-gone', dispose)
    return dispose
  }

  resolveWindow(sender: LauncherRegistryWebContents): LauncherRegistryWindow | null {
    const window = this.windows.get('launcher')
    if (window === undefined) return null
    if (typeof window.isDestroyed === 'function' && window.isDestroyed()) {
      this.windows.delete('launcher')
      return null
    }
    return window.webContents === sender ? window : null
  }

  roleOf(window: LauncherRegistryWindow): LauncherRendererRole | undefined {
    return this.windows.get('launcher') === window ? 'launcher' : undefined
  }

  unregister(role: LauncherRendererRole, window: LauncherRegistryWindow): void {
    if (this.windows.get(role) === window) this.windows.delete(role)
  }

  get size(): number {
    return this.windows.size
  }
}
