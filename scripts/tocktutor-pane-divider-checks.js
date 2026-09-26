// Run with playwright-cli run-code on an owned extended_display endpoint.
// Isolated vault fixture: Original.md. No user profile or vault is touched.
async page => {
  const errors = [], checks = []
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  const dividerStyle = locator => locator.evaluate(el => {
    const line = getComputedStyle(el, '::after'), handle = getComputedStyle(el)
    return { color: line.backgroundColor, width: line.width, height: line.height, top: line.top, left: line.left, content: line.content, background: handle.backgroundColor, box: el.getBoundingClientRect().toJSON(), accent: getComputedStyle(el).getPropertyValue('--dsw-alias-brand-primary').trim() }
  })
  const geometry = async () => {
    const titlebar = await page.getByLabel('TockTutor Title Bar', { exact: true }).boundingBox()
    const seats = await page.locator('[data-pane-id]').evaluateAll(elements => elements.map(el => ({ id: el.dataset.paneId, box: el.getBoundingClientRect().toJSON() })))
    for (const seat of seats) {
      const tabs = await page.locator(`[data-pane-tabs="${seat.id}"]`).boundingBox()
      check(tabs && Math.abs(tabs.x - seat.box.x) < 1 && Math.abs(tabs.width - seat.box.width) < 1, 'tab strip aligns with its pane')
      check(tabs.y === titlebar.y || tabs.y === seat.box.y, 'tabs occupy the titlebar or the top of a lower pane')
    }
    for (const handle of await page.locator('.tocktutor-pane-divider:visible').all()) {
      const box = await handle.boundingBox()
      check(box.y >= titlebar.y + titlebar.height, 'divider stays below the titlebar')
    }
  }
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' })
    if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click()
    await page.getByRole('button', { name: 'Original.md', exact: true }).click()
    const theme = await page.evaluate(() => ({ scheme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, bodySkin: document.body.dataset.tockteamSkin ?? null }))
    const split = async (index, direction) => {
      await page.getByRole('button', { name: 'More Note Actions', exact: true }).nth(index).click()
      await page.getByRole('menuitem', { name: `Split ${direction}`, exact: true }).click()
    }
    await split(0, 'Right')
    await page.waitForFunction(() => document.querySelectorAll('[role=tab]').length === 2)
    check(await page.getByRole('tab').count() === 2, 'both top panes have visible tabs and close controls')
    await geometry()
    const right = page.getByRole('separator', { name: 'Resize Right Split' })
    await page.getByLabel('TockTutor Title Bar', { exact: true }).hover({ position: { x: 10, y: 10 } })
    const idle = await dividerStyle(right)
    check(idle.width === '1px' && idle.background === 'rgba(0, 0, 0, 0)', 'idle divider is a thin rule without a grip')
    await right.hover()
    const hover = await dividerStyle(right)
    check(hover.width === '2px' && hover.color !== idle.color, 'hover reveals a two-pixel accent line')
    const screenshot = (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data
    await right.focus(); await page.keyboard.press('ArrowRight')
    check(await right.getAttribute('aria-valuenow') === '55', 'keyboard resizing remains available')
    await page.getByLabel('TockTutor Title Bar', { exact: true }).hover({ position: { x: 10, y: 10 } })
    check((await dividerStyle(right)).width === '2px', 'keyboard focus retains the accent line')
    await geometry()
    const box = await right.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + 100, { steps: 4 })
    check(Number(await right.getAttribute('aria-valuenow')) > 55 && (await dividerStyle(right)).width === '2px', 'drag resizes the panes with the accent visible')
    await page.mouse.up()
    await geometry()
    for (const handle of [page.locator('.tocktutor-sidebar-resize')]) {
      await handle.hover()
      check((await dividerStyle(handle)).width === '2px', 'sidebar uses the same line treatment')
    }
    await page.getByRole('button', { name: 'Toggle Assistant Panel' }).click()
    const assistant = page.getByRole('separator', { name: 'Resize Assistant Panel' })
    await assistant.hover()
    check((await dividerStyle(assistant)).width === '2px', 'assistant uses the same line treatment')
    await geometry()
    await page.getByRole('button', { name: 'Toggle Assistant Panel' }).click()
    await split(1, 'Down')
    await page.waitForFunction(() => document.querySelectorAll('[role=tab]').length === 3)
    await geometry()
    const down = page.getByRole('separator', { name: 'Resize Down Split' })
    await down.hover()
    check((await dividerStyle(down)).height === '2px', 'horizontal divider highlights across its own panes')
    const lowerTabs = page.locator('[data-pane-id] [data-pane-tabs]')
    await lowerTabs.getByRole('button', { name: 'Close Original.md', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('[role=tab]').length === 2)
    check(await down.count() === 0, 'closing the lower pane last tab removes its split')
    await page.getByLabel('TockTutor Title Bar', { exact: true }).getByRole('button', { name: 'Close Original.md', exact: true }).last().click()
    await page.waitForFunction(() => document.querySelectorAll('[role=tab]').length === 1)
    check(await right.count() === 0, 'right pane can be closed from its titlebar tab')
    check(await page.locator('[data-pane-id]').count() === 1, 'remaining pane expands without losing its note')
    const viewport = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])
    check(viewport.join() === '1512,949,2' && errors.length === 0, 'exact viewport and no runtime errors')
    return { theme, viewport, route: await page.evaluate(() => location.pathname), content: 'Original.md in two side-by-side Live Preview panes; right divider hovered', idle, hover, checks, errors, screenshots: { hover: screenshot } }
  } finally { await cdp.detach() }
}
