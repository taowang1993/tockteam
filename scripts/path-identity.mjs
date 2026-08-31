import { realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

function pathParts(candidatePath) {
  if (typeof candidatePath !== 'string' || candidatePath.length === 0) return undefined
  try {
    return { current: resolve(candidatePath), suffix: [] }
  } catch {
    return undefined
  }
}

function missingPath(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR'
}

function appendSuffix(base, suffix) {
  return suffix.length === 0 ? base : join(base, ...suffix)
}

export function canonicalPathSync(candidatePath) {
  const parts = pathParts(candidatePath)
  if (parts === undefined) return undefined
  while (true) {
    try {
      return appendSuffix(realpathSync.native(parts.current), parts.suffix)
    } catch (error) {
      if (!missingPath(error)) return undefined
      const parent = dirname(parts.current)
      if (parent === parts.current) return undefined
      parts.suffix.unshift(basename(parts.current))
      parts.current = parent
    }
  }
}

export async function canonicalPath(candidatePath) {
  const parts = pathParts(candidatePath)
  if (parts === undefined) return undefined
  while (true) {
    try {
      return appendSuffix(await realpath(parts.current), parts.suffix)
    } catch (error) {
      if (!missingPath(error)) return undefined
      const parent = dirname(parts.current)
      if (parent === parts.current) return undefined
      parts.suffix.unshift(basename(parts.current))
      parts.current = parent
    }
  }
}

function relativeContained(rootPath, candidatePath) {
  if (typeof rootPath !== 'string' || typeof candidatePath !== 'string') return false
  const child = relative(rootPath, candidatePath)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child) && !child.includes(':'))
}

export function pathContainedSync(rootPath, candidatePath) {
  const canonicalRoot = canonicalPathSync(rootPath)
  const canonicalCandidate = canonicalPathSync(candidatePath)
  return canonicalRoot !== undefined
    && canonicalCandidate !== undefined
    && relativeContained(canonicalRoot, canonicalCandidate)
}

export async function pathContained(rootPath, candidatePath) {
  const [canonicalRoot, canonicalCandidate] = await Promise.all([canonicalPath(rootPath), canonicalPath(candidatePath)])
  return canonicalRoot !== undefined
    && canonicalCandidate !== undefined
    && relativeContained(canonicalRoot, canonicalCandidate)
}
