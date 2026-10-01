import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { TOCKTEAM_SKINS } from '../plugins/skins/src/skins.ts'

const root = resolve('.agents/uiux/tocktutor')
const html = readFileSync(resolve(root, 'tocktutor.html'), 'utf8')
const proof = JSON.parse(readFileSync(resolve(root, 'content-alignment.json'), 'utf8'))
const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]!)
const links = [...html.matchAll(/<a class="screenshot-link" href="([^"]+)"/gu)].map(match => match[1]!)
const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex')

test('accounts for every gallery and supplemental capture without stale links', () => {
  assert.match(html, /Visual Design Audit · 66 Captures/u)
  assert.match(html, /Built-in Dark Theme · No Active Skin/u)
  assert.doesNotMatch(html, /UIUX Comparison/u)
  assert.doesNotMatch(html, /Tag and Tab Polish|id="polish"/u)
  assert.equal(new Set(images).size, 66)
  assert.deepEqual(images, links)
  const actual = readdirSync(resolve(root, 'screenshots')).sort()
  assert.deepEqual(actual, proof.gallery.allowlist)
  assert.deepEqual(actual, Object.keys(proof.captures).sort())
  assert.equal(actual.length, 73)
  assert.deepEqual(actual.filter(name => !images.includes(`screenshots/${name}`)), proof.gallery.supplementalCaptures)
  assert.ok(proof.gallery.supplementalCaptures.includes('tocktutor-tag-tab-polish.png'))
  assert.ok(proof.comparisons.every((comparison: { surface: string }) => comparison.surface !== 'polish'))
  assert.ok(proof.pairs.every((pair: { surface: string }) => pair.surface !== 'polish'))
  for (const href of [...html.matchAll(/\bhref="([^"]+)"/gu)].map(match => match[1]!)) {
    if (href.startsWith('#')) assert.ok(html.includes(`id="${href.slice(1)}"`), href)
    else if (!href.startsWith('data:') && !href.startsWith('https://')) assert.ok(existsSync(resolve(root, href)), href)
  }
  assert.equal([...html.matchAll(/<span class="badge">Not Applicable<\/span>/gu)].length, 1)
  assert.match(html, /id="assistant"[\s\S]*?Obsidian · Claudian[\s\S]*?obsidian-assistant\.png/u)
  assert.match(html, /id="reviews"[\s\S]*?Not Applicable/u)
})

test('pairs the Image Viewer with the verified installed Obsidian reference', () => {
  const section = /<section class="surface" id="image-viewer">([\s\S]*?)<\/section>/u.exec(html)![1]!
  assert.deepEqual([...section.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]), [
    'screenshots/tocktutor-image-viewer.png', 'screenshots/obsidian-image-viewer.png',
  ])
  assert.doesNotMatch(section, /missing-reference|Reference Not Captured|still pending/u)
  const reference = proof.captures['obsidian-image-viewer.png']
  assert.equal(reference.product, 'Obsidian 1.13.7')
  assert.equal(reference.entry, '/Applications/Obsidian.app/Contents/Resources/app.asar')
  assert.equal(reference.runtime, 'Electron 42.3.0')
  assert.equal(reference.guardCommit, 'f0fb34a')
  assert.equal(reference.captureScope, 'real-desktop')
  assert.equal(reference.userStateUnchanged, true)
  assert.equal(reference.contentSha256, proof.captures['tocktutor-image-viewer.png'].contentSha256)
  assert.equal(reference.assetSha256, proof.captures['tocktutor-image-viewer.png'].assetSha256)
  const refresh = proof.migrationReview.imageViewerRefresh
  assert.equal(refresh.obsidianCleanup.verified, true)
  assert.deepEqual(refresh.obsidianCleanup.remaining, [])
  assert.deepEqual(refresh.appearanceChecks.map((check: { skin: string | null; theme: string }) => [check.skin, check.theme]), [
    [null, 'dark'], [null, 'light'],
    ...TOCKTEAM_SKINS.flatMap(skin => [[skin.id, 'dark'], [skin.id, 'light']]),
  ])
  for (const check of refresh.appearanceChecks) {
    assert.equal(check.documentSkin, null)
    assert.match(check.backdrop, /^color\(srgb .+ \/ 0\.95\)$/u)
    assert.ok(check.titleContrast >= 4.5)
    assert.ok(check.closeContrast >= 4.5)
    assert.deepEqual(check.geometry, [1512, 949, 2])
  }
  const layout = refresh.layout
  assert.equal(layout.matchesInstalledObsidianGeometry, false)
  assert.deepEqual(layout.dialog, { x: 0, y: 0, width: 1512, height: 949 })
  assert.ok(layout.header.y >= 40)
  assert.ok(layout.viewport.y >= layout.header.y + layout.header.height)
  assert.ok(layout.close.height >= 36)
  assert.equal(layout.closeText, '')
  assert.equal(layout.closeAccessibleName, 'Close')
  assert.equal(layout.close.width, layout.close.height)
  assert.equal(layout.closeCircular, true)
  assert.equal(refresh.backdropOpacity, 0.95)
  assert.equal(refresh.appContribution, 0.05)
  assert.equal(layout.controlsOutsideMedia, true)
  assert.equal(layout.uniformlyDimmed, true)
  assert.equal(layout.appVisibleBehind, true)
  assert.equal(refresh.interactions.chromeRestored, true)
  assert.equal(refresh.interactions.underlyingSidebarNotActivated, true)
  assert.deepEqual(refresh.interactions.verifiedModes, ['reading', 'source', 'live-preview'])
  assert.equal(proof.captures['tocktutor-image-viewer.png'].visibleState.toolbar, false)
  assert.match(section, /almost-hidden app/u)
  assert.match(section, /circular X/u)
  assert.doesNotMatch(section, /× Close/u)
  assert.doesNotMatch(section, /backdrop matches Obsidian|Both products.+full-window/u)
})

test('pairs Image Resizing with byte-identical palace images and saved widths in installed Obsidian', () => {
  const section = /<section class="surface" id="image-resizing">([\s\S]*?)<\/section>/u.exec(html)![1]!
  assert.deepEqual([...section.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]), [
    'screenshots/tocktutor-image-resizing.png', 'screenshots/obsidian-image-resizing.png',
  ])
  assert.doesNotMatch(section, /missing-reference|Reference Not Captured/u)
  const current = proof.captures['tocktutor-image-resizing.png']
  const reference = proof.captures['obsidian-image-resizing.png']
  assert.equal(reference.product, 'Obsidian 1.13.7')
  assert.equal(reference.captureScope, 'real-desktop')
  assert.equal(reference.contentSha256, current.contentSha256)
  assert.equal(reference.assetSha256, current.assetSha256)
  assert.deepEqual(reference.visibleState.widths, [240, 120, 96])
  assert.deepEqual(current.visibleState.widths, [240, 120, 96])
  assert.equal(current.visibleState.undoOneStep, true)
  assert.equal(current.visibleState.reopened, true)
  assert.equal(current.visibleState.alignedImages, true)
  const layout = proof.migrationReview.imageLayoutRefresh
  assert.equal(layout.before.image.x - layout.before.document.x, 302)
  assert.equal(layout.before.image.height, 100)
  for (const measured of layout.after.measurements) {
    assert.ok(Math.abs(measured.image.x - measured.document.x) < 1)
    assert.ok(Math.abs(measured.actions.x - measured.image.x) < 1)
  }
  const third = layout.after.measurements[2]
  assert.ok(Math.abs(third.image.height - 96 * 2592 / 3872) < 1)
  assert.equal(third.caption.align, 'start')
  assert.equal(layout.cleanup.verified, true)
  assert.deepEqual(layout.cleanup.remaining, [])
  const pair = proof.pairs.find((p: { surface: string }) => p.surface === 'image-resizing')
  assert.equal(pair.tocktutor.path, 'Images.md')
  assert.equal(pair.obsidian.path, 'Images.md')
  assert.equal(pair.tocktutor.contentSha256, pair.obsidian.contentSha256)
  assert.match(section, /Potala Palace/u)
})

test('pairs Diagram Editing with genuine Obsidian and identical saved uppercase-fence source', () => {
  const section = /<section class="surface" id="mermaid-editing">([\s\S]*?)<\/section>/u.exec(html)![1]!
  assert.deepEqual([...section.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]), [
    'screenshots/tocktutor-mermaid-editing.png', 'screenshots/obsidian-mermaid-editing.png',
  ])
  assert.doesNotMatch(section, /missing-reference|Reference Not Captured/u)
  const current = proof.captures['tocktutor-mermaid-editing.png'], native = proof.captures['obsidian-mermaid-editing.png']
  assert.equal(native.product, 'Obsidian 1.13.7')
  assert.equal(native.entry, '/Applications/Obsidian.app/Contents/Resources/app.asar')
  assert.equal(native.captureScope, 'real-desktop')
  assert.equal(native.contentSha256, current.contentSha256)
  assert.equal(native.mode, 'live-preview')
  assert.equal(native.visibleState.editing, true)
  assert.equal(native.visibleState.uppercaseFence, true)
  assert.equal(native.visibleState.visibleCode, current.visibleState.visibleCode)
  assert.ok(native.visibleState.neighborSvgNodes > 0)
  assert.equal(native.userStateUnchanged, true)
  const pair = proof.pairs.find((p: { surface: string }) => p.surface === 'mermaid-editing')
  assert.equal(pair.tocktutor.path, 'Diagrams.md')
  assert.equal(pair.tocktutor.contentSha256, pair.obsidian.contentSha256)
  assert.equal(proof.migrationReview.diagramEditingReference.cleanup.verified, true)
  assert.deepEqual(proof.migrationReview.diagramEditingReference.cleanup.remaining, [])
})

test('pairs Imported Property Controls with genuine Obsidian and the identical saved note', () => {
  const section = /<section class="surface" id="imported-properties">([\s\S]*?)<\/section>/u.exec(html)![1]!
  assert.deepEqual([...section.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]), [
    'screenshots/tocktutor-imported-properties.png', 'screenshots/obsidian-imported-properties.png',
  ])
  assert.doesNotMatch(section, /missing-reference|Reference Not Captured/u)
  const native = proof.captures['obsidian-imported-properties.png']
  assert.equal(native.product, 'Obsidian 1.13.7')
  assert.equal(native.entry, '/Applications/Obsidian.app/Contents/Resources/app.asar')
  assert.equal(native.captureScope, 'real-desktop')
  assert.equal(native.contentSha256, proof.captures['tocktutor-imported-properties.png'].contentSha256)
  assert.equal(native.mode, 'live-preview')
  assert.equal(native.theme, 'dark')
  assert.equal(native.skin, null)
  assert.equal(native.visibleState.bodyColorScheme, 'dark')
  assert.equal(native.visibleState.fileProperties, true)
  assert.equal(native.visibleState.frontmatterCollapsed, true)
  assert.equal(native.visibleState.structuredValueWarning, 'Type mismatch, expected Text')
  assert.deepEqual(native.visibleState.values, {
    due: '2026-10-01', finished: true, rating: '1e+21', meeting: '2026-09-29T14:45',
    labels: ['research', 'next steps'], tags: ['migration', 'notes'], aliases: ['Migration Guide'],
    unsupported: '{"nested":"value"}',
  })
  const registry = readFileSync(resolve(root, 'migration-fixtures/types.json'))
  assert.deepEqual(native.visibleState.propertyTypes, JSON.parse(registry.toString()).types)
  assert.equal(native.registrySha256, sha256(registry))
  assert.equal(native.registryUnchanged, true)
  assert.equal(native.userStateUnchanged, true)
  const pair = proof.pairs.find((p: { surface: string }) => p.surface === 'imported-properties')
  assert.equal(pair.tocktutor.path, 'Properties.md')
  assert.equal(pair.tocktutor.contentSha256, pair.obsidian.contentSha256)
  const reference = proof.migrationReview.importedPropertiesReference
  assert.equal(reference.samePropertyTypes, true)
  assert.equal(reference.unrelatedExistingCapturesUnchanged, 72)
  assert.deepEqual(reference.publicationAllowlist, ['obsidian-imported-properties.png'])
  assert.equal(reference.cleanup.verified, true)
  assert.deepEqual(reference.cleanup.remaining, [])
  assert.equal(reference.galleryVerification.bothImagesDecoded, true)
  assert.equal(reference.galleryVerification.missingReference, false)
  assert.equal(reference.galleryCleanup.serverStopped, true)
  assert.deepEqual(reference.galleryCleanup.remaining, [])
})

test('keeps unmatched migration surfaces distinct from the four focused comparisons', () => {
  const additions = proof.migrationReview
  assert.equal(additions.allowlist.length, 6)
  assert.equal(additions.registryUnchanged, true)
  assert.equal(additions.cleanup.verified, true)
  assert.deepEqual(additions.cleanup.remaining, [])
  for (const id of ['image-viewer', 'image-resizing', 'mermaid', 'mermaid-editing', 'imported-properties']) {
    assert.ok(html.includes(`id="${id}"`), id)
    assert.ok(html.includes(`href="#${id}"`), id)
  }
  assert.match(html, /remaining two additions are TockTutor feature evidence, not matched Obsidian comparisons/u)
  for (const name of additions.allowlist) {
    assert.ok(images.includes(`screenshots/${name}`), name)
    assert.equal(proof.captures[name].captureScope, 'real-desktop')
    const expectedCommit = name === 'tocktutor-image-viewer.png' ? additions.imageViewerRefresh.sourceCommit
      : name === 'tocktutor-image-resizing.png' ? additions.imageLayoutRefresh.sourceCommit : additions.sourceCommit
    assert.equal(proof.captures[name].sourceCommit, expectedCommit)
  }
  const fixtures = resolve(root, additions.fixtures)
  const source = (name: string) => readFileSync(resolve(fixtures, name), 'utf8')
  assert.match(source('Viewer.md'), /Potala_palace23\.jpg/u)
  assert.equal(sha256(readFileSync(resolve(fixtures, 'Attachments/Potala_palace23.jpg'))), proof.captures['tocktutor-image-viewer.png'].assetSha256)
  assert.equal(proof.captures['tocktutor-image-viewer.png'].path, 'Viewer.md')
  assert.equal(additions.imageViewerRefresh.obsidianReference, 'obsidian-image-viewer.png')
  assert.match(html, /id="image-viewer"[\s\S]*?Antoine Taveneaux[\s\S]*?CC BY-SA 3\.0/u)
  assert.doesNotMatch(source('Images.md'), /tockteam\.png/u)
  assert.equal((source('Images.md').match(/Potala_palace23\.jpg/gu) ?? []).length, 3)
  const afterImages = source('Images.md').replace('Potala_palace23.jpg|200', 'Potala_palace23.jpg|240')
  const afterProperties = source('Properties.md').replace('due: null', 'due: "2026-10-01"').replace('finished: null', 'finished: true').replace('rating: 1e-7', 'rating: 1e+21')
  const afterDiagrams = source('Diagrams.md').replace('  A[Start] --> B[Finish]', '  A[Start] --> B[Finish]\n    B --> C[Reviewed]')
  for (const [name, content] of Object.entries({
    'tocktutor-image-viewer.png': source('Viewer.md'),
    'tocktutor-image-resizing.png': afterImages,
    'tocktutor-imported-properties.png': afterProperties,
    'tocktutor-mermaid-reading.png': source('Diagrams.md'),
    'tocktutor-mermaid-live-preview.png': source('Diagrams.md'),
    'tocktutor-mermaid-editing.png': afterDiagrams,
  })) assert.equal(proof.captures[name].contentSha256, sha256(content), name)
})

test('orders the numbered surfaces with Source Mode at Surface 04', () => {
  const sections = [...html.matchAll(/<section class="surface" id="([^"]+)">\s*<p class="section-number">Surface (\d+)<\/p>/gu)]
  assert.deepEqual(sections.map(([, id]) => id).slice(0, 5), ['workspace', 'reading', 'live-preview', 'source', 'note-actions'])
  assert.deepEqual(sections.map(([, , number]) => Number(number)), sections.map((_, index) => index + 1))
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

test('records a fresh dark Source Mode capture with visible raw Markdown', () => {
  const source = proof.captures['tocktutor-editor-source.png']
  assert.equal(source.route, '/tocktutor/UIUX%20Comparison.md')
  assert.equal(source.mode, 'source')
  assert.equal(source.visibleState.sourceVisible, true)
  assert.equal(source.visibleState.rawHeadingVisible, true)
  assert.equal(source.visibleState.rawTagsVisible, true)
  assert.equal(source.captureProof.titlebarHistoryButtons, 0)
  assert.equal(source.captureProof.noteHeaderHistoryButtons, 2)
  assert.deepEqual(source.captureProof.consoleErrors, [])
  assert.deepEqual(source.captureProof.pageErrors, [])
  assert.equal(source.captureProof.processTreeStopped, true)
})

test('records the scrolled lower Live Preview pair with both target sections visible', () => {
  const pair = proof.pairs.find((candidate: { surface: string }) => candidate.surface === 'live-preview-lower')
  assert.ok(pair)
  assert.equal(pair.tocktutor.path, 'UIUX Comparison.md')
  assert.equal(pair.obsidian.path, 'UIUX Comparison.md')
  assert.equal(pair.tocktutor.contentSha256, pair.obsidian.contentSha256)
  assert.equal(pair.tocktutor.mode, 'live-preview')
  assert.equal(pair.obsidian.mode, 'live-preview')
  assert.deepEqual(proof.lowerNoteComparison.visibleHeadings, ['Data', 'Code and Notes', 'Small Heading'])
  assert.equal(proof.lowerNoteComparison.cleanup.verified, true)
  assert.deepEqual(proof.lowerNoteComparison.cleanup.remaining, [])
  assert.deepEqual(proof.lowerNoteComparison.startupErrors, ['tockteam-desktop: failed to open workspace TypeError: workspaces.startSession is not a function'])
  for (const name of [pair.tocktutor.screenshot, pair.obsidian.screenshot]) {
    assert.ok(images.includes(`screenshots/${name}`))
    const capture = proof.captures[name]
    assert.equal(capture.theme, 'dark', name)
    assert.equal(capture.skin, null, name)
    assert.equal(capture.mode, 'live-preview', name)
    assert.deepEqual(capture.visibleState.visibleHeadings, proof.lowerNoteComparison.visibleHeadings, name)
    assert.deepEqual(capture.runtimeErrors, [], name)
  }
})

test('records the corrected Live Preview paragraph and flags the unreplaced Reader View image', () => {
  const expected = 'Use bold, italic, bold italic, strikethrough, highlighting, and inline code in one paragraph.'
  const corrected = Object.entries(proof.captures).filter(([, capture]) => (capture as { visibleState?: { renderedParagraph?: string } }).visibleState?.renderedParagraph === expected)
  assert.equal(corrected.length, proof.livePreviewCorrection.updatedCount)
  assert.ok(corrected.some(([name]) => name === 'tocktutor-tag-tab-polish.png'))
  assert.equal(proof.livePreviewCorrection.readerView.status, 'earlier-capture')
  assert.notEqual(proof.captures['tocktutor-web-viewer-reader.png'].sourceCommit, proof.livePreviewCorrection.sourceCommit)
})

test('tracks only the focused bullet-and-link retake', () => {
  const retake = proof.focusedStyleRetake
  assert.equal(retake.filename, 'tocktutor-tag-tab-polish.png')
  assert.equal(retake.updatedCount, 1)
  const capture = proof.captures[retake.filename]
  assert.equal(capture.styleEvidence.bullet, capture.styleEvidence.text)
  assert.equal(capture.styleEvidence.link, capture.styleEvidence.checked)
  assert.equal(capture.styleEvidence.linkWeight, '500')
  assert.equal(retake.processTreeStopped, true)
})

test('binds refreshed Live Preview colors and checkbox size to visible capture evidence', () => {
  const entries = Object.entries(proof.captures).filter(([, capture]) => (capture as { styleEvidence?: unknown }).styleEvidence)
  assert.equal(entries.length, proof.livePreviewStyleCorrection.updatedCount)
  assert.ok(entries.some(([name]) => name === 'tocktutor-tag-tab-polish.png'))
  for (const [name, capture] of entries) {
    const evidence = (capture as { styleEvidence: { link: string; ordered: string; checked: string; unchecked: string; glyph: number; favorite: number } }).styleEvidence
    assert.equal(evidence.link, evidence.checked, name)
    assert.equal(evidence.ordered, 'rgb(249, 250, 251)', name)
    assert.match(evidence.unchecked, /\/ 0\.55/u, name)
    assert.ok(Math.abs(evidence.glyph * 0.75 - evidence.favorite) < 0.05, name)
  }
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
