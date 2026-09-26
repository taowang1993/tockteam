// Run with playwright-cli run-code on an owned extended_display endpoint.
// Isolated vault fixture: Original.md. No user profile or vault is touched.
async page => {
  const errors = [], checks = []
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  const dividerStyle = locator => locator.evaluate(el => {
    const line = getComputedStyle(el, '::after'), handle = getComputedStyle(el)
    const canvas = document.createElement('canvas').getContext('2d')
    const luminance = color => {
      canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1)
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
    }
    const background = luminance(getComputedStyle(document.querySelector('.tocktutor-editor')).backgroundColor), foreground = luminance(line.backgroundColor)
    const contrast = (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05)
    return { contrast, color: line.backgroundColor, width: line.width, height: line.height, top: line.top, left: line.left, content: line.content, background: handle.backgroundColor, box: el.getBoundingClientRect().toJSON(), accent: getComputedStyle(el).getPropertyValue('--tockteam-pane-divider-accent').trim() }
  })
  const geometry = async () => {
    const titlebar = await page.getByLabel('TockTutor Title Bar', { exact: true }).boundingBox()
    const seats = await page.locator('[data-pane-id]').evaluateAll(elements => elements.map(el => ({ id: el.dataset.paneId, box: el.getBoundingClientRect().toJSON() })))
    for (const seat of seats) {
      const tabs = await page.locator(`[data-pane-tabs="${seat.id}"]`).boundingBox()
      check(tabs && Math.abs(tabs.x - seat.box.x) < 1 && Math.abs(tabs.width - seat.box.width) < 1, 'tab strip aligns with its pane')
      check(tabs.y === titlebar.y || tabs.y === seat.box.y, 'tabs occupy the titlebar or the top of a lower pane')
    }
    for (const handle of await page.locator('.tockteam-pane-divider:visible').all()) {
      const box = await handle.boundingBox()
      check(box.y >= titlebar.y + titlebar.height, 'divider stays below the titlebar')
    }
  }
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' })
    if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click()
    await page.getByRole('button', { name: 'Original.md', exact: true }).click()
    const theme = await page.evaluate(() => ({ scheme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, bodySkin: document.body.dataset.tockteamSkin ?? null }))
    await page.emulateMedia({ colorScheme: theme.scheme === 'dark' ? 'light' : 'dark' })
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
    check(hover.width === '2px' && hover.color !== idle.color && hover.contrast >= 3, 'hover reveals a contrasting two-pixel accent line')
    check(await right.evaluate(el => {
      const sample = document.createElement('span')
      sample.style.color = 'var(--tockteam-pane-divider-accent)'
      el.append(sample)
      const accent = getComputedStyle(sample).color
      sample.remove()
      return getComputedStyle(el, '::after').backgroundColor === accent
    }), 'hover line inherits the resolved theme accent')
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
    const sidebar = page.locator('.tocktutor-sidebar-resize')
    await sidebar.hover()
    check(await sidebar.evaluate(el => getComputedStyle(el, '::after').content === 'none'), 'sidebar stays resizable without a highlight')
    await page.getByRole('button', { name: 'Toggle Assistant Panel' }).click()
    const assistant = page.getByRole('separator', { name: 'Resize Assistant Panel' })
    await assistant.hover()
    check(await assistant.evaluate(el => getComputedStyle(el, '::after').content === 'none'), 'assistant stays resizable without a highlight')
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
    await page.getByRole('button', { name: 'TockCoder', exact: true }).click()
    const setup = page.getByRole('dialog', { name: 'Add an API key to get started' })
    if (await setup.isVisible()) await setup.getByRole('button', { name: 'Configure later' }).click()
    await page.getByRole('button', { name: 'Toggle side panel' }).click()
    const coderPane = page.getByRole('complementary', { name: 'Side Panel' })
    const coderDivider = coderPane.locator('.tockteam-workspace-resize')
    const coderTitle = await page.locator('.tockteam-window-titlebar').boundingBox()
    const coderBefore = await coderPane.boundingBox()
    const coderHandle = await coderDivider.boundingBox()
    check(coderHandle.y >= coderTitle.y + coderTitle.height, 'TockCoder divider begins below its titlebar')
    await coderDivider.hover({ position: { x: coderHandle.width / 2, y: 90 } })
    check(await coderDivider.evaluate(el => {
      const sample = document.createElement('span')
      sample.style.color = 'var(--tockteam-pane-divider-accent)'
      el.append(sample)
      const accent = getComputedStyle(sample).color
      sample.remove()
      const line = getComputedStyle(el, '::after')
      return line.width === '2px' && line.backgroundColor === accent
    }), 'TockCoder right pane uses the same resolved theme highlight')
    await page.mouse.move(coderHandle.x + coderHandle.width / 2, coderHandle.y + 90)
    await page.mouse.down()
    await page.mouse.move(coderHandle.x - 60, coderHandle.y + 90, { steps: 4 })
    await page.mouse.up()
    check((await coderPane.boundingBox()).width > coderBefore.width + 30, 'TockCoder right pane still resizes by dragging')
    const viewport = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])
    check(viewport.join() === '1512,949,2' && errors.length === 0, 'exact viewport and no runtime errors')
    return { theme, viewport, route: '/tocktutor/Original.md → /tockcoder', content: 'Original.md in two side-by-side Live Preview panes; right divider hovered', idle, hover, checks, errors, screenshots: { hover: screenshot } }
  } finally { await cdp.detach() }
}
