export declare const CATALOG_NAMES: readonly string[]

export declare function compareCatalog(
  name: string,
  expected: readonly Record<string, unknown>[],
  actual: readonly Record<string, unknown>[],
): void

export declare function auditParityCatalogs(options?: {
  repoRoot?: string
  sourceOverrides?: Record<string, string>
}): Promise<{
  counts: Record<string, number>
  unclassified: string[]
}>
