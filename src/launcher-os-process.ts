import { lstat, opendir, realpath, rmdir, unlink } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
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

const WINDOWS_SLEEP_SCRIPT = String.raw`$m='[DllImport("PowrProf.dll",SetLastError=true)]static extern bool SetSuspendState(bool hibernate,bool forceCritical,bool disableWakeEvent);public static void PowerSleep(){SetSuspendState(false,false,false);}'; Add-Type -Name Import -MemberDefinition $m -Namespace Dll; [Dll.Import]::PowerSleep()`

function fixedPowershell(script: string): LauncherFixedInvocation {
  return Object.freeze({ args: Object.freeze([...POWERSHELL_PREFIX, script]), executable: 'powershell.exe' })
}

function boundedText(value: unknown, maximum = MAX_CONTROL_PANEL_TEXT): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\0\r\n]/u.test(value)
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
  if (!boundedText(output, MAX_CONTROL_PANEL_OUTPUT)) throw new Error('Invalid Windows Control Panel discovery output')
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

async function hasSymlinkComponent(target: string): Promise<boolean> {
  const parsed = path.posix.parse(target)
  let current = parsed.root
  for (const part of parsed.dir.slice(parsed.root.length).split('/').filter(Boolean).concat(parsed.base)) {
    current = path.posix.join(current, part)
    try {
      if ((await lstat(current, { bigint: true })).isSymbolicLink()) return true
    } catch { return true }
  }
  return false
}

async function trustedTrashDirectory(homePath: string, name: 'files' | 'info'): Promise<string | undefined> {
  if (!path.posix.isAbsolute(homePath) || homePath.length > MAX_PATH_LENGTH) return undefined
  const home = path.posix.resolve(homePath)
  const target = path.posix.join(home, '.local', 'share', 'Trash', name)
  if (!strictChild(home, target)) return undefined
  try {
    const [canonicalHome, canonicalTarget, targetStats] = await Promise.all([realpath(home), realpath(target), lstat(target, { bigint: true })])
    if (canonicalHome !== home || await hasSymlinkComponent(target) || !strictChild(canonicalHome, canonicalTarget)
      || canonicalTarget !== target || targetStats.isSymbolicLink() || !targetStats.isDirectory()) return undefined
    return target
  } catch { return undefined }
}

async function removeTrashTree(root: string, deadline: number, signal: AbortSignal): Promise<void> {
  const queue: Array<Readonly<{ depth: number; directory: string }>> = [{ depth: 0, directory: root }]
  let visited = 0
  while (queue.length > 0 && visited < MAX_TRASH_ENTRIES) {
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Trash deletion canceled')
    if (Date.now() >= deadline) throw new Error('Trash deletion timed out')
    const current = queue.shift()!
    let directory
    try {
      const currentStats = await lstat(current.directory, { bigint: true })
      const canonical = await realpath(current.directory)
      if (currentStats.isSymbolicLink() || !currentStats.isDirectory() || canonical !== current.directory) continue
      directory = await opendir(current.directory)
    } catch { continue }
    try {
      while (visited < MAX_TRASH_ENTRIES) {
        if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Trash deletion canceled')
        if (Date.now() >= deadline) throw new Error('Trash deletion timed out')
        const entry: Dirent | null = await directory.read()
        if (entry === null) break
        visited += 1
        const target = path.posix.join(current.directory, entry.name)
        if (target.length > MAX_PATH_LENGTH) continue
        let stats
        try { stats = await lstat(target, { bigint: true }) } catch { continue }
        if (stats.isSymbolicLink()) continue
        if (stats.isDirectory()) {
          if (current.depth < MAX_TRASH_DEPTH) queue.push({ depth: current.depth + 1, directory: target })
        } else if (stats.isFile()) {
          try { await unlink(target) } catch { /* isolate a stale/permission entry */ }
        }
      }
    } finally { await directory.close().catch(() => undefined) }
  }
  for (const entry of queue.toReversed()) {
    if (Date.now() >= deadline || signal.aborted) break
    try { await rmdir(entry.directory) } catch { /* nonempty or raced directories are harmless */ }
  }
}

/** Delete only the two standard Linux desktop-trash descendants, never by shell. */
export async function emptyLauncherLinuxTrash(homePath: string, signal: AbortSignal = new AbortController().signal, timeoutMs = 15_000): Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('Invalid trash timeout')
  const deadline = Date.now() + timeoutMs
  for (const name of ['files', 'info'] as const) {
    const root = await trustedTrashDirectory(homePath, name)
    if (root !== undefined) await removeTrashTree(root, deadline, signal)
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
