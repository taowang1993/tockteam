import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addBookmark,
  loadBookmarks,
  remapBookmarks,
  saveBookmarks,
  type Bookmark,
} from '../dist/bookmarks.js'
import type { KeyValueStorage } from '../dist/settings.js'

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const vault = `vault:${'a'.repeat(64)}`

test('stores bounded per-vault note, folder, search, graph, heading, block, and safe link bookmarks', () => {
  const storage = new MemoryStorage()
  let bookmarks: Bookmark[] = []
  for (const bookmark of [
    { id: 'note', kind: 'note', path: 'Notes/A.md', title: 'A' },
    { id: 'folder', kind: 'folder', path: 'Notes', title: 'Notes' },
    { id: 'search', kind: 'search', query: 'tag:lesson', title: 'Lessons' },
    { id: 'graph', kind: 'graph', title: 'Graph' },
    { id: 'heading', kind: 'heading', line: 3, path: 'Notes/A.md', title: 'Part' },
    { id: 'block', blockId: 'target', kind: 'block', path: 'Notes/A.md', title: 'Target' },
    { id: 'link', kind: 'link', title: 'Web', url: 'https://example.com/' },
  ] as const) bookmarks = addBookmark(bookmarks, bookmark)
  assert.equal(bookmarks.length, 7)
  assert.equal(saveBookmarks(storage, vault, bookmarks), true)
  assert.deepEqual(loadBookmarks(storage, vault), bookmarks)
  assert.equal(loadBookmarks(storage, `vault:${'b'.repeat(64)}`).length, 0)
  assert.throws(() => addBookmark(bookmarks, { id: 'bad', kind: 'link', title: 'Bad', url: 'https://user:secret@example.com/' }), /URL/u)
})

test('remaps supported note, folder, heading, and block targets without hiding missing bookmarks', () => {
  const bookmarks: Bookmark[] = [
    { id: 'folder', kind: 'folder', path: 'Lessons', title: 'Lessons' },
    { id: 'note', kind: 'note', path: 'Lessons/A.md', title: 'A' },
    { id: 'heading', kind: 'heading', line: 2, path: 'Lessons/A.md', title: 'Part' },
    { id: 'missing', kind: 'note', missing: true, path: 'Missing.md', title: 'Missing' },
  ]
  assert.deepEqual(remapBookmarks(bookmarks, 'Lessons', 'Archive/Lessons'), [
    { id: 'folder', kind: 'folder', path: 'Archive/Lessons', title: 'Lessons' },
    { id: 'note', kind: 'note', path: 'Archive/Lessons/A.md', title: 'A' },
    { id: 'heading', kind: 'heading', line: 2, path: 'Archive/Lessons/A.md', title: 'Part' },
    { id: 'missing', kind: 'note', missing: true, path: 'Missing.md', title: 'Missing' },
  ])
})

test('fails malformed nested groups and excessive local state closed', () => {
  const storage = new MemoryStorage()
  storage.setItem(`tocktutor.bookmarks.v1.${vault}`, JSON.stringify([
    { id: 'group', kind: 'group', title: 'Top', children: [{ id: 'nested', kind: 'group', title: 'Nested', children: [] }] },
    { id: 'valid', kind: 'note', path: 'A.md', title: 'A' },
  ]))
  assert.deepEqual(loadBookmarks(storage, vault), [{ id: 'valid', kind: 'note', path: 'A.md', title: 'A' }])
})
