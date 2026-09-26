import { isSafeVaultRelativePath } from './session.ts'
import type { TockTutorSettings } from './settings.ts'

/** Resolve a visible note name against the three Obsidian-style location choices. */
export function newBaseNotePath(
  basePath: string,
  name: string,
  location: TockTutorSettings['newNoteLocation'],
  folder: string,
  folders: readonly string[],
): string | null {
  if (!isSafeVaultRelativePath(basePath) || !/\.base$/iu.test(basePath)) return null
  const trimmed = name.trim()
  const stem = trimmed.replace(/\.md$/iu, '')
  if (stem.length === 0 || stem.length > 240 || stem === '.' || stem === '..' || /[\\/:\u0000-\u001f\u007f]/u.test(stem) || /^\./u.test(stem)) return null
  const parent = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : ''
  const destination = location === 'vault' ? '' : location === 'current' ? parent
    : location === 'folder' && isSafeVaultRelativePath(folder) && folders.includes(folder) ? folder : null
  if (destination === null) return null
  const path = `${destination === '' ? '' : `${destination}/`}${stem}.md`
  return isSafeVaultRelativePath(path) ? path : null
}
