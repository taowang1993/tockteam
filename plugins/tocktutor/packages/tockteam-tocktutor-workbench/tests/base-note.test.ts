import assert from 'node:assert/strict'
import test from 'node:test'
import { newBaseNotePath } from '../dist/base-note.js'

test('new Base notes respect Obsidian-style vault, active-file and selected-folder locations', () => {
  const folders = ['Notes', 'Projects/2026']
  assert.equal(newBaseNotePath('Projects/2026/Books.base', 'Review', 'vault', 'Notes', folders), 'Review.md')
  assert.equal(newBaseNotePath('Projects/2026/Books.base', 'Review.md', 'current', 'Notes', folders), 'Projects/2026/Review.md')
  assert.equal(newBaseNotePath('Projects/2026/Books.base', 'Review', 'folder', 'Notes', folders), 'Notes/Review.md')
  assert.equal(newBaseNotePath('Projects/2026/Books.base', 'Review', 'folder', '../escape', folders), null)
  assert.equal(newBaseNotePath('Projects/2026/Books.base', 'Review', 'folder', 'Missing', folders), null)
  assert.equal(newBaseNotePath('Projects/2026/Books.base', '../escape', 'vault', 'Notes', folders), null)
  assert.equal(newBaseNotePath('Projects/2026/Books.base', 'nested/escape', 'current', 'Notes', folders), null)
})
