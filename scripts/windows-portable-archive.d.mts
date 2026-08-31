export const WINDOWS_PORTABLE_MARKER: '.tockteam-portable.json'
export const PORTABLE_MANIFEST_MAX_ENTRIES: 500000
export const PORTABLE_RUNTIME_LINK_MAX_ENTRIES: 100000

export type PortableRuntimeLink = Readonly<{
  path: string
  target: string
  kind: 'dir' | 'file'
}>

export function normalizePortableManifestPath(candidate: string): string
export function portablePathContained(rootPath: string, candidate: string): boolean
export function collectWindowsPortableRuntimeLinks(
  runtimeRoot: string,
  options?: Readonly<{ maxEntries?: number; packagedRuntimeRoot?: string }>,
): Promise<readonly PortableRuntimeLink[]>

export function writeWindowsPortableMarker(
  outputDir: string,
  metadata: Readonly<{ appId: string; productName: string; version: string }>,
  options?: Readonly<{ runtimeRoot?: string; packagedRuntimeRoot?: string }>,
): Promise<string>

export function writeWindowsPortableManifest(
  outputDir: string,
  manifestPath: string,
  options?: Readonly<{ maxEntries?: number }>,
): Promise<readonly string[]>

export function writeWindowsPortableArchiveMetadata(
  outputDir: string,
  metadata: Readonly<{ appId: string; productName: string; version: string }>,
  manifestPath: string,
  options?: Readonly<{ runtimeRoot?: string; packagedRuntimeRoot?: string; maxEntries?: number }>,
): Promise<Readonly<{ markerPath: string; entries: readonly string[] }>>

export function windowsPortableArchiveArgs(options: Readonly<{
  archive: string
  outputDir: string
  manifestPath: string
}>): readonly string[]
