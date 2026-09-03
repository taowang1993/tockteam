import { spawnSync } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_PACKAGE = '@deepseek-ai/dsh'

function fail(message) {
  throw new Error(`dsh-source.json ${message}`)
}

function stringField(value, field) {
  if (typeof value[field] !== 'string' || value[field] === '') {
    fail(`${field} must be a non-empty string`)
  }
  return value[field]
}

function integrityField(value, field) {
  const integrity = stringField(value, field)
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/u.exec(integrity)
  if (match === null || Buffer.from(match[1], 'base64').length !== 64) {
    fail(`${field} must be a SHA-512 SRI digest`)
  }
  return integrity
}

export function parseDshSourceSpec(value) {
  if (value === null || typeof value !== 'object') fail('must be an object')
  const source = stringField(value, 'source')
  const version = stringField(value, 'version')
  const packageManager = stringField(value, 'packageManager')
  const pnpmIntegrity = integrityField(value, 'pnpmIntegrity')
  if (!/^pnpm@\d+\.\d+\.\d+$/u.test(packageManager)) {
    fail('packageManager must pin a pnpm version')
  }

  if (source === 'npm') {
    const packageName = stringField(value, 'package')
    const integrity = integrityField(value, 'integrity')
    const tarball = stringField(value, 'tarball')
    if (packageName !== DSH_PACKAGE) fail(`package must be ${DSH_PACKAGE}`)
    const expectedTarball = `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${version}.tgz`
    if (tarball !== expectedTarball) fail('tarball must be the exact registry package URL')
    return Object.freeze({
      source,
      package: packageName,
      version,
      integrity,
      tarball,
      packageManager,
      pnpmIntegrity,
    })
  }

  if (source === 'git') {
    const repository = stringField(value, 'repository')
    const ref = stringField(value, 'ref')
    const revision = stringField(value, 'revision')
    if (!/^[0-9a-f]{40}$/u.test(revision)) fail('revision must be a full Git commit')
    if (ref !== revision) fail('ref must equal revision')
    return Object.freeze({
      source,
      repository,
      ref,
      revision,
      version,
      packageManager,
      pnpmIntegrity,
    })
  }

  fail('source must be npm or git')
}

/** Reproducible DSH release source used by release builds. */
export const DSH_SOURCE_SPEC = parseDshSourceSpec(
  JSON.parse(readFileSync(join(root, 'dsh-source.json'), 'utf8')),
)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${String(result.status)}`)
  }
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} ${args.join(' ')} failed`)
  }
  return result.stdout.trim()
}

export function verifySha512(path, integrity) {
  const expected = Buffer.from(integrity.slice('sha512-'.length), 'base64')
  const actual = createHash('sha512').update(readFileSync(path)).digest()
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error(`${path} integrity mismatch`)
  }
}

function download(url, target) {
  const temporary = `${target}.download-${String(process.pid)}`
  rmSync(temporary, { force: true })
  try {
    run('curl', ['--fail', '--location', '--silent', '--show-error', url, '--output', temporary])
    rmSync(target, { force: true })
    renameSync(temporary, target)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function extractTarball(archive, extraction) {
  if (dirname(archive) !== dirname(extraction)) {
    throw new Error('tar archive and extraction directory must share a parent')
  }
  run('tar', ['-xzf', basename(archive), '-C', basename(extraction)], {
    cwd: dirname(archive),
  })
}

/** Resolve the integrity-pinned pnpm CLI declared by `dsh-source.json`. */
export function resolvePinnedPnpm() {
  const reference = DSH_SOURCE_SPEC.packageManager
  const version = reference.slice('pnpm@'.length)
  const cache = join(root, '.cache', 'pnpm-cli')
  const archive = join(cache, `pnpm-${version}.tgz`)
  const installRoot = join(cache, `pnpm-${version}`)
  const cliRoot = join(installRoot, 'package')
  const cliEntry = join(cliRoot, 'bin', 'pnpm.cjs')
  mkdirSync(cache, { recursive: true })
  if (!existsSync(archive)) {
    download(`https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz`, archive)
  }
  verifySha512(archive, DSH_SOURCE_SPEC.pnpmIntegrity)
  if (!existsSync(cliEntry)) {
    const extraction = join(cache, `.pnpm-extract-${String(process.pid)}`)
    rmSync(extraction, { recursive: true, force: true })
    mkdirSync(extraction, { recursive: true })
    try {
      extractTarball(archive, extraction)
      rmSync(installRoot, { recursive: true, force: true })
      mkdirSync(dirname(cliRoot), { recursive: true })
      renameSync(join(extraction, 'package'), cliRoot)
    } finally {
      rmSync(extraction, { recursive: true, force: true })
    }
  }
  if (!existsSync(cliEntry)) {
    throw new Error(`pnpm ${version} CLI did not unpack to ${cliEntry}`)
  }
  const binDir = join(installRoot, 'bin')
  mkdirSync(binDir, { recursive: true })
  if (process.platform === 'win32') {
    writeFileSync(join(binDir, 'pnpm.cmd'),
      `@"${process.execPath}" "${cliEntry}" %*\r\n`)
  } else {
    const launcher = join(binDir, 'pnpm')
    writeFileSync(launcher,
      `#!/bin/sh\nexec "${process.execPath}" "${cliEntry}" "$@"\n`)
    chmodSync(launcher, 0o755)
  }
  return { binDir, cliEntry }
}

function validateVersion(source) {
  const manifestPath = join(source, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`DSH source not found: ${source}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.version !== DSH_SOURCE_SPEC.version) {
    throw new Error(
      `DSH ${DSH_SOURCE_SPEC.version} is required, received ${String(manifest.version)} at ${source}`,
    )
  }
  return manifest
}

function validateDevelopmentSource(source, expectedRevision) {
  validateVersion(source)
  if (!existsSync(join(source, 'apps', 'cli', 'package.json'))) {
    throw new Error(`DSH development checkout not found: ${source}`)
  }
  if (expectedRevision === undefined) return
  const actual = capture('git', ['rev-parse', 'HEAD'], source)
  if (actual !== expectedRevision) {
    throw new Error(`cached DSH revision mismatch: expected ${expectedRevision}, received ${actual}`)
  }
  const changes = capture('git', ['status', '--porcelain', '--untracked-files=no'], source)
  if (changes !== '') throw new Error(`cached DSH source contains tracked changes: ${source}`)
}

function validateNpmAssembly(source) {
  const manifest = validateVersion(source)
  if (DSH_SOURCE_SPEC.source !== 'npm') throw new Error('npm assembly requires an npm source spec')
  if (manifest.name !== DSH_SOURCE_SPEC.package) {
    throw new Error(
      `DSH package ${DSH_SOURCE_SPEC.package} is required, received ${String(manifest.name)} at ${source}`,
    )
  }
  for (const required of ['lib/bin.js', 'config']) {
    if (!existsSync(join(source, required))) {
      throw new Error(`DSH npm assembly is missing ${required}: ${source}`)
    }
  }
}

function acquirePinnedGitSource(target) {
  if (DSH_SOURCE_SPEC.source !== 'git') throw new Error('Git checkout requires a Git source spec')
  const temporary = `${target}.clone-${String(process.pid)}`
  rmSync(temporary, { recursive: true, force: true })
  try {
    run('git', ['init', temporary])
    run('git', ['-C', temporary, 'remote', 'add', 'origin', DSH_SOURCE_SPEC.repository])
    run('git', [
      '-C', temporary,
      'fetch',
      '--depth=1',
      '--filter=blob:none',
      '--no-tags',
      'origin',
      DSH_SOURCE_SPEC.revision,
    ])
    run('git', ['-C', temporary, 'checkout', '--detach', DSH_SOURCE_SPEC.revision])
    validateDevelopmentSource(temporary, DSH_SOURCE_SPEC.revision)
    try {
      renameSync(temporary, target)
    } catch (error) {
      if (!existsSync(join(target, '.git'))) throw error
      validateDevelopmentSource(target, DSH_SOURCE_SPEC.revision)
      rmSync(temporary, { recursive: true, force: true })
    }
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

export function acquireNpmAssembly(parent, archive) {
  const pointer = join(parent, 'assembly-path')
  const legacyTarget = join(parent, 'assembly')
  const previousName = existsSync(pointer)
    ? readFileSync(pointer, 'utf8').trim()
    : existsSync(legacyTarget) ? basename(legacyTarget) : undefined
  if (previousName !== undefined && !/^assembly(?:-\d+-\d+)?$/u.test(previousName)) {
    throw new Error(`invalid cached DSH assembly pointer: ${pointer}`)
  }

  const targetName = `assembly-${String(process.pid)}-${String(Date.now())}`
  const target = join(parent, targetName)
  const extraction = join(parent, `.npm-extract-${String(process.pid)}`)
  const temporaryPointer = `${pointer}.tmp-${String(process.pid)}`
  rmSync(extraction, { recursive: true, force: true })
  rmSync(temporaryPointer, { force: true })
  mkdirSync(extraction, { recursive: true })
  try {
    extractTarball(archive, extraction)
    const unpacked = join(extraction, 'package')
    if (!existsSync(unpacked)) throw new Error(`DSH npm package did not unpack to ${unpacked}`)
    writeFileSync(join(unpacked, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - .',
      '',
      'minimumReleaseAgeExclude:',
      "  - '@deepseek-ai/*'",
      '',
    ].join('\n'))
    validateNpmAssembly(unpacked)
    renameSync(unpacked, target)
    writeFileSync(temporaryPointer, `${targetName}\n`)
    renameSync(temporaryPointer, pointer)
    if (previousName !== undefined && previousName !== targetName) {
      rmSync(join(parent, previousName), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
    return target
  } catch (error) {
    if (!existsSync(pointer) || readFileSync(pointer, 'utf8').trim() !== targetName) {
      rmSync(target, { recursive: true, force: true })
    }
    throw error
  } finally {
    rmSync(temporaryPointer, { force: true })
    rmSync(extraction, { recursive: true, force: true })
  }
}

function resolveNpmAssembly() {
  if (DSH_SOURCE_SPEC.source !== 'npm') throw new Error('npm assembly requires an npm source spec')
  const parent = join(root, '.cache', 'dsh-source', `npm-${DSH_SOURCE_SPEC.version}`)
  const archive = join(parent, `${DSH_SOURCE_SPEC.version}.tgz`)
  mkdirSync(parent, { recursive: true })
  if (!existsSync(archive)) download(DSH_SOURCE_SPEC.tarball, archive)
  verifySha512(archive, DSH_SOURCE_SPEC.integrity)
  // pnpm mutates the assembly during install, so publish a fresh extraction on every resolution.
  const target = acquireNpmAssembly(parent, archive)
  validateNpmAssembly(target)
  return target
}

/** Resolve an explicit development checkout or the pinned release assembly. */
export function resolveDshSource() {
  if (process.env.DSH_SOURCE !== undefined) {
    const path = resolve(process.env.DSH_SOURCE)
    validateDevelopmentSource(path)
    console.log(`Using DSH source override: ${path}`)
    return { kind: 'source', path }
  }

  if (DSH_SOURCE_SPEC.source === 'npm') {
    const path = resolveNpmAssembly()
    console.log(
      `Using pinned DSH npm release ${DSH_SOURCE_SPEC.version} (${DSH_SOURCE_SPEC.integrity.slice(0, 24)}…)`,
    )
    return { kind: 'npm', path }
  }

  const parent = join(root, '.cache', 'dsh-source')
  const path = join(parent, DSH_SOURCE_SPEC.revision.slice(0, 12))
  mkdirSync(parent, { recursive: true })
  if (!existsSync(join(path, '.git'))) acquirePinnedGitSource(path)
  validateDevelopmentSource(path, DSH_SOURCE_SPEC.revision)
  console.log(`Using pinned DSH ${DSH_SOURCE_SPEC.version} (${DSH_SOURCE_SPEC.revision.slice(0, 12)})`)
  return { kind: 'source', path }
}
