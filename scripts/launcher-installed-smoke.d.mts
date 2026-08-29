export const PORTABLE_MANIFEST_MAX_ENTRIES: 500000

export function normalizePortableManifestPath(candidate: string): string

export function writeWindowsPortableManifest(
  outputDir: string,
  manifestPath: string,
  options?: Readonly<{ maxEntries?: number }>,
): Promise<readonly string[]>

export function installerBuildPlan(
  target: Readonly<{ key: string }>,
  formats: readonly string[],
  baseConfig: Record<string, unknown>,
): Readonly<{
  formats: readonly string[]
  config: Record<string, any>
}>

export function windowsPortableArchiveArgs(options: Readonly<{
  archive: string
  outputDir: string
  manifestPath: string
}>): readonly string[]
