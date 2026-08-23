import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  shell,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents,
} from 'electron'
import { createWriteStream, existsSync, mkdirSync, statSync, type WriteStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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
  previewSandboxPolicy,
  ProductionMarketplacePlatform,
  withGitHubCredentials,
} from '../plugins/plugin-marketplace/src/host/platform.ts'
import { parseMarketplaceCommand } from '../plugins/plugin-marketplace/src/protocol.ts'
import type { DesktopCommand, DesktopInfo, DesktopRuntimeSnapshot } from './contracts.ts'
import { allowsRuntimeClipboardWrite, originOf } from './permissions.ts'
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

const PRODUCT_NAME = 'TockTeam Desktop'
const DATA_DIRECTORY = 'TockTeam-Desktop'
const DEFAULT_UI_ZOOM_FACTOR = 1.12
const currentDir = dirname(fileURLToPath(import.meta.url))
const PRODUCT_VERSION = resolveProductVersion(join(currentDir, '..'))
const splashPath = join(currentDir, 'splash.html')
const preloadPath = join(currentDir, 'preload.cjs')

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
const logTail: string[] = []
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

let desktopPickerOwner!: DesktopPickerOwner
let desktopPickerChannel!: DesktopPickerChannel

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
    ...process.env,
    DSH_DESKTOP: '1',
    DSH_DESKTOP_APP_DATA: overrides.appDataPath ?? info.appDataPath,
    DSH_DESKTOP_PROFILE: info.profile,
    DSH_DESKTOP_VERSION: info.version,
    DSH_HOME: overrides.dshHome ?? info.dshHome,
    NODE_USE_ENV_PROXY: '1',
    PATH: runtimeSearchPath(paths),
  }
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
  if (overrides.preview !== undefined) {
    environment.DSH_DESKTOP_PREVIEW = '1'
    environment.DSH_DESKTOP_PREVIEW_PLUGIN = overrides.preview.pluginId
    environment.DSH_DESKTOP_PREVIEW_TRANSACTION = overrides.preview.transactionId
  } else if (marketplaceAgentGateway !== undefined) {
    environment[MARKETPLACE_AGENT_URL_ENV] = marketplaceAgentGateway.url
    environment[MARKETPLACE_AGENT_TOKEN_ENV] = marketplaceAgentGateway.token
  }
  return withGitHubCredentials(environment, findGitHubCli(environment))
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
  const sandbox = '/usr/bin/sandbox-exec'
  const launcher = process.platform === 'darwin' && existsSync(sandbox)
    ? { args: ['-p', previewSandboxPolicy(input.sandboxRoot)], command: sandbox }
    : undefined
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
      TMPDIR: temporary,
    },
    ...(launcher === undefined ? {} : { launcher }),
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

function isAllowedRuntimeNavigation(target: string, allowedOrigin: string | undefined): boolean {
  if (target.startsWith('file:')) return true
  if (allowedOrigin === undefined) return false
  try {
    return new URL(target).origin === allowedOrigin
  } catch {
    return false
  }
}

function isAllowedBrowserNavigation(target: string): boolean {
  if (target === 'about:blank') return true
  try {
    const url = new URL(target)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    return url.origin !== runtimeOrigin && url.origin !== previewOrigin
  } catch {
    return false
  }
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

function windowIconPath(): string | undefined {
  // Packaged builds carry the icon beside resources/; dev falls back to the
  // rendered set so the window shows the app icon instead of Electron's.
  const packaged = join(process.resourcesPath, 'tockteam-desktop.png')
  if (existsSync(packaged)) return packaged
  const development = join(currentDir, '..', 'assets', 'icons', '512x512.png')
  return existsSync(development) ? development : undefined
}

function createWindow(options: { preview?: boolean; title?: string } = {}): BrowserWindow {
  const icon = windowIconPath()
  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()
  const targetDisplay = displays.find(display => display.internal === false)
    ?? displays.find(display => display.id !== primaryDisplay.id)
    ?? primaryDisplay
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f7f7f5',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webviewTag: true,
    },
  })
  window.webContents.setZoomFactor(DEFAULT_UI_ZOOM_FACTOR)
  if (options.preview !== true) window.maximize()
  window.once('ready-to-show', () => { window.show() })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
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
      : !isAllowedBrowserNavigation(params.src ?? 'about:blank')) {
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
      if (isAllowedBrowserNavigation(url)) return
      event.preventDefault()
    })
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = options.preview === true ? previewOrigin : runtimeOrigin
    if (isAllowedRuntimeNavigation(url, allowedOrigin)) return
    event.preventDefault()
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
  })
  return window
}

async function showSplash(options: { detail?: string; error?: boolean; message?: string } = {}): Promise<void> {
  if (mainWindow === undefined || mainWindow.isDestroyed()) mainWindow = createWindow()
  const query: Record<string, string> = {}
  if (options.error === true) query.state = 'error'
  if (options.message !== undefined) query.message = options.message
  if (options.detail !== undefined) query.detail = options.detail.slice(0, 4_000)
  await mainWindow.loadFile(splashPath, { query })
}

function sendCommand(command: DesktopCommand): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('desktop:command', command)
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

function flushQueuedPaths(): void {
  const paths = normalizeWorkspacePaths(queuedPaths)
  queuedPaths = []
  if (paths.length > 0) sendCommand({ type: 'open-paths', paths })
}

function handleRuntimeExit(exit: RuntimeExit): void {
  appendLog('desktop', `DSH runtime exited: code=${String(exit.code)} signal=${String(exit.signal)}`)
  if (quitting || transitioning) return
  transitioning = true
  runtimeUrl = undefined
  runtimeOrigin = undefined
  void Promise.allSettled([
    desktopRevealChannel.stop(),
    desktopPickerChannel.stop(),
  ]).then(async () => {
    await showSplash({
      error: true,
      message: 'TockTeam 已停止。可从“DSH”菜单重新启动。',
      detail: logTail.slice(-12).join('\n'),
    })
  }).finally(() => { transitioning = false })
}

async function startRuntime(): Promise<void> {
  const info = desktopInfo()
  ensureDesktopProfile(info.dshHome)
  await desktopRevealChannel.start()
  await desktopPickerChannel.start()
  try {
    const supervisor = new DshRuntimeSupervisor(runtimeOptions())
    runtime = supervisor
    supervisor.on('exit', handleRuntimeExit)
    const url = await supervisor.start()
    runtimeUrl = url
    runtimeOrigin = url.origin
    if (mainWindow === undefined || mainWindow.isDestroyed()) mainWindow = createWindow()
    await mainWindow.loadURL(url.href)
    flushQueuedPaths()
  } catch (error) {
    await desktopPickerChannel.stop()
    await desktopRevealChannel.stop()
    throw error
  }
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
  transitioning = true
  await showSplash({ message: '正在应用插件 Profile…' })
  await runtime?.stop()
  await desktopPickerChannel.stop()
  await desktopRevealChannel.stop()
  runtime = undefined
  runtimeUrl = undefined
  runtimeOrigin = undefined
}

async function startLiveForMarketplace(): Promise<void> {
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
    await runtime?.stop()
    await desktopPickerChannel.stop()
    await desktopRevealChannel.stop()
    runtime = undefined
    runtimeUrl = undefined
    runtimeOrigin = undefined
    await startRuntime()
  } catch (error) {
    appendLog('desktop', error instanceof Error ? error.stack ?? error.message : String(error))
    await showSplash({
      error: true,
      message: 'TockTeam Desktop 启动失败。',
      detail: error instanceof Error ? error.message : String(error),
    })
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
    await runtime?.stop()
    await desktopPickerChannel.stop()
    await desktopRevealChannel.stop()
    runtime = undefined
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
    openData: '打开 DSH 数据目录',
    openLogs: '打开日志目录',
    openPluginProfile: '打开插件配置目录',
    openWorkspace: '打开工作区…',
    restart: '重新启动 DSH Runtime',
    settings: '设置…',
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
    openData: 'Open DSH Data Folder',
    openLogs: 'Open Logs Folder',
    openPluginProfile: 'Open Plugin Profile Folder',
    openWorkspace: 'Open Workspace…',
    restart: 'Restart DSH Runtime',
    settings: 'Settings…',
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
        { label: text.settings, accelerator: 'CmdOrCtrl+,', click: () => { sendCommand({ type: 'show-settings' }) } },
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

function installIpc(): void {
  ipcMain.handle('desktop:choose-workspace', async () => await selectWorkspacePaths())
  ipcMain.handle('desktop:get-info', event => {
    const preview = previewWindow?.webContents.id === event.sender.id ? previewIdentity ?? null : null
    return desktopInfo(preview)
  })
  ipcMain.handle('desktop:get-runtime-snapshot', () => desktopRuntimeSnapshot())
  ipcMain.handle('desktop:plugin-marketplace-snapshot', () => {
    if (marketplace === undefined) throw new Error('plugin marketplace is not initialized')
    return marketplace.getSnapshot()
  })
  ipcMain.handle('desktop:plugin-marketplace-dispatch', async (_event, raw: unknown) => {
    if (marketplace === undefined) throw new Error('plugin marketplace is not initialized')
    return await marketplace.dispatch(parseMarketplaceCommand(raw))
  })
  ipcMain.handle('desktop:web-clip-authorize-document', (event, raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('Web Clip document request is invalid')
    const input = raw as Record<string, unknown>
    if (!Number.isSafeInteger(input.frameId) || typeof input.html !== 'string') {
      throw new Error('Web Clip document request is invalid')
    }
    return webClipFrames.authorize(input.frameId as number, event.sender.id, input.html)
  })
  ipcMain.handle('desktop:open-external', async (_event, raw: unknown) => {
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
  // The visible product name changed in 0.1.x. Keep the existing data path so
  // an in-place upgrade retains sessions, profiles, skins, and credentials.
  app.setPath('userData', join(app.getPath('appData'), app.isPackaged ? DATA_DIRECTORY : `${DATA_DIRECTORY}-Dev`))
  initializeDesktopPicker()
  app.setAboutPanelOptions({
    applicationName: PRODUCT_NAME,
    applicationVersion: PRODUCT_VERSION,
    version: `TockTeam plugin distribution ${PRODUCT_VERSION}`,
  })
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }
  app.on('second-instance', (_event, argv) => {
    queuedPaths.push(...argv.slice(1).filter(argument => !argument.startsWith('-')))
    if (mainWindow === undefined || mainWindow.isDestroyed()) {
      mainWindow = createWindow()
      if (runtimeUrl !== undefined) void mainWindow.loadURL(runtimeUrl.href).then(flushQueuedPaths)
    } else {
      mainWindow.show()
      mainWindow.focus()
      flushQueuedPaths()
    }
  })
  app.on('open-file', (event, path) => {
    event.preventDefault()
    queuedPaths.push(path)
    if (app.isReady()) flushQueuedPaths()
  })
  await app.whenReady()

  const info = desktopInfo()
  const logsDir = join(info.appDataPath, 'logs')
  mkdirSync(logsDir, { recursive: true })
  logStream = createWriteStream(join(logsDir, 'desktop.log'), { flags: 'a', mode: 0o600 })
  appendLog('desktop', `${PRODUCT_NAME} ${info.version} starting (${process.arch})`)
  marketplace = createPluginMarketplace()
  marketplaceAgentGateway = await startMarketplaceAgentGateway(marketplace, {
    onError: error => { appendLog('desktop', `[marketplace-agent] ${String(error)}`) },
  })
  installIpc()
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
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
  mainWindow = createWindow()
  await showSplash()
  const initialArguments = process.argv.slice(app.isPackaged ? 1 : 2)
  queuedPaths.push(...initialArguments.filter(argument => !argument.startsWith('-')))
  await restartRuntime()

  app.on('activate', () => {
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
      mainWindow.show()
      return
    }
    mainWindow = createWindow()
    if (runtimeUrl !== undefined) void mainWindow.loadURL(runtimeUrl.href).then(flushQueuedPaths)
    else void showSplash({ error: true, message: 'TockTeam 未运行，请从“DSH”菜单重新启动。' })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void Promise.allSettled([
      runtime?.stop() ?? Promise.resolve(),
      desktopPickerChannel.stop(),
      desktopRevealChannel.stop(),
      stopPreviewSurface(),
      marketplaceAgentGateway?.close() ?? Promise.resolve(),
    ]).then(results => {
      for (const result of results) {
        if (result.status === 'rejected') {
          appendLog('desktop', result.reason instanceof Error ? result.reason.message : String(result.reason))
        }
      }
    }).finally(() => {
      logStream?.end()
      app.quit()
    })
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
