export const PACKAGED_PREPARATION_PLAN: readonly Readonly<{
  name: string
  args: readonly string[]
}>[]

export function parseWindowsGitPaths(output: string): readonly string[]

export function selectWindowsGitPath(options?: Readonly<{
  whereOutput?: string
  fallbackPaths?: readonly string[]
  isFile?: (candidate: string) => boolean
}>): string | undefined

export function trustedPathEntries(options?: Readonly<{
  platform?: NodeJS.Platform
  nodeDirectory?: string
  repositoryRoot?: string
  systemRoot?: string
  gitExecutable?: string
}>): readonly string[]

export function currentTarget(): unknown

export function packagedBuilderConfig(outputDir: string, target: unknown, appDir: string): Record<string, unknown>

export function canonicalPath(candidatePath: string): Promise<string | undefined>

export function pathContained(rootPath: string, candidatePath: string): Promise<boolean>

export function withSmokeEnvironment<T>(operation: () => T | Promise<T>, disposableRoot?: string): Promise<T>

export function smokeEnvironment(overrides?: NodeJS.ProcessEnv, disposableRoot?: string): NodeJS.ProcessEnv

export function prepareSmokeEnvironmentRoots(disposableRoot: string): Promise<readonly string[]>

export function freePort(): Promise<number>

export function selectCdpDescriptor<T extends Readonly<{ title?: string; webSocketDebuggerUrl?: string }>>(
  pages: readonly T[],
  title: string,
  port: number,
): T | undefined

export function windowsCdpListenerOwned(output: string, pid: number, port: number): boolean

export function inspectExtraResources(asarPath: string): Promise<Readonly<{
  checkedEntries: number
  roots: readonly string[]
  vendorScan: Readonly<{
    scope: 'bounded-no-follow'
    maxDepth: number
    maxEntries: number
    checkedEntries: number
    forbiddenSourceFound: boolean
  }>
}>>

export function inspectPackage(outputDir: string, target: unknown, options?: Readonly<{ executable?: string }>): Promise<unknown>

export function preparePackagedArtifact(options?: unknown): Promise<unknown>

export function launchPackaged(...args: readonly unknown[]): Promise<any>

export function runRendererSmoke(...args: readonly unknown[]): Promise<any>

export function stopPackagedChild(child: any): Promise<void>

export function waitFor<T>(fetcher: () => T | Promise<T>, predicate: (value: T) => boolean, timeout?: number): Promise<T>
