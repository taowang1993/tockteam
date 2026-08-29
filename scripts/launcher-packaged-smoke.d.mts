export function withSmokeEnvironment<T>(operation: () => T | Promise<T>): Promise<T>

export function inspectExtraResources(asarPath: string): Promise<Readonly<{
  checkedEntries: number
  roots: readonly string[]
  vendorSourceShipped: boolean
}>>
