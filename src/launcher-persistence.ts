import { constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, realpath, rename, rm, lstat } from 'node:fs/promises'
import path from 'node:path'
import type { LauncherInternalResultItem } from './launcher-actions.ts'
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
const MAX_INDEX_ITEMS = 50_000
const MAX_LOG_MESSAGE_LENGTH = 512
const MAX_LOG_ENTRIES = MAX_LAUNCHER_LOG_ENTRIES
const MAX_GRANT_BYTES = 16 * 1024
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

export type LauncherSecretCodec = Readonly<{
  decrypt: (ciphertext: string) => string
  encrypt: (plaintext: string) => string
  isAvailable?: () => boolean
}>

export type LauncherPersistenceOptions = Readonly<{
  externalWriteAvailable?: boolean
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
  const flags = constants.O_RDONLY | (HAS_NOFOLLOW ? NOFOLLOW : 0)
  try { handle = await open(filePath, flags) }
  catch (error) { throw new Error('TockLauncher file is unavailable', { cause: error }) }
  try {
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile() || stats.size > BigInt(maxBytes)) throw new Error('TockLauncher file is not a bounded regular file')
    if (expected !== undefined && !sameIdentity(stats, expected)) throw new Error('TockLauncher external settings file changed')
    const text = await handle.readFile('utf8')
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

/** Managed app-owned atomic file writer. It never follows a temporary symlink. */
async function atomicWrite(filePath: string, contents: string, options: Readonly<{
  backup?: boolean
  backupMaxBytes?: number
  validateBackup?: (contents: string) => void
}> = {}): Promise<void> {
  const directory = path.dirname(filePath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  if (options.backup !== false && await exists(filePath)) {
    try {
      const previous = await readBoundedRegularFile(filePath, options.backupMaxBytes ?? MAX_LAUNCHER_INDEX_BYTES)
      options.validateBackup?.(previous)
      await atomicWrite(`${filePath}.bak`, previous, { backup: false })
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
  readonly #grantPath: string
  readonly #externalBackupRoot: string
  readonly #secretCodec: LauncherSecretCodec | undefined
  readonly #secureStorageAvailable: boolean | undefined
  readonly #externalWriteAvailable: boolean
  #settings: StoredSettings = {}
  #settingsSource: LauncherSettingsSnapshot['settingsSource'] = 'managed'
  #externalGrant: ExternalGrant | undefined
  #externalGrantStatus: LauncherSettingsSnapshot['externalGrantStatus'] = 'none'
  #index: LauncherInternalResultItem[] = []
  #indexAvailable = false
  #logs: string[] = []
  #recoveredArtifacts = new Set<'external' | 'index' | 'logs' | 'settings'>()
  #recoveredSettings = false
  #mutationTail: Promise<void> = Promise.resolve()
  #closed = false

  private constructor(options: LauncherPersistenceOptions) {
    this.#rootPath = path.join(options.userDataPath, 'launcher')
    this.#managedSettingsPath = path.join(this.#rootPath, 'settings.json')
    this.#indexPath = path.join(this.#rootPath, 'search-index.json')
    this.#logsPath = path.join(this.#rootPath, 'logs.json')
    this.#grantPath = path.join(this.#rootPath, 'external-settings-grant.json')
    this.#externalBackupRoot = path.join(this.#rootPath, 'external-backups')
    this.#secretCodec = options.secretCodec
    this.#secureStorageAvailable = options.secureStorageAvailable
    this.#externalWriteAvailable = options.externalWriteAvailable ?? (HAS_NOFOLLOW && process.platform !== 'win32')
  }

  static async open(options: LauncherPersistenceOptions): Promise<LauncherPersistenceRepository> {
    const repository = new LauncherPersistenceRepository(options)
    await repository.#initialize()
    return repository
  }

  async #initialize(): Promise<void> {
    await mkdir(this.#rootPath, { recursive: true, mode: 0o700 }); await chmod(this.#rootPath, 0o700)
    this.#settings = await this.#recoverJson(this.#managedSettingsPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), {}, recovered => {
      if (recovered) { this.#recoveredSettings = true; this.#recoveredArtifacts.add('settings') }
    })
    const index = await this.#recoverJson(this.#indexPath, MAX_LAUNCHER_INDEX_BYTES, parseIndex, undefined, recovered => {
      if (recovered) this.#recoveredArtifacts.add('index')
    })
    this.#index = index ?? []; this.#indexAvailable = index !== undefined
    this.#logs = await this.#recoverJson(this.#logsPath, MAX_LAUNCHER_LOG_BYTES, parseLogs, [], recovered => {
      if (recovered) this.#recoveredArtifacts.add('logs')
    })
    if (!await exists(this.#grantPath)) return
    try {
      const grant = await readJson(this.#grantPath, MAX_GRANT_BYTES, parseGrant)
      await this.#loadExternal(grant)
    } catch {
      this.#externalGrant = undefined; this.#externalGrantStatus = 'revoked'; this.#settingsSource = 'managed'
    }
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
      const settings = await readJson(grant.path, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), grant)
      this.#externalGrant = grant; this.#externalGrantStatus = 'active'; this.#settingsSource = 'external'; this.#settings = settings
      return
    } catch {
      if (!await exists(backupPath)) throw new Error('External settings source is invalid')
      const backup = await readJson(backupPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value))
      await this.#writeExternalDescriptor(grant, JSON.stringify(backup, null, 2), undefined)
      this.#externalGrant = grant; this.#externalGrantStatus = 'active'; this.#settingsSource = 'external'; this.#settings = backup; this.#recoveredSettings = true; this.#recoveredArtifacts.add('external')
    }
  }

  #externalBackupPath(grant: ExternalGrant): string { return path.join(this.#externalBackupRoot, `${grant.dev}-${grant.ino}.bak`) }

  get externalWriteAvailable(): boolean { return this.#externalWriteAvailable }
  get secureStorageAvailable(): boolean { return this.#secureStorageUsable() }
  get isClosed(): boolean { return this.#closed }

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
  hasPersistedIndex(): boolean { return this.#indexAvailable }

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
    await this.#enqueue(async () => { throwIfAborted(signal); await this.#writeSettings({}) })
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
      this.#index = parsed; this.#indexAvailable = true
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
    const existing = await exists(absolute)
    if (existing) {
      const stats = await lstat(absolute)
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('TockLauncher export target is invalid')
    }
    await this.#enqueue(async () => {
      const exported = parseLauncherSettingsRecord(this.#settings, { omitMainOwned: true, omitSensitive: true })
      await atomicWrite(absolute, JSON.stringify(exported, null, 2), { backup: false })
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
      await atomicWrite(this.#grantPath, JSON.stringify(grant, null, 2), { backup: false })
      try { throwIfAborted(signal) }
      catch (error) {
        await rm(this.#grantPath, { force: true }).catch(() => undefined)
        throw error
      }
      this.#externalGrant = grant; this.#externalGrantStatus = 'active'; this.#settingsSource = 'external'; this.#settings = settings
    })
  }

  async revokeExternalSettingsFile(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    await this.#enqueue(async () => {
      throwIfAborted(signal)
      await rm(this.#grantPath, { force: true })
      this.#externalGrant = undefined; this.#externalGrantStatus = 'none'; this.#settingsSource = 'managed'
      this.#settings = await this.#recoverJson(this.#managedSettingsPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), {})
    })
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
        parseStoredSettings(JSON.parse(previous) as unknown)
        const backupPath = this.#externalBackupPath(grant)
        await atomicWrite(backupPath, previous, { backup: false })
        await this.#writeExternalDescriptor(grant, serialized, previous)
        await atomicWrite(backupPath, serialized, { backup: false })
      } catch (error) {
        this.#externalGrant = undefined; this.#externalGrantStatus = 'revoked'; this.#settingsSource = 'managed'
        this.#settings = await this.#recoverJson(this.#managedSettingsPath, MAX_LAUNCHER_SETTINGS_BYTES, value => parseStoredSettings(value), {})
        throw new Error('TockLauncher external settings grant changed or was revoked', { cause: error })
      }
    } else await atomicWrite(this.#managedSettingsPath, serialized, {
      backupMaxBytes: MAX_LAUNCHER_SETTINGS_BYTES,
      validateBackup: contents => { parseStoredSettings(JSON.parse(contents) as unknown) },
    })
    this.#settings = cloneJson(normalized, MAX_LAUNCHER_SETTINGS_BYTES)
  }

  async #writeExternalDescriptor(grant: ExternalGrant, contents: string, _previous: string | undefined): Promise<void> {
    if (!this.#externalWriteAvailable || !HAS_NOFOLLOW) throw new Error('TockLauncher external settings writes are unavailable on this platform')
    const parent = await realpath(path.dirname(grant.path))
    if (parent !== grant.parentRealPath) throw new Error('TockLauncher external settings directory changed')
    const handle = await open(grant.path, constants.O_RDWR | NOFOLLOW)
    try {
      const stats = await handle.stat({ bigint: true })
      if (!stats.isFile() || !sameIdentity(stats, grant)) throw new Error('TockLauncher external settings file changed')
      await handle.truncate(0)
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
      const after = await handle.stat({ bigint: true })
      const current = await lstat(grant.path, { bigint: true })
      const parentAfter = await realpath(path.dirname(grant.path))
      if (!sameIdentity(after, grant) || !sameIdentity(current, grant) || parentAfter !== grant.parentRealPath) throw new Error('TockLauncher external settings file changed')
    } finally { await handle.close() }
  }

  async #createGrant(filePath: string): Promise<ExternalGrant> {
    const absolute = path.resolve(filePath)
    const selected = await lstat(absolute, { bigint: true })
    if (selected.isSymbolicLink() || !selected.isFile()) throw new Error('TockLauncher external settings path must be a regular file')
    const canonical = await realpath(absolute)
    const parent = await realpath(path.dirname(canonical))
    const stats = await lstat(canonical, { bigint: true })
    const dev = identityPart(stats.dev); const ino = identityPart(stats.ino)
    if (dev === undefined || ino === undefined) throw new Error('TockLauncher external settings identity is unavailable')
    return Object.freeze({ dev, ino, parentRealPath: parent, path: canonical, version: 1 })
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
