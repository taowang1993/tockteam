import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { chromium } from '/Users/taowang/Library/pnpm/store/v11/links/@/playwright-core/1.64.0-alpha-2026-09-14/a4317d97f841a20b63a1b6c879d8b164eb980b6980dc43af02139cf9c74fb753/node_modules/playwright-core/index.mjs'

const cdpEndpoint = process.argv[2]
const vaultRoot = process.argv[3] ?? process.env.TUTOR_VAULT_ROOT
const outDir = '/tmp/tutor-main-integration-28-ui'
const evidencePath = path.join(outDir, 'evidence.json')
const screenshots = {
  source: path.join(outDir, 'source-find-replace.png'),
  live: path.join(outDir, 'live-preview-find-replace.png'),
  split: path.join(outDir, 'split-peer-find.png'),
}
const runId = `desktop-${Date.now().toString(36)}`
const editablePath = 'Editable.md'
const mixedPath = 'Mixed.md'
const sourcePath = 'Notes/Source.md'
const destinationPath = 'Notes/Destination.md'
const allowedPaths = new Set([editablePath, mixedPath, sourcePath, destinationPath])
const result = {
  run: runId,
  connection: 'owned app-scoped CDP endpoint (redacted)',
  vault: 'isolated fixture vault (path intentionally omitted)',
  assertions: [],
  states: [],
  screenshots: {},
  saveObservations: [],
  pageErrors: [],
  consoleErrors: [],
  consoleWarnings: [],
  requestFailures: [],
  expectedRequestAborts: [],
  startupRequestFailures: [],
  fatal: null,
}

function redact(value) {
  return String(value ?? '')
    .replace(/(?:https?|ws):\/\/[^\s)]+/giu, '[url]')
    .replace(/(?:token|secret|password|api[_-]?key)[^\s=]*=([^\s&]+)/giu, '[credential]=[redacted]')
    .slice(0, 600)
}
function safeVaultFile(relativePath) {
  if (!vaultRoot || !allowedPaths.has(relativePath)) throw new Error(`Refusing non-allowlisted vault read: ${relativePath}`)
  const root = fs.realpathSync(vaultRoot)
  const file = path.resolve(root, relativePath)
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error('Vault path escaped isolated root')
  return file
}
function readBytes(relativePath) {
  return fs.readFileSync(safeVaultFile(relativePath))
}
function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}
function newlineKinds(bytes) {
  const text = bytes.toString('utf8')
  return [...text.matchAll(/\r\n|\r|\n/gu)].map(match => match[0] === '\r\n' ? 'CRLF' : match[0] === '\r' ? 'CR' : 'LF')
}
function byteSummary(bytes) {
  return { bytes: bytes.length, sha256: digest(bytes), newlineKinds: newlineKinds(bytes) }
}
function countOccurrences(text, token) {
  return token === '' ? 0 : text.split(token).length - 1
}
function repeatedToken(text) {
  const candidates = [...text.matchAll(/[A-Za-z][A-Za-z0-9_-]{1,}/gu)].map(match => match[0])
  const seen = new Set()
  for (const token of candidates) {
    if (seen.has(token)) continue
    seen.add(token)
    if (countOccurrences(text, token) >= 2 && !/^TUTOR_/u.test(token)) return token
  }
  return null
}
function assertCheck(name, ok, expected, actual) {
  result.assertions.push({ name, ok: Boolean(ok), expected, actual })
  return ok
}
function exactCheck(name, expectedBytes, actualBytes) {
  return assertCheck(name, actualBytes.equals(expectedBytes), byteSummary(expectedBytes), byteSummary(actualBytes))
}
function markerCheck(name, bytes, marker, expectedContains = true) {
  const text = bytes.toString('utf8')
  return assertCheck(name, expectedContains ? text.includes(marker) : !text.includes(marker), expectedContains ? `contains ${marker}` : `does not contain ${marker}`, { contains: text.includes(marker), summary: byteSummary(bytes) })
}
function pngDimensions(file) {
  const bytes = fs.readFileSync(file)
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length }
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

if (!cdpEndpoint) throw new Error('Usage: desktop-verifier.mjs <owned-CDP-endpoint> <isolated-vault-root>')
if (!vaultRoot) throw new Error('The parent must provide the isolated fixture vault root')
fs.mkdirSync(outDir, { recursive: true })

let browser
let page
let context
let verificationReady = false
const attachPageEvents = candidate => {
  candidate.on('pageerror', error => { result.pageErrors.push(redact(error?.stack ?? error)) })
  candidate.on('console', message => {
    const text = redact(message.text())
    if (message.type() === 'error') result.consoleErrors.push(text)
    else if (message.type() === 'warning') result.consoleWarnings.push(text)
  })
  candidate.on('requestfailed', request => {
    const error = request.failure()?.errorText ?? ''
    const expectedAbort = error === 'net::ERR_ABORTED' && /\/api\/tocktutorWorkbench\/listTree$/u.test(request.url())
    const failure = { url: redact(request.url()), error: redact(error) }
    if (expectedAbort) {
      result.expectedRequestAborts.push(failure)
    } else if (verificationReady) {
      result.requestFailures.push(failure)
    } else {
      result.startupRequestFailures.push(failure)
    }
  })
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function eventually(label, fn, timeout = 7000, interval = 80) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      last = await fn()
      if (last) return last
    } catch (error) {
      last = error
    }
    await sleep(interval)
  }
  throw new Error(`${label} timed out${last instanceof Error ? `: ${last.message}` : ''}`)
}
async function statusText() {
  return await page.locator('[aria-label="TockTutor Status Bar"]').textContent().catch(() => '') ?? ''
}
function ownerSeats() {
  const seats = page.locator('[data-pane-id]:not([data-linked-kind])')
  return seats
}
async function ownerSeat(index = 0) {
  const seats = ownerSeats()
  if (await seats.count()) return seats.nth(index)
  return page.locator('section[aria-label="Note Editor"]').first()
}
async function modeOf(seat) {
  if (await seat.locator('[aria-label="Markdown Source"]').count()) return 'Source'
  if (await seat.locator('[aria-label="Live Preview Editor"]').count()) return 'Live Preview'
  if (await seat.locator('[aria-label="Reading View"]').count()) return 'Reading'
  return 'Unknown'
}
async function editorOf(seat) {
  const editor = seat.locator('.cm-content:visible').first()
  await editor.waitFor({ state: 'visible', timeout: 8000 })
  return editor
}
async function cmText(seat) {
  const editor = await editorOf(seat)
  const lines = await editor.locator('.cm-line').allTextContents()
  return lines.join('\n')
}
async function routeState(name, seat, relativePath = null) {
  const mode = await modeOf(seat)
  const status = await statusText()
  const title = await seat.locator('h2').first().textContent().catch(() => '') ?? ''
  const state = {
    name,
    path: relativePath,
    route: (() => { try { return new URL(page.url()).pathname } catch { return '[invalid]' } })(),
    title: title.trim(),
    mode,
    status: redact(status.trim()).slice(0, 240),
    ownerPaneCount: await ownerSeats().count(),
    linkedPaneCount: await page.locator('[data-linked-kind]').count(),
  }
  result.states.push(state)
  return state
}
async function waitForNote(relativePath) {
  const tree = page.locator(`[data-tree-path="${relativePath}"]`)
  await tree.waitFor({ state: 'visible', timeout: 8000 })
  await tree.click()
  await eventually(`note ${relativePath}`, async () => {
    const actual = decodeURIComponent(new URL(page.url()).pathname.split('/tocktutor/')[1] ?? '')
    return actual === relativePath
  })
  const seat = await ownerSeat(0)
  await editorOf(seat)
  await eventually(`${relativePath} loaded`, async () => (await seat.locator('.cm-content:visible').count()) === 1)
  return seat
}
async function setMode(seat, label) {
  const current = await modeOf(seat)
  if (current === label) return
  await seat.getByRole('button', { name: 'More Note Actions', exact: true }).click()
  await page.getByRole('menuitemradio', { name: label === 'Source' ? 'Source Mode' : 'Live Preview', exact: true }).click()
  const expectedLabel = label === 'Source' ? 'Markdown Source' : 'Live Preview Editor'
  await seat.locator(`[aria-label="${expectedLabel}"]`).waitFor({ state: 'visible', timeout: 8000 })
}
async function focusEditor(seat) {
  const editor = await editorOf(seat)
  await editor.click()
  return editor
}
async function typeAtEnd(seat, marker) {
  const editor = await focusEditor(seat)
  await page.keyboard.press('Meta+End')
  await page.keyboard.type(marker, { delay: 1 })
  await sleep(160)
  return cmText(seat)
}
async function openReplace(seat) {
  await seat.getByRole('button', { name: 'More Note Actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Replace…', exact: true }).click()
  const search = seat.locator('[role="search"][aria-label="Find and Replace in Note"]')
  await search.waitFor({ state: 'visible', timeout: 5000 })
  return search
}
async function replaceAll(seat, findValue, replacement, expectedTotal) {
  const search = await openReplace(seat)
  const find = search.locator('input[aria-label="Find in Note"]')
  const replace = search.locator('input[aria-label="Replace in Note"]')
  await find.fill(findValue)
  await replace.fill(replacement)
  await eventually('find result count', async () => {
    const output = await search.locator('output').first().textContent().catch(() => '') ?? ''
    const match = output.match(/\/\s*(\d+)/u)
    return match !== null && Number(match[1]) === expectedTotal
  })
  const output = await search.locator('output').first().textContent().catch(() => '') ?? ''
  const replaceAllButton = search.getByRole('button', { name: 'Replace All', exact: true })
  await replaceAllButton.click()
  await sleep(200)
  const text = await cmText(seat)
  assertCheck(`Find/Replace All ${findValue} → ${replacement}`, countOccurrences(text, replacement) >= expectedTotal, `at least ${expectedTotal} replacement occurrences`, { output: redact(output), replacementOccurrences: countOccurrences(text, replacement) })
  return { output, text }
}
async function closeSearch() {
  const strip = page.locator('[role="search"][aria-label="Find in Note"], [role="search"][aria-label="Find and Replace in Note"]')
  if (await strip.count()) {
    const exit = strip.getByRole('button', { name: 'Exit Find', exact: true })
    if (await exit.count()) await exit.click()
    else await page.keyboard.press('Escape')
    await eventually('find panel close', async () => await strip.count() === 0)
  }
}
function activeNoteTab(relativePath) {
  return page.locator(`[role="tab"][aria-selected="true"][title="${relativePath}"]`)
}
async function inspectSave(relativePath, expectedBytes) {
  const tab = activeNoteTab(relativePath)
  const tabCount = await tab.count()
  const tabVisible = tabCount === 1 && await tab.isVisible().catch(() => false)
  const unsavedCount = tabVisible ? await tab.locator('[aria-label="Unsaved"]').count() : -1
  const bytes = readBytes(relativePath)
  const status = await statusText()
  const observation = {
    path: relativePath,
    activeTabCount: tabCount,
    activeTabVisible: tabVisible,
    unsavedCount,
    status: redact(status.trim()).slice(0, 240),
    actual: byteSummary(bytes),
    expected: byteSummary(expectedBytes),
  }
  return { ready: tabCount === 1 && tabVisible && unsavedCount === 0 && bytes.equals(expectedBytes), observation, bytes }
}
async function saveAndRead(relativePath, seat, expectedBytes) {
  if (!Buffer.isBuffer(expectedBytes)) throw new Error(`Expected authored bytes required for save ${relativePath}`)
  await focusEditor(seat)
  await page.keyboard.press('Meta+s')
  let lastObservation = null
  try {
    await eventually(`save bytes and clean active tab ${relativePath}`, async () => {
      const inspected = await inspectSave(relativePath, expectedBytes)
      lastObservation = inspected.observation
      return inspected.ready
    }, 7000)
  } finally {
    if (lastObservation) result.saveObservations.push(lastObservation)
  }
  const inspected = await inspectSave(relativePath, expectedBytes)
  result.saveObservations.push(inspected.observation)
  exactCheck(`save exact authored bytes ${relativePath}`, expectedBytes, inspected.bytes)
  assertCheck(`save clears active tab Unsaved marker ${relativePath}`, inspected.observation.activeTabCount === 1 && inspected.observation.activeTabVisible && inspected.observation.unsavedCount === 0, { activeTab: relativePath, unsaved: false }, { activeTabCount: inspected.observation.activeTabCount, activeTabVisible: inspected.observation.activeTabVisible, unsavedCount: inspected.observation.unsavedCount, status: inspected.observation.status })
  return inspected.bytes
}
async function undoAndSave(relativePath, seat, expected, label) {
  await focusEditor(seat)
  await page.keyboard.press('Meta+z')
  await sleep(180)
  const actual = await saveAndRead(relativePath, seat, expected)
  exactCheck(`${label} undo exact authored bytes`, expected, actual)
  return actual
}
async function redoAndSave(relativePath, seat, expected, label) {
  await focusEditor(seat)
  await page.keyboard.press('Meta+Shift+z')
  await sleep(180)
  const actual = await saveAndRead(relativePath, seat, expected)
  exactCheck(`${label} redo exact authored bytes`, expected, actual)
  return actual
}
async function screenshot(name, file) {
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' })
  const size = pngDimensions(file)
  result.screenshots[name] = { file, size }
  assertCheck(`${name} screenshot geometry`, size?.width === 3024 && size?.height === 1898, { width: 3024, height: 1898 }, size)
}

try {
  browser = await chromium.connectOverCDP(cdpEndpoint)
  context = browser.contexts()[0]
  if (!context) throw new Error('Owned CDP endpoint had no browser context')
  context.setDefaultTimeout(8000)
  for (const candidate of context.pages()) attachPageEvents(candidate)
  page = context.pages().find(candidate => /\/tocktutor(?:\/|$)/u.test(candidate.url())) ?? context.pages()[0]
  if (!page) {
    await eventually('owned Desktop page', async () => {
      const candidate = context.pages().find(value => /\/tocktutor(?:\/|$)/u.test(value.url())) ?? context.pages()[0]
      if (candidate) { page = candidate; attachPageEvents(candidate); return true }
      return false
    }, 12000)
  }
  await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined)
  const workbench = page.locator('.tocktutor-workbench')
  if (!(await workbench.isVisible().catch(() => false))) {
    const notice = page.getByRole('dialog', { name: 'Internal Testing Notice', exact: true })
    if (await notice.count()) await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click()
  }
  await workbench.waitFor({ state: 'visible', timeout: 12000 })
  verificationReady = true
  const geometry = await page.evaluate(() => ({
    cssWidth: innerWidth,
    cssHeight: innerHeight,
    dpr: devicePixelRatio,
    styleColorScheme: document.documentElement.style.colorScheme,
    computedColorScheme: getComputedStyle(document.documentElement).colorScheme,
    skin: document.documentElement.dataset.tockteamSkin ?? null,
    hasSkinAttribute: document.documentElement.hasAttribute('data-tockteam-skin'),
    route: location.pathname,
    title: document.title,
  }))
  result.geometry = geometry
  assertCheck('exact Desktop geometry', geometry.cssWidth === 1512 && geometry.cssHeight === 949 && geometry.dpr === 2, { cssWidth: 1512, cssHeight: 949, dpr: 2 }, geometry)
  assertCheck('built-in dark theme', geometry.styleColorScheme === 'dark' && geometry.computedColorScheme === 'dark', { styleColorScheme: 'dark', computedColorScheme: 'dark' }, { styleColorScheme: geometry.styleColorScheme, computedColorScheme: geometry.computedColorScheme })
  assertCheck('no active TockTeam skin', geometry.skin === null && geometry.hasSkinAttribute === false, { skin: null, hasSkinAttribute: false }, { skin: geometry.skin, hasSkinAttribute: geometry.hasSkinAttribute })
  assertCheck('TockTutor route mounted', geometry.route.startsWith('/tocktutor'), '/tocktutor route', geometry.route)

  const editableOriginal = readBytes(editablePath)
  const editableText = editableOriginal.toString('utf8')
  const sourceToken = repeatedToken(editableText)
  assertCheck('Editable fixture has repeated replacement target', sourceToken !== null, 'a repeated authored token', sourceToken)
  if (!sourceToken) throw new Error('Editable fixture has no repeated replacement target')
  const sourceReplacement = `TUTOR_SOURCE_REPLACE_${runId}`
  const sourceBeforeMarker = ` TUTOR_SOURCE_BEFORE_${runId}`
  const sourceAfterMarker = ` TUTOR_SOURCE_AFTER_${runId}`
  const editableSeat = await waitForNote(editablePath)
  await setMode(editableSeat, 'Source')
  await routeState('Editable Source baseline', editableSeat, editablePath)
  const sourceBeforeExpected = Buffer.from(editableOriginal.toString('utf8') + sourceBeforeMarker)
  await typeAtEnd(editableSeat, sourceBeforeMarker)
  const sourceBefore = await saveAndRead(editablePath, editableSeat, sourceBeforeExpected)
  markerCheck('Source typing before Replace All is authored', sourceBefore, `TUTOR_SOURCE_BEFORE_${runId}`)
  const sourceBeforeText = sourceBefore.toString('utf8')
  const sourceReplacementCount = countOccurrences(sourceBeforeText, sourceToken)
  assertCheck('Source Find count matches authored bytes', sourceReplacementCount >= 2, 'at least 2', sourceReplacementCount)
  await replaceAll(editableSeat, sourceToken, sourceReplacement, sourceReplacementCount)
  await closeSearch()
  const sourceReplacedExpected = Buffer.from(sourceBeforeText.replaceAll(sourceToken, sourceReplacement))
  const sourceReplaced = await saveAndRead(editablePath, editableSeat, sourceReplacedExpected)
  exactCheck('Source Replace All preserves exact authored bytes', sourceReplacedExpected, sourceReplaced)
  const sourceAfterExpected = Buffer.from(sourceReplaced.toString('utf8') + sourceAfterMarker)
  await typeAtEnd(editableSeat, sourceAfterMarker)
  const sourceAfter = await saveAndRead(editablePath, editableSeat, sourceAfterExpected)
  markerCheck('Source typing after Replace All is authored', sourceAfter, `TUTOR_SOURCE_AFTER_${runId}`)
  await routeState('Editable Source after Replace All and after-typing', editableSeat, editablePath)
  await undoAndSave(editablePath, editableSeat, sourceReplaced, 'Source')
  await undoAndSave(editablePath, editableSeat, sourceBefore, 'Source')
  await undoAndSave(editablePath, editableSeat, editableOriginal, 'Source')
  await redoAndSave(editablePath, editableSeat, sourceBefore, 'Source')
  await redoAndSave(editablePath, editableSeat, sourceReplaced, 'Source')
  await redoAndSave(editablePath, editableSeat, sourceAfter, 'Source')
  exactCheck('Source final state after grouped undo/redo', sourceAfter, readBytes(editablePath))
  await screenshot('source', screenshots.source)

  await setMode(editableSeat, 'Live Preview')
  const liveBaseline = readBytes(editablePath)
  const liveTarget = sourceReplacement
  const liveTargetCount = countOccurrences(liveBaseline.toString('utf8'), liveTarget)
  assertCheck('Live Preview replacement target remains authored', liveTargetCount >= 2, 'at least 2', liveTargetCount)
  const liveReplacement = `TUTOR_LIVE_REPLACE_${runId}`
  const liveBeforeMarker = ` TUTOR_LIVE_BEFORE_${runId}`
  const liveAfterMarker = ` TUTOR_LIVE_AFTER_${runId}`
  await routeState('Editable Live Preview baseline', editableSeat, editablePath)
  const liveBeforeExpected = Buffer.from(liveBaseline.toString('utf8') + liveBeforeMarker)
  await typeAtEnd(editableSeat, liveBeforeMarker)
  const liveBefore = await saveAndRead(editablePath, editableSeat, liveBeforeExpected)
  markerCheck('Live Preview typing before Replace All is authored', liveBefore, `TUTOR_LIVE_BEFORE_${runId}`)
  const liveReplacedExpected = Buffer.from(liveBefore.toString('utf8').replaceAll(liveTarget, liveReplacement))
  await replaceAll(editableSeat, liveTarget, liveReplacement, liveTargetCount)
  await closeSearch()
  const liveReplaced = await saveAndRead(editablePath, editableSeat, liveReplacedExpected)
  exactCheck('Live Preview Replace All preserves exact authored bytes', liveReplacedExpected, liveReplaced)
  const liveAfterExpected = Buffer.from(liveReplaced.toString('utf8') + liveAfterMarker)
  await typeAtEnd(editableSeat, liveAfterMarker)
  const liveAfter = await saveAndRead(editablePath, editableSeat, liveAfterExpected)
  markerCheck('Live Preview typing after Replace All is authored', liveAfter, `TUTOR_LIVE_AFTER_${runId}`)
  await routeState('Editable Live Preview after Replace All and after-typing', editableSeat, editablePath)
  await undoAndSave(editablePath, editableSeat, liveReplaced, 'Live Preview')
  await undoAndSave(editablePath, editableSeat, liveBefore, 'Live Preview')
  await undoAndSave(editablePath, editableSeat, liveBaseline, 'Live Preview')
  await redoAndSave(editablePath, editableSeat, liveBefore, 'Live Preview')
  await redoAndSave(editablePath, editableSeat, liveReplaced, 'Live Preview')
  await redoAndSave(editablePath, editableSeat, liveAfter, 'Live Preview')
  exactCheck('Live Preview final state after grouped undo/redo', liveAfter, readBytes(editablePath))
  await screenshot('live', screenshots.live)

  const mixedOriginal = readBytes(mixedPath)
  const mixedText = mixedOriginal.toString('utf8')
  const mixedTarget = repeatedToken(mixedText)
  assertCheck('Mixed fixture has repeated replacement target', mixedTarget !== null, 'a repeated authored token', mixedTarget)
  if (!mixedTarget) throw new Error('Mixed fixture has no repeated replacement target')
  const mixedReplacement = `TUTOR_MIXED_REPLACE_${runId}`
  const mixedTargetCount = countOccurrences(mixedText, mixedTarget)
  const mixedSeat = await waitForNote(mixedPath)
  await setMode(mixedSeat, 'Source')
  await replaceAll(mixedSeat, mixedTarget, mixedReplacement, mixedTargetCount)
  await closeSearch()
  const mixedExpected = Buffer.from(mixedText.replaceAll(mixedTarget, mixedReplacement))
  const mixedReplaced = await saveAndRead(mixedPath, mixedSeat, mixedExpected)
  exactCheck('Mixed Source Replace All preserves exact bytes and separators', mixedExpected, mixedReplaced)
  assertCheck('Mixed Source newline sequence survives replacement', JSON.stringify(newlineKinds(mixedReplaced)) === JSON.stringify(newlineKinds(mixedOriginal)), newlineKinds(mixedOriginal), newlineKinds(mixedReplaced))
  await undoAndSave(mixedPath, mixedSeat, mixedOriginal, 'Mixed Source')
  await redoAndSave(mixedPath, mixedSeat, mixedExpected, 'Mixed Source')
  exactCheck('Mixed Source final redo exact bytes', mixedExpected, readBytes(mixedPath))
  await routeState('Mixed Source after exact replace/undo/redo', mixedSeat, mixedPath)

  const sourceSeat = await waitForNote(sourcePath)
  await setMode(sourceSeat, 'Live Preview')
  const taskBefore = readBytes(sourcePath)
  const taskControl = sourceSeat.locator('input[type="checkbox"]:visible').first()
  if (await taskControl.count()) {
    const taskText = taskBefore.toString('utf8')
    const taskMatch = taskText.match(/\[[ xX]\]/u)
    const expectedTask = taskMatch === null ? null : Buffer.from(taskText.replace(taskMatch[0], taskMatch[0] === '[ ]' ? '[x]' : '[ ]'))
    await taskControl.click()
    const taskExpected = expectedTask ?? taskBefore
    const taskAfter = await saveAndRead(sourcePath, sourceSeat, taskExpected)
    assertCheck('Live Preview task checkbox remains editable without serialization', expectedTask !== null && taskAfter.equals(expectedTask), expectedTask === null ? 'one authored task marker' : byteSummary(expectedTask), byteSummary(taskAfter))
    result.taskEdit = { kind: 'checkbox', before: byteSummary(taskBefore), after: byteSummary(taskAfter), expected: expectedTask ? byteSummary(expectedTask) : null }
  } else {
    const formatBefore = readBytes(sourcePath)
    const formatText = formatBefore.toString('utf8')
    const formatCount = countOccurrences(formatText, '**')
    const formatMarker = ` TUTOR_FORMAT_EDIT_${runId}`
    const formatExpected = Buffer.from(formatText + formatMarker)
    await typeAtEnd(sourceSeat, formatMarker)
    const formatAfter = await saveAndRead(sourcePath, sourceSeat, formatExpected)
    assertCheck('Live Preview simple formatting remains authored while editable', formatAfter.toString('utf8').includes(formatMarker) && countOccurrences(formatAfter.toString('utf8'), '**') === formatCount, { marker: formatMarker, boldDelimiterCount: formatCount }, { summary: byteSummary(formatAfter), boldDelimiterCount: countOccurrences(formatAfter.toString('utf8'), '**') })
    result.taskEdit = { kind: 'simple-formatting-fallback', before: byteSummary(formatBefore), after: byteSummary(formatAfter), marker: formatMarker }
  }
  await routeState('Source Live Preview task/format edit saved', sourceSeat, sourcePath)

  // Linked views are opened only through the visible note menu; no controller or bridge APIs are called.
  await setMode(sourceSeat, 'Source')
  async function openLinked(kind) {
    const owner = await ownerSeat(0)
    await owner.getByRole('button', { name: 'More Note Actions', exact: true }).click()
    const trigger = page.getByRole('menuitem', { name: 'Open Linked View', exact: true })
    await trigger.hover()
    const linkedSubmenu = page.getByRole('menu', { name: 'Open Linked View', exact: true })
    await linkedSubmenu.getByRole('menuitem', { name: kind, exact: true }).click()
    await eventually(`${kind} linked pane`, async () => await page.locator(`[data-linked-kind="${kind.toLocaleLowerCase()}"]`).count() > 0)
  }
  await openLinked('Properties')
  await openLinked('Backlinks')
  const propertiesPane = page.locator('[data-linked-kind="properties"]').first()
  const backlinksPane = page.locator('[data-linked-kind="backlinks"]').first()
  const propertiesHeading = propertiesPane.getByRole('heading', { name: `Properties · ${sourcePath}`, exact: true })
  const backlinksHeading = backlinksPane.getByRole('heading', { name: `Backlinks · ${sourcePath}`, exact: true })
  await propertiesHeading.waitFor({ state: 'visible' })
  await backlinksHeading.waitFor({ state: 'visible' })
  const linkedBefore = {
    properties: (await propertiesHeading.textContent()).trim(),
    backlinks: (await backlinksHeading.textContent()).trim(),
    propertiesText: redact((await propertiesPane.textContent()).trim()).slice(0, 300),
    backlinksText: redact((await backlinksPane.textContent()).trim()).slice(0, 300),
  }
  assertCheck('Properties is bound to Source owner before pin', linkedBefore.properties === `Properties · ${sourcePath}` && /Bound/u.test(linkedBefore.propertiesText), `Properties · ${sourcePath} and Bound`, linkedBefore)
  assertCheck('Backlinks is bound to Source owner before pin', linkedBefore.backlinks === `Backlinks · ${sourcePath}` && /Bound/u.test(linkedBefore.backlinksText), `Backlinks · ${sourcePath} and Bound`, linkedBefore)
  await propertiesPane.getByRole('button', { name: 'Pin', exact: true }).click()
  const propertiesUnpin = propertiesPane.getByRole('button', { name: 'Unpin', exact: true })
  const backlinksUnpin = backlinksPane.getByRole('button', { name: 'Unpin', exact: true })
  await eventually('bound linked views become pinned', async () => {
    return await propertiesUnpin.count() === 1 && await backlinksUnpin.count() === 1 && await propertiesUnpin.getAttribute('aria-pressed') === 'true' && await backlinksUnpin.getAttribute('aria-pressed') === 'true'
  })
  assertCheck('Pinned bound views retain Source before owner opens Destination', linkedBefore.properties === `Properties · ${sourcePath}` && linkedBefore.backlinks === `Backlinks · ${sourcePath}` && await propertiesUnpin.getAttribute('aria-pressed') === 'true' && await backlinksUnpin.getAttribute('aria-pressed') === 'true', { properties: `Properties · ${sourcePath}`, backlinks: `Backlinks · ${sourcePath}`, pinned: true }, { properties: linkedBefore.properties, backlinks: linkedBefore.backlinks, propertiesPinned: await propertiesUnpin.getAttribute('aria-pressed'), backlinksPinned: await backlinksUnpin.getAttribute('aria-pressed') })
  const ownerBeforeSwitch = await ownerSeat(0)
  await focusEditor(ownerBeforeSwitch)
  await waitForNote(destinationPath)
  const destinationOwner = await ownerSeat(0)
  const destinationHeading = destinationOwner.locator('.tocktutor-editor-header h2')
  await destinationHeading.waitFor({ state: 'visible' })
  const destinationTab = activeNoteTab(destinationPath)
  const linkedAfterSwitch = {
    properties: (await propertiesHeading.textContent()).trim(),
    backlinks: (await backlinksHeading.textContent()).trim(),
    ownerTitle: (await destinationHeading.textContent()).trim(),
    activeTabCount: await destinationTab.count(),
    activeTabTitle: await destinationTab.getAttribute('title'),
    route: new URL(page.url()).pathname,
  }
  const destinationIdentity = linkedAfterSwitch.ownerTitle === 'Destination' && linkedAfterSwitch.activeTabCount === 1 && linkedAfterSwitch.activeTabTitle === destinationPath && linkedAfterSwitch.route === `/tocktutor/${destinationPath}`
  assertCheck('Destination owner identity is exact after switch', destinationIdentity, { ownerTitle: 'Destination', activeTabTitle: destinationPath, route: `/tocktutor/${destinationPath}` }, linkedAfterSwitch)
  assertCheck('Pinned bound views retain Source while owner opens Destination: Properties', linkedAfterSwitch.properties === `Properties · ${sourcePath}` && destinationIdentity, { properties: `Properties · ${sourcePath}`, ownerTitle: 'Destination', activeTabTitle: destinationPath }, linkedAfterSwitch)
  assertCheck('Pinned bound views retain Source while owner opens Destination: Backlinks', linkedAfterSwitch.backlinks === `Backlinks · ${sourcePath}` && destinationIdentity, { backlinks: `Backlinks · ${sourcePath}`, ownerTitle: 'Destination', activeTabTitle: destinationPath }, linkedAfterSwitch)
  await propertiesPane.getByRole('button', { name: 'Close Properties Linked View', exact: true }).click()
  await backlinksPane.getByRole('button', { name: 'Close Backlinks Linked View', exact: true }).click()
  await eventually('linked views closed', async () => await page.locator('[data-linked-kind]').count() === 0)

  const destinationSeat = await waitForNote(destinationPath)
  await setMode(destinationSeat, 'Source')
  await eventually('two-pane source starting state', async () => await ownerSeats().count() === 1)
  const ownerActions = destinationSeat.getByRole('button', { name: 'More Note Actions', exact: true })
  await ownerActions.click()
  await page.getByRole('menuitem', { name: 'Split Right', exact: true }).click()
  await eventually('split panes mounted', async () => await ownerSeats().count() === 2)
  const left = await ownerSeat(0)
  const right = await ownerSeat(1)
  await editorOf(left)
  await editorOf(right)
  const leftMarker = ` TUTOR_PANE_LEFT_${runId}`
  const rightMarker = ` TUTOR_PANE_RIGHT_${runId}`
  const destinationBefore = readBytes(destinationPath)
  const destinationExpected = Buffer.from(destinationBefore.toString('utf8') + leftMarker + rightMarker)
  await typeAtEnd(left, leftMarker)
  await eventually('peer pane receives left edit', async () => (await cmText(right)).includes(leftMarker))
  const afterLeft = await cmText(left)
  await typeAtEnd(right, rightMarker)
  await eventually('peer pane receives right edit', async () => (await cmText(left)).includes(rightMarker) && (await cmText(right)).includes(rightMarker))
  const beforePeerUndo = await cmText(left)
  await focusEditor(left)
  await page.keyboard.press('Meta+z')
  await sleep(200)
  const afterPeerUndo = await cmText(left)
  assertCheck('peer edit clears stale undo history', afterPeerUndo === beforePeerUndo && afterPeerUndo.includes(rightMarker), { unchanged: true, includes: rightMarker }, { unchanged: afterPeerUndo === beforePeerUndo, textLength: afterPeerUndo.length, includesRightMarker: afterPeerUndo.includes(rightMarker) })
  await focusEditor(left)
  await page.keyboard.press('Meta+f')
  const leftFind = left.getByRole('searchbox', { name: 'Find in Note', exact: true })
  await leftFind.waitFor({ state: 'visible' })
  assertCheck('left split pane owns its Find UI', await leftFind.count() === 1 && await right.getByRole('searchbox', { name: 'Find in Note', exact: true }).count() === 0, { left: 1, right: 0 }, { left: await leftFind.count(), right: await right.getByRole('searchbox', { name: 'Find in Note', exact: true }).count() })
  await leftFind.fill(leftMarker.trim())
  await page.keyboard.press('Escape')
  await eventually('left Find closes', async () => await left.getByRole('searchbox', { name: 'Find in Note', exact: true }).count() === 0)
  await focusEditor(right)
  await page.keyboard.press('Meta+f')
  const rightFind = right.getByRole('searchbox', { name: 'Find in Note', exact: true })
  await rightFind.waitFor({ state: 'visible' })
  assertCheck('right split pane owns its Find UI', await rightFind.count() === 1 && await left.getByRole('searchbox', { name: 'Find in Note', exact: true }).count() === 0, { left: 0, right: 1 }, { left: await left.getByRole('searchbox', { name: 'Find in Note', exact: true }).count(), right: await rightFind.count() })
  await rightFind.fill(rightMarker.trim())
  await page.keyboard.press('Escape')
  await eventually('right Find closes', async () => await right.getByRole('searchbox', { name: 'Find in Note', exact: true }).count() === 0)
  const destinationAfterPeer = await saveAndRead(destinationPath, right, destinationExpected)
  markerCheck('split peer edits are saved as authored bytes', destinationAfterPeer, leftMarker.trim())
  markerCheck('split peer edits include second authored marker', destinationAfterPeer, rightMarker.trim())
  assertCheck('split panes share content after peer edit', (await cmText(left)) === (await cmText(right)), { shared: true }, { leftLength: (await cmText(left)).length, rightLength: (await cmText(right)).length, shared: (await cmText(left)) === (await cmText(right)) })
  await routeState('Destination split panes after peer edit and pane-local Find', left, destinationPath)
  await screenshot('split', screenshots.split)
  result.split = { leftMarker, rightMarker, destination: byteSummary(destinationAfterPeer), paneCount: await ownerSeats().count() }
} catch (error) {
  result.fatal = redact(error?.stack ?? error)
} finally {
  result.final = {
    geometry: result.geometry ?? null,
    route: page ? (() => { try { return new URL(page.url()).pathname } catch { return null } })() : null,
    pageErrors: result.pageErrors,
    consoleErrors: result.consoleErrors,
    requestFailures: result.requestFailures,
    expectedRequestAborts: result.expectedRequestAborts,
    startupRequestFailures: result.startupRequestFailures,
    screenshotFiles: result.screenshots,
  }
  fs.writeFileSync(evidencePath, JSON.stringify(result, null, 2))
  if (browser) await browser.close().catch(() => undefined)
}

const failed = result.fatal !== null || result.assertions.some(assertion => !assertion.ok) || result.pageErrors.length > 0 || result.consoleErrors.length > 0 || result.requestFailures.length > 0
console.log(JSON.stringify({ evidencePath, passed: !failed, assertionCount: result.assertions.length, failedAssertions: result.assertions.filter(assertion => !assertion.ok).map(assertion => assertion.name), pageErrors: result.pageErrors.length, consoleErrors: result.consoleErrors.length, requestFailures: result.requestFailures.length, expectedRequestAborts: result.expectedRequestAborts.length, startupRequestFailures: result.startupRequestFailures.length, fatal: result.fatal }, null, 2))
if (failed) process.exitCode = 1
