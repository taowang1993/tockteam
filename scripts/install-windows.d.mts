export const WINDOWS_PORTABLE_MARKER: string

export function defaultWindowsInstallDestination(environment?: NodeJS.ProcessEnv): string

export function parseWindowsInstallArgs(
  args: readonly unknown[],
  environment?: NodeJS.ProcessEnv,
): Readonly<{ archive: string; destination: string }>

export function windowsPortableExtractArgs(archive: string, pending: string): readonly string[]

export function installWindowsPortableArchive(options?: Readonly<{
  archive: string
  destination?: string
  environment?: NodeJS.ProcessEnv
}>): Promise<Readonly<{ backup?: string; destination: string }>>

export function restoreWindowsPortableRuntimeLinks(
  rootPath: string,
  options?: Readonly<{
    createDirectoryLink?: (target: string, path: string) => void | Promise<void>
    copyFile?: (target: string, path: string) => void | Promise<void>
  }>,
): Promise<Readonly<{ count: number; runtimeRoot: string }>>

export function validateWindowsPortableRoot(
  rootPath: string,
  expected: Readonly<{ appId: string; productName: string; version: string }>,
): Promise<Readonly<{ marker: unknown; executable: string }>>

export function replaceWindowsPortableArchive(options: Readonly<{
  archive: string
  destination: string
  backupDirectory: string
  extractArchive: (archive: string, pending: string) => void | Promise<void>
  validateInstall: (path: string) => void | Promise<void>
}>): Promise<Readonly<{ backup?: string; destination: string }>>
