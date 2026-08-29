import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { access, copyFile, lstat, mkdir, readFile, realpath, readdir, rename, rm, stat, symlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import {
  normalizePortableManifestPath,
  portablePathContained,
  PORTABLE_RUNTIME_LINK_MAX_ENTRIES,
  WINDOWS_PORTABLE_MARKER,
} from './windows-portable-archive.mjs'

export { WINDOWS_PORTABLE_MARKER }

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

async function readPortableMarker(rootPath) {
  const marker = JSON.parse(await readFile(join(rootPath, WINDOWS_PORTABLE_MARKER), 'utf8'))
  assert(marker !== null && typeof marker === 'object', 'portable marker must be an object')
  assert.equal(marker.schemaVersion, 1, 'portable marker schema is unsupported')
  for (const key of ['appId', 'productName', 'version']) assert.equal(typeof marker[key], 'string', `portable marker metadata is missing ${key}`)
  assert(Array.isArray(marker.runtimeLinks), 'portable runtime-link manifest is missing')
  assert.ok(marker.runtimeLinks.length <= PORTABLE_RUNTIME_LINK_MAX_ENTRIES, 'portable runtime-link manifest exceeds its entry cap')
  return marker
}

async function validateRuntimeLinks(rootPath, marker) {
  const runtimeRoot = runtimeRootPath(rootPath)
  assert.equal((await stat(runtimeRoot)).isDirectory(), true, 'portable runtime root is missing')
  const canonicalRoot = await realpath(runtimeRoot)
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
    const parentReal = await realpath(dirname(linkPath))
    assert.equal(portablePathContained(canonicalRoot, parentReal), true, `portable runtime-link parent escapes runtime root: ${path}`)
    const targetReal = await realpath(targetPath)
    assert.equal(portablePathContained(canonicalRoot, targetReal), true, `portable runtime-link target escapes runtime root: ${path}`)
    const targetStats = await stat(targetPath)
    assert.equal(raw.kind === 'dir' ? targetStats.isDirectory() : targetStats.isFile(), true, `portable runtime-link target kind differs: ${path}`)
    const linkStats = await lstat(linkPath)
    if (linkStats.isSymbolicLink()) {
      assert.equal(await realpath(linkPath), targetReal, `portable runtime-link placeholder target differs: ${path}`)
    } else if (raw.kind === 'dir') {
      assert.equal(linkStats.isDirectory(), true, `portable runtime-link directory placeholder is invalid: ${path}`)
      assert.equal((await readdir(linkPath)).length, 0, `portable runtime-link directory placeholder is nonempty: ${path}`)
    } else {
      assert.equal(linkStats.isFile(), true, `portable runtime-link file placeholder is invalid: ${path}`)
      assert.equal(linkStats.size, 0, `portable runtime-link file placeholder is nonempty: ${path}`)
    }
    entries.push(Object.freeze({ path, target, kind: raw.kind, linkPath, targetPath }))
  }
  entries.sort((left, right) => left.path.localeCompare(right.path))
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].path.startsWith(`${entries[index - 1].path}/`)) throw new Error(`portable runtime-link paths overlap: ${entries[index - 1].path}`)
  }
  return entries
}

export async function restoreWindowsPortableRuntimeLinks(rootPath, options = {}) {
  const marker = await readPortableMarker(rootPath)
  const entries = await validateRuntimeLinks(rootPath, marker)
  const createDirectoryLink = options.createDirectoryLink ?? ((target, path) => symlink(target, path, 'junction'))
  const copyRegularFile = options.copyFile ?? ((target, path) => copyFile(target, path))
  for (const entry of entries) await rm(entry.linkPath, { recursive: true, force: true })
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
  return Object.freeze({ count: entries.length, runtimeRoot: runtimeRootPath(rootPath) })
}

export async function validateWindowsPortableRoot(rootPath, expected) {
  const marker = await readPortableMarker(rootPath)
  assert.equal(marker.version, expected.version)
  assert.equal(marker.appId, expected.appId)
  assert.equal(marker.productName, expected.productName)
  const runtimeRoot = runtimeRootPath(rootPath)
  const appBootPackage = join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'package.json')
  const appBootEntry = join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')
  const appBootMetadata = await readFile(appBootPackage, 'utf8')
  assert.doesNotThrow(() => JSON.parse(appBootMetadata), 'portable DSH app-boot package metadata is invalid')
  assert.equal((await stat(appBootEntry)).isFile(), true, 'portable DSH app-boot entry is missing')
  const executable = join(rootPath, 'win-unpacked', `${expected.productName}.exe`)
  assert.equal((await stat(executable)).isFile(), true, 'portable TockTeam executable is missing')
  return Object.freeze({ marker, executable })
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
