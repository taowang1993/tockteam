import { execFile as nodeExecFile } from 'node:child_process'
import type { Dirent } from 'node:fs'
import { lstat, opendir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { isAllowedLauncherEverythingCliPath } from './launcher-settings-contract.ts'

export type LauncherFileSearchPlatform = 'Linux' | 'macOS' | 'Windows'
export type LauncherFileSearchIdentity = Readonly<{ dev: string; ino: string }>
export type LauncherFileSearchEntry = Readonly<{
  identity: LauncherFileSearchIdentity
  path: string
  type: 'file' | 'folder'
}>
export type LauncherSimpleFileSearchFolder = Readonly<{
  excludeHiddenFiles?: boolean
  id: string
  path: string
  recursive: boolean
  searchFor: 'files' | 'folders' | 'filesAndFolders'
}>

export type LauncherExecFileOptions = Readonly<{
  maxBuffer: number
  shell?: false
  signal: AbortSignal
  timeout: number
  windowsHide?: boolean
}>
export type LauncherExecFile = (
  executable: string,
  args: readonly string[],
  options: LauncherExecFileOptions,
) => Promise<Readonly<{ stdout: string }>>
export type LauncherFileSearchScanners = Readonly<{
  queryFileSearch: (input: Readonly<{
    everythingCliFilePath: string
    homePath: string
    maxResults: number
    platform: LauncherFileSearchPlatform
    searchTerm: string
    signal: AbortSignal
  }>) => Promise<readonly LauncherFileSearchEntry[]>
  scanSimpleFolder: (input: Readonly<{
    folder: LauncherSimpleFileSearchFolder
    homePath: string
    maxResults: number
    maxVisitedEntries: number
    scanTimeoutMs?: number
    signal: AbortSignal
  }>) => Promise<readonly LauncherFileSearchEntry[]>
  validatePath: (input: Readonly<{
    expectedKind?: LauncherFileSearchEntry['type']
    homePath: string
    identity?: LauncherFileSearchIdentity
    path: string
    platform: LauncherFileSearchPlatform
    root?: string
    signal: AbortSignal
  }>) => Promise<boolean>
}>

const MAX_QUERY_OUTPUT_BYTES = 2 * 1024 * 1024
const MAX_SEARCH_TERM_LENGTH = 512
const MAX_ROW_LENGTH = 16_384
const MAX_RESULTS = 200
const MAX_FILE_SEARCH_RESULTS = 100
const MAX_SIMPLE_VISITS = 10_000
const MAX_SIMPLE_QUEUE = 1_024
const MAX_SIMPLE_DEPTH = 32
const DEFAULT_SCAN_TIMEOUT_MS = 10_000
const MAX_SCAN_TIMEOUT_MS = 60_000
const QUERY_TIMEOUT_MS = 8_000

const defaultExecFile: LauncherExecFile = async (executable, args, options) => {
  const result = await promisify(nodeExecFile)(executable, [...args], {
    ...options,
    encoding: 'utf8' as const,
  })
  return { stdout: String(result.stdout) }
}

function boundedText(value: unknown, maxLength = MAX_ROW_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/u.test(value)
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('TockLauncher file search canceled')
}

function pathApi(platform: LauncherFileSearchPlatform): typeof path.posix | typeof path.win32 {
  return platform === 'Windows' ? path.win32 : path.posix
}

function isWithinHome(platform: LauncherFileSearchPlatform, homePath: string, candidate: string, strict = false): boolean {
  const api = pathApi(platform)
  if (!api.isAbsolute(homePath) || !api.isAbsolute(candidate)) return false
  const relative = api.relative(api.resolve(homePath), api.resolve(candidate))
  return (!strict && relative === '') || (relative !== '' && !relative.startsWith('..') && !api.isAbsolute(relative))
}

function identityPart(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value.toString(10) : undefined
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined
  if (typeof value !== 'string' || !/^[0-9]+$/u.test(value)) return undefined
  return value.replace(/^0+(?=\d)/u, '')
}

function captureIdentity(stats: Readonly<{ dev: unknown; ino: unknown }>): LauncherFileSearchIdentity | undefined {
  const dev = identityPart(stats.dev)
  const ino = identityPart(stats.ino)
  return dev === undefined || ino === undefined ? undefined : Object.freeze({ dev, ino })
}

function sameIdentity(left: LauncherFileSearchIdentity, right: LauncherFileSearchIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function requestedRelative(
  platform: LauncherFileSearchPlatform,
  root: string,
  candidate: string,
): string {
  const api = pathApi(platform)
  return api.relative(api.resolve(root), api.resolve(candidate))
}

async function resolvesWithoutSymlinkEscape(
  platform: LauncherFileSearchPlatform,
  homePath: string,
  candidate: string,
): Promise<Readonly<{ canonical: string; identity: LauncherFileSearchIdentity }> | undefined> {
  const api = pathApi(platform)
  try {
    const [canonicalHome, canonicalCandidate] = await Promise.all([realpath(homePath), realpath(candidate)])
    const requested = requestedRelative(platform, homePath, candidate)
    const canonical = requestedRelative(platform, canonicalHome, canonicalCandidate)
    if (requested !== canonical || !isWithinHome(platform, canonicalHome, canonicalCandidate, true)) return undefined
    const selected = await lstat(canonicalCandidate, { bigint: true })
    const identity = captureIdentity(selected)
    if (selected.isSymbolicLink() || identity === undefined) return undefined
    return Object.freeze({ canonical: api.normalize(canonicalCandidate), identity })
  } catch { return undefined }
}

async function trustedEntry(
  platform: LauncherFileSearchPlatform,
  homePath: string,
  candidate: string,
): Promise<LauncherFileSearchEntry | undefined> {
  const api = pathApi(platform)
  try {
    const selected = await lstat(candidate, { bigint: true })
    if (selected.isSymbolicLink() || (!selected.isFile() && !selected.isDirectory())) return undefined
    const resolved = await resolvesWithoutSymlinkEscape(platform, homePath, candidate)
    if (resolved === undefined) return undefined
    const canonicalStats = await lstat(resolved.canonical, { bigint: true })
    if (canonicalStats.isSymbolicLink()) return undefined
    const identity = captureIdentity(canonicalStats)
    if (identity === undefined) return undefined
    return Object.freeze({
      identity,
      path: api.normalize(candidate),
      type: canonicalStats.isDirectory() ? 'folder' : 'file',
    })
  } catch { return undefined }
}

function assertNotTimedOut(deadline: number): void {
  if (Date.now() >= deadline) throw new Error('Simple File Search scan timed out')
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum
}

export function macFileSearchInvocation(searchTerm: string): Readonly<{ args: readonly string[]; executable: 'mdfind' }> {
  return Object.freeze({ args: Object.freeze(['-name', searchTerm]), executable: 'mdfind' })
}

export function windowsFileSearchInvocation(
  everythingCliFilePath: string,
  homePath: string,
  searchTerm: string,
  maxResults: number,
): Readonly<{ args: readonly string[]; executable: string }> {
  if (!isAllowedLauncherEverythingCliPath(everythingCliFilePath) || everythingCliFilePath.length === 0) {
    throw new Error('Everything CLI file path is outside the finite executable allowlist')
  }
  if (!path.win32.isAbsolute(homePath) || /[\0\r\n]/u.test(homePath)) throw new Error('Invalid Windows home path')
  const literalSearchTerm = searchTerm.trim().replaceAll('"', '')
  if (literalSearchTerm.length === 0 || literalSearchTerm.length > MAX_SEARCH_TERM_LENGTH || /[\0\r\n]/u.test(literalSearchTerm)) {
    throw new Error('Everything search term is invalid')
  }
  const homeScope = `${path.win32.resolve(homePath).replace(/[\\/]+$/u, '')}\\`
  return Object.freeze({
    args: Object.freeze(['-max-results', String(clamp(maxResults, 1, MAX_FILE_SEARCH_RESULTS)), `path:"${homeScope}" "${literalSearchTerm}"`]),
    executable: everythingCliFilePath,
  })
}

function includesType(type: LauncherFileSearchEntry['type'], searchFor: LauncherSimpleFileSearchFolder['searchFor']): boolean {
  return searchFor === 'filesAndFolders' || searchFor === `${type}s`
}

async function ensureTrustedDirectory(
  platform: LauncherFileSearchPlatform,
  homePath: string,
  directoryPath: string,
  signal: AbortSignal,
  deadline: number,
): Promise<boolean> {
  throwIfAborted(signal); assertNotTimedOut(deadline)
  const api = pathApi(platform)
  try {
    const selected = await lstat(directoryPath, { bigint: true })
    if (selected.isSymbolicLink() || !selected.isDirectory()) return false
    await realpath(directoryPath)
    return (await resolvesWithoutSymlinkEscape(platform, homePath, directoryPath)) !== undefined
  } catch { return false }
}

export async function scanSimpleFileSearchFolder(input: Readonly<{
  folder: LauncherSimpleFileSearchFolder
  homePath: string
  maxResults: number
  maxVisitedEntries: number
  scanTimeoutMs?: number
  signal: AbortSignal
}>): Promise<readonly LauncherFileSearchEntry[]> {
  throwIfAborted(input.signal)
  const platform: LauncherFileSearchPlatform = /^[A-Za-z]:[\\/]/u.test(input.homePath) ? 'Windows' : 'macOS'
  const api = pathApi(platform)
  const timeoutMs = clamp(input.scanTimeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS, 1, MAX_SCAN_TIMEOUT_MS)
  const deadline = Date.now() + timeoutMs
  if (!api.isAbsolute(input.homePath) || !api.isAbsolute(input.folder.path) || !isWithinHome(platform, input.homePath, input.folder.path, true)) {
    throw new Error(`Simple File Search root is outside the allowed home scope: ${input.folder.path}`)
  }
  const rootStat = await lstat(input.folder.path, { bigint: true }).catch(() => undefined)
  if (rootStat === undefined || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`Simple File Search root is not a real directory: ${input.folder.path}`)
  }
  assertNotTimedOut(deadline); throwIfAborted(input.signal)
  const rootResolved = await resolvesWithoutSymlinkEscape(platform, input.homePath, input.folder.path)
  if (rootResolved === undefined) {
    throw new Error(`Simple File Search root resolves outside the allowed home scope: ${input.folder.path}`)
  }

  const maxResults = clamp(input.maxResults, 1, MAX_RESULTS)
  const maxVisitedEntries = Math.max(maxResults, clamp(input.maxVisitedEntries, 1, MAX_SIMPLE_VISITS))
  const queue: Array<Readonly<{ depth: number; directoryPath: string }>> = [Object.freeze({ depth: 0, directoryPath: api.normalize(input.folder.path) })]
  const results: LauncherFileSearchEntry[] = []
  let queueIndex = 0
  let visitedEntries = 0

  while (queueIndex < queue.length && results.length < maxResults && visitedEntries < maxVisitedEntries) {
    throwIfAborted(input.signal); assertNotTimedOut(deadline)
    const current = queue[queueIndex++]!
    if (!await ensureTrustedDirectory(platform, input.homePath, current.directoryPath, input.signal, deadline)) continue
    let directory
    try { directory = await opendir(current.directoryPath) } catch { continue }
    const entries: Dirent[] = []
    try {
      while (visitedEntries < maxVisitedEntries) {
        throwIfAborted(input.signal); assertNotTimedOut(deadline)
        const entry = await directory.read()
        if (entry === null) break
        visitedEntries += 1
        entries.push(entry)
      }
    } finally { await directory.close().catch(() => undefined) }
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      throwIfAborted(input.signal); assertNotTimedOut(deadline)
      if (results.length >= maxResults) break
      if (input.folder.excludeHiddenFiles === true && entry.name.startsWith('.')) continue
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) continue
      const entryPath = api.join(current.directoryPath, entry.name)
      const trusted = await trustedEntry(platform, input.homePath, entryPath)
      if (trusted === undefined) continue
      if (includesType(trusted.type, input.folder.searchFor)) results.push(trusted)
      if (trusted.type === 'folder' && input.folder.recursive && current.depth < MAX_SIMPLE_DEPTH
        && queue.length - queueIndex < MAX_SIMPLE_QUEUE) {
        queue.push(Object.freeze({ depth: current.depth + 1, directoryPath: trusted.path }))
      }
    }
  }
  return Object.freeze(results)
}

async function validateEverythingExecutable(filePath: string): Promise<boolean> {
  if (!isAllowedLauncherEverythingCliPath(filePath) || filePath.length === 0) return false
  try {
    const selected = await lstat(filePath, { bigint: true })
    if (selected.isSymbolicLink() || !selected.isFile()) return false
    const canonical = await realpath(filePath)
    return path.win32.normalize(canonical).toLocaleLowerCase('en-US') === path.win32.normalize(filePath).toLocaleLowerCase('en-US')
  } catch { return false }
}

async function queryFileSearch(
  input: Parameters<LauncherFileSearchScanners['queryFileSearch']>[0],
  execute: LauncherExecFile,
  validateExecutable: (filePath: string) => Promise<boolean>,
): Promise<readonly LauncherFileSearchEntry[]> {
  throwIfAborted(input.signal)
  const searchTerm = input.searchTerm.trim()
  if (searchTerm.length === 0 || searchTerm.length > MAX_SEARCH_TERM_LENGTH || /[\0\r\n]/u.test(searchTerm)) return Object.freeze([])
  if (input.platform === 'Linux') throw new Error('File Search is unsupported on Linux')
  const maxResults = clamp(input.maxResults, 1, MAX_FILE_SEARCH_RESULTS)
  let invocation: Readonly<{ args: readonly string[]; executable: string }>
  if (input.platform === 'macOS') invocation = macFileSearchInvocation(searchTerm)
  else {
    if (!await validateExecutable(input.everythingCliFilePath)) throw new Error('Everything CLI file path is unavailable or not allowlisted')
    invocation = windowsFileSearchInvocation(input.everythingCliFilePath, input.homePath, searchTerm, maxResults)
  }
  const result = await execute(invocation.executable, invocation.args, {
    maxBuffer: MAX_QUERY_OUTPUT_BYTES,
    shell: false,
    signal: input.signal,
    timeout: QUERY_TIMEOUT_MS,
    ...(input.platform === 'Windows' ? { windowsHide: true } : null),
  })
  throwIfAborted(input.signal)
  const candidates: string[] = []
  for (const raw of String(result.stdout).split(/\r?\n/u)) {
    const candidate = raw.trim()
    if (candidate.length === 0 || candidate.length > MAX_ROW_LENGTH || /[\0\r\n]/u.test(candidate)) continue
    if (!isWithinHome(input.platform, input.homePath, candidate, true)) continue
    candidates.push(candidate)
    if (candidates.length >= maxResults) break
  }
  const results: LauncherFileSearchEntry[] = []
  for (const candidate of candidates) {
    throwIfAborted(input.signal)
    const entry = await trustedEntry(input.platform, input.homePath, candidate)
    if (entry !== undefined) results.push(entry)
  }
  return Object.freeze(results)
}

export function createLauncherFileSearchScanners(options: Readonly<{
  runFile?: LauncherExecFile
  validateEverythingCliPath?: (filePath: string) => Promise<boolean>
}> = {}): LauncherFileSearchScanners {
  const execute = options.runFile ?? defaultExecFile
  const validateExecutable = options.validateEverythingCliPath ?? validateEverythingExecutable
  return Object.freeze({
    queryFileSearch: input => queryFileSearch(input, execute, validateExecutable),
    scanSimpleFolder: scanSimpleFileSearchFolder,
    validatePath: async input => {
      throwIfAborted(input.signal)
      if (input.identity === undefined || !isWithinHome(input.platform, input.homePath, input.path, true)) return false
      if (input.root !== undefined && !await remainsWithinRoot({ homePath: input.homePath, path: input.path, platform: input.platform, root: input.root })) return false
      const entry = await trustedEntry(input.platform, input.homePath, input.path)
      return entry !== undefined
        && (input.expectedKind === undefined || entry.type === input.expectedKind)
        && sameIdentity(entry.identity, input.identity)
    },
  })
}

async function remainsWithinRoot(input: Readonly<{
  homePath: string
  path: string
  platform: LauncherFileSearchPlatform
  root: string
}>): Promise<boolean> {
  if (!isWithinHome(input.platform, input.homePath, input.root, true)
    || !isWithinHome(input.platform, input.homePath, input.path, true)) return false
  const api = pathApi(input.platform)
  try {
    const [canonicalRoot, canonicalPath] = await Promise.all([realpath(input.root), realpath(input.path)])
    const requested = requestedRelative(input.platform, input.root, input.path)
    const canonical = requestedRelative(input.platform, canonicalRoot, canonicalPath)
    return requested === canonical && canonical !== '' && !canonical.startsWith('..') && !api.isAbsolute(canonical)
  } catch { return false }
}

export const LAUNCHER_FILE_SEARCH_LIMITS = Object.freeze({
  maxQueue: MAX_SIMPLE_QUEUE,
  maxResults: MAX_RESULTS,
  maxSimpleDepth: MAX_SIMPLE_DEPTH,
  maxVisitedEntries: MAX_SIMPLE_VISITS,
  queryTimeoutMs: QUERY_TIMEOUT_MS,
})

export { MAX_SEARCH_TERM_LENGTH }
