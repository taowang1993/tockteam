import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  screen,
  session,
  safeStorage,
  shell,
  systemPreferences,
  Tray,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents,
} from 'electron'
import { createWriteStream, existsSync, mkdirSync, realpathSync, statSync, type WriteStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PluginMarketplaceManager } from '../plugins/plugin-marketplace/src/host/transaction-manager.ts'
import {
  MARKETPLACE_AGENT_TOKEN_ENV,
  MARKETPLACE_AGENT_URL_ENV,
  startMarketplaceAgentGateway,
  type MarketplaceAgentGateway,
} from '../plugins/plugin-marketplace/src/host/agent-gateway.ts'
import {
  findGitHubCli,
  previewRuntimeBaseEnvironment,
  previewSandboxLauncher,
  ProductionMarketplacePlatform,
  withGitHubCredentials,
} from '../plugins/plugin-marketplace/src/host/platform.ts'
import { parseMarketplaceCommand } from '../plugins/plugin-marketplace/src/protocol.ts'
import type { DesktopCommand, DesktopInfo, DesktopRuntimeSnapshot } from './contracts.ts'
import { DesktopCallerAuthorizations, resolveDesktopCallerAuthorizationRequest } from './desktop-caller-authorization.ts'
import { DesktopCallerChannel } from './desktop-caller-channel.ts'
import { isAllowedBrowserNavigation, isAllowedRuntimeNavigation } from './desktop-navigation.ts'
import type {
  DesktopDispatchCompletionRequest,
  DesktopDispatchEvent,
} from './host-contract.ts'
import { allowsRuntimeClipboardWrite, allowsRuntimeMicrophone, allowsTrustedMainIpc, originOf } from './permissions.ts'
import { BUNDLED_DESKTOP_PLUGINS, DESKTOP_PROFILE, ensureDesktopProfile } from './profile.ts'
import {
  WEB_CLIP_GUEST_ARGUMENT,
  WebClipFrameAuthorizations,
  isWebClipPartition,
  shouldReportBlockedWebClipRequest,
  stripWebClipRequestHeaders,
  stripWebClipResponseHeaders,
} from './web-clip-frame.ts'
import { DshRuntimeSupervisor, runDshCommand, type DshRuntimeOptions, type RuntimeExit } from './runtime.ts'
import { DesktopDispatchChannel } from './desktop-dispatch-channel.ts'
import { isTockTutorProtocol, parseSingleInstanceProtocolUrls, resolveTockTutorProtocolRequest } from './desktop-native-policy.ts'
import { scrubDesktopAuthorityEnvironment } from './desktop-runtime-environment.ts'
import { DesktopMicrophoneChannel } from './desktop-microphone-channel.ts'
import { DesktopPopOutChannel } from './desktop-popout-channel.ts'
import { DesktopPrintExportChannel } from './desktop-print-export-channel.ts'
import { DesktopPrintExportOwner } from './desktop-print-export-owner.ts'
import { DesktopPopOutOwner } from './desktop-popout-owner.ts'
import { DesktopMicrophoneOwner } from './desktop-microphone-owner.ts'
import { DesktopPickerChannel } from './desktop-picker-channel.ts'
import { DesktopPickerOwner, type DesktopPickerDialogOptions } from './desktop-picker-owner.ts'
import { DesktopRevealChannel } from './desktop-reveal-channel.ts'
import { performDesktopReveal } from './desktop-reveal-native.ts'
import {
  bundledRuntimePaths,
  resolveRuntimeResourcesRoot,
  runtimeSearchPath,
  type BundledRuntimePaths,
} from './runtime-paths.ts'
import { resolveProductVersion } from './version.ts'
import {
  LAUNCHER_ROLE,
  LAUNCHER_SESSION_PARTITION,
  applyLauncherSessionPolicy,
  createLauncherIpcGuard,
  createLauncherUrlPolicy,
  createLauncherWebPreferences,
  type LauncherUrlPolicy,
} from './launcher-security.ts'
import { LauncherActionStore } from './launcher-actions.ts'
import { createLauncherDiscoveryExtensions } from './launcher-discovery-extensions.ts'
import { createLauncherDiscoveryScanners, launcherNodeSqliteAvailable } from './launcher-discovery-scanners.ts'
import { createLauncherFileSearchExtensions } from './launcher-file-search.ts'
import { createLauncherFileSearchScanners } from './launcher-file-search-scanners.ts'
import { createLauncherNetworkExtensions } from './launcher-network-extensions.ts'
import { createLauncherOsExtensions } from './launcher-os-extensions.ts'
import {
  emptyLauncherLinuxTrash,
  resolveAppearanceInvocation,
  resolveSystemCommandInvocation,
  resolveWindowsControlPanelInvocation,
  resolveWindowsControlPanelScanInvocation,
  parseWindowsControlPanelItems,
} from './launcher-os-process.ts'
import { MACOS_SYSTEM_SETTINGS, WINDOWS_SYSTEM_SETTINGS } from './launcher-os-catalog.ts'
import {
  launchDetachedLauncherExecutable,
  revalidateLauncherExecutable,
  revalidateLauncherPath,
  revalidateLauncherUrl,
  revalidateLauncherVscodeUri,
  resolveLinuxDesktopEntryInvocation,
  resolveWindowsApplicationElevationInvocation,
  revalidateLauncherWindowsStoreId,
  statLauncherPathIdentity,
} from './launcher-discovery-process.ts'
import { LauncherPersistenceRepository, createLauncherSecretCodec } from './launcher-persistence.ts'
import { LauncherCustomBrowserController } from './launcher-custom-browser.ts'
import { resolveLauncherSettingDefault } from './launcher-settings-defaults.ts'
import { createLauncherSettingsOperations } from './launcher-settings-operations.ts'
import { assertNoLauncherIpcArguments } from './launcher-window-contract.ts'
import { createLauncherCoreSearch } from './launcher-core-search.ts'
import { createLauncherLocalExtensions, resolveLauncherEnabledExtensionIds } from './launcher-local-extensions.ts'
import { LAUNCHER_LOCAL_EXTENSION_DEFAULTS, LAUNCHER_LOCAL_EXTENSION_IDS } from './launcher-local-extension-config.ts'
import type { LauncherLocalExtensionSettings } from './launcher-local-extension-contract.ts'
import { isLauncherRendererSettingValue } from './launcher-settings-contract.ts'
import { registerLauncherIpcHandlers } from './launcher-ipc.ts'
import {
  executeTockTeamDestination,
  createTockTeamDestinationResults,
} from './launcher-specialists.ts'
import { LauncherOverlayController } from './launcher-window-controller.ts'
import {
  registerLauncherWindowIpcHandlers,
  registerWorkbenchLauncherIpcHandlers,
} from './launcher-window-ipc.ts'
import { LauncherWindowRegistry, type LauncherRegistryWindow } from './launcher-window-registry.ts'
import {
  createLauncherWorkbenchCommandDelivery,
  createLauncherWorkbenchRouteDelivery,
  dispatchLauncherRouteToWorkbench,
} from './launcher-workbench-navigation.ts'
import {
  LAUNCHER_WORKBENCH_ROUTE_CHANNEL,
  parseLauncherDestination,
  parseLauncherWorkbenchRoute,
  type LauncherWorkbenchRoute,
  type TockTeamDestination,
} from './launcher-navigation.ts'
import {
  attemptSecureRelaunch,
  LauncherLifecycleController,
  LauncherToggleIntentQueue,
  SingleOwnedTray,
  readLaunchOnStart,
  setLaunchOnStart,
} from './launcher-lifecycle.ts'
import { createLauncherThemeProjector } from './launcher-theme.ts'
import {
  DESKTOP_APP_UPDATE_CHANNELS,
  parseDesktopAppUpdateActionResult,
  parseDesktopAppUpdateState,
} from './desktop-app-update.ts'
import { createDesktopAppUpdater, type DesktopAppUpdater } from './app-update.ts'
import { RuntimeStartCancelledError, RuntimeStartGate } from './runtime-start-gate.ts'
import {
  handleUnexpectedRuntimeExit,
  stopLiveRuntimeForMarketplace,
} from './runtime-lifecycle.ts'

const PRODUCT_NAME = 'TockTeam Desktop'
const DATA_DIRECTORY = 'TockTeam-Desktop'
const DEFAULT_UI_ZOOM_FACTOR = 1.12
const currentDir = dirname(fileURLToPath(import.meta.url))
const PRODUCT_VERSION = resolveProductVersion(join(currentDir, '..'))
const splashPath = join(currentDir, 'splash.html')
const preloadPath = join(currentDir, 'preload.cjs')
const launcherHtmlPath = join(currentDir, 'launcher.html')
const launcherNetworkFixtureEnabled = !app.isPackaged && process.env.TOCKTEAM_NETWORK_FIXTURE === '1'

function launcherNetworkFixtureResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status: 200, ...init })
}

async function launcherNetworkFixtureFetch(url: string, init?: RequestInit): Promise<Response> {
  const parsed = new URL(url)
  if (parsed.origin === 'https://cdn.jsdelivr.net' && parsed.pathname.startsWith('/npm/@fawazahmed0/currency-api@latest/v1/currencies/')) {
    const currency = parsed.pathname.split('/').pop()?.replace(/\.json$/u, '') ?? 'usd'
    return launcherNetworkFixtureResponse({ [currency]: { eur: currency === 'usd' ? 0.9 : 1, usd: currency === 'eur' ? 1.1 : 1, chf: 0.8 } })
  }
  if (parsed.origin === 'https://api-free.deepl.com' && parsed.pathname === '/v2/translate' && init?.method === 'POST') {
    return launcherNetworkFixtureResponse({ translations: [{ text: 'Fixture translation' }] })
  }
  if (parsed.origin === 'https://www.google.com' && parsed.pathname === '/complete/search') {
    if (parsed.searchParams.get('q') === 'error') return launcherNetworkFixtureResponse({ error: 'fixture' }, { status: 503 })
    return launcherNetworkFixtureResponse(['fixture', ['fixture latest']])
  }
  throw new Error('Unexpected launcher network fixture URL')
}

let mainWindow: BrowserWindow | undefined
let runtime: DshRuntimeSupervisor | undefined
let runtimeUrl: URL | undefined
let runtimeOrigin: string | undefined
let previewRuntime: DshRuntimeSupervisor | undefined
let previewWindow: BrowserWindow | undefined
let previewUrl: URL | undefined
let previewOrigin: string | undefined
let previewIdentity: { pluginId: string; transactionId: string } | undefined
let marketplace: PluginMarketplaceManager | undefined
let marketplaceAgentGateway: MarketplaceAgentGateway | undefined
let logStream: WriteStream | undefined
let quitting = false
let transitioning = false
let queuedPaths: string[] = []
let queuedProtocolUrls: string[] = []
let tockTutorPreviousThemeSource: 'system' | 'light' | 'dark' | undefined
let launcherController: LauncherOverlayController | undefined
let launcherLifecycle: LauncherLifecycleController | undefined
let launcherUpdater: DesktopAppUpdater | undefined
let launcherIpcDisposer: (() => void) | undefined
let workbenchLauncherIpcDisposer: (() => void) | undefined
let secureTeardownPromise: Promise<void> | undefined
let launcherUpdaterRuntimeWasActive = false
let launcherRescan: (() => Promise<unknown>) | undefined
let launcherCoreFlush: (() => Promise<void>) | undefined
let launcherPersistence: LauncherPersistenceRepository | undefined
let launcherCustomBrowser: LauncherCustomBrowserController | undefined
let launcherNetwork: ReturnType<typeof createLauncherNetworkExtensions> | undefined
let launcherOs: ReturnType<typeof createLauncherOsExtensions> | undefined
let launcherPersistentSetsSync: (() => void) | undefined
const launcherSettingsOperations = createLauncherSettingsOperations({ isUnavailable: () => quitting })
const runtimeStartGate = new RuntimeStartGate<void>()
const launcherWindowRegistry = new LauncherWindowRegistry()
const execFileAsync = promisify(execFile)
const launcherToggleQueue = new LauncherToggleIntentQueue()
let launcherTrayOwner: SingleOwnedTray<Tray> | undefined
const launcherThemeProjector = createLauncherThemeProjector()
const workbenchRouteDelivery = createLauncherWorkbenchRouteDelivery<BrowserWindow>((window: BrowserWindow, route: LauncherWorkbenchRoute) => {
  window.webContents.send(LAUNCHER_WORKBENCH_ROUTE_CHANNEL, route)
})
const workbenchCommandDelivery = createLauncherWorkbenchCommandDelivery<BrowserWindow, DesktopCommand>((window, command) => {
  window.webContents.send('desktop:command', command)
})
const commandsBeforeWorkbenchWindow: DesktopCommand[] = []
let routeBeforeWorkbenchWindow: LauncherWorkbenchRoute | undefined
let currentWorkbenchDestination: TockTeamDestination = 'tockcoder'
let workbenchGeneration = 0
let workbenchReadyGeneration = -1
const logTail: string[] = []
const desktopCallerAuthorizations = new DesktopCallerAuthorizations()
const webClipFrames = new WebClipFrameAuthorizations()
const webClipSessions = new WeakSet<Session>()
const desktopRevealChannel = new DesktopRevealChannel({
  isAvailable: () => isEligibleDesktopRevealWindow(),
  onReveal: async (input, signal) => await performDesktopReveal(input, {
    isAvailable: () => isEligibleDesktopRevealWindow(),
    lstat: async path => await lstat(path, { bigint: true }),
    realpath: async path => await realpath(path),
    reveal: path => { shell.showItemInFolder(path) },
  }, signal),
})

function pickerDialogTitle(options: DesktopPickerDialogOptions): string {
  if (options.kind === 'save') return options.purpose === 'export-pdf' ? '导出 PDF' : '导出 HTML'
  if (options.purpose === 'activate') return '选择笔记库'
  if (options.purpose === 'vault-backup') return '选择备份目录'
  return '选择导入源'
}

function pickerDialogFilters(options: DesktopPickerDialogOptions): Electron.FileFilter[] {
  return options.extensions.length === 0
    ? []
    : [{ name: options.extensions.map(extension => `.${extension}`).join(', '), extensions: options.extensions }]
}

function readBoundedDesktopClipboard(): string | null {
  try {
    const text = clipboard.readText()
    return text.length <= 4_096 ? text : null
  } catch {
    return null
  }
}

function canonicalDesktopProtocolPath(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    try {
      return join(realpathSync.native(dirname(path)), basename(path))
    } catch {
      return resolve(path)
    }
  }
}

function printDocument(title: string, html: string): string {
  const escapedTitle = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'none'; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'"><title>${escapedTitle}</title></head><body>${html}</body></html>`
}

async function withPrintRenderer<Result>(
  title: string,
  html: string,
  render: (window: BrowserWindow) => Promise<Result>,
): Promise<Result> {
  const partition = `tockteam-print-${randomBytes(18).toString('base64url')}`
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition,
      sandbox: true,
    },
  })
  const rendererSession = window.webContents.session
  rendererSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  rendererSession.setPermissionCheckHandler(() => false)
  rendererSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'file://*/*', 'blob:*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }))
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    const document = Buffer.from(printDocument(title, html), 'utf8').toString('base64')
    await window.loadURL(`data:text/html;base64,${document}`)
    return await render(window)
  } finally {
    if (!window.isDestroyed()) window.destroy()
    await Promise.allSettled([rendererSession.clearCache(), rendererSession.clearStorageData()])
  }
}

let desktopPickerOwner!: DesktopPickerOwner
let desktopPickerChannel!: DesktopPickerChannel
let desktopCallerChannel!: DesktopCallerChannel
let desktopDispatchChannel!: DesktopDispatchChannel
let desktopMicrophoneOwner!: DesktopMicrophoneOwner
let desktopMicrophoneChannel!: DesktopMicrophoneChannel
let desktopPopOutOwner!: DesktopPopOutOwner
let desktopPopOutChannel!: DesktopPopOutChannel
let desktopPrintExportOwner!: DesktopPrintExportOwner
let desktopPrintExportChannel!: DesktopPrintExportChannel
const popOutWindows = new Map<string, BrowserWindow>()
const popOutRouteTokens = new Map<string, string>()

interface MainDispatchLease {
  cleanup(): void
  consumerId: string
  deliveryId: string
  frame: Electron.WebFrameMain
  sender: WebContents
}

const mainDispatchLeases = new Map<string, MainDispatchLease>()
const mainDispatchPolls = new Map<string, Set<AbortController>>()

function dispatchConsumerId(sender: WebContents, frame: Electron.WebFrameMain): string {
  return `trusted-main-${String(sender.id)}-${String(frame.processId)}-${String(frame.routingId)}`
}

function releaseMainDispatchLease(operationId: string, rollback: boolean): void {
  const lease = mainDispatchLeases.get(operationId)
  if (lease === undefined) return
  mainDispatchLeases.delete(operationId)
  lease.cleanup()
  if (rollback) desktopDispatchChannel.rollback(operationId, lease.consumerId)
}

function abortMainDispatchConsumer(consumerId: string, rollback: boolean): void {
  const polls = mainDispatchPolls.get(consumerId)
  if (polls !== undefined) {
    mainDispatchPolls.delete(consumerId)
    for (const poll of polls) poll.abort()
  }
  for (const [operationId, lease] of mainDispatchLeases) {
    if (lease.consumerId === consumerId) releaseMainDispatchLease(operationId, rollback)
  }
}

function clearMainDispatchLeases(): void {
  for (const consumerId of [...mainDispatchPolls.keys()]) abortMainDispatchConsumer(consumerId, false)
  for (const operationId of [...mainDispatchLeases.keys()]) releaseMainDispatchLease(operationId, false)
}

function watchMainDispatch(
  sender: WebContents,
  frame: Electron.WebFrameMain,
  lifetime: AbortController,
  getOperationId: () => string | undefined,
): () => void {
  let cleaned = false
  const abort = (): void => {
    if (cleaned) return
    lifetime.abort()
    const operationId = getOperationId()
    if (operationId !== undefined) releaseMainDispatchLease(operationId, true)
  }
  const navigation = (_event: Electron.Event, _url: string, _inPlace: boolean, isMainFrame: boolean): void => {
    if (isMainFrame) abort()
  }
  sender.once('destroyed', abort)
  sender.once('render-process-gone', abort)
  sender.on('did-start-navigation', navigation)
  return () => {
    if (cleaned) return
    cleaned = true
    sender.removeListener('destroyed', abort)
    sender.removeListener('render-process-gone', abort)
    sender.removeListener('did-start-navigation', navigation)
  }
}

async function stopDesktopDispatchChannel(): Promise<void> {
  clearMainDispatchLeases()
  await desktopDispatchChannel.stop()
}

function initializeDesktopPicker(): void {
  desktopPickerOwner = new DesktopPickerOwner({
    recoveryRoot: join(app.getPath('userData'), 'picker-recovery'),
  isAvailable: () => isEligibleDesktopRevealWindow(),
  showOpenDialog: async options => {
    const electronOptions: Electron.OpenDialogOptions = {
      title: pickerDialogTitle(options),
      filters: pickerDialogFilters(options),
      properties: [
        ...(options.file ? ['openFile' as const] : []),
        ...(options.directory ? ['openDirectory' as const, 'createDirectory' as const] : []),
      ],
    }
    const parent = mainWindow
    const result = parent === undefined || parent.isDestroyed()
      ? await dialog.showOpenDialog(electronOptions)
      : await dialog.showOpenDialog(parent, electronOptions)
    const filePath = result.filePaths[0]
    return filePath === undefined
      ? { canceled: result.canceled }
      : { canceled: result.canceled, filePath }
  },
  onVaultTransition: () => { desktopPopOutOwner?.disposeProvider() },
  showSaveDialog: async options => {
    const electronOptions: Electron.SaveDialogOptions = {
      title: pickerDialogTitle(options),
      filters: pickerDialogFilters(options),
    }
    const parent = mainWindow
    const result = parent === undefined || parent.isDestroyed()
      ? await dialog.showSaveDialog(electronOptions)
      : await dialog.showSaveDialog(parent, electronOptions)
    return result.filePath === undefined
      ? { canceled: result.canceled }
      : { canceled: result.canceled, filePath: result.filePath }
  },
  })
  desktopPickerChannel = new DesktopPickerChannel(desktopPickerOwner)
  desktopCallerChannel = new DesktopCallerChannel({
    authorizations: desktopCallerAuthorizations,
    identity: (operationId, requestId, windowId, frameId, channelSessionId) => {
      const window = mainWindow
      if (window === undefined || window.isDestroyed() || String(window.webContents.id) !== windowId
        || dispatchConsumerId(window.webContents, window.webContents.mainFrame) !== frameId) return undefined
      return desktopPickerOwner.nativeIdentity(operationId, requestId, windowId, channelSessionId)
    },
  })
  desktopDispatchChannel = new DesktopDispatchChannel({
    identity: (operationId, requestId, channelSessionId) => {
      if (mainWindow === undefined || mainWindow.isDestroyed()) return undefined
      return desktopPickerOwner.nativeIdentity(
        operationId,
        requestId,
        String(mainWindow.webContents.id),
        channelSessionId,
      )
    },
    isAvailable: () => isEligibleDesktopRevealWindow(),
    onCallback: (url) => { void shell.openExternal(url) },
    resolveProtocol: request => {
      const records = desktopPickerOwner.protocolVaults()
      const active = records.find(record => {
        const snapshot = desktopPickerOwner.nativeVaultSnapshot()
        return record.id === snapshot.id && record.generation === snapshot.generation
      })
      return resolveTockTutorProtocolRequest(
        request,
        records,
        active,
        request.clipboard === true ? readBoundedDesktopClipboard() : undefined,
        canonicalDesktopProtocolPath,
      )
    },
    onDeliveryExpired: (operationId, consumerId) => {
      const lease = mainDispatchLeases.get(operationId)
      if (lease?.consumerId === consumerId) releaseMainDispatchLease(operationId, false)
    },
  })
  desktopMicrophoneOwner = new DesktopMicrophoneOwner({
    isAvailable: () => isEligibleDesktopRevealWindow(),
    isCurrent: identity => desktopPickerOwner.matchesActiveIdentity(identity),
    requestAccess: async signal => {
      if (signal.aborted) return false
      if (process.platform !== 'darwin') return true
      return await systemPreferences.askForMediaAccess('microphone')
    },
  })
  desktopMicrophoneChannel = new DesktopMicrophoneChannel(desktopMicrophoneOwner)
  desktopPopOutOwner = new DesktopPopOutOwner({
    isAvailable: () => isEligibleDesktopRevealWindow(),
    isCurrent: identity => desktopPickerOwner.matchesActiveIdentity(identity),
    native: {
      close(windowId) {
        const window = popOutWindows.get(windowId)
        popOutRouteTokens.delete(windowId)
        if (window !== undefined && !window.isDestroyed()) window.destroy()
      },
      focus(windowId) {
        const window = popOutWindows.get(windowId)
        if (window === undefined || window.isDestroyed()) return false
        window.show()
        window.focus()
        return true
      },
      isOpen(windowId) {
        const window = popOutWindows.get(windowId)
        return window !== undefined && !window.isDestroyed()
      },
      async open(relativePath, routeToken, onClosed) {
        if (runtimeUrl === undefined || runtimeOrigin === undefined) throw new Error('Desktop runtime is unavailable')
        const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
        const target = new URL(`/tocktutor/${encodedPath}`, runtimeUrl)
        const window = new BrowserWindow({
          width: 840,
          height: 720,
          minWidth: 480,
          minHeight: 360,
          show: false,
          title: relativePath,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: preloadPath,
            sandbox: true,
          },
        })
        const windowId = String(window.webContents.id)
        popOutWindows.set(windowId, window)
        popOutRouteTokens.set(windowId, routeToken)
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        window.webContents.on('will-navigate', (event, url) => {
          if (originOf(url) !== runtimeOrigin) event.preventDefault()
        })
        window.once('closed', () => {
          popOutWindows.delete(windowId)
          const ownsRoute = popOutRouteTokens.get(windowId) === routeToken
          popOutRouteTokens.delete(windowId)
          if (ownsRoute) onClosed()
        })
        try {
          await window.loadURL(runtimeUrl.href)
          const pathname = JSON.stringify(target.pathname)
          await window.webContents.executeJavaScript(
            `window.history.replaceState(null, '', ${pathname}); window.dispatchEvent(new PopStateEvent('popstate'))`,
            true,
          )
          if (originOf(window.webContents.getURL()) !== runtimeOrigin
            || new URL(window.webContents.getURL()).pathname !== target.pathname) {
            throw new Error('Desktop pop-out route bootstrap failed')
          }
          window.show()
          return windowId
        } catch (error) {
          popOutWindows.delete(windowId)
          popOutRouteTokens.delete(windowId)
          if (!window.isDestroyed()) window.destroy()
          throw error
        }
      },
    },
  })
  desktopPopOutChannel = new DesktopPopOutChannel(desktopPopOutOwner)
  desktopPrintExportOwner = new DesktopPrintExportOwner({
    isAvailable: () => isEligibleDesktopRevealWindow(),
    isCurrent: identity => desktopPickerOwner.matchesActiveIdentity(identity),
    native: {
      print: async (html, title, signal) => await withPrintRenderer(title, html, async window => {
        if (signal.aborted) return false
        return await new Promise<boolean>(resolve => {
          window.webContents.print({ printBackground: true }, success => resolve(success))
        })
      }),
      renderPdf: async (html, title, signal) => await withPrintRenderer(title, html, async window => {
        signal.throwIfAborted()
        const output = await window.webContents.printToPDF({ printBackground: true })
        signal.throwIfAborted()
        return new Uint8Array(output)
      }),
    },
    picker: desktopPickerOwner,
  })
  desktopPrintExportChannel = new DesktopPrintExportChannel(desktopPrintExportOwner)
}

function appendLog(stream: 'desktop' | 'stderr' | 'stdout', line: string): void {
  const rendered = `${new Date().toISOString()} [${stream}] ${line}`
  logStream?.write(rendered + '\n')
  logTail.push(rendered)
  if (logTail.length > 200) logTail.splice(0, logTail.length - 200)
}

function resourcesRoot(): string {
  return resolveRuntimeResourcesRoot(
    process.resourcesPath,
    join(currentDir, '..', '.stage'),
    app.isPackaged,
  )
}

function runtimePaths(): BundledRuntimePaths {
  return bundledRuntimePaths(resourcesRoot())
}

function desktopInfo(preview: DesktopInfo['preview'] = null): DesktopInfo {
  const appDataPath = app.getPath('userData')
  return {
    appDataPath,
    dshHome: join(appDataPath, 'dsh'),
    platform: process.platform,
    preview,
    profile: DESKTOP_PROFILE,
    version: PRODUCT_VERSION,
  }
}

function desktopRuntimeSnapshot(): DesktopRuntimeSnapshot {
  return {
    bundledPlugins: [...BUNDLED_DESKTOP_PLUGINS],
    logTail: logTail.slice(-100),
    profile: DESKTOP_PROFILE,
    runtimeUrl: runtimeUrl?.href ?? null,
    status: transitioning ? 'restarting' : runtimeUrl === undefined ? 'stopped' : 'ready',
  }
}

function runtimeEnvironment(
  paths: ReturnType<typeof runtimePaths>,
  overrides: { appDataPath?: string; dshHome?: string; preview?: { pluginId: string; transactionId: string } } = {},
): NodeJS.ProcessEnv {
  const info = desktopInfo(overrides.preview ?? null)
  const environment: NodeJS.ProcessEnv = {
    ...(overrides.preview === undefined
      ? process.env
      : previewRuntimeBaseEnvironment(process.env, overrides.appDataPath ?? info.appDataPath)),
    DSH_DESKTOP: '1',
    DSH_DESKTOP_APP_DATA: overrides.appDataPath ?? info.appDataPath,
    DSH_DESKTOP_PROFILE: info.profile,
    DSH_DESKTOP_VERSION: info.version,
    DSH_HOME: overrides.dshHome ?? info.dshHome,
    NODE_USE_ENV_PROXY: '1',
    PATH: runtimeSearchPath(paths),
  }
  scrubDesktopAuthorityEnvironment(environment, [MARKETPLACE_AGENT_URL_ENV, MARKETPLACE_AGENT_TOKEN_ENV])
  const reveal = overrides.preview === undefined ? desktopRevealChannel.environment : undefined
  if (reveal !== undefined) {
    environment.DSH_DESKTOP_REVEAL_ENDPOINT = reveal.endpoint
    environment.DSH_DESKTOP_REVEAL_TOKEN = reveal.token
  }
  const picker = overrides.preview === undefined ? desktopPickerChannel.environment : undefined
  if (picker !== undefined) {
    environment.DSH_DESKTOP_PICKER_ENDPOINT = picker.endpoint
    environment.DSH_DESKTOP_PICKER_TOKEN = picker.token
  }
  const caller = overrides.preview === undefined ? desktopCallerChannel.environment : undefined
  if (caller !== undefined) {
    environment.DSH_DESKTOP_CALLER_ENDPOINT = caller.endpoint
    environment.DSH_DESKTOP_CALLER_TOKEN = caller.token
  }
  const dispatch = overrides.preview === undefined ? desktopDispatchChannel.environment : undefined
  if (dispatch !== undefined) {
    environment.DSH_DESKTOP_DISPATCH_ENDPOINT = dispatch.endpoint
    environment.DSH_DESKTOP_DISPATCH_TOKEN = dispatch.token
  }
  const microphone = overrides.preview === undefined ? desktopMicrophoneChannel.environment : undefined
  if (microphone !== undefined) {
    environment.DSH_DESKTOP_MICROPHONE_ENDPOINT = microphone.endpoint
    environment.DSH_DESKTOP_MICROPHONE_TOKEN = microphone.token
  }
  const popOut = overrides.preview === undefined ? desktopPopOutChannel.environment : undefined
  if (popOut !== undefined) {
    environment.DSH_DESKTOP_POPOUT_ENDPOINT = popOut.endpoint
    environment.DSH_DESKTOP_POPOUT_TOKEN = popOut.token
  }
  const printExport = overrides.preview === undefined ? desktopPrintExportChannel.environment : undefined
  if (printExport !== undefined) {
    environment.DSH_DESKTOP_PRINT_EXPORT_ENDPOINT = printExport.endpoint
    environment.DSH_DESKTOP_PRINT_EXPORT_TOKEN = printExport.token
  }
  if (overrides.preview !== undefined) {
    environment.DSH_DESKTOP_PREVIEW = '1'
    environment.DSH_DESKTOP_PREVIEW_PLUGIN = overrides.preview.pluginId
    environment.DSH_DESKTOP_PREVIEW_TRANSACTION = overrides.preview.transactionId
  } else if (marketplaceAgentGateway !== undefined) {
    environment[MARKETPLACE_AGENT_URL_ENV] = marketplaceAgentGateway.url
    environment[MARKETPLACE_AGENT_TOKEN_ENV] = marketplaceAgentGateway.token
  }
  return overrides.preview === undefined
    ? withGitHubCredentials(environment, findGitHubCli(environment))
    : environment
}

function runtimeOptions(): DshRuntimeOptions {
  const paths = runtimePaths()
  const workspaceRoot = join(homedir(), 'DSH Workspaces')
  mkdirSync(workspaceRoot, { recursive: true })
  if (!existsSync(paths.nodeBinary)) {
    throw new Error(`packaged Node runtime is missing: ${paths.nodeBinary}`)
  }
  if (!existsSync(paths.cliEntry)) {
    throw new Error(`packaged DSH CLI is missing: ${paths.cliEntry}`)
  }
  return {
    args: ['--profile', DESKTOP_PROFILE],
    cliEntry: paths.cliEntry,
    cwd: workspaceRoot,
    env: runtimeEnvironment(paths),
    nodeBinary: paths.nodeBinary,
    onLog: (stream, line) => { appendLog(stream, line) },
    readyTimeoutMs: 60_000,
  }
}

function previewRuntimeOptions(input: {
  dshHome: string
  pluginId: string
  sandboxRoot: string
  transactionId: string
}): DshRuntimeOptions {
  const paths = runtimePaths()
  const workspaceRoot = join(input.sandboxRoot, 'workspace')
  const temporary = join(input.sandboxRoot, '.tmp')
  mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 })
  mkdirSync(temporary, { recursive: true, mode: 0o700 })
  if (!existsSync(paths.nodeBinary)) throw new Error(`packaged Node runtime is missing: ${paths.nodeBinary}`)
  if (!existsSync(paths.cliEntry)) throw new Error(`packaged DSH CLI is missing: ${paths.cliEntry}`)
  const preview = { pluginId: input.pluginId, transactionId: input.transactionId }
  const launcher = previewSandboxLauncher({
    readRoots: [paths.runtimeRoot, dirname(paths.nodeBinDirectory)],
    root: input.sandboxRoot,
  })
  return {
    args: ['--profile', DESKTOP_PROFILE],
    cliEntry: paths.cliEntry,
    cwd: workspaceRoot,
    env: {
      ...runtimeEnvironment(paths, {
        appDataPath: input.sandboxRoot,
        dshHome: input.dshHome,
        preview,
      }),
      TEMP: temporary,
      TMP: temporary,
      TMPDIR: temporary,
    },
    launcher,
    nodeBinary: paths.nodeBinary,
    onLog: (stream, line) => { appendLog(stream, `[preview:${input.pluginId}] ${line}`) },
    readyTimeoutMs: 90_000,
  }
}

function isEligibleDesktopRevealWindow(): boolean {
  if (mainWindow === undefined || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return false
  if (runtimeOrigin === undefined) return false
  return originOf(mainWindow.webContents.getURL()) === runtimeOrigin
}

function configureWebClipGuest(embedder: WebContents, contents: WebContents): void {
  const frameId = contents.id
  const guestSession = contents.session
  webClipFrames.attach(frameId, embedder.id)
  let lastBlocked = { at: 0, url: '' }
  const reportBlocked = (url: string): void => {
    if (url.length > 4096 || (!url.startsWith('http:') && !url.startsWith('https:'))) return
    const now = Date.now()
    if (lastBlocked.url === url && now - lastBlocked.at < 250) return
    lastBlocked = { at: now, url }
    embedder.send('desktop:web-clip-navigation-blocked', { frameId, url })
  }
  guestSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
  guestSession.setPermissionCheckHandler(() => false)
  guestSession.webRequest.onBeforeRequest({
    urls: [
      'file://*/*',
      'ftp://*/*',
      'http://*/*',
      'https://*/*',
      'ws://*/*',
      'wss://*/*',
    ],
  }, (details, callback) => {
    if (shouldReportBlockedWebClipRequest(details.resourceType)) reportBlocked(details.url)
    callback({ cancel: true })
  })
  guestSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: stripWebClipRequestHeaders(details.requestHeaders) })
  })
  guestSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      ...(details.responseHeaders === undefined
        ? {}
        : { responseHeaders: stripWebClipResponseHeaders(details.responseHeaders) }),
    })
  })
  guestSession.on('will-download', (event, item) => {
    event.preventDefault()
    item.cancel()
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('login', (event, _details, _authInfo, callback) => {
    event.preventDefault()
    callback()
  })
  const guard = (event: Electron.Event, url: string): void => {
    if (webClipFrames.allows(frameId, url)) return
    event.preventDefault()
    if (url !== 'about:blank') reportBlocked(url)
  }
  contents.on('will-navigate', details => { guard(details, details.url) })
  contents.on('will-redirect', details => { guard(details, details.url) })
  contents.on('did-navigate', (_event, url) => {
    if (webClipFrames.allows(frameId, url)) webClipFrames.commit(frameId)
  })
  contents.once('destroyed', () => {
    webClipFrames.detach(frameId)
    void Promise.allSettled([
      guestSession.clearCache(),
      guestSession.clearStorageData(),
    ])
  })
}

function setTockTutorThemeActive(active: boolean): void {
  if (active) {
    tockTutorPreviousThemeSource ??= nativeTheme.themeSource
    nativeTheme.themeSource = 'light'
  } else if (tockTutorPreviousThemeSource !== undefined) {
    nativeTheme.themeSource = tockTutorPreviousThemeSource
    tockTutorPreviousThemeSource = undefined
  }
  mainWindow?.setBackgroundColor(active
    ? '#ffffff'
    : nativeTheme.shouldUseDarkColors ? '#202020' : '#f7f7f5')
}

function resetTockTutorTheme(window: BrowserWindow): void {
  if (tockTutorPreviousThemeSource === undefined) return
  nativeTheme.themeSource = tockTutorPreviousThemeSource
  tockTutorPreviousThemeSource = undefined
  if (!window.isDestroyed()) {
    window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#202020' : '#f7f7f5')
  }
}

function windowIconPath(): string | undefined {
  // Packaged builds carry the icon beside resources/; dev falls back to the
  // rendered set so the window shows the app icon instead of Electron's.
  const packaged = join(process.resourcesPath, 'tockteam-desktop.png')
  if (existsSync(packaged)) return packaged
  const development = join(currentDir, '..', 'assets', 'icons', '512x512.png')
  return existsSync(development) ? development : undefined
}

function launcherPlatform(): 'Linux' | 'macOS' | 'Windows' {
  if (process.platform === 'darwin') return 'macOS'
  if (process.platform === 'win32') return 'Windows'
  if (process.platform === 'linux') return 'Linux'
  throw new Error('Unsupported TockLauncher platform')
}

function launcherDefaultContext(): Readonly<{
  appDataPath: string
  environment: Readonly<Record<string, string | undefined>>
  homePath: string
  locale: string
  platform: 'Linux' | 'macOS' | 'Windows'
}> {
  return Object.freeze({
    appDataPath: app.getPath('userData'),
    environment: process.env,
    homePath: app.getPath('home'),
    locale: app.getLocale?.() ?? 'en-US',
    platform: launcherPlatform(),
  })
}

function launcherSecureStorageAvailable(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend()
      if (backend === 'basic_text' || backend === 'unknown') return false
    }
    return true
  } catch { return false }
}

function createMainLauncherSecretCodec() {
  return createLauncherSecretCodec({
    isAvailable: launcherSecureStorageAvailable,
    encrypt: plaintext => {
      if (!launcherSecureStorageAvailable()) throw new Error('TockLauncher secure storage is unavailable')
      return safeStorage.encryptString(plaintext).toString('base64')
    },
    decrypt: ciphertext => {
      if (!launcherSecureStorageAvailable()) throw new Error('TockLauncher secure storage is unavailable')
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
    },
  })
}

function requireLauncherPersistence(): LauncherPersistenceRepository {
  if (launcherPersistence === undefined) throw new Error('TockLauncher persistence is unavailable')
  return launcherPersistence
}

function runLauncherSettingsOperation<T>(
  operation: () => Promise<T>,
  options: Readonly<{ blockMutationsAfterSuccess?: boolean; mutation?: boolean }> = {},
): Promise<T> {
  return launcherSettingsOperations.run(operation, options)
}

async function closeLauncherSettingsOperations(): Promise<void> {
  await launcherSettingsOperations.close()
}

function launcherSettingsSnapshot(): ReturnType<LauncherPersistenceRepository['snapshot']> {
  const repository = requireLauncherPersistence()
  const snapshot = repository.snapshot()
  const context = launcherDefaultContext()
  const values = { ...snapshot.values }
  const dynamicKeys = context.platform === 'Linux'
    ? ['extension[ApplicationSearch].linuxFolders']
    : context.platform === 'Windows'
      ? ['extension[ApplicationSearch].windowsFolders']
      : ['extension[ApplicationSearch].macOsFolders']
  for (const key of [...dynamicKeys, 'extension[VSCode].command']) {
    if (Object.hasOwn(values, key)) continue
    const fallback = resolveLauncherSettingDefault(key, context)
    if (fallback !== undefined) values[key] = fallback
  }
  const customBrowserStatus = launcherCustomBrowser?.snapshot().status ?? 'none'
  return Object.freeze({
    ...snapshot,
    customBrowserStatus,
    externalWriteAvailable: repository.externalWriteAvailable,
    secureStorageAvailable: repository.secureStorageAvailable,
    values: Object.freeze(values),
  })
}

function launcherLocalExtensionSettings(): LauncherLocalExtensionSettings {
  const repository = requireLauncherPersistence()
  const get = <T>(extensionId: string, key: string, fallback: T): T => {
    const fullKey = `extension[${extensionId}].${key}`
    const value = repository.getSetting<unknown>(fullKey, fallback)
    return isLauncherRendererSettingValue(fullKey, value) ? value as T : fallback
  }
  const uuidDefaults = LAUNCHER_LOCAL_EXTENSION_DEFAULTS.UuidGenerator
  const nested = get('UuidGenerator', 'generatorFormat', uuidDefaults.generatorFormat)
  return Object.freeze({
    Base64Conversion: Object.freeze({
      decodePrefix: get('Base64Conversion', 'decodePrefix', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Base64Conversion.decodePrefix),
      encodeDecodePrefix: get('Base64Conversion', 'encodeDecodePrefix', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Base64Conversion.encodeDecodePrefix),
      encodePrefix: get('Base64Conversion', 'encodePrefix', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Base64Conversion.encodePrefix),
    }),
    Calculator: Object.freeze({
      argumentSeparator: get('Calculator', 'argumentSeparator', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Calculator.argumentSeparator),
      decimalSeparator: get('Calculator', 'decimalSeparator', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Calculator.decimalSeparator),
      precision: get('Calculator', 'precision', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Calculator.precision),
    }),
    ColorConverter: Object.freeze({ formats: Object.freeze([...get('ColorConverter', 'formats', [...LAUNCHER_LOCAL_EXTENSION_DEFAULTS.ColorConverter.formats])]) }),
    PasswordGenerator: Object.freeze({
      beginWithALetter: get('PasswordGenerator', 'beginWithALetter', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.beginWithALetter),
      command: get('PasswordGenerator', 'command', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.command),
      includeLowercaseCharacters: get('PasswordGenerator', 'includeLowercaseCharacters', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.includeLowercaseCharacters),
      includeNumbers: get('PasswordGenerator', 'includeNumbers', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.includeNumbers),
      includeSymbols: get('PasswordGenerator', 'includeSymbols', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.includeSymbols),
      includeUppercaseCharacters: get('PasswordGenerator', 'includeUppercaseCharacters', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.includeUppercaseCharacters),
      noDuplicateCharacters: get('PasswordGenerator', 'noDuplicateCharacters', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.noDuplicateCharacters),
      noSequentialCharacters: get('PasswordGenerator', 'noSequentialCharacters', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.noSequentialCharacters),
      noSimilarCharacters: get('PasswordGenerator', 'noSimilarCharacters', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.noSimilarCharacters),
      passwordLength: get('PasswordGenerator', 'passwordLength', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.passwordLength),
      quantity: get('PasswordGenerator', 'quantity', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.quantity),
      symbols: get('PasswordGenerator', 'symbols', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.symbols),
    }),
    QuickFormatter: Object.freeze({
      command: get('QuickFormatter', 'command', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.QuickFormatter.command),
      enableDeepFormatting: get('QuickFormatter', 'enableDeepFormatting', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.QuickFormatter.enableDeepFormatting),
      enableJson: get('QuickFormatter', 'enableJson', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.QuickFormatter.enableJson),
      enableStackTrace: get('QuickFormatter', 'enableStackTrace', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.QuickFormatter.enableStackTrace),
      enableXml: get('QuickFormatter', 'enableXml', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.QuickFormatter.enableXml),
    }),
    RowlandTextEditor: Object.freeze({
      columnSeparator: get('RowlandTextEditor', 'columnSeparator', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.RowlandTextEditor.columnSeparator),
      rowSeparator: get('RowlandTextEditor', 'rowSeparator', LAUNCHER_LOCAL_EXTENSION_DEFAULTS.RowlandTextEditor.rowSeparator),
    }),
    UuidGenerator: Object.freeze({
      braces: get('UuidGenerator', 'braces', nested.braces),
      generatorFormat: Object.freeze({ ...nested }),
      hyphens: get('UuidGenerator', 'hyphens', nested.hyphens),
      numberOfUuids: get('UuidGenerator', 'numberOfUuids', uuidDefaults.numberOfUuids),
      quotes: get('UuidGenerator', 'quotes', nested.quotes),
      searchResultFormats: Object.freeze([...get('UuidGenerator', 'searchResultFormats', [...uuidDefaults.searchResultFormats])]),
      uppercase: get('UuidGenerator', 'uppercase', nested.uppercase),
      uuidVersion: get('UuidGenerator', 'uuidVersion', uuidDefaults.uuidVersion),
      validateStrictly: get('UuidGenerator', 'validateStrictly', uuidDefaults.validateStrictly),
    }),
  }) as LauncherLocalExtensionSettings
}

function launcherEnabledLocalExtensionIds(): readonly string[] {
  const repository = requireLauncherPersistence()
  const context = launcherDefaultContext()
  const resolved = resolveLauncherSettingDefault('extensions.enabledExtensionIds', context)
  const fallback: readonly string[] = Array.isArray(resolved)
    ? resolved.filter((item): item is string => typeof item === 'string')
    : [...LAUNCHER_LOCAL_EXTENSION_IDS]
  const value = repository.getSetting<unknown>('extensions.enabledExtensionIds', fallback)
  return resolveLauncherEnabledExtensionIds(value, fallback)
}

function launcherSurfaceSettings(): import('./launcher-contract.ts').LauncherSurfaceSettings {
  const snapshot = launcherSettingsSnapshot()
  const values = snapshot.values
  const context = launcherDefaultContext()
  const boolValue = (key: string, fallback: boolean): boolean => typeof values[key] === 'boolean' ? values[key] as boolean : Boolean(resolveLauncherSettingDefault(key, context) ?? fallback)
  const numberValue = (key: string, fallback: number): number => typeof values[key] === 'number' && Number.isFinite(values[key]) ? values[key] as number : Number(resolveLauncherSettingDefault(key, context) ?? fallback)
  const historyEnabled = boolValue('general.searchHistory.enabled', false)
  const historyLimit = Math.min(100, Math.max(1, numberValue('general.searchHistory.limit', 10)))
  const rawHistory = values['general.searchHistory.history']
  const history = historyEnabled && Array.isArray(rawHistory) ? rawHistory.filter(item => typeof item === 'string').slice(0, historyLimit) : []
  const state = {
    preferences: {
      fuzziness: Math.min(1, Math.max(0, numberValue('searchEngine.fuzziness', 0.5))),
      historyEnabled,
      historyLimit,
      maxSearchResultItems: Math.min(200, Math.max(1, numberValue('searchEngine.maxResultLength', 50))),
      searchEngineId: values['searchEngine.id'] === 'Fuse.js' ? 'Fuse.js' as const : 'fuzzysort' as const,
    },
    history,
  }
  return Object.freeze({
    fuzziness: state.preferences.fuzziness,
    history: Object.freeze([...state.history]),
    historyEnabled: state.preferences.historyEnabled,
    historyLimit: state.preferences.historyLimit,
    maxSearchResultItems: state.preferences.maxSearchResultItems,
    searchEngineId: state.preferences.searchEngineId,
  })
}

async function recordLauncherSearch(query: string): Promise<import('./launcher-contract.ts').LauncherSurfaceSettings> {
  const current = launcherSurfaceSettings()
  await requireLauncherPersistence().recordSearch(query, {
    historyEnabled: current.historyEnabled,
    historyLimit: current.historyLimit,
  })
  return launcherSurfaceSettings()
}

function syncLauncherPersistentSets(core: Readonly<{ replacePersistentSettings: (settings: Readonly<{ excludedItemIds: readonly string[]; favoriteItemIds: readonly string[] }>) => void }>): void {
  const repository = launcherPersistence
  if (repository === undefined) return
  const favorites = repository.getSetting('favorites', [])
  const excluded = repository.getSetting('searchEngine.excludedItems', [])
  core.replacePersistentSettings({
    excludedItemIds: Array.isArray(excluded) ? excluded.filter(item => typeof item === 'string') : [],
    favoriteItemIds: Array.isArray(favorites) ? favorites.filter(item => typeof item === 'string') : [],
  })
}

function createLauncherWindow(args: Readonly<{
  launcherSession: Session
  urlPolicy: LauncherUrlPolicy
}>): BrowserWindow {
  const window = new BrowserWindow({
    alwaysOnTop: true,
    frame: false,
    fullscreenable: false,
    height: 475,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    title: 'TockLauncher',
    width: 750,
    ...(process.platform === 'darwin' ? { transparent: true, type: 'panel' } : {}),
    webPreferences: {
      ...createLauncherWebPreferences({ electronDir: currentDir, role: LAUNCHER_ROLE }),
      spellcheck: false,
      webviewTag: false,
    },
  })
  if (window.webContents.session !== args.launcherSession) {
    window.destroy()
    throw new Error('TockLauncher window was created with an unexpected session')
  }
  window.removeMenu()
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-attach-webview', event => { event.preventDefault() })
  window.webContents.on('will-navigate', (event, url) => {
    if (!args.urlPolicy.isAllowed(LAUNCHER_ROLE, url)) event.preventDefault()
  })
  window.webContents.on('will-redirect', (event, url) => {
    if (!args.urlPolicy.isAllowed(LAUNCHER_ROLE, url)) event.preventDefault()
  })
  return window
}

function initializeLauncher(): void {
  if (launcherController !== undefined) return
  const repository = requireLauncherPersistence()
  const launcherSession = session.fromPartition(LAUNCHER_SESSION_PARTITION)
  applyLauncherSessionPolicy(launcherSession)
  const urlPolicy = createLauncherUrlPolicy({ launcherHtmlPath })
  const platform = launcherPlatform()
  const local = createLauncherLocalExtensions({
    copyText: text => clipboard.writeText(text),
    enabledExtensionIds: launcherEnabledLocalExtensionIds,
    getSetting: (key, fallback) => repository.getSetting(key, fallback),
    onProviderError: (extensionId, error) => {
      appendLog('desktop', `TockLauncher provider ${extensionId} failed: ${error instanceof Error ? error.name : 'unknown error'}`)
    },
  })
  const reportDiscoveryError = (extensionId: 'ApplicationSearch' | 'BrowserBookmarks' | 'JetBrainsToolbox' | 'VSCode', error: Error): void => {
    appendLog('desktop', `TockLauncher provider ${extensionId} failed: ${error instanceof Error ? error.name : 'unknown error'}`)
  }
  const discovery = createLauncherDiscoveryExtensions({
    appDataPath: app.getPath('appData'),
    effects: {
      confirmOpenApplicationAsAdministrator: async ({ name, target }) => {
        const result = await dialog.showMessageBox({
          buttons: ['Open as administrator', 'Cancel'], cancelId: 1, defaultId: 1,
          detail: [`Application: ${name}`, `Target: ${target}`, 'Windows will request administrator approval.'].join('\\n'),
          message: `Open ${name} as administrator?`, title: PRODUCT_NAME, type: 'warning',
        })
        return result.response === 0
      },
      copyText: text => clipboard.writeText(text),
      launchExecutable: launchDetachedLauncherExecutable,
      openApplication: async target => {
        if (platform === 'Linux' && target.endsWith('.desktop')) {
          const invocation = resolveLinuxDesktopEntryInvocation(target)
          await execFileAsync(invocation.executable, [...invocation.args], { maxBuffer: 64 * 1024, timeout: 15_000 })
          return
        }
        if (platform === 'Windows' && revalidateLauncherWindowsStoreId(target)) {
          await execFileAsync('explorer.exe', [target], { maxBuffer: 64 * 1024, timeout: 15_000, windowsHide: true })
          return
        }
        const error = await shell.openPath(target)
        if (error) throw new Error(error)
      },
      openApplicationAsAdministrator: async target => {
        const invocation = resolveWindowsApplicationElevationInvocation(target)
        await execFileAsync(invocation.executable, [...invocation.args], { maxBuffer: 64 * 1024, timeout: 15_000, windowsHide: true })
      },
      openExternal: async url => {
        if (launcherCustomBrowser === undefined) throw new Error('Custom browser controller is unavailable')
        await launcherCustomBrowser.openUrl(url)
      },
      revealPath: target => { shell.showItemInFolder(target) },
    },
    capturePathIdentity: async target => await statLauncherPathIdentity(target),
    enabledExtensionIds: launcherEnabledLocalExtensionIds,
    getApplicationIcon: async (target, signal) => {
      if (signal.aborted || revalidateLauncherWindowsStoreId(target)) return undefined
      const image = await app.getFileIcon(target, { size: 'normal' })
      if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Application icon extraction canceled')
      return image.isEmpty() ? undefined : image.resize({ height: 32, quality: 'good', width: 32 }).toDataURL()
    },
    getSetting: (key, fallback) => repository.getSetting(key, fallback),
    homePath: app.getPath('home'),
    onProviderError: reportDiscoveryError,
    platform,
    revalidate: {
      application: async (target, entry, identity) => {
        if (target !== entry.path) return false
        if (platform === 'Windows' && revalidateLauncherWindowsStoreId(target)) return true
        if (identity === undefined) return false
        const kind = platform === 'macOS' && extname(target).toLocaleLowerCase('en-US') === '.app' ? 'directory' as const : 'file' as const
        return await revalidateLauncherPath(target, { kind, identity })
      },
      bookmark: async (target, entry) => target === entry.url && await revalidateLauncherUrl(target, entry.url),
      jetbrains: async ({ executable, projectPath, entry, executableIdentity, projectIdentity }) => {
        if (executable !== entry.executable || projectPath !== entry.projectPath) return false
        if (executableIdentity === undefined || projectIdentity === undefined) return false
        const executableValid = await revalidateLauncherExecutable(executable, { identity: executableIdentity, ...(entry.installRoot === undefined ? {} : { root: entry.installRoot }) })
        const projectValid = await revalidateLauncherPath(projectPath, { kind: 'directory', identity: projectIdentity })
        return executableValid && projectValid
      },
      reveal: async (target, entry, identity) => {
        if (target !== entry.path || identity === undefined) return false
        const kind = platform === 'macOS' && extname(target).toLocaleLowerCase('en-US') === '.app' ? 'directory' as const : 'file' as const
        return await revalidateLauncherPath(target, { kind, identity })
      },
      vscode: async ({ executable, uri, entry, executableIdentity, identity }) => {
        if (uri !== entry.uri || executableIdentity === undefined || (uri.startsWith('file:') && identity === undefined)) return false
        const executableValid = await revalidateLauncherExecutable(executable, { identity: executableIdentity })
        return executableValid && await revalidateLauncherVscodeUri(uri, { ...(identity === undefined ? {} : { identity }) })
      },
    },
    scanners: createLauncherDiscoveryScanners({ onProviderError: reportDiscoveryError }),
  })
  const fileSearch = createLauncherFileSearchExtensions({
    effects: {
      openPath: async target => {
        const error = await shell.openPath(target)
        if (error) throw new Error(error)
      },
      revealPath: target => { shell.showItemInFolder(target) },
    },
    enabledExtensionIds: launcherEnabledLocalExtensionIds,
    getSetting: (key, fallback) => repository.getSetting(key, fallback),
    homePath: app.getPath('home'),
    onProviderError: (extensionId, error) => {
      appendLog('desktop', `TockLauncher provider ${extensionId} failed: ${error instanceof Error ? error.name : 'unknown error'}`)
    },
    platform,
    scanners: createLauncherFileSearchScanners(),
  })
  const network = createLauncherNetworkExtensions({
    copyText: text => clipboard.writeText(text),
    enabledExtensionIds: launcherEnabledLocalExtensionIds,
    fetch: async (url, init) => launcherNetworkFixtureEnabled
      ? await launcherNetworkFixtureFetch(url, init)
      : await net.fetch(url, init) as unknown as Response,
    getSetting: (key, fallback) => repository.getSetting(key, fallback),
    onProviderError: (extensionId, error) => {
      appendLog('desktop', `TockLauncher provider ${extensionId} failed: ${error.name}`)
    },
    openExternal: async url => {
      if (launcherNetworkFixtureEnabled) return
      if (launcherCustomBrowser === undefined) throw new Error('Custom browser controller is unavailable')
      await launcherCustomBrowser.openUrl(url)
    },
    ...(launcherNetworkFixtureEnabled ? { resolveAddresses: async () => ['8.8.8.8'] } : null),
  })
  launcherNetwork = network
  const os = createLauncherOsExtensions({
    effects: {
      confirmPrivilegedAction: async ({ detail, title }) => {
        const owner = mainWindow
        const result = owner === undefined || owner.isDestroyed()
          ? await dialog.showMessageBox({ buttons: ['Continue', 'Cancel'], cancelId: 1, defaultId: 1, detail, message: title, title: PRODUCT_NAME, type: 'warning' })
          : await dialog.showMessageBox(owner, { buttons: ['Continue', 'Cancel'], cancelId: 1, defaultId: 1, detail, message: title, title: PRODUCT_NAME, type: 'warning' })
        return result.response === 0
      },
      invokeSystemCommand: async command => {
        try {
          if (platform === 'Linux' && command === 'empty-trash') {
            await emptyLauncherLinuxTrash(app.getPath('home'))
            return
          }
          const invocation = resolveSystemCommandInvocation(platform, command)
          if (invocation === undefined) throw new Error('System command is unavailable')
          await execFileAsync(invocation.executable, [...invocation.args], {
            maxBuffer: 64 * 1024,
            shell: false,
            timeout: 15_000,
            ...(platform === 'Windows' ? { windowsHide: true } : {}),
          })
        } catch { throw new Error('TockLauncher system command failed') }
      },
      invokeUeliCommand: async command => {
        try {
          if (launcherLifecycle === undefined) throw new Error('TockLauncher lifecycle is unavailable')
          await launcherLifecycle.invokeCommand(command)
        } catch { throw new Error('TockLauncher lifecycle command failed') }
      },
      openControlPanelItem: async canonicalName => {
        try {
          if (platform !== 'Windows') throw new Error('Windows Control Panel is unavailable')
          const invocation = resolveWindowsControlPanelInvocation(canonicalName)
          await execFileAsync(invocation.executable, [...invocation.args], { maxBuffer: 64 * 1024, shell: false, timeout: 15_000, windowsHide: true })
        } catch { throw new Error('TockLauncher Control Panel action failed') }
      },
      openSystemSetting: async target => {
        const catalog = platform === 'macOS' ? MACOS_SYSTEM_SETTINGS : WINDOWS_SYSTEM_SETTINGS
        if (!catalog.some(row => row.target === target)) throw new Error('System setting is not in the current catalog')
        try {
          if (platform === 'Windows') {
            await shell.openExternal(target)
            return
          }
          const identity = await statLauncherPathIdentity(target)
          if (identity === undefined || !await revalidateLauncherPath(target, { identity, kind: 'directory' })) throw new Error('System setting is unavailable')
          const error = await shell.openPath(target)
          if (error) throw new Error('System setting is unavailable')
        } catch { throw new Error('TockLauncher system setting action failed') }
      },
      toggleAppearance: async () => {
        if (tockTutorPreviousThemeSource !== undefined) throw new Error('System appearance is unavailable during a theme override')
        try {
          const invocation = resolveAppearanceInvocation(platform, nativeTheme.shouldUseDarkColors)
          await execFileAsync(invocation.executable, [...invocation.args], { maxBuffer: 64 * 1024, shell: false, timeout: 15_000, ...(platform === 'Windows' ? { windowsHide: true } : {}) })
        } catch { throw new Error('TockLauncher appearance action failed') }
      },
    },
    enabledExtensionIds: launcherEnabledLocalExtensionIds,
    getAppearanceMode: () => tockTutorPreviousThemeSource === undefined ? nativeTheme.shouldUseDarkColors : undefined,
    getSetting: (key, fallback) => repository.getSetting(key, fallback),
    isAppearanceOverridden: () => tockTutorPreviousThemeSource !== undefined,
    onProviderError: (extensionId, error) => {
      appendLog('desktop', `TockLauncher provider ${extensionId} failed: ${error.name}`)
    },
    platform,
    scanControlPanelItems: async signal => {
      if (platform !== 'Windows') return []
      const invocation = resolveWindowsControlPanelScanInvocation()
      const result = await execFileAsync(invocation.executable, [...invocation.args], {
        encoding: 'utf8',
        maxBuffer: 1_048_576,
        shell: false,
        signal,
        timeout: 15_000,
        windowsHide: true,
      }) as unknown as { stdout: string }
      return parseWindowsControlPanelItems(result.stdout)
    },
  })
  launcherOs = os
  const discoverySettingKeys = new Set([
    'extension[ApplicationSearch].includeWindowsStoreApps', 'extension[ApplicationSearch].linuxFolders', 'extension[ApplicationSearch].macOsFolders',
    'extension[ApplicationSearch].mdfindFilterOption', 'extension[ApplicationSearch].windowsFileExtensions', 'extension[ApplicationSearch].windowsFolders',
    'extension[BrowserBookmarks].browsers', 'extension[BrowserBookmarks].iconType', 'extension[BrowserBookmarks].searchResultStyle',
    'extension[FileSearch].everythingCliFilePath', 'extension[FileSearch].maxSearchResultCount', 'extension[SimpleFileSearch].folders',
    'extension[VSCode].command', 'extension[VSCode].prefix', 'extension[VSCode].showPath',
    'extension[CurrencyConversion].currencies', 'extension[CurrencyConversion].defaultTargetCurrency',
    'extension[CustomWebSearch].customSearchEngines', 'extension[DeeplTranslator].apiKey',
    'extension[DeeplTranslator].defaultSourceLanguage', 'extension[DeeplTranslator].defaultTargetLanguage',
    'extension[WebSearch].locale', 'extension[WebSearch].searchEngine', 'extension[WebSearch].showInstantSearchResult',
    'general.language', 'general.hotkey.enabled',
  ])
  const coreSearch = createLauncherCoreSearch({
    initialExcludedItemIds: repository.getSetting('searchEngine.excludedItems', []),
    initialFavoriteItemIds: repository.getSetting('favorites', []),
    initialIndexedItems: repository.readIndex(),
    appendLog: async (_level, message) => { await repository.appendLog('ERROR', message) },
    getIndexedError: () => {
      const errors = [network.getLastError(), fileSearch.getLastError(), os.getLastError()].filter((value): value is string => value !== undefined)
      return errors.length === 0 ? undefined : errors.slice(0, 3).join(' ')
    },
    loadIndexedItems: async signal => {
      const result = await createTockTeamDestinationResults('')
      return [...result.before, ...result.after, ...await local.loadIndexedItems(), ...await discovery.loadIndexedItems(signal), ...await fileSearch.loadIndexedItems(signal), ...await network.loadIndexedItems(signal), ...await os.loadIndexedItems(signal)]
    },
    searchInstant: async searchTerm => {
      const [localResults, discoveryResults, fileResults, networkResults] = await Promise.all([
        local.searchInstant(searchTerm), discovery.searchInstant(searchTerm), fileSearch.searchInstant(searchTerm), network.searchInstant(searchTerm),
      ])
      return Object.freeze({
        after: Object.freeze([...localResults.after, ...discoveryResults.after, ...fileResults.after, ...networkResults.after]),
        before: Object.freeze([...localResults.before, ...discoveryResults.before, ...fileResults.before, ...networkResults.before]),
        ...(networkResults.lastError === undefined
          ? fileResults.lastError === undefined ? null : { lastError: fileResults.lastError }
          : { lastError: networkResults.lastError }),
      })
    },
    persistIndex: async items => { await repository.writeIndex(items) },
    persistSettings: async values => await runLauncherSettingsOperation(
      async () => await repository.updateSettings(values),
      { mutation: true },
    ),
    platform,
  })
  let controller: LauncherOverlayController | undefined
  const actions = new LauncherActionStore({
    execute: async record => {
      if (await coreSearch.executeAction(record)) return
      if (await local.executeAction(record)) return
      if (await discovery.executeAction(record)) return
      if (await fileSearch.executeAction(record)) return
      if (await network.executeAction(record)) {
        if (record.hideWindowAfterInvocation) controller?.hideAfterInvocation(record.owner.webContentsId)
        return
      }
      if (await os.executeAction(record)) {
        if (record.hideWindowAfterInvocation) controller?.hideAfterInvocation(record.owner.webContentsId)
        return
      }
      await executeTockTeamDestination(record, () => {
        if (runtimeUrl === undefined) return false
        return mainWindow === undefined || mainWindow.isDestroyed()
          ? true
          : isEligibleDesktopRevealWindow()
      }, destination => {
        dispatchWorkbenchRoute({ destination })
      })
      if (record.hideWindowAfterInvocation) controller?.hideAfterInvocation(record.owner.webContentsId)
    },
  })
  const rescan = async () => {
    actions.clear()
    fileSearch.invalidate()
    network.invalidate()
    os.invalidate()
    return await coreSearch.rescan()
  }
  launcherRescan = rescan
  const nextController = new LauncherOverlayController({
    createWindow: () => createLauncherWindow({ launcherSession, urlPolicy }),
    getDisplayWorkArea: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
    globalShortcut,
    loadWindow: window => window.loadURL(urlPolicy.entryUrl).then(() => undefined),
    onWindowCleared: window => actions.clearOwner({ role: 'launcher', webContentsId: window.webContents.id }),
    getThemeProjection: () => launcherThemeProjector.get(),
    platform: process.platform,
    registerWindow: (_role, window) => launcherWindowRegistry.register(
      'launcher',
      window as unknown as LauncherRegistryWindow,
    ),
  })
  controller = nextController
  launcherController = nextController
  launcherCoreFlush = async () => {
    const networkClose = network.close()
    const osClose = os.close()
    await fileSearch.close()
    await networkClose
    await osClose
    await coreSearch.close()
  }
  launcherPersistentSetsSync = () => { syncLauncherPersistentSets(coreSearch) }
  const launcherGuard = createLauncherIpcGuard({
    launcherSession,
    resolveWindow: sender => launcherWindowRegistry.resolveWindow(sender),
    roleOf: window => launcherWindowRegistry.roleOf(window),
    urlPolicy,
  })
  const disposeWindowIpc = registerLauncherWindowIpcHandlers({
    controller: nextController,
    getTheme: () => launcherThemeProjector.get(),
    guard: launcherGuard,
    ipcMain,
    openSettings: openWorkbenchSettings,
  })
  try {
    const disposeSearchIpc = registerLauncherIpcHandlers({
      actions,
      guard: launcherGuard,
      ipcMain,
      rescan,
      search: async (searchTerm) => {
        const surface = launcherSurfaceSettings()
        return await coreSearch.search(searchTerm, {
          fuzziness: surface.fuzziness,
          maxSearchResultItems: surface.maxSearchResultItems,
          searchEngineId: surface.searchEngineId,
        })
      },
      surface: {
        getLocalExtensionSettings: launcherLocalExtensionSettings,
        getSettings: launcherSurfaceSettings,
        recordSearch: async query => await runLauncherSettingsOperation(async () => await recordLauncherSearch(query), { mutation: true }),
      },
    })
    launcherIpcDisposer = () => {
      disposeSearchIpc()
      disposeWindowIpc()
    }
  } catch (error) {
    disposeWindowIpc()
    throw error
  }
  workbenchLauncherIpcDisposer = registerWorkbenchLauncherIpcHandlers({
    assertTrustedMainIpc: event => { assertTrustedMainIpc(event as Electron.IpcMainInvokeEvent) },
    controller: nextController,
    ipcMain,
    settings: {
      exportSettings: async () => await runLauncherSettingsOperation(exportLauncherSettings),
      getSnapshot: launcherSettingsSnapshot,
      importSettings: async () => await runLauncherSettingsOperation(async () => {
        actions.clear()
        return await importLauncherSettings()
      }, { blockMutationsAfterSuccess: true, mutation: true }),
      resetSettings: async () => await runLauncherSettingsOperation(async () => {
        actions.clear()
        return await resetLauncherSettings()
      }, { blockMutationsAfterSuccess: true, mutation: true }),
      revokeCustomBrowser: async () => await runLauncherSettingsOperation(revokeCustomLauncherBrowser, { mutation: true }),
      revokeExternalSettings: async () => await runLauncherSettingsOperation(revokeExternalLauncherSettings, { mutation: true }),
      selectCustomBrowser: async () => await runLauncherSettingsOperation(selectCustomLauncherBrowser, { mutation: true }),
      selectExternalSettings: async () => await runLauncherSettingsOperation(async () => {
        actions.clear()
        return await selectExternalLauncherSettings()
      }, { blockMutationsAfterSuccess: true, mutation: true }),
      updateSetting: async (key, value) => await runLauncherSettingsOperation(async () => {
        const needsRescan = key === 'extensions.enabledExtensionIds' || discoverySettingKeys.has(key)
        if (needsRescan) {
          actions.clear()
          fileSearch.invalidate()
          network.invalidate()
          os.invalidate()
        }
        try {
          await requireLauncherPersistence().updateSetting(key, value)
          launcherPersistentSetsSync?.()
          await launcherLifecycle?.sync()
          if (needsRescan) await launcherRescan?.()
          return settingsOperation()
        } catch (reason) {
          if (needsRescan) {
            actions.clear()
            fileSearch.invalidate()
            network.invalidate()
            os.invalidate()
            try { await launcherRescan?.() } catch { /* retain the original mutation error */ }
          }
          throw reason
        }
      }, { mutation: true }),
    },
    onRouteReady: event => {
      const sender = (event as Electron.IpcMainInvokeEvent).sender
      if (sender !== mainWindow?.webContents) throw new Error('Desktop route readiness sender is unavailable')
      const window = mainWindow
      if (window === undefined || window.isDestroyed()) throw new Error('Desktop workbench is unavailable')
      markWorkbenchReady(window)
    },
    syncTheme: (event, source) => {
      const sender = (event as Electron.IpcMainInvokeEvent).sender
      const window = mainWindow
      if (window === undefined || window.isDestroyed()
        || sender !== window.webContents
        || !workbenchRouteDelivery.isReady(window)
        || workbenchReadyGeneration !== workbenchGeneration) {
        throw new Error('Desktop theme sync is unavailable while the workbench is navigating')
      }
      const projection = launcherThemeProjector.update(source)
      broadcastLauncherTheme(projection)
      return Object.freeze({ ok: true as const })
    },
  })
  nextController.registerShortcut()
}

async function initializeLauncherLifecycle(): Promise<void> {
  if (launcherLifecycle !== undefined) return
  const repository = requireLauncherPersistence()
  initializeLauncherTray()
  const overlay = launcherController
  if (overlay === undefined) throw new Error('TockLauncher overlay is not initialized')
  launcherLifecycle = new LauncherLifecycleController({
    getSetting: (key, fallback) => {
      const context = launcherDefaultContext()
      const resolved = resolveLauncherSettingDefault(key, context)
      return repository.getSetting(key, resolved === undefined ? fallback : resolved)
    },
    openWorkbenchSettings,
    overlay,
    queue: launcherToggleQueue,
    queueSecureRelaunch,
    requestSecureQuit: reason => { requestSecureQuit(reason) },
    rescan: async () => await launcherRescan?.(),
    setDockVisible: setLauncherDockVisible,
    setTrayVisible: setLauncherTrayVisible,
    updateSetting: async (key, value) => {
      const needsRescan = key === 'general.hotkey.enabled'
      if (needsRescan) launcherOs?.invalidate()
      try {
        await repository.updateSetting(key, value)
        launcherPersistentSetsSync?.()
        await launcherLifecycle?.sync()
        if (needsRescan) await launcherRescan?.()
      } catch (reason) {
        if (needsRescan) {
          try { await launcherRescan?.() } catch { /* retain the original mutation error */ }
        }
        throw reason
      }
    },
  })
  try {
    await launcherLifecycle.sync()
  } catch (error) {
    appendLog('desktop', `failed to initialize launcher lifecycle: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function queueCurrentWorkbenchRoute(window: BrowserWindow): void {
  try {
    workbenchRouteDelivery.deliver(window, { destination: currentWorkbenchDestination })
  } catch (error) {
    appendLog('desktop', `failed to queue current workbench route: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function invalidateWorkbenchReadiness(window: BrowserWindow | undefined = mainWindow): void {
  if (window === undefined || window.isDestroyed()) return
  workbenchGeneration += 1
  workbenchReadyGeneration = -1
  workbenchRouteDelivery.markUnready(window)
  workbenchCommandDelivery.markUnready(window)
  queueCurrentWorkbenchRoute(window)
}

function markWorkbenchReady(window: BrowserWindow): void {
  if (window !== mainWindow || window.isDestroyed()) return
  try {
    workbenchRouteDelivery.markReady(window)
    workbenchCommandDelivery.markReady(window)
  } catch (error) {
    workbenchRouteDelivery.markUnready(window)
    workbenchCommandDelivery.markUnready(window)
    queueCurrentWorkbenchRoute(window)
    throw error
  }
  workbenchReadyGeneration = workbenchGeneration
  void launcherLifecycle?.markReady().catch(error => {
    appendLog('desktop', `failed to mark launcher ready: ${error instanceof Error ? error.message : String(error)}`)
  })
}

function assignMainWindow(window: BrowserWindow): BrowserWindow {
  workbenchGeneration += 1
  workbenchReadyGeneration = -1
  mainWindow = window
  workbenchRouteDelivery.markUnready(window)
  workbenchCommandDelivery.markUnready(window)
  const pendingRoute = routeBeforeWorkbenchWindow ?? { destination: currentWorkbenchDestination }
  routeBeforeWorkbenchWindow = undefined
  workbenchRouteDelivery.deliver(window, pendingRoute)
  const pending = commandsBeforeWorkbenchWindow.splice(0)
  for (const command of pending) workbenchCommandDelivery.deliver(window, command)
  return window
}

function activateWorkbench(): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    if (runtimeUrl === undefined) {
      void showSplash({ error: true, message: 'TockTeam 未运行，请从“DSH”菜单重新启动。' })
      return
    }
    const window = assignMainWindow(createWindow())
    void window.loadURL(runtimeUrl.href).then(flushQueuedOpenRequests).catch(error => {
      appendLog('desktop', `failed to activate workbench: ${error instanceof Error ? error.message : String(error)}`)
    })
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function dispatchWorkbenchRoute(route: LauncherWorkbenchRoute): void {
  const parsedRoute = parseLauncherWorkbenchRoute(route)
  currentWorkbenchDestination = parsedRoute.destination
  if (runtimeUrl === undefined) throw new Error('TockTeam workbench is not on an active runtime page')
  if (mainWindow !== undefined && !mainWindow.isDestroyed() && !isEligibleDesktopRevealWindow()) {
    throw new Error('TockTeam workbench is not on an active runtime page')
  }
  const target = dispatchLauncherRouteToWorkbench({
    createWorkbench: () => {
      if (runtimeUrl === undefined) throw new Error('TockTeam runtime is unavailable')
      const window = assignMainWindow(createWindow())
      void window.loadURL(runtimeUrl.href).catch(error => {
        appendLog('desktop', `failed to load workbench route: ${error instanceof Error ? error.message : String(error)}`)
      })
      return window
    },
    destination: parsedRoute.destination,
    send: (window: BrowserWindow, nextRoute: LauncherWorkbenchRoute) => { workbenchRouteDelivery.deliver(window, nextRoute) },
    workbenchWindow: mainWindow,
  })
  if (mainWindow !== target) assignMainWindow(target)
}

async function ensureWorkbenchWindow(): Promise<void> {
  if (runtimeUrl === undefined) throw new Error('TockTeam workbench is unavailable')
  const current = mainWindow
  const window = current === undefined || current.isDestroyed()
    ? assignMainWindow(createWindow())
    : current
  if (!isEligibleDesktopRevealWindow()) await window.loadURL(runtimeUrl.href)
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

async function openWorkbenchSettings(): Promise<void> {
  await ensureWorkbenchWindow()
  dispatchWorkbenchRoute({ destination: 'tockcoder' })
  sendCommand({ section: 'tocklauncher', type: 'show-settings' })
}

function settingsOperation(canceled = false): Readonly<{ canceled?: boolean; ok: true }> {
  return canceled ? Object.freeze({ canceled: true, ok: true as const }) : Object.freeze({ ok: true as const })
}

async function launcherOpenDialog(options: Electron.OpenDialogOptions): Promise<string | undefined> {
  const owner = mainWindow
  const result = owner === undefined || owner.isDestroyed()
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(owner, options)
  return result.canceled ? undefined : result.filePaths[0]
}

async function launcherSaveDialog(options: Electron.SaveDialogOptions): Promise<string | undefined> {
  const owner = mainWindow
  const result = owner === undefined || owner.isDestroyed()
    ? await dialog.showSaveDialog(options)
    : await dialog.showSaveDialog(owner, options)
  return result.canceled ? undefined : result.filePath
}

function launcherPlatformPathExtension(): 'app' | 'exe' {
  if (process.platform === 'darwin') return 'app'
  if (process.platform === 'win32') return 'exe'
  if (process.platform === 'linux') throw new Error('Custom browsers are not supported on Linux')
  throw new Error('Unsupported TockLauncher platform')
}

async function importLauncherSettings(): Promise<Readonly<{ canceled?: boolean; ok: true }>> {
  const filePath = await launcherOpenDialog({
    properties: ['openFile'],
    title: 'Import TockLauncher Settings',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (filePath === undefined) return settingsOperation(true)
  await requireLauncherPersistence().importSettingsFromPath(filePath)
  launcherPersistentSetsSync?.()
  await launcherLifecycle?.sync()
  queueSecureRelaunch('launcher-settings-import')
  return settingsOperation()
}

async function exportLauncherSettings(): Promise<Readonly<{ canceled?: boolean; ok: true }>> {
  const filePath = await launcherSaveDialog({
    title: 'Export TockLauncher Settings',
    defaultPath: join(app.getPath('documents'), 'tocklauncher-settings.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (filePath === undefined) return settingsOperation(true)
  await requireLauncherPersistence().exportSettingsToPath(filePath)
  return settingsOperation()
}

async function resetLauncherSettings(): Promise<Readonly<{ canceled?: boolean; ok: true }>> {
  const repository = requireLauncherPersistence()
  if (repository.snapshot().settingsSource === 'external' && !repository.externalWriteAvailable) {
    throw new Error('TockLauncher external settings writes are unavailable on this platform')
  }
  await launcherCustomBrowser?.revoke()
  await repository.resetSettings()
  launcherPersistentSetsSync?.()
  await launcherLifecycle?.sync()
  queueSecureRelaunch('launcher-settings-reset')
  return settingsOperation()
}

async function selectExternalLauncherSettings(): Promise<Readonly<{ canceled?: boolean; ok: true }>> {
  const filePath = await launcherOpenDialog({ properties: ['openFile'], title: 'Choose External TockLauncher Settings' })
  if (filePath === undefined) return settingsOperation(true)
  await requireLauncherPersistence().grantExternalSettingsFile(filePath)
  launcherPersistentSetsSync?.()
  await launcherLifecycle?.sync()
  queueSecureRelaunch('launcher-settings-import')
  return settingsOperation()
}

async function selectCustomLauncherBrowser(): Promise<Readonly<{ canceled?: boolean; ok: true }>> {
  if (process.platform === 'linux') throw new Error('Custom browsers are not supported on Linux')
  const extension = launcherPlatformPathExtension()
  const filePath = await launcherOpenDialog({
    properties: [process.platform === 'darwin' ? 'openDirectory' : 'openFile'],
    title: 'Choose TockLauncher Custom Browser',
    filters: [{ name: extension === 'app' ? 'Applications' : 'Applications', extensions: [extension] }],
  })
  if (filePath === undefined) return settingsOperation(true)
  await launcherCustomBrowser?.select(filePath)
  return settingsOperation()
}

async function revokeExternalLauncherSettings(): Promise<Readonly<{ canceled?: boolean; ok: true }>> {
  await requireLauncherPersistence().revokeExternalSettingsFile()
  launcherPersistentSetsSync?.()
  await launcherLifecycle?.sync()
  return settingsOperation()
}

async function revokeCustomLauncherBrowser(): Promise<Readonly<{ canceled?: boolean; ok: true }>> {
  await launcherCustomBrowser?.revoke()
  return settingsOperation()
}

function transferWorkbenchIntent(window: BrowserWindow): void {
  const pendingRoute = workbenchRouteDelivery.takePending(window)
  routeBeforeWorkbenchWindow = pendingRoute ?? { destination: currentWorkbenchDestination }
  commandsBeforeWorkbenchWindow.push(...workbenchCommandDelivery.takePending(window))
  workbenchRouteDelivery.clear(window)
  workbenchCommandDelivery.clear(window)
}

let workbenchRendererRecovery: Promise<void> | undefined

function replaceWorkbenchAfterRendererFailure(window: BrowserWindow): void {
  if (mainWindow === window) {
    transferWorkbenchIntent(window)
    mainWindow = undefined
  }
  if (!window.isDestroyed()) {
    try { window.destroy() } catch { /* renderer failure cleanup is best effort */ }
  }
  if (quitting || transitioning || runtimeUrl === undefined) return
  const replacement = assignMainWindow(createWindow())
  const url = runtimeUrl
  void replacement.loadURL(url.href).then(flushQueuedOpenRequests).catch(error => {
    appendLog('desktop', `failed to replace crashed workbench: ${error instanceof Error ? error.message : String(error)}`)
  })
}

function recoverWorkbenchRenderer(window: BrowserWindow): void {
  if (quitting || transitioning || runtimeUrl === undefined || workbenchRendererRecovery !== undefined) return
  const url = runtimeUrl.href
  const recovery = (async (): Promise<void> => {
    if (mainWindow === window && !window.isDestroyed()) {
      try {
        await window.loadURL(url)
        return
      } catch (error) {
        appendLog('desktop', `failed to reload crashed workbench: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    replaceWorkbenchAfterRendererFailure(window)
  })()
  const tracked = recovery.finally(() => {
    if (workbenchRendererRecovery === tracked) workbenchRendererRecovery = undefined
  })
  workbenchRendererRecovery = tracked
  void tracked.catch(error => {
    appendLog('desktop', `workbench renderer recovery failed: ${error instanceof Error ? error.message : String(error)}`)
  })
}

function createWindow(options: { preview?: boolean; title?: string } = {}): BrowserWindow {
  const icon = windowIconPath()
  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()
  const targetDisplay = displays.find(display => display.internal === false)
    ?? displays.find(display => display.id !== primaryDisplay.id)
    ?? primaryDisplay
  const defaultBackgroundColor = nativeTheme.shouldUseDarkColors ? '#202020' : '#f7f7f5'
  const window = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: options.preview === true ? 1160 : 1280,
    height: options.preview === true ? 760 : 840,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: options.title ?? PRODUCT_NAME,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 16, y: 12 } }
      : {}),
    ...(icon === undefined ? {} : { icon }),
    backgroundColor: defaultBackgroundColor,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webviewTag: true,
    },
  })
  const windowId = String(window.webContents.id)
  window.webContents.setZoomFactor(DEFAULT_UI_ZOOM_FACTOR)
  if (options.preview !== true) window.maximize()
  window.once('ready-to-show', () => { window.show() })
  window.on('closed', () => {
    if (mainWindow === window) {
      launcherController?.destroyWindow()
      desktopCallerAuthorizations.revokeWindow(windowId)
      const pendingRoute = workbenchRouteDelivery.takePending(window)
      routeBeforeWorkbenchWindow = pendingRoute ?? { destination: currentWorkbenchDestination }
      commandsBeforeWorkbenchWindow.push(...workbenchCommandDelivery.takePending(window))
      workbenchRouteDelivery.clear(window)
      workbenchCommandDelivery.clear(window)
      resetTockTutorTheme(window)
      mainWindow = undefined
    }
    if (previewWindow === window) {
      previewWindow = undefined
      previewUrl = undefined
      previewOrigin = undefined
      previewIdentity = undefined
      const supervisor = previewRuntime
      previewRuntime = undefined
      void supervisor?.stop().catch((error: unknown) => {
        appendLog('desktop', `failed to stop closed preview runtime: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const webClipGuest = isWebClipPartition(params.partition)
    if (webClipGuest
      ? params.src !== undefined && params.src !== '' && params.src !== 'about:blank'
      : !isAllowedBrowserNavigation(params.src ?? 'about:blank', runtimeOrigin, previewOrigin)) {
      event.preventDefault()
      return
    }
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    if (webClipGuest) {
      webClipSessions.add(session.fromPartition(params.partition ?? ''))
      webPreferences.additionalArguments = [
        ...(webPreferences.additionalArguments ?? []),
        WEB_CLIP_GUEST_ARGUMENT,
      ]
      webPreferences.disableDialogs = true
      webPreferences.javascript = false
      webPreferences.navigateOnDragDrop = false
      webPreferences.spellcheck = false
      webPreferences.webviewTag = false
    }
  })
  window.webContents.on('did-attach-webview', (_event, contents) => {
    if (webClipSessions.has(contents.session)) {
      configureWebClipGuest(window.webContents, contents)
      return
    }
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (isAllowedBrowserNavigation(url, runtimeOrigin, previewOrigin)) return
      event.preventDefault()
    })
  })
  window.webContents.on('did-finish-load', () => {
    if (mainWindow !== window || runtimeOrigin === undefined) return
    if (originOf(window.webContents.getURL()) !== runtimeOrigin) return
    markWorkbenchReady(window)
  })
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame) {
      desktopCallerAuthorizations.revokeWindow(windowId)
      if (!inPlace && mainWindow === window) {
        invalidateWorkbenchReadiness(window)
        resetTockTutorTheme(window)
      }
    }
  })
  window.webContents.on('render-process-gone', () => {
    desktopCallerAuthorizations.revokeWindow(windowId)
    if (mainWindow !== window) return
    invalidateWorkbenchReadiness(window)
    resetTockTutorTheme(window)
    recoverWorkbenchRenderer(window)
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = options.preview === true ? previewOrigin : runtimeOrigin
    if (isAllowedRuntimeNavigation(url, allowedOrigin, splashPath)) return
    event.preventDefault()
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
  })
  return window
}

async function showSplash(options: { detail?: string; error?: boolean; message?: string } = {}): Promise<void> {
  if (mainWindow === undefined || mainWindow.isDestroyed()) assignMainWindow(createWindow())
  const query: Record<string, string> = {}
  if (options.error === true) query.state = 'error'
  if (options.message !== undefined) query.message = options.message
  if (options.detail !== undefined) query.detail = options.detail.slice(0, 4_000)
  const window = mainWindow
  if (window === undefined || window.isDestroyed()) throw new Error('TockTeam workbench is unavailable')
  await window.loadFile(splashPath, { query })
}

function sendCommand(command: DesktopCommand): boolean {
  const window = mainWindow
  if (window === undefined || window.isDestroyed()) {
    if (commandsBeforeWorkbenchWindow.length >= 128) {
      appendLog('desktop', 'workbench command queue is full')
      return false
    }
    commandsBeforeWorkbenchWindow.push(command)
    return true
  }
  try {
    workbenchCommandDelivery.deliver(window, command)
    return true
  } catch (error) {
    appendLog('desktop', `failed to queue workbench command: ${error instanceof Error ? error.message : String(error)}`)
    // Delivery requeues an unsent command before throwing; only capacity
    // failures remain caller-owned for a later retry.
    return !(error instanceof Error && error.message === 'Workbench command queue is full')
  }
}

function normalizeWorkspacePaths(paths: readonly string[]): string[] {
  const normalized: string[] = []
  for (const candidate of paths) {
    if (!existsSync(candidate)) continue
    const absolute = resolve(candidate)
    const target = statSync(absolute).isDirectory() ? absolute : dirname(absolute)
    if (!normalized.includes(target)) normalized.push(target)
  }
  return normalized
}

function browserDispatchEvent(
  event: DesktopDispatchEvent,
  deliveryId: string,
): import('./contracts.ts').TockTutorDesktopDispatchEvent {
  return event.kind === 'quick-action'
    ? {
        action: event.action,
        deliveryId,
        kind: event.kind,
        operationId: event.identity.operationId,
      }
    : {
        deliveryId,
        kind: event.kind,
        operationId: event.identity.operationId,
        request: event.request,
      }
}

function flushQueuedProtocols(): void {
  const pending = queuedProtocolUrls
  queuedProtocolUrls = []
  for (let index = 0; index < pending.length; index += 1) {
    if (desktopDispatchChannel.publishProtocol(pending[index]!)) continue
    queuedProtocolUrls.push(...pending.slice(index))
    break
  }
}

function flushQueuedPaths(): void {
  const paths = normalizeWorkspacePaths(queuedPaths)
  if (paths.length === 0) {
    queuedPaths = []
    return
  }
  if (sendCommand({ type: 'open-paths', paths })) queuedPaths = []
}

function flushQueuedOpenRequests(): void {
  flushQueuedPaths()
  flushQueuedProtocols()
}

let runtimeStopPromise: Promise<void> | undefined

async function stopRuntimeAndChannels(options: Readonly<{ skipStartWait?: boolean }> = {}): Promise<void> {
  const pendingStart = runtimeStartGate.pending
  runtimeStartGate.invalidate()
  invalidateWorkbenchReadiness()
  if (runtimeStopPromise !== undefined) {
    if (!options.skipStartWait && pendingStart !== undefined) await pendingStart.catch(() => {})
    return await runtimeStopPromise
  }
  const supervisor = runtime
  runtime = undefined
  runtimeUrl = undefined
  runtimeOrigin = undefined
  const operation = (async (): Promise<void> => {
    const results = await Promise.allSettled([
      supervisor?.stop() ?? Promise.resolve(),
      desktopPrintExportChannel.stop(),
      desktopPopOutChannel.stop(),
      desktopMicrophoneChannel.stop(),
      stopDesktopDispatchChannel(),
      desktopCallerChannel.stop(),
      desktopPickerChannel.stop(),
      desktopRevealChannel.stop(),
    ])
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  })()
  const tracked = operation.finally(() => {
    if (runtimeStopPromise === tracked) runtimeStopPromise = undefined
  })
  runtimeStopPromise = tracked
  if (!options.skipStartWait && pendingStart !== undefined) await pendingStart.catch(() => {})
  return await runtimeStopPromise
}

function handleRuntimeExit(exit: RuntimeExit): void {
  appendLog('desktop', `DSH runtime exited: code=${String(exit.code)} signal=${String(exit.signal)}`)
  if (quitting || transitioning) return
  transitioning = true
  void handleUnexpectedRuntimeExit({
    log: error => {
      appendLog('desktop', error instanceof Error ? error.stack ?? error.message : String(error))
    },
    setTransitioning: value => { transitioning = value },
    showStoppedSplash: () => showSplash({
      error: true,
      message: 'TockTeam 已停止。可从“DSH”菜单重新启动。',
      detail: logTail.slice(-12).join('\n'),
    }),
    stopRuntime: () => stopRuntimeAndChannels(),
  }).catch(error => {
    appendLog('desktop', error instanceof Error ? error.stack ?? error.message : String(error))
    transitioning = false
  })
}

async function startRuntimeOwned(token: Readonly<{ isCurrent: () => boolean }>): Promise<void> {
  const ensureCurrent = (): void => {
    if (quitting || !token.isCurrent()) throw new RuntimeStartCancelledError()
  }
  if (runtime !== undefined || runtimeUrl !== undefined) return
  const info = desktopInfo()
  ensureDesktopProfile(info.dshHome)
  try {
    const startChannel = async (start: () => Promise<unknown>): Promise<void> => {
      await start()
      ensureCurrent()
    }
    await startChannel(() => desktopRevealChannel.start())
    await startChannel(() => desktopPickerChannel.start())
    await startChannel(() => desktopCallerChannel.start())
    await startChannel(() => desktopDispatchChannel.start())
    await startChannel(() => desktopMicrophoneChannel.start())
    await startChannel(() => desktopPopOutChannel.start())
    await startChannel(() => desktopPrintExportChannel.start())
    ensureCurrent()
    const supervisor = new DshRuntimeSupervisor(runtimeOptions())
    runtime = supervisor
    supervisor.on('exit', handleRuntimeExit)
    const url = await supervisor.start()
    if (runtime !== supervisor) {
      await supervisor.stop().catch(() => {})
      throw new RuntimeStartCancelledError()
    }
    ensureCurrent()
    runtimeUrl = url
    runtimeOrigin = url.origin
    if (mainWindow === undefined || mainWindow.isDestroyed()) assignMainWindow(createWindow())
    const window = mainWindow
    if (window === undefined || window.isDestroyed()) throw new Error('TockTeam workbench is unavailable')
    await window.loadURL(url.href)
    ensureCurrent()
    flushQueuedOpenRequests()
  } catch (error) {
    await stopRuntimeAndChannels({ skipStartWait: true }).catch(() => {})
    throw error
  }
}

async function startRuntime(): Promise<void> {
  if (quitting) throw new RuntimeStartCancelledError()
  return await runtimeStartGate.start(startRuntimeOwned)
}

async function stopPreviewSurface(): Promise<void> {
  const window = previewWindow
  const supervisor = previewRuntime
  previewWindow = undefined
  previewRuntime = undefined
  previewUrl = undefined
  previewOrigin = undefined
  previewIdentity = undefined
  if (window !== undefined && !window.isDestroyed()) window.destroy()
  await supervisor?.stop()
}

async function startPreviewSurface(input: {
  dshHome: string
  pluginId: string
  sandboxRoot: string
  transactionId: string
}): Promise<void> {
  await stopPreviewSurface()
  const identity = { pluginId: input.pluginId, transactionId: input.transactionId }
  const supervisor = new DshRuntimeSupervisor(previewRuntimeOptions(input))
  previewRuntime = supervisor
  previewIdentity = identity
  supervisor.on('exit', (exit: RuntimeExit) => {
    if (previewRuntime !== supervisor) return
    appendLog('desktop', `preview runtime exited: code=${String(exit.code)} signal=${String(exit.signal)}`)
    const window = previewWindow
    previewRuntime = undefined
    previewWindow = undefined
    previewUrl = undefined
    previewOrigin = undefined
    previewIdentity = undefined
    if (window !== undefined && !window.isDestroyed()) window.destroy()
  })
  try {
    const url = await supervisor.start()
    if (previewRuntime !== supervisor) throw new Error('plugin preview was stopped before it became ready')
    previewUrl = url
    previewOrigin = url.origin
    const window = createWindow({
      preview: true,
      title: `Preview ${input.pluginId} — ${PRODUCT_NAME}`,
    })
    previewWindow = window
    await window.loadURL(url.href)
  } catch (error) {
    await stopPreviewSurface().catch(() => {})
    throw error
  }
}

async function stopLiveForMarketplace(): Promise<void> {
  if (quitting) return
  await stopLiveRuntimeForMarketplace({
    setTransitioning: value => { transitioning = value },
    showSplash: () => showSplash({ message: '正在应用插件 Profile…' }),
    stopRuntime: () => stopRuntimeAndChannels(),
  })
}

async function startLiveForMarketplace(): Promise<void> {
  if (quitting) return
  try {
    await startRuntime()
  } finally {
    transitioning = false
  }
}

async function restartRuntime(message = '正在重新启动 TockTeam…'): Promise<void> {
  if (transitioning) return
  transitioning = true
  try {
    await showSplash({ message })
    await stopRuntimeAndChannels()
    await startRuntime()
  } catch (error) {
    if (!quitting) {
      appendLog('desktop', error instanceof Error ? error.stack ?? error.message : String(error))
      await showSplash({
        error: true,
        message: 'TockTeam Desktop 启动失败。',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    transitioning = false
  }
}

async function selectWorkspacePaths(): Promise<string[]> {
  const options: Electron.OpenDialogOptions = {
    title: '打开 DSH 工作区',
    properties: ['openDirectory', 'createDirectory'],
  }
  const parent = mainWindow
  const result = parent === undefined || parent.isDestroyed()
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(parent, options)
  return result.canceled ? [] : normalizeWorkspacePaths(result.filePaths)
}

async function chooseWorkspace(): Promise<void> {
  const paths = await selectWorkspacePaths()
  if (paths.length > 0) sendCommand({ type: 'open-paths', paths })
}

async function installLocalPlugin(): Promise<void> {
  const options: Electron.OpenDialogOptions = {
    title: '选择 DSH 插件目录',
    buttonLabel: '安装插件',
    properties: ['openDirectory'],
  }
  const parent = mainWindow
  const choice = parent === undefined || parent.isDestroyed()
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(parent, options)
  const pluginPath = choice.filePaths[0]
  if (choice.canceled || pluginPath === undefined) return
  transitioning = true
  try {
    await showSplash({ message: '正在安装 DSH 插件…' })
    await stopRuntimeAndChannels()
    const options = runtimeOptions()
    await runDshCommand(options, ['plugin', '--profile', DESKTOP_PROFILE, 'add', pluginPath])
    await startRuntime()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    appendLog('desktop', detail)
    await showSplash({ error: true, message: '插件安装失败。', detail })
    const errorOptions: Electron.MessageBoxOptions = { type: 'error', message: '插件安装失败', detail }
    const errorParent = mainWindow
    if (errorParent === undefined || errorParent.isDestroyed()) await dialog.showMessageBox(errorOptions)
    else await dialog.showMessageBox(errorParent, errorOptions)
  } finally {
    transitioning = false
  }
}

function createPluginMarketplace(): PluginMarketplaceManager {
  const info = desktopInfo()
  ensureDesktopProfile(info.dshHome)
  const paths = runtimePaths()
  const workingDirectory = join(info.appDataPath, 'plugin-marketplace')
  mkdirSync(workingDirectory, { recursive: true, mode: 0o700 })
  const environment = runtimeEnvironment(paths)
  return new PluginMarketplaceManager({
    appDataPath: info.appDataPath,
    dshHome: info.dshHome,
    platform: new ProductionMarketplacePlatform({
      cliEntry: paths.cliEntry,
      cwd: workingDirectory,
      env: environment,
      nodeBinary: paths.nodeBinary,
      pnpmEntry: paths.pnpmEntry,
      onLog: line => { appendLog('desktop', `[marketplace] ${line}`) },
    }),
    profile: DESKTOP_PROFILE,
    runtime: {
      startLive: startLiveForMarketplace,
      startPreview: startPreviewSurface,
      stopLive: stopLiveForMarketplace,
      stopPreview: stopPreviewSurface,
    },
  })
}

function labels() {
  const zh = app.getLocale().toLowerCase().startsWith('zh')
  return zh ? {
    dsh: 'DSH',
    focus: '聚焦输入框',
    installPlugin: '从文件夹安装插件…',
    newChat: '新建会话',
    dailyNote: '今日日记',
    quickCapture: '快速记录',
    searchNotes: '搜索笔记',
    tockTutor: 'TockTutor',
    openData: '打开 DSH 数据目录',
    openLogs: '打开日志目录',
    openPluginProfile: '打开插件配置目录',
    openWorkspace: '打开工作区…',
    restart: '重新启动 DSH Runtime',
    settings: '设置…',
    showLauncher: '显示 TockLauncher',
    toggleBottomPanel: '切换底部面板',
    togglePanelMaximized: '展开或还原工具侧栏',
    togglePinnedSummary: '切换置顶摘要',
    toggleSidePanel: '切换工具侧栏',
    toggleWorkspacePanel: '切换工作区面板',
    toggleSidebar: '切换侧栏',
    browser: '浏览器',
    files: '文件',
    review: '审查',
    sideChat: '侧边会话',
    trajectory: '轨迹',
  } : {
    dsh: 'DSH',
    focus: 'Focus Composer',
    installPlugin: 'Install Plugin from Folder…',
    newChat: 'New Chat',
    dailyNote: 'Daily Note',
    quickCapture: 'Quick Capture',
    searchNotes: 'Search Notes',
    tockTutor: 'TockTutor',
    openData: 'Open DSH Data Folder',
    openLogs: 'Open Logs Folder',
    openPluginProfile: 'Open Plugin Profile Folder',
    openWorkspace: 'Open Workspace…',
    restart: 'Restart DSH Runtime',
    settings: 'Settings…',
    showLauncher: 'Show TockLauncher',
    toggleBottomPanel: 'Toggle Bottom Panel',
    togglePanelMaximized: 'Expand or Restore Side Panel',
    togglePinnedSummary: 'Toggle Pinned Summary',
    toggleSidePanel: 'Toggle Side Panel',
    toggleWorkspacePanel: 'Toggle Workspace Panel',
    toggleSidebar: 'Toggle Sidebar',
    browser: 'Browser',
    files: 'Files',
    review: 'Review',
    sideChat: 'Side Chat',
    trajectory: 'Trajectory',
  }
}

function setLauncherDockVisible(visible: boolean): void {
  if (process.platform !== 'darwin' || app.dock === undefined) return
  try {
    if (visible) app.dock.show()
    else app.dock.hide()
  } catch (error) {
    appendLog('desktop', `Dock visibility update failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function setLauncherTrayVisible(visible: boolean): void {
  if (launcherTrayOwner === undefined) return
  try {
    launcherTrayOwner.setVisible(visible)
  } catch (error) {
    appendLog('desktop', `tray visibility update failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function initializeLauncherTray(): void {
  if (launcherTrayOwner !== undefined) return
  launcherTrayOwner = new SingleOwnedTray(() => {
    const icon = windowIconPath()
    if (icon === undefined) throw new Error('TockTeam tray icon is unavailable')
    const tray = new Tray(icon)
    try {
      tray.setToolTip(PRODUCT_NAME)
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Show Workbench', click: () => { activateWorkbench() } },
        { label: 'Show TockLauncher', click: () => { void launcherController?.show().catch(() => {}) } },
        { label: 'Settings', click: () => { void openWorkbenchSettings().catch(() => {}) } },
        { type: 'separator' },
        { label: 'Quit TockTeam', click: () => { requestSecureQuit('tray') } },
      ]))
      tray.on('click', () => { activateWorkbench() })
      return tray
    } catch (error) {
      try { tray.destroy() } catch { /* local native cleanup is best effort */ }
      throw error
    }
  })
}

function requestSecureQuit(_reason: 'native-quit' | 'tray' | 'launcher-command-quit' | 'updater-install'): void {
  if (secureTeardownPromise !== undefined) return
  secureTeardownPromise = (async () => {
    quitting = true
    runtimeStartGate.close()
    launcherLifecycle?.dispose()
    launcherController?.dispose()
    launcherIpcDisposer?.()
    launcherIpcDisposer = undefined
    workbenchLauncherIpcDisposer?.()
    workbenchLauncherIpcDisposer = undefined
    launcherUpdater = undefined
    const settingsGateResult = await Promise.allSettled([closeLauncherSettingsOperations()])
    if (settingsGateResult[0]?.status === 'rejected') appendLog('desktop', 'TockLauncher settings shutdown failed')
    const launcherCloseResults = await Promise.allSettled([
      launcherCoreFlush?.() ?? Promise.resolve(),
      launcherCustomBrowser?.close() ?? Promise.resolve(),
    ])
    for (const result of launcherCloseResults) {
      if (result.status === 'rejected') appendLog('desktop', 'TockLauncher shutdown operation failed')
    }
    const repositoryCloseResult = await Promise.allSettled([launcherPersistence?.close() ?? Promise.resolve()])
    for (const result of repositoryCloseResult) {
      if (result.status === 'rejected') appendLog('desktop', result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
    const results = await Promise.allSettled([
      stopRuntimeAndChannels(),
      stopPreviewSurface(),
      marketplaceAgentGateway?.close() ?? Promise.resolve(),
    ])
    for (const result of results) {
      if (result.status === 'rejected') {
        appendLog('desktop', result.reason instanceof Error ? result.reason.message : String(result.reason))
      }
    }
    logStream?.end()
    app.quit()
  })()
  void secureTeardownPromise.catch(error => {
    appendLog('desktop', `secure quit failed: ${error instanceof Error ? error.message : String(error)}`)
    app.quit()
  })
}

function queueSecureRelaunch(reason: 'launcher-settings-import' | 'launcher-settings-reset'): void {
  if (quitting) return
  attemptSecureRelaunch({
    relaunch: () => { app.relaunch() },
    report: error => {
      appendLog('desktop', `relaunch requested by ${reason} failed: ${error instanceof Error ? error.message : String(error)}`)
    },
    requestQuit: () => { requestSecureQuit('native-quit') },
  })
}

async function prepareUpdaterInstall(): Promise<void> {
  launcherUpdaterRuntimeWasActive = runtime !== undefined && runtimeUrl !== undefined
  if (!launcherUpdaterRuntimeWasActive) return
  transitioning = true
  try {
    await stopRuntimeAndChannels()
  } catch (error) {
    transitioning = false
    throw error
  }
}

async function recoverUpdaterInstall(): Promise<void> {
  if (!launcherUpdaterRuntimeWasActive || quitting) return
  launcherUpdaterRuntimeWasActive = false
  try {
    await startRuntime()
  } finally {
    transitioning = false
  }
}

function broadcastLauncherTheme(projection: ReturnType<typeof launcherThemeProjector.get>): void {
  launcherController?.sendTheme(projection)
}

function broadcastDesktopAppUpdateState(state: ReturnType<DesktopAppUpdater['getState']>): void {
  const window = mainWindow
  if (window === undefined || window.isDestroyed() || window.webContents.isDestroyed()) return
  if (runtimeOrigin === undefined || originOf(window.webContents.getURL()) !== runtimeOrigin) return
  window.webContents.send(DESKTOP_APP_UPDATE_CHANNELS.state, state)
}

function buildMenu(): void {
  const text = labels()
  const info = desktopInfo()
  const profile = ensureDesktopProfile(info.dshHome)
  const template: MenuItemConstructorOptions[] = [
    {
      label: PRODUCT_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: text.settings, accelerator: 'CmdOrCtrl+,', click: () => { void openWorkbenchSettings().catch(() => {}) } },
        { label: text.showLauncher, click: () => { void launcherLifecycle?.invokeCommand('show').catch(() => {}) } },
        ...(process.platform === 'darwin'
          ? [
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
          ]
          : []),
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: text.newChat, accelerator: 'CmdOrCtrl+N', click: () => { sendCommand({ type: 'new-session' }) } },
        { label: text.openWorkspace, accelerator: 'CmdOrCtrl+O', click: () => { void chooseWorkspace() } },
        { type: 'separator' },
        {
          label: text.tockTutor,
          submenu: [
            { label: text.newChat, click: () => { desktopDispatchChannel.publishQuickAction('new') } },
            { label: text.dailyNote, click: () => { desktopDispatchChannel.publishQuickAction('daily') } },
            { label: text.quickCapture, click: () => { desktopDispatchChannel.publishQuickAction('capture') } },
            { label: text.searchNotes, click: () => { desktopDispatchChannel.publishQuickAction('search') } },
          ],
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: text.toggleSidebar, accelerator: 'CmdOrCtrl+B', click: () => { sendCommand({ type: 'toggle-sidebar' }) } },
        { label: text.togglePanelMaximized, click: () => { sendCommand({ type: 'toggle-panel-maximized' }) } },
        { label: text.toggleBottomPanel, accelerator: 'CmdOrCtrl+J', click: () => { sendCommand({ type: 'toggle-bottom-panel' }) } },
        { label: text.togglePinnedSummary, click: () => { sendCommand({ type: 'toggle-pinned-summary' }) } },
        { label: text.toggleSidePanel, accelerator: 'Alt+CmdOrCtrl+B', click: () => { sendCommand({ type: 'toggle-side-panel' }) } },
        { type: 'separator' },
        { label: text.review, accelerator: 'Ctrl+Shift+G', click: () => { sendCommand({ type: 'open-review' }) } },
        { label: text.browser, accelerator: 'CmdOrCtrl+T', click: () => { sendCommand({ type: 'open-browser' }) } },
        { label: text.files, accelerator: 'CmdOrCtrl+P', click: () => { sendCommand({ type: 'open-files' }) } },
        { label: text.sideChat, accelerator: 'Alt+CmdOrCtrl+S', click: () => { sendCommand({ type: 'open-side-chat' }) } },
        { label: text.trajectory, click: () => { sendCommand({ type: 'open-trajectory' }) } },
        { label: text.toggleWorkspacePanel, click: () => { sendCommand({ type: 'toggle-workspace-panel' }) } },
        { type: 'separator' },
        { label: text.focus, accelerator: 'CmdOrCtrl+L', click: () => { sendCommand({ type: 'focus-composer' }) } },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: text.dsh,
      submenu: [
        { label: text.restart, accelerator: 'CmdOrCtrl+Shift+R', click: () => { void restartRuntime() } },
        { type: 'separator' },
        { label: text.installPlugin, click: () => { void installLocalPlugin() } },
        { label: text.openPluginProfile, click: () => { void shell.openPath(profile.profileDir) } },
        { type: 'separator' },
        { label: text.openData, click: () => { void shell.openPath(info.dshHome) } },
        { label: text.openLogs, click: () => { void shell.openPath(join(info.appDataPath, 'logs')) } },
        { type: 'separator' },
        {
          label: 'Copy Diagnostics',
          click: () => {
            clipboard.writeText([
              `${PRODUCT_NAME} ${info.version}`,
              `platform=${process.platform} ${process.arch}`,
              `profile=${info.profile}`,
              `runtime=${runtimeUrl?.href ?? 'stopped'}`,
              '',
              ...logTail.slice(-80),
            ].join('\n'))
          },
        },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function assertTrustedMainIpc(event: Electron.IpcMainInvokeEvent): void {
  if (!allowsTrustedMainIpc({
    isMainFrame: event.senderFrame !== null && event.senderFrame === event.sender.mainFrame,
    mainWindowId: mainWindow?.webContents.id,
    runtimeOrigin,
    senderDestroyed: event.sender.isDestroyed(),
    senderId: event.sender.id,
    senderOrigin: originOf(event.senderFrame?.url),
  })) throw new Error('Desktop IPC sender is unavailable')
}

function installIpc(): void {
  ipcMain.handle('desktop:choose-workspace', async event => {
    assertTrustedMainIpc(event)
    return await selectWorkspacePaths()
  })
  ipcMain.handle('desktop:get-info', event => {
    assertTrustedMainIpc(event)
    return desktopInfo(null)
  })
  ipcMain.handle('desktop:get-runtime-snapshot', event => {
    assertTrustedMainIpc(event)
    return desktopRuntimeSnapshot()
  })
  ipcMain.handle(DESKTOP_APP_UPDATE_CHANNELS.getState, (event, ...rawArgs: unknown[]) => {
    assertTrustedMainIpc(event)
    assertNoLauncherIpcArguments(rawArgs)
    if (launcherUpdater === undefined) throw new Error('Desktop updater is not initialized')
    return parseDesktopAppUpdateState(launcherUpdater.getState())
  })
  ipcMain.handle(DESKTOP_APP_UPDATE_CHANNELS.check, async (event, ...rawArgs: unknown[]) => {
    assertTrustedMainIpc(event)
    assertNoLauncherIpcArguments(rawArgs)
    if (launcherUpdater === undefined) throw new Error('Desktop updater is not initialized')
    return parseDesktopAppUpdateActionResult(await launcherUpdater.check())
  })
  ipcMain.handle(DESKTOP_APP_UPDATE_CHANNELS.download, async (event, ...rawArgs: unknown[]) => {
    assertTrustedMainIpc(event)
    assertNoLauncherIpcArguments(rawArgs)
    if (launcherUpdater === undefined) throw new Error('Desktop updater is not initialized')
    return parseDesktopAppUpdateActionResult(await launcherUpdater.download())
  })
  ipcMain.handle(DESKTOP_APP_UPDATE_CHANNELS.install, async (event, ...rawArgs: unknown[]) => {
    assertTrustedMainIpc(event)
    assertNoLauncherIpcArguments(rawArgs)
    if (launcherUpdater === undefined) throw new Error('Desktop updater is not initialized')
    return parseDesktopAppUpdateActionResult(await launcherUpdater.install())
  })
  ipcMain.handle('desktop:launch-on-start:get', event => {
    assertTrustedMainIpc(event)
    return readLaunchOnStart(app)
  })
  ipcMain.handle('desktop:launch-on-start:set', (event, raw: unknown) => {
    assertTrustedMainIpc(event)
    if (typeof raw !== 'boolean') throw new Error('Launch on Start must be a boolean')
    return setLaunchOnStart(app, raw)
  })
  ipcMain.handle('desktop:set-tocktutor-active', (event, raw: unknown) => {
    assertTrustedMainIpc(event)
    if (typeof raw !== 'boolean') throw new Error('TockTutor window state must be a boolean')
    setTockTutorThemeActive(raw)
  })
  ipcMain.handle('desktop:workbench-destination', (event, raw: unknown, ...rawArgs: unknown[]) => {
    assertTrustedMainIpc(event)
    assertNoLauncherIpcArguments(rawArgs)
    currentWorkbenchDestination = parseLauncherDestination(raw)
    return Object.freeze({ ok: true as const })
  })
  ipcMain.handle('desktop:tocktutor-authorize', (event, raw: unknown) => {
    assertTrustedMainIpc(event)
    const frame = event.senderFrame
    if (frame === null) throw new Error('Desktop IPC frame is unavailable')
    const request = resolveDesktopCallerAuthorizationRequest(raw, desktopPickerOwner.nativeVaultSnapshot())
    if (request === undefined) throw new Error('Desktop caller authorization request is invalid')
    return desktopCallerAuthorizations.issue(
      request.operation,
      String(event.sender.id),
      dispatchConsumerId(event.sender, frame),
      request.vault,
    )
  })
  ipcMain.handle('desktop:tocktutor-dispatch-next', async event => {
    assertTrustedMainIpc(event)
    const frame = event.senderFrame
    if (frame === null) throw new Error('Desktop IPC frame is unavailable')
    const lifetime = new AbortController()
    const consumerId = dispatchConsumerId(event.sender, frame)
    const polls = mainDispatchPolls.get(consumerId) ?? new Set<AbortController>()
    polls.add(lifetime)
    mainDispatchPolls.set(consumerId, polls)
    let operationId: string | undefined
    let retained = false
    const cleanup = watchMainDispatch(event.sender, frame, lifetime, () => operationId)
    try {
      const dispatched = await desktopDispatchChannel.next(lifetime.signal, consumerId)
      if (dispatched === undefined) return null
      operationId = dispatched.identity.operationId
      if (lifetime.signal.aborted || event.sender.isDestroyed() || event.senderFrame !== frame) {
        desktopDispatchChannel.rollback(operationId, consumerId)
        return null
      }
      releaseMainDispatchLease(operationId, false)
      const deliveryId = randomBytes(24).toString('base64url')
      mainDispatchLeases.set(operationId, {
        cleanup,
        consumerId,
        deliveryId,
        frame,
        sender: event.sender,
      })
      retained = true
      return browserDispatchEvent(dispatched, deliveryId)
    } finally {
      polls.delete(lifetime)
      if (polls.size === 0) mainDispatchPolls.delete(consumerId)
      if (!retained) cleanup()
    }
  })
  ipcMain.handle('desktop:tocktutor-dispatch-cancel', event => {
    assertTrustedMainIpc(event)
    const frame = event.senderFrame
    if (frame === null) throw new Error('Desktop IPC frame is unavailable')
    abortMainDispatchConsumer(dispatchConsumerId(event.sender, frame), true)
  })
  ipcMain.handle('desktop:tocktutor-dispatch-complete', async (event, raw: unknown) => {
    assertTrustedMainIpc(event)
    const operationId = typeof raw === 'object' && raw !== null
      && typeof (raw as Record<string, unknown>).operationId === 'string'
      ? (raw as { operationId: string }).operationId
      : ''
    const input = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
    const deliveryId = typeof input.deliveryId === 'string' ? input.deliveryId : ''
    const status = input.status
    if (Object.keys(input).some(key => key !== 'deliveryId' && key !== 'operationId' && key !== 'status')
      || status !== 'handled' && status !== 'failed' && status !== 'stale') return 'unavailable'
    const lease = mainDispatchLeases.get(operationId)
    if (lease === undefined || lease.deliveryId !== deliveryId) return 'stale'
    if (lease.sender !== event.sender || lease.frame !== event.senderFrame) {
      releaseMainDispatchLease(operationId, true)
      return 'stale'
    }
    const completion: DesktopDispatchCompletionRequest = { operationId, status }
    const result = await desktopDispatchChannel.complete(
      completion,
      new AbortController().signal,
      lease.consumerId,
    )
    if (result !== undefined && result.status !== 'denied' && result.status !== 'cancelled') {
      releaseMainDispatchLease(operationId, false)
    }
    return result?.status === 'handled' || result?.status === 'stale'
      ? result.status
      : 'unavailable'
  })
  ipcMain.handle('desktop:plugin-marketplace-snapshot', event => {
    assertTrustedMainIpc(event)
    if (marketplace === undefined) throw new Error('plugin marketplace is not initialized')
    return marketplace.getSnapshot()
  })
  ipcMain.handle('desktop:plugin-marketplace-dispatch', async (event, raw: unknown) => {
    assertTrustedMainIpc(event)
    if (marketplace === undefined) throw new Error('plugin marketplace is not initialized')
    return await marketplace.dispatch(parseMarketplaceCommand(raw))
  })
  ipcMain.handle('desktop:web-clip-authorize-document', (event, raw: unknown) => {
    assertTrustedMainIpc(event)
    if (typeof raw !== 'object' || raw === null) throw new Error('Web Clip document request is invalid')
    const input = raw as Record<string, unknown>
    if (!Number.isSafeInteger(input.frameId) || typeof input.html !== 'string') {
      throw new Error('Web Clip document request is invalid')
    }
    return webClipFrames.authorize(input.frameId as number, event.sender.id, input.html)
  })
  ipcMain.handle('desktop:open-external', async (event, raw: unknown) => {
    assertTrustedMainIpc(event)
    if (typeof raw !== 'string') throw new Error('external URL must be a string')
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`unsupported external URL protocol: ${url.protocol}`)
    }
    await shell.openExternal(url.href)
  })
}

async function bootstrap(): Promise<void> {
  app.setName(PRODUCT_NAME)
  if (app.isPackaged) app.setAsDefaultProtocolClient('tocktutor')
  // The visible product name changed in 0.1.x. Keep the existing data path so
  // an in-place upgrade retains sessions, profiles, skins, and credentials.
  // Preserve Electron's standard explicit override for isolated test/deployment profiles.
  if (!app.commandLine.hasSwitch('user-data-dir')) {
    app.setPath('userData', join(app.getPath('appData'), app.isPackaged ? DATA_DIRECTORY : `${DATA_DIRECTORY}-Dev`))
  }
  initializeDesktopPicker()
  app.setAboutPanelOptions({
    applicationName: PRODUCT_NAME,
    applicationVersion: PRODUCT_VERSION,
    version: `TockTeam plugin distribution ${PRODUCT_VERSION}`,
  })
  // Capture the launcher intent before app/runtime readiness; repeated intents
  // collapse into one toggle and never become workspace paths.
  launcherToggleQueue.capture(process.argv)
  const gotLock = app.requestSingleInstanceLock({
    tockTutorProtocolUrls: parseSingleInstanceProtocolUrls(process.argv, undefined),
  })
  if (!gotLock) {
    app.quit()
    return
  }
  app.on('second-instance', (_event, argv, _workingDirectory, additionalData) => {
    const toggle = argv.includes('--toggle')
    const arguments_ = argv.slice(1).filter(argument => !argument.startsWith('-') && argument !== '--toggle')
    queuedProtocolUrls.push(...parseSingleInstanceProtocolUrls(arguments_, additionalData))
    queuedPaths.push(...arguments_.filter(argument => !isTockTutorProtocol(argument)))
    if (toggle) {
      if (launcherLifecycle === undefined) launcherToggleQueue.capture(argv)
      else void launcherLifecycle.handleSecondInstance(argv, activateWorkbench).catch(error => {
        appendLog('desktop', `second-instance toggle failed: ${error instanceof Error ? error.message : String(error)}`)
      })
      flushQueuedOpenRequests()
      return
    }
    activateWorkbench()
    flushQueuedOpenRequests()
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (isTockTutorProtocol(url)) queuedProtocolUrls.push(url)
    if (app.isReady() && runtimeUrl !== undefined) flushQueuedProtocols()
  })
  app.on('open-file', (event, path) => {
    event.preventDefault()
    queuedPaths.push(path)
    if (app.isReady()) flushQueuedPaths()
  })
  await app.whenReady()
  if (!launcherNodeSqliteAvailable()) throw new Error('TockLauncher requires Electron built-in node:sqlite support')

  const info = desktopInfo()
  const logsDir = join(info.appDataPath, 'logs')
  mkdirSync(logsDir, { recursive: true })
  logStream = createWriteStream(join(logsDir, 'desktop.log'), { flags: 'a', mode: 0o600 })
  appendLog('desktop', `${PRODUCT_NAME} ${info.version} starting (${process.arch})`)
  launcherPersistence = await LauncherPersistenceRepository.open({
    secretCodec: createMainLauncherSecretCodec(),
    secureStorageAvailable: launcherSecureStorageAvailable(),
    userDataPath: info.appDataPath,
  })
  launcherCustomBrowser = await LauncherCustomBrowserController.open({
    getSetting: (key, fallback) => requireLauncherPersistence().getSetting(key, fallback),
    launch: launchDetachedLauncherExecutable,
    openDefault: async url => { await shell.openExternal(url) },
    platform: launcherPlatform(),
    userDataPath: info.appDataPath,
  })
  marketplace = createPluginMarketplace()
  marketplaceAgentGateway = await startMarketplaceAgentGateway(marketplace, {
    onError: error => { appendLog('desktop', `[marketplace-agent] ${String(error)}`) },
  })
  initializeLauncher()
  await initializeLauncherLifecycle()
  launcherUpdater = createDesktopAppUpdater({
    app: {
      getVersion: () => app.getVersion(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    },
    onStateChange: broadcastDesktopAppUpdateState,
    prepareInstall: prepareUpdaterInstall,
    recoverInstallFailure: recoverUpdaterInstall,
  })
  launcherLifecycle?.attachUpdater(launcherUpdater)
  installIpc()
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'media' && 'mediaTypes' in details && allowsRuntimeMicrophone({
      isMainFrame: details.isMainFrame,
      mediaTypes: details.mediaTypes,
      requestingOrigin: originOf(details.requestingUrl ?? webContents.getURL()),
      runtimeOrigin,
      webContentsIsMainWindow: webContents === mainWindow?.webContents,
    })) {
      callback(desktopMicrophoneOwner.consumePermission())
      return
    }
    callback(allowsRuntimeClipboardWrite({
      isMainFrame: details.isMainFrame,
      permission,
      requestingOrigin: details.requestingUrl === undefined
        ? originOf(webContents.getURL())
        : originOf(details.requestingUrl),
      ...(details.requestingUrl === undefined ? {} : { requestingUrl: details.requestingUrl }),
      runtimeOrigin,
      webContentsIsMainWindow: webContents === mainWindow?.webContents,
    }))
  })
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'media' && details.mediaType === 'audio'
      && details.isMainFrame
      && webContents === mainWindow?.webContents
      && requestingOrigin === runtimeOrigin) return desktopMicrophoneOwner.checkPermission()
    return allowsRuntimeClipboardWrite({
      isMainFrame: details.isMainFrame,
      permission,
      requestingOrigin,
      ...(details.requestingUrl === undefined ? {} : { requestingUrl: details.requestingUrl }),
      runtimeOrigin,
      webContentsIsMainWindow: webContents === mainWindow?.webContents,
    })
  })
  const browserSession = session.fromPartition('persist:tockteam-browser')
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
  browserSession.setPermissionCheckHandler(() => false)
  buildMenu()
  assignMainWindow(createWindow())
  await showSplash()
  const initialArguments = process.argv.slice(app.isPackaged ? 1 : 2)
    .filter(argument => !argument.startsWith('-') && argument !== '--toggle')
  queuedProtocolUrls.push(...initialArguments.filter(isTockTutorProtocol))
  queuedPaths.push(...initialArguments.filter(argument => !isTockTutorProtocol(argument)))
  await restartRuntime()

  app.on('activate', () => { activateWorkbench() })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', event => {
    if (quitting) return
    event.preventDefault()
    requestSecureQuit('native-quit')
  })
}

void bootstrap().catch(async (error: unknown) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error)
  appendLog('desktop', detail)
  if (app.isReady()) await showSplash({ error: true, message: 'TockTeam Desktop 启动失败。', detail })
  else {
    await app.whenReady()
    await showSplash({ error: true, message: 'TockTeam Desktop 启动失败。', detail })
  }
})
