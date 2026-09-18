import { isSafeVaultRelativePath } from './session.ts'
import type { KeyValueStorage } from './settings.ts'

export const MAX_BOOKMARK_ITEMS = 1_000
export const MAX_BOOKMARK_BYTES = 1_048_576

interface BookmarkBase {
  id: string
  missing?: boolean
  title: string
}

export type Bookmark =
  | (BookmarkBase & { kind: 'note' | 'folder'; path: string })
  | (BookmarkBase & { kind: 'search'; query: string })
  | (BookmarkBase & { kind: 'graph' })
  | (BookmarkBase & { kind: 'heading'; line: number; path: string })
  | (BookmarkBase & { blockId: string; kind: 'block'; path: string })
  | (BookmarkBase & { kind: 'link'; url: string })
  | (BookmarkBase & { children: Exclude<Bookmark, { kind: 'group' }>[]; kind: 'group' })

function key(vaultId: string): string {
  return `tocktutor.bookmarks.v1.${vaultId}`
}

function validBase(value: Record<string, unknown>): BookmarkBase | null {
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.id)) return null
  if (typeof value.title !== 'string' || value.title.trim().length === 0 || value.title.length > 200) return null
  return { id: value.id, ...(value.missing === true ? { missing: true } : {}), title: value.title.trim() }
}

function normalizedLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4_096) return null
  try {
    const url = new URL(/^https?:\/\//iu.test(value) ? value : `https://${value}`)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '') return null
    return url.toString()
  } catch {
    return null
  }
}

function parseBookmark(value: unknown, allowGroup: boolean): Bookmark | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const base = validBase(record)
  if (base === null || typeof record.kind !== 'string') return null
  if (record.kind === 'note' || record.kind === 'folder') {
    return typeof record.path === 'string' && isSafeVaultRelativePath(record.path) ? { ...base, kind: record.kind, path: record.path } : null
  }
  if (record.kind === 'search') {
    return typeof record.query === 'string' && record.query.length > 0 && record.query.length <= 1_000 ? { ...base, kind: 'search', query: record.query } : null
  }
  if (record.kind === 'graph') return { ...base, kind: 'graph' }
  if (record.kind === 'heading') {
    return typeof record.path === 'string' && isSafeVaultRelativePath(record.path) && Number.isSafeInteger(record.line) && (record.line as number) > 0
      ? { ...base, kind: 'heading', line: record.line as number, path: record.path } : null
  }
  if (record.kind === 'block') {
    return typeof record.path === 'string' && isSafeVaultRelativePath(record.path)
      && typeof record.blockId === 'string' && /^[A-Za-z0-9-]{1,200}$/u.test(record.blockId)
      ? { ...base, blockId: record.blockId, kind: 'block', path: record.path } : null
  }
  if (record.kind === 'link') {
    const url = normalizedLink(record.url)
    return url === null ? null : { ...base, kind: 'link', url }
  }
  if (record.kind === 'group' && allowGroup && Array.isArray(record.children) && record.children.length <= MAX_BOOKMARK_ITEMS) {
    const children: Exclude<Bookmark, { kind: 'group' }>[] = []
    for (const child of record.children) {
      const parsed = parseBookmark(child, false)
      if (parsed === null || parsed.kind === 'group') return null
      children.push(parsed)
    }
    return { ...base, children, kind: 'group' }
  }
  return null
}

function flattenCount(bookmarks: readonly Bookmark[]): number {
  return bookmarks.reduce((count, bookmark) => count + 1 + (bookmark.kind === 'group' ? bookmark.children.length : 0), 0)
}

export function loadBookmarks(storage: KeyValueStorage, vaultId: string): Bookmark[] {
  if (!/^vault:[0-9a-f]{64}$/u.test(vaultId)) return []
  try {
    const raw = storage.getItem(key(vaultId))
    if (raw === null || new TextEncoder().encode(raw).byteLength > MAX_BOOKMARK_BYTES) return []
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const bookmarks: Bookmark[] = []
    const ids = new Set<string>()
    for (const candidate of value) {
      const bookmark = parseBookmark(candidate, true)
      if (bookmark === null || ids.has(bookmark.id)) continue
      if (flattenCount([...bookmarks, bookmark]) > MAX_BOOKMARK_ITEMS) break
      ids.add(bookmark.id)
      bookmarks.push(bookmark)
    }
    return bookmarks
  } catch {
    return []
  }
}

export function saveBookmarks(storage: KeyValueStorage, vaultId: string, bookmarks: readonly Bookmark[]): boolean {
  if (!/^vault:[0-9a-f]{64}$/u.test(vaultId) || flattenCount(bookmarks) > MAX_BOOKMARK_ITEMS) return false
  const parsed = bookmarks.map(bookmark => parseBookmark(bookmark, true))
  if (parsed.some(bookmark => bookmark === null)) return false
  try {
    const raw = JSON.stringify(parsed)
    if (new TextEncoder().encode(raw).byteLength > MAX_BOOKMARK_BYTES) return false
    storage.setItem(key(vaultId), raw)
    return true
  } catch {
    return false
  }
}

export function addBookmark(bookmarks: readonly Bookmark[], bookmark: Bookmark): Bookmark[] {
  const parsed = parseBookmark(bookmark, true)
  if (parsed === null) throw new Error(bookmark.kind === 'link' ? 'Bookmark URL is invalid.' : 'Bookmark is invalid.')
  const next = [...bookmarks.filter(candidate => candidate.id !== parsed.id), parsed]
  if (flattenCount(next) > MAX_BOOKMARK_ITEMS) throw new Error('Bookmark capacity is full.')
  return next
}

function remap(path: string, fromPath: string, toPath: string): string {
  return path === fromPath ? toPath : path.startsWith(`${fromPath}/`) ? `${toPath}${path.slice(fromPath.length)}` : path
}

export function remapBookmarks(bookmarks: readonly Bookmark[], fromPath: string, toPath: string): Bookmark[] {
  if (!isSafeVaultRelativePath(fromPath) || !isSafeVaultRelativePath(toPath)) return [...bookmarks]
  const one = (bookmark: Bookmark): Bookmark => {
    if (bookmark.kind === 'group') return { ...bookmark, children: bookmark.children.map(child => one(child) as Exclude<Bookmark, { kind: 'group' }>) }
    if ('path' in bookmark) return { ...bookmark, path: remap(bookmark.path, fromPath, toPath) }
    return { ...bookmark }
  }
  return bookmarks.map(one)
}
