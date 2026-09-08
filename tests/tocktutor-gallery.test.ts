import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'

const galleryPath = resolve('.agents/uiux/tocktutor/tocktutor.html')
const galleryRoot = dirname(galleryPath)
const gallery = readFileSync(galleryPath, 'utf8')
const imageSources = [...gallery.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]!)
const screenshotLinks = [...gallery.matchAll(/<a class="screenshot-link" href="([^"]+)"/gu)].map(match => match[1]!)

test('keeps the TockTutor gallery capture count and screenshot links honest', () => {
  assert.match(gallery, /Visual Design Audit · 50 Captures/u)
  assert.match(gallery, /href="shared-note\.md"/u)
  assert.match(gallery, /href="\.\.\/\.\.\/\.\.\/plugins\/tocktutor\/parity\/fixtures\/vault\/"/u)
  assert.equal(new Set(imageSources).size, 50)
  assert.equal([...gallery.matchAll(/<span class="badge">Not Applicable<\/span>/gu)].length, 2)
  assert.match(gallery, /id="assistant"[\s\S]*?<span class="badge">Not Applicable<\/span>/u)
  assert.match(gallery, /id="reviews"[\s\S]*?<span class="badge">Not Applicable<\/span>/u)
  for (const relativePath of new Set([...imageSources, ...screenshotLinks, 'shared-note.md', '../../../plugins/tocktutor/parity/fixtures/vault'])) {
    assert.equal(existsSync(resolve(galleryRoot, relativePath)), true, relativePath)
  }
})
