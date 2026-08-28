import type { LauncherActionOwner, LauncherActionStore } from './launcher-actions.ts'

export type LauncherProviderInvalidation = Readonly<{
  invalidate: (reason: string, preserveSignal?: AbortSignal) => void
}>

type LauncherProviderInvalidatorOptions = Readonly<{
  actions: Pick<LauncherActionStore, 'clear' | 'clearOwner'>
  discovery?: LauncherProviderInvalidation
  fileSearch?: LauncherProviderInvalidation
  local?: LauncherProviderInvalidation
  network?: LauncherProviderInvalidation
  os?: LauncherProviderInvalidation
  core?: LauncherProviderInvalidation
}>

export function createLauncherProviderInvalidator(options: LauncherProviderInvalidatorOptions): Readonly<{
  invalidateAllLauncherProviders: (reason: string, owner?: LauncherActionOwner, preserveSignal?: AbortSignal) => void
}> {
  const invalidateAllLauncherProviders = (reason: string, owner?: LauncherActionOwner, preserveSignal?: AbortSignal): void => {
    options.discovery?.invalidate(reason, preserveSignal)
    options.fileSearch?.invalidate(reason, preserveSignal)
    options.network?.invalidate(reason, preserveSignal)
    options.os?.invalidate(reason, preserveSignal)
    options.local?.invalidate(reason, preserveSignal)
    options.core?.invalidate(reason, preserveSignal)
    if (owner === undefined) options.actions.clear()
    else options.actions.clearOwner(owner)
  }
  return Object.freeze({ invalidateAllLauncherProviders })
}
