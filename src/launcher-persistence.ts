import { constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, link, mkdir, mkdtemp, open, realpath, rename, rm, lstat } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { LauncherInternalResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_RANKING_MAX_BYTES,
  parseLauncherRanking,
  pruneLauncherRanking,
  recordLauncherUsage,
  type LauncherRankingEntry,
} from './launcher-ranking.ts'
import {
  isLauncherRendererSettingValue,
  LAUNCHER_MAIN_OWNED_SETTING_KEYS,
  LAUNCHER_SENSITIVE_SETTING_KEYS,
  MAX_LAUNCHER_INDEX_BYTES,
  MAX_LAUNCHER_LOG_BYTES,
  MAX_LAUNCHER_LOG_ENTRIES,
  MAX_LAUNCHER_SETTINGS_BYTES,
  MAX_LAUNCHER_SETTING_VALUE_BYTES,
  normalizeLauncherSearchHistory,
  parseLauncherSettingsRecord,
  type LauncherSettingsRecord,
  type LauncherSettingsSnapshot,
} from './launcher-settings-contract.ts'
import { isLauncherRuntimeSettingKey } from './launcher-setting-keys.ts'

const NOFOLLOW = constants.O_NOFOLLOW
const HAS_NOFOLLOW = typeof NOFOLLOW === 'number' && NOFOLLOW > 0
const READ_FILE_FLAGS = constants.O_RDONLY | (HAS_NOFOLLOW ? NOFOLLOW : 0) | (constants.O_NONBLOCK ?? 0)
const MAX_INDEX_ITEMS = 50_000
const MAX_LOG_MESSAGE_LENGTH = 512
const MAX_LOG_ENTRIES = MAX_LAUNCHER_LOG_ENTRIES
const MAX_GRANT_BYTES = 16 * 1024
const MAX_EXTERNAL_TRANSACTION_BYTES = 40 * 1024
const ENVELOPE_VERSION = 1 as const
const ENVELOPE_KEY = '$tockteamEncrypted'

type StoredSecretEnvelope = Readonly<{ [ENVELOPE_KEY]: Readonly<{ ciphertext: string; version: typeof ENVELOPE_VERSION }> }>
type StoredSettings = Record<string, unknown>

type ExternalGrant = Readonly<{
  dev: string
  ino: string
  parentRealPath: string
  path: string
  version: 1
}>

type ExternalReplacementJournal = Readonly<{
  next: ExternalGrant
  previous: ExternalGrant
  directory?: string
  previousSha256?: string
  version: 1 | 2
}>

export type LauncherSecretCodec = Readonly<{
  decrypt: (ciphertext: string) => string
  encrypt: (plaintext: string) => string
  isAvailable?: () => boolean
}>

export type LauncherPersistenceOptions = Readonly<{
  externalWriteAvailable?: boolean
  now?: () => number
  secretCodec?: LauncherSecretCodec
  secureStorageAvailable?: boolean
  userDataPath: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('TockLauncher settings mutation canceled')
}

function identityPart(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value.toString(10) : undefined
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined
  if (typeof value === 'string' && /^[0-9]+$/u.test(value)) return value.replace(/^0+(?=\d)/u, '')
  return undefined
}

function cloneJson<T>(value: T, maxBytes = MAX_LAUNCHER_SETTING_VALUE_BYTES): T {
  const encoded = JSON.stringify(value)
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > maxBytes) throw new Error('TockLauncher JSON value exceeds its size limit')
  return JSON.parse(encoded) as T
}

function freezeJson<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) freezeJson(child)
  return Object.freeze(value)
}

function isEncryptedEnvelope(value: unknown): value is StoredSecretEnvelope {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, ENVELOPE_KEY)) return false
  const envelope = value[ENVELOPE_KEY]
  return isRecord(envelope)
    && Object.keys(envelope).length === 2
    && envelope.version === ENVELOPE_VERSION
    && typeof envelope.ciphertext === 'string'
    && envelope.ciphertext.length > 0
    && envelope.ciphertext.length <= MAX_LAUNCHER_SETTING_VALUE_BYTES
}

function envelope(ciphertext: string): StoredSecretEnvelope {
  if (ciphertext.length === 0 || ciphertext.length > MAX_LAUNCHER_SETTING_VALUE_BYTES) throw new Error('TockLauncher encrypted setting exceeds its size limit')
  return Object.freeze({ [ENVELOPE_KEY]: Object.freeze({ ciphertext, version: ENVELOPE_VERSION }) }) as StoredSecretEnvelope
}

function parseStoredSettings(value: unknown, options: Readonly<{ omitMainOwned?: boolean; omitSensitive?: boolean }> = {}): StoredSettings {
  if (!isRecord(value)) throw new Error('TockLauncher settings file is invalid')
  const parsed: StoredSettings = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!isLauncherRuntimeSettingKey(key)) throw new Error('TockLauncher settings key is not allowlisted')
    if (options.omitMainOwned && LAUNCHER_MAIN_OWNED_SETTING_KEYS.includes(key as never)) continue
    if (LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never)) {
      if (options.omitSensitive) continue
      if (!isEncryptedEnvelope(raw)) throw new Error('TockLauncher sensitive setting is invalid')
      parsed[key] = cloneJson(raw)
      continue
    }
    if (!isLauncherRendererSettingValue(key, raw)) throw new Error('TockLauncher setting value is invalid')
    parsed[key] = cloneJson(raw)
  }
  const normalized = normalizeLauncherSearchHistory(parsed)
  const serialized = JSON.stringify(normalized)
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_LAUNCHER_SETTINGS_BYTES) throw new Error('TockLauncher settings file exceeds the size limit')
  return normalized
}

function parseGrant(value: unknown): ExternalGrant {
  if (!isRecord(value)
    || Object.keys(value).length !== 5
    || identityPart(value.dev) === undefined
    || identityPart(value.ino) === undefined
    || typeof value.parentRealPath !== 'string' || value.parentRealPath.length === 0 || value.parentRealPath.length > 16_384 || /[\0\r\n]/u.test(value.parentRealPath)
    || typeof value.path !== 'string' || value.path.length === 0 || value.path.length > 16_384 || /[\0\r\n]/u.test(value.path)
    || value.version !== 1) throw new Error('TockLauncher external settings grant is invalid')
  return Object.freeze({
    dev: identityPart(value.dev)!,
    ino: identityPart(value.ino)!,
    parentRealPath: value.parentRealPath,
    path: value.path,
    version: 1,
  })
}

function parseExternalReplacementJournal(value: unknown): ExternalReplacementJournal {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || Object.keys(value).length !== (value.version === 1 ? 3 : 5)) throw new Error('TockLauncher external settings transaction is invalid')
  const next = parseGrant(value.next)
  const previous = parseGrant(value.previous)
  if (next.path !== previous.path || next.parentRealPath !== previous.parentRealPath) throw new Error('TockLauncher external settings transaction changed destination')
  if (value.version === 1) return Object.freeze({ next, previous, version: 1 })
  const directory = value.directory
  const previousSha256 = value.previousSha256
  if (typeof previousSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(previousSha256)) throw new Error('TockLauncher external settings transaction digest is invalid')
  const prefix = `.${path.basename(previous.path)}.tockteam-`
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.dirname(directory) !== path.dirname(previous.path)
    || !path.basename(directory).startsWith(prefix) || !/^[A-Za-z0-9]{6}$/u.test(path.basename(directory).slice(prefix.length))) throw new Error('TockLauncher external settings transaction directory is invalid')
  return Object.freeze({ next, previous, directory, previousSha256, version: 2 })
}

function sameIdentity(stats: { dev: unknown; ino: unknown }, grant: ExternalGrant): boolean {
  return identityPart(stats.dev) === grant.dev && identityPart(stats.ino) === grant.ino
}

async function exists(filePath: string): Promise<boolean> {
  try { await lstat(filePath); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

async function readBoundedRegularFile(filePath: string, maxBytes: number, expected?: ExternalGrant): Promise<string> {
  const before = await lstat(filePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isFile()) throw new Error('TockLauncher file is not a bounded regular file')
  let handle
  try { handle = await open(filePath, READ_FILE_FLAGS) }
  catch (error) { throw new Error('TockLauncher file is unavailable', { cause: error }) }
  try {
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile() || stats.size > BigInt(maxBytes)) throw new Error('TockLauncher file is not a bounded regular file')
    if (stats.dev !== before.dev || stats.ino !== before.ino) throw new Error('TockLauncher file changed while opening')
    if (expected !== undefined && !sameIdentity(stats, expected)) throw new Error('TockLauncher external settings file changed')
    const chunks: Buffer[] = []
    let total = 0
    // A file may grow after stat; read at most the limit plus one overflow byte.
    while (total <= maxBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > maxBytes) throw new Error('TockLauncher file is too large')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const text = Buffer.concat(chunks, total).toString('utf8')
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('TockLauncher file is too large')
    const after = await lstat(filePath, { bigint: true })
    if (after.isSymbolicLink() || !sameIdentity(after, { dev: identityPart(before.dev)!, ino: identityPart(before.ino)! } as ExternalGrant)) throw new Error('TockLauncher file changed while reading')
    if (expected !== undefined && !sameIdentity(after, expected)) throw new Error('TockLauncher external settings file changed')
    return text
  } finally { await handle.close() }
}

async function readJson<T>(filePath: string, maxBytes: number, parser: (value: unknown) => T, expected?: ExternalGrant): Promise<T> {
  const text = await readBoundedRegularFile(filePath, maxBytes, expected)
  try { return parser(JSON.parse(text) as unknown) }
  catch (error) { throw new Error('TockLauncher file contents are invalid', { cause: error }) }
}

function unsupportedWindowsDirectorySync(error: unknown): boolean {
  if (process.platform !== 'win32') return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EINVAL' || code === 'ENOTSUP' || code === 'EOPNOTSUPP' || code === 'EBADF' || code === 'EPERM'
}

async function syncDirectory(directory: string): Promise<void> {
  let handle
  try { handle = await open(directory, constants.O_RDONLY) }
  catch (error) { if (unsupportedWindowsDirectorySync(error)) return; throw error }
  try { await handle.sync() }
  catch (error) { if (!unsupportedWindowsDirectorySync(error)) throw error }
  finally { await handle.close() }
}

export async function ensurePrivateDirectory(directory: string, preserveMode = false): Promise<void> {
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 })
  try { await mkdir(directory, { mode: 0o700 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const selected = await lstat(directory, { bigint: true })
  if (selected.isSymbolicLink() || !selected.isDirectory()) throw new Error('TockLauncher managed directory must not be a symlink')
  const handle = await open(directory, constants.O_RDONLY | (HAS_NOFOLLOW ? NOFOLLOW : 0))
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isDirectory() || identityPart(opened.dev) !== identityPart(selected.dev) || identityPart(opened.ino) !== identityPart(selected.ino)) {
      throw new Error('TockLauncher managed directory changed')
    }
    // Windows inherits the app-data ACL; directory fchmod neither establishes ACL privacy nor works there.
    if (!preserveMode && process.platform !== 'win32') await handle.chmod(0o700)
  } finally { await handle.close() }
}

/** Atomic file writer. Export destinations keep their user-owned directory permissions. */
export async function atomicWrite(filePath: string, contents: string, options: Readonly<{
  backup?: boolean
  backupMaxBytes?: number
  preserveDirectoryMode?: boolean
  validateBackup?: (contents: string) => void
}> = {}): Promise<void> {
  const directory = path.dirname(filePath)
  await ensurePrivateDirectory(directory, options.preserveDirectoryMode)
  if (options.backup !== false && await exists(filePath)) {
    try {
      const previous = await readBoundedRegularFile(filePath, options.backupMaxBytes ?? MAX_LAUNCHER_INDEX_BYTES)
      options.validateBackup?.(previous)
      await atomicWrite(`${filePath}.bak`, previous, { backup: false, preserveDirectoryMode: options.preserveDirectoryMode === true })
    } catch { /* invalid primary is not copied over a known-good backup */ }
  }
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (HAS_NOFOLLOW ? NOFOLLOW : 0), 0o600)
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
    await handle.close(); handle = undefined
    await rename(temporary, filePath)
    await chmod(filePath, 0o600)
    await syncDirectory(directory)
  } finally {
    await handle?.close().catch(() => undefined)
    await rm(temporary, { force: true })
  }
}

const INDEX_ACTION_KEYS = ['argument', 'description', 'handlerKey', 'hideWindowAfterInvocation', 'keyboardShortcut', 'requiresConfirmation']
const INDEX_ITEM_KEYS = ['additionalActions', 'defaultAction', 'description', 'details', 'id', 'imageKey', 'name', 'sourceExtension']

function parseIndexAction(value: unknown): void {
  if (!isRecord(value)
    || Object.keys(value).some(key => !INDEX_ACTION_KEYS.includes(key))
    || typeof value.argument !== 'string' || value.argument.length === 0 || value.argument.length > 16_384 || /[\0\r\n]/u.test(value.argument)
    || typeof value.description !== 'string' || value.description.length === 0 || value.description.length > 512 || /[\0\r\n]/u.test(value.description)
    || typeof value.handlerKey !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.handlerKey)
    || (value.hideWindowAfterInvocation !== undefined && typeof value.hideWindowAfterInvocation !== 'boolean')
    || (value.keyboardShortcut !== undefined && (typeof value.keyboardShortcut !== 'string' || value.keyboardShortcut.length === 0 || value.keyboardShortcut.length > 128))
    || (value.requiresConfirmation !== undefined && typeof value.requiresConfirmation !== 'boolean')) throw new Error('TockLauncher index action is invalid')
}

function parseIndex(value: unknown): LauncherInternalResultItem[] {
  if (!Array.isArray(value) || value.length > MAX_INDEX_ITEMS) throw new Error('TockLauncher index is invalid')
  const parsed: LauncherInternalResultItem[] = []
  for (const raw of value) {
    if (!isRecord(raw)
      || Object.keys(raw).some(key => !INDEX_ITEM_KEYS.includes(key))
      || typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 512 || /[\0\r\n]/u.test(raw.id)
      || typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > 512 || /[\0\r\n]/u.test(raw.name)
      || typeof raw.description !== 'string' || raw.description.length === 0 || raw.description.length > 2_048 || /[\0\r\n]/u.test(raw.description)
      || typeof raw.sourceExtension !== 'string' || raw.sourceExtension.length === 0 || raw.sourceExtension.length > 128 || /[\0\r\n]/u.test(raw.sourceExtension)
      || (raw.imageKey !== undefined && (typeof raw.imageKey !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(raw.imageKey)))
      || (raw.details !== undefined && (typeof raw.details !== 'string' || raw.details.length > 8_192 || /[\0\r\n]/u.test(raw.details)))
      || !isRecord(raw.defaultAction)) throw new Error('TockLauncher index item is invalid')
    parseIndexAction(raw.defaultAction)
    const additional = raw.additionalActions
    if (additional !== undefined && (!Array.isArray(additional) || additional.length > 16)) throw new Error('TockLauncher index actions are invalid')
    additional?.forEach(parseIndexAction)
    parsed.push(cloneJson(raw, MAX_LAUNCHER_INDEX_BYTES) as LauncherInternalResultItem)
  }
  const encoded = JSON.stringify(parsed)
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_LAUNCHER_INDEX_BYTES) throw new Error('TockLauncher index is too large')
  return parsed
}

function parseLogs(value: unknown): string[] {
  if (!Array.isArray(value)
    || value.length > MAX_LAUNCHER_LOG_ENTRIES
    || value.some(entry => typeof entry !== 'string' || entry.length > MAX_LOG_MESSAGE_LENGTH + 64 || /[\0\r\n]/u.test(entry))) {
    throw new Error('TockLauncher logs are invalid')
  }
  return [...value]
}

export class LauncherPersistenceRepository {
  readonly #rootPath: string
  readonly #managedSettingsPath: string
  readonly #indexPath: string
  readonly #logsPath: string
  readonly #rankingPath: string
  readonly #grantPath: string
  readonly #externalTransactionPath: string
  readonly #externalBackupRoot: string
  readonly #secretCodec: LauncherSecretCodec | undefined
  readonly #secureStorageAvailable: boolean | undefined
  readonly #externalWriteAvailable: boolean
  readonly #now: () => number
  #settings: StoredSettings = {}
  #settingsSource: LauncherSettingsSnapshot['settingsSource'] = 'managed'
  #externalGrant: ExternalGrant | undefined
  #externalGrantStatus: LauncherSettingsSnapshot['externalGrantStatus'] = 'none'
  #index: LauncherInternalResultItem[] = []
  #logs: string[] = []
  #ranking: readonly LauncherRankingEntry[] = Object.freeze([])
  #rankingGeneration = 0
  #rankingResetInProgress = false
  #recoveredArtifacts = new Set<'external' | 'index' | 'logs' | 'settings'>()
  #recoveredSettings = false
  #mutationTail: Promise<void> = Promise.resolve()
  #closed = false

  private constructor(options: LauncherPersistenceOptions) {
    this.#rootPath = path.join(options.userDataPath, 'launcher')
    this.#managedSettingsPath = path.join(this.#rootPath, 'settings.json')
    this.#indexPath = path.join(this.#rootPath, 'search-index.json')
    this.#logsPath = path.join(this.#rootPath, 'logs.json')
    this.#rankingPath = path.join(this.#rootPath, 'usage-ranking.json')
    this.#grantPath = path.join(this.#rootPath, 'external-settings-grant.json')
    this.#externalTransactionPath = path.join(this.#rootPath, 'external-settings-transaction.json')
    this.#externalBackupRoot = path.join(this.#rootPath, 'external-backups')
    this.#secretCodec = options.secretCodec
    this.#secureStorageAvailable = options.secureStorageAvailable
    this.#now = options.now ?? Date.now
    this.#externalWriteAvailable = options.externalWriteAvailable ?? (HAS_NOFOLLOW && process.platform !== 'win32')
  }

  static async open(options: LauncherPersistenceOptions): Promise<LauncherPersistenceRepository> {
    const repository = new LauncherPersistenceRepository(options)
    await repository.#initialize()
    return repository
  }

  async #initialize(): Promise<void> {
    await ensurePrivateDirectory(this.#rootPath)
    this.#settings = await this.#recoverJson(this.#managedSettingsPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), {}, recovered => {
      if (recovered) { this.#recoveredSettings = true; this.#recoveredArtifacts.add('settings') }
    })
    const index = await this.#recoverJson(this.#indexPath, MAX_LAUNCHER_INDEX_BYTES, parseIndex, undefined, recovered => {
      if (recovered) this.#recoveredArtifacts.add('index')
    })
    this.#index = index ?? []
    this.#logs = await this.#recoverJson(this.#logsPath, MAX_LAUNCHER_LOG_BYTES, parseLogs, [], recovered => {
      if (recovered) this.#recoveredArtifacts.add('logs')
    })
    const ranking = await this.#recoverJson(this.#rankingPath, LAUNCHER_RANKING_MAX_BYTES, parseLauncherRanking, [])
    const prunedRanking = pruneLauncherRanking(ranking, this.#now())
    this.#ranking = Object.freeze([...prunedRanking])
    if (!isDeepStrictEqual(ranking, prunedRanking) && await exists(this.#rankingPath)) {
      try {
        await atomicWrite(this.#rankingPath, JSON.stringify(prunedRanking, null, 2), {
          backupMaxBytes: LAUNCHER_RANKING_MAX_BYTES,
          validateBackup: contents => { parseLauncherRanking(JSON.parse(contents) as unknown) },
        })
      } catch { /* stale ranking is already removed from the in-memory source of truth */ }
    }
    if (await this.#recoverExternalReplacement()) {
      this.#externalGrant = undefined; this.#externalGrantStatus = 'revoked'; this.#settingsSource = 'managed'
      return
    }
    if (!await exists(this.#grantPath)) return
    try {
      const grant = await readJson(this.#grantPath, MAX_GRANT_BYTES, parseGrant)
      await this.#loadExternal(grant)
    } catch {
      this.#externalGrant = undefined; this.#externalGrantStatus = 'revoked'; this.#settingsSource = 'managed'
    }
  }

  async #recoverExternalReplacement(): Promise<boolean> {
    if (!await exists(this.#externalTransactionPath)) return false
    let journal: ExternalReplacementJournal
    try { journal = await readJson(this.#externalTransactionPath, MAX_EXTERNAL_TRANSACTION_BYTES, parseExternalReplacementJournal) }
    catch {
      await rm(this.#externalTransactionPath, { force: true }).catch(() => undefined)
      await syncDirectory(this.#rootPath).catch(() => undefined)
      return false
    }
    // Recovery cannot recreate authority that was revoked or replaced after the write.
    const authorized = await readJson(this.#grantPath, MAX_GRANT_BYTES, parseGrant).catch(() => undefined)
    if (authorized === undefined || (!this.#sameGrant(authorized, journal.previous) && !this.#sameGrant(authorized, journal.next))) {
      await rm(this.#externalTransactionPath, { force: true })
      await syncDirectory(this.#rootPath)
      return false
    }
    try {
      if (journal.directory !== undefined && await exists(journal.directory)) {
        await this.#validateExternalTransactionDirectory(journal)
        if (!await exists(journal.previous.path)) {
          await link(path.join(journal.directory, 'previous.json'), journal.previous.path)
          await syncDirectory(journal.previous.parentRealPath)
        }
        const preserved = path.join(journal.directory, 'previous.json')
        if (await exists(preserved)) {
          const contents = await readBoundedRegularFile(preserved, MAX_LAUNCHER_SETTINGS_BYTES, journal.previous)
          if (createHash('sha256').update(contents).digest('hex') !== journal.previousSha256) return true
        }
      }
      const current = await this.#createGrant(journal.next.path)
      if (this.#sameGrant(current, journal.next)) {
        const settings = await readJson(current.path, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), current)
        const serialized = JSON.stringify(settings, null, 2)
        await atomicWrite(this.#externalBackupPath(current), serialized, { backup: false })
        await atomicWrite(this.#grantPath, JSON.stringify(current, null, 2), { backup: false })
        if (!sameIdentity(current, journal.previous)) await rm(this.#externalBackupPath(journal.previous), { force: true })
      } else if (this.#sameGrant(current, journal.previous)) {
        await readJson(current.path, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), current)
      } else return true
      if (journal.directory !== undefined && await exists(journal.directory)) {
        const preserved = path.join(journal.directory, 'previous.json')
        // Never delete an unexpected version displaced by a concurrent writer.
        if (await exists(preserved) && !sameIdentity(await lstat(preserved, { bigint: true }), journal.previous)) return true
        await rm(journal.directory, { recursive: true })
        await syncDirectory(journal.previous.parentRealPath)
      }
      await rm(this.#externalTransactionPath, { force: true })
      await syncDirectory(this.#rootPath)
      return false
    } catch { return true }
  }

  async #validateExternalTransactionDirectory(journal: ExternalReplacementJournal): Promise<void> {
    const directory = journal.directory!
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory
      || await realpath(path.dirname(journal.previous.path)) !== journal.previous.parentRealPath) throw new Error('TockLauncher external settings transaction directory changed')
  }

  async #recoverJson<T>(filePath: string, maxBytes: number, parser: (value: unknown) => T, fallback: T, setRecovered?: (recovered: boolean) => void): Promise<T> {
    if (await exists(filePath)) {
      try {
        const parsed = await readJson(filePath, maxBytes, parser)
        await chmod(filePath, 0o600).catch(() => undefined)
        return parsed
      } catch { /* use the independently validated backup */ }
    }
    const backup = `${filePath}.bak`
    if (!await exists(backup)) return fallback
    try {
      const recovered = await readJson(backup, maxBytes, parser)
      await atomicWrite(filePath, JSON.stringify(recovered, null, 2), { backup: false })
      setRecovered?.(true)
      return recovered
    } catch { return fallback }
  }

  async #loadExternal(grant: ExternalGrant): Promise<void> {
    const backupPath = this.#externalBackupPath(grant)
    try {
      const currentGrant = await this.#createGrant(grant.path)
      if (!this.#sameGrant(currentGrant, grant)) throw new Error('TockLauncher external settings grant changed')
      const settings = await readJson(grant.path, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), grant)
      this.#externalGrant = grant; this.#externalGrantStatus = 'active'; this.#settingsSource = 'external'; this.#settings = settings
      return
    } catch {
      if (!await exists(backupPath)) throw new Error('External settings source is invalid')
      const backup = await readJson(backupPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value))
      const refreshedGrant = await this.#writeExternalDescriptor(grant, JSON.stringify(backup, null, 2))
      this.#externalGrant = refreshedGrant; this.#externalGrantStatus = 'active'; this.#settingsSource = 'external'; this.#settings = backup; this.#recoveredSettings = true; this.#recoveredArtifacts.add('external')
    }
  }

  #externalBackupPath(grant: ExternalGrant): string { return path.join(this.#externalBackupRoot, `${grant.dev}-${grant.ino}.bak`) }

  get externalWriteAvailable(): boolean { return this.#externalWriteAvailable }
  get secureStorageAvailable(): boolean { return this.#secureStorageUsable() }

  getSetting<T>(key: string, defaultValue: T): T {
    if (!isLauncherRuntimeSettingKey(key)) throw new Error('TockLauncher setting key is not allowlisted')
    if (!Object.hasOwn(this.#settings, key)) return cloneJson(defaultValue)
    const stored = this.#settings[key]
    if (LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never)) {
      if (!isEncryptedEnvelope(stored) || this.#secretCodec === undefined || !this.#secureStorageUsable()) return cloneJson(defaultValue)
      try {
        const plaintext = this.#secretCodec.decrypt(stored[ENVELOPE_KEY].ciphertext)
        if (!isLauncherRendererSettingValue(key, plaintext)) return cloneJson(defaultValue)
        return cloneJson(plaintext as T)
      }
      catch { return cloneJson(defaultValue) }
    }
    return cloneJson(stored) as T
  }

  readIndex(): readonly LauncherInternalResultItem[] { return Object.freeze(cloneJson(this.#index, MAX_LAUNCHER_INDEX_BYTES)) }

  readRanking(): readonly LauncherRankingEntry[] { return Object.freeze(cloneJson(this.#ranking, LAUNCHER_RANKING_MAX_BYTES)) }

  async recordUsage(itemId: string, now = this.#now()): Promise<void> {
    if (this.#closed) throw new Error('TockLauncher persistence repository is closed')
    if (this.#rankingResetInProgress) return
    const generation = this.#rankingGeneration
    const next = recordLauncherUsage(this.#ranking, itemId, now)
    this.#ranking = Object.freeze([...next])
    try {
      await this.#enqueue(async () => {
        if (generation !== this.#rankingGeneration) return
        await atomicWrite(this.#rankingPath, JSON.stringify(next, null, 2), {
          backupMaxBytes: LAUNCHER_RANKING_MAX_BYTES,
          validateBackup: contents => { parseLauncherRanking(JSON.parse(contents) as unknown) },
        })
      })
    } catch { /* usage remains available in memory when ranking persistence fails */ }
  }

  #secureStorageUsable(): boolean {
    try {
      if (this.#secureStorageAvailable === false) return false
      return this.#secretCodec?.isAvailable?.() ?? this.#secureStorageAvailable ?? true
    }
    catch { return false }
  }

  snapshot(): LauncherSettingsSnapshot {
    const values: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(this.#settings)) {
      if (LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never) || LAUNCHER_MAIN_OWNED_SETTING_KEYS.includes(key as never)) continue
      values[key] = cloneJson(value)
    }
    freezeJson(values)
    const missingSensitiveKeys = LAUNCHER_SENSITIVE_SETTING_KEYS.filter(key => {
      const stored = this.#settings[key]
      if (!isEncryptedEnvelope(stored) || this.#secretCodec === undefined || !this.#secureStorageUsable()) return true
      try {
        const plaintext = this.#secretCodec.decrypt(stored[ENVELOPE_KEY].ciphertext)
        return !isLauncherRendererSettingValue(key, plaintext)
      } catch { return true }
    })
    return Object.freeze({
      externalGrantStatus: this.#externalGrantStatus,
      logs: Object.freeze([...this.#logs]),
      missingSensitiveKeys: Object.freeze(missingSensitiveKeys),
      recoveredArtifacts: Object.freeze([...this.#recoveredArtifacts].toSorted()),
      recoveredSettings: this.#recoveredSettings,
      settingsSource: this.#settingsSource,
      values: Object.freeze(values),
    })
  }

  async updateSetting(key: string, value: unknown, signal?: AbortSignal): Promise<void> { await this.updateSettings({ [key]: value }, signal) }

  async updateSettings(values: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    await this.#enqueue(async () => {
      throwIfAborted(signal)
      const next = { ...this.#settings }
      for (const [key, value] of Object.entries(values)) {
        if (!isLauncherRuntimeSettingKey(key) || LAUNCHER_MAIN_OWNED_SETTING_KEYS.includes(key as never) || !isLauncherRendererSettingValue(key, value)) throw new Error('Invalid TockLauncher setting update')
        if (LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never)) {
          if (this.#secretCodec === undefined || !this.#secureStorageUsable()) throw new Error('TockLauncher secure storage is unavailable')
          let ciphertext: string
          try { ciphertext = this.#secretCodec.encrypt(String(value)) } catch (error) { throw new Error('TockLauncher secure storage failed', { cause: error }) }
          next[key] = envelope(ciphertext)
        } else next[key] = cloneJson(value)
        if (key === 'general.searchHistory.enabled' && value === false) next['general.searchHistory.history'] = []
      }
      parseStoredSettings(next)
      throwIfAborted(signal)
      await this.#writeSettings(next)
    })
  }

  async resetSettings(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    if (this.#closed) throw new Error('TockLauncher persistence repository is closed')
    const generation = ++this.#rankingGeneration
    this.#rankingResetInProgress = true
    this.#ranking = Object.freeze([])
    try {
      await this.#enqueue(async () => {
        throwIfAborted(signal)
        await rm(this.#rankingPath, { force: true })
        await rm(`${this.#rankingPath}.bak`, { force: true })
        await syncDirectory(this.#rootPath)
        await this.#writeSettings({})
        this.#ranking = Object.freeze([])
      })
    } finally {
      if (this.#rankingGeneration === generation) this.#rankingResetInProgress = false
    }
  }

  async recordSearch(query: string, defaults: Readonly<{ historyEnabled: boolean; historyLimit: number }>): Promise<void> {
    const normalized = query.trim()
    if (normalized.length === 0 || normalized.length > 512 || /[\0\r\n]/u.test(normalized)) return
    await this.#enqueue(async () => {
      const enabled = typeof this.#settings['general.searchHistory.enabled'] === 'boolean'
        ? this.#settings['general.searchHistory.enabled'] as boolean
        : defaults.historyEnabled
      if (!enabled) return
      const storedLimit = this.#settings['general.searchHistory.limit']
      const historyLimit = typeof storedLimit === 'number' && Number.isSafeInteger(storedLimit)
        ? Math.min(100, Math.max(1, storedLimit))
        : Math.min(100, Math.max(1, defaults.historyLimit))
      const storedHistory = this.#settings['general.searchHistory.history']
      const history = Array.isArray(storedHistory) ? storedHistory.filter(entry => typeof entry === 'string') : []
      const next = [normalized, ...history.filter(entry => entry !== normalized)].slice(0, historyLimit)
      await this.#writeSettings({ ...this.#settings, 'general.searchHistory.history': next })
    })
  }

  async writeIndex(items: readonly LauncherInternalResultItem[]): Promise<void> {
    await this.#enqueue(async () => {
      const sanitized = items.map(item => { const copy = { ...item }; delete copy.imageUrl; return copy })
      const parsed = parseIndex(sanitized)
      await atomicWrite(this.#indexPath, JSON.stringify(parsed, null, 2), {
        backupMaxBytes: MAX_LAUNCHER_INDEX_BYTES,
        validateBackup: contents => { parseIndex(JSON.parse(contents) as unknown) },
      })
      this.#index = parsed
    })
  }

  async appendLog(level: 'DEBUG' | 'ERROR' | 'INFO' | 'WARNING', message: string): Promise<void> {
    await this.#enqueue(async () => {
      const bounded = message.replace(/[\r\n]+/gu, ' ').slice(0, MAX_LOG_MESSAGE_LENGTH)
      const next = [...this.#logs, `[${new Date().toISOString()}][${level}] ${bounded}`].slice(-MAX_LOG_ENTRIES)
      const encoded = JSON.stringify(next, null, 2)
      if (Buffer.byteLength(encoded, 'utf8') > MAX_LAUNCHER_LOG_BYTES) next.splice(0, Math.max(0, next.length - 1))
      await atomicWrite(this.#logsPath, JSON.stringify(next, null, 2), {
        backupMaxBytes: MAX_LAUNCHER_LOG_BYTES,
        validateBackup: contents => { parseLogs(JSON.parse(contents) as unknown) },
      }); this.#logs = next
    })
  }

  async importSettingsFromPath(filePath: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    const absolute = path.resolve(filePath)
    const imported = await readJson(absolute, MAX_LAUNCHER_SETTINGS_BYTES, value => parseLauncherSettingsRecord(value, { omitMainOwned: true, omitSensitive: true }))
    throwIfAborted(signal)
    await this.#enqueue(async () => {
      throwIfAborted(signal)
      const preserved = Object.fromEntries(LAUNCHER_SENSITIVE_SETTING_KEYS.flatMap(key => Object.hasOwn(this.#settings, key) ? [[key, this.#settings[key]]] : []))
      throwIfAborted(signal)
      await this.#writeSettings({ ...imported, ...preserved })
    })
  }

  async exportSettingsToPath(filePath: string): Promise<void> {
    const absolute = path.resolve(filePath)
    await this.#enqueue(async () => {
      if (await exists(absolute)) {
        const target = await this.#createGrant(absolute)
        const active = this.#externalGrant
        if (active !== undefined && (target.path === active.path || sameIdentity(target, active))) {
          throw new Error('TockLauncher export target is the active external settings file')
        }
      }
      const exported = parseLauncherSettingsRecord(this.#settings, { omitMainOwned: true, omitSensitive: true })
      await atomicWrite(absolute, JSON.stringify(exported, null, 2), { backup: false, preserveDirectoryMode: true })
    })
  }

  async grantExternalSettingsFile(filePath: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    const grant = await this.#createGrant(filePath)
    const settings = await readJson(grant.path, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), grant)
    throwIfAborted(signal)
    await this.#enqueue(async () => {
      throwIfAborted(signal)
      // Re-open/revalidate inside the serialized mutation before adopting the path.
      const current = await this.#createGrant(grant.path)
      if (!this.#sameGrant(current, grant)) throw new Error('TockLauncher external settings file changed')
      throwIfAborted(signal)
      await this.#retireExternalGrant()
      await atomicWrite(this.#grantPath, JSON.stringify(grant, null, 2), { backup: false })
      try { throwIfAborted(signal) }
      catch (error) {
        await this.#retireExternalGrant()
        throw error
      }
      this.#externalGrant = grant; this.#externalGrantStatus = 'active'; this.#settingsSource = 'external'; this.#settings = settings
    })
  }

  async revokeExternalSettingsFile(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    await this.#enqueue(async () => {
      throwIfAborted(signal)
      await this.#retireExternalGrant()
    })
  }

  async #retireExternalGrant(): Promise<void> {
    await rm(this.#grantPath, { force: true })
    this.#externalGrant = undefined; this.#externalGrantStatus = 'none'; this.#settingsSource = 'managed'
    this.#settings = await this.#recoverJson(this.#managedSettingsPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), {})
    // Persist revocation before retiring the journal, including crashes between these operations.
    await syncDirectory(this.#rootPath)
    await rm(this.#externalTransactionPath, { force: true })
    await syncDirectory(this.#rootPath)
  }

  async flush(): Promise<void> { await this.#mutationTail }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    await this.#mutationTail
  }

  async #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closed) throw new Error('TockLauncher persistence repository is closed')
    const result = this.#mutationTail.then(operation)
    this.#mutationTail = result.then(() => undefined, () => undefined)
    return await result
  }

  async #writeSettings(settings: StoredSettings): Promise<void> {
    const normalized = normalizeLauncherSearchHistory(settings)
    const serialized = JSON.stringify(normalized, null, 2)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_LAUNCHER_SETTINGS_BYTES) throw new Error('TockLauncher settings file exceeds the size limit')
    if (this.#settingsSource === 'external') {
      const grant = this.#externalGrant
      if (grant === undefined) throw new Error('TockLauncher external settings grant was revoked')
      if (!this.#externalWriteAvailable) throw new Error('TockLauncher external settings writes are unavailable on this platform')
      try {
        const previous = await readBoundedRegularFile(grant.path, MAX_LAUNCHER_SETTINGS_BYTES, grant)
        const currentSettings = parseStoredSettings(JSON.parse(previous) as unknown)
        if (!isDeepStrictEqual(currentSettings, this.#settings)) throw new Error('TockLauncher external settings file contents changed')
        const backupPath = this.#externalBackupPath(grant)
        await atomicWrite(backupPath, previous, { backup: false })
        this.#externalGrant = await this.#writeExternalDescriptor(grant, serialized, previous)
      } catch (error) {
        this.#externalGrant = undefined; this.#externalGrantStatus = 'revoked'; this.#settingsSource = 'managed'
        // Retire authority durably, without deleting the displaced editor/recovery copies.
        await rm(this.#grantPath, { force: true })
        await syncDirectory(this.#rootPath)
        this.#settings = await this.#recoverJson(this.#managedSettingsPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), {})
        throw new Error('TockLauncher external settings grant changed or was revoked. Any recovery copies remain beside the selected file.', { cause: error })
      }
    } else await atomicWrite(this.#managedSettingsPath, serialized, {
      backupMaxBytes: MAX_LAUNCHER_SETTINGS_BYTES,
      validateBackup: contents => { parseStoredSettings(JSON.parse(contents) as unknown) },
    })
    this.#settings = cloneJson(normalized, MAX_LAUNCHER_SETTINGS_BYTES)
  }

  async #writeExternalDescriptor(grant: ExternalGrant, contents: string, expected?: string): Promise<ExternalGrant> {
    if (!this.#externalWriteAvailable || !HAS_NOFOLLOW) throw new Error('TockLauncher external settings writes are unavailable on this platform')
    const parent = path.dirname(grant.path)
    if (await realpath(parent) !== grant.parentRealPath) throw new Error('TockLauncher external settings directory changed')
    const previous = expected ?? await readBoundedRegularFile(grant.path, MAX_LAUNCHER_SETTINGS_BYTES, grant)
    const directory = await mkdtemp(path.join(parent, `.${path.basename(grant.path)}.tockteam-`))
    const temporary = path.join(directory, 'next.json')
    const preserved = path.join(directory, 'previous.json')
    let staged
    let displaced = false
    try {
      staged = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600)
      await staged.writeFile(contents, 'utf8')
      await staged.sync()
      const stagedIdentity = await staged.stat({ bigint: true })
      const nextGrant = Object.freeze({ ...grant, dev: String(stagedIdentity.dev), ino: String(stagedIdentity.ino) })
      await staged.close(); staged = undefined
      await syncDirectory(directory)
      await syncDirectory(parent)
      const journal: ExternalReplacementJournal = { next: nextGrant, previous: grant, directory, previousSha256: createHash('sha256').update(previous).digest('hex'), version: 2 }
      await atomicWrite(this.#externalTransactionPath, JSON.stringify(journal, null, 2), { backup: false })
      await this.#validateExternalTransactionDirectory(journal)
      if (await readBoundedRegularFile(grant.path, MAX_LAUNCHER_SETTINGS_BYTES, grant) !== previous) throw new Error('TockLauncher external settings file changed')
      // Preserve the displaced inode, then publish without overwriting any intervening editor save.
      // The brief missing-path interval is deliberate: Node has no conditional replacement primitive.
      await rename(grant.path, preserved)
      displaced = true
      await syncDirectory(directory)
      await syncDirectory(parent)
      if (await readBoundedRegularFile(preserved, MAX_LAUNCHER_SETTINGS_BYTES, grant) !== previous) throw new Error('TockLauncher external settings file changed')
      await link(temporary, grant.path)
      await syncDirectory(parent)
      const refreshed = await this.#createGrant(grant.path)
      if (!sameIdentity(stagedIdentity, refreshed)) throw new Error('TockLauncher external settings file changed')
      await atomicWrite(this.#externalBackupPath(refreshed), contents, { backup: false })
      await atomicWrite(this.#grantPath, JSON.stringify(refreshed, null, 2), { backup: false })
      if (await readBoundedRegularFile(preserved, MAX_LAUNCHER_SETTINGS_BYTES, grant) !== previous) throw new Error('TockLauncher displaced settings were edited during commit')
      if (!sameIdentity(refreshed, grant)) await rm(this.#externalBackupPath(grant), { force: true })
      await rm(directory, { recursive: true })
      await syncDirectory(parent)
      await rm(this.#externalTransactionPath, { force: true })
      await syncDirectory(this.#rootPath)
      return refreshed
    } catch (error) {
      if (displaced) {
        // EEXIST preserves a concurrent writer. Keep both recovery versions beside the shared file.
        await link(preserved, grant.path).then(() => syncDirectory(parent)).catch(() => undefined)
      }
      throw error
    } finally {
      await staged?.close().catch(() => undefined)
      if (!displaced) await rm(directory, { recursive: true, force: true })
    }
  }

  async #createGrant(filePath: string): Promise<ExternalGrant> {
    const absolute = path.resolve(filePath)
    const selected = await lstat(absolute, { bigint: true })
    const selectedDev = identityPart(selected.dev); const selectedIno = identityPart(selected.ino)
    if (selected.isSymbolicLink() || !selected.isFile() || selectedDev === undefined || selectedIno === undefined) throw new Error('TockLauncher external settings path must be a regular file')
    const handle = await open(absolute, READ_FILE_FLAGS)
    try {
      const opened = await handle.stat({ bigint: true })
      const dev = identityPart(opened.dev); const ino = identityPart(opened.ino)
      if (!opened.isFile() || dev === undefined || ino === undefined || dev !== selectedDev || ino !== selectedIno) throw new Error('TockLauncher external settings file changed')
      const canonical = await realpath(absolute)
      const parent = await realpath(path.dirname(canonical))
      const current = await lstat(canonical, { bigint: true })
      if (current.isSymbolicLink() || identityPart(current.dev) !== dev || identityPart(current.ino) !== ino) throw new Error('TockLauncher external settings file changed')
      return Object.freeze({ dev, ino, parentRealPath: parent, path: canonical, version: 1 })
    } finally { await handle.close() }
  }

  #sameGrant(left: ExternalGrant, right: ExternalGrant): boolean { return left.path === right.path && left.parentRealPath === right.parentRealPath && left.dev === right.dev && left.ino === right.ino }
}

export function createLauncherSecretCodec(options: Readonly<{
  decrypt: (ciphertext: string) => string
  encrypt: (plaintext: string) => string
  isAvailable: () => boolean
}>): LauncherSecretCodec {
  return Object.freeze({
    decrypt: options.decrypt,
    encrypt: options.encrypt,
    isAvailable: options.isAvailable,
  })
}
