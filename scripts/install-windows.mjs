import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, copyFile, lstat, mkdir, readFile, realpath, readdir, rename, rm, stat, symlink } from 'node:fs/promises'
import { constants, existsSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  normalizePortableManifestPath,
  portablePathContained,
  PORTABLE_RUNTIME_LINK_MAX_ENTRIES,
  WINDOWS_PORTABLE_MARKER,
} from './windows-portable-archive.mjs'

export { WINDOWS_PORTABLE_MARKER }

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const WINDOWS_EXPECTED = Object.freeze({
  appId: packageJson.build?.appId,
  productName: packageJson.productName,
  version: packageJson.version,
})

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function backupPath(directory, destination) {
  const stem = `${basename(destination)}-before`
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const name = suffix === 0 ? stem : `${stem}-${String(suffix)}`
    const candidate = join(directory, name)
    if (!await exists(candidate)) return candidate
  }
  throw new Error('unable to reserve a portable TockTeam backup path')
}

function runtimeRootPath(rootPath) {
  return join(resolve(rootPath), 'win-unpacked', 'resources', 'dsh-runtime')
}

function pathWithin(rootPath, candidate) {
  const candidateRelative = relative(rootPath, candidate)
  return candidateRelative === '' || (!isAbsolute(candidateRelative) && candidateRelative !== '..' && !candidateRelative.startsWith(`..${sep}`))
}

async function regularPath(rootPath, candidate, label) {
  const resolvedRoot = resolve(rootPath)
  const resolvedCandidate = resolve(candidate)
  assert.equal(pathWithin(resolvedRoot, resolvedCandidate), true, `${label} escapes extracted root`)
  const candidateRelative = relative(resolvedRoot, resolvedCandidate)
  assert.notEqual(candidateRelative, '', `${label} must be below extracted root`)
  let current = resolvedRoot
  for (const segment of candidateRelative.split(sep)) {
    current = join(current, segment)
    const entry = await lstat(current)
    assert.equal(entry.isSymbolicLink(), false, `${label} contains a symbolic-link ancestor`)
    if (current !== resolvedCandidate) assert.equal(entry.isDirectory(), true, `${label} contains a non-directory ancestor`)
  }
  const canonical = await realpath(resolvedCandidate)
  return Object.freeze({ path: resolvedCandidate, canonical })
}

async function extractedRoots(rootPath) {
  const extractedRoot = resolve(rootPath)
  const rootEntry = await lstat(extractedRoot)
  assert.equal(rootEntry.isDirectory() && !rootEntry.isSymbolicLink(), true, 'portable extracted root must be a regular directory')
  const canonicalExtractedRoot = await realpath(extractedRoot)
  const runtime = await regularPath(extractedRoot, runtimeRootPath(extractedRoot), 'portable runtime root')
  assert.equal((await stat(runtime.path)).isDirectory(), true, 'portable runtime root must be a directory')
  assert.equal(runtime.canonical !== canonicalExtractedRoot && pathWithin(canonicalExtractedRoot, runtime.canonical), true, 'portable runtime root must remain strictly inside extracted root')
  return Object.freeze({
    extractedRoot,
    canonicalExtractedRoot,
    runtimeRoot: runtime.path,
    canonicalRuntimeRoot: runtime.canonical,
  })
}

async function readPortableMarker(rootPath) {
  const markerPath = join(resolve(rootPath), WINDOWS_PORTABLE_MARKER)
  const markerEntry = await lstat(markerPath)
  assert.equal(markerEntry.isFile() && !markerEntry.isSymbolicLink(), true, 'portable marker must be a regular non-symlink file')
  const marker = JSON.parse(await readFile(markerPath, 'utf8'))
  assert(marker !== null && typeof marker === 'object', 'portable marker must be an object')
  assert.equal(marker.schemaVersion, 1, 'portable marker schema is unsupported')
  for (const key of ['appId', 'productName', 'version']) assert.equal(typeof marker[key], 'string', `portable marker metadata is missing ${key}`)
  assert(Array.isArray(marker.runtimeLinks), 'portable runtime-link manifest is missing')
  assert.ok(marker.runtimeLinks.length <= PORTABLE_RUNTIME_LINK_MAX_ENTRIES, 'portable runtime-link manifest exceeds its entry cap')
  return marker
}

async function regularAncestorReal(rootPath, candidate, label) {
  const resolvedRoot = resolve(rootPath)
  const resolvedCandidate = resolve(candidate)
  const candidateRelative = relative(resolvedRoot, resolvedCandidate)
  assert.equal(pathWithin(resolvedRoot, resolvedCandidate), true, `${label} escapes extracted root`)
  let current = resolvedRoot
  for (const segment of candidateRelative === '' ? [] : candidateRelative.split(sep)) {
    current = join(current, segment)
    const entry = await lstat(current)
    assert.equal(entry.isSymbolicLink(), false, `${label} contains a symbolic-link ancestor`)
    if (current !== resolvedCandidate) assert.equal(entry.isDirectory(), true, `${label} contains a non-directory ancestor`)
  }
  return await realpath(resolvedCandidate)
}

async function validateRuntimeLinks(rootPath, marker, roots, { allowStaleLinks = false } = {}) {
  const runtimeRoot = roots.runtimeRoot
  const canonicalRoot = roots.canonicalRuntimeRoot
  const entries = []
  const seen = new Set()
  for (const raw of marker.runtimeLinks) {
    assert(raw !== null && typeof raw === 'object', 'portable runtime-link entry must be an object')
    const path = normalizePortableManifestPath(raw.path)
    const target = normalizePortableManifestPath(raw.target)
    assert(raw.kind === 'dir' || raw.kind === 'file', 'portable runtime-link kind is unsupported')
    assert.equal(seen.has(path), false, `portable runtime-link path is duplicated: ${path}`)
    assert.notEqual(path, target, `portable runtime-link points to itself: ${path}`)
    seen.add(path)
    const linkPath = resolve(runtimeRoot, ...path.split('/'))
    const targetPath = resolve(runtimeRoot, ...target.split('/'))
    assert.equal(portablePathContained(runtimeRoot, linkPath), true, `portable runtime-link path escapes runtime root: ${path}`)
    assert.equal(portablePathContained(runtimeRoot, targetPath), true, `portable runtime-link target escapes runtime root: ${path}`)
    entries.push(Object.freeze({ path, target, kind: raw.kind, linkPath, targetPath }))
  }
  entries.sort((left, right) => left.path.localeCompare(right.path))
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].path.startsWith(`${entries[index - 1].path}/`)) throw new Error(`portable runtime-link paths overlap: ${entries[index - 1].path}`)
  }
  for (const entry of entries) {
    const parentReal = await regularAncestorReal(runtimeRoot, dirname(entry.linkPath), `portable runtime-link parent: ${entry.path}`)
    assert.equal(pathWithin(canonicalRoot, parentReal), true, `portable runtime-link parent escapes runtime root: ${entry.path}`)
    const targetParentReal = await regularAncestorReal(runtimeRoot, dirname(entry.targetPath), `portable runtime-link target ancestor: ${entry.path}`)
    assert.equal(pathWithin(canonicalRoot, targetParentReal), true, `portable runtime-link target ancestor escapes runtime root: ${entry.path}`)
    const targetReal = await realpath(entry.targetPath)
    assert.equal(targetReal !== canonicalRoot && pathWithin(canonicalRoot, targetReal), true, `portable runtime-link target creates a runtime-root cycle: ${entry.path}`)
    assert.equal(pathWithin(targetReal, parentReal), false, `portable runtime-link target is an ancestor of its link: ${entry.path}`)
    const targetStats = await stat(entry.targetPath)
    assert.equal(entry.kind === 'dir' ? targetStats.isDirectory() : targetStats.isFile(), true, `portable runtime-link target kind differs: ${entry.path}`)
    const linkStats = await lstat(entry.linkPath)
    if (linkStats.isSymbolicLink()) {
      let linkedReal
      try {
        linkedReal = await realpath(entry.linkPath)
      } catch (error) {
        if (!allowStaleLinks || error?.code !== 'ENOENT') throw error
      }
      if (linkedReal !== undefined) assert.equal(linkedReal, targetReal, `portable runtime-link placeholder target differs: ${entry.path}`)
    } else if (entry.kind === 'dir') {
      assert.equal(linkStats.isDirectory(), true, `portable runtime-link directory placeholder is invalid: ${entry.path}`)
      assert.equal((await readdir(entry.linkPath)).length, 0, `portable runtime-link directory placeholder is nonempty: ${entry.path}`)
    } else {
      assert.equal(linkStats.isFile(), true, `portable runtime-link file placeholder is invalid: ${entry.path}`)
      assert.equal(linkStats.size, 0, `portable runtime-link file placeholder is nonempty: ${entry.path}`)
    }
  }
  return entries
}

export async function restoreWindowsPortableRuntimeLinks(rootPath, options = {}) {
  const marker = await readPortableMarker(rootPath)
  const roots = await extractedRoots(rootPath)
  const entries = await validateRuntimeLinks(rootPath, marker, roots, { allowStaleLinks: true })
  const createDirectoryLink = options.createDirectoryLink ?? ((target, path) => symlink(target, path, 'junction'))
  const copyRegularFile = options.copyFile ?? ((target, path) => copyFile(target, path))
  for (const entry of entries) {
    const linkStats = await lstat(entry.linkPath)
    await rm(entry.linkPath, { recursive: !linkStats.isSymbolicLink(), force: true })
  }
  const byPath = new Map(entries.map(entry => [entry.path, entry]))
  const state = new Map()
  const restore = async entry => {
    const current = state.get(entry.path)
    if (current === 'done') return
    if (current === 'active') throw new Error(`portable runtime-link cycle detected at ${entry.path}`)
    state.set(entry.path, 'active')
    const dependency = byPath.get(entry.target)
    if (dependency !== undefined) await restore(dependency)
    const targetStats = await stat(entry.targetPath)
    assert.equal(entry.kind === 'dir' ? targetStats.isDirectory() : targetStats.isFile(), true, `portable runtime-link target changed during restore: ${entry.path}`)
    await mkdir(dirname(entry.linkPath), { recursive: true })
    if (entry.kind === 'dir') await createDirectoryLink(entry.targetPath, entry.linkPath)
    else await copyRegularFile(entry.targetPath, entry.linkPath)
    const restoredStats = await stat(entry.linkPath)
    assert.equal(entry.kind === 'dir' ? restoredStats.isDirectory() : restoredStats.isFile(), true, `portable runtime-link restore failed: ${entry.path}`)
    state.set(entry.path, 'done')
  }
  for (const entry of entries) await restore(entry)
  return Object.freeze({ count: entries.length, runtimeRoot: roots.runtimeRoot })
}

export async function validateWindowsPortableRoot(rootPath, expected) {
  const marker = await readPortableMarker(rootPath)
  const roots = await extractedRoots(rootPath)
  assert.equal(marker.version, expected.version)
  assert.equal(marker.appId, expected.appId)
  assert.equal(marker.productName, expected.productName)
  const runtimeRoot = roots.runtimeRoot
  const appBootRoot = join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
  const appBootPackage = join(appBootRoot, 'package.json')
  const appBootEntry = join(appBootRoot, 'lib', 'index.js')
  const appBootCanonical = await realpath(appBootRoot)
  assert.equal(pathWithin(roots.canonicalRuntimeRoot, appBootCanonical), true, 'portable DSH app-boot root escaped runtime root')
  const appBootPackageCanonical = await realpath(appBootPackage)
  assert.equal(pathWithin(roots.canonicalRuntimeRoot, appBootPackageCanonical), true, 'portable DSH app-boot metadata escaped runtime root')
  const appBootEntryCanonical = await realpath(appBootEntry)
  assert.equal(pathWithin(roots.canonicalRuntimeRoot, appBootEntryCanonical), true, 'portable DSH app-boot entry escaped runtime root')
  const appBootMetadata = await readFile(appBootPackage, 'utf8')
  assert.doesNotThrow(() => JSON.parse(appBootMetadata), 'portable DSH app-boot package metadata is invalid')
  assert.equal((await stat(appBootEntry)).isFile(), true, 'portable DSH app-boot entry is missing')
  const executable = join(rootPath, 'win-unpacked', `${expected.productName}.exe`)
  assert.equal((await stat(executable)).isFile(), true, 'portable TockTeam executable is missing')
  return Object.freeze({ marker, executable })
}

export function defaultWindowsInstallDestination(environment = process.env) {
  const localAppData = typeof environment.LOCALAPPDATA === 'string' ? environment.LOCALAPPDATA.trim() : ''
  if (!win32.isAbsolute(localAppData)) throw new Error('Windows LOCALAPPDATA must be an absolute per-user path')
  return win32.join(localAppData, 'TockTeam', 'Desktop')
}

export function parseWindowsInstallArgs(args, environment = process.env) {
  if (!Array.isArray(args) || args.length < 1 || args.length > 2) throw new Error('usage: node scripts/install-windows.mjs <archive> [destination]')
  const rawArchive = typeof args[0] === 'string' ? args[0].trim() : ''
  if (rawArchive === '') throw new Error('usage: node scripts/install-windows.mjs <archive> [destination]')
  const archive = win32.isAbsolute(rawArchive) ? win32.normalize(rawArchive) : win32.resolve(rawArchive)
  const rawDestination = args[1]
  if (rawDestination !== undefined && (typeof rawDestination !== 'string' || !win32.isAbsolute(rawDestination))) throw new Error('Windows install destination must be an absolute path')
  const destination = rawDestination === undefined ? defaultWindowsInstallDestination(environment) : win32.normalize(rawDestination)
  return Object.freeze({ archive, destination })
}

export function windowsPortableExtractArgs(archive, pending) {
  if (!win32.isAbsolute(archive) || !win32.isAbsolute(pending)) throw new Error('Windows archive extraction requires absolute paths')
  return Object.freeze(['-a', '-x', '-f', archive, '-C', pending])
}

function trustedWindowsTool(name, environment = process.env) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(name)) throw new Error('Windows tool name is invalid')
  const systemRoot = typeof environment.SystemRoot === 'string' ? environment.SystemRoot.trim() : ''
  if (!win32.isAbsolute(systemRoot)) throw new Error('Windows SystemRoot must be an absolute path')
  const tool = win32.join(systemRoot, 'System32', name)
  if (!existsSync(tool)) throw new Error(`Windows trusted tool is missing: ${tool}`)
  return tool
}

export async function installWindowsPortableArchive({ archive, destination, environment = process.env } = {}) {
  if (process.platform !== 'win32') throw new Error('Windows portable archive installation requires Windows')
  const parsed = parseWindowsInstallArgs(destination === undefined ? [archive] : [archive, destination], environment)
  const absoluteArchive = parsed.archive
  const absoluteDestination = parsed.destination
  const backupDirectory = win32.join(win32.dirname(absoluteDestination), `${win32.basename(absoluteDestination)}-backups`)
  const tar = trustedWindowsTool('tar.exe', environment)
  return await replaceWindowsPortableArchive({
    archive: absoluteArchive,
    destination: absoluteDestination,
    backupDirectory,
    extractArchive: async (source, pending) => await execFileAsync(tar, windowsPortableExtractArgs(source, pending), { windowsHide: true }),
    validateInstall: path => validateWindowsPortableRoot(path, WINDOWS_EXPECTED),
  })
}

export async function replaceWindowsPortableArchive(options) {
  const archive = resolve(options.archive)
  const destination = resolve(options.destination)
  const backupDirectory = resolve(options.backupDirectory)
  const extractArchive = options.extractArchive
  const validateInstall = options.validateInstall
  const pending = join(dirname(destination), `.${basename(destination)}.install-${String(process.pid)}-${randomBytes(6).toString('hex')}`)
  const lock = join(dirname(destination), `.${basename(destination)}.install.lock`)
  let backup
  let previousMoved = false
  let promoted = false

  await access(archive, constants.R_OK)
  try {
    await mkdir(lock)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('another TockTeam portable install is already in progress')
    throw error
  }
  try {
    await mkdir(pending)
    await extractArchive(archive, pending)
    await restoreWindowsPortableRuntimeLinks(pending)
    await validateInstall(pending)
    await mkdir(backupDirectory, { recursive: true })
    if (await exists(destination)) {
      backup = await backupPath(backupDirectory, destination)
      await rename(destination, backup)
      previousMoved = true
    }
    try {
      await rename(pending, destination)
      promoted = true
      await restoreWindowsPortableRuntimeLinks(destination)
      await validateInstall(destination)
    } catch (error) {
      try {
        if (promoted) await rm(destination, { recursive: true, force: true })
        if (previousMoved && backup !== undefined && !await exists(destination)) await rename(backup, destination)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'portable TockTeam install and rollback both failed')
      }
      throw error
    }
    return Object.freeze({ backup, destination })
  } finally {
    await rm(pending, { recursive: true, force: true })
    await rm(lock, { recursive: true, force: true })
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Windows portable archive installation requires Windows')
  const { archive, destination } = parseWindowsInstallArgs(process.argv.slice(2))
  const result = await installWindowsPortableArchive({ archive, destination })
  console.log(`Installed TockTeam Desktop archive at ${result.destination}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
