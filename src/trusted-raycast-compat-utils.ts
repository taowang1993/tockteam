import React from 'react'
import { queryEpoch, queryText } from './trusted-raycast-compat-api.ts'

const state = new Map<string, unknown>()
export function useCachedState<T>(key: string, initial: T): readonly [T, (next: T | ((old: T) => T)) => void] {
  const [value, setValue] = React.useState<T>(() => (state.has(key) ? state.get(key) as T : initial))
  const update = (next: T | ((old: T) => T)) => setValue(old => { const value = typeof next === 'function' ? (next as (old: T) => T)(old) : next; state.set(key, value); return value })
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
