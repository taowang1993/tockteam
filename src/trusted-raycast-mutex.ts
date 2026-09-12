type TrustedRaycastOperation = <T>(operation: () => Promise<T> | T) => Promise<T>

/** Main-owned queue: one running operation and one bounded waiter. */
export function createTrustedRaycastMutex(): TrustedRaycastOperation {
  let pending: Promise<void> = Promise.resolve()
  let queued = 0
  return async <T>(operation: () => Promise<T> | T): Promise<T> => {
    if (queued >= 2) throw new Error('Trusted Raycast operation is busy')
    queued++
    let release!: () => void
    const turn = new Promise<void>(resolve => { release = resolve })
    const previous = pending
    pending = pending.then(() => turn)
    await previous
    try { return await operation() } finally { queued--; release() }
  }
}
