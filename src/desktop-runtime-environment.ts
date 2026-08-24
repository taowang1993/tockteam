import { join } from 'node:path'

export const DESKTOP_AUTHORITY_ENVIRONMENT_KEYS = [
  'DSH_DESKTOP_REVEAL_ENDPOINT',
  'DSH_DESKTOP_REVEAL_TOKEN',
  'DSH_DESKTOP_PICKER_ENDPOINT',
  'DSH_DESKTOP_PICKER_TOKEN',
  'DSH_DESKTOP_CALLER_ENDPOINT',
  'DSH_DESKTOP_CALLER_TOKEN',
  'DSH_DESKTOP_DISPATCH_ENDPOINT',
  'DSH_DESKTOP_DISPATCH_TOKEN',
  'DSH_DESKTOP_MICROPHONE_ENDPOINT',
  'DSH_DESKTOP_MICROPHONE_TOKEN',
  'DSH_DESKTOP_POPOUT_ENDPOINT',
  'DSH_DESKTOP_POPOUT_TOKEN',
  'DSH_DESKTOP_PRINT_EXPORT_ENDPOINT',
  'DSH_DESKTOP_PRINT_EXPORT_TOKEN',
] as const

const PREVIEW_INHERITED_ENVIRONMENT_KEYS = [
  'COMSPEC',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'PATHEXT',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'WINDIR',
] as const

/** Give preview Host code only non-secret process facts and sandbox-local user roots. */
export function previewRuntimeBaseEnvironment(
  source: NodeJS.ProcessEnv,
  home: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const key of PREVIEW_INHERITED_ENVIRONMENT_KEYS) {
    if (source[key] !== undefined) environment[key] = source[key]
  }
  environment.HOME = home
  environment.USERPROFILE = home
  environment.XDG_CACHE_HOME = join(home, '.cache')
  environment.XDG_CONFIG_HOME = join(home, '.config')
  return environment
}

/** Remove inherited native authority before adding channels owned by this process. */
export function scrubDesktopAuthorityEnvironment(
  environment: NodeJS.ProcessEnv,
  additionalKeys: readonly string[] = [],
): void {
  for (const key of [...DESKTOP_AUTHORITY_ENVIRONMENT_KEYS, ...additionalKeys]) delete environment[key]
}
