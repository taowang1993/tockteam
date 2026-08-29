export function inspectExtraResources(asarPath: string): Promise<Readonly<{
  checkedEntries: number
  roots: readonly string[]
  vendorSourceShipped: boolean
}>>
