export type CachedStateUpdater<T> = T | ((old: T) => T)

type CachedStateOptions = Readonly<{
  initial?: Readonly<Record<string, unknown>>
  persist?: (snapshot: Readonly<Record<string, unknown>>) => Promise<void> | void
  validate?: (snapshot: Readonly<Record<string, unknown>>) => boolean
}>

const immutable = <T>(value: T): T => {
  const clone = structuredClone(value)
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== 'object' || Object.isFrozen(entry)) return
    Object.freeze(entry)
    for (const value of Object.values(entry)) freeze(value)
  }
  freeze(clone)
  return clone
}

export function createCachedStateStore(options: CachedStateOptions = {}) {
  const values = new Map(Object.entries(options.initial ?? {}).map(([key, value]) => [key, immutable(value)]))
  const listeners = new Map<string, Set<() => void>>()
  let writes = Promise.resolve()
  const capture = (): Readonly<Record<string, unknown>> => immutable(Object.fromEntries(values))
  return Object.freeze({
    get<T>(key: string, initial: T): T {
      if (!values.has(key)) values.set(key, immutable(initial))
      return values.get(key) as T
    },
    subscribe(key: string, listener: () => void): () => void {
      const current = listeners.get(key) ?? new Set<() => void>()
      current.add(listener); listeners.set(key, current)
      return () => { current.delete(listener); if (current.size === 0) listeners.delete(key) }
    },
    update<T>(key: string, updater: CachedStateUpdater<T>): boolean {
      const old = values.get(key) as T
      // The reviewed Kaomoji source splices updater input; only its defensive clone is mutable.
      const next = typeof updater === 'function' ? (updater as (old: T) => T)(structuredClone(old)) : updater
      const committed = immutable(next)
      const candidate = Object.fromEntries(values); candidate[key] = committed
      if (options.validate && !options.validate(candidate)) return false
      values.set(key, committed)
      if (options.persist) {
        const snapshot = capture()
        writes = writes.then(() => options.persist!(snapshot)).catch(() => undefined)
      }
      // Snapshot before notifying: React subscriptions can replace themselves during render.
      for (const listener of [...(listeners.get(key) ?? [])]) listener()
      return true
    },
    flush(): Promise<void> { return writes },
  })
}
