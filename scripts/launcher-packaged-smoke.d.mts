export function withSmokeEnvironment<T>(operation: () => T | Promise<T>): Promise<T>

export function smokeEnvironment(overrides?: NodeJS.ProcessEnv, disposableRoot?: string): NodeJS.ProcessEnv

export function freePort(): Promise<number>

export function selectCdpDescriptor<T extends Readonly<{ title?: string; webSocketDebuggerUrl?: string }>>(
  pages: readonly T[],
  title: string,
  port: number,
): T | undefined

export function findNsisInstaller(installerDir: string, architecture?: number | string): Promise<string>

export function inspectExtraResources(asarPath: string): Promise<Readonly<{
  checkedEntries: number
  roots: readonly string[]
  vendorSourceShipped: boolean
}>>

export function inspectPackage(outputDir: string, target: unknown, options?: Readonly<{ executable?: string }>): Promise<unknown>

export function preparePackagedArtifact(options?: unknown): Promise<unknown>

export function launchPackaged(...args: readonly unknown[]): Promise<any>

export function runRendererSmoke(...args: readonly unknown[]): Promise<any>

export function stopPackagedChild(child: any): Promise<void>

export function waitFor<T>(fetcher: () => T | Promise<T>, predicate: (value: T) => boolean, timeout?: number): Promise<T>
