import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'

/** First-party managed API storage, not a filesystem sandbox for approved code. */
export function createUserRaycastStorage(path: string) {
  if (!isAbsolute(path) || !lstatSync(dirname(path)).isDirectory()) throw new Error('Invalid extension storage path')
  const listeners = new Map<string, Set<() => void>>()
  const load = (): Map<string, string> => {
    if (!existsSync(path)) return new Map()
    let raw: string
    try { raw = readBoundedRegularFile(path, 65536) }
    catch { throw new Error('Extension storage is invalid or oversized') }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 256 || Object.values(value).some(entry => typeof entry !== 'string')) throw new Error('Extension storage is invalid')
    return new Map(Object.entries(value as Record<string, string>))
  }
  const save = (values: Map<string, string>, namespace: string): void => {
    // ponytail: 64 KiB per extension; increase only if a measured command needs more history.
    const data = JSON.stringify(Object.fromEntries(values))
    if (Buffer.byteLength(data) > 65536 || values.size > 256) throw new Error('Extension storage limit exceeded')
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporary, 'wx', 0o600)
      try { writeFileSync(fd, data); fsyncSync(fd) } finally { closeSync(fd) }
      if (existsSync(path) && !lstatSync(path).isFile()) throw new Error('Extension storage changed')
      renameSync(temporary, path)
      for (const listener of [...(listeners.get(namespace) ?? [])]) listener()
    } finally { rmSync(temporary, { force: true }) }
  }
  const hash = (value: string): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const cache = (namespace = '') => {
    if (typeof namespace !== 'string' || namespace.length > 128) throw new Error('Invalid extension cache namespace')
    // Keep legacy default keys. Named keys are 135 characters, outside the public 128-character key space.
    const prefix = namespace ? `cache:${hash(namespace)}:` : ''
    const encoded = (key: string): string => {
      if (typeof key !== 'string' || !key.length || key.length > 128) throw new Error('Invalid extension storage key')
      return prefix ? `${prefix}${hash(key)}` : key
    }
    const belongs = (key: string): boolean => prefix ? key.startsWith(prefix) : key.length <= 128
    const get = (key: string): string | undefined => load().get(encoded(key))
    const set = (key: string, value: string): void => {
      const id = encoded(key)
      if (typeof value !== 'string' || Buffer.byteLength(value) > 4096) throw new Error('Invalid extension storage value')
      const data = load(); data.set(id, value); save(data, prefix)
    }
    const remove = (key: string): void => { const id = encoded(key); const data = load(); data.delete(id); save(data, prefix) }
    const clear = (): void => { save(new Map([...load()].filter(([key]) => !belongs(key))), prefix) }
    const subscribe = (listener: () => void): (() => void) => {
      const current = listeners.get(prefix) ?? new Set<() => void>()
      current.add(listener); listeners.set(prefix, current)
      return () => { current.delete(listener); if (!current.size) listeners.delete(prefix) }
    }
    return { get, set, remove, clear, subscribe }
  }
  const storage = cache()
  return {
    ...storage, cache,
    allItems: async (): Promise<Record<string, string>> => Object.fromEntries([...load()].filter(([key]) => key.length <= 128)),
    getItem: async (key: string): Promise<string | undefined> => storage.get(key),
    setItem: async (key: string, value: string): Promise<void> => { storage.set(key, value) },
    removeItem: async (key: string): Promise<void> => { storage.remove(key) },
    clear: async (): Promise<void> => { storage.clear() },
  }
}
