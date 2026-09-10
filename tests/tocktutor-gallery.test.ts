import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'

const galleryPath = resolve('.agents/uiux/tocktutor/tocktutor.html')
const galleryRoot = dirname(galleryPath)
const gallery = readFileSync(galleryPath, 'utf8')
const proof = JSON.parse(readFileSync(resolve('.beads/reports/tocktutor-utility-proof.json'), 'utf8')) as {
  reading: { tockTutor: { containsGeneratedUntitled?: boolean; copiedVaultIdentity?: string; treePaths?: string[] } }
  attachmentsEmbeds: { obsidian?: { directAttachmentPanelCapture?: boolean } }
  affectedRecapture: { copiedVaultIdentity?: string; surfaces: { noteActions: { menuLabels: string[] }; workspacesPanes: { comparability?: string }; newNote: { captureState?: string; copiedVaultIdentity?: string; collisionIsolation?: string }; search: { geometry: { css: { width: number; height: number }; pixels: { width: number; height: number } }; theme: { activeSkin: string | null; backgroundMatchesSidebar: boolean; themePreference: string } } } }
  neutralThemeRecapture: {
    geometry: { css: { width: number; height: number; deviceScaleFactor: number }; pixels: { width: number; height: number } }
    requestedSurfaces: number[]
    screenshots: Record<string, { bytes: number; sha256: string; surfaces: number[] }>
    theme: { activeSkin: string | null; base: string; themePreference: string }
    verification: { cleanupVerified: boolean; runtimeErrorsAtCapture: number; visibleStatesVerified: boolean }
  }
}
const imageSources = [...gallery.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]!)
const screenshotLinks = [...gallery.matchAll(/<a class="screenshot-link" href="([^"]+)"/gu)].map(match => match[1]!)

test('keeps the TockTutor gallery capture count and screenshot links honest', () => {
  assert.match(gallery, /Visual Design Audit · 51 Captures/u)
  assert.match(gallery, /Built-in Dark Theme · No Active Skin/u)
  assert.match(gallery, /href="shared-note\.md"/u)
  assert.match(gallery, /href="\.\.\/\.\.\/\.\.\/plugins\/tocktutor\/parity\/fixtures\/vault\/"/u)
  assert.equal(new Set(imageSources).size, 51)
  assert.match(gallery, /id="polish"[\s\S]*?screenshots\/tocktutor-checkbox-tab-polish\.png/u)
  const polishCapture = readFileSync(resolve(galleryRoot, 'screenshots/tocktutor-checkbox-tab-polish.png'))
  assert.deepEqual({ width: polishCapture.readUInt32BE(16), height: polishCapture.readUInt32BE(20) }, { width: 3024, height: 1898 })
  assert.equal([...gallery.matchAll(/<span class="badge">Not Applicable<\/span>/gu)].length, 2)
  assert.match(gallery, /id="assistant"[\s\S]*?<span class="badge">Not Applicable<\/span>/u)
  assert.match(gallery, /id="reviews"[\s\S]*?<span class="badge">Not Applicable<\/span>/u)
  assert.match(gallery, /TockTutor · New Note Result/u)
  assert.match(gallery, /Obsidian · New Note Result/u)
  assert.match(gallery, /TockTutor · Reading Embed/u)
  assert.match(gallery, /TockTutor · Attachments Utility Panel[\s\S]*?Additional Surface/u)
  assert.match(gallery, /Post-create opened and focused <code>Untitled<\/code> note/u)
  assert.equal(proof.reading.tockTutor.containsGeneratedUntitled, false)
  assert.equal(proof.reading.tockTutor.copiedVaultIdentity, 'TockTutor Parity Fixture')
  assert.equal(proof.affectedRecapture.copiedVaultIdentity, 'TockTutor Parity Fixture')
  assert.deepEqual(proof.reading.tockTutor.treePaths, ['Notes/Welcome.md', 'Imports/Imported.md', 'Notes/Alias Target.md'])
  assert.equal(proof.attachmentsEmbeds.obsidian?.directAttachmentPanelCapture, undefined)
  assert.equal(proof.affectedRecapture.surfaces.workspacesPanes.comparability, 'approximate')
  assert.equal(proof.affectedRecapture.surfaces.newNote.captureState, 'post-create opened and focused Untitled note, phase-matched with Obsidian Untitled result')
  assert.equal(proof.affectedRecapture.surfaces.newNote.copiedVaultIdentity, 'TockTutor Parity Fixture')
  assert.equal(proof.affectedRecapture.surfaces.newNote.collisionIsolation, 'fresh temporary vault had no pre-existing Notes/Untitled.md')
  assert.equal(proof.affectedRecapture.surfaces.noteActions.menuLabels.includes('Backlinks in Document'), true)
  assert.deepEqual(proof.affectedRecapture.surfaces.search.geometry, {
    css: { width: 1512, height: 949, deviceScaleFactor: 2 },
    pixels: { width: 3024, height: 1898 },
  })
  assert.deepEqual({
    themePreference: proof.affectedRecapture.surfaces.search.theme.themePreference,
    activeSkin: proof.affectedRecapture.surfaces.search.theme.activeSkin,
    backgroundMatchesSidebar: proof.affectedRecapture.surfaces.search.theme.backgroundMatchesSidebar,
  }, { themePreference: 'dark', activeSkin: null, backgroundMatchesSidebar: true })
  const searchCapture = readFileSync(resolve(galleryRoot, 'screenshots/tocktutor-search.png'))
  assert.deepEqual({ width: searchCapture.readUInt32BE(16), height: searchCapture.readUInt32BE(20) }, { width: 3024, height: 1898 })
  assert.doesNotMatch(gallery, /approved extended-display geometry|Current · Extended Display|data-geometry="extended-display"|1366 × 994 CSS-pixel extended-display geometry/u)
  assert.deepEqual(proof.neutralThemeRecapture.requestedSurfaces, [2, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 22, 23, 24])
  assert.deepEqual(proof.neutralThemeRecapture.geometry, {
    css: { width: 1512, height: 949, deviceScaleFactor: 2 },
    pixels: { width: 3024, height: 1898 },
  })
  assert.deepEqual(proof.neutralThemeRecapture.theme, { themePreference: 'dark', activeSkin: null, base: '#151517' })
  assert.deepEqual(proof.neutralThemeRecapture.verification, { runtimeErrorsAtCapture: 0, visibleStatesVerified: true, cleanupVerified: true })
  assert.equal(Object.keys(proof.neutralThemeRecapture.screenshots).length, 18)
  for (const [name, record] of Object.entries(proof.neutralThemeRecapture.screenshots)) {
    const capture = readFileSync(resolve(galleryRoot, 'screenshots', name))
    assert.deepEqual({ width: capture.readUInt32BE(16), height: capture.readUInt32BE(20) }, { width: 3024, height: 1898 }, name)
    assert.equal(capture.length, record.bytes, name)
    assert.equal(`sha256:${createHash('sha256').update(capture).digest('hex')}`, record.sha256, name)
  }
  for (const relativePath of new Set([...imageSources, ...screenshotLinks, 'shared-note.md', '../../../plugins/tocktutor/parity/fixtures/vault'])) {
    assert.equal(existsSync(resolve(galleryRoot, relativePath)), true, relativePath)
  }
})
