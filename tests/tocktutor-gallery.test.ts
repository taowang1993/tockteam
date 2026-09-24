import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.agents/uiux/tocktutor')
const html = readFileSync(resolve(root, 'tocktutor.html'), 'utf8')
const proof = JSON.parse(readFileSync(resolve(root, 'content-alignment.json'), 'utf8'))
const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]!)
const links = [...html.matchAll(/<a class="screenshot-link" href="([^"]+)"/gu)].map(match => match[1]!)
const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex')

test('accounts for every gallery and supplemental capture without stale links', () => {
  assert.match(html, /Visual Design Audit · 55 Captures/u)
  assert.match(html, /Built-in Dark Theme · No Active Skin/u)
  assert.doesNotMatch(html, /UIUX Comparison/u)
  assert.equal(new Set(images).size, 55)
  assert.deepEqual(images, links)
  const actual = readdirSync(resolve(root, 'screenshots')).sort()
  assert.deepEqual(actual, proof.gallery.allowlist)
  assert.deepEqual(actual, Object.keys(proof.captures).sort())
  assert.equal(actual.length, 61)
  assert.deepEqual(actual.filter(name => !images.includes(`screenshots/${name}`)), proof.gallery.supplementalCaptures)
  for (const href of [...html.matchAll(/\bhref="([^"]+)"/gu)].map(match => match[1]!)) {
    if (href.startsWith('#')) assert.ok(html.includes(`id="${href.slice(1)}"`), href)
    else if (!href.startsWith('data:')) assert.ok(existsSync(resolve(root, href)), href)
  }
  assert.equal([...html.matchAll(/<span class="badge">Not Applicable<\/span>/gu)].length, 1)
  assert.match(html, /id="assistant"[\s\S]*?Obsidian · Claudian[\s\S]*?obsidian-assistant\.png/u)
  assert.match(html, /id="reviews"[\s\S]*?Not Applicable/u)
})

test('refreshes supplemental captures with verified pixels and honest runtime evidence', () => {
  for (const [name, value] of Object.entries(proof.captures)) {
    const capture = value as { sha256: string; bytes: number; runtimeErrors: string[]; runtimeErrorMonitoring: string }
    const bytes = readFileSync(resolve(root, 'screenshots', name))
    assert.equal(sha256(bytes), capture.sha256, name)
    assert.equal(bytes.length, capture.bytes, name)
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [3024, 1898], name)
    assert.deepEqual(capture.runtimeErrors, [], name)
    assert.ok(capture.runtimeErrorMonitoring.length > 0, name)
  }
  assert.equal(proof.cleanup.verified, true)
  assert.deepEqual(proof.cleanup.remaining, [])
  assert.equal(proof.cleanup.refinement.verified, true)
  assert.deepEqual(proof.cleanup.refinement.remaining, [])
  assert.equal(proof.cleanup.allMatchingProfileProcessesAbsent, true)
  assert.ok(proof.cleanup.pids.length > 0)
  assert.ok(proof.cleanup.focus.every((event: { faulted: boolean; focusInconclusiveCount: number }) => !event.faulted && event.focusInconclusiveCount === 0))
  assert.ok(proof.startupObservations.some((entry: { message: string }) => entry.message.includes('workspaces.startSession')))
})

test('binds shared Markdown and structured documents to the captured content', () => {
  const sharedHash = sha256(readFileSync(resolve(root, 'comparison.md')))
  assert.equal(proof.fixtures['comparison.md'].tocktutor.sha256, sharedHash)
  assert.equal(proof.fixtures['UIUX Comparison.md'].tocktutor.sha256, sharedHash)
  assert.equal(proof.fixtures['UIUX Comparison.md'].obsidian.sha256, sharedHash)
  for (const [name, value] of Object.entries(proof.fixtures)) {
    const fixture = value as { sameBytes: boolean; tocktutor: { sha256: string }; obsidian: { sha256: string } }
    if (name.endsWith('.md') || name.endsWith('.png')) {
      assert.equal(fixture.sameBytes, true, name)
      assert.equal(fixture.tocktutor.sha256, fixture.obsidian.sha256, name)
    }
    if (existsSync(resolve('plugins/tocktutor/parity/fixtures/vault', name))) {
      assert.equal(fixture.tocktutor.sha256, sha256(readFileSync(resolve('plugins/tocktutor/parity/fixtures/vault', name))), name)
    }
  }
  assert.deepEqual(proof.structuredPairs.map((pair: { path: string }) => pair.path), ['Bases/Lessons.base', 'Boards/Lesson.canvas'])
  assert.ok(proof.structuredPairs.every((pair: { sameSemanticContent: boolean; normalization: string }) => pair.sameSemanticContent && pair.normalization.length > 0))
  assert.equal(proof.graphAlignment.local.depth, 2)
  assert.equal(proof.graphAlignment.local.nodeCount, 4)
  assert.equal(proof.graphAlignment.local.nodes.length, 4)
  assert.equal(proof.graphAlignment.global.nodeCount, 8)
  assert.equal(proof.graphAlignment.global.nodes.length, 8)
  assert.ok(proof.graphAlignment.local.nodes.every((path: string) => proof.graphAlignment.global.nodes.includes(path)))
  assert.equal(proof.graphAlignment.obsidianSettings.hideUnresolved, true)
  assert.equal(proof.graphAlignment.obsidianSettings.globalSearch, '-file:Lessons.base')
  assert.ok(proof.pairs.length >= 23)
  for (const pair of proof.pairs) {
    if (['comparison.md', 'UIUX Comparison.md'].includes(pair.tocktutor.path)) assert.equal(pair.tocktutor.contentSha256, sharedHash, pair.surface)
  }
})
