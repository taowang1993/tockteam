export type LauncherLifecycleSettings = Readonly<{
  alwaysOnTop: boolean
  hotkeyEnabled: boolean
  showDockIcon: boolean
  showOnStartup: boolean
  showTrayIcon: boolean
  visibleOnAllWorkspaces: boolean
}>

export type LauncherLifecycleSettingReader = (key: string, fallback: unknown) => unknown

const DEFAULT_LIFECYCLE_SETTINGS: LauncherLifecycleSettings = Object.freeze({
  alwaysOnTop: true,
  hotkeyEnabled: true,
  showDockIcon: false,
  showOnStartup: false,
  showTrayIcon: true,
  visibleOnAllWorkspaces: true,
})

function booleanSetting(
  getSetting: LauncherLifecycleSettingReader,
  key: string,
  fallback: boolean,
): boolean {
  try {
    const value = getSetting(key, fallback)
    return typeof value === 'boolean' ? value : fallback
  } catch {
    return fallback
  }
}

export function resolveLauncherLifecycleSettings(
  getSetting: LauncherLifecycleSettingReader,
): LauncherLifecycleSettings {
  return Object.freeze({
    alwaysOnTop: booleanSetting(getSetting, 'window.alwaysOnTop', DEFAULT_LIFECYCLE_SETTINGS.alwaysOnTop),
    hotkeyEnabled: booleanSetting(getSetting, 'general.hotkey.enabled', DEFAULT_LIFECYCLE_SETTINGS.hotkeyEnabled),
    showDockIcon: booleanSetting(getSetting, 'appearance.showAppIconInDock', DEFAULT_LIFECYCLE_SETTINGS.showDockIcon),
    showOnStartup: booleanSetting(getSetting, 'window.showOnStartup', DEFAULT_LIFECYCLE_SETTINGS.showOnStartup),
    showTrayIcon: booleanSetting(getSetting, 'general.tray.showIcon', DEFAULT_LIFECYCLE_SETTINGS.showTrayIcon),
    visibleOnAllWorkspaces: booleanSetting(getSetting, 'window.visibleOnAllWorkspaces', DEFAULT_LIFECYCLE_SETTINGS.visibleOnAllWorkspaces),
  })
}

/** A coalescing queue for startup and pre-ready `--toggle` intents. */
export class LauncherToggleIntentQueue {
  private pending = false

  capture(argv: readonly string[]): boolean {
    if (!argv.includes('--toggle')) return false
    this.pending = true
    return true
  }

  hasPending(): boolean {
    return this.pending
  }

  async drain(toggle: () => Promise<void> | void): Promise<void> {
    if (!this.pending) return
    this.pending = false
    try {
      await toggle()
    } catch (error) {
      this.pending = true
      throw error
    }
  }
}

type LoginItemApp = Readonly<{
  getLoginItemSettings: () => Readonly<{ openAtLogin?: unknown }>
  setLoginItemSettings: (settings: Readonly<{ openAtLogin: boolean }>) => void
}>

export function readLaunchOnStart(app: Pick<LoginItemApp, 'getLoginItemSettings'>): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin === true
  } catch {
    return false
  }
}

export function setLaunchOnStart(app: LoginItemApp, enabled: boolean): boolean {
  if (typeof enabled !== 'boolean') throw new Error('Launch on Start must be a boolean')
  app.setLoginItemSettings({ openAtLogin: enabled })
  return readLaunchOnStart(app)
}

export function attemptSecureRelaunch(args: Readonly<{
  relaunch: () => void
  report: (error: unknown) => void
  requestQuit: () => void
}>): boolean {
  try {
    args.relaunch()
  } catch (error) {
    args.report(error)
    return false
  }
  args.requestQuit()
  return true
}

/** Owns one native tray and never destroys a tray it did not create. */
export class SingleOwnedTray<TTray extends Readonly<{
  destroy: () => void
  isDestroyed: () => boolean
}>> {
  private tray: TTray | null = null
  private readonly createTray: () => TTray

  constructor(createTray: () => TTray) {
    this.createTray = createTray
  }

  setVisible(visible: boolean): void {
    if (this.tray?.isDestroyed() === true) this.tray = null
    if (visible) {
      this.tray ??= this.createTray()
      return
    }
    this.tray?.destroy()
    this.tray = null
  }

  dispose(): void {
    this.setVisible(false)
  }
}

type LauncherLifecycleOverlay = Readonly<{
  applyWindowPreferences: (preferences: Readonly<{
    alwaysOnTop: boolean
    visibleOnAllWorkspaces: boolean
  }>) => void
  setShortcutEnabled: (enabled: boolean) => void
  show: () => Promise<void>
  toggle: () => Promise<void>
}>

type SettingsOperationResult = Readonly<{ canceled?: boolean; ok: true }>

export type LauncherLifecycleCommand =
  | 'centerWindow'
  | 'disableHotkey'
  | 'enableHotkey'
  | 'openAbout'
  | 'openExtensions'
  | 'openSettings'
  | 'quit'
  | 'rescanExtensions'
  | 'show'

export class LauncherLifecycleController {
  private settings: LauncherLifecycleSettings | null = null
  private startupDecisionMade = false
  private ready = false
  private disposed = false
  private updater: Readonly<{ start: () => void; dispose: () => void }> | undefined
  private readonly args: Readonly<{
    getSetting: LauncherLifecycleSettingReader
    openWorkbenchSettings: () => Promise<void> | void
    overlay: LauncherLifecycleOverlay
    queue: LauncherToggleIntentQueue
    queueSecureRelaunch?: (reason: 'launcher-settings-import' | 'launcher-settings-reset') => void
    requestSecureQuit: (reason: 'launcher-command-quit') => void
    rescan: (signal?: AbortSignal) => Promise<unknown>
    setDockVisible: (visible: boolean) => Promise<void> | void
    setTrayVisible: (visible: boolean) => void
    updateSetting: (key: string, value: unknown, signal?: AbortSignal) => Promise<void>
  }>

  constructor(args: Readonly<{
    getSetting: LauncherLifecycleSettingReader
    openWorkbenchSettings: () => Promise<void> | void
    overlay: LauncherLifecycleOverlay
    queue: LauncherToggleIntentQueue
    queueSecureRelaunch?: (reason: 'launcher-settings-import' | 'launcher-settings-reset') => void
    requestSecureQuit: (reason: 'launcher-command-quit') => void
    rescan: (signal?: AbortSignal) => Promise<unknown>
    setDockVisible: (visible: boolean) => Promise<void> | void
    setTrayVisible: (visible: boolean) => void
    updateSetting: (key: string, value: unknown, signal?: AbortSignal) => Promise<void>
  }>) {
    this.args = args
  }

  get isReady(): boolean {
    return this.ready
  }

  get resolvedSettings(): LauncherLifecycleSettings | null {
    return this.settings
  }

  attachUpdater(updater: Readonly<{ start: () => void; dispose: () => void }>): void {
    if (this.disposed) {
      updater.dispose()
      return
    }
    this.updater?.dispose()
    this.updater = updater
    updater.start()
  }

  async sync(): Promise<LauncherLifecycleSettings> {
    if (this.disposed) throw new Error('Launcher lifecycle controller is disposed')
    const settings = resolveLauncherLifecycleSettings(this.args.getSetting)
    this.settings = settings
    try { await this.args.setDockVisible(settings.showDockIcon) } catch { /* native effect is optional */ }
    try { this.args.setTrayVisible(settings.showTrayIcon) } catch { /* native effect is optional */ }
    this.args.overlay.setShortcutEnabled(settings.hotkeyEnabled)
    this.args.overlay.applyWindowPreferences({
      alwaysOnTop: settings.alwaysOnTop,
      visibleOnAllWorkspaces: settings.visibleOnAllWorkspaces,
    })
    return settings
  }

  captureToggle(argv: readonly string[]): boolean {
    return this.args.queue.capture(argv)
  }

  async markReady(): Promise<void> {
    if (this.disposed || this.startupDecisionMade) return
    const settings = this.settings ?? await this.sync()
    this.ready = true
    if (settings.showOnStartup) await this.args.overlay.show()
    await this.args.queue.drain(() => this.args.overlay.toggle())
    if (this.args.queue.hasPending()) return
    this.startupDecisionMade = true
  }

  async handleSecondInstance(argv: readonly string[], activateWorkbench: () => void): Promise<void> {
    if (this.disposed) return
    if (argv.includes('--toggle')) {
      if (!this.ready) {
        this.args.queue.capture(argv)
        return
      }
      await this.args.overlay.toggle()
      return
    }
    activateWorkbench()
  }

  async invokeCommand(command: LauncherLifecycleCommand, signal?: AbortSignal): Promise<void> {
    const check = (): void => {
      if (this.disposed) throw new Error('Launcher lifecycle controller is disposed')
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('TockLauncher lifecycle command canceled')
    }
    check()
    switch (command) {
      case 'centerWindow':
      case 'show':
        await this.args.overlay.show()
        check()
        return
      case 'disableHotkey':
      case 'enableHotkey': {
        const enabled = command === 'enableHotkey'
        await this.args.updateSetting('general.hotkey.enabled', enabled, signal)
        check()
        this.args.overlay.setShortcutEnabled(enabled)
        return
      }
      case 'openAbout':
      case 'openExtensions':
      case 'openSettings':
        await this.args.openWorkbenchSettings()
        check()
        return
      case 'rescanExtensions':
        await this.args.rescan(signal)
        check()
        return
      case 'quit':
        check()
        this.args.requestSecureQuit('launcher-command-quit')
        return
    }
  }

  async mutateSettingsAndRelaunch<T extends SettingsOperationResult>(
    reason: 'launcher-settings-import' | 'launcher-settings-reset',
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = await operation()
    if (!result.canceled) {
      await this.sync()
      this.args.queueSecureRelaunch?.(reason)
    }
    return result
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.ready = false
    this.updater?.dispose()
    this.updater = undefined
    this.args.setTrayVisible(false)
  }
}
