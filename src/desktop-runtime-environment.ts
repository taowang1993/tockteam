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

/** Remove inherited native authority before adding channels owned by this process. */
export function scrubDesktopAuthorityEnvironment(
  environment: NodeJS.ProcessEnv,
  additionalKeys: readonly string[] = [],
): void {
  for (const key of [...DESKTOP_AUTHORITY_ENVIRONMENT_KEYS, ...additionalKeys]) delete environment[key]
}
