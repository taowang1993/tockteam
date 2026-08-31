import { constants } from 'node:fs'
import { access as accessPath, lstat, mkdir, open, realpath, rename, rm, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { parseLauncherBrowserHttpUrl, parseLauncherCustomBrowserArgumentTemplate } from './launcher-custom-browser-contract.ts'

export { parseLauncherCustomBrowserArgumentTemplate } from './launcher-custom-browser-contract.ts'

export type LauncherCustomBrowserPlatform = 'Linux' | 'macOS' | 'Windows'
type DesktopBrowserPlatform = Exclude<LauncherCustomBrowserPlatform, 'Linux'>
export type LauncherCustomBrowserGrant = Readonly<{
  dev: string
  ino: string
  parentRealPath: string
  path: string
  platform: DesktopBrowserPlatform
  version: 1
}>

type Grant = LauncherCustomBrowserGrant

type GrantParentBinding = Readonly<{
  dev: string
  directory: string
  ino: string
  realPath: string
}>

type GrantParentAccess = Readonly<{
  binding: GrantParentBinding
  handle?: FileHandle
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
  /** Test-only race seam; production never supplies it. */
  afterAnchoredGrantPathMiss?: () => Promise<void> | void
  /** Test-only serialization seam; production uses serializeLauncherCustomBrowserGrant. */
  serializeGrant?: (grant: Grant) => string
  effectTimeoutMs?: number
  platform: LauncherCustomBrowserPlatform
  syncDirectory?: (directory: string) => Promise<void>
  userDataPath: string
  identitySafeEffects?: boolean
}>

const MAX_GRANT_BYTES = 16 * 1024
const NOFOLLOW = constants.O_NOFOLLOW
const DIRECTORY = constants.O_DIRECTORY
const HAS_NOFOLLOW = typeof NOFOLLOW === 'number' && NOFOLLOW > 0
const HAS_DIRECTORY = typeof DIRECTORY === 'number' && DIRECTORY > 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Custom browser operation canceled')
}

async function awaitBoundedEffect<T>(effect: () => Promise<T> | T, signal: AbortSignal, timeoutMs: number): Promise<T> {
  const pending = Promise.resolve().then(effect)
  void pending.catch(() => undefined)
  let onAbort!: () => void
  let timer: ReturnType<typeof setTimeout> | undefined
  const canceled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('Custom browser operation canceled'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Custom browser native effect timed out')), timeoutMs)
  })
  try { return await Promise.race([pending, canceled, timedOut]) }
  finally {
    if (timer !== undefined) clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

function effectTimeout(options: ControllerOptions): number {
  const configured = options.effectTimeoutMs ?? 15_000
  return Number.isFinite(configured) ? Math.max(1, Math.min(configured, 15_000)) : 15_000
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

export function serializeLauncherCustomBrowserGrant(grant: LauncherCustomBrowserGrant): string {
  const serialized = JSON.stringify(grant, null, 2)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_GRANT_BYTES) throw new Error('Custom browser grant is too large')
  return serialized
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

function samePath(left: string, right: string): boolean {
  const implementation = path.win32.isAbsolute(left) || path.win32.isAbsolute(right) ? path.win32 : path
  const normalizedLeft = implementation.normalize(left)
  const normalizedRight = implementation.normalize(right)
  return implementation === path.win32
    ? normalizedLeft.toLocaleLowerCase('en-US') === normalizedRight.toLocaleLowerCase('en-US')
    : normalizedLeft === normalizedRight
}

type GrantPathCandidate = Readonly<{
  anchored: boolean
  path: string
}>

function parentAnchorRoots(): readonly string[] {
  // macOS exposes /dev/fd, but does not support reliable child traversal from
  // the descriptor path. Treat it as a raw-path platform instead.
  if (process.platform === 'linux') return ['/proc/self/fd', '/dev/fd']
  return []
}

async function grantPathCandidates(parent: GrantParentAccess, filename: string): Promise<readonly GrantPathCandidate[]> {
  const raw = path.join(parent.binding.realPath, filename)
  // Never mix a raw candidate into an anchored candidate set. Raw paths are
  // used only when no descriptor-relative anchor exists and callers fence them
  // with explicit parent identity checks.
  if (parent.handle === undefined) return Object.freeze([{ anchored: false, path: raw }])
  for (const root of parentAnchorRoots()) {
    try {
      await accessPath(root)
      return Object.freeze([{ anchored: true, path: path.posix.join(root, String(parent.handle.fd), filename) }])
    } catch { /* no usable descriptor anchor at this root */ }
  }
  return Object.freeze([{ anchored: false, path: raw }])
}

async function validateRawGrantParent(binding: GrantParentBinding, platform: LauncherCustomBrowserPlatform): Promise<void> {
  const checked = await validateGrantParent(binding, platform)
  await closeGrantParent(checked)
}

async function closeGrantParent(parent: GrantParentAccess): Promise<void> {
  await parent.handle?.close().catch(() => undefined)
}

/** Validate and identity-bind the fixed grant parent before every grant operation. */
// ponytail: same-user ABA can only be reduced to the bound dev/ino identity; filesystem identity reuse remains outside this seam.
async function validateGrantParent(
  target: string | GrantParentBinding,
  platform: LauncherCustomBrowserPlatform,
): Promise<GrantParentAccess> {
  const expected = typeof target === 'string' ? undefined : target
  const directory = expected?.directory ?? target
  if (typeof directory !== 'string' || directory.length === 0 || /[\0\r\n]/u.test(directory)) throw new Error('Custom browser grant directory is invalid')
  const selected = await lstat(directory, { bigint: true })
  if (!selected.isDirectory() || selected.isSymbolicLink()) throw new Error('Custom browser grant directory is invalid')
  const canonicalPath = await realpath(directory)
  if (expected !== undefined && !samePath(canonicalPath, expected.realPath)) throw new Error('Custom browser grant directory changed')
  const canonical = await lstat(canonicalPath, { bigint: true })
  if (!canonical.isDirectory() || canonical.isSymbolicLink()) throw new Error('Custom browser grant directory is invalid')
  const identity = identityOf(canonical)
  if (expected !== undefined && (identity.dev !== expected.dev || identity.ino !== expected.ino)) throw new Error('Custom browser grant directory changed')
  let handle: FileHandle | undefined
  try {
    if (platform !== 'Windows') {
      if (!HAS_DIRECTORY || !HAS_NOFOLLOW) throw new Error('Custom browser grant directory identity is unavailable')
      handle = await open(canonicalPath, constants.O_RDONLY | DIRECTORY | NOFOLLOW)
      const opened = await handle.stat({ bigint: true })
      if (!opened.isDirectory() || opened.isSymbolicLink() || !identityMatches(opened, canonical)) throw new Error('Custom browser grant directory changed')
    }
    const binding = expected ?? Object.freeze({ dev: identity.dev, directory, ino: identity.ino, realPath: canonicalPath })
    return Object.freeze({ binding, ...(handle === undefined ? {} : { handle }) })
  } catch (error) {
    await handle?.close().catch(() => undefined)
    throw error
  }
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

async function revalidateGrant(grant: Grant, parentBinding: GrantParentBinding): Promise<void> {
  const before = await validateGrantParent(parentBinding, grant.platform)
  await closeGrantParent(before)
  let current: Grant
  try {
    current = await validateBrowserTarget(grant.path, grant.platform)
  } finally {
    const after = await validateGrantParent(parentBinding, grant.platform)
    await closeGrantParent(after)
  }
  if (current.path !== grant.path || current.parentRealPath !== grant.parentRealPath || current.dev !== grant.dev || current.ino !== grant.ino) {
    throw new Error('Custom browser grant changed after approval')
  }
}

export async function readLauncherBoundedUtf8(handle: Pick<FileHandle, 'read'>): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const buffer = Buffer.alloc(Math.min(4_096, MAX_GRANT_BYTES + 1 - total))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
    if (bytesRead === 0) break
    total += bytesRead
    if (total > MAX_GRANT_BYTES) throw new Error('Custom browser grant file is too large')
    chunks.push(buffer.subarray(0, bytesRead))
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }
  catch (error) { throw new Error('Custom browser grant file is not valid UTF-8', { cause: error }) }
}

async function readGrant(
  filePath: string,
  parentBinding: GrantParentBinding,
  platform: LauncherCustomBrowserPlatform,
  afterAnchoredGrantPathMiss?: () => Promise<void> | void,
): Promise<Grant | undefined> {
  if (!samePath(path.dirname(filePath), parentBinding.directory)) throw new Error('Custom browser grant directory changed')
  const parent = await validateGrantParent(parentBinding, platform)
  let handle: FileHandle | undefined
  try {
    const filename = path.basename(filePath)
    const candidate = (await grantPathCandidates(parent, filename))[0]!
    let before
    try { before = await lstat(candidate.path, { bigint: true }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (candidate.anchored) await afterAnchoredGrantPathMiss?.()
      return undefined
    }
    if (before.isSymbolicLink() || !before.isFile()) throw new Error('Custom browser grant file is invalid')
    if (!candidate.anchored) await validateRawGrantParent(parentBinding, platform)
    try { handle = await open(candidate.path, HAS_NOFOLLOW ? constants.O_RDONLY | NOFOLLOW : constants.O_RDONLY) }
    catch (error) { throw new Error('Custom browser grant file is unavailable', { cause: error }) }
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile() || stats.size > BigInt(MAX_GRANT_BYTES) || !identityMatches(stats, before)) throw new Error('Custom browser grant file is invalid')
    const content = await readLauncherBoundedUtf8(handle)
    const afterRead = await handle.stat({ bigint: true })
    if (!afterRead.isFile() || afterRead.size > BigInt(MAX_GRANT_BYTES) || !identityMatches(afterRead, before)) throw new Error('Custom browser grant file grew while it was read')
    const parsed = parseGrant(JSON.parse(content) as unknown)
    const after = await lstat(candidate.path, { bigint: true })
    if (after.isSymbolicLink() || after.size > BigInt(MAX_GRANT_BYTES) || !identityMatches(after, before)) throw new Error('Custom browser grant file changed')
    return parsed
  } finally {
    await handle?.close().catch(() => undefined)
    try {
      const afterParent = await validateGrantParent(parentBinding, platform)
      await closeGrantParent(afterParent)
    } finally { await closeGrantParent(parent) }
  }
}

function unsupportedDirectorySync(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EINVAL' || code === 'ENOTSUP' || code === 'EOPNOTSUPP' || code === 'EBADF' || code === 'EPERM'
}

async function syncDirectory(directory: string, platform: LauncherCustomBrowserPlatform): Promise<void> {
  if (platform === 'Windows') {
    try {
      const handle = await open(directory, constants.O_RDONLY)
      try { await handle.sync() } finally { await handle.close() }
    } catch (error) {
      if (!unsupportedDirectorySync(error)) throw error
    }
    return
  }
  const handle = await open(directory, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
}

async function syncGrantDirectory(sync: (directory: string) => Promise<void>, directory: string, platform: LauncherCustomBrowserPlatform): Promise<void> {
  try { await sync(directory) }
  catch (error) {
    if (platform !== 'Windows' || !unsupportedDirectorySync(error)) throw error
  }
}

type GrantWriteResult = Readonly<{
  directory: string
  parent: GrantParentAccess
}>

async function writeGrant(
  filePath: string,
  grant: Grant,
  platform: LauncherCustomBrowserPlatform,
  parentBinding: GrantParentBinding,
  serializeGrant: (grant: Grant) => string,
  afterAnchoredGrantPathMiss?: () => Promise<void> | void,
): Promise<GrantWriteResult> {
  const serialized = serializeGrant(grant)
  if (!samePath(path.dirname(filePath), parentBinding.directory)) throw new Error('Custom browser grant directory changed')
  const parent = await validateGrantParent(parentBinding, platform)
  const filename = path.basename(filePath)
  const temporaryName = `.custom-browser-grant-${process.pid}-${randomUUID()}.tmp`
  const temporaryCandidate = (await grantPathCandidates(parent, temporaryName))[0]!
  const targetCandidate = (await grantPathCandidates(parent, filename))[0]!
  let handle: FileHandle | undefined
  let created = false
  let renamed = false
  let transferred = false
  try {
    if (platform !== 'Windows') await parent.handle?.chmod(0o700)
    if (!temporaryCandidate.anchored) await validateRawGrantParent(parentBinding, platform)
    try {
      handle = await open(temporaryCandidate.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (HAS_NOFOLLOW ? NOFOLLOW : 0), 0o600)
      created = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && temporaryCandidate.anchored) await afterAnchoredGrantPathMiss?.()
      throw error
    }
    if (!temporaryCandidate.anchored) await validateRawGrantParent(parentBinding, platform)
    await handle.chmod(0o600)
    await handle.writeFile(serialized, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    if (!targetCandidate.anchored) await validateRawGrantParent(parentBinding, platform)
    await rename(temporaryCandidate.path, targetCandidate.path)
    renamed = true
    transferred = true
    return Object.freeze({ directory: parent.binding.realPath, parent })
  } finally {
    await handle?.close().catch(() => undefined)
    if (!renamed && created) {
      try {
        if (!temporaryCandidate.anchored) await validateRawGrantParent(parentBinding, platform)
        await rm(temporaryCandidate.path, { force: true })
      } catch { /* leave an untrusted temporary path untouched */ }
    }
    if (!transferred) await closeGrantParent(parent)
  }
}

export class LauncherCustomBrowserController {
  readonly #grantPath: string
  readonly #parentBinding: GrantParentBinding | undefined
  #grant: Grant | undefined
  #status: LauncherCustomBrowserSnapshot['status']
  #mutationTail: Promise<void> = Promise.resolve()
  #activeControllers = new Set<AbortController>()
  #activeWork = new Set<Promise<unknown>>()
  #disposed = false
  #generation = 0

  private readonly options: ControllerOptions

  private constructor(options: ControllerOptions, parentBinding: GrantParentBinding | undefined, grant: Grant | undefined, status: LauncherCustomBrowserSnapshot['status']) {
    this.options = options
    this.#grantPath = path.join(options.userDataPath, 'launcher', 'custom-browser-grant.json')
    this.#parentBinding = parentBinding
    this.#grant = grant
    this.#status = status
  }

  static async open(options: ControllerOptions): Promise<LauncherCustomBrowserController> {
    const grantPath = path.join(options.userDataPath, 'launcher', 'custom-browser-grant.json')
    const directory = path.dirname(grantPath)
    let parentBinding: GrantParentBinding | undefined
    try {
      await mkdir(directory, { mode: 0o700, recursive: true })
      const parent = await validateGrantParent(directory, options.platform)
      parentBinding = parent.binding
      await closeGrantParent(parent)
    } catch { return new LauncherCustomBrowserController(options, undefined, undefined, 'revoked') }
    try {
      const grant = await readGrant(grantPath, parentBinding, options.platform, options.afterAnchoredGrantPathMiss)
      if (grant === undefined) return new LauncherCustomBrowserController(options, parentBinding, undefined, 'none')
      if (options.platform === 'Linux' || grant.platform !== options.platform) return new LauncherCustomBrowserController(options, parentBinding, undefined, 'revoked')
      await revalidateGrant(grant, parentBinding)
      return new LauncherCustomBrowserController(options, parentBinding, grant, 'active')
    } catch { return new LauncherCustomBrowserController(options, parentBinding, undefined, 'revoked') }
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
    if (this.#parentBinding === undefined) throw new Error('Custom browser grant directory is unavailable')
    if (!HAS_NOFOLLOW && this.options.identitySafeEffects !== true) throw new Error('Custom browser selection is unavailable on this platform')
    throwIfAborted(signal)
    await this.#enqueue(async operationSignal => {
      throwIfAborted(operationSignal)
      const grant = await validateBrowserTarget(target, this.options.platform as DesktopBrowserPlatform)
      throwIfAborted(operationSignal)
      const written = await writeGrant(
        this.#grantPath,
        grant,
        this.options.platform,
        this.#parentBinding!,
        this.options.serializeGrant ?? serializeLauncherCustomBrowserGrant,
        this.options.afterAnchoredGrantPathMiss,
      )
      try {
        // Rename is the file commit point. Keep disk and memory matching before
        // the best-effort directory durability step or any owner cancellation.
        this.#grant = grant
        this.#status = 'active'
        this.options.afterGrantMutation?.('select')
        try {
          const after = await validateGrantParent(this.#parentBinding!, this.options.platform)
          await closeGrantParent(after)
        } catch (error) {
          this.#grant = undefined
          this.#status = 'revoked'
          throw error
        }
        try {
          await syncGrantDirectory(this.options.syncDirectory ?? (async targetDirectory => await syncDirectory(targetDirectory, this.options.platform)), written.directory, this.options.platform)
        } catch (error) {
          try {
            const afterSyncFailure = await validateGrantParent(this.#parentBinding!, this.options.platform)
            await closeGrantParent(afterSyncFailure)
          } catch {
            this.#grant = undefined
            this.#status = 'revoked'
          }
          throw error
        }
        try {
          const afterSync = await validateGrantParent(this.#parentBinding!, this.options.platform)
          await closeGrantParent(afterSync)
        } catch (error) {
          this.#grant = undefined
          this.#status = 'revoked'
          throw error
        }
        throwIfAborted(operationSignal)
      } finally { await closeGrantParent(written.parent) }
    }, signal)
  }

  async revoke(signal?: AbortSignal): Promise<void> {
    if (this.#disposed) throw new Error('Custom browser controller is disposed')
    if (this.#parentBinding === undefined) throw new Error('Custom browser grant directory is unavailable')
    throwIfAborted(signal)
    await this.#enqueue(async operationSignal => {
      throwIfAborted(operationSignal)
      const parent = await validateGrantParent(this.#parentBinding!, this.options.platform)
      try {
        const candidate = (await grantPathCandidates(parent, path.basename(this.#grantPath)))[0]!
        let exists = true
        try { await lstat(candidate.path) }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          if (candidate.anchored) await this.options.afterAnchoredGrantPathMiss?.()
          exists = false
        }
        if (exists) {
          if (!candidate.anchored) await validateRawGrantParent(this.#parentBinding!, this.options.platform)
          await rm(candidate.path, { force: true })
        }
        // Removal is the file commit point; never retain a stale active grant
        // while directory durability is being attempted.
        this.#grant = undefined
        this.#status = 'none'
        const after = await validateGrantParent(this.#parentBinding!, this.options.platform)
        await closeGrantParent(after)
        await syncGrantDirectory(this.options.syncDirectory ?? (async targetDirectory => await syncDirectory(targetDirectory, this.options.platform)), this.#parentBinding!.realPath, this.options.platform)
        const afterSync = await validateGrantParent(this.#parentBinding!, this.options.platform)
        await closeGrantParent(afterSync)
        this.options.afterGrantMutation?.('revoke')
        throwIfAborted(operationSignal)
      } finally { await closeGrantParent(parent) }
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
        await awaitBoundedEffect(() => this.options.openDefault(normalized, operationSignal), operationSignal, effectTimeout(this.options))
        throwIfAborted(operationSignal)
        return
      }
      const grant = this.#grant
      if (this.#status === 'none') throw new Error('No custom browser grant is selected')
      if (this.#status !== 'active' || grant === undefined || grant.platform !== this.options.platform) throw new Error('Custom browser grant is revoked')
      if (this.#parentBinding === undefined) throw new Error('Custom browser grant directory is unavailable')
      if (!HAS_NOFOLLOW && this.options.identitySafeEffects !== true) throw new Error('Custom browser launch is unavailable on this platform')
      try { await revalidateGrant(grant, this.#parentBinding) }
      catch (error) { this.#grant = undefined; this.#status = 'revoked'; throw new Error('Custom browser grant changed or was revoked', { cause: error }) }
      throwIfAborted(operationSignal)
      if (grant.platform === 'macOS') {
        await awaitBoundedEffect(() => this.options.launch('/usr/bin/open', ['-a', grant.path, normalized], operationSignal), operationSignal, effectTimeout(this.options))
        throwIfAborted(operationSignal)
        return
      }
      const template = this.options.getSetting('general.browser.customWebBrowser.commandlineArguments', '{{url}}')
      await awaitBoundedEffect(() => this.options.launch(grant.path, parseLauncherCustomBrowserArgumentTemplate(template, normalized), operationSignal), operationSignal, effectTimeout(this.options))
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
