import { execFile as nodeExecFile } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { opendir, open, readdir, stat } from 'node:fs/promises'
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type {
  LauncherDiscoveryEntry,
  LauncherDiscoveryExtensionId,
  LauncherDiscoveryScanContext,
  LauncherDiscoveryScanners,
} from './launcher-discovery-extensions.ts'

export const MAX_DISCOVERED_ITEMS = 200
export const MAX_DISCOVERY_FILE_BYTES = 8 * 1024 * 1024
export const MAX_DISCOVERY_EXEC_BUFFER = 16 * 1024 * 1024
const MAX_DESKTOP_ENTRY_BYTES = 256 * 1024
export const MAX_DISCOVERY_DIRECTORY_VISITS = 4_096
const MAX_TEXT_LENGTH = 16_384
const DISCOVERY_READ_CHUNK_BYTES = 64 * 1024

export type LauncherExecFileOptions = Readonly<{
  maxBuffer?: number
  signal?: AbortSignal
  timeout?: number
  windowsHide?: boolean
}>
export type LauncherExecFile = (executable: string, args: readonly string[], options: LauncherExecFileOptions) => Promise<Readonly<{ stdout: string; stderr?: string }>>

const defaultExecFile: LauncherExecFile = async (executable, args, options) => {
  const result = await promisify(nodeExecFile)(executable, [...args], options)
  return { stdout: String(result.stdout), stderr: String(result.stderr ?? '') }
}

type SqliteBookmarkRow = Readonly<{ id?: unknown; name?: unknown; url?: unknown }>
export type LauncherSqliteAdapter = Readonly<{
  readBookmarks: (databasePath: string) => readonly SqliteBookmarkRow[]
  readValue: (databasePath: string, key: string) => unknown
}>

function createNodeSqliteAdapter(): LauncherSqliteAdapter {
  const open = (databasePath: string): DatabaseSync => {
    const metadata = statSync(databasePath, { bigint: true }) as { isFile(): boolean; size: bigint }
    if (!metadata.isFile() || metadata.size > BigInt(MAX_DISCOVERY_FILE_BYTES)) throw new Error('Discovery database exceeds its size limit')
    return new DatabaseSync(databasePath, { readOnly: true })
  }
  return Object.freeze({
    readBookmarks: databasePath => {
      const database = open(databasePath)
      try {
        return database.prepare(`
          SELECT b.guid AS id, b.title AS name, p.url AS url
          FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk
          WHERE b.type = 1 AND p.url LIKE 'http%'
          LIMIT 200
        `).all() as SqliteBookmarkRow[]
      } finally { database.close() }
    },
    readValue: (databasePath, key) => {
      const database = open(databasePath)
      try { return database.prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1').get(key)?.value }
      finally { database.close() }
    },
  })
}

let sqliteAvailability: boolean | undefined
export function launcherNodeSqliteAvailable(): boolean {
  if (sqliteAvailability !== undefined) return sqliteAvailability
  try {
    const database = new DatabaseSync(':memory:')
    database.close()
    sqliteAvailability = true
  } catch { sqliteAvailability = false }
  return sqliteAvailability
}

const defaultSqliteAdapter: LauncherSqliteAdapter = createNodeSqliteAdapter()

export function boundedDiscoveryString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/u.test(value)
}

function boundedStringArray(value: unknown, fallback: readonly string[], maxItems = 32): readonly string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(entry => boundedDiscoveryString(entry, 1_024))
    ? Object.freeze([...value])
    : fallback
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('TockLauncher discovery scan canceled')
}

function isWindowsAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\')
}

function isAbsolute(value: string): boolean {
  return path.isAbsolute(value) || isWindowsAbsolute(value)
}

function isWithin(root: string, candidate: string): boolean {
  const implementation = isWindowsAbsolute(root) || isWindowsAbsolute(candidate) ? path.win32 : path
  const relative = implementation.relative(implementation.resolve(root), implementation.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !implementation.isAbsolute(relative))
}

function isNestedMacApplication(value: string): boolean {
  return value.split('/').slice(0, -1).some(component => component.toLocaleLowerCase('en-US').endsWith('.app'))
}

async function readBoundedText(filePath: string): Promise<string> {
  const handle = await open(filePath, 'r')
  try {
    const metadata = await handle.stat({ bigint: true })
    if (!metadata.isFile() || metadata.size > BigInt(MAX_DISCOVERY_FILE_BYTES)) throw new Error('Discovery file exceeds its size limit')
    const chunks: Buffer[] = []
    let total = 0
    while (total < MAX_DISCOVERY_FILE_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(DISCOVERY_READ_CHUNK_BYTES, MAX_DISCOVERY_FILE_BYTES - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, total)
      if (bytesRead === 0) break
      chunks.push(chunk.subarray(0, bytesRead))
      total += bytesRead
    }
    if (total >= MAX_DISCOVERY_FILE_BYTES) {
      const probe = Buffer.allocUnsafe(1)
      if ((await handle.read(probe, 0, 1, total)).bytesRead > 0) throw new Error('Discovery file exceeds its size limit')
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total)) }
    catch { throw new Error('Discovery file is not valid UTF-8') }
  } finally { await handle.close() }
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

export function parseLinuxDesktopEntry(contents: string, desktopEnvironments: readonly string[]): Readonly<{ name: string }> | undefined {
  if (typeof contents !== 'string' || Buffer.byteLength(contents, 'utf8') > MAX_DESKTOP_ENTRY_BYTES) return undefined
  const start = contents.split(/\r?\n/u).findIndex(line => line.trim() === '[Desktop Entry]')
  if (start < 0) return undefined
  const section: string[] = []
  for (const line of contents.split(/\r?\n/u).slice(start + 1)) {
    if (/^\[.+\]$/u.test(line.trim())) break
    section.push(line)
  }
  const values = new Map<string, string>()
  for (const line of section) {
    if (line.length === 0 || line.trimStart().startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }
  if (values.get('NoDisplay')?.toLocaleLowerCase('en-US') === 'true') return undefined
  if (values.get('Type')?.toLocaleLowerCase('en-US') !== undefined && values.get('Type')?.toLocaleLowerCase('en-US') !== 'application') return undefined
  const list = (key: string): readonly string[] => values.get(key)?.split(';').filter(Boolean) ?? []
  if (list('OnlyShowIn').length > 0 && !list('OnlyShowIn').some(item => desktopEnvironments.includes(item))) return undefined
  if (list('NotShowIn').some(item => desktopEnvironments.includes(item))) return undefined
  const name = values.get('Name')
  return boundedDiscoveryString(name, 512) ? Object.freeze({ name }) : undefined
}

type ParsedBookmark = Readonly<{ id: string; name: string; url: string }>

export function parseChromiumBookmarks(contents: string): readonly ParsedBookmark[] {
  if (typeof contents !== 'string' || Buffer.byteLength(contents, 'utf8') > MAX_DISCOVERY_FILE_BYTES) return Object.freeze([])
  let parsed: unknown
  try { parsed = JSON.parse(contents) } catch { return Object.freeze([]) }
  const results: ParsedBookmark[] = []
  const visit = (value: unknown, depth: number): void => {
    if (results.length >= MAX_DISCOVERED_ITEMS || depth > 32 || typeof value !== 'object' || value === null || Array.isArray(value)) return
    const record = value as Record<string, unknown>
    if (record.type === 'url' && boundedDiscoveryString(record.url, 4_096) && boundedDiscoveryString(record.name, 512)) {
      try {
        const parsedUrl = new URL(record.url)
        if ((parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') && parsedUrl.hostname) {
          const id = boundedDiscoveryString(record.guid, 256) ? record.guid : `${parsedUrl.href}:${record.name}`
          results.push(Object.freeze({ id, name: record.name, url: parsedUrl.href }))
        }
      } catch { /* malformed bookmark is isolated */ }
    }
    if (Array.isArray(record.children)) for (const child of record.children) visit(child, depth + 1)
    if (depth === 0 && typeof record.roots === 'object' && record.roots !== null && !Array.isArray(record.roots)) {
      for (const root of Object.values(record.roots)) visit(root, depth + 1)
    }
  }
  visit(parsed, 0)
  return Object.freeze(results)
}

export function parseJetBrainsRecentProjectPaths(contents: string, homePath: string): readonly string[] {
  if (typeof contents !== 'string' || Buffer.byteLength(contents, 'utf8') > MAX_DISCOVERY_FILE_BYTES || /<!DOCTYPE|<!ENTITY/iu.test(contents) || !boundedDiscoveryString(homePath)) return Object.freeze([])
  const results: string[] = []
  for (const match of contents.matchAll(/<entry\s+[^>]*?\bkey=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*\/?>/giu)) {
    const raw = decodeXml(match[1] ?? match[2] ?? match[3] ?? '').replaceAll('$USER_HOME$', homePath)
    if (!boundedDiscoveryString(raw) || !isAbsolute(raw)) continue
    const implementation = isWindowsAbsolute(raw) ? path.win32 : path
    results.push(implementation.normalize(raw))
    if (results.length >= MAX_DISCOVERED_ITEMS) break
  }
  return Object.freeze(results)
}

type VSCodeRecent = Extract<LauncherDiscoveryEntry, { kind: 'vscode' }>

function vscodeUriToDisplayPath(uri: string): string | undefined {
  try {
    const parsed = new URL(uri)
    if (parsed.protocol === 'file:') return fileURLToPath(parsed)
    if (parsed.protocol === 'vscode-remote:') return decodeURIComponent(uri)
    return undefined
  } catch { return undefined }
}

function supportedVscodeUri(value: string): boolean {
  try {
    const parsed = new URL(value)
    return boundedDiscoveryString(value, 4_096)
      && (parsed.protocol === 'file:' ? parsed.hostname === '' : Boolean(parsed.hostname))
      && !parsed.username && !parsed.password
  } catch { return false }
}

export function parseVSCodeRecentEntries(rawValues: readonly (string | undefined)[]): readonly VSCodeRecent[] {
  const seen = new Set<string>()
  const results: VSCodeRecent[] = []
  for (const raw of rawValues) {
    if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_DISCOVERY_FILE_BYTES) continue
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { continue }
    const list = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      && Array.isArray((parsed as Record<string, unknown>).entries)
      ? (parsed as { entries: unknown[] }).entries
      : []
    for (const value of list) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
      const row = value as Record<string, unknown>
      const workspace = typeof row.workspace === 'object' && row.workspace !== null && !Array.isArray(row.workspace)
        ? row.workspace as Record<string, unknown>
        : undefined
      const fileUri = boundedDiscoveryString(row.fileUri, 4_096) ? row.fileUri : undefined
      const folderUri = boundedDiscoveryString(row.folderUri, 4_096) ? row.folderUri : undefined
      const workspaceUri = boundedDiscoveryString(workspace?.configPath, 4_096) ? workspace.configPath : undefined
      const uri = fileUri ?? folderUri ?? workspaceUri
      if (uri === undefined || seen.has(uri) || !supportedVscodeUri(uri)) continue
      const displayPath = vscodeUriToDisplayPath(uri)
      if (displayPath === undefined || !boundedDiscoveryString(displayPath, 4_096)) continue
      seen.add(uri)
      const remote = uri.startsWith('vscode-remote:')
      const baseFileType = fileUri !== undefined ? 'File' : folderUri !== undefined ? 'Folder' : 'Workspace'
      const commandArg = fileUri !== undefined ? '--file-uri' as const : folderUri !== undefined ? '--folder-uri' as const : '--file-uri' as const
      results.push(Object.freeze({
        commandArg,
        fileType: remote ? `Remote ${baseFileType}` : baseFileType,
        id: `vscode-${commandArg}-${uri}`,
        kind: 'vscode' as const,
        ...(boundedDiscoveryString(row.label, 512) ? { label: row.label } : null),
        path: displayPath,
        uri,
      }))
      if (results.length >= MAX_DISCOVERED_ITEMS) return Object.freeze(results)
    }
  }
  return Object.freeze(results)
}

function browserBookmarkPath(browser: string, context: LauncherDiscoveryScanContext): string | undefined {
  if (context.platform === 'macOS') {
    const macRows: Readonly<Record<string, string>> = {
      Arc: path.join(context.appDataPath, 'Arc', 'User Data', 'Default', 'Bookmarks'),
      'Brave Browser': path.join(context.appDataPath, 'BraveSoftware', 'Brave-Browser', 'Default', 'Bookmarks'),
      'Google Chrome': path.join(context.appDataPath, 'Google', 'Chrome', 'Default', 'Bookmarks'),
      'Microsoft Edge': path.join(context.appDataPath, 'Microsoft', 'Edge', 'Default', 'Bookmarks'),
      'Yandex Browser': path.join(context.appDataPath, 'Yandex', 'YandexBrowser', 'Default', 'Bookmarks'),
    }
    return macRows[browser]
  }
  if (context.platform !== 'Windows') return undefined
  const root = context.environment.LOCALAPPDATA ?? path.win32.join(context.homePath, 'AppData', 'Local')
  const windowsRows: Readonly<Record<string, string>> = {
    Arc: path.win32.join(root, 'Arc', 'User Data', 'Default', 'Bookmarks'),
    'Brave Browser': path.win32.join(root, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks'),
    'Google Chrome': path.win32.join(root, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
    'Microsoft Edge': path.win32.join(root, 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'),
    'Yandex Browser': path.win32.join(root, 'Yandex', 'YandexBrowser', 'User Data', 'Default', 'Bookmarks'),
  }
  return windowsRows[browser]
}

function firefoxProfileRoot(browser: 'Firefox' | 'Zen', context: LauncherDiscoveryScanContext): string {
  if (context.platform === 'macOS') return path.join(context.appDataPath, browser)
  return path.win32.join(context.environment.APPDATA ?? path.win32.join(context.homePath, 'AppData', 'Roaming'), browser === 'Firefox' ? 'Mozilla' : '', browser === 'Firefox' ? 'Firefox' : 'Zen')
}

function parseProfilesIni(contents: string, root: string): readonly string[] {
  const results: string[] = []
  let current: Record<string, string> | undefined
  const commit = () => {
    if (current?.Path !== undefined && boundedDiscoveryString(current.Path, 4_096)) {
      const candidate = current.IsRelative === '0' && isAbsolute(current.Path)
        ? current.Path
        : path.join(root, current.Path)
      const implementation = isWindowsAbsolute(root) || isWindowsAbsolute(candidate) ? path.win32 : path
      if (isAbsolute(candidate) && (current.IsRelative === '0' || isWithin(root, candidate))) results.push(implementation.normalize(candidate))
    }
    current = undefined
  }
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (/^\[Profile\d+\]$/u.test(trimmed)) { commit(); current = {}; continue }
    if (current === undefined) continue
    const separator = line.indexOf('=')
    if (separator > 0) current[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  commit()
  return Object.freeze(results.slice(0, 32))
}

async function scanBrowser(browser: string, context: LauncherDiscoveryScanContext, sqlite: LauncherSqliteAdapter): Promise<readonly Extract<LauncherDiscoveryEntry, { kind: 'bookmark' }>[]> {
  const chromiumPath = browserBookmarkPath(browser, context)
  let bookmarks: readonly ParsedBookmark[]
  if (chromiumPath !== undefined) {
    bookmarks = parseChromiumBookmarks(await readBoundedText(chromiumPath))
  } else if (browser === 'Firefox' || browser === 'Zen') {
    const profileRoot = firefoxProfileRoot(browser, context)
    const profiles = parseProfilesIni(await readBoundedText(path.join(profileRoot, 'profiles.ini')), profileRoot)
    const rows: ParsedBookmark[] = []
    for (const profile of profiles) {
      throwIfAborted(context.signal)
      try {
        rows.push(...sqlite.readBookmarks(path.join(profile, 'places.sqlite')).flatMap(row => {
          if (!boundedDiscoveryString(row.id, 256) || !boundedDiscoveryString(row.name, 512) || !boundedDiscoveryString(row.url, 4_096)) return []
          try {
            const parsed = new URL(row.url)
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname
              ? [{ id: row.id, name: row.name, url: parsed.href }] : []
          } catch { return [] }
        }))
      } catch { /* one broken profile does not fail the browser */ }
      if (rows.length >= MAX_DISCOVERED_ITEMS) break
    }
    bookmarks = rows.slice(0, MAX_DISCOVERED_ITEMS)
  } else throw new Error(`Unsupported browser: ${browser}`)
  return Object.freeze(bookmarks.slice(0, MAX_DISCOVERED_ITEMS).map(bookmark => Object.freeze({
    browserName: browser,
    id: `bookmarks:${browser}:${bookmark.id}`,
    kind: 'bookmark' as const,
    name: bookmark.name,
    url: bookmark.url,
  })))
}

async function scanApplications(context: LauncherDiscoveryScanContext, execFile: LauncherExecFile): Promise<readonly LauncherDiscoveryEntry[]> {
  const defaults = context.defaults.ApplicationSearch
  if (context.platform === 'macOS') {
    const configuredFilter = context.getSetting('extension[ApplicationSearch].mdfindFilterOption', defaults.mdfindFilterOption)
    const filters: Readonly<Record<string, string>> = {
      'kind:application': 'kind:application',
      "kMDItemKind=='Application'": "kMDItemKind == 'Application'",
      "kMDItemContentType=='com.apple.application-bundle'": "kMDItemContentType == 'com.apple.application-bundle'",
    }
    const folders = boundedStringArray(context.getSetting('extension[ApplicationSearch].macOsFolders', defaults.macOsFolders), defaults.macOsFolders)
    const invocation = filters[configuredFilter] ?? filters[defaults.mdfindFilterOption]!
    const { stdout } = await execFile('/usr/bin/mdfind', [invocation], { maxBuffer: MAX_DISCOVERY_EXEC_BUFFER, signal: context.signal, timeout: 10_000 })
    const paths = stdout.split(/\r?\n/u).map(value => value.trim()).filter(value => boundedDiscoveryString(value, 4_096) && isAbsolute(value) && value.toLocaleLowerCase('en-US').endsWith('.app') && folders.some(folder => isWithin(folder, value)) && !isNestedMacApplication(value)).slice(0, MAX_DISCOVERED_ITEMS)
    if (paths.length === 0) {
      let visits = 0
      for (const folder of folders) {
        if (visits >= MAX_DISCOVERY_DIRECTORY_VISITS || paths.length >= MAX_DISCOVERED_ITEMS) break
        let directory
        try { directory = await opendir(folder) } catch { continue }
        try {
          while (visits < MAX_DISCOVERY_DIRECTORY_VISITS && paths.length < MAX_DISCOVERED_ITEMS) {
            throwIfAborted(context.signal)
            const entry = await directory.read()
            if (entry === null) break
            visits++
            if (entry.isDirectory() && entry.name.toLocaleLowerCase('en-US').endsWith('.app')) paths.push(path.join(folder, entry.name))
          }
        } finally { await directory.close().catch(() => undefined) }
      }
    }
    return Object.freeze(paths.map(value => Object.freeze({ id: `applications:${value}`, kind: 'application' as const, name: path.basename(value, '.app'), path: value })))
  }
  if (context.platform === 'Windows') {
    const invocation = windowsApplicationScanInvocation({
      fileExtensions: boundedStringArray(context.getSetting('extension[ApplicationSearch].windowsFileExtensions', defaults.windowsFileExtensions), defaults.windowsFileExtensions, 16),
      folders: boundedStringArray(context.getSetting('extension[ApplicationSearch].windowsFolders', defaults.windowsFolders), defaults.windowsFolders),
      includeStoreApps: context.getSetting('extension[ApplicationSearch].includeWindowsStoreApps', defaults.includeWindowsStoreApps) === true,
    })
    const { stdout } = await execFile(invocation.executable, [...invocation.args], { maxBuffer: MAX_DISCOVERY_EXEC_BUFFER, signal: context.signal, timeout: 10_000, windowsHide: true })
    let parsed: unknown
    try { parsed = JSON.parse(stdout || '[]') } catch { return Object.freeze([]) }
    const rows = Array.isArray(parsed) ? parsed : parsed === null || parsed === undefined ? [] : [parsed]
    return Object.freeze(rows.flatMap(row => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) return []
      const name = (row as Record<string, unknown>).name
      const target = (row as Record<string, unknown>).path
      return boundedDiscoveryString(name, 512) && boundedDiscoveryString(target) ? [Object.freeze({ id: `applications:${target}`, kind: 'application' as const, name, path: target })] : []
    }).slice(0, MAX_DISCOVERED_ITEMS))
  }
  const folders = boundedStringArray(context.getSetting('extension[ApplicationSearch].linuxFolders', defaults.linuxFolders), defaults.linuxFolders)
  const environments = (context.environment.ORIGINAL_XDG_CURRENT_DESKTOP ?? '').split(':').filter(Boolean)
  const results: LauncherDiscoveryEntry[] = []
  let directoryVisits = 0
  for (const folder of folders) {
    throwIfAborted(context.signal)
    if (directoryVisits >= MAX_DISCOVERY_DIRECTORY_VISITS) break
    let directory
    try { directory = await opendir(folder) } catch { continue }
    try {
      while (directoryVisits < MAX_DISCOVERY_DIRECTORY_VISITS) {
        throwIfAborted(context.signal)
        const entry = await directory.read()
        if (entry === null) break
        directoryVisits++
        if (results.length >= MAX_DISCOVERED_ITEMS) return Object.freeze(results)
        if (!entry.isFile() || !entry.name.endsWith('.desktop')) continue
        const target = path.join(folder, entry.name)
        try {
          const parsed = parseLinuxDesktopEntry(await readBoundedText(target), environments)
          if (parsed) results.push(Object.freeze({ id: `applications:${target}`, kind: 'application', name: parsed.name, path: target }))
        } catch { /* malformed entries are isolated */ }
      }
    } finally { await directory.close().catch(() => undefined) }
  }
  return Object.freeze(results)
}

async function scanJetBrains(context: LauncherDiscoveryScanContext): Promise<readonly LauncherDiscoveryEntry[]> {
  const win = context.platform === 'Windows'
  const toolboxRoot = win
    ? path.win32.join(context.environment.LOCALAPPDATA ?? path.win32.join(context.homePath, 'AppData', 'Local'), 'JetBrains', 'Toolbox')
    : context.platform === 'macOS'
      ? path.join(context.homePath, 'Library', 'Application Support', 'JetBrains', 'Toolbox')
      : path.join(context.homePath, '.local', 'share', 'JetBrains', 'Toolbox')
  const configRoot = win
    ? path.win32.join(context.environment.APPDATA ?? context.appDataPath, 'JetBrains')
    : context.platform === 'macOS'
      ? path.join(context.homePath, 'Library', 'Application Support', 'JetBrains')
      : path.join(context.homePath, '.config', 'JetBrains')
  const state = JSON.parse(await readBoundedText(path.join(toolboxRoot, 'state.json'))) as { tools?: unknown }
  const tools = Array.isArray(state.tools) ? state.tools.slice(0, 64) : []
  const results: LauncherDiscoveryEntry[] = []
  const implementation = win ? path.win32 : path
  for (const raw of tools) {
    throwIfAborted(context.signal)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const tool = raw as Record<string, unknown>
    if (!boundedDiscoveryString(tool.displayName, 128) || !boundedDiscoveryString(tool.installLocation, 4_096) || !boundedDiscoveryString(tool.launchCommand, 1_024) || !isAbsolute(tool.installLocation)) continue
    const productRoot = context.platform === 'macOS' ? implementation.join(tool.installLocation, 'Contents', 'Resources') : tool.installLocation
    let product: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(await readBoundedText(implementation.join(productRoot, 'product-info.json')))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
      product = parsed as Record<string, unknown>
    } catch { continue }
    if (!boundedDiscoveryString(product.dataDirectoryName, 256) || /[\\/]/u.test(product.dataDirectoryName)) continue
    let projects: readonly string[]
    try { projects = parseJetBrainsRecentProjectPaths(await readBoundedText(implementation.join(configRoot, product.dataDirectoryName, 'options', 'recentProjects.xml')), context.homePath) }
    catch { continue }
    const executable = implementation.resolve(tool.installLocation, tool.launchCommand)
    if (!isWithin(tool.installLocation, executable)) continue
    for (const projectPath of projects) {
      throwIfAborted(context.signal)
      if (results.length >= MAX_DISCOVERED_ITEMS) return Object.freeze(results)
      const ideaPath = implementation.join(projectPath, '.idea')
      let ideaStat
      try { ideaStat = await stat(ideaPath, { bigint: true }); if (!ideaStat.isDirectory()) continue } catch { continue }
      let name: string | undefined
      try {
        name = (await readBoundedText(implementation.join(ideaPath, '.name'))).trim()
      } catch {
        try { name = (await readdir(ideaPath)).find(candidate => candidate.endsWith('.iml'))?.replace(/\.iml$/u, '') } catch { continue }
      }
      if (!boundedDiscoveryString(name, 512) || !isAbsolute(projectPath)) continue
      results.push(Object.freeze({ executable, id: `jetbrains-toolbox-${projectPath}`, installRoot: tool.installLocation, kind: 'jetbrains', name, projectPath, toolName: tool.displayName }))
    }
  }
  return Object.freeze(results)
}

async function scanVSCode(context: LauncherDiscoveryScanContext, sqlite: LauncherSqliteAdapter): Promise<readonly LauncherDiscoveryEntry[]> {
  const userDatabase = context.platform === 'Windows'
    ? path.win32.join(context.environment.APPDATA ?? path.win32.join(context.homePath, 'AppData', 'Roaming'), 'Code', 'User', 'globalStorage', 'state.vscdb')
    : context.platform === 'macOS'
      ? path.join(context.homePath, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'state.vscdb')
      : path.join(context.homePath, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb')
  const sharedDatabase = context.platform === 'Windows'
    ? path.win32.join(context.homePath, '.vscode-shared', 'sharedStorage', 'state.vscdb')
    : path.join(context.homePath, '.vscode-shared', 'sharedStorage', 'state.vscdb')
  const read = (databasePath: string, key: string): string | undefined => {
    try {
      const value = sqlite.readValue(databasePath, key)
      return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= MAX_DISCOVERY_FILE_BYTES ? value : undefined
    } catch { return undefined }
  }
  throwIfAborted(context.signal)
  return parseVSCodeRecentEntries([
    read(sharedDatabase, 'history.recentlyOpenedPathsList'),
    read(userDatabase, 'recently.opened'),
    read(userDatabase, 'history.recentlyOpenedPathsList'),
  ])
}

export function windowsApplicationScanInvocation(settings: Readonly<{ fileExtensions: readonly string[]; folders: readonly string[]; includeStoreApps: boolean }>): Readonly<{ args: readonly string[]; executable: 'powershell.exe' }> {
  const script = String.raw`$folders = ConvertFrom-Json $args[0]
$extensions = ConvertFrom-Json $args[1]
$includeStore = $args[2] -eq 'true'
$maxResults = 200
$maxVisits = 4096
$deadline = [DateTime]::UtcNow.AddSeconds(8)
$visits = 0
$results = [System.Collections.Generic.List[object]]::new()
$stack = [System.Collections.Generic.Stack[string]]::new()
foreach ($folder in $folders) {
  if ($stack.Count -ge 32) { break }
  if (Test-Path -LiteralPath $folder -PathType Container) { $stack.Push([string]$folder) }
}
while ($stack.Count -gt 0 -and $results.Count -lt $maxResults -and $visits -lt $maxVisits -and [DateTime]::UtcNow -lt $deadline) {
  $folder = $stack.Pop()
  try { $children = @(Get-ChildItem -LiteralPath $folder -Force -ErrorAction Stop | Select-Object -First ($maxVisits - $visits)) } catch { continue }
  foreach ($file in $children) {
    if ($results.Count -ge $maxResults -or $visits -ge $maxVisits -or [DateTime]::UtcNow -ge $deadline) { break }
    $visits++
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
    if ($file.PSIsContainer) { if ($stack.Count -lt 4096) { $stack.Push([string]$file.FullName) }; continue }
    if ($extensions -contains $file.Extension.TrimStart('.')) { $results.Add([pscustomobject]@{ name = $file.BaseName; path = $file.FullName }) }
  }
}
if ($includeStore -and $results.Count -lt $maxResults -and $visits -lt $maxVisits -and [DateTime]::UtcNow -lt $deadline) {
  try { $apps = @(Get-StartApps | Select-Object -First ($maxResults - $results.Count)) } catch { $apps = @() }
  foreach ($app in $apps) {
    if ($results.Count -ge $maxResults -or $visits -ge $maxVisits -or [DateTime]::UtcNow -ge $deadline) { break }
    $visits++
    $appId = [string]$app.AppID
    if ($appId -match '^[A-Za-z0-9._!{}-]{1,512}$') { $results.Add([pscustomobject]@{ name = [string]$app.Name; path = ('shell:AppsFolder\' + $appId) }) }
  }
}
$results | Select-Object -First $maxResults | ConvertTo-Json -Compress`.trim()
  return Object.freeze({ args: Object.freeze(['-NoProfile', '-NonInteractive', '-Command', script, JSON.stringify(settings.folders.slice(0, 32)), JSON.stringify(settings.fileExtensions.slice(0, 16)), String(settings.includeStoreApps)]), executable: 'powershell.exe' })
}

export function createLauncherDiscoveryScanners(options: Readonly<{
  execFile?: LauncherExecFile
  onProviderError?: (extensionId: LauncherDiscoveryExtensionId, error: Error) => void
  sqlite?: LauncherSqliteAdapter
} > = {}): LauncherDiscoveryScanners {
  const execFile = options.execFile ?? defaultExecFile
  const sqlite = options.sqlite ?? defaultSqliteAdapter
  return Object.freeze({
    ApplicationSearch: context => scanApplications(context, execFile),
    BrowserBookmarks: async context => {
      const browsers = boundedStringArray(context.getSetting('extension[BrowserBookmarks].browsers', context.defaults.BrowserBookmarks.browsers), context.defaults.BrowserBookmarks.browsers, 7)
      const settled = await Promise.allSettled(browsers.map(browser => scanBrowser(browser, context, sqlite)))
      throwIfAborted(context.signal)
      const results: LauncherDiscoveryEntry[] = []
      settled.forEach(result => {
        if (result.status === 'fulfilled') results.push(...result.value)
        else options.onProviderError?.('BrowserBookmarks', result.reason instanceof Error ? result.reason : new Error('Browser bookmark scan failed'))
      })
      return Object.freeze(results.slice(0, MAX_DISCOVERED_ITEMS))
    },
    JetBrainsToolbox: scanJetBrains,
    VSCode: context => scanVSCode(context, sqlite),
  })
}
