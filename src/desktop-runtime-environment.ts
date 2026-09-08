export const WEB_CLIP_FIXTURE_ENVIRONMENT_KEY = 'TOCKTEAM_WEB_CLIP_FIXTURE_URL'

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

export interface WebClipFixtureEnvironmentOptions {
  appIsPackaged: boolean
  fixtureUrl: string | undefined
  preview: boolean
}

/** Forward the test fixture only to the ordinary unpackaged Desktop runtime. */
export function applyWebClipFixtureEnvironment(
  environment: NodeJS.ProcessEnv,
  options: WebClipFixtureEnvironmentOptions,
): void {
  delete environment[WEB_CLIP_FIXTURE_ENVIRONMENT_KEY]
  if (!options.appIsPackaged && !options.preview && options.fixtureUrl !== undefined) {
    environment[WEB_CLIP_FIXTURE_ENVIRONMENT_KEY] = options.fixtureUrl
  }
}

/** Remove inherited native authority before adding channels owned by this process. */
export function scrubDesktopAuthorityEnvironment(
  environment: NodeJS.ProcessEnv,
  additionalKeys: readonly string[] = [],
): void {
  for (const key of [...DESKTOP_AUTHORITY_ENVIRONMENT_KEYS, ...additionalKeys]) delete environment[key]
}
