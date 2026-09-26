// Run with playwright-cli run-code on an owned extended_display endpoint; Original.md fixture.
async page => {
  const checks = [], errors = [], seams = []
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  const capture = async () => {
    const screenshot = (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data
    const samples = await page.evaluate(async data => {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); image.close()
      const pixel = (x, y) => [...ctx.getImageData(Math.floor(x * devicePixelRatio), Math.floor(y * devicePixelRatio), 1, 1).data].join(',')
      const sidebar = document.querySelector('.tocktutor-titlebar-sidebar').getBoundingClientRect()
      return [...document.querySelectorAll('[role=tab][aria-selected=true]')].map(tab => {
        const shell = tab.parentElement, strip = shell.closest('[data-pane-tabs]'), bar = strip.closest('.tocktutor-titlebar') ?? strip
        const b = bar.getBoundingClientRect(), r = shell.getBoundingClientRect(), s = strip.getBoundingClientRect()
        return { pane: strip.dataset.paneTabs, height: b.height, border: getComputedStyle(shell).borderBottomWidth,
          columns: [r.left + 4, r.left + r.width / 2, r.right - 4].map(x => Array.from({ length: 12 }, (_, i) => pixel(x, b.bottom - 3 + i / 2))),
          sidebar: [pixel(sidebar.left + 4, sidebar.bottom - 3), pixel(sidebar.left + 4, sidebar.bottom - .5)],
          outside: [pixel(s.right - 60, b.bottom - 3), pixel(s.right - 60, b.bottom - .5)] }
      })
    }, screenshot)
    seams.push(samples)
    for (const sample of samples) {
      check(sample.height === 40 && sample.border === '0px', 'tab bar stays 40px with no active-tab bottom border')
      check(sample.columns.every(colors => colors.every(color => color === colors[0])), `active tab joins editor without a divider: ${JSON.stringify(sample)}`)
      check(sample.outside[0] === sample.outside[1], 'editor-side tab strip has no bottom divider')
      check(sample.sidebar[0] !== sample.sidebar[1], 'sidebar-side bottom divider remains')
    }
    return screenshot
  }
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' })
    if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click()
    await page.getByRole('button', { name: 'Original.md', exact: true }).click()
    const theme = await page.evaluate(() => ({ scheme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, bodySkin: document.body.dataset.tockteamSkin ?? null }))
    await page.emulateMedia({ colorScheme: theme.scheme === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' })
    const screenshots = { single: await capture() }
    for (const [direction, count] of [['Right', 2], ['Down', 3]]) {
      await page.getByRole('button', { name: 'More Note Actions', exact: true }).last().click()
      await page.getByRole('menuitem', { name: `Split ${direction}`, exact: true }).click()
      await page.waitForFunction(count => document.querySelectorAll('[role=tab]').length === count, count)
      await page.getByRole('heading', { name: 'Original', exact: true }).last().hover()
      screenshots[direction] = await capture()
    }
    const viewport = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])
    check(viewport.join() === '1512,949,2' && !errors.length, 'exact viewport and no runtime errors')
    return { theme, viewport, route: await page.evaluate(() => location.pathname), content: 'Original.md in single, right and lower Live Preview panes', seams, checks, errors, screenshots }
  } finally { await cdp.detach() }
}
