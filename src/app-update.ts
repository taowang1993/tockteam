import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  createDisabledDesktopAppUpdateState,
  type DesktopAppUpdateActionResult,
  type DesktopAppUpdateErrorContext,
  type DesktopAppUpdateState,
} from './desktop-app-update.ts'

export type DesktopUpdateApp = Readonly<{
  getVersion: () => string
  isPackaged: boolean
  getPath?: (name: string) => string
  resourcesPath?: string
}>

export type AutoUpdaterPort = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  channel: string
  allowPrerelease: boolean
  allowDowngrade: boolean
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  on: (event: AutoUpdaterEvent, listener: (...args: any[]) => void) => unknown
  removeListener?: (event: AutoUpdaterEvent, listener: (...args: any[]) => void) => unknown
}

export type AutoUpdaterEvent =
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

export type DesktopAppUpdater = Readonly<{
  getState: () => DesktopAppUpdateState
  check: () => Promise<DesktopAppUpdateActionResult>
  download: () => Promise<DesktopAppUpdateActionResult>
  install: () => Promise<DesktopAppUpdateActionResult>
  onStateChange: (listener: (state: DesktopAppUpdateState) => void) => () => void
  start: () => void
  dispose: () => void
}>

const STARTUP_DELAY_MS = 15_000
const POLL_INTERVAL_MS = 4 * 60 * 1_000
const MAX_TEXT = 2_048

type UpdaterFactory = () => AutoUpdaterPort | Promise<AutoUpdaterPort>

type UpdateInfo = Readonly<{ version?: unknown }>
type DownloadProgress = Readonly<{ percent?: unknown }>

function boundedText(value: unknown): string {
  return (typeof value === 'string' ? value : String(value)).slice(0, MAX_TEXT)
}

function versionOf(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'object' || value === null) return fallback
  const version = (value as UpdateInfo).version
  return typeof version === 'string' && version.length <= MAX_TEXT ? version : fallback
}

function resourcesPathOf(app: DesktopUpdateApp): string {
  if (typeof app.resourcesPath === 'string') return app.resourcesPath
  const candidate = (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath
  return typeof candidate === 'string' ? candidate : ''
}

function initialState(app: DesktopUpdateApp): DesktopAppUpdateState {
  const version = boundedText(app.getVersion())
  if (!app.isPackaged) {
    return createDisabledDesktopAppUpdateState(
      version,
      'Automatic updates are only available in packaged production builds.',
    )
  }
  const resources = resourcesPathOf(app)
  if (resources.length === 0 || !existsSync(join(resources, 'app-update.yml'))) {
    return createDisabledDesktopAppUpdateState(
      version,
      'Automatic updates are not configured for this build.',
    )
  }
  return Object.freeze({
    channel: 'stable',
    enabled: true,
    status: 'idle',
    currentVersion: version,
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    message: null,
    errorContext: null,
    checkedAt: null,
    canRetry: true,
  })
}

function actionResult(
  accepted: boolean,
  completed: boolean,
  state: DesktopAppUpdateState,
): DesktopAppUpdateActionResult {
  return Object.freeze({ accepted, completed, state })
}

/**
 * Main-owned updater state machine. The default adapter is loaded only after
 * a packaged build proves that app-update.yml exists, so development builds
 * cannot make update requests merely by creating this owner.
 */
export function createDesktopAppUpdater(args: Readonly<{
  app: DesktopUpdateApp
  updater?: AutoUpdaterPort
  /** Compatibility name for tests/adapters that mirror electron-updater. */
  autoUpdater?: AutoUpdaterPort
  updaterFactory?: UpdaterFactory
  onStateChange?: (state: DesktopAppUpdateState) => void
  prepareInstall?: () => Promise<void>
  recoverInstallFailure?: () => Promise<void>
  startupDelayMs?: number
  pollIntervalMs?: number
  now?: () => Date
}>): DesktopAppUpdater {
  let state = initialState(args.app)
  let adapter: AutoUpdaterPort | undefined = args.updater ?? args.autoUpdater
  let adapterPromise: Promise<AutoUpdaterPort> | undefined
  let activeAction: 'check' | 'download' | 'install' | null = null
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let started = false
  let disposed = false
  const listeners = new Set<(state: DesktopAppUpdateState) => void>()
  const adapterListeners: Array<{ event: AutoUpdaterEvent; listener: (...args: any[]) => void }> = []
  const now = args.now ?? (() => new Date())

  const emit = (): void => {
    args.onStateChange?.(state)
    for (const listener of listeners) listener(state)
  }

  const setState = (next: DesktopAppUpdateState): DesktopAppUpdateState => {
    state = Object.freeze(next)
    emit()
    return state
  }

  const setError = (
    error: unknown,
    context: DesktopAppUpdateErrorContext,
  ): DesktopAppUpdateState => setState({
    ...state,
    status: 'error',
    message: boundedText(error instanceof Error ? error.message : error),
    errorContext: context,
    checkedAt: context === 'check' ? now().toISOString() : state.checkedAt,
    canRetry: true,
  })

  const configure = (target: AutoUpdaterPort): void => {
    target.autoDownload = false
    target.autoInstallOnAppQuit = false
    target.channel = 'latest'
    target.allowPrerelease = false
    target.allowDowngrade = false
  }

  const attach = (target: AutoUpdaterPort): void => {
    configure(target)
    const bind = (event: AutoUpdaterEvent, listener: (...args: any[]) => void): void => {
      target.on(event, listener)
      adapterListeners.push({ event, listener })
    }
    bind('update-available', (info: UpdateInfo) => {
      if (disposed) return
      activeAction = null
      setState({
        ...state,
        enabled: true,
        status: 'available',
        availableVersion: versionOf(info, state.availableVersion),
        downloadedVersion: null,
        downloadPercent: null,
        message: null,
        errorContext: null,
        checkedAt: now().toISOString(),
        canRetry: true,
      })
    })
    bind('update-not-available', () => {
      if (disposed) return
      activeAction = null
      setState({
        ...state,
        status: 'idle',
        availableVersion: null,
        downloadedVersion: null,
        downloadPercent: null,
        message: null,
        errorContext: null,
        checkedAt: now().toISOString(),
        canRetry: true,
      })
    })
    bind('download-progress', (progress: DownloadProgress) => {
      if (disposed) return
      const raw = progress?.percent
      const percent = typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(0, Math.min(100, raw))
        : state.downloadPercent
      setState({
        ...state,
        status: 'downloading',
        downloadPercent: percent,
        message: null,
        errorContext: null,
        canRetry: false,
      })
    })
    bind('update-downloaded', (info: UpdateInfo) => {
      if (disposed) return
      activeAction = null
      const version = versionOf(info, state.availableVersion)
      setState({
        ...state,
        status: 'downloaded',
        availableVersion: version,
        downloadedVersion: version,
        downloadPercent: 100,
        message: null,
        errorContext: null,
        canRetry: true,
      })
    })
    bind('error', (error: unknown) => {
      if (disposed) return
      const context = activeAction === 'check' || activeAction === 'download' || activeAction === 'install'
        ? activeAction
        : null
      activeAction = null
      setError(error, context)
    })
  }

  if (adapter !== undefined) attach(adapter)

  const loadAdapter = async (): Promise<AutoUpdaterPort> => {
    if (adapter !== undefined) return adapter
    if (adapterPromise !== undefined) return await adapterPromise
    const factory = args.updaterFactory ?? (async () => {
      const moduleName = 'electron-updater'
      const module = await import(moduleName) as { autoUpdater?: AutoUpdaterPort }
      if (module.autoUpdater === undefined) throw new Error('electron-updater is unavailable')
      return module.autoUpdater
    })
    adapterPromise = Promise.resolve(factory()).then(target => {
      if (disposed) throw new Error('Desktop updater is disposed')
      adapter = target
      attach(target)
      return target
    }).finally(() => { adapterPromise = undefined })
    return await adapterPromise
  }

  const check = async (): Promise<DesktopAppUpdateActionResult> => {
    if (disposed || !state.enabled || activeAction !== null || state.status === 'downloaded') {
      return actionResult(false, false, state)
    }
    activeAction = 'check'
    setState({
      ...state,
      status: 'checking',
      downloadPercent: null,
      message: null,
      errorContext: null,
      canRetry: false,
    })
    try {
      const target = await loadAdapter()
      await target.checkForUpdates()
      if (state.status === 'checking') {
        setState({
          ...state,
          status: 'idle',
          checkedAt: now().toISOString(),
          canRetry: true,
        })
      }
      return actionResult(true, true, state)
    } catch (error) {
      return actionResult(true, false, setError(error, 'check'))
    } finally {
      if (activeAction === 'check') activeAction = null
    }
  }

  const download = async (): Promise<DesktopAppUpdateActionResult> => {
    const canDownload = state.status === 'available'
      || (state.status === 'error' && state.errorContext === 'download' && state.availableVersion !== null)
    if (disposed || !state.enabled || !canDownload || activeAction !== null) {
      return actionResult(false, false, state)
    }
    activeAction = 'download'
    setState({
      ...state,
      status: 'downloading',
      downloadPercent: 0,
      message: null,
      errorContext: null,
      canRetry: false,
    })
    try {
      const target = await loadAdapter()
      await target.downloadUpdate()
      return actionResult(true, true, state)
    } catch (error) {
      return actionResult(true, false, setError(error, 'download'))
    } finally {
      if (activeAction === 'download') activeAction = null
    }
  }

  const install = async (): Promise<DesktopAppUpdateActionResult> => {
    const canInstall = state.status === 'downloaded'
      || (state.status === 'error' && state.errorContext === 'install' && state.downloadedVersion !== null)
    if (disposed || !state.enabled || !canInstall || activeAction !== null) {
      return actionResult(false, false, state)
    }
    activeAction = 'install'
    try {
      const target = await loadAdapter()
      await args.prepareInstall?.()
      target.quitAndInstall(true, true)
      return actionResult(true, false, state)
    } catch (error) {
      try { await args.recoverInstallFailure?.() } catch { /* retain the original retryable error */ }
      return actionResult(true, false, setError(error, 'install'))
    } finally {
      if (activeAction === 'install') activeAction = null
    }
  }

  const start = (): void => {
    if (disposed || started || !state.enabled) return
    started = true
    const startupDelay = args.startupDelayMs ?? STARTUP_DELAY_MS
    const pollInterval = args.pollIntervalMs ?? POLL_INTERVAL_MS
    startupTimer = setTimeout(() => { void check() }, startupDelay)
    ;(startupTimer as unknown as { unref?: () => void }).unref?.()
    pollTimer = setInterval(() => { void check() }, pollInterval)
    ;(pollTimer as unknown as { unref?: () => void }).unref?.()
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    if (startupTimer !== undefined) clearTimeout(startupTimer)
    if (pollTimer !== undefined) clearInterval(pollTimer)
    startupTimer = undefined
    pollTimer = undefined
    if (adapter?.removeListener !== undefined) {
      for (const { event, listener } of adapterListeners) adapter.removeListener(event, listener)
    }
    adapterListeners.splice(0)
    listeners.clear()
  }

  const updater: DesktopAppUpdater = {
    getState: () => state,
    check,
    download,
    install,
    onStateChange: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    start,
    dispose,
  }
  return Object.freeze(updater)
}
