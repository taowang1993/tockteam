import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'

const galleryPath = resolve('.agents/uiux/tocktutor/tocktutor.html')
const galleryRoot = dirname(galleryPath)
const gallery = readFileSync(galleryPath, 'utf8')
const proof = JSON.parse(readFileSync(resolve('.beads/reports/tocktutor-utility-proof.json'), 'utf8')) as {
  gallery: { uniqueImageSources: number; captureCountLabel: string; screenshotDirectoryTotal: number; supplementalCaptures: string[]; supplementalPolicy: string }
  reading: { tockTutor: { containsGeneratedUntitled?: boolean; copiedVaultIdentity?: string; treePaths?: string[] } }
  sourceCommandRecovery: { source: { tockTutor: {
    captureRun: string
    cleanupVerified: boolean
    font: { family: string; loaded: boolean; sizePx: number }
    headingDecorations: string[]
    markerColor: string
    runtimeErrorsAtCapture: number
    screenshotBytes: number
    screenshotSha256: string
    visibleTooltips: number
  } } }
  polishRecapture?: {
    captureRun: string
    checkedFavorite: { background: string; checkmark: string }
    screenshot: { bytes: number; path: string; sha256: string }
    tagStyle: { backgroundMixPercent: number; foregroundAccentMixPercent: number; resolvedForeground: string }
    tabCurvePx: number
    verification: { cleanupVerified: boolean; runtimeErrorsAtCapture: number }
  }
  attachmentsEmbeds: { obsidian?: { directAttachmentPanelCapture?: boolean } }
  affectedRecapture: { copiedVaultIdentity?: string; surfaces: { noteActions: { backgroundsMatchSidebar: boolean; cleanupVerified: boolean; menuBackground: string; menuLabels: string[]; runtimeErrorsAtCapture: number; sidebarBackground: string; visibleTooltips: number }; workspacesPanes: { comparability?: string }; newNote: { captureCommit?: string; captureRun?: string; captureState?: string; collisionIsolation?: string; copiedVaultIdentity?: string; renderedPreviewBar?: boolean; screenshotBytes?: number; screenshotSha256?: string; theme?: { activeSkin: string | null; baseline: string; themePreference: string } }; search: {
        captureMethod: string
        captureRun: string
        captureCommit: string
        fixture: string
        temporaryProfile: boolean
        temporaryVault: boolean
        background: boolean
        appScoped: boolean
        provenance: { visibility: string; scope: string }
        backgroundComparison: { validPaletteParityAssertion: boolean; routeSelector: string; sidebarSelector: string }
        layoutVerification: {
          captureState: string; fixCommit: string; finalPackagedRecapture: string; screenshotProvesFinalLayout: boolean
          bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number; overflowY: string; maxHeight: string }
          wheel: { targetInsideOptions: boolean; overflowing: boolean; beforeScrollTop: number; afterScrollTop: number; restoredScrollTop: number }
        }
        mockKeychain: { argumentIndex: number; beforeTemporaryHome: boolean; beforeUserDataDir: boolean; noNewSecurityAgentDuringLaunch: boolean; noNewSecurityAgentAfterCleanup: boolean }
        geometry: { css: { width: number; height: number; deviceScaleFactor: number }; pixels: { width: number; height: number } }
        theme: { activeSkin: string | null; backgroundMatchesSidebar: boolean; baseline: string; colorScheme: string; documentSkin: string | null; themePreference: string }
        route: string
        mode: string
        query: string
        filter: { active: boolean; directory: string; modifiedFrom: number | null; modifiedTo: number | null; name: string; titleOnly: boolean }
        results: { activeIndex: number; activePath: string; count: number; matchCount: number; paths: string[]; ranked: boolean; scores: number[]; state: string; visible: boolean }
        preview: { contentVerified: boolean; generation: number; line: number; local: boolean; path: string; state: string; visible: boolean }
        quickAnswer: { model: string | null; provider: string | null; providerConfigured: boolean; state: string; status: string; truthful: boolean }
        runtimeErrors: string[]
        runtimeErrorsAtCapture: number
        cleanup: { browserCloseTimedOut: boolean; browserCloseError: string | null; processStageFailures: unknown[]; browserSessionStopped: boolean; electronTreeStopped: boolean; runtimeDescendantsStopped: boolean; temporaryProfilesRemoved: boolean; verified: boolean }
        cleanupVerified: boolean
        screenshot: { bytes: number; path: string; sha256: string }
      } } }
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
  assert.match(gallery, /id="polish"[\s\S]*?screenshots\/tocktutor-tag-tab-polish\.png/u)
  const polishCapture = readFileSync(resolve(galleryRoot, 'screenshots/tocktutor-tag-tab-polish.png'))
  assert.deepEqual({ width: polishCapture.readUInt32BE(16), height: polishCapture.readUInt32BE(20) }, { width: 3024, height: 1898 })
  const livePreviewCapture = readFileSync(resolve(galleryRoot, 'screenshots/tocktutor-editor-live-preview.png'))
  assert.deepEqual({ width: livePreviewCapture.readUInt32BE(16), height: livePreviewCapture.readUInt32BE(20) }, { width: 3024, height: 1898 })
  assert.equal(createHash('sha256').update(polishCapture).digest('hex'), createHash('sha256').update(livePreviewCapture).digest('hex'))
  assert.deepEqual({
    background: proof.polishRecapture?.checkedFavorite.background,
    checkmark: proof.polishRecapture?.checkedFavorite.checkmark,
    tagStyle: proof.polishRecapture?.tagStyle,
    tabCurvePx: proof.polishRecapture?.tabCurvePx,
  }, { background: '#a68af9', checkmark: '#000000', tagStyle: { backgroundMixPercent: 10, foregroundAccentMixPercent: 85, resolvedForeground: '#b29bf9' }, tabCurvePx: 16 })
  assert.equal(proof.polishRecapture?.screenshot.path, '.agents/uiux/tocktutor/screenshots/tocktutor-tag-tab-polish.png')
  assert.equal(proof.polishRecapture?.screenshot.bytes, polishCapture.length)
  assert.equal(proof.polishRecapture?.screenshot.sha256, `sha256:${createHash('sha256').update(polishCapture).digest('hex')}`)
  assert.deepEqual(proof.polishRecapture?.verification, { cleanupVerified: true, runtimeErrorsAtCapture: 0 })
  const sourceCapture = readFileSync(resolve(galleryRoot, 'screenshots/tocktutor-editor-source.png'))
  assert.deepEqual({ width: sourceCapture.readUInt32BE(16), height: sourceCapture.readUInt32BE(20) }, { width: 3024, height: 1898 })
  assert.deepEqual({
    cleanupVerified: proof.sourceCommandRecovery.source.tockTutor.cleanupVerified,
    font: proof.sourceCommandRecovery.source.tockTutor.font,
    headingDecorations: proof.sourceCommandRecovery.source.tockTutor.headingDecorations,
    markerColor: proof.sourceCommandRecovery.source.tockTutor.markerColor,
    runtimeErrorsAtCapture: proof.sourceCommandRecovery.source.tockTutor.runtimeErrorsAtCapture,
    visibleTooltips: proof.sourceCommandRecovery.source.tockTutor.visibleTooltips,
  }, {
    cleanupVerified: true,
    font: { family: 'Fira Code VF', loaded: true, sizePx: 16 },
    headingDecorations: ['none'],
    markerColor: '#ffffff',
    runtimeErrorsAtCapture: 0,
    visibleTooltips: 0,
  })
  assert.equal(proof.sourceCommandRecovery.source.tockTutor.screenshotBytes, sourceCapture.length)
  assert.equal(proof.sourceCommandRecovery.source.tockTutor.screenshotSha256, `sha256:${createHash('sha256').update(sourceCapture).digest('hex')}`)
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
  assert.equal(proof.affectedRecapture.surfaces.newNote.captureRun, 'tocktutor-capture-mtw9km8i-8a3e7d0d')
  assert.equal(proof.affectedRecapture.surfaces.newNote.captureCommit, 'tutor@926a0a83')
  assert.equal(proof.affectedRecapture.surfaces.newNote.renderedPreviewBar, false)
  assert.deepEqual(proof.affectedRecapture.surfaces.newNote.theme, { themePreference: 'dark', activeSkin: null, baseline: 'built-in-dark-no-skin' })
  const newNoteCapture = readFileSync(resolve(galleryRoot, 'screenshots/tocktutor-new-note.png'))
  assert.deepEqual({ width: newNoteCapture.readUInt32BE(16), height: newNoteCapture.readUInt32BE(20) }, { width: 3024, height: 1898 })
  assert.equal(proof.affectedRecapture.surfaces.newNote.screenshotBytes, newNoteCapture.length)
  assert.equal(proof.affectedRecapture.surfaces.newNote.screenshotSha256, `sha256:${createHash('sha256').update(newNoteCapture).digest('hex')}`)
  assert.equal(proof.affectedRecapture.surfaces.noteActions.menuLabels.includes('Backlinks in Document'), true)
  assert.deepEqual({
    backgroundsMatchSidebar: proof.affectedRecapture.surfaces.noteActions.backgroundsMatchSidebar,
    cleanupVerified: proof.affectedRecapture.surfaces.noteActions.cleanupVerified,
    menuBackground: proof.affectedRecapture.surfaces.noteActions.menuBackground,
    runtimeErrorsAtCapture: proof.affectedRecapture.surfaces.noteActions.runtimeErrorsAtCapture,
    sidebarBackground: proof.affectedRecapture.surfaces.noteActions.sidebarBackground,
    visibleTooltips: proof.affectedRecapture.surfaces.noteActions.visibleTooltips,
  }, {
    backgroundsMatchSidebar: true,
    cleanupVerified: true,
    menuBackground: '#151517',
    runtimeErrorsAtCapture: 0,
    sidebarBackground: '#151517',
    visibleTooltips: 0,
  })
  assert.match(gallery, /id="search"[\s\S]*?Verified Capture[\s\S]*?Search Options fits the viewport and scrolls natively/u)
  const search = proof.affectedRecapture.surfaces.search
  assert.equal(search.captureMethod, 'bounded Playwright Electron/CDP against the staged Desktop composition')
  assert.match(search.captureRun, /^tocktutor-search-packaged-[A-Za-z0-9-]+$/u)
  assert.match(search.captureCommit, /^tutor@[0-9a-f]{7,40}$/u)
  assert.equal(search.fixture, 'temporary copy of plugins/tocktutor/parity/fixtures/vault')
  assert.deepEqual({ background: search.background, appScoped: search.appScoped, temporaryProfile: search.temporaryProfile, temporaryVault: search.temporaryVault }, { appScoped: true, background: false, temporaryProfile: true, temporaryVault: true })
  assert.deepEqual(search.geometry, {
    css: { width: 1512, height: 949, deviceScaleFactor: 2 },
    pixels: { width: 3024, height: 1898 },
  })
  assert.deepEqual(search.theme, {
    activeSkin: null,
    backgroundMatchesSidebar: false,
    baseline: 'built-in-dark-no-skin',
    colorScheme: 'dark',
    documentSkin: null,
    themePreference: 'dark',
  })
  assert.deepEqual({ mode: search.mode, route: search.route }, { mode: 'live-preview', route: '/tocktutor/Notes/Welcome.md' })
  assert.equal(search.query.trim().length > 0, true)
  assert.deepEqual(search.filter, { active: true, directory: 'Notes', modifiedFrom: null, modifiedTo: null, name: 'In Folder', titleOnly: false })
  assert.equal(search.results.ranked, true)
  assert.equal(search.results.state, 'ranked')
  assert.equal(search.results.visible, true)
  assert.equal(search.results.count > 0, true)
  assert.equal(search.results.matchCount >= search.results.count, true)
  assert.equal(search.results.paths.includes(search.results.activePath), true)
  assert.equal(search.results.scores.length, search.results.matchCount)
  assert.equal(search.results.scores.every((score, index, scores) => index === 0 || score <= scores[index - 1]!), true)
  assert.equal(search.results.activeIndex >= 0, true)
  assert.deepEqual(search.preview, {
    contentVerified: true,
    generation: search.preview.generation,
    line: search.preview.line,
    local: true,
    path: search.results.activePath,
    state: 'loaded',
    visible: true,
  })
  assert.equal(search.quickAnswer.truthful, true)
  assert.equal(search.quickAnswer.providerConfigured, false)
  assert.equal(search.quickAnswer.status, 'provider-unavailable')
  assert.equal(search.quickAnswer.state, 'unavailable')
  assert.equal(search.quickAnswer.model, null)
  assert.equal(search.quickAnswer.provider, null)
  assert.deepEqual(search.runtimeErrors, [])
  assert.equal(search.runtimeErrorsAtCapture, 0)
  for (const guard of ['browserSessionStopped', 'electronTreeStopped', 'runtimeDescendantsStopped', 'temporaryProfilesRemoved', 'verified'] as const) {
    assert.equal(search.cleanup[guard], true, guard)
  }
  assert.equal(search.cleanup.browserCloseTimedOut, false)
  assert.equal(search.cleanup.browserCloseError, null)
  assert.deepEqual(search.cleanup.processStageFailures, [])
  assert.equal(search.mockKeychain.argumentIndex, 0)
  for (const guard of ['beforeTemporaryHome', 'beforeUserDataDir', 'noNewSecurityAgentDuringLaunch', 'noNewSecurityAgentAfterCleanup'] as const) {
    assert.equal(search.mockKeychain[guard], true, guard)
  }
  assert.equal(search.provenance.visibility, 'visible-user-authorized')
  assert.equal(search.provenance.scope, 'app-scoped')
  assert.ok(gallery.includes(`Captured at <code>${search.captureCommit.slice('tutor@'.length, 'tutor@'.length + 8)}</code>`))
  // The capture compared different semantic owners, not dialog/Files-sidebar colors.
  assert.equal(search.backgroundComparison.validPaletteParityAssertion, false)
  assert.equal(search.backgroundComparison.routeSelector, '[data-tockteam-tocktutor-route="true"]')
  assert.equal(search.backgroundComparison.sidebarSelector, '#tockteam-sidebar-root')
  assert.equal(search.layoutVerification.captureState, 'post-overflow-fix')
  assert.equal(search.layoutVerification.finalPackagedRecapture, 'verified')
  assert.equal(search.layoutVerification.screenshotProvesFinalLayout, true)
  assert.match(search.layoutVerification.fixCommit, /^[0-9a-f]{8,40}$/u)
  const { bounds, wheel } = search.layoutVerification
  assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= search.geometry.css.width && bounds.bottom <= search.geometry.css.height)
  assert.ok(bounds.width > 0 && bounds.height > 0)
  assert.equal(bounds.overflowY, 'auto')
  assert.notEqual(bounds.maxHeight, 'none')
  assert.equal(wheel.targetInsideOptions, true)
  assert.equal(wheel.overflowing, true)
  assert.equal(wheel.beforeScrollTop, 0)
  assert.ok(wheel.afterScrollTop > wheel.beforeScrollTop)
  assert.equal(wheel.restoredScrollTop, 0)
  assert.equal(search.cleanupVerified, true)
  const searchCapture = readFileSync(resolve(galleryRoot, 'screenshots/tocktutor-search.png'))
  assert.deepEqual({ width: searchCapture.readUInt32BE(16), height: searchCapture.readUInt32BE(20) }, { width: 3024, height: 1898 })
  assert.equal(search.screenshot.path, '.agents/uiux/tocktutor/screenshots/tocktutor-search.png')
  assert.equal(search.screenshot.bytes, searchCapture.length)
  assert.equal(search.screenshot.sha256, `sha256:${createHash('sha256').update(searchCapture).digest('hex')}`)
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

test('accounts for the exact screenshot directory without counting supplemental images as gallery captures', () => {
  const galleryImages = new Set(imageSources.map(path => path.replace(/^screenshots\//u, '')))
  const proofImages = new Set<string>()
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      const match = value.match(/(?:^|\/)((?:tocktutor|obsidian)-[^/]+\.png)$/u)
      if (match !== null) proofImages.add(match[1]!)
    } else if (Array.isArray(value)) value.forEach(collect)
    else if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) { collect(key); collect(entry) }
    }
  }
  collect(proof)
  const actual = readdirSync(resolve(galleryRoot, 'screenshots')).sort()
  const expected = [...new Set([...galleryImages, ...proofImages, ...proof.gallery.supplementalCaptures])].sort()
  assert.deepEqual(actual, expected)
  assert.deepEqual(actual.filter(name => !galleryImages.has(name)), proof.gallery.supplementalCaptures)
  assert.equal(galleryImages.size, 51)
  assert.equal(proof.gallery.uniqueImageSources, galleryImages.size)
  assert.equal(proof.gallery.captureCountLabel, 'Visual Design Audit · 51 Captures')
  assert.equal(proof.gallery.screenshotDirectoryTotal, actual.length)
  assert.equal(actual.length, 57)
  assert.match(proof.gallery.supplementalPolicy, /existing supplemental captures.*outside.*51-image gallery/u)
})
