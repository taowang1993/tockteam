interface DshSourceSpecBase {
  readonly version: string
  readonly packageManager: `pnpm@${string}`
  readonly pnpmIntegrity: `sha512-${string}`
}

export interface GitDshSourceSpec extends DshSourceSpecBase {
  readonly source: 'git'
  readonly repository: string
  readonly ref: string
  readonly revision: string
}

export interface NpmDshSourceSpec extends DshSourceSpecBase {
  readonly source: 'npm'
  readonly package: '@deepseek-ai/dsh'
  readonly integrity: `sha512-${string}`
  readonly tarball: string
}

export type DshSourceSpec = GitDshSourceSpec | NpmDshSourceSpec

export interface ResolvedDshSource {
  readonly kind: 'npm' | 'source'
  readonly path: string
}

export const DSH_SOURCE_SPEC: DshSourceSpec

export function parseDshSourceSpec(value: unknown): DshSourceSpec

export function verifySha512(path: string, integrity: string): void

export function resolvePinnedPnpm(): {
  readonly binDir: string
  readonly cliEntry: string
}

export function resolveDshSource(): ResolvedDshSource
