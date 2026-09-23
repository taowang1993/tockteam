async page => {
  const result = {
    run: 'a4bdb94e',
    artifacts: {
      sourceFind: '/tmp/tutor-pr-verifier-a4bdb94e-source-find-open.png',
      sourceFinal: '/tmp/tutor-pr-verifier-a4bdb94e-editable-source-final.png',
      liveFinal: '/tmp/tutor-pr-verifier-a4bdb94e-editable-live-final.png',
    },
    assertions: [],
    states: [],
    pageErrors: [],
    consoleErrors: [],
    fatal: null,
  }
  page.on('pageerror', error => { result.pageErrors.push(String(error)) })
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()) })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1512,
    height: 949,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 1512,
    screenHeight: 949,
    positionX: 0,
    positionY: 0,
    viewport: { x: 0, y: 0, width: 1512, height: 949, scale: 1 },
  })
  const normalize = value => String(value ?? '').replace(/\r\n/gu, '\n').replace(/\u00a0/gu, ' ')
  const geometry = async () => await page.evaluate(() => ({
    cssWidth: innerWidth,
    cssHeight: innerHeight,
    dpr: devicePixelRatio,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    skin: document.documentElement.dataset.tockteamSkin ?? null,
    route: location.pathname,
    title: document.title,
  }))
  const readModeSelect = async () => {
    const selects = page.locator('select')
    const index = await selects.evaluateAll(elements => elements.findIndex(element => {
      const values = Array.from(element.options).map(option => option.value)
      return values.includes('live-preview') && values.includes('source')
    }))
    if (index < 0) throw new Error('editing mode select not found')
    return selects.nth(index)
  }
  const readSource = async () => {
    const editor = page.locator('[aria-label="Markdown Source Editor"] .cm-content').first()
    await editor.waitFor({ state: 'visible', timeout: 10000 })
    return normalize(await editor.innerText())
  }
  const readLive = async () => {
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible', timeout: 10000 })
    return normalize(await editor.innerText())
  }
  const waitText = async (reader, expected, label) => {
    let actual = ''
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      actual = await reader()
      if (actual === expected) return actual
      await page.waitForTimeout(80)
    }
    result.assertions.push({ name: `${label} settled`, ok: false, expected, actual })
    return actual
  }
  const check = (name, actual, expected) => {
    const ok = actual === expected
    result.assertions.push({ name, ok, expected, actual })
    return ok
  }
  const state = async (name, mode, text = null) => {
    const status = await page.getByRole('group', { name: 'TockTutor Status Bar', exact: true }).allTextContents().catch(() => [])
    result.states.push({ name, mode, text, status, geometry: await geometry() })
  }
  const closeFind = async () => {
    if (await page.getByRole('searchbox', { name: 'Find in Note', exact: true }).count()) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(120)
    }
  }
  const openReplace = async () => {
    await page.getByRole('button', { name: 'More Note Actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Replace…', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Find in Note', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
  }
  const typeAtEnd = async (editor, text) => {
    await editor.click()
    await page.keyboard.press('Meta+End')
    await page.keyboard.type(text)
    await page.waitForTimeout(160)
  }
  const undoRedo = async (reader, expectedUndo, expectedRedo, label) => {
    const undo = []
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Meta+z')
      await page.waitForTimeout(160)
      undo.push(await reader())
      check(`${label} undo ${index + 1}`, undo.at(-1), expectedUndo[index])
    }
    const redo = []
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Meta+Shift+z')
      await page.waitForTimeout(160)
      redo.push(await reader())
      check(`${label} redo ${index + 1}`, redo.at(-1), expectedRedo[index])
    }
    return { undo, redo }
  }
  try {
    const initial = await geometry()
    result.geometry = initial
    check('viewport geometry', JSON.stringify({ width: initial.cssWidth, height: initial.cssHeight, dpr: initial.dpr }), JSON.stringify({ width: 1512, height: 949, dpr: 2 }))
    check('dark built-in theme', initial.colorScheme, 'dark')
    check('no active TockTeam skin', initial.skin, null)

    if (await page.getByRole('button', { name: 'Switch to Reading View', exact: true }).count()) {
      await page.getByRole('button', { name: 'Switch to Reading View', exact: true }).click()
      await page.waitForTimeout(180)
    }
    await page.getByRole('button', { name: 'More Note Actions', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('button', { name: 'More Note Actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Find…', exact: true }).click()
    const find = page.getByRole('searchbox', { name: 'Find in Note', exact: true })
    await find.fill('Source formatted phrase.')
    await page.waitForTimeout(300)
    const sourceFindCount = await page.locator('div[role="search"][aria-label="Find in Note"] output').innerText()
    const sourceFindMarks = await page.locator('article mark.tocktutor-find-match').evaluateAll(elements => elements.map(element => element.textContent ?? ''))
    const sourceStrong = await page.locator('article strong').evaluateAll(elements => elements.map(element => ({ text: element.textContent ?? '', html: element.outerHTML })))
    check('note-local Find query', await find.inputValue(), 'Source formatted phrase.')
    check('note-local Find count', sourceFindCount, '1 / 1')
    check('one logical match split into inline fragments', sourceFindMarks.length, 3)
    check('Find preserves bold markup', sourceStrong.some(entry => entry.text === 'formatted' && entry.html.includes('<mark')), true)
    await state('Source Reading Find open', 'Reading', null)
    await page.screenshot({ path: result.artifacts.sourceFind, fullPage: false })
    await closeFind()

    const editableButton = page.locator('nav button').filter({ hasText: 'Editable' })
    if (await editableButton.count() !== 1) throw new Error(`Editable tree button count ${await editableButton.count()}`)
    await editableButton.click()
    await page.getByRole('heading', { name: 'Editable', exact: true }).first().waitFor({ state: 'visible', timeout: 7000 })
    const modeSelect = await readModeSelect()
    await modeSelect.selectOption('source')
    await page.locator('[aria-label="Markdown Source Editor"] .cm-content').waitFor({ state: 'visible', timeout: 10000 })
    const sourceEditor = page.locator('[aria-label="Markdown Source Editor"] .cm-content').first()
    const sourceBaseline = await readSource()
    const expectedSourceBaseline = '# Editable\n\nalpha beta alpha'
    check('Source baseline', sourceBaseline, expectedSourceBaseline)
    await state('Editable Source baseline', 'Source', sourceBaseline)

    const sourceBefore = `${sourceBaseline} BEFORE`
    await typeAtEnd(sourceEditor, ' BEFORE')
    await waitText(readSource, sourceBefore, 'Source type before replacement')
    check('Source type before replacement', await readSource(), sourceBefore)
    await openReplace()
    await page.getByRole('searchbox', { name: 'Find in Note', exact: true }).fill('alpha')
    await page.locator('input[aria-label="Replace in Note"]').fill('omega')
    await page.waitForTimeout(220)
    const sourceReplaceCount = await page.locator('div[role="search"][aria-label="Find and Replace in Note"] output').innerText()
    check('Source Replace count before Replace All', sourceReplaceCount, '1 / 2')
    await page.getByRole('button', { name: 'Replace All', exact: true }).click()
    const sourceAfterReplace = sourceBefore.replaceAll('alpha', 'omega')
    await waitText(readSource, sourceAfterReplace, 'Source Replace All')
    check('Source Replace All two occurrences', await readSource(), sourceAfterReplace)
    await closeFind()
    const sourceFinal = `${sourceAfterReplace} AFTER`
    await typeAtEnd(sourceEditor, ' AFTER')
    await waitText(readSource, sourceFinal, 'Source type after replacement')
    check('Source type after replacement', await readSource(), sourceFinal)
    const sourceUndoRedo = await undoRedo(readSource, [sourceAfterReplace, sourceBefore, sourceBaseline], [sourceBefore, sourceAfterReplace, sourceFinal], 'Source')
    check('Source final after redo 3', await readSource(), sourceFinal)
    await state('Editable Source final after Redo 3', 'Source', await readSource())
    await page.screenshot({ path: result.artifacts.sourceFinal, fullPage: false })

    await modeSelect.selectOption('live-preview')
    const liveEditor = page.locator('[contenteditable="true"]').first()
    await liveEditor.waitFor({ state: 'visible', timeout: 10000 })
    const liveBaseline = await readLive()
    await state('Editable Live Preview baseline', 'Live Preview', liveBaseline)
    const liveBefore = `${liveBaseline} LIVE_BEFORE`
    await typeAtEnd(liveEditor, ' LIVE_BEFORE')
    await waitText(readLive, liveBefore, 'Live Preview type before replacement')
    check('Live Preview type before replacement', await readLive(), liveBefore)
    await openReplace()
    await page.getByRole('searchbox', { name: 'Find in Note', exact: true }).fill('omega')
    await page.locator('input[aria-label="Replace in Note"]').fill('sigma')
    await page.waitForTimeout(220)
    const liveReplaceCount = await page.locator('div[role="search"][aria-label="Find and Replace in Note"] output').innerText()
    check('Live Preview Replace count before Replace All', liveReplaceCount, '1 / 2')
    await page.getByRole('button', { name: 'Replace All', exact: true }).click()
    const liveAfterReplace = liveBefore.replaceAll('omega', 'sigma')
    await waitText(readLive, liveAfterReplace, 'Live Preview Replace All')
    check('Live Preview Replace All two occurrences', await readLive(), liveAfterReplace)
    await closeFind()
    const liveFinal = `${liveAfterReplace} LIVE_AFTER`
    await typeAtEnd(liveEditor, ' LIVE_AFTER')
    await waitText(readLive, liveFinal, 'Live Preview type after replacement')
    check('Live Preview type after replacement', await readLive(), liveFinal)
    const liveUndoRedo = await undoRedo(readLive, [liveAfterReplace, liveBefore, liveBaseline], [liveBefore, liveAfterReplace, liveFinal], 'Live Preview')
    check('Live Preview final after redo 3', await readLive(), liveFinal)
    await state('Editable Live Preview final after Redo 3', 'Live Preview', await readLive())
    await page.screenshot({ path: result.artifacts.liveFinal, fullPage: false })
    result.transactions = {
      source: { baseline: sourceBaseline, before: sourceBefore, afterReplace: sourceAfterReplace, final: sourceFinal, undo: sourceUndoRedo.undo, redo: sourceUndoRedo.redo },
      livePreview: { baseline: liveBaseline, before: liveBefore, afterReplace: liveAfterReplace, final: liveFinal, undo: liveUndoRedo.undo, redo: liveUndoRedo.redo },
    }
  } catch (error) {
    result.fatal = String(error && error.stack ? error.stack : error)
  }
  result.finalGeometry = await geometry().catch(error => ({ error: String(error) }))
  return result
}
