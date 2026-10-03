import { createHash, randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, lstatSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'

export type UserRaycastLocalStorageValue = string | number | boolean
type Subscriber = (key: string | undefined, data: string | undefined) => void

/** First-party managed API storage, not a filesystem sandbox for approved code. */
export function createUserRaycastStorage(path: string) {
  if (!isAbsolute(path) || !lstatSync(dirname(path)).isDirectory()) throw new Error('Invalid extension storage path')
  const listeners = new Map<string, Set<Subscriber>>()
  const localPath = `${path}.local-storage.v1.json`
  const exists = (file: string): boolean => {
    try { if (!lstatSync(file).isFile()) throw new Error('Extension storage changed'); return true }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
  }
  const read = (file: string): unknown => {
    try { return exists(file) ? JSON.parse(readBoundedRegularFile(file, 65536)) : undefined }
    catch { throw new Error('Extension storage is invalid or oversized') }
  }
  const load = (): Map<string, string> => {
    const value = read(path)
    if (value === undefined) return new Map()
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 256 || Object.values(value).some(entry => typeof entry !== 'string')) throw new Error('Extension storage is invalid')
    return new Map(Object.entries(value as Record<string, string>))
  }
  const write = (file: string, data: string): void => {
    if (!lstatSync(dirname(file)).isDirectory()) throw new Error('Extension storage folder changed')
    // ponytail: hard kills can leave private unpublished .tmp files; add explicit-write cleanup if measured churn needs it.
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporary, 'wx', 0o600)
      try { writeFileSync(fd, data); fsyncSync(fd) } finally { closeSync(fd) }
      exists(file)
      renameSync(temporary, file)
    } finally { rmSync(temporary, { force: true }) }
  }
  const publicValues = (values: Map<string, string>): Map<string, string> => new Map([...values].filter(([key]) => key.length <= 128))
  const isLocalValue = (value: unknown): value is UserRaycastLocalStorageValue => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)
  const loadLocal = (): Map<string, UserRaycastLocalStorageValue> | undefined => {
    const value = read(localPath)
    if (value === undefined) return undefined
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('LocalStorage snapshot is invalid')
    const snapshot = value as { version?: unknown; values?: unknown }
    const entries = snapshot.values
    if (Object.keys(snapshot).sort().join(',') !== 'values,version' || snapshot.version !== 1 || !entries || typeof entries !== 'object' || Array.isArray(entries)
      || Object.keys(entries).length > 256 || Object.keys(entries).some(key => key.length > 128) || Object.values(entries).some(entry => !isLocalValue(entry))) throw new Error('LocalStorage snapshot is invalid')
    return new Map(Object.entries(entries as Record<string, UserRaycastLocalStorageValue>))
  }
  const localData = (values: Map<string, UserRaycastLocalStorageValue>): string => JSON.stringify({ version: 1, values: Object.fromEntries(values) }, (_key, value) => typeof value === 'number' && Object.is(value, -0) ? (JSON as JSON & { rawJSON(value: string): unknown }).rawJSON('-0') : value)
  const saveLocal = (values: Map<string, UserRaycastLocalStorageValue>): void => {
    const data = localData(values)
    // ponytail: 64 KiB/256 entries per file; the LocalStorage sidecar adds a separate bounded quota.
    if (Buffer.byteLength(data) > 65536 || values.size > 256) throw new Error('LocalStorage snapshot limit exceeded')
    write(localPath, data)
    const checked = loadLocal()
    if (!checked || localData(checked) !== data) throw new Error('LocalStorage snapshot changed')
  }
  const localValues = (): Map<string, UserRaycastLocalStorageValue> => loadLocal() ?? publicValues(load())
  const keyOf = (key: string): string => {
    if (typeof key !== 'string' || !key.length || key.length > 128) throw new Error('Invalid extension storage key')
    return key
  }
  const save = (values: Map<string, string>, namespace: string, previous: Map<string, string>, key?: string, value?: string, notify = true): void => {
    const data = JSON.stringify(Object.fromEntries(values))
    if (Buffer.byteLength(data) > 65536 || values.size > 256) throw new Error('Extension storage limit exceeded')
    // Cache and LocalStorage used to alias: preserve visible strings BEFORE a default Cache mutation.
    if (!namespace && loadLocal() === undefined) saveLocal(publicValues(previous))
    write(path, data)
    if (notify) for (const listener of [...(listeners.get(namespace) ?? [])]) listener(key, value)
  }
  const hash = (value: string): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const cache = (namespace = '') => {
    if (typeof namespace !== 'string' || namespace.length > 128) throw new Error('Invalid extension cache namespace')
    // Keep legacy default keys. Named keys are 135 characters, outside the public 128-character key space.
    const prefix = namespace ? `cache:${hash(namespace)}:` : ''
    const encoded = (key: string): string => prefix ? `${prefix}${hash(keyOf(key))}` : keyOf(key)
    const belongs = (key: string): boolean => prefix ? key.startsWith(prefix) && /^[a-f0-9]{64}$/.test(key.slice(prefix.length)) : key.length <= 128
    const get = (key: string): string | undefined => load().get(encoded(key))
    const has = (key: string): boolean => load().has(encoded(key))
    const set = (key: string, value: string): void => {
      const id = encoded(key)
      if (typeof value !== 'string' || Buffer.byteLength(value) > 4096) throw new Error('Invalid extension storage value')
      const previous = load(), data = new Map(previous); data.set(id, value); save(data, prefix, previous, key, value)
    }
    const remove = (key: string): boolean => { const id = encoded(key), previous = load(), data = new Map(previous); const removed = data.delete(id); save(data, prefix, previous, key); return removed }
    const clear = (options?: { notifySubscribers: boolean }): void => {
      if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options) || typeof options.notifySubscribers !== 'boolean')) throw new Error('Invalid extension Cache clear options')
      const previous = load(); save(new Map([...previous].filter(([key]) => !belongs(key))), prefix, previous, undefined, undefined, options?.notifySubscribers !== false)
    }
    const subscribe = (listener: Subscriber): (() => void) => {
      const current = listeners.get(prefix) ?? new Set<Subscriber>()
      current.add(listener); listeners.set(prefix, current)
      return () => { current.delete(listener); if (!current.size && listeners.get(prefix) === current) listeners.delete(prefix) }
    }
    return { get, has, get isEmpty(): boolean { return ![...load().keys()].some(belongs) }, set, remove, clear, subscribe }
  }
  const storage = cache()
  return {
    get: storage.get, has: storage.has, set: storage.set, remove: storage.remove, subscribe: storage.subscribe, cache,
    get isEmpty(): boolean { return storage.isEmpty },
    typed: true as const,
    allItems: async (): Promise<Record<string, UserRaycastLocalStorageValue>> => Object.fromEntries(localValues()),
    getItem: async (key: string): Promise<UserRaycastLocalStorageValue | undefined> => localValues().get(keyOf(key)),
    setItem: async (key: string, value: UserRaycastLocalStorageValue): Promise<void> => {
      keyOf(key)
      if (!isLocalValue(value) || typeof value === 'string' && Buffer.byteLength(value) > 4096) throw new Error('Invalid extension storage value')
      const data = localValues(); data.set(key, value); saveLocal(data)
    },
    removeItem: async (key: string): Promise<void> => { keyOf(key); const data = localValues(); data.delete(key); saveLocal(data) },
    clear: async (): Promise<void> => { localValues(); saveLocal(new Map()) },
  }
}
