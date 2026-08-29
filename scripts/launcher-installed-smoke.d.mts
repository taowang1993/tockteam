export {
  PORTABLE_MANIFEST_MAX_ENTRIES,
  WINDOWS_PORTABLE_MARKER,
  normalizePortableManifestPath,
  writeWindowsPortableManifest,
  writeWindowsPortableMarker,
  windowsPortableArchiveArgs,
} from './windows-portable-archive.mjs'

export function assertPackageParity(expected: Record<string, any>, actual: Record<string, any>): void

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
