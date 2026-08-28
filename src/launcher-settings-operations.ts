export interface LauncherSettingsOperationOptions {
  readonly blockMutationsAfterSuccess?: boolean
  readonly mutation?: boolean
}

export interface LauncherSettingsOperations {
  close(): Promise<void>
  reopenMutations(): void
  run<T>(operation: () => Promise<T>, options?: LauncherSettingsOperationOptions): Promise<T>
}

export function createLauncherSettingsOperations(options: Readonly<{
  isUnavailable: () => boolean
}>): LauncherSettingsOperations {
  let closed = false
  let mutationsBlocked = false
  let tail: Promise<void> = Promise.resolve()

  const run = <T>(
    operation: () => Promise<T>,
    operationOptions: LauncherSettingsOperationOptions = {},
  ): Promise<T> => {
    if (closed || options.isUnavailable()) return Promise.reject(new Error('TockLauncher settings operations are closed'))
    const active = tail.then(async () => {
      if (operationOptions.mutation && mutationsBlocked) throw new Error('TockLauncher settings mutations are closed')
      const result = await operation()
      const canceled = typeof result === 'object' && result !== null && 'canceled' in result && result.canceled === true
      if (operationOptions.blockMutationsAfterSuccess && !canceled) mutationsBlocked = true
      return result
    })
    tail = active.then(() => undefined, () => undefined)
    return active
  }

  const close = async (): Promise<void> => {
    closed = true
    await tail
  }

  const reopenMutations = (): void => {
    if (closed) return
    mutationsBlocked = false
  }

  return Object.freeze({ close, reopenMutations, run })
}
