import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { parseLauncherBrowserHttpUrl, parseLauncherCustomBrowserArgumentTemplate } from './launcher-custom-browser-contract.ts'

export { parseLauncherCustomBrowserArgumentTemplate } from './launcher-custom-browser-contract.ts'

export type LauncherCustomBrowserPlatform = 'Linux' | 'macOS' | 'Windows'
type DesktopBrowserPlatform = Exclude<LauncherCustomBrowserPlatform, 'Linux'>
type Grant = Readonly<{
  dev: string
  ino: string
  parentRealPath: string
  path: string
  platform: DesktopBrowserPlatform
  version: 1
}>

export type LauncherCustomBrowserSnapshot = Readonly<{
  platform: LauncherCustomBrowserPlatform
  status: 'active' | 'none' | 'revoked'
}>

/** Browser identity is main-owned; renderer snapshots intentionally contain status only. */
export function projectLauncherCustomBrowserSettings(
  snapshot: LauncherSettingsSnapshot,
  _browser: LauncherCustomBrowserSnapshot | Readonly<Record<string, unknown>>,
  _platform: LauncherCustomBrowserPlatform,
): LauncherSettingsSnapshot {
  const values = { ...snapshot.values }
  delete values['general.browser.customWebBrowser.executableFilePath']
  delete values['general.browser.customWebBrowserName']
  return Object.freeze({ ...snapshot, values: Object.freeze(values) })
}

type ControllerOptions = Readonly<{
  getSetting: <T>(key: string, fallback: T) => T
  launch: (executable: string, args: readonly string[], signal?: AbortSignal) => Promise<void> | void
  openDefault: (url: string, signal?: AbortSignal) => Promise<void> | void
  /** Test-only cancellation seam; production never supplies it. */
  afterGrantMutation?: (operation: 'select' | 'revoke') => void
  platform: LauncherCustomBrowserPlatform
  userDataPath: string
  identitySafeEffects?: boolean
}>

const MAX_GRANT_BYTES = 16 * 1024
const NOFOLLOW = constants.O_NOFOLLOW
const HAS_NOFOLLOW = typeof NOFOLLOW === 'number' && NOFOLLOW > 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Custom browser operation canceled')
}

function decimalIdentity(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value.toString(10) : undefined
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  if (typeof value === 'string' && /^[0-9]+$/u.test(value)) return value.replace(/^0+(?=\d)/u, '')
  return undefined
}

function parseGrant(value: unknown): Grant {
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== 'dev,ino,parentRealPath,path,platform,version'
    || decimalIdentity(value.dev) === undefined
    || decimalIdentity(value.ino) === undefined
    || typeof value.parentRealPath !== 'string' || value.parentRealPath.length === 0 || value.parentRealPath.length > 16_384
    || typeof value.path !== 'string' || value.path.length === 0 || value.path.length > 16_384
    || (value.platform !== 'macOS' && value.platform !== 'Windows')
    || value.version !== 1) throw new Error('Custom browser grant is invalid')
  return Object.freeze({
    dev: decimalIdentity(value.dev)!,
    ino: decimalIdentity(value.ino)!,
    parentRealPath: value.parentRealPath,
    path: value.path,
    platform: value.platform,
    version: 1,
  })
}

function identityOf(stats: { dev: unknown; ino: unknown }): { dev: string; ino: string } {
  const dev = decimalIdentity(stats.dev)
  const ino = decimalIdentity(stats.ino)
  if (dev === undefined || ino === undefined) throw new Error('Custom browser identity is unavailable')
  return { dev, ino }
}

function identityMatches(left: { dev: unknown; ino: unknown }, right: { dev: unknown; ino: unknown }): boolean {
  return identityPart(left.dev) === identityPart(right.dev) && identityPart(left.ino) === identityPart(right.ino)
}

function identityPart(value: unknown): string | undefined {
  return decimalIdentity(value)
}

async function validateBrowserTarget(target: string, platform: DesktopBrowserPlatform): Promise<Grant> {
  if (typeof target !== 'string' || target.length === 0 || target.length > 16_384 || /[\0\r\n]/u.test(target)
    || (!path.isAbsolute(target) && !path.win32.isAbsolute(target))) throw new Error('Custom browser selection must be an absolute path')
  const selected = await lstat(target, { bigint: true })
  if (selected.isSymbolicLink()) throw new Error('Custom browser selection cannot be a symbolic link')
  const canonicalPath = await realpath(target)
  const canonical = await lstat(canonicalPath, { bigint: true })
  if (canonical.isSymbolicLink()
    || (platform === 'macOS' && (!canonical.isDirectory() || path.extname(canonicalPath).toLowerCase() !== '.app'))
    || (platform === 'Windows' && (!canonical.isFile() || path.extname(canonicalPath).toLowerCase() !== '.exe'))) {
    throw new Error(`Custom browser selection is not a valid ${platform} browser application`)
  }
  const identity = identityOf(canonical)
  return Object.freeze({
    ...identity,
    parentRealPath: await realpath(path.dirname(canonicalPath)),
    path: canonicalPath,
    platform,
    version: 1,
  })
}

async function revalidateGrant(grant: Grant): Promise<void> {
  const current = await validateBrowserTarget(grant.path, grant.platform)
  if (current.path !== grant.path || current.parentRealPath !== grant.parentRealPath || current.dev !== grant.dev || current.ino !== grant.ino) {
    throw new Error('Custom browser grant changed after approval')
  }
}

async function readGrant(filePath: string): Promise<Grant | undefined> {
  let before
  try { before = await lstat(filePath, { bigint: true }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (before.isSymbolicLink() || !before.isFile()) throw new Error('Custom browser grant file is invalid')
  let handle
  try { handle = await open(filePath, HAS_NOFOLLOW ? constants.O_RDONLY | NOFOLLOW : constants.O_RDONLY) }
  catch (error) { throw new Error('Custom browser grant file is unavailable', { cause: error }) }
  try {
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile() || stats.size > BigInt(MAX_GRANT_BYTES) || !identityMatches(stats, before)) throw new Error('Custom browser grant file is invalid')
    const parsed = parseGrant(JSON.parse(await handle.readFile('utf8')) as unknown)
    const after = await lstat(filePath, { bigint: true })
    if (after.isSymbolicLink() || !identityMatches(after, before)) throw new Error('Custom browser grant file changed')
    return parsed
  } finally { await handle.close() }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
}

async function writeGrant(filePath: string, grant: Grant): Promise<void> {
  const directory = path.dirname(filePath)
  await mkdir(directory, { mode: 0o700, recursive: true })
  await chmod(directory, 0o700)
  const temporary = path.join(directory, `.custom-browser-grant-${process.pid}-${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (HAS_NOFOLLOW ? NOFOLLOW : 0), 0o600)
    await handle.writeFile(JSON.stringify(grant, null, 2), 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, filePath)
    await chmod(filePath, 0o600)
    await syncDirectory(directory)
  } finally {
    await handle?.close().catch(() => undefined)
    await rm(temporary, { force: true })
  }
}

export class LauncherCustomBrowserController {
  readonly #grantPath: string
  #grant: Grant | undefined
  #status: LauncherCustomBrowserSnapshot['status']
  #mutationTail: Promise<void> = Promise.resolve()
  #activeControllers = new Set<AbortController>()
  #activeWork = new Set<Promise<unknown>>()
  #disposed = false
  #generation = 0

  private readonly options: ControllerOptions

  private constructor(options: ControllerOptions, grant: Grant | undefined, status: LauncherCustomBrowserSnapshot['status']) {
    this.options = options
    this.#grantPath = path.join(options.userDataPath, 'launcher', 'custom-browser-grant.json')
    this.#grant = grant
    this.#status = status
  }

  static async open(options: ControllerOptions): Promise<LauncherCustomBrowserController> {
    const grantPath = path.join(options.userDataPath, 'launcher', 'custom-browser-grant.json')
    try {
      const grant = await readGrant(grantPath)
      if (grant === undefined) return new LauncherCustomBrowserController(options, undefined, 'none')
      if (options.platform === 'Linux' || grant.platform !== options.platform) return new LauncherCustomBrowserController(options, undefined, 'revoked')
      await revalidateGrant(grant)
      return new LauncherCustomBrowserController(options, grant, 'active')
    } catch { return new LauncherCustomBrowserController(options, undefined, 'revoked') }
  }

  snapshot(): LauncherCustomBrowserSnapshot {
    return Object.freeze({ platform: this.options.platform, status: this.#status })
  }

  invalidate(reason = 'Custom browser operation was invalidated', _preserveSignal?: AbortSignal): void {
    ++this.#generation
    for (const controller of this.#activeControllers) controller.abort(new Error(reason))
  }

  async waitForIdle(): Promise<void> {
    while (this.#activeWork.size > 0) await Promise.allSettled([...this.#activeWork])
  }

  async select(target: string, signal?: AbortSignal): Promise<void> {
    if (this.#disposed) throw new Error('Custom browser controller is disposed')
    if (this.options.platform === 'Linux') throw new Error('Custom browsers are not supported on Linux')
    if (!HAS_NOFOLLOW && this.options.identitySafeEffects !== true) throw new Error('Custom browser selection is unavailable on this platform')
    throwIfAborted(signal)
    await this.#enqueue(async operationSignal => {
      throwIfAborted(operationSignal)
      const grant = await validateBrowserTarget(target, this.options.platform as DesktopBrowserPlatform)
      throwIfAborted(operationSignal)
      await writeGrant(this.#grantPath, grant)
      // Durable state is committed; finish the matching in-memory commit even
      // when owner cancellation arrives at this boundary.
      this.#grant = grant
      this.#status = 'active'
      this.options.afterGrantMutation?.('select')
      throwIfAborted(operationSignal)
    }, signal)
  }

  async revoke(signal?: AbortSignal): Promise<void> {
    if (this.#disposed) throw new Error('Custom browser controller is disposed')
    throwIfAborted(signal)
    await this.#enqueue(async operationSignal => {
      throwIfAborted(operationSignal)
      await rm(this.#grantPath, { force: true })
      this.#grant = undefined
      this.#status = 'none'
      this.options.afterGrantMutation?.('revoke')
      throwIfAborted(operationSignal)
    }, signal)
  }

  async openUrl(url: string, signal?: AbortSignal): Promise<void> {
    if (this.#disposed) throw new Error('Custom browser controller is disposed')
    throwIfAborted(signal)
    const normalized = parseLauncherBrowserHttpUrl(url)
    await this.#enqueue(async operationSignal => {
      throwIfAborted(operationSignal)
      const useDefault = this.options.getSetting('general.browser.useDefaultWebBrowser', true)
      if (useDefault || this.options.platform === 'Linux') {
        await this.options.openDefault(normalized, operationSignal)
        throwIfAborted(operationSignal)
        return
      }
      const grant = this.#grant
      if (this.#status === 'none') throw new Error('No custom browser grant is selected')
      if (this.#status !== 'active' || grant === undefined || grant.platform !== this.options.platform) throw new Error('Custom browser grant is revoked')
      if (!HAS_NOFOLLOW && this.options.identitySafeEffects !== true) throw new Error('Custom browser launch is unavailable on this platform')
      try { await revalidateGrant(grant) }
      catch (error) { this.#grant = undefined; this.#status = 'revoked'; throw new Error('Custom browser grant changed or was revoked', { cause: error }) }
      throwIfAborted(operationSignal)
      if (grant.platform === 'macOS') { await this.options.launch('/usr/bin/open', ['-a', grant.path, normalized], operationSignal); throwIfAborted(operationSignal); return }
      const template = this.options.getSetting('general.browser.customWebBrowser.commandlineArguments', '{{url}}')
      await this.options.launch(grant.path, parseLauncherCustomBrowserArgumentTemplate(template, normalized), operationSignal)
      throwIfAborted(operationSignal)
    }, signal)
  }

  async #enqueue(operation: (signal: AbortSignal) => Promise<void>, parentSignal?: AbortSignal): Promise<void> {
    const controller = new AbortController()
    const relay = (): void => controller.abort(parentSignal?.reason instanceof Error ? parentSignal.reason : new Error('Custom browser operation canceled'))
    if (parentSignal?.aborted) relay()
    else parentSignal?.addEventListener('abort', relay, { once: true })
    this.#activeControllers.add(controller)
    const generation = this.#generation
    const next = this.#mutationTail.then(async () => {
      if (this.#disposed || generation !== this.#generation) throw new Error('Custom browser operation was invalidated')
      await operation(controller.signal)
    })
    const tracked = next.finally(() => {
      parentSignal?.removeEventListener('abort', relay)
      this.#activeControllers.delete(controller)
      this.#activeWork.delete(tracked)
    })
    this.#activeWork.add(tracked)
    this.#mutationTail = tracked.catch(() => undefined)
    await tracked
  }

  async close(): Promise<void> {
    if (this.#disposed) { await this.waitForIdle(); return }
    this.#disposed = true
    this.invalidate('Custom browser controller is closed')
    await this.waitForIdle()
    this.#grant = undefined
  }
}
