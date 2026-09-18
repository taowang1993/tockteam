import { createRequire } from 'node:module'
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

export function dependencyNames(manifest) {
  return new Map([
    ...Object.keys(manifest.peerDependencies ?? {}).map(name => [name, true]),
    ...Object.keys(manifest.optionalDependencies ?? {}).map(name => [name, true]),
    ...Object.keys(manifest.dependencies ?? {}).map(name => [name, false]),
  ])
}

function readManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error(`invalid runtime dependency manifest: ${manifestPath}`)
  }
  return manifest
}

function linkDependency(parent, dependency, target) {
  const link = join(parent, 'node_modules', ...dependency.split('/'))
  mkdirSync(dirname(link), { recursive: true })
  rmSync(link, { recursive: true, force: true })
  if (process.platform === 'win32') symlinkSync(target, link, 'junction')
  else symlinkSync(relative(dirname(link), target), link)
}

/**
 * Build the existing package-local dependency store. Every link remains inside
 * the staged package, so archive/copy tooling can dereference it without the
 * source checkout or repository node_modules.
 */
export function installCompiledPackageDependencies(
  sourceManifestPath,
  packageDir,
  { resolveDependencyManifest } = {},
) {
  if (typeof resolveDependencyManifest !== 'function') {
    throw new TypeError('resolveDependencyManifest is required')
  }
  const installRoot = join(packageDir, 'node_modules')
  const storeRoot = join(installRoot, '.tockteam-store')
  const installed = new Map()

  const instanceName = (manifestPath, manifest) => {
    const parts = resolve(manifestPath).split(sep)
    const storeIndex = parts.lastIndexOf('.pnpm')
    const identity =
      storeIndex >= 0 && parts[storeIndex + 1] !== undefined
        ? parts[storeIndex + 1]
        : `${manifest.name}@${manifest.version}`
    return identity.replace(/[^A-Za-z0-9._-]/g, '_')
  }

  const installManifest = manifestPath => {
    const canonicalManifest = realpathSync(manifestPath)
    const existing = installed.get(canonicalManifest)
    if (existing !== undefined) return existing
    const source = dirname(canonicalManifest)
    const manifest = readManifest(canonicalManifest)
    const target = join(
      storeRoot,
      instanceName(canonicalManifest, manifest),
      'node_modules',
      ...manifest.name.split('/'),
    )
    installed.set(canonicalManifest, target)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, {
      dereference: true,
      preserveTimestamps: true,
      recursive: true,
      filter: candidate => {
        const rel = relative(source, candidate)
        return rel === '' || rel.split(sep)[0] !== 'node_modules'
      },
    })

    const requireFromPackage = createRequire(canonicalManifest)
    for (const [dependency, optional] of dependencyNames(manifest)) {
      if (optional && dependency === '@tockteam/desktop') continue
      try {
        linkDependency(
          target,
          dependency,
          installManifest(resolveDependencyManifest(requireFromPackage, dependency)),
        )
      } catch (error) {
        if (optional) continue
        throw new Error(`${manifest.name} is missing runtime dependency ${dependency}`, {
          cause: error,
        })
      }
    }
    return target
  }

  const sourceManifest = readManifest(sourceManifestPath)
  const requireFromSource = createRequire(sourceManifestPath)
  for (const [dependency, optional] of dependencyNames(sourceManifest)) {
    if (optional && dependency === '@tockteam/desktop') continue
    try {
      linkDependency(
        packageDir,
        dependency,
        installManifest(resolveDependencyManifest(requireFromSource, dependency)),
      )
    } catch (error) {
      if (optional) continue
      throw new Error(`${sourceManifest.name} is missing runtime dependency ${dependency}`, {
        cause: error,
      })
    }
  }
}
