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
  assert.match(gallery, /Visual Design Audit · 45 Captures/u)
  assert.equal(new Set(imageSources).size, 45)
  for (const relativePath of new Set([...imageSources, ...screenshotLinks])) {
    assert.equal(existsSync(resolve(galleryRoot, relativePath)), true, relativePath)
  }
})
