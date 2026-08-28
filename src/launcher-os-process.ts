import { O_DIRECTORY, O_NOFOLLOW, O_RDONLY } from 'node:constants'
import { lstat, open, opendir, realpath, rmdir, unlink } from 'node:fs/promises'
import type { Dir, Dirent } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'
import type { LauncherOsPlatform, LauncherSystemCommand } from './launcher-os-catalog.ts'

export type LauncherFixedInvocation = Readonly<{ args: readonly string[]; executable: string }>

const POWERSHELL_PREFIX = Object.freeze(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'])
const MAX_CONTROL_PANEL_OUTPUT = 1_048_576
const MAX_CONTROL_PANEL_ITEMS = 200
const MAX_CONTROL_PANEL_TEXT = 256
const MAX_TRASH_ENTRIES = 4_096
const MAX_TRASH_DEPTH = 32
const MAX_PATH_LENGTH = 4_096
const CONTROL_PANEL_CANONICAL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9.-]*$/u
const WINDOWS_STORE_APPLICATION_PATTERN = /^shell:AppsFolder\\[A-Za-z0-9._!{}-]{1,512}$/u

const MAC_COMMANDS: Readonly<Partial<Record<LauncherSystemCommand, string>>> = Object.freeze({
  'empty-trash': 'tell application "Finder" to if ((count of items in trash) > 0) then empty trash',
  lock: 'tell application "System Events" to keystroke "q" using {control down, command down}',
  'log-out': 'tell application "System Events" to log out',
  restart: 'tell app "System Events" to restart',
  shutdown: 'tell app "System Events" to shut down',
  sleep: 'tell application "System Events" to sleep',
})

const WINDOWS_SLEEP_SCRIPT = String.raw`$m='[DllImport("Powrprof.dll",SetLastError=true)]static extern bool SetSuspendState(bool hibernate,bool forceCritical,bool disableWakeEvent);public static void PowerSleep(){SetSuspendState(false,false,false);}'; Add-Type -Name Import -MemberDefinition $m -Namespace Dll; [Dll.Import]::PowerSleep()`

function fixedPowershell(script: string): LauncherFixedInvocation {
  return Object.freeze({ args: Object.freeze([...POWERSHELL_PREFIX, script]), executable: 'powershell.exe' })
}

function boundedText(value: unknown, maximum = MAX_CONTROL_PANEL_TEXT): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\0\r\n]/u.test(value)
}

function boundedOutput(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_CONTROL_PANEL_OUTPUT && !/\0/u.test(value)
}

export function resolveSystemCommandInvocation(
  platform: LauncherOsPlatform,
  command: LauncherSystemCommand,
): LauncherFixedInvocation | undefined {
  if (platform === 'Linux') {
    if (command === 'empty-trash') return undefined
    throw new Error(`System command ${command} is not supported on Linux`)
  }
  if (platform === 'macOS') {
    const script = MAC_COMMANDS[command]
    if (script === undefined) throw new Error(`System command ${command} is not supported on macOS`)
    return Object.freeze({ args: Object.freeze(['-e', script]), executable: 'osascript' })
  }
  switch (command) {
    case 'shutdown': return Object.freeze({ args: Object.freeze(['-s', '-t', '0']), executable: 'shutdown.exe' })
    case 'restart': return Object.freeze({ args: Object.freeze(['-r', '-t', '0']), executable: 'shutdown.exe' })
    case 'log-out': return Object.freeze({ args: Object.freeze(['/l']), executable: 'shutdown.exe' })
    case 'lock': return Object.freeze({ args: Object.freeze(['user32.dll,LockWorkStation']), executable: 'rundll32.exe' })
    case 'hibernate': return Object.freeze({ args: Object.freeze(['/h']), executable: 'shutdown.exe' })
    case 'sleep': return fixedPowershell(WINDOWS_SLEEP_SCRIPT)
    case 'empty-trash': return fixedPowershell('Clear-RecycleBin -Force -ErrorAction Stop')
    default: throw new Error(`System command ${command} is not supported on Windows`)
  }
}

export function resolveAppearanceInvocation(platform: LauncherOsPlatform, shouldUseDarkColors: boolean): LauncherFixedInvocation {
  if (platform === 'macOS') return Object.freeze({
    args: Object.freeze(['-e', `tell app "System Events" to tell appearance preferences to set dark mode to ${shouldUseDarkColors ? 'false' : 'true'}`]),
    executable: 'osascript',
  })
  if (platform === 'Windows') {
    const value = shouldUseDarkColors ? 1 : 0
    return fixedPowershell(`$path='HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'; Set-ItemProperty -Path $path -Name SystemUsesLightTheme -Value ${value}; Set-ItemProperty -Path $path -Name AppsUseLightTheme -Value ${value}`)
  }
  throw new Error('Appearance switching is not supported on Linux')
}

export function resolveWindowsControlPanelScanInvocation(): LauncherFixedInvocation {
  return fixedPowershell("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-ControlPanelItem | Select-Object Name,CanonicalName | ConvertTo-Json -Compress")
}

export function resolveWindowsControlPanelInvocation(canonicalName: string): LauncherFixedInvocation {
  if (!boundedText(canonicalName) || !CONTROL_PANEL_CANONICAL_NAME_PATTERN.test(canonicalName)) {
    throw new Error('Invalid Windows Control Panel canonical name')
  }
  return Object.freeze({ args: Object.freeze(['/name', canonicalName]), executable: 'control.exe' })
}

export type LauncherControlPanelEntry = Readonly<{ canonicalName: string; name: string }>

export function parseWindowsControlPanelItems(output: string): readonly LauncherControlPanelEntry[] {
  if (!boundedOutput(output)) throw new Error('Invalid Windows Control Panel discovery output')
  let parsed: unknown
  try { parsed = JSON.parse(output) } catch { throw new Error('Invalid Windows Control Panel discovery output') }
  if (!Array.isArray(parsed) && (parsed === null || typeof parsed !== 'object')) throw new Error('Invalid Windows Control Panel discovery output')
  const rows = Array.isArray(parsed) ? parsed.slice(0, MAX_CONTROL_PANEL_ITEMS) : [parsed]
  const seen = new Set<string>()
  const entries: LauncherControlPanelEntry[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const value = row as Record<string, unknown>
    const keys = Object.keys(value)
    const canonicalName = value.CanonicalName
    const name = value.Name
    if (keys.some(key => key !== 'CanonicalName' && key !== 'Name')
      || !boundedText(canonicalName) || !CONTROL_PANEL_CANONICAL_NAME_PATTERN.test(canonicalName)) continue
    if (!boundedText(name)) continue
    const identity = canonicalName.toLocaleLowerCase('en-US')
    if (seen.has(identity)) continue
    seen.add(identity)
    entries.push(Object.freeze({ canonicalName, name }))
  }
  return Object.freeze(entries)
}

function strictChild(root: string, target: string): boolean {
  if (root.length === 0 || target.length === 0 || root.length > MAX_PATH_LENGTH || target.length > MAX_PATH_LENGTH) return false
  const relative = path.posix.relative(path.posix.resolve(root), path.posix.resolve(target))
  return relative !== '' && !relative.startsWith('..') && !path.posix.isAbsolute(relative)
}

function strictChildOrSame(root: string, target: string): boolean {
  return target === root || strictChild(root, target)
}

function trashErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

function ensureTrashLive(signal: AbortSignal, deadline: number): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Trash deletion canceled')
  if (Date.now() >= deadline) throw new Error('Trash deletion timed out')
}

function assertDescriptorSafety(): void {
  if (!Number.isInteger(O_DIRECTORY) || !Number.isInteger(O_NOFOLLOW) || !Number.isInteger(O_RDONLY)) {
    throw new Error('Linux Trash descriptor safety is unavailable')
  }
  try { if (!path.posix.isAbsolute('/proc/self/fd/0')) throw new Error('invalid proc-fd path') } catch { throw new Error('Linux Trash descriptor safety is unavailable') }
}

type AnchoredDirectory = Readonly<{
  canonical: string
  dev: bigint
  fd: FileHandle
  ino: bigint
}>

function descriptorPath(directory: AnchoredDirectory, child?: string): string {
  if (child !== undefined && (child.length === 0 || child === '.' || child === '..' || child.includes('/') || /[\0\r\n]/u.test(child))) {
    throw new Error('Invalid Linux Trash directory entry')
  }
  const suffix = child === undefined ? '' : `/${child}`
  const value = `/proc/self/fd/${String(directory.fd.fd)}${suffix}`
  if (value.length > MAX_PATH_LENGTH) throw new Error('Linux Trash path exceeds its limit')
  return value
}

function sameIdentity(left: Readonly<{ dev: bigint; ino: bigint }>, right: Readonly<{ dev: bigint; ino: bigint }>): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

async function closeDescriptor(directory: AnchoredDirectory | undefined): Promise<void> {
  await directory?.fd.close().catch(() => undefined)
}

async function openAnchoredChild(parent: AnchoredDirectory, child: string, trustedRoot: string): Promise<AnchoredDirectory | undefined> {
  const target = descriptorPath(parent, child)
  let before
  try { before = await lstat(target, { bigint: true }) } catch (error) {
    if (trashErrorCode(error) === 'ENOENT' || trashErrorCode(error) === 'ENOTDIR') return undefined
    throw error
  }
  if (before.isSymbolicLink() || !before.isDirectory()) return undefined
  let fd: FileHandle
  try {
    fd = await open(target, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
  } catch (error) {
    if (trashErrorCode(error) === 'ENOENT' || trashErrorCode(error) === 'ENOTDIR' || trashErrorCode(error) === 'ELOOP') return undefined
    throw error
  }
  let keepOpen = false
  try {
    const after = await fd.stat({ bigint: true })
    if (!after.isDirectory() || !sameIdentity(before, after)) return undefined
    const canonical = await realpath(`/proc/self/fd/${String(fd.fd)}`)
    if (!strictChildOrSame(trustedRoot, canonical)) return undefined
    keepOpen = true
    return Object.freeze({ canonical, dev: after.dev, fd, ino: after.ino })
  } catch (error) {
    if (trashErrorCode(error) === 'ENOENT' || trashErrorCode(error) === 'ENOTDIR' || trashErrorCode(error) === 'ELOOP') return undefined
    throw error
  } finally {
    // The returned descriptor is deliberately kept open; all other paths close here.
    if (!keepOpen) await fd.close().catch(() => undefined)
  }
}

async function openAnchoredRoot(): Promise<AnchoredDirectory> {
  let fd: FileHandle
  try { fd = await open('/', O_RDONLY | O_DIRECTORY | O_NOFOLLOW) } catch { throw new Error('Linux Trash descriptor safety is unavailable') }
  try {
    const stat = await fd.stat({ bigint: true })
    if (!stat.isDirectory()) throw new Error('Linux Trash descriptor safety is unavailable')
    const canonical = await realpath(`/proc/self/fd/${String(fd.fd)}`)
    if (canonical !== '/') throw new Error('Linux Trash descriptor safety is unavailable')
    return Object.freeze({ canonical, dev: stat.dev, fd, ino: stat.ino })
  } catch {
    await fd.close().catch(() => undefined)
    throw new Error('Linux Trash descriptor safety is unavailable')
  }
}

async function openAnchoredPath(absolutePath: string): Promise<AnchoredDirectory | undefined> {
  const normalized = path.posix.resolve(absolutePath)
  const root = await openAnchoredRoot()
  const opened: AnchoredDirectory[] = [root]
  let keepFinal = false
  try {
    for (const child of normalized.split('/').filter(Boolean)) {
      const parent = opened.at(-1)!
      const next = await openAnchoredChild(parent, child, '/')
      if (next === undefined) return undefined
      opened.push(next)
    }
    keepFinal = true
    return opened.at(-1)!
  } finally {
    // Keep only the final descriptor; every ancestor is still an anchor for its child.
    // The final descriptor is returned and closed by the caller.
    for (const directory of (keepFinal ? opened.slice(0, -1) : opened).toReversed()) await closeDescriptor(directory)
  }
}

async function revalidateDirectory(directory: AnchoredDirectory, trustedRoot: string): Promise<boolean> {
  try {
    const stat = await directory.fd.stat({ bigint: true })
    if (!stat.isDirectory() || !sameIdentity(directory, stat)) return false
    const canonical = await realpath(`/proc/self/fd/${String(directory.fd.fd)}`)
    return strictChildOrSame(trustedRoot, canonical)
  } catch { return false }
}

async function removeAnchoredTree(
  directory: AnchoredDirectory,
  trustedRoot: string,
  depth: number,
  state: { visited: number },
  deadline: number,
  signal: AbortSignal,
): Promise<void> {
  ensureTrashLive(signal, deadline)
  if (!await revalidateDirectory(directory, trustedRoot)) return
  let entries: Dir
  try { entries = await opendir(descriptorPath(directory), { bufferSize: 32 }) } catch (error) {
    if (trashErrorCode(error) === 'ENOENT' || trashErrorCode(error) === 'ENOTDIR') return
    throw error
  }
  try {
    for await (const entry of entries) {
      ensureTrashLive(signal, deadline)
      if (state.visited >= MAX_TRASH_ENTRIES) return
      state.visited += 1
      const child = entry.name
      if (child.length === 0 || child.length > MAX_PATH_LENGTH || child === '.' || child === '..' || /[\0\r\n/]/u.test(child)) continue
      const target = descriptorPath(directory, child)
      let stats
      try { stats = await lstat(target, { bigint: true }) } catch (error) {
        if (trashErrorCode(error) === 'ENOENT' || trashErrorCode(error) === 'ENOTDIR') continue
        throw error
      }
      ensureTrashLive(signal, deadline)
      if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) continue
      if (stats.isDirectory()) {
        if (depth >= MAX_TRASH_DEPTH) continue
        const nested = await openAnchoredChild(directory, child, trustedRoot)
        if (nested === undefined) continue
        try {
          if (sameIdentity(stats, nested)) await removeAnchoredTree(nested, trustedRoot, depth + 1, state, deadline, signal)
        } finally { await closeDescriptor(nested) }
        ensureTrashLive(signal, deadline)
        if (!await revalidateDirectory(directory, trustedRoot)) return
        try { await rmdir(target) } catch (error) {
          if (!['ENOENT', 'ENOTEMPTY', 'ENOTDIR'].includes(trashErrorCode(error) ?? '')) throw error
        }
      } else {
        if (!await revalidateDirectory(directory, trustedRoot)) return
        try { await unlink(target) } catch (error) {
          if (trashErrorCode(error) !== 'ENOENT') throw error
        }
      }
    }
  } finally { await entries.close().catch(() => undefined) }
}

async function withTrustedTrashDirectory(
  homePath: string,
  name: 'files' | 'info',
  signal: AbortSignal,
  deadline: number,
): Promise<void> {
  if (!path.posix.isAbsolute(homePath) || homePath.length > MAX_PATH_LENGTH || /[\0\r\n]/u.test(homePath)) return
  assertDescriptorSafety()
  const home = path.posix.resolve(homePath)
  const trashPath = path.posix.join(home, '.local', 'share', 'Trash')
  if (!strictChild(home, trashPath)) return
  const trash = await openAnchoredPath(trashPath)
  if (trash === undefined) return
  let target: AnchoredDirectory | undefined
  try {
    target = await openAnchoredChild(trash, name, trash.canonical)
    if (target === undefined) return
    await removeAnchoredTree(target, trash.canonical, 0, { visited: 0 }, deadline, signal)
  } finally {
    await closeDescriptor(target)
    await closeDescriptor(trash)
  }
}

/** Delete only the two standard Linux desktop-trash descendants, never by shell. */
export async function emptyLauncherLinuxTrash(homePath: string, signal: AbortSignal = new AbortController().signal, timeoutMs = 15_000): Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('Invalid trash timeout')
  const deadline = Date.now() + timeoutMs
  for (const name of ['files', 'info'] as const) {
    ensureTrashLive(signal, deadline)
    await withTrustedTrashDirectory(homePath, name, signal, deadline)
  }
}

export function launcherControlPanelCanonicalName(value: unknown): value is string {
  return boundedText(value) && CONTROL_PANEL_CANONICAL_NAME_PATTERN.test(value)
}

export function launcherWindowsApplicationTarget(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 16_384
    && !/[\0\r\n]/u.test(value)
    && (path.win32.isAbsolute(value) || WINDOWS_STORE_APPLICATION_PATTERN.test(value))
}
