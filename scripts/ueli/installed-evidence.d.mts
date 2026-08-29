export const REQUIRED_INSTALLED_EVIDENCE_ROWS: readonly string[]

export function inspectInstalledEvidenceCatalog(catalog: unknown): Readonly<{
  failures: readonly string[]
  summary: Readonly<{ rows: number; platforms: readonly string[]; verified: number }>
}>

export function inspectInstalledEvidenceWorkflow(workflow: string): Readonly<{
  failures: readonly string[]
}>

export function inspectInstalledEvidenceDocs(input: Readonly<{
  architecture: string
  usage: string
}>): Readonly<{ failures: readonly string[] }>
