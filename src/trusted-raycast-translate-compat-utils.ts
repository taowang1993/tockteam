import React from 'react'
import { createCachedStateStore } from './trusted-raycast-cached-state.ts'
import { queryEpoch, queryText } from './trusted-raycast-compat-api.ts'
import { loadTranslateState, isTranslateState, saveTranslateState } from './trusted-raycast-translate-state.ts'
// @ts-expect-error Build-time alias resolves to the exact reviewed Translate language catalog.
import { supportedLanguagesByCode } from '@tockteam/trusted-raycast-translate-catalog'

const stateFile = process.env.TRUSTED_RAYCAST_STATE_FILE
const initialState = stateFile === undefined ? {} : loadTranslateState(stateFile, supportedLanguagesByCode)
const cachedState = createCachedStateStore({
  initial: initialState,
  validate: snapshot => isTranslateState(snapshot, supportedLanguagesByCode),
  ...(stateFile === undefined ? {} : { persist: async (snapshot: Readonly<Record<string, unknown>>) => await saveTranslateState(stateFile, snapshot, supportedLanguagesByCode) }),
})

export function useCachedState<T>(key: string, initial: T): readonly [T, (next: T | ((old: T) => T)) => void] {
  const subscribe = React.useCallback((listener: () => void) => cachedState.subscribe(key, listener), [key])
  const snapshot = React.useCallback(() => cachedState.get(key, initial), [key])
  const value = React.useSyncExternalStore(subscribe, snapshot, snapshot)
  return [value, React.useCallback(next => {
    if (!cachedState.update(key, next)) throw new Error('Translate cached state update was rejected')
  }, [key])] as const
}

// Keep this hook local: importing generic compatibility would eagerly read its unbounded shared state file.
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
