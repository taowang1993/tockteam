import {
  constants as fsConstants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import type { Stats } from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'

/** Legacy Desktop user-data directory used by packaged TockTeam upgrades. */
export const LEGACY_DESKTOP_DATA_DIRECTORY = 'Oh-DSH-Desktop'

/** Legacy Desktop user-data directory used by development TockTeam upgrades. */
export const LEGACY_DESKTOP_DEV_DATA_DIRECTORY = 'Oh-DSH-Desktop-Dev'

const MIGRATIONS_DIRECTORY = '.migrations'
const DESKTOP_MIGRATION = 'desktop-state-v1.complete'

/** Outcome of a legacy-state migration attempt. */
export interface LegacyStateMigrationResult {
  complete: boolean
  migrated: boolean
}

const NO_MIGRATION: LegacyStateMigrationResult = {
  complete: true,
  migrated: false,
}

const INCOMPLETE_MIGRATION: LegacyStateMigrationResult = {
  complete: false,
  migrated: false,
}

/** Resolve the pre-rename Desktop root for one Electron app-data directory. */
export function desktopLegacyDataRoot(
  appDataRoot: string,
  isPackaged: boolean,
): string {
  return join(
    appDataRoot,
    isPackaged
      ? LEGACY_DESKTOP_DATA_DIRECTORY
      : LEGACY_DESKTOP_DEV_DATA_DIRECTORY,
  )
}

function lstat(path: string): Stats | undefined {
  try {
    return lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function followedStat(path: string): Stats | undefined {
  try {
    return statSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function containsPath(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate)
  return (
    child !== '' &&
    child !== '..' &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  )
}

function overlaps(left: string, right: string): boolean {
  return (
    left === right || containsPath(left, right) || containsPath(right, left)
  )
}

interface CopyRoots {
  destination: string
  source: string
}

function relocatedLinkTarget(
  source: string,
  destination: string,
  roots: CopyRoots,
): { absolute: string; posix: string } | undefined {
  const targetStat = followedStat(source)
  if (targetStat === undefined) return undefined

  const original = readlinkSync(source)
  const canonicalTarget = realpathSync(source)
  if (canonicalTarget === roots.source) return undefined
  const movesWithTree = containsPath(roots.source, canonicalTarget)
  const absolute = movesWithTree
    ? join(roots.destination, relative(roots.source, canonicalTarget))
    : canonicalTarget
  const posix =
    !movesWithTree && isAbsolute(original)
      ? original
      : relative(realpathSync(dirname(destination)), absolute) || '.'
  return { absolute, posix }
}

function copyEntry(
  source: string,
  destination: string,
  roots: CopyRoots,
): boolean {
  const sourceStat = lstat(source)
  if (sourceStat === undefined) return true

  // Destination state is authoritative, including an existing link or a
  // different entry type. Never replace user-owned current state.
  const destinationStat = lstat(destination)
  if (destinationStat !== undefined && !sourceStat.isDirectory()) return true
  if (sourceStat.isDirectory()) {
    if (destinationStat !== undefined && !destinationStat.isDirectory())
      return true
    try {
      mkdirSync(destination, {
        recursive: true,
        mode: sourceStat.mode & 0o777,
      })
      for (const entry of readdirSync(source)) {
        if (!copyEntry(join(source, entry), join(destination, entry), roots))
          return false
      }
      return true
    } catch {
      return false
    }
  }

  if (destinationStat !== undefined) return true
  try {
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
    if (sourceStat.isFile()) {
      copyFileSync(source, destination, fsConstants.COPYFILE_EXCL)
      return true
    }
    if (!sourceStat.isSymbolicLink()) return false

    const linkTarget = relocatedLinkTarget(source, destination, roots)
    if (linkTarget === undefined) return false
    if (process.platform === 'win32') {
      if (followedStat(source)?.isDirectory() === true) {
        symlinkSync(linkTarget.absolute, destination, 'junction')
      } else if (followedStat(source)?.isFile() === true) {
        copyFileSync(source, destination, fsConstants.COPYFILE_EXCL)
      } else {
        return false
      }
    } else {
      symlinkSync(
        linkTarget.posix,
        destination,
        followedStat(source)?.isDirectory() === true ? 'dir' : 'file',
      )
    }
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EEXIST'
      ? lstat(destination) !== undefined
      : false
  }
}

function migrationMarker(root: string): string {
  return join(root, MIGRATIONS_DIRECTORY, DESKTOP_MIGRATION)
}

function hasCompleteMarker(root: string): boolean | undefined {
  const migrations = lstat(join(root, MIGRATIONS_DIRECTORY))
  if (migrations?.isDirectory() === false) return undefined
  const marker = lstat(migrationMarker(root))
  if (marker === undefined) return false
  if (!marker.isFile()) return undefined
  try {
    return readFileSync(migrationMarker(root), 'utf8') === 'complete\n'
      ? true
      : undefined
  } catch {
    return undefined
  }
}

function realpathWithMissing(path: string): string {
  const missing: string[] = []
  let current = resolve(path)
  while (lstat(current) === undefined) {
    const parent = dirname(current)
    if (parent === current) return resolve(path)
    missing.unshift(basename(current))
    current = parent
  }
  return join(realpathSync(current), ...missing)
}

/** Copy one directory tree without replacing destination entries. */
export function copyDirectoryContents(
  source: string,
  destination: string,
  options: { exclude?: ReadonlySet<string> } = {},
): boolean {
  const sourceStat = followedStat(source)
  if (sourceStat === undefined || !sourceStat.isDirectory()) return false

  try {
    const sourceRoot = realpathSync(source)
    const destinationStat = lstat(destination)
    if (destinationStat?.isSymbolicLink() === true) return false
    const destinationCandidate = realpathWithMissing(destination)
    if (overlaps(sourceRoot, destinationCandidate)) return false
    mkdirSync(destination, { recursive: true, mode: 0o700 })
    const destinationRoot = realpathSync(destination)
    if (overlaps(sourceRoot, destinationRoot)) return false
    const roots = { destination: destinationRoot, source: sourceRoot }
    for (const entry of readdirSync(source)) {
      if (options.exclude?.has(entry) === true) continue
      if (!copyEntry(join(source, entry), join(destination, entry), roots))
        return false
    }
    return true
  } catch {
    return false
  }
}

function writeCompleteMarker(root: string): boolean {
  const marker = migrationMarker(root)
  try {
    if (lstat(root)?.isDirectory() !== true) return false
    const migrations = join(root, MIGRATIONS_DIRECTORY)
    const migrationsStat = lstat(migrations)
    if (migrationsStat?.isDirectory() === false) return false
    mkdirSync(migrations, { recursive: true, mode: 0o700 })
    writeFileSync(marker, 'complete\n', {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false
    return hasCompleteMarker(root) === true
  }
}

/**
 * Recover a pre-rename Desktop user-data directory without changing the
 * current root contract. Existing destination entries win and the source is
 * never removed. A completion marker is written only after every entry copies.
 */
export function migrateLegacyDesktopState(input: {
  appDataRoot: string
  destinationRoot: string
  isPackaged: boolean
  skipDefaultImport?: boolean
}): LegacyStateMigrationResult {
  if (input.skipDefaultImport === true) return NO_MIGRATION

  const markerState = hasCompleteMarker(input.destinationRoot)
  if (markerState === true) return NO_MIGRATION
  if (markerState === undefined) return INCOMPLETE_MIGRATION

  const source = desktopLegacyDataRoot(input.appDataRoot, input.isPackaged)
  const sourceStat = lstat(source)
  if (sourceStat === undefined) return NO_MIGRATION
  if (sourceStat.isSymbolicLink() && followedStat(source) === undefined)
    return INCOMPLETE_MIGRATION
  if (!sourceStat.isDirectory() && !sourceStat.isSymbolicLink())
    return INCOMPLETE_MIGRATION

  const sourcePath = resolve(source)
  const destinationPath = resolve(input.destinationRoot)
  if (overlaps(sourcePath, destinationPath)) return INCOMPLETE_MIGRATION
  if (!copyDirectoryContents(source, input.destinationRoot, {
    exclude: new Set([MIGRATIONS_DIRECTORY]),
  })) {
    return INCOMPLETE_MIGRATION
  }
  if (!writeCompleteMarker(input.destinationRoot)) return INCOMPLETE_MIGRATION
  return { complete: true, migrated: true }
}
