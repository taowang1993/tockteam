import { createContext, useContext, useId, useLayoutEffect } from 'react'

export function createLauncherDraftTracker() {
  const dirty = new Set<string>()
  return Object.freeze({
    set: (id: string, changed: boolean): void => { if (changed) dirty.add(id); else dirty.delete(id) },
    hasChanges: (): boolean => dirty.size > 0,
    clear: (): void => { dirty.clear() },
  })
}
export const LauncherDraftContext = createContext<ReturnType<typeof createLauncherDraftTracker> | null>(null)
export function useLauncherDirtyState(changed: boolean): void {
  const tracker = useContext(LauncherDraftContext)
  const id = useId()
  useLayoutEffect(() => { tracker?.set(id, changed); return () => tracker?.set(id, false) }, [tracker, id, changed])
}
