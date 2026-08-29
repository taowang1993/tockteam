export const WINDOWS_PORTABLE_MARKER: '.tockteam-portable.json'
export const PORTABLE_MANIFEST_MAX_ENTRIES: 500000

export function normalizePortableManifestPath(candidate: string): string

export function writeWindowsPortableMarker(
  outputDir: string,
  metadata: Readonly<{ appId: string; productName: string; version: string }>,
): Promise<string>

export function writeWindowsPortableManifest(
  outputDir: string,
  manifestPath: string,
  options?: Readonly<{ maxEntries?: number }>,
): Promise<readonly string[]>

export function windowsPortableArchiveArgs(options: Readonly<{
  archive: string
  outputDir: string
  manifestPath: string
}>): readonly string[]
