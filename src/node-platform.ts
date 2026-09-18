/** Map a Node host platform to the names used by Node.js distributions. */
export function nodeDistributionPlatform(
  platform: string = process.platform,
): string {
  return platform === 'win32' ? 'win' : platform
}

/** Refuse macOS packages whose staged native runtime cannot match the target. */
export function resolveMacPackageArchitecture(
  requested: string | undefined,
  architecture: string = process.arch,
): 'arm64' | 'x64' {
  const target = requested ?? architecture
  if (target !== 'arm64' && target !== 'x64') {
    throw new Error(`unsupported macOS architecture: ${target}`)
  }
  if (architecture !== target) {
    throw new Error(`macOS ${target} packaging requires an ${target} host`)
  }
  return target
}

/** Resolve the supported target architecture used in release paths. */
export function resolveNodeDistributionArchitecture(
  environment: NodeJS.ProcessEnv = process.env,
  architecture: string = process.arch,
): 'arm64' | 'x64' {
  const value = environment.DSH_DESKTOP_NODE_ARCH ?? architecture
  if (value !== 'arm64' && value !== 'x64') {
    throw new Error(`unsupported Node distribution architecture: ${value}`)
  }
  return value
}

/** Resolve the requested Node distribution platform for packaging. */
export function resolveNodeDistributionPlatform(
  environment: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): 'darwin' | 'linux' | 'win' {
  const value = environment.DSH_DESKTOP_NODE_PLATFORM ?? nodeDistributionPlatform(platform)
  if (value !== 'darwin' && value !== 'linux' && value !== 'win') {
    throw new Error(`unsupported Node distribution platform: ${value}`)
  }
  return value
}
