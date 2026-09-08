import React from 'react'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { queryEpoch, queryText } from './trusted-raycast-compat-api.ts'
import { isKaomojiState, loadKaomojiState, saveKaomojiState, type KaomojiRecord } from './trusted-raycast-kaomoji-state.ts'

// Cached state persists across child restarts in the main-owned extension data file.
// ponytail: whole-file synchronous rewrite; per-key transactional store if state grows large.
const stateFile = process.env.TRUSTED_RAYCAST_STATE_FILE
const extensionId = process.env.TRUSTED_RAYCAST_EXTENSION_ID
const kaomojiDataset: ReadonlyMap<string, KaomojiRecord> | undefined = extensionId === 'kaomoji-search' ? (() => {
  const loaded = createRequire(import.meta.url)('asciilib') as { lib?: Record<string, { category?: unknown; entry?: unknown; name?: unknown }> }
  const dataset = new Map<string, KaomojiRecord>()
  for (const entry of Object.values(loaded.lib ?? {})) {
    if (typeof entry.entry !== 'string' || typeof entry.name !== 'string' || typeof entry.category !== 'string') throw new Error('Invalid reviewed Kaomoji dataset')
    const record = Object.freeze({ id: `${entry.entry}-${entry.name}`, name: entry.entry, description: entry.name, category: entry.category })
    if (dataset.has(record.id)) throw new Error('Duplicate reviewed Kaomoji dataset identity')
    dataset.set(record.id, record)
  }
  if (dataset.size !== 1822) throw new Error('Reviewed Kaomoji dataset cardinality mismatch')
  return dataset
})() : undefined
const state = new Map<string, unknown>()
if (stateFile) {
  try {
    const parsed: unknown = kaomojiDataset === undefined ? JSON.parse(readFileSync(stateFile, 'utf8')) : loadKaomojiState(stateFile, kaomojiDataset)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && (kaomojiDataset === undefined || isKaomojiState(parsed, kaomojiDataset))) {
      for (const [key, value] of Object.entries(parsed)) state.set(key, value)
    }
  } catch { /* first run or unreadable state: start from initial values */ }
}
let kaomojiWrite = Promise.resolve()
const persist = (): void => {
  if (!stateFile) return
  const snapshot = Object.fromEntries(state)
  if (kaomojiDataset !== undefined) {
    if (!isKaomojiState(snapshot, kaomojiDataset)) return
    kaomojiWrite = kaomojiWrite.then(() => saveKaomojiState(stateFile, snapshot, kaomojiDataset)).catch(() => undefined)
  } else {
    try { writeFileSync(stateFile, JSON.stringify(snapshot), { mode: 0o600 }) } catch { /* storage failure must not crash the command */ }
  }
}
export function useCachedState<T>(key: string, initial: T): readonly [T, (next: T | ((old: T) => T)) => void] {
  if (!state.has(key)) state.set(key, initial)
  const [value, setValue] = React.useState<T>(() => state.get(key) as T)
  const update = (next: T | ((old: T) => T)) => setValue(old => {
    const value = typeof next === 'function' ? (next as (old: T) => T)(old) : next
    const snapshot = Object.fromEntries(state); snapshot[key] = value
    if (kaomojiDataset !== undefined && !isKaomojiState(snapshot, kaomojiDataset)) return old
    state.set(key, value); persist(); return value
  })
  return [value, update] as const
}
export function usePromise<T>(promise: (...args: any[]) => Promise<T>, args: readonly unknown[] = [], options?: { onError?: (error: unknown) => void }): { data: T | undefined; isLoading: boolean } {
  const [state, setState] = React.useState<{ data?: T; loading: boolean; args?: string; epoch?: number }>({ loading: true })
  const revision = React.useRef(0)
  const stableArgs = JSON.stringify(args)
  React.useEffect(() => {
    const current = ++revision.current
    const epoch = queryEpoch
    // Both admitted translate.tsx calls receive the debounced query as their first argument.
    if (args[0] !== queryText) return
    setState({ loading: true, args: stableArgs, epoch })
    Promise.resolve().then(() => promise(...args)).then(data => { if (current === revision.current && epoch === queryEpoch) setState({ data, loading: false, args: stableArgs, epoch }) }).catch(error => {
      if (current !== revision.current || epoch !== queryEpoch) return
      setState({ loading: false, args: stableArgs, epoch })
      options?.onError?.(error)
    })
    return () => { revision.current++ }
  }, [stableArgs, queryEpoch])
  const stale = state.args !== stableArgs || state.epoch !== queryEpoch
  return { data: stale ? undefined : state.data, isLoading: stale || state.loading }
}
