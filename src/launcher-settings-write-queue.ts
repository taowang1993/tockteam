export interface LauncherSettingsWriteQueueOptions {
  getOwnershipToken: () => string | undefined
  updateSetting: (key: string, value: unknown) => Promise<void>
  reload: () => Promise<unknown>
  clearPendingValue: (key: string, value: unknown, onlyIfCurrent: boolean) => void
}

export interface LauncherSettingsWriteQueue {
  enqueue(key: string, value: unknown): Promise<boolean>
  waitForIdle(): Promise<void>
}

const SIMPLE_FILE_SEARCH_FOLDERS_KEY = 'extension[SimpleFileSearch].folders'

/** Serialize settings writes and fence folder edits after an ownership transition. */
export function createLauncherSettingsWriteQueue(options: LauncherSettingsWriteQueueOptions): LauncherSettingsWriteQueue {
  let tail: Promise<void> = Promise.resolve()
  let folderGeneration = 0
  const enqueue = (key: string, value: unknown): Promise<boolean> => {
    const isFolderWrite = key === SIMPLE_FILE_SEARCH_FOLDERS_KEY
    const ownershipAtEnqueue = options.getOwnershipToken()
    const generationAtEnqueue = folderGeneration
    const operation = tail.catch(() => undefined).then(async () => {
      if (isFolderWrite && (generationAtEnqueue !== folderGeneration || ownershipAtEnqueue !== options.getOwnershipToken())) {
        options.clearPendingValue(key, value, true)
        return false
      }
      try {
        await options.updateSetting(key, value)
      } catch (reason) {
        if (isFolderWrite) {
          options.clearPendingValue(key, value, false)
          let reloadFailed = false
          try { await options.reload() } catch { reloadFailed = true }
          if (reloadFailed || ownershipAtEnqueue !== options.getOwnershipToken()) folderGeneration += 1
        }
        throw reason
      }
      await options.reload()
      return true
    })
    tail = operation.then(() => undefined, () => undefined)
    return operation
  }
  return Object.freeze({ enqueue, waitForIdle: () => tail })
}
