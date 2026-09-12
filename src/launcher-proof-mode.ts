export const LAUNCHER_INSTALLED_FIRST_USE_FLAG = '--tockteam-launcher-installed-first-use-smoke'

export type LauncherProofModeOptions = Readonly<{
  isPackaged: boolean
  argv: readonly string[]
  packagedSmokeEnabled: boolean
  inactiveRequested: boolean
  denyEffectsRequested: boolean
  ipcConnected: boolean
  nonce: string | undefined
}>

export type LauncherProofMode = Readonly<{ installedFirstUse: boolean; inactive: boolean }>

const validNonce = (value: string | undefined): boolean => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value)

export function resolveLauncherProofMode(options: LauncherProofModeOptions): LauncherProofMode {
  const installedFirstUse = options.argv.includes(LAUNCHER_INSTALLED_FIRST_USE_FLAG)
  if (!installedFirstUse) return Object.freeze({ installedFirstUse: false, inactive: options.inactiveRequested && !options.isPackaged })
  if (!options.isPackaged || !options.packagedSmokeEnabled || !options.inactiveRequested || !options.denyEffectsRequested || !options.ipcConnected || !validNonce(options.nonce)) {
    throw new Error('installed first-use proof requires packaged smoke, inactive mode, denied effects, authenticated IPC, and a valid nonce')
  }
  return Object.freeze({ installedFirstUse: true, inactive: true })
}
