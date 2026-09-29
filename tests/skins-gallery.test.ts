import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.agents/uiux/skins')
const choices = [
  ['default', 'Default', null],
  ['cyan', 'Cyan', 'tockteam-skin-deep-current'],
  ['aurora', 'Aurora', 'tockteam-skin-jade-circuit'],
  ['ember-dusk', 'Ember Dusk', 'tockteam-skin-ember-dusk'],
] as const

test('shows four skin rows with verified Light-left and Dark-right captures', () => {
  const html = readFileSync(resolve(root, 'skins.html'), 'utf8')
  const proof = JSON.parse(readFileSync(resolve(root, 'proof.json'), 'utf8'))
  const sections = [...html.matchAll(/<section class="surface" id="([^"]+)">([\s\S]*?)<\/section>/gu)]
  assert.deepEqual(sections.map(([, id]) => id), choices.map(([id]) => id))
  for (const [, href] of html.matchAll(/\bhref="([^"]+)"/gu)) {
    if (href!.startsWith('#')) assert.ok(html.includes(`id="${href!.slice(1)}"`), href)
    else if (!href!.startsWith('data:')) assert.ok(existsSync(resolve(root, href!)), href)
  }
  assert.deepEqual(proof.viewport, [1512, 949, 2])
  assert.deepEqual(proof.pixels, [3024, 1898])
  assert.equal(proof.route, '/settings')
  assert.equal(proof.cleanup.stopped, true)
  assert.ok(proof.cleanup.rootPid > 0)
  assert.deepEqual(proof.cleanup.remaining, [])
  assert.deepEqual(proof.galleryCheck.desktop, [1512, 949, 2])
  assert.deepEqual(proof.galleryCheck.mobile, [390, 844, 2])
  assert.equal(proof.galleryCheck.loadedImages, 8)
  assert.deepEqual(proof.galleryCheck.runtimeErrors, [])
  for (const owned of [proof.galleryCheck.browser, proof.galleryCheck.server]) {
    assert.equal(owned.stopped, true)
    assert.ok(owned.rootPid > 0)
    assert.deepEqual(owned.remaining, [])
  }
  const filenames = choices.flatMap(([id]) => [`${id}-light.png`, `${id}-dark.png`])
  assert.deepEqual(readdirSync(resolve(root, 'screenshots')).sort(), filenames.slice().sort())
  assert.deepEqual(proof.captures.map((capture: { file: string }) => capture.file), filenames)
  for (const [index, [id, label, skinId]] of choices.entries()) {
    const section = sections[index]![2]!
    assert.ok(section.includes(`<h2>${label}</h2>`), label)
    const pairs = [...section.matchAll(/<a class="screenshot-link" href="screenshots\/([^"]+)"><img\b[^>]*\bsrc="screenshots\/([^"]+)"[^>]*>/gu)]
    assert.deepEqual(pairs.map(([, href, src]) => [href, src]), [['light', 'light'], ['dark', 'dark']].map(([mode]) => [`${id}-${mode}.png`, `${id}-${mode}.png`]))
    for (const mode of ['light', 'dark']) {
      const file = `${id}-${mode}.png`
      const bytes = readFileSync(resolve(root, 'screenshots', file))
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file)
      assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [3024, 1898], file)
      const capture = proof.captures.find((entry: { file: string }) => entry.file === file)
      assert.ok(capture, file)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256, file)
      assert.equal(capture.family, label, file)
      assert.equal(capture.skinId, skinId, file)
      assert.equal(capture.mode, mode, file)
      assert.equal(capture.system, mode === 'light' ? 'dark' : 'light', file)
      assert.equal(capture.route, '/settings', file)
      assert.equal(capture.selected, true, file)
      assert.ok(capture.contrast >= 4.5, file)
      assert.equal(capture.allCardsVerified, true, file)
      assert.equal(capture.preview?.name, label, file)
      assert.match(capture.preview.light, /^background:/u, file)
      assert.match(capture.preview.dark, /^background:/u, file)
      assert.notEqual(capture.preview.light, capture.preview.dark, file)
      assert.deepEqual(capture.errors, [], file)
    }
    const pair = proof.captures.filter((capture: { family: string }) => capture.family === label)
    assert.deepEqual(pair[0].preview, pair[1].preview, `${label} preview does not change with Appearance`)
  }
})
