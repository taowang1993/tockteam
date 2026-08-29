#!/usr/bin/env node

import assert from 'node:assert/strict'
import { lstat, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

export const WINDOWS_PORTABLE_MARKER = '.tockteam-portable.json'
export const PORTABLE_MANIFEST_MAX_ENTRIES = 500_000

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

export async function writeWindowsPortableMarker(outputDir, metadata) {
  assert(metadata !== null && typeof metadata === 'object', 'portable marker metadata must be an object')
  const marker = {
    schemaVersion: 1,
    appId: metadata.appId,
    productName: metadata.productName,
    version: metadata.version,
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

export function windowsPortableArchiveArgs({ archive, outputDir, manifestPath }) {
  return Object.freeze(['-a', '-c', '-f', archive, '--no-recursion', '-C', outputDir, '-T', manifestPath])
}
