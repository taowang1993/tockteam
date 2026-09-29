import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

/** First-party managed API storage, not a filesystem sandbox for approved code. */
export function createUserRaycastStorage(path: string) {
  if (!isAbsolute(path) || !lstatSync(dirname(path)).isDirectory()) throw new Error('Invalid extension storage path')
  const listeners = new Set<() => void>()
  const load = (): Map<string, string> => {
    if (!existsSync(path)) return new Map()
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.size > 65536) throw new Error('Extension storage is invalid or oversized')
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 256 || Object.values(value).some(entry => typeof entry !== 'string')) throw new Error('Extension storage is invalid')
    return new Map(Object.entries(value as Record<string, string>))
  }
  const save = (values: Map<string, string>): void => {
    // ponytail: 64 KiB per extension; increase only if a measured command needs more history.
    const data = JSON.stringify(Object.fromEntries(values))
    if (Buffer.byteLength(data) > 65536 || values.size > 256) throw new Error('Extension storage limit exceeded')
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporary, 'wx', 0o600)
      try { writeFileSync(fd, data); fsyncSync(fd) } finally { closeSync(fd) }
      if (existsSync(path) && !lstatSync(path).isFile()) throw new Error('Extension storage changed')
      renameSync(temporary, path)
      for (const listener of listeners) listener()
    } finally { rmSync(temporary, { force: true }) }
  }
  const checked = (key: string): void => { if (typeof key !== 'string' || !key.length || key.length > 128) throw new Error('Invalid extension storage key') }
  const get = (key: string): string | undefined => { checked(key); return load().get(key) }
  const set = (key: string, value: string): void => { checked(key); if (typeof value !== 'string' || Buffer.byteLength(value) > 4096) throw new Error('Invalid extension storage value'); const data = load(); data.set(key, value); save(data) }
  const remove = (key: string): void => { checked(key); const data = load(); data.delete(key); save(data) }
  return {
    get, set, remove,
    subscribe: (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getItem: async (key: string): Promise<string | undefined> => get(key),
    setItem: async (key: string, value: string): Promise<void> => { set(key, value) },
    removeItem: async (key: string): Promise<void> => { remove(key) },
    clear: async (): Promise<void> => { save(new Map()) },
  }
}
