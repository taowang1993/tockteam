export type PackageManifest = {
  name?: string
  version?: string
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  dependencies?: Record<string, string>
}

export type DependencyManifestResolver = (
  requireFromPackage: NodeJS.Require,
  dependency: string,
) => string

export function dependencyNames(manifest: PackageManifest): Map<string, boolean>

export function installCompiledPackageDependencies(
  sourceManifestPath: string,
  packageDir: string,
  options: {
    resolveDependencyManifest: DependencyManifestResolver
  },
): void
