export function assertReleaseVersion(input: Readonly<{
  tag: unknown
  packageVersion: unknown
  artifactVersion?: unknown
}>): string

export function checkReleaseVersion(input?: Readonly<{
  tag?: unknown
  packagePath?: string
  artifactPath?: string
}>): string
