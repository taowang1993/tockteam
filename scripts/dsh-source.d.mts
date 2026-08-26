export interface DshSourceSpec {
  readonly repository: string
  readonly ref: string
  readonly revision: string
  readonly version: string
  readonly pnpmIntegrity: string
}

export const DSH_SOURCE_SPEC: DshSourceSpec

export function verifySha512(path: string, integrity: string): void

export function resolveDshSource(): string
