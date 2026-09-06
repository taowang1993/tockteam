import React from 'react'

const state = new Map<string, unknown>()
export function useCachedState<T>(key: string, initial: T): readonly [T, (next: T | ((old: T) => T)) => void] {
  const [value, setValue] = React.useState<T>(() => (state.has(key) ? state.get(key) as T : initial))
  const update = (next: T | ((old: T) => T)) => setValue(old => { const value = typeof next === 'function' ? (next as (old: T) => T)(old) : next; state.set(key, value); return value })
  return [value, update] as const
}
export function usePromise<T>(promise: (...args: any[]) => Promise<T>, args: readonly unknown[] = [], options?: { onError?: (error: unknown) => void }): { data: T | undefined; isLoading: boolean } {
  const [state, setState] = React.useState<{ data?: T; loading: boolean }>({ loading: true })
  const revision = React.useRef(0)
  const stableArgs = JSON.stringify(args)
  React.useEffect(() => {
    const current = ++revision.current
    setState({ loading: true })
    Promise.resolve().then(() => promise(...args)).then(data => { if (current === revision.current) setState({ data, loading: false }) }).catch(error => { if (current === revision.current) { options?.onError?.(error); setState({ loading: false }) } })
    return () => { revision.current++ }
  }, [stableArgs])
  return { data: state.data, isLoading: state.loading }
}
