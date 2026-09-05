export {
  PORTABLE_MANIFEST_MAX_ENTRIES,
  WINDOWS_PORTABLE_MARKER,
  normalizePortableManifestPath,
  writeWindowsPortableArchiveMetadata,
  windowsPortableArchiveArgs,
} from './windows-portable-archive.mjs'

export function assertPackageParity(expected: Record<string, any>, actual: Record<string, any>): void

export function macApplicationLaunchArgs(appPath: string, args: readonly string[]): readonly string[]

export function macMainProcessPids(output: string, executable: string): readonly number[]

export function runProcess(
  command: string,
  args: readonly string[],
  options?: Readonly<{ disposableRoot?: string; timeoutMs?: number; [key: string]: unknown }>,
): Promise<{ stdout: string; stderr: string }>

export function recoverDebTransition(options: Readonly<{
  candidate: string
  prior: string
  install: (artifact: string) => void | Promise<void>
  validateCandidate: () => void | Promise<void>
  validateRecovery: () => void | Promise<void>
}>): Promise<unknown>

export function withInstalledSession<T>(
  session: unknown,
  operation: (session: unknown) => T | Promise<T>,
  cleanup: (session: unknown) => void | Promise<void>,
): Promise<T>

export function writeInstalledSmokeDiagnostics(
  path: string,
  options: Readonly<{
    platform: string
    version: string
    sourceCommit?: string | null
    error: unknown
  }>,
): Promise<string>

export function installerBuildPlan(
  target: Readonly<{ key: string }>,
  formats: readonly string[],
  baseConfig: Record<string, unknown>,
): Readonly<{
  formats: readonly string[]
  config: Record<string, any>
}>

export function windowsPortableArchiveArgs(options: Readonly<{
  archive: string
  outputDir: string
  manifestPath: string
}>): readonly string[]
