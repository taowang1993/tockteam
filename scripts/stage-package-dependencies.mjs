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

function copyPackage(sourceManifestPath, target, resolveDependencyManifest, ancestors) {
  const canonicalManifest = realpathSync(sourceManifestPath)
  const source = dirname(canonicalManifest)
  const manifest = readManifest(canonicalManifest)
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

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(canonicalManifest)
  const requireFromPackage = createRequire(canonicalManifest)
  for (const [dependency, optional] of dependencyNames(manifest)) {
    if (optional && dependency === '@tockteam/desktop') continue
    let dependencyManifest
    try {
      dependencyManifest = resolveDependencyManifest(requireFromPackage, dependency)
      const canonicalDependency = realpathSync(dependencyManifest)
      // A cycle resolves through the already copied parent package using
      // Node's normal ancestor lookup; copying it again would recurse forever.
      if (nextAncestors.has(canonicalDependency)) continue
      copyPackage(
        dependencyManifest,
        join(target, 'node_modules', ...dependency.split('/')),
        resolveDependencyManifest,
        nextAncestors,
      )
    } catch (error) {
      if (optional) continue
      throw new Error(`${manifest.name} is missing runtime dependency ${dependency}`, {
        cause: error,
      })
    }
  }
}

function linkDependency(parent, dependency, target) {
  const link = join(parent, 'node_modules', ...dependency.split('/'))
  mkdirSync(dirname(link), { recursive: true })
  rmSync(link, { recursive: true, force: true })
  symlinkSync(relative(dirname(link), target), link)
}

function linkPackageDependencies(sourceManifestPath, packageDir, resolveDependencyManifest) {
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
        const dependencyTarget = installManifest(
          resolveDependencyManifest(requireFromPackage, dependency),
        )
        linkDependency(target, dependency, dependencyTarget)
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
      const dependencyTarget = installManifest(
        resolveDependencyManifest(requireFromSource, dependency),
      )
      linkDependency(packageDir, dependency, dependencyTarget)
    } catch (error) {
      if (optional) continue
      throw new Error(`${sourceManifest.name} is missing runtime dependency ${dependency}`, {
        cause: error,
      })
    }
  }
}

/**
 * Install dependencies for a compiled package without relying on its source
 * checkout at runtime. Windows stages use copied nested packages because
 * directory links are not portable in archives; other stages retain the
 * package-local store and relative links used by the existing runtime.
 */
export function installCompiledPackageDependencies(
  sourceManifestPath,
  packageDir,
  { materializeDependencies = 'link', resolveDependencyManifest } = {},
) {
  if (typeof resolveDependencyManifest !== 'function') {
    throw new TypeError('resolveDependencyManifest is required')
  }
  if (materializeDependencies === 'copy') {
    const sourceManifestPathCanonical = realpathSync(sourceManifestPath)
    const sourceManifest = readManifest(sourceManifestPathCanonical)
    const requireFromSource = createRequire(sourceManifestPathCanonical)
    const sourceAncestors = new Set([sourceManifestPathCanonical])
    for (const [dependency, optional] of dependencyNames(sourceManifest)) {
      if (optional && dependency === '@tockteam/desktop') continue
      try {
        const dependencyManifest = resolveDependencyManifest(requireFromSource, dependency)
        copyPackage(
          dependencyManifest,
          join(packageDir, 'node_modules', ...dependency.split('/')),
          resolveDependencyManifest,
          sourceAncestors,
        )
      } catch (error) {
        if (optional) continue
        throw new Error(`${sourceManifest.name} is missing runtime dependency ${dependency}`, {
          cause: error,
        })
      }
    }
    return
  }
  if (materializeDependencies !== 'link') {
    throw new TypeError(`unknown dependency materialization mode: ${materializeDependencies}`)
  }
  linkPackageDependencies(sourceManifestPath, packageDir, resolveDependencyManifest)
}
