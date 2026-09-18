#!/usr/bin/env node

import assert from 'node:assert/strict'
import { lstat, readlink, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const WINDOWS_PORTABLE_MARKER = '.tockteam-portable.json'
export const PORTABLE_MANIFEST_MAX_ENTRIES = 500_000
export const PORTABLE_RUNTIME_LINK_MAX_ENTRIES = 100_000

export function normalizePortableManifestPath(candidate) {
  if (typeof candidate !== 'string' || candidate === '') throw new Error('portable manifest paths must be non-empty relative paths')
  if (candidate.includes('\0') || candidate.includes('\n') || candidate.includes('\r')) throw new Error('portable manifest paths cannot contain newlines or NUL bytes')
  const normalized = candidate.replaceAll('\\', '/')
  const segments = normalized.split('/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized) || segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`portable manifest path must be relative: ${candidate}`)
  }
  return normalized
}

export function portablePathContained(rootPath, candidate) {
  const candidateRelative = relative(rootPath, candidate)
  return candidateRelative !== '' && !isAbsolute(candidateRelative) && candidateRelative !== '..' && !candidateRelative.startsWith(`..${sep}`)
}

export async function collectWindowsPortableRuntimeLinks(runtimeRoot, { maxEntries = PORTABLE_RUNTIME_LINK_MAX_ENTRIES, packagedRuntimeRoot = undefined } = {}) {
  assert(Number.isSafeInteger(maxEntries) && maxEntries > 0, 'portable runtime-link entry cap must be a positive safe integer')
  const rootPath = resolve(runtimeRoot)
  const packagedRoot = packagedRuntimeRoot === undefined ? undefined : resolve(packagedRuntimeRoot)
  assert.equal((await stat(rootPath)).isDirectory(), true, 'portable runtime root must be a directory')
  const canonicalRoot = await realpath(rootPath)
  const links = []
  const walk = async path => {
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) {
      const link = relative(rootPath, path).replaceAll(sep, '/')
      const target = resolve(dirname(path), await readlink(path))
      if (!portablePathContained(rootPath, target)) throw new Error(`portable runtime link target escapes runtime root: ${link}`)
      const targetRelative = normalizePortableManifestPath(relative(rootPath, target))
      const targetReal = await realpath(target)
      if (!portablePathContained(canonicalRoot, targetReal)) throw new Error(`portable runtime link target escapes runtime root: ${link}`)
      const targetMetadata = await stat(target)
      const kind = targetMetadata.isDirectory() ? 'dir' : targetMetadata.isFile() ? 'file' : undefined
      if (kind === undefined) throw new Error(`portable runtime link target has unsupported type: ${link}`)
      const normalizedLink = normalizePortableManifestPath(link)
      if (packagedRoot !== undefined) {
        try {
          await lstat(resolve(packagedRoot, ...normalizedLink.split('/')))
          await stat(resolve(packagedRoot, ...targetRelative.split('/')))
        } catch {
          // electron-builder omits optional pnpm alias entries whose targets are
          // not shipped; only repair links represented by the archive payload.
          return
        }
      }
      if (links.length >= maxEntries) throw new Error(`portable runtime-link manifest exceeds ${String(maxEntries)} entries`)
      links.push(Object.freeze({ path: normalizedLink, target: targetRelative, kind }))
      return
    }
    if (!metadata.isDirectory()) return
    const children = await readdir(path, { withFileTypes: true })
    children.sort((left, right) => left.name.localeCompare(right.name))
    for (const child of children) await walk(join(path, child.name))
  }
  await walk(rootPath)
  links.sort((left, right) => left.path.localeCompare(right.path))
  return Object.freeze(links)
}

export async function writeWindowsPortableMarker(outputDir, metadata, { runtimeRoot = join(resolve(outputDir), 'win-unpacked', 'resources', 'dsh-runtime'), packagedRuntimeRoot = undefined } = {}) {
  assert(metadata !== null && typeof metadata === 'object', 'portable marker metadata must be an object')
  const marker = {
    schemaVersion: 1,
    appId: metadata.appId,
    productName: metadata.productName,
    version: metadata.version,
    runtimeLinks: await collectWindowsPortableRuntimeLinks(runtimeRoot, { packagedRuntimeRoot }),
  }
  for (const key of ['appId', 'productName', 'version']) assert.equal(typeof marker[key], 'string', `portable marker metadata is missing ${key}`)
  const markerPath = join(resolve(outputDir), WINDOWS_PORTABLE_MARKER)
  await writeFile(markerPath, `${JSON.stringify(marker)}\n`, 'utf8')
  return markerPath
}

export async function writeWindowsPortableManifest(outputDir, manifestPath, { maxEntries = PORTABLE_MANIFEST_MAX_ENTRIES } = {}) {
  assert(Number.isSafeInteger(maxEntries) && maxEntries > 0, 'portable manifest entry cap must be a positive safe integer')
  const outputRoot = resolve(outputDir)
  const entries = []
  const seen = new Set()
  const add = path => {
    const entry = normalizePortableManifestPath(relative(outputRoot, path))
    if (seen.has(entry)) return
    if (entries.length >= maxEntries) throw new Error(`portable manifest exceeds ${String(maxEntries)} entries`)
    seen.add(entry)
    entries.push(entry)
  }
  const walk = async path => {
    const entry = normalizePortableManifestPath(relative(outputRoot, path))
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) {
      add(path)
      return
    }
    if (metadata.isDirectory()) {
      add(path)
      const children = await readdir(path, { withFileTypes: true })
      children.sort((left, right) => left.name.localeCompare(right.name))
      for (const child of children) await walk(join(path, child.name))
    } else if (metadata.isFile()) {
      add(path)
    } else {
      throw new Error(`portable manifest cannot archive unsupported entry: ${entry}`)
    }
  }
  await walk(join(outputRoot, 'win-unpacked'))
  const markerPath = join(outputRoot, WINDOWS_PORTABLE_MARKER)
  const marker = await lstat(markerPath)
  if (!marker.isFile() || marker.isSymbolicLink()) throw new Error('portable marker must be a regular file')
  add(markerPath)
  await writeFile(manifestPath, `${entries.join('\n')}\n`, 'utf8')
  return Object.freeze(entries)
}

export async function writeWindowsPortableArchiveMetadata(outputDir, metadata, manifestPath, options = {}) {
  const markerPath = await writeWindowsPortableMarker(outputDir, metadata, options)
  const entries = await writeWindowsPortableManifest(outputDir, manifestPath, options)
  return Object.freeze({ markerPath, entries })
}

export function windowsPortableArchiveArgs({ archive, outputDir, manifestPath }) {
  return Object.freeze(['-a', '-c', '-f', archive, '--no-recursion', '-C', outputDir, '-T', manifestPath])
}
