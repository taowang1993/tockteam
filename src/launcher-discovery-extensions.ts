import { createHash } from 'node:crypto'
import path from 'node:path'
import { isAllowedLauncherVSCodeExecutable } from './launcher-settings-contract.ts'
import { isLauncherImageUrl } from './launcher-image-url.ts'
import type { LauncherActionRecord, LauncherInternalAction, LauncherInternalResultItem } from './launcher-actions.ts'

export const LAUNCHER_DISCOVERY_EXTENSION_IDS = Object.freeze([
  'ApplicationSearch',
  'BrowserBookmarks',
  'JetBrainsToolbox',
  'VSCode',
] as const)

export type LauncherDiscoveryExtensionId = (typeof LAUNCHER_DISCOVERY_EXTENSION_IDS)[number]
export type LauncherDiscoveryPlatform = 'Linux' | 'macOS' | 'Windows'

export type LauncherDiscoveryDefaults = Readonly<{
  ApplicationSearch: Readonly<{
    includeWindowsStoreApps: boolean
    linuxFolders: readonly string[]
    macOsFolders: readonly string[]
    mdfindFilterOption: string
    windowsFileExtensions: readonly string[]
    windowsFolders: readonly string[]
  }>
  BrowserBookmarks: Readonly<{
    browsers: readonly string[]
    iconType: 'browserIcon' | 'favicon'
    searchResultStyle: 'nameAndUrl' | 'nameOnly' | 'urlOnly'
  }>
  VSCode: Readonly<{ command: string; prefix: string; showPath: boolean }>
}>

export function LAUNCHER_DISCOVERY_DEFAULTS(
  platform: LauncherDiscoveryPlatform,
  homePath: string,
  _appDataPath: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LauncherDiscoveryDefaults {
  const linuxDirs = (environment.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
    .split(':')
    .filter(dir => path.isAbsolute(dir) && dir.length <= 4_000 && !/[\0\r\n]/u.test(dir))
    .slice(0, 32)
  return Object.freeze({
    ApplicationSearch: Object.freeze({
      includeWindowsStoreApps: true,
      linuxFolders: Object.freeze(linuxDirs.map(dir => path.join(dir, 'applications'))),
      macOsFolders: Object.freeze(['/System/Applications', '/System/Library/CoreServices', '/Applications', path.join(homePath, 'Applications')]),
      mdfindFilterOption: "kMDItemKind=='Application'",
      windowsFileExtensions: Object.freeze(['lnk']),
      windowsFolders: Object.freeze([
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu',
        path.win32.join(homePath, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu'),
      ]),
    }),
    BrowserBookmarks: Object.freeze({ browsers: Object.freeze([]), iconType: 'favicon', searchResultStyle: 'nameOnly' }),
    VSCode: Object.freeze({ command: platform === 'macOS' ? '/usr/local/bin/code %s' : 'code %s', prefix: 'vscode', showPath: false }),
  })
}

export const launcherDiscoveryDefault = LAUNCHER_DISCOVERY_DEFAULTS

export type LauncherDiscoveryEntry = Readonly<{
  id: string
  kind: 'application'
  name: string
  path: string
}> | Readonly<{
  browserName: string
  id: string
  kind: 'bookmark'
  name: string
  url: string
}> | Readonly<{
  executable: string
  id: string
  installRoot?: string
  kind: 'jetbrains'
  name: string
  projectPath: string
  toolName: string
}> | Readonly<{
  commandArg: '--file-uri' | '--folder-uri'
  fileType: string
  id: string
  kind: 'vscode'
  label?: string
  path: string
  uri: string
}>

export type LauncherDiscoveryScanContext = Readonly<{
  appDataPath: string
  defaults: LauncherDiscoveryDefaults
  environment: Readonly<Record<string, string | undefined>>
  getSetting: <T>(key: string, fallback: T) => T
  homePath: string
  platform: LauncherDiscoveryPlatform
  signal: AbortSignal
}>

export type LauncherDiscoveryScanners = Readonly<Record<
  LauncherDiscoveryExtensionId,
  (context: LauncherDiscoveryScanContext) => Promise<readonly LauncherDiscoveryEntry[]>
>>

export type LauncherDiscoveryEffects = Readonly<{
  confirmOpenApplicationAsAdministrator: (application: Readonly<{ name: string; target: string }>) => Promise<boolean>
  copyText: (text: string) => Promise<void> | void
  launchExecutable: (executable: string, args: readonly string[]) => Promise<void> | void
  openApplication: (target: string) => Promise<void> | void
  openApplicationAsAdministrator: (target: string) => Promise<void> | void
  openExternal: (url: string) => Promise<void> | void
  revealPath: (target: string) => Promise<void> | void
}>

export type LauncherDiscoveryIdentity = Readonly<{ dev: string; ino: string }>

export type LauncherDiscoveryRevalidation = Readonly<{
  application?: (target: string, entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>, identity?: LauncherDiscoveryIdentity) => Promise<boolean> | boolean
  bookmark?: (url: string, entry: Extract<LauncherDiscoveryEntry, { kind: 'bookmark' }>) => Promise<boolean> | boolean
  jetbrains?: (target: Readonly<{ executable: string; projectPath: string; entry: Extract<LauncherDiscoveryEntry, { kind: 'jetbrains' }>; executableIdentity: LauncherDiscoveryIdentity | undefined; projectIdentity: LauncherDiscoveryIdentity | undefined }>) => Promise<boolean> | boolean
  reveal?: (target: string, entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>, identity?: LauncherDiscoveryIdentity) => Promise<boolean> | boolean
  vscode?: (target: Readonly<{ executable: string; uri: string; entry: Extract<LauncherDiscoveryEntry, { kind: 'vscode' }>; identity: LauncherDiscoveryIdentity | undefined }>) => Promise<boolean> | boolean
}>

export type LauncherDiscoveryOptions = Readonly<{
  appDataPath: string
  effects: LauncherDiscoveryEffects
  enabledExtensionIds: () => readonly string[]
  environment?: Readonly<Record<string, string | undefined>>
  getApplicationIcon?: (target: string, signal: AbortSignal) => Promise<string | undefined>
  getSetting: <T>(key: string, fallback: T) => T
  homePath: string
  onProviderError?: (extensionId: LauncherDiscoveryExtensionId, error: Error) => void
  platform: LauncherDiscoveryPlatform
  capturePathIdentity?: (target: string) => Promise<LauncherDiscoveryIdentity | undefined>
  revalidate?: LauncherDiscoveryRevalidation
  scanTimeoutMs?: number
  scanners: LauncherDiscoveryScanners
}>

const HANDLERS = Object.freeze({
  copy: 'copy-discovery-value',
  launch: 'launch-discovered-ide',
  openApplication: 'open-discovered-application',
  openApplicationAsAdministrator: 'open-discovered-application-as-administrator',
  openUrl: 'open-discovered-bookmark',
  reveal: 'reveal-discovered-path',
})

const BROWSER_IMAGE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  Arc: 'browser-arc',
  'Brave Browser': 'browser-brave',
  Firefox: 'browser-firefox',
  'Google Chrome': 'browser-google-chrome',
  'Microsoft Edge': 'browser-microsoft-edge',
  'Yandex Browser': 'browser-yandex',
  Zen: 'browser-zen',
})
const MAX_ITEMS_PER_EXTENSION = 200
const MAX_ICON_CONCURRENCY = 8
const MAX_TEXT_LENGTH = 16_384
const WINDOWS_STORE_PATTERN = /^shell:AppsFolder\\[A-Za-z0-9._!{}-]{1,512}$/u

function bounded(value: unknown, max = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\0\r\n]/u.test(value)
}

function isAbsolute(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value)
}

function isWindowsStore(value: string): boolean { return WINDOWS_STORE_PATTERN.test(value) }
function isApplicationTarget(value: string): boolean { return isAbsolute(value) || isWindowsStore(value) }

function validHttpUrl(value: string): boolean {
  if (!bounded(value, 8_192)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}

function encoded(value: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(Object.freeze({ version: 1, ...value }))
}

function action(handlerKey: string, description: string, value: Readonly<Record<string, unknown>>, extra: Partial<LauncherInternalAction> = {}): LauncherInternalAction {
  return Object.freeze({ argument: encoded(value), description, handlerKey, hideWindowAfterInvocation: true, requiresConfirmation: false, ...extra })
}

function applicationImageKey(platform: LauncherDiscoveryPlatform): string {
  return `application-${platform === 'macOS' ? 'macos' : platform.toLocaleLowerCase('en-US')}`
}

function displayBookmarkName(entry: Extract<LauncherDiscoveryEntry, { kind: 'bookmark' }>, style: unknown): string {
  if (style === 'urlOnly') return entry.url
  if (style === 'nameAndUrl') return `${entry.name} - ${entry.url}`
  return entry.name
}

function parseVSCodeCommand(template: unknown, fallback: string): string {
  const parse = (candidate: unknown): string | undefined => {
    if (!bounded(candidate, 1_024)) return undefined
    const match = /^(?:"([^"]+)"|(\S+))\s+%s$/u.exec(candidate.trim())
    if (!match) return undefined
    const executable = match[1] ?? match[2]
    return executable !== undefined && isAllowedLauncherVSCodeExecutable(executable) ? executable : undefined
  }
  return parse(template) ?? parse(fallback) ?? (isAllowedLauncherVSCodeExecutable(fallback.slice(0, -3).trim()) ? fallback.slice(0, -3).trim() : 'code')
}

function parseArgument(raw: string): Record<string, unknown> {
  if (!bounded(raw)) throw new Error('Invalid discovery action argument')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('Invalid discovery action argument') }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || (parsed as Record<string, unknown>).version !== 1) throw new Error('Invalid discovery action argument')
  return parsed as Record<string, unknown>
}

function actionArgumentsOf(item: LauncherInternalResultItem): readonly string[] {
  return [item.defaultAction, ...(item.additionalActions ?? [])].map(({ argument }) => argument)
}

function revalidationError(kind: string): Error { return new Error(`${kind} target failed immediate revalidation`) }

export function createLauncherDiscoveryExtensions(options: LauncherDiscoveryOptions): Readonly<{
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  loadIndexedItems: (signal: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
  searchInstant: (searchTerm: string) => Promise<Readonly<{ after: readonly LauncherInternalResultItem[]; before: readonly LauncherInternalResultItem[] }>>
}> {
  const environment = options.environment ?? process.env
  const defaults = LAUNCHER_DISCOVERY_DEFAULTS(options.platform, options.homePath, options.appDataPath, environment)
  const scanTimeoutMs = Math.max(1, Math.min(options.scanTimeoutMs ?? 10_000, 60_000))
  const enabled = () => new Set(options.enabledExtensionIds())
  let vscodeRecents: readonly Extract<LauncherDiscoveryEntry, { kind: 'vscode' }>[] = Object.freeze([])
  let knownActionArguments = new Set<string>()
  let knownAdministratorActions = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>; identity: LauncherDiscoveryIdentity | undefined; name: string; target: string }>>()
  let knownApplications = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>; identity: LauncherDiscoveryIdentity | undefined }>>()
  let knownBookmarks = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'bookmark' }> }>>()
  let knownReveals = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>; identity: LauncherDiscoveryIdentity | undefined }>>()
  let knownJetBrains = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'jetbrains' }>; executableIdentity: LauncherDiscoveryIdentity | undefined; projectIdentity: LauncherDiscoveryIdentity | undefined }>>()
  let knownVscode = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'vscode' }>; identity: LauncherDiscoveryIdentity | undefined }>>()
  let scanGeneration = 0

  const context = (signal: AbortSignal): LauncherDiscoveryScanContext => Object.freeze({
    appDataPath: options.appDataPath, defaults, environment, getSetting: options.getSetting,
    homePath: options.homePath, platform: options.platform, signal,
  })

  const scan = async (extensionId: LauncherDiscoveryExtensionId, parentSignal: AbortSignal): Promise<readonly LauncherDiscoveryEntry[]> => {
    const controller = new AbortController()
    const abortFromParent = () => controller.abort(parentSignal.reason instanceof Error ? parentSignal.reason : new Error('TockLauncher discovery scan canceled'))
    if (parentSignal.aborted) abortFromParent()
    else parentSignal.addEventListener('abort', abortFromParent, { once: true })
    const timeout = setTimeout(() => controller.abort(new Error(`${extensionId} discovery scan timed out after ${scanTimeoutMs}ms`)), scanTimeoutMs)
    try {
      if (controller.signal.aborted) throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error('TockLauncher discovery scan canceled')
      const operation = options.scanners[extensionId](context(controller.signal))
      return await new Promise<readonly LauncherDiscoveryEntry[]>((resolve, reject) => {
        const rejectOnAbort = () => reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error(`${extensionId} discovery scan canceled`))
        if (controller.signal.aborted) rejectOnAbort()
        else controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
        void operation.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', rejectOnAbort))
      })
    } finally {
      clearTimeout(timeout)
      parentSignal.removeEventListener('abort', abortFromParent)
    }
  }

  const loadIndexedItems = async (signal: AbortSignal): Promise<readonly LauncherInternalResultItem[]> => {
    const generation = ++scanGeneration
    const ids = LAUNCHER_DISCOVERY_EXTENSION_IDS.filter(id => enabled().has(id))
    const settled = await Promise.allSettled(ids.map(async id => {
      if (id === 'BrowserBookmarks' && options.platform === 'Linux') throw new Error('BrowserBookmarks is unsupported on Linux')
      return await scan(id, signal)
    }))
    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') options.onProviderError?.(ids[index]!, result.reason instanceof Error ? result.reason : new Error('Discovery provider failed'))
    }
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('TockLauncher discovery scan canceled')
    if (generation !== scanGeneration) throw new Error('TockLauncher discovery scan was superseded')

    const actionArguments = new Set<string>()
    const administrators = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>; identity: LauncherDiscoveryIdentity | undefined; name: string; target: string }>>()
    const applications = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>; identity: LauncherDiscoveryIdentity | undefined }>>()
    const bookmarks = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'bookmark' }> }>>()
    const reveals = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>; identity: LauncherDiscoveryIdentity | undefined }>>()
    const jetbrains = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'jetbrains' }>; executableIdentity: LauncherDiscoveryIdentity | undefined; projectIdentity: LauncherDiscoveryIdentity | undefined }>>()
    const vscode = new Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'vscode' }>; identity: LauncherDiscoveryIdentity | undefined }>>()
    const indexed: LauncherInternalResultItem[] = []
    const reportIconError = (() => { let reported = false; return (error: Error) => { if (!reported) { reported = true; options.onProviderError?.('ApplicationSearch', error) } } })()
    const mapEntry = async (
      entry: LauncherDiscoveryEntry,
      map: Set<string>,
      adminMap: Map<string, Readonly<{ entry: Extract<LauncherDiscoveryEntry, { kind: 'application' }>; identity: LauncherDiscoveryIdentity | undefined; name: string; target: string }>>,
    ): Promise<LauncherInternalResultItem | undefined> => {
      if (!bounded(entry.id, 512) || (entry.kind !== 'vscode' && !bounded(entry.name, 512))) return undefined
      if (entry.kind === 'application') {
        if (!bounded(entry.path) || !isApplicationTarget(entry.path)) return undefined
        const identity = !isWindowsStore(entry.path) ? await options.capturePathIdentity?.(entry.path) : undefined
        const admin = options.platform === 'Windows' && !isWindowsStore(entry.path)
          ? action(HANDLERS.openApplicationAsAdministrator, 'Open application as administrator', { kind: 'application-administrator', target: entry.path }, { keyboardShortcut: 'Shift+Enter', requiresConfirmation: true })
          : undefined
        if (admin !== undefined) adminMap.set(admin.argument, Object.freeze({ entry, identity, name: entry.name, target: entry.path }))
        let imageUrl: string | undefined
        try {
          const candidate = await options.getApplicationIcon?.(entry.path, signal)
          if (isLauncherImageUrl(candidate)) imageUrl = candidate
        } catch (error) {
          if (signal.aborted) throw error
          reportIconError(error instanceof Error ? error : new Error('Application icon extraction failed'))
        }
        const reveal = isAbsolute(entry.path)
          ? action(HANDLERS.reveal, 'Show in file explorer', { kind: 'path', path: entry.path }, { keyboardShortcut: options.platform === 'macOS' ? 'Cmd+O' : 'Ctrl+O' })
          : undefined
        const copy = action(HANDLERS.copy, 'Copy file path to clipboard', { kind: 'text', text: entry.path }, { hideWindowAfterInvocation: false, keyboardShortcut: options.platform === 'macOS' ? 'Cmd+C' : 'Ctrl+C' })
        const item = Object.freeze({
          additionalActions: Object.freeze([...(admin === undefined ? [] : [admin]), ...(reveal === undefined ? [] : [reveal]), copy]),
          defaultAction: action(HANDLERS.openApplication, 'Open', { kind: 'application', target: entry.path }),
          description: 'Application', details: entry.path, id: entry.id, imageKey: applicationImageKey(options.platform), ...(imageUrl === undefined ? {} : { imageUrl }), name: entry.name, sourceExtension: 'ApplicationSearch',
        })
        applications.set(item.defaultAction.argument, Object.freeze({ entry, identity }))
        if (reveal !== undefined) reveals.set(reveal.argument, Object.freeze({ entry, identity }))
        actionArgumentsOf(item).forEach(argument => map.add(argument))
        return item
      }
      if (entry.kind === 'bookmark') {
        if (!validHttpUrl(entry.url) || !bounded(entry.browserName, 128)) return undefined
        const style = options.getSetting('extension[BrowserBookmarks].searchResultStyle', defaults.BrowserBookmarks.searchResultStyle)
        const iconType = options.getSetting('extension[BrowserBookmarks].iconType', defaults.BrowserBookmarks.iconType)
        const item = Object.freeze({
          additionalActions: Object.freeze([action(HANDLERS.copy, 'Copy URL to clipboard', { kind: 'text', text: entry.url }, { hideWindowAfterInvocation: false, keyboardShortcut: options.platform === 'macOS' ? 'Cmd+C' : 'Ctrl+C' })]),
          defaultAction: action(HANDLERS.openUrl, 'Open bookmark', { kind: 'url', url: entry.url }),
          description: `${entry.browserName} Bookmark`, details: entry.url, id: entry.id,
          imageKey: iconType === 'browserIcon' ? (BROWSER_IMAGE_KEYS[entry.browserName] ?? 'browser-bookmarks') : 'browser-bookmarks',
          name: displayBookmarkName(entry, style), sourceExtension: 'BrowserBookmarks',
        })
        bookmarks.set(item.defaultAction.argument, Object.freeze({ entry }))
        actionArgumentsOf(item).forEach(argument => map.add(argument))
        return item
      }
      if (entry.kind === 'jetbrains') {
        if (!bounded(entry.executable) || !isAbsolute(entry.executable) || !bounded(entry.projectPath) || !isAbsolute(entry.projectPath) || !bounded(entry.toolName, 128)) return undefined
        const item = Object.freeze({
          defaultAction: action(HANDLERS.launch, `Open ${entry.name} with ${entry.toolName}`, { args: [entry.projectPath], executable: entry.executable, kind: 'executable' }),
          description: `${entry.toolName} Project`, details: entry.projectPath, id: entry.id, imageKey: 'jetbrains-toolbox', name: entry.name, sourceExtension: 'JetBrainsToolbox',
        })
        const executableIdentity = await options.capturePathIdentity?.(entry.executable)
        const projectIdentity = await options.capturePathIdentity?.(entry.projectPath)
        jetbrains.set(item.defaultAction.argument, Object.freeze({ entry, executableIdentity, projectIdentity }))
        actionArgumentsOf(item).forEach(argument => map.add(argument))
        return item
      }
      return undefined
    }

    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') continue
      const extensionId = ids[index]!
      const entries = result.value.slice(0, MAX_ITEMS_PER_EXTENSION)
      if (extensionId === 'VSCode') {
        vscodeRecents = Object.freeze(entries.filter((entry): entry is Extract<LauncherDiscoveryEntry, { kind: 'vscode' }> => entry.kind === 'vscode'))
        continue
      }
      for (let offset = 0; offset < entries.length; offset += MAX_ICON_CONCURRENCY) {
        if (signal.aborted || generation !== scanGeneration) throw signal.reason instanceof Error ? signal.reason : new Error('TockLauncher discovery scan canceled')
        const mapped = await Promise.all(entries.slice(offset, offset + MAX_ICON_CONCURRENCY).map(entry => mapEntry(entry, actionArguments, administrators)))
        indexed.push(...mapped.filter((item): item is LauncherInternalResultItem => item !== undefined))
      }
    }
    if (generation !== scanGeneration) throw new Error('TockLauncher discovery scan was superseded')
    knownActionArguments = actionArguments
    knownAdministratorActions = administrators
    knownApplications = applications
    knownBookmarks = bookmarks
    knownReveals = reveals
    knownJetBrains = jetbrains
    knownVscode = vscode
    const providerCount = ids.filter(id => id !== 'VSCode').length
    return Object.freeze(indexed.slice(0, MAX_ITEMS_PER_EXTENSION * providerCount))
  }

  const searchInstant = async (searchTerm: string) => {
    if (!enabled().has('VSCode')) return Object.freeze({ after: Object.freeze([]), before: Object.freeze([]) })
    const prefixValue = options.getSetting('extension[VSCode].prefix', defaults.VSCode.prefix)
    const prefix = bounded(prefixValue, 64) ? prefixValue.trim() : defaults.VSCode.prefix
    if (prefix.length > 0 && !searchTerm.startsWith(`${prefix} `)) return Object.freeze({ after: Object.freeze([]), before: Object.freeze([]) })
    const term = (prefix.length > 0 ? searchTerm.slice(prefix.length + 1) : searchTerm).trim().toLocaleLowerCase('en-US')
    if (/^(?:\/|~|[A-Za-z]:[\\/])/u.test(term)) return Object.freeze({ after: Object.freeze([]), before: Object.freeze([]) })
    const showPathValue = options.getSetting('extension[VSCode].showPath', defaults.VSCode.showPath)
    const showPath = showPathValue === true
    const executable = parseVSCodeCommand(options.getSetting('extension[VSCode].command', defaults.VSCode.command), defaults.VSCode.command)
    for (const argument of knownVscode.keys()) knownActionArguments.delete(argument)
    knownVscode = new Map()
    const after = await Promise.all(vscodeRecents.filter(entry => term.length === 0 || `${entry.label ?? ''} ${entry.path} ${entry.uri}`.toLocaleLowerCase('en-US').includes(term)).slice(0, MAX_ITEMS_PER_EXTENSION).map(async entry => {
      const id = entry.id.length <= 512 ? entry.id : `vscode:${createHash('sha256').update(entry.id).digest('hex')}`
      const item = Object.freeze({
        defaultAction: action(HANDLERS.launch, `Open ${entry.fileType} in VSCode`, { args: [entry.commandArg, entry.uri], executable, kind: 'executable' }),
        description: entry.fileType, details: entry.path, id, imageKey: entry.commandArg === '--file-uri' ? 'vscode-file' : 'vscode',
        name: `${entry.label ?? path.basename(entry.path)}${showPath ? ` (${entry.path})` : ''}`.slice(0, 512), sourceExtension: 'VSCode',
      })
      const identity = entry.uri.startsWith('file:') ? await options.capturePathIdentity?.(entry.path) : undefined
      knownVscode.set(item.defaultAction.argument, Object.freeze({ entry, identity }))
      knownActionArguments.add(item.defaultAction.argument)
      return item
    }))
    return Object.freeze({ after: Object.freeze(after), before: Object.freeze([]) })
  }

  const executeAction = async (record: LauncherActionRecord): Promise<boolean> => {
    if (!(Object.values(HANDLERS) as readonly string[]).includes(record.handlerKey)) return false
    if (!LAUNCHER_DISCOVERY_EXTENSION_IDS.includes(record.sourceExtension as LauncherDiscoveryExtensionId)) throw new Error('Invalid discovery action source')
    if (!knownActionArguments.has(record.argument)) throw new Error('Discovery action is not from the current main-owned scan')
    const value = parseArgument(record.argument)
    if (record.handlerKey === HANDLERS.copy) {
      if (value.kind !== 'text' || !bounded(value.text)) throw new Error('Invalid copy action')
      await options.effects.copyText(value.text); return true
    }
    if (record.handlerKey === HANDLERS.openApplicationAsAdministrator) {
      const current = knownAdministratorActions.get(record.argument)
      const target = value.kind === 'application-administrator' && bounded(value.target) ? value.target : undefined
      if (options.platform !== 'Windows' || record.sourceExtension !== 'ApplicationSearch' || record.requiresConfirmation !== true || target === undefined || current === undefined || current.target !== target || !isApplicationTarget(target) || isWindowsStore(target)) throw new Error('Invalid application administrator action policy')
      if (options.revalidate?.application !== undefined && !await options.revalidate.application(target, current.entry, current.identity)) throw revalidationError('Application')
      if (await options.effects.confirmOpenApplicationAsAdministrator({ name: current.name, target })) {
        if (options.revalidate?.application !== undefined && !await options.revalidate.application(target, current.entry, current.identity)) throw revalidationError('Application')
        await options.effects.openApplicationAsAdministrator(target)
      }
      return true
    }
    if (record.handlerKey === HANDLERS.openApplication) {
      if (record.sourceExtension !== 'ApplicationSearch' || value.kind !== 'application' || !bounded(value.target) || !isApplicationTarget(value.target)) throw new Error('Invalid application action')
      const current = knownApplications.get(record.argument)
      if (current === undefined || current.entry.path !== value.target) throw new Error('Application action is not from the current main-owned scan')
      if (options.revalidate?.application !== undefined && !await options.revalidate.application(value.target, current.entry, current.identity)) throw revalidationError('Application')
      await options.effects.openApplication(value.target); return true
    }
    if (record.handlerKey === HANDLERS.openUrl) {
      if (record.sourceExtension !== 'BrowserBookmarks' || value.kind !== 'url' || !bounded(value.url) || !validHttpUrl(value.url)) throw new Error('Invalid bookmark action')
      const current = knownBookmarks.get(record.argument)
      if (current === undefined || current.entry.url !== value.url) throw new Error('Bookmark action is not from the current main-owned scan')
      if (options.revalidate?.bookmark !== undefined && !await options.revalidate.bookmark(value.url, current.entry)) throw revalidationError('Bookmark')
      await options.effects.openExternal(value.url); return true
    }
    if (record.handlerKey === HANDLERS.reveal) {
      if (record.sourceExtension !== 'ApplicationSearch' || value.kind !== 'path' || !bounded(value.path) || !isAbsolute(value.path)) throw new Error('Invalid reveal action')
      const current = knownReveals.get(record.argument)
      if (current === undefined || current.entry.path !== value.path) throw new Error('Reveal action is not from the current main-owned scan')
      if (options.revalidate?.reveal !== undefined && !await options.revalidate.reveal(value.path, current.entry, current.identity)) throw revalidationError('Reveal')
      await options.effects.revealPath(value.path); return true
    }
    if ((record.sourceExtension !== 'JetBrainsToolbox' && record.sourceExtension !== 'VSCode') || value.kind !== 'executable' || !bounded(value.executable) || !Array.isArray(value.args) || value.args.length < 1 || value.args.length > 4 || value.args.some(argument => !bounded(argument))) throw new Error('Invalid IDE launch action')
    if (record.sourceExtension === 'JetBrainsToolbox') {
      if (!isAbsolute(value.executable) || value.args.length !== 1 || !isAbsolute(value.args[0]!)) throw new Error('Invalid JetBrains launch action')
      const current = knownJetBrains.get(record.argument)
      if (current === undefined || current.entry.executable !== value.executable || current.entry.projectPath !== value.args[0]) throw new Error('JetBrains action is not from the current main-owned scan')
      if (options.revalidate?.jetbrains !== undefined && !await options.revalidate.jetbrains({ executable: value.executable, projectPath: value.args[0]!, entry: current.entry, executableIdentity: current.executableIdentity, projectIdentity: current.projectIdentity })) throw revalidationError('JetBrains')
    } else {
      if (!isAllowedLauncherVSCodeExecutable(value.executable) || (value.args[0] !== '--file-uri' && value.args[0] !== '--folder-uri') || !bounded(value.args[1])) throw new Error('Invalid VS Code launch action')
      const current = knownVscode.get(record.argument)
      if (current === undefined || current.entry.uri !== value.args[1] || current.entry.commandArg !== value.args[0]) throw new Error('VS Code action is not from the current main-owned scan')
      if (options.revalidate?.vscode !== undefined && !await options.revalidate.vscode({ executable: value.executable, uri: value.args[1]!, entry: current.entry, identity: current.identity })) throw revalidationError('VS Code')
    }
    await options.effects.launchExecutable(value.executable, value.args as string[])
    return true
  }

  return Object.freeze({ executeAction, loadIndexedItems, searchInstant })
}

export function launcherDiscoveryImageKeyForBrowser(browser: string): string { return BROWSER_IMAGE_KEYS[browser] ?? 'browser-bookmarks' }
