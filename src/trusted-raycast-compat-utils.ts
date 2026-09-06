import React from 'react'
import { readFileSync, writeFileSync } from 'node:fs'
import { queryEpoch, queryText } from './trusted-raycast-compat-api.ts'

// Cached state persists across child restarts in the main-owned extension data file.
// ponytail: whole-file synchronous rewrite; per-key transactional store if state grows large.
const stateFile = process.env.TRUSTED_RAYCAST_STATE_FILE
const state = new Map<string, unknown>()
if (stateFile) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) state.set(key, value)
    }
  } catch { /* first run or unreadable state: start from initial values */ }
}
const persist = (): void => {
  if (!stateFile) return
  try { writeFileSync(stateFile, JSON.stringify(Object.fromEntries(state)), { mode: 0o600 }) } catch { /* storage failure must not crash the command */ }
}
export function useCachedState<T>(key: string, initial: T): readonly [T, (next: T | ((old: T) => T)) => void] {
  const [value, setValue] = React.useState<T>(() => (state.has(key) ? state.get(key) as T : initial))
  const update = (next: T | ((old: T) => T)) => setValue(old => { const value = typeof next === 'function' ? (next as (old: T) => T)(old) : next; state.set(key, value); persist(); return value })
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
