import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = '.agents/uiux/tocktutor'
test('compares matching content and includes the installed Claudian assistant', () => {
  const html = readFileSync(`${root}/tocktutor.html`, 'utf8')
  assert.match(html, /Obsidian · Claudian/u)
  const proof = JSON.parse(readFileSync('.beads/reports/tocktutor-content-alignment.json', 'utf8'))
  assert.equal(proof.cleanup.verified, true)
  const sources = new Set([...html.matchAll(/<img[^>]*src="screenshots\/([^"]+)"/gu)].map(match => match[1]))
  assert.equal(sources.size, proof.gallery.uniqueImageSources)
  for (const name of sources) {
    const capture = proof.captures[name!]
    assert.ok(capture, name)
    const bytes = readFileSync(`${root}/screenshots/${name}`)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256, name)
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [3024, 1898], name)
    assert.deepEqual(capture.geometry, { width: 1512, height: 949, deviceScaleFactor: 2 }, name)
    assert.equal(capture.theme, 'dark', name)
    assert.equal(capture.skin, null, name)
    assert.deepEqual(capture.runtimeErrors, [], name)
  }
  for (const pair of proof.pairs) {
    const left = proof.captures[pair.tocktutor.screenshot]
    const right = proof.captures[pair.obsidian.screenshot]
    assert.equal(left.path, pair.tocktutor.path, pair.surface)
    assert.equal(right.path, pair.obsidian.path, pair.surface)
    assert.equal(left.contentSha256, pair.tocktutor.contentSha256, pair.surface)
    assert.equal(right.contentSha256, pair.obsidian.contentSha256, pair.surface)
    assert.equal(pair.tocktutor.path, pair.obsidian.path, pair.surface)
    assert.equal(pair.tocktutor.contentSha256, pair.obsidian.contentSha256, pair.surface)
    assert.equal(pair.tocktutor.mode, pair.obsidian.mode, pair.surface)
  }
})
