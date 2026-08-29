export function normalizePortableManifestPath(candidate: string): string

export function writeWindowsPortableManifest(outputDir: string, manifestPath: string): Promise<readonly string[]>

export function windowsPortableArchiveArgs(options: Readonly<{
  archive: string
  outputDir: string
  manifestPath: string
}>): readonly string[]
