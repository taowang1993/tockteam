import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { TOCKTEAM_SKINS } from '../plugins/skins/src/skins.ts'

const root = resolve('.agents/uiux/tocktutor')
const html = readFileSync(resolve(root, 'tocktutor.html'), 'utf8')
const proof = JSON.parse(readFileSync(resolve(root, 'content-alignment.json'), 'utf8'))
const historical = { ...proof, ...proof.tocktutorGalleryRefresh?.previousProof }
const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)].map(match => match[1]!)
const links = [...html.matchAll(/<a class="screenshot-link" href="([^"]+)"/gu)].map(match => match[1]!)
const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex')

test('refreshes every retained TockTutor image without changing Obsidian and removes only unused captures', () => {
  const refresh = proof.tocktutorGalleryRefresh
  assert.ok(refresh, 'The complete TockTutor refresh has live capture evidence')
  assert.equal(refresh.status, 'verified-current')
  const referenced = [...new Set([...html.matchAll(/screenshots\/([^"'<>\s]+\.png)/gu)].map(match => match[1]!))].sort()
  assert.deepEqual(refresh.publicationAllowlist, referenced.filter(name => name.startsWith('tocktutor-')))
  assert.equal(refresh.publicationAllowlist.length, 33)
  assert.deepEqual(Object.keys(refresh.preservedReferenceHashes).sort(), referenced.filter(name => name.startsWith('obsidian-')))
  assert.equal(Object.keys(refresh.preservedReferenceHashes).length, 29)
  assert.deepEqual(refresh.removedCaptures, [
    'obsidian-backlinks.png', 'obsidian-outline.png', 'obsidian-quick-switcher.png', 'obsidian-reading-embed.png',
    'tocktutor-backlinks.png', 'tocktutor-bookmarks-tags.png', 'tocktutor-main-workspace.png', 'tocktutor-new-note-dialog.png',
    'tocktutor-properties-links.png', 'tocktutor-reading-embed.png', 'tocktutor-tag-tab-polish.png',
  ])
  assert.equal(refresh.reusesExistingBuild, true)
  assert.equal(refresh.appSourceEdits, false)
  assert.equal(refresh.rebuild, false)
  for (const name of refresh.removedCaptures) {
    assert.ok(!referenced.includes(name), name)
    assert.equal(existsSync(resolve(root, 'screenshots', name)), false, name)
    assert.ok(refresh.previousProof.captures[name], name)
  }
  for (const [name, hash] of Object.entries(refresh.preservedReferenceHashes)) {
    assert.equal(sha256(readFileSync(resolve(root, 'screenshots', name))), hash, name)
    assert.deepEqual(proof.captures[name], refresh.previousProof.captures[name], name)
  }
  for (const name of refresh.publicationAllowlist) {
    const capture = proof.captures[name]
    assert.equal(capture.captureScope, 'real-desktop', name)
    assert.equal(capture.refreshId, proof.completedTaskRefresh?.publicationAllowlist.includes(name) ? proof.completedTaskRefresh.id : refresh.id, name)
    assert.ok(Date.parse(capture.capturedAt) >= Date.parse(refresh.startedAt), name)
    assert.deepEqual(capture.geometry, { width: 1512, height: 949, deviceScaleFactor: 2 }, name)
    assert.equal(capture.theme, 'dark', name)
    assert.equal(capture.skin, null, name)
    assert.equal(capture.visibleState.rootColorScheme, 'dark', name)
    assert.equal(capture.visibleState.rootSkin, null, name)
    assert.equal(capture.visibleState.bodySkin, null, name)
    assert.equal(capture.visibleState.assertionPassed, true, name)
    assert.deepEqual(capture.runtimeErrors, [], name)
    assert.ok(capture.route && capture.runtimeErrorMonitoring, name)
  }
  assert.equal(proof.captures['tocktutor-note-actions-menu.png'].visibleState.menus.length, 19)
  assert.equal(proof.captures['tocktutor-editor-source.png'].visibleState.sourceVisible, true)
  for (const heading of ['Data', 'Code and Notes', 'Small Heading']) {
    assert.ok(proof.captures['tocktutor-live-preview-lower.png'].visibleState.visibleHeadings.includes(heading), heading)
  }
  assert.equal(proof.captures['tocktutor-mermaid-reading.png'].visibleState.diagrams, 7)
  assert.equal(proof.captures['tocktutor-mermaid-live-preview.png'].visibleState.diagrams, 7)
  assert.equal(proof.captures['tocktutor-web-viewer.png'].visibleState.loading, false)
  assert.equal(proof.captures['tocktutor-web-viewer.png'].visibleState.goEnabled, true)
  assert.equal(proof.captures['tocktutor-web-viewer-reader.png'].visibleState.readerArticleVisible, true)
  assert.equal(proof.captures['tocktutor-web-viewer-reader.png'].visibleState.pageViewEnabled, true)
  assert.equal(proof.noteNavigationRefresh.status, 'verified-historical')
  assert.equal(proof.titlebarDividerRefresh.status, 'verified-historical')
  assert.equal(proof.readerViewRefresh.status, 'verified-historical')
  assert.ok(refresh.cleanup.length > 0)
  assert.ok(refresh.cleanup.every((run: { stopped: boolean; remaining: number[] }) => run.stopped && run.remaining.length === 0))
})

test('shows the verified completed-task capture with an honestly labeled earlier reference', () => {
  const name = 'tocktutor-editor-live-preview.png'
  const verified = JSON.parse(readFileSync(resolve('.beads/reports/2026-10-03-tocktutor-completed-task/proof.json'), 'utf8'))
  assert.equal(sha256(readFileSync(resolve(root, 'screenshots', name))), verified.screenshot.sha256)
  const refresh = proof.completedTaskRefresh
  assert.equal(refresh.status, 'verified-current')
  assert.deepEqual(refresh.publicationAllowlist, [name])
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 61)
  assert.equal(refresh.reusesVerifiedCapture, true)
  assert.equal(refresh.applicationLaunchedForGalleryUpdate, false)
  assert.equal(refresh.galleryVerification.bothImagesDecoded, true)
  assert.deepEqual(refresh.galleryVerification.geometry, [1512, 949, 2])
  assert.deepEqual(refresh.galleryVerification.runtimeErrors, [])
  assert.equal(sha256(readFileSync(resolve(refresh.galleryVerification.screenshot))), refresh.galleryVerification.screenshotSha256)
  for (const run of Object.values(refresh.galleryCleanup) as { stopped: boolean; remaining: number[] }[]) {
    assert.equal(run.stopped, true)
    assert.deepEqual(run.remaining, [])
  }
  assert.equal(proof.captures[name].contentSha256, verified.comparisonFixture.sha256)
  assert.equal(proof.captures[name].visibleState.completedTask.decoration, 'line-through')
  assert.equal(proof.captures[name].visibleState.pendingTask.decoration, 'none')
  assert.notEqual(refresh.previousCapture.sha256, verified.screenshot.sha256)
  assert.equal(sha256(readFileSync(resolve(root, 'screenshots/obsidian-main-editor.png'))), proof.tocktutorGalleryRefresh.preservedReferenceHashes['obsidian-main-editor.png'])
  const section = /<section class="surface" id="live-preview">([\s\S]*?)<\/section>/u.exec(html)![1]!
  assert.match(section, /completed tasks[\s\S]*pending tasks/u)
  assert.match(section, /Obsidian · Live Preview<\/span><span class="badge">Earlier Reference/u)
})

test('accounts for every gallery and supplemental capture without stale links', () => {
  assert.match(html, /Visual Design Audit · 61 Captures/u)
  assert.match(html, /Built-in Dark Theme · No Active Skin/u)
  assert.doesNotMatch(html, /UIUX Comparison/u)
  assert.doesNotMatch(html, /Tag and Tab Polish|id="polish"/u)
  assert.equal(new Set(images).size, 61)
  assert.equal(new Set(images).size, images.length, 'Each screenshot is shown only once')
  assert.deepEqual(images, links)
  const actual = readdirSync(resolve(root, 'screenshots')).sort()
  assert.deepEqual(actual, proof.gallery.allowlist)
  assert.deepEqual(actual, Object.keys(proof.captures).sort())
  assert.equal(actual.length, 62)
  assert.deepEqual(actual.filter(name => !images.includes(`screenshots/${name}`)), ['tocktutor-web-viewer-reader.png'])
  assert.deepEqual(proof.gallery.supplementalCaptures, ['tocktutor-web-viewer-reader.png'])
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

test('omits comparisons already covered by a more complete retained surface', () => {
  assert.doesNotMatch(html, /id="workspace"|href="#workspace"|Surface 29|Surface 30|id="right-sidebar"|href="#right-sidebar"|Shared Right Sidebar/u)
  assert.equal([...html.matchAll(/<section class="surface"/gu)].length, 28)
  assert.equal([...html.matchAll(/<section class="surface" id="([^"]+)"/gu)].at(-1)?.[1], 'imported-properties')
  for (const name of ['tocktutor-main-workspace.png', 'tocktutor-backlinks.png', 'obsidian-backlinks.png', 'tocktutor-reading-embed.png', 'obsidian-reading-embed.png']) {
    assert.ok(!images.includes(`screenshots/${name}`), name)
    assert.ok(proof.tocktutorGalleryRefresh.removedCaptures.includes(name), name)
    assert.equal(existsSync(resolve(root, 'screenshots', name)), false, name)
  }
  for (const name of ['tocktutor-editor-live-preview.png', 'obsidian-main-editor.png', 'tocktutor-backlinks-unlinked-expanded.png', 'obsidian-backlinks-unlinked-expanded.png', 'tocktutor-attachments-embeds.png', 'obsidian-attachments-embeds.png', 'tocktutor-properties.png', 'tocktutor-imported-properties.png']) {
    assert.ok(images.includes(`screenshots/${name}`), name)
  }
  for (const comparison of proof.comparisons) {
    for (const name of comparison.screenshots) assert.ok(images.includes(`screenshots/${name}`), comparison.surface)
  }
  for (const pair of proof.pairs) {
    for (const side of [pair.tocktutor, pair.obsidian]) assert.ok(images.includes(`screenshots/${side.screenshot}`), pair.surface)
  }
})

test('preserves the historical shortened-menu and relocated-navigation verification', () => {
  const proof = historical
  const refresh = proof.noteNavigationRefresh
  const capture = proof.captures['tocktutor-note-actions-menu.png']
  assert.equal(refresh.status, 'verified-current')
  assert.deepEqual(refresh.publicationAllowlist, ['tocktutor-note-actions-menu.png'])
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 72)
  assert.equal(refresh.screenshotSha256, capture.sha256)
  assert.equal(refresh.sameSavedBytes, true)
  assert.equal(capture.contentSha256, proof.captures['obsidian-note-actions.png'].contentSha256)
  assert.equal(capture.visibleState.menuEntries, 19)
  assert.ok(capture.visibleState.menuLabels.includes('Backlinks in Document'))
  assert.ok(capture.visibleState.menuLabels.includes('Open Linked View'))
  for (const label of ['File Recovery', 'Graph View', 'Web Viewer', 'Bookmarks', 'Outline', 'Backlinks', 'Tags', 'All Properties']) {
    assert.ok(!capture.visibleState.menuLabels.includes(label), label)
  }
  assert.deepEqual(refresh.sidebarLabels, ['Backlinks', 'Outgoing Links', 'Tags', 'All Properties', 'Outline', 'File Properties', 'Assistant'])
  assert.ok(refresh.paletteLabels.includes('All Properties') && refresh.paletteLabels.includes('File Properties'))
  assert.equal(refresh.separatePropertyScopes, true)
  assert.equal(refresh.appearanceChecks.length, 8)
  for (const sample of refresh.appearanceChecks) {
    assert.deepEqual(sample.geometry, [1512, 949, 2])
    assert.ok(sample.textContrast >= 4.5 && sample.selectedIconContrast >= 3)
    assert.equal(sample.systemDark, sample.mode !== 'dark')
    assert.equal(sample.overflow, false)
  }
  assert.deepEqual(refresh.narrow.overflow, [])
  assert.equal(refresh.outsideDismissed, true)
  assert.equal(refresh.focus.restored, true)
  assert.ok(parseFloat(refresh.focus.outline) >= 2)
  assert.deepEqual(refresh.runtimeErrors, [])
  assert.ok(refresh.cleanup.every((run: { stopped: boolean; remaining: number[] }) => run.stopped && run.remaining.length === 0))
  assert.equal(proof.noteActionsRefresh.status, 'verified-historical')
  assert.match(html, /Workspace menu|workspace menu/u)
})

test('preserves the historical Image Viewer interaction and appearance verification', () => {
  const proof = historical
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

test('preserves the historical Image Resizing save and layout verification', () => {
  const proof = historical
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

test('preserves the historical Diagram Editing reference verification', () => {
  const proof = historical
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

test('preserves the historical Imported Property Controls reference and layout verification', () => {
  const proof = historical
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
    status: 'review', favorite: true, area: 'markdown', tags: ['comparison', 'typography'],
    difficulty: 'medium', due: '2026-10-01', meeting: '2026-10-01T14:45', rating: '1e+21',
    unsupported: '{"nested":"value"}',
  })
  const registry = JSON.stringify(proof.comparisonPropertiesRefresh.registryContent)
  assert.deepEqual(native.visibleState.propertyTypes, JSON.parse(registry).types)
  assert.equal(native.registrySha256, sha256(registry))
  assert.equal(native.registryUnchanged, true)
  assert.equal(native.userStateUnchanged, true)
  const pair = proof.pairs.find((p: { surface: string }) => p.surface === 'imported-properties')
  assert.equal(pair.tocktutor.path, 'comparison.md')
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
  const refresh = proof.migrationReview.importedPropertiesRefresh
  assert.ok(refresh, 'The pair has fresh capture evidence')
  assert.deepEqual(refresh.publicationAllowlist, ['tocktutor-imported-properties.png', 'obsidian-imported-properties.png'])
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 71)
  assert.equal(refresh.sameSavedBytes, true)
  assert.equal(refresh.samePropertyTypes, true)
  assert.equal(refresh.reusesExistingBuild, true)
  const current = proof.captures['tocktutor-imported-properties.png']
  assert.equal(current.sourceCommit, proof.titlebarDividerRefresh.sourceCommit)
  assert.equal(current.sha256, proof.titlebarDividerRefresh.screenshotSha256s['tocktutor-imported-properties.png'])
  assert.equal(current.visibleState.rightSidebar, true)
  assert.equal(current.visibleState.fullHeightNote, true)
  assert.equal(current.visibleState.rootColorScheme, 'dark')
  assert.equal(current.visibleState.rootSkin, null)
  assert.equal(current.visibleState.bodySkin, null)
  const { unsupported: nativeObject, ...editableValues } = native.visibleState.values
  assert.equal(nativeObject, '{"nested":"value"}')
  assert.deepEqual(current.visibleState.values, editableValues)
  assert.equal(current.visibleState.unsupportedSourceFallback, true)
  assert.deepEqual(current.visibleState.propertyTypes, native.visibleState.propertyTypes)
  assert.equal(current.registrySha256, native.registrySha256)
  assert.equal(current.registryUnchanged, true)
  assert.equal(current.visibleState.segmentedToggle, false)
  assert.equal(current.visibleState.titlebarButtons, true)
  assert.equal(current.visibleState.compactRows, true)
  assert.deepEqual(current.visibleState.selector, [
    { label: 'Properties', selected: 'true' },
    { label: 'Assistant', selected: 'false' },
  ])
  assert.deepEqual(current.visibleState.toggle, { x: 1055, y: 6, width: 64, height: 28 })
  assert.ok(refresh.cleanup.every((run: { stopped: boolean; remaining: number[] }) => run.stopped && run.remaining.length === 0))
  assert.equal(refresh.galleryVerification.bothImagesDecoded, true)
  assert.equal(refresh.galleryVerification.surface30Absent, true)
  assert.deepEqual(refresh.galleryVerification.runtimeErrors, [])
  assert.equal(refresh.galleryCleanup.serverStopped, true)
  assert.deepEqual(refresh.galleryCleanup.remaining, [])
})

test('uses the expanded shared comparison note for the Properties screenshot pair', () => {
  const source = readFileSync(resolve(root, 'comparison.md'), 'utf8')
  assert.match(source, /^due: "2026-10-01"$/mu)
  assert.match(source, /^meeting: "2026-10-01T14:45"$/mu)
  assert.match(source, /^rating: 1e\+21$/mu)
  assert.match(source, /^unsupported: \{nested: value\}$/mu)
  const refresh = proof.comparisonPropertiesRefresh
  assert.equal(refresh.path, 'comparison.md')
  assert.equal(refresh.contentSha256, sha256(source))
  const pair = proof.pairs.find((pair: { surface: string }) => pair.surface === 'imported-properties')
  for (const side of [pair.tocktutor, pair.obsidian]) {
    assert.equal(side.path, 'comparison.md')
    assert.equal(side.contentSha256, sha256(source))
  }
  assert.ok(proof.captures[pair.tocktutor.screenshot].visibleState.visibleHeadings.includes('Markdown Rendering Lab'))
  assert.equal(proof.captures[pair.obsidian.screenshot].visibleState.noteHeading, 'Markdown Rendering Lab')
  const revision = proof.comparisonNoteRevision
  const body = source.slice(source.indexOf('\n---\n') + 5)
  assert.equal(revision.changedFrontmatterOnly, true)
  assert.equal(sha256(body), revision.previous.bodySha256)
  assert.equal(sha256(revision.previous.frontmatter + body), revision.previous.contentSha256)
  assert.equal(revision.current.contentSha256, sha256(source))
  assert.equal(revision.previous.bytes, 1324)
  assert.equal(refresh.noteBytes, Buffer.byteLength(source))
  assert.equal(refresh.visibleRows, 9)
})

test('preserves the historical Properties editing comparison verification', () => {
  const proof = historical
  const refresh = proof.comparisonPropertiesRefresh
  assert.ok(refresh, 'Current shared-note Properties has installed Obsidian comparison evidence')
  assert.deepEqual(refresh.publicationAllowlist, ['tocktutor-imported-properties.png', 'obsidian-imported-properties.png'])
  assert.equal(refresh.reusesExistingBuild, true)
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 71)
  assert.equal(refresh.sameSavedBytes, true)
  assert.equal(refresh.samePropertyTypes, true)
  assert.equal(refresh.registryUnchanged, true)
  const current = proof.captures['tocktutor-imported-properties.png']
  const native = proof.captures['obsidian-imported-properties.png']
  assert.equal(current.sourceCommit, proof.titlebarDividerRefresh.sourceCommit)
  assert.equal(refresh.status, 'verified-historical')
  assert.equal(native.sha256, refresh.screenshotSha256s['obsidian-imported-properties.png'])
  assert.equal(native.entry, '/Applications/Obsidian.app/Contents/Resources/app.asar')
  assert.equal(current.contentSha256, native.contentSha256)
  assert.equal(current.registrySha256, native.registrySha256)
  assert.equal(current.visibleState.extraToolbar, false)
  assert.deepEqual(current.visibleState.rowMenuEntries, ['Rename Property', 'Copy Value', 'Remove Property'])
  assert.deepEqual(current.visibleState.typeMenuEntries, ['Text', 'List', 'Number', 'Checkbox', 'Date', 'Date & Time'])
  assert.ok(refresh.cleanup.every((run: { stopped: boolean; remaining: number[] }) => run.stopped && run.remaining.length === 0))
  assert.equal(refresh.galleryVerification.bothImagesDecoded, true)
  assert.deepEqual(refresh.galleryVerification.runtimeErrors, [])
  assert.equal(refresh.galleryCleanup.serverStopped, true)
  assert.equal(refresh.galleryCleanup.stopped, true)
  assert.deepEqual(refresh.galleryCleanup.remaining, [])
  assert.equal(refresh.reference.installationUnchanged, true)
  assert.match(html, /Properties Editing Refresh/u)
  assert.doesNotMatch(html, /tocktutor-properties-proof\/index\.html|(?:href|src)="[^"]*webobsidian/iu)
  assert.equal(existsSync(resolve('.beads/reports/2026-10-01-tocktutor-properties-proof/index.html')), false)
})

test('preserves the historical compact Properties row and titlebar verification', () => {
  const proof = historical
  const refresh = proof.propertiesLayoutRefresh
  const current = proof.captures['tocktutor-imported-properties.png']
  const native = proof.captures['obsidian-imported-properties.png']
  assert.equal(refresh.status, 'verified-historical')
  assert.deepEqual(refresh.publicationAllowlist, ['tocktutor-imported-properties.png'])
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 72)
  assert.equal(refresh.installedReferenceUnchanged, true)
  assert.equal(refresh.noteBytes, 1413)
  assert.equal(refresh.sameSavedBytes, true)
  assert.equal(refresh.registryUnchanged, true)
  assert.deepEqual(refresh.geometry, [1512, 949, 2])
  assert.deepEqual(refresh.pixels, [3024, 1898])
  assert.equal(refresh.theme, 'dark')
  assert.equal(refresh.skin, null)
  assert.equal(refresh.keyboardSwitch, true)
  assert.equal(refresh.propertyDraftRetained, true)
  assert.equal(refresh.closedFocusExcluded, true)
  assert.deepEqual(refresh.narrow, { width: 240, scrollWidth: 240, clientWidth: 240, overflow: [] })
  assert.deepEqual(refresh.baselineRestored, { scheme: 'dark', skin: null })
  assert.deepEqual(refresh.runtimeErrors, [])
  assert.equal(current.visibleState.propertyRows.length, 9)
  for (const [index, row] of current.visibleState.propertyRows.entries()) {
    const reference = native.visibleState.propertyRows[index]
    assert.equal(row.key, reference.key)
    assert.ok(Math.abs(row.y - reference.y) <= 1, row.key)
    assert.equal(row.labelBounds.height, 29, row.key)
    assert.equal(row.labelBounds.y, row.controlBounds.y, row.key)
    assert.ok(row.controlBounds.x >= row.labelBounds.x + row.labelBounds.width, row.key)
  }
  assert.ok(current.visibleState.fieldBorders.every((field: { borderWidth: string; background: string }) => field.borderWidth === '0px' && field.background === 'rgba(0, 0, 0, 0)'))
  assert.deepEqual(refresh.appearanceChecks.map((check: { skin: string | null; mode: string }) => [check.skin, check.mode.toLowerCase()]), [
    [null, 'dark'], [null, 'light'], ...TOCKTEAM_SKINS.flatMap(skin => [[skin.id, 'dark'], [skin.id, 'light']]),
  ])
  for (const check of refresh.appearanceChecks) {
    assert.notEqual(check.mode.toLowerCase(), check.system)
    assert.ok(check.nameContrast >= 4.5)
    assert.ok(check.valueContrast >= 4.5)
    assert.ok(check.sourceHintContrast >= 4.5)
    assert.ok(check.selectedIconContrast >= 3)
    assert.deepEqual(check.geometry, [1512, 949, 2])
    assert.equal(check.overflow, false)
  }
  assert.ok(refresh.cleanup.every((run: { stopped: boolean; remaining: number[] }) => run.stopped && run.remaining.length === 0))
  assert.match(html, /Properties Layout Refresh/u)
})

test('preserves the historical eight-appearance native calendar verification', () => {
  const proof = historical
  const refresh = proof.propertyCalendarRefresh
  const current = proof.captures['tocktutor-imported-properties.png']
  assert.equal(refresh.status, 'verified-historical')
  assert.equal(current.sourceCommit, proof.titlebarDividerRefresh.sourceCommit)
  assert.equal(current.sha256, proof.titlebarDividerRefresh.screenshotSha256s['tocktutor-imported-properties.png'])
  assert.deepEqual(refresh.publicationAllowlist, ['tocktutor-imported-properties.png'])
  assert.equal(refresh.installedReferenceUnchanged, true)
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 72)
  assert.equal(refresh.sameSavedBytes, true)
  assert.equal(refresh.registryUnchanged, true)
  assert.deepEqual(refresh.geometry, [1512, 949, 2])
  assert.deepEqual(refresh.pixels, [3024, 1898])
  assert.equal(refresh.nativePickerRetained, true)
  assert.deepEqual(refresh.nativeInputs.map((field: { key: string; value: string }) => [field.key, field.value]), [['due', '2026-10-01'], ['meeting', '2026-10-01T14:45']])
  assert.deepEqual(current.visibleState.leadingCalendars, refresh.nativeInputs)
  assert.equal(refresh.appearanceChecks.length, 8)
  for (const check of refresh.appearanceChecks) {
    assert.notEqual(check.mode.toLowerCase(), check.system)
    for (const field of check.nativeInputs) {
      assert.ok(field.picker.width > 0 && field.picker.height > 0)
      assert.ok(field.picker.x + field.picker.width <= field.date.x, field.key)
    }
    assert.deepEqual(check.geometry, [1512, 949, 2])
  }
  assert.ok(refresh.nativeFocus.every((field: { focused: boolean; outline: string }) => field.focused && parseFloat(field.outline) >= 2))
  assert.equal(existsSync(resolve(root, refresh.checkScript)), true)
  assert.deepEqual(refresh.runtimeErrors, [])
  assert.ok(refresh.cleanup.every((run: { stopped: boolean; remaining: number[] }) => run.stopped && run.remaining.length === 0))
  assert.equal(refresh.galleryCleanup.serverStopped, true)
  assert.deepEqual(refresh.galleryCleanup.remaining, [])
  assert.match(html, /calendar button before the date/u)
})

test('preserves the historical composer gap and footer verification', () => {
  const proof = historical
  const refresh = proof.composerGapRefresh
  assert.equal(refresh.status, 'verified-historical')
  assert.equal(proof.footerComposerRefresh.status, 'verified-historical')
  assert.deepEqual(refresh.publicationAllowlist, ['tocktutor-assistant.png'])
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 72)
  assert.equal(refresh.installedReferencesUnchanged, true)
  assert.equal(refresh.composerPadding, 2)
  assert.equal(refresh.composerGap, 2)
  assert.equal(refresh.footerSafeArea, 28)
  assert.equal(refresh.noPromptSent, true)
  const current = proof.captures['tocktutor-assistant.png']
  assert.equal(current.sourceCommit, proof.titlebarDividerRefresh.sourceCommit)
  assert.equal(current.sha256, proof.titlebarDividerRefresh.screenshotSha256s['tocktutor-assistant.png'])
  assert.equal(current.visibleState.footer.right, 1512)
  assert.equal(current.visibleState.footer.bottom, 949)
  assert.equal(current.theme, 'dark')
  assert.equal(current.skin, null)
  assert.equal(current.contentSha256, proof.captures['obsidian-assistant.png'].contentSha256)
  assert.equal(current.visibleState.composer.bottom + refresh.composerPadding, 921)
  assert.equal(current.visibleState.composerGap, 2)
  assert.equal(refresh.appearanceChecks.length, 8)
  for (const check of refresh.appearanceChecks) {
    assert.equal(check.footerRight, 1512)
    assert.equal(check.footerBottom, 949)
    assert.equal(check.footerCount, 1)
    assert.equal(check.gap, 2)
    assert.ok(check.ratio >= 4.5)
    assert.notEqual(check.mode.toLowerCase(), check.system)
  }
  assert.equal(refresh.narrow.width, 240)
  assert.equal(refresh.narrow.gap, 2)
  assert.deepEqual(refresh.narrow.overflow, [])
  assert.equal(refresh.keyboardFocus.outline, '2px')
  assert.equal(refresh.keyboardFocus.hit, true)
  assert.equal(refresh.escapeRestored, true)
  assert.equal(refresh.outsideDismissed, true)
  assert.deepEqual(refresh.runtimeErrors, [])
  assert.equal(refresh.cleanup.stopped, true)
  assert.deepEqual(refresh.cleanup.remaining, [])
  assert.equal(refresh.galleryCleanup.serverStopped, true)
  assert.deepEqual(refresh.galleryCleanup.remaining, [])
  assert.match(html, /2 CSS pixels/u)
})

test('preserves the historical right-titlebar divider verification', () => {
  const proof = historical
  const refresh = proof.titlebarDividerRefresh
  assert.ok(refresh, 'Current right-titlebar divider has rendered Desktop evidence')
  assert.equal(refresh.status, 'verified-current')
  assert.deepEqual(refresh.publicationAllowlist, ['tocktutor-imported-properties.png', 'tocktutor-assistant.png'])
  assert.equal(refresh.unrelatedExistingCapturesUnchanged, 71)
  assert.equal(refresh.installedReferencesUnchanged, true)
  assert.deepEqual(refresh.geometry, [1512, 949, 2])
  assert.deepEqual(refresh.pixels, [3024, 1898])
  assert.equal(refresh.appearanceChecks.length, 8)
  for (const sample of refresh.appearanceChecks) {
    assert.notEqual(sample.mode.toLowerCase(), sample.system)
    assert.deepEqual(sample.views.map((view: { view: string }) => view.view), ['assistant', 'file-properties'])
    for (const view of sample.views) {
      assert.deepEqual(view.rightDivider, view.leftDivider)
      assert.equal(view.rightDivider.width, '1px')
      assert.equal(view.rightDivider.style, 'solid')
      assert.equal(view.right.x, view.panel.x)
      assert.equal(view.right.width, view.panel.width)
      assert.equal(view.right.height, 40)
      assert.equal(view.rightOverflow, false)
      assert.equal(view.footer.right, 1512)
      assert.equal(view.footer.bottom, 949)
      assert.equal(view.footerSafeArea, 28)
    }
  }
  assert.ok(refresh.narrow.every((view: { right: { width: number }; rightOverflow: boolean }) => view.right.width === 240 && !view.rightOverflow))
  assert.equal(refresh.keyboardSwitch, true)
  assert.equal(refresh.closedFocusExcluded, true)
  assert.equal(refresh.rememberedView, true)
  assert.equal(refresh.noPromptSent, true)
  assert.ok(refresh.cleanup.every((run: { stopped: boolean; remaining: number[] }) => run.stopped && run.remaining.length === 0))
  assert.equal(refresh.galleryCleanup.serverStopped, true)
  assert.deepEqual(refresh.galleryCleanup.remaining, [])
  assert.deepEqual(refresh.runtimeErrors, [])
  assert.deepEqual(refresh.externalRequests, [])
  assert.equal(existsSync(resolve(root, refresh.checkScript)), true)
  assert.match(html, /Titlebar Divider Refresh/u)
})

test('preserves the historical migration comparisons and original source bindings', () => {
  const proof = historical
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
      : name === 'tocktutor-image-resizing.png' ? additions.imageLayoutRefresh.sourceCommit
        : name === 'tocktutor-imported-properties.png' ? proof.titlebarDividerRefresh.sourceCommit : additions.sourceCommit
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
  assert.equal(proof.propertiesEditingRefresh.contentSha256, sha256(afterProperties), 'Earlier separate Properties note retains its actual historical content hash')
  const afterDiagrams = source('Diagrams.md').replace('  A[Start] --> B[Finish]', '  A[Start] --> B[Finish]\n    B --> C[Reviewed]')
  for (const [name, content] of Object.entries({
    'tocktutor-image-viewer.png': source('Viewer.md'),
    'tocktutor-image-resizing.png': afterImages,
    'tocktutor-imported-properties.png': readFileSync(resolve(root, 'comparison.md'), 'utf8'),
    'tocktutor-mermaid-reading.png': source('Diagrams.md'),
    'tocktutor-mermaid-live-preview.png': source('Diagrams.md'),
    'tocktutor-mermaid-editing.png': afterDiagrams,
  })) assert.equal(proof.captures[name].contentSha256, sha256(content), name)
})

test('orders the numbered surfaces with Source Mode at Surface 03', () => {
  const sections = [...html.matchAll(/<section class="surface" id="([^"]+)">\s*<p class="section-number">Surface (\d+)<\/p>/gu)]
  assert.deepEqual(sections.map(([, id]) => id).slice(0, 4), ['reading', 'live-preview', 'source', 'note-actions'])
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

test('preserves the historical Source Mode and note-history verification', () => {
  const proof = historical
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

test('preserves the historical lower Live Preview comparison verification', () => {
  const proof = historical
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

test('preserves the historical Live Preview correction and Reader View verification', () => {
  const proof = historical
  const expected = 'Use bold, italic, bold italic, strikethrough, highlighting, and inline code in one paragraph.'
  const corrected = Object.entries(proof.captures).filter(([, capture]) => (capture as { visibleState?: { renderedParagraph?: string } }).visibleState?.renderedParagraph === expected)
  assert.equal(corrected.length, proof.livePreviewCorrection.updatedCount + 1)
  assert.ok(corrected.some(([name]) => name === 'tocktutor-tag-tab-polish.png'))
  const reader = proof.captures['tocktutor-web-viewer-reader.png']
  const refresh = proof.readerViewRefresh
  assert.equal(refresh.status, 'verified-current')
  assert.equal(reader.sourceCommit, refresh.sourceCommit)
  assert.equal(reader.contentSha256, proof.comparisonNoteRevision.previous.contentSha256)
  assert.equal(reader.visibleState.renderedParagraph, expected)
  assert.equal(reader.visibleState.readerArticleVisible, true)
  assert.equal(reader.visibleState.pageViewEnabled, true)
  assert.equal(reader.visibleState.readerTitle, 'Example Domain')
  assert.match(reader.visibleState.readerContent, /This domain is for use in documentation examples/u)
  assert.equal(reader.visibleState.rootColorScheme, 'dark')
  assert.equal(reader.visibleState.rootSkin, null)
  assert.equal(reader.visibleState.bodySkin, null)
  assert.deepEqual(reader.geometry, { width: 1512, height: 949, deviceScaleFactor: 2 })
  assert.equal(proof.livePreviewCorrection.readerView.resolvedBy, 'readerViewRefresh')
  assert.equal(refresh.cleanup.stopped, true)
  assert.deepEqual(refresh.cleanup.remaining, [])
  assert.deepEqual(refresh.runtimeErrors, [])
  assert.doesNotMatch(html, /Reader View.+(?:earlier capture|stayed loading)|earlier Reader View capture/u)
})

test('preserves the historical focused bullet-and-link retake', () => {
  const proof = historical
  const retake = proof.focusedStyleRetake
  assert.equal(retake.filename, 'tocktutor-tag-tab-polish.png')
  assert.equal(retake.updatedCount, 1)
  const capture = proof.captures[retake.filename]
  assert.equal(capture.styleEvidence.bullet, capture.styleEvidence.text)
  assert.equal(capture.styleEvidence.link, capture.styleEvidence.checked)
  assert.equal(capture.styleEvidence.linkWeight, '500')
  assert.equal(retake.processTreeStopped, true)
})

test('preserves the historical Live Preview color and checkbox verification', () => {
  const proof = historical
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
  const historicalHash = proof.comparisonNoteRevision.previous.contentSha256
  assert.equal(proof.fixtures['comparison.md'].tocktutor.sha256, historicalHash)
  assert.equal(proof.fixtures['UIUX Comparison.md'].tocktutor.sha256, historicalHash)
  assert.equal(proof.fixtures['UIUX Comparison.md'].obsidian.sha256, historicalHash)
  assert.equal(proof.fixtures['comparison.md'].status, 'historical-before-properties-expansion')
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
    if (['comparison.md', 'UIUX Comparison.md'].includes(pair.tocktutor.path)) assert.equal(pair.tocktutor.contentSha256, ['imported-properties', 'live-preview'].includes(pair.surface) ? sharedHash : historicalHash, pair.surface)
  }
})
