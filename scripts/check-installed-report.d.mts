export function inspectInstalledReport(
  report: unknown,
  expected: Readonly<{ appId: string; platform: string; productName: string; version: string; commit?: string }>,
): Readonly<{ failures: readonly string[] }>

export function main(): Promise<void>
