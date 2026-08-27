import type { Rectangle } from 'electron'
import type {
  DesktopLauncherState,
  LauncherShortcutState,
} from './launcher-window-contract.ts'

export const TOCKLAUNCHER_PRODUCT_NAME = 'TockLauncher'
export const LAUNCHER_WORK_AREA_MARGIN = 16
export const LAUNCHER_TOP_FACTOR = 0.12

export const TOCKLAUNCHER_WINDOW_SIZE = Object.freeze({
  height: 475,
  width: 750,
})

type LauncherInput = Readonly<{ key?: string; type?: string }>
type LauncherInputEvent = Readonly<{ preventDefault: () => void }>

type LauncherWebContents = Readonly<{
  id: number
  on: (...args: any[]) => unknown
}>

export type LauncherOverlayWindow = Readonly<{
  destroy: () => void
  focus: () => void
  hide: () => void
  isDestroyed: () => boolean
  isFocused: () => boolean
  isVisible: () => boolean
  loadURL: (url: string) => Promise<void>
  once: (event: 'closed', listener: () => void) => unknown
  on: (event: 'blur', listener: () => void) => unknown
  setAlwaysOnTop: (alwaysOnTop: boolean) => void
  setBounds: (bounds: Rectangle) => void
  setVisibleOnAllWorkspaces: (
    visible: boolean,
    options?: Readonly<{
      skipTransformProcessType?: boolean
      visibleOnFullScreen?: boolean
    }>,
  ) => void
  show: () => void
  webContents: LauncherWebContents
}>

type LauncherGlobalShortcut = Readonly<{
  register: (accelerator: string, callback: () => void) => boolean
  unregister: (accelerator: string) => void
}>

const DEFAULT_HIDE_WINDOW_ON = Object.freeze(['blur', 'escapePressed'])
const DISPOSED_SHORTCUT_MESSAGE = 'The launcher is unavailable. Use the TockLauncher button in the TockTeam titlebar.'

export function resolveLauncherShortcut(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'Option+Space' : 'Alt+Space'
}

export function resolveLauncherBounds(workArea: Rectangle): Rectangle {
  const width = Math.max(1, Math.min(
    TOCKLAUNCHER_WINDOW_SIZE.width,
    workArea.width - (LAUNCHER_WORK_AREA_MARGIN * 2),
  ))
  const height = Math.max(1, Math.min(
    TOCKLAUNCHER_WINDOW_SIZE.height,
    workArea.height - (LAUNCHER_WORK_AREA_MARGIN * 2),
  ))
  const x = workArea.x + Math.floor((workArea.width - width) / 2)
  const minimumY = workArea.y + LAUNCHER_WORK_AREA_MARGIN
  const maximumY = Math.max(
    minimumY,
    workArea.y + workArea.height - height - LAUNCHER_WORK_AREA_MARGIN,
  )
  const preferredY = workArea.y + Math.floor(workArea.height * LAUNCHER_TOP_FACTOR)
  const y = Math.max(minimumY, Math.min(preferredY, maximumY))
  return { height, width, x, y }
}

export class LauncherOverlayController {
  private readonly args: Readonly<{
    createWindow: () => LauncherOverlayWindow
    getDisplayWorkArea: () => Rectangle
    getHideWindowOn?: () => readonly string[]
    globalShortcut: LauncherGlobalShortcut
    loadWindow: (window: LauncherOverlayWindow) => Promise<void>
    platform: NodeJS.Platform
    registerWindow: (
      role: 'launcher',
      window: LauncherOverlayWindow,
    ) => void | (() => void)
  }>
  private window: LauncherOverlayWindow | null = null
  private windowDisposer: (() => void) | undefined
  private windowPromise: Promise<LauncherOverlayWindow> | null = null
  private togglePromise: Promise<void> = Promise.resolve()
  private pendingLoad: { window: LauncherOverlayWindow; reject: (error: Error) => void } | undefined
  private ownsShortcut = false
  private shortcutState: LauncherShortcutState
  private disposed = false
  private readonly windowPreferences = Object.freeze({
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
  })

  constructor(args: Readonly<{
    createWindow: () => LauncherOverlayWindow
    getDisplayWorkArea: () => Rectangle
    getHideWindowOn?: () => readonly string[]
    globalShortcut: LauncherGlobalShortcut
    loadWindow: (window: LauncherOverlayWindow) => Promise<void>
    platform: NodeJS.Platform
    registerWindow: (
      role: 'launcher',
      window: LauncherOverlayWindow,
    ) => void | (() => void)
  }>) {
    this.args = args
    this.shortcutState = Object.freeze({
      accelerator: resolveLauncherShortcut(args.platform),
      message: null,
      status: 'unavailable',
    })
  }

  registerShortcut(): LauncherShortcutState {
    const accelerator = resolveLauncherShortcut(this.args.platform)
    if (this.disposed) {
      this.shortcutState = Object.freeze({
        accelerator,
        message: DISPOSED_SHORTCUT_MESSAGE,
        status: 'unavailable',
      })
      return this.shortcutState
    }
    if (this.ownsShortcut) return this.shortcutState

    let registered = false
    try {
      registered = this.args.globalShortcut.register(accelerator, () => {
        if (this.disposed) return
        void this.toggle().catch(() => {})
      })
    } catch {
      registered = false
    }
    this.ownsShortcut = registered
    this.shortcutState = Object.freeze({
      accelerator,
      message: registered
        ? null
        : `${accelerator} is unavailable. Use the TockLauncher button in the TockTeam titlebar.`,
      status: registered ? 'registered' : 'unavailable',
    })
    return this.shortcutState
  }

  getState(): DesktopLauncherState {
    const window = this.liveWindow()
    return Object.freeze({
      shortcut: this.shortcutState,
      visible: window?.isVisible() === true,
    })
  }

  async show(): Promise<void> {
    this.assertUsable()
    const window = await this.getOrCreateWindow()
    this.assertUsable()
    if (this.window !== window || window.isDestroyed()) {
      throw new Error('Launcher window is unavailable')
    }
    window.setBounds(resolveLauncherBounds(this.args.getDisplayWorkArea()))
    window.show()
    window.focus()
  }

  toggle(): Promise<void> {
    const operation = this.togglePromise.then(async () => {
      this.assertUsable()
      const currentWindow = this.liveWindow()
      if (currentWindow?.isVisible()) {
        this.hide()
        return
      }
      await this.show()
    })
    this.togglePromise = operation.catch(() => {})
    return operation
  }

  hide(): void {
    this.liveWindow()?.hide()
  }

  /** Destroy the overlay while retaining the app-lifetime shortcut registration. */
  destroyWindow(): void {
    const window = this.window
    if (window === null) return
    this.clearWindow(window)
    if (!window.isDestroyed()) window.destroy()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.ownsShortcut) {
      this.args.globalShortcut.unregister(this.shortcutState.accelerator)
      this.ownsShortcut = false
    }
    this.destroyWindow()
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Launcher controller is disposed')
  }

  private liveWindow(): LauncherOverlayWindow | null {
    if (this.window?.isDestroyed()) {
      this.clearWindow(this.window)
    }
    return this.window
  }

  private shouldHideOn(reason: string): boolean {
    return (this.args.getHideWindowOn?.() ?? DEFAULT_HIDE_WINDOW_ON).includes(reason)
  }

  private applyWorkspaceVisibility(window: LauncherOverlayWindow): void {
    window.setVisibleOnAllWorkspaces(
      this.windowPreferences.visibleOnAllWorkspaces,
      this.windowPreferences.visibleOnAllWorkspaces && this.args.platform === 'darwin'
        ? { skipTransformProcessType: true, visibleOnFullScreen: true }
        : undefined,
    )
  }

  private attachWindow(window: LauncherOverlayWindow): void {
    window.once('closed', () => { this.clearWindow(window) })
    window.on('blur', () => {
      if (!this.disposed && this.shouldHideOn('blur')) this.hide()
    })
    window.webContents.on('before-input-event', (...args: any[]) => {
      const event = args[0] as LauncherInputEvent | undefined
      const input = args[1] as LauncherInput | undefined
      if (!this.disposed && event !== undefined && input !== undefined
        && (input.type === 'keyDown' || input.type === 'rawKeyDown')
        && input.key === 'Escape'
        && this.shouldHideOn('escapePressed')) {
        event.preventDefault()
        this.hide()
      }
    })
    window.webContents.on('destroyed', () => { this.clearWindow(window) })
    window.webContents.on('render-process-gone', () => {
      if (this.window !== window) return
      this.clearWindow(window)
      if (!window.isDestroyed()) window.destroy()
    })
  }

  private clearWindow(window: LauncherOverlayWindow): void {
    if (this.window !== window) return
    this.window = null
    const dispose = this.windowDisposer
    this.windowDisposer = undefined
    dispose?.()
    const pendingLoad = this.pendingLoad
    if (pendingLoad?.window === window) {
      this.pendingLoad = undefined
      pendingLoad.reject(new Error('Launcher window was destroyed while loading'))
    }
  }

  private async getOrCreateWindow(): Promise<LauncherOverlayWindow> {
    if (this.windowPromise !== null) return await this.windowPromise
    const currentWindow = this.liveWindow()
    if (currentWindow !== null) return currentWindow

    const promise = (async (): Promise<LauncherOverlayWindow> => {
      this.assertUsable()
      const window = this.args.createWindow()
      try {
        window.setAlwaysOnTop(this.windowPreferences.alwaysOnTop)
        this.applyWorkspaceVisibility(window)
        this.window = window
        this.windowDisposer = this.args.registerWindow('launcher', window) ?? undefined
        this.attachWindow(window)
        let rejectLoad!: (error: Error) => void
        const loadFailure = new Promise<never>((_resolve, reject) => {
          rejectLoad = reject
        })
        this.pendingLoad = { window, reject: rejectLoad }
        try {
          await Promise.race([this.args.loadWindow(window), loadFailure])
        } finally {
          if (this.pendingLoad?.window === window) this.pendingLoad = undefined
        }
        this.assertUsable()
        if (this.window !== window || window.isDestroyed()) {
          throw new Error('Launcher window was destroyed while loading')
        }
        return window
      } catch (error) {
        this.clearWindow(window)
        if (!window.isDestroyed()) window.destroy()
        throw error
      }
    })()
    this.windowPromise = promise
    try {
      return await promise
    } finally {
      if (this.windowPromise === promise) this.windowPromise = null
    }
  }
}
