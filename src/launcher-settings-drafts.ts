import { useCallback, useEffect, useRef, useState } from 'react'

export type LauncherDraftUpdate<T> = T | ((current: T) => T)

/** Keep an active edit stable while adopting clean values from a newer main snapshot. */
export function useLauncherDraft<T>(value: T, equals: (left: T, right: T) => boolean = Object.is): readonly [T, (next: LauncherDraftUpdate<T>) => void] {
  const equalsRef = useRef(equals)
  equalsRef.current = equals
  const draftRef = useRef(value)
  const dirtyRef = useRef(false)
  const [draft, setDraftState] = useState(value)

  useEffect(() => {
    if (dirtyRef.current && !equalsRef.current(draftRef.current, value)) return
    draftRef.current = value
    dirtyRef.current = false
    setDraftState(value)
  }, [value])

  const setDraft = useCallback((next: LauncherDraftUpdate<T>): void => {
    setDraftState(current => {
      const resolved = typeof next === 'function'
        ? (next as (current: T) => T)(current)
        : next
      draftRef.current = resolved
      dirtyRef.current = true
      return resolved
    })
  }, [])

  return [draft, setDraft]
}
