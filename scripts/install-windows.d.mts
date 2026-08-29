export const WINDOWS_PORTABLE_MARKER: string

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
