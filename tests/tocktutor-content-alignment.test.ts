import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = '.agents/uiux/tocktutor'
test('compares matching content and includes the installed Claudian assistant', () => {
  const html = readFileSync(`${root}/tocktutor.html`, 'utf8')
  assert.match(html, /Obsidian · Claudian/u)
  const proof = JSON.parse(readFileSync(`${root}/content-alignment.json`, 'utf8'))
  assert.equal(proof.cleanup.verified, true)
  const sources = new Set([...html.matchAll(/<img[^>]*src="screenshots\/([^"]+)"/gu)].map(match => match[1]))
  assert.equal(new Set([...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1])).size, proof.gallery.uniqueImageSources)
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
    if (pair.surface === 'web-viewer') {
      assert.equal(pair.referenceStatus, 'historical-page-fixture')
      assert.equal(pair.sameNoteBytes, false)
      assert.equal(pair.comparisonTarget, 'Example Domain')
      assert.equal(left.visibleState.loadedPage.pageTitle, 'Example Domain')
      assert.equal(left.visibleState.loadedPage.address, 'https://example.com/')
      assert.equal(left.visibleState.webPageVisible, true)
      assert.equal(left.visibleState.loading, false)
      assert.equal(pair.tocktutor.mode, pair.obsidian.mode)
      assert.deepEqual(right, proof.tocktutorGalleryRefresh.previousProof.captures[pair.obsidian.screenshot])
    } else if (pair.surface === 'live-preview') {
      assert.equal(pair.referenceStatus, 'historical-frontmatter-and-filename')
      assert.equal(pair.sameNoteBytes, false)
      assert.equal(pair.sameMarkdownBody, true)
      assert.equal(pair.tocktutor.path, 'comparison.md')
      assert.equal(pair.obsidian.path, 'UIUX Comparison.md')
      assert.equal(left.contentSha256, proof.comparisonNoteRevision.current.contentSha256)
      assert.equal(right.contentSha256, proof.comparisonNoteRevision.previous.contentSha256)
      const source = readFileSync(`${root}/comparison.md`, 'utf8')
      assert.equal(createHash('sha256').update(source.slice(source.indexOf('\n---\n') + 5)).digest('hex'), proof.comparisonNoteRevision.previous.bodySha256)
    } else if (pair.surface === 'note-actions') {
      assert.equal(pair.tocktutor.path, 'comparison.md')
      assert.equal(pair.obsidian.path, 'UIUX Comparison.md')
      assert.equal(pair.referenceStatus, 'historical-filename')
      assert.equal(left.captureScope, 'real-desktop')
      assert.equal(left.route, '/tocktutor/comparison.md')
      assert.equal(left.contentSha256, proof.comparisonNoteRevision.previous.contentSha256)
      assert.equal(proof.menuRefresh.cleanup.verified, true)
      assert.deepEqual(proof.menuRefresh.cleanup.remaining, [])
      assert.match(html, /Obsidian · Note Actions<\/span><span class="badge">Earlier Reference/u)
      assert.doesNotMatch(html, /Focused Capture:|Unwired fixture actions/u)
    } else {
      assert.equal(pair.tocktutor.path, pair.obsidian.path, pair.surface)
    }
    if (!['web-viewer', 'live-preview'].includes(pair.surface)) assert.equal(pair.tocktutor.contentSha256, pair.obsidian.contentSha256, pair.surface)
    assert.equal(pair.tocktutor.mode, pair.obsidian.mode, pair.surface)
  }
})
