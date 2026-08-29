export function inspectInstalledReport(
  report: unknown,
  expected: Readonly<{ platform: string; version: string }>,
): Readonly<{ failures: readonly string[] }>

export function main(): Promise<void>
