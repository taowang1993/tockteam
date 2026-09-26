// Run with playwright-cli run-code on an owned extended_display endpoint.
// Isolated fixture: Original.md and This is a comparison note for tocktutor and obsidian.md.
async page => {
  const errors = [], checks = []
  const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  const style = tab => tab.locator('..').evaluate(el => {
    const css = getComputedStyle(el), close = el.querySelector('button[aria-label^="Close "]'), button = getComputedStyle(close)
    const canvas = document.createElement('canvas').getContext('2d'), ancestors = []
    for (let node = el; node; node = node.parentElement) ancestors.unshift(node)
    for (const node of ancestors) { canvas.fillStyle = getComputedStyle(node).backgroundColor; canvas.fillRect(0, 0, 1, 1) }
    const luminance = () => [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
    const background = luminance()
    const contrast = color => { canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); const foreground = luminance(); return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) }
    return { background: css.backgroundColor, border: css.borderTopColor, radius: css.borderBottomLeftRadius, before: getComputedStyle(el, '::before').display, closeOpacity: button.opacity, pointerEvents: button.pointerEvents, focused: close === document.activeElement, textContrast: contrast(css.color), closeContrast: contrast(button.color), box: el.getBoundingClientRect().toJSON() }
  })
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' })
    if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click()
    const state = await page.evaluate(() => ({ theme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, skin: document.body.dataset.tockteamSkin ?? null }))
    await page.emulateMedia({ colorScheme: state.theme === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Original.md', exact: true }).click()
    const other = 'This is a comparison note for tocktutor and obsidian.md'
    await page.getByRole('button', { name: other, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Open in New Tab', exact: true }).click()
    await page.getByRole('heading', { name: 'Comparison', exact: true }).click()
    const oldTab = page.getByRole('tab').filter({ hasText: 'Original' }), activeTab = page.getByRole('tab').filter({ hasText: 'This is a comparison' })
    check(await oldTab.getAttribute('aria-selected') === 'false' && await activeTab.getAttribute('aria-selected') === 'true', 'Open in New Tab deactivates the previous tab')
    const idle = await style(oldTab), active = await style(activeTab)
    check(idle.background === 'rgba(0, 0, 0, 0)' && idle.border === 'rgba(0, 0, 0, 0)' && idle.before === 'none', 'inactive tab is plain without a rectangle')
    check(idle.closeOpacity === '0' && idle.pointerEvents === 'none', 'inactive close is hidden and cannot intercept clicks')
    check(active.closeOpacity === '1' && active.before !== 'none', 'active tab retains its shape and close button')
    const screenshots = { idle: (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data }
    await oldTab.hover()
    const hovered = await style(oldTab)
    check(hovered.background !== idle.background && parseFloat(hovered.radius) > 0 && hovered.closeOpacity === '1' && hovered.pointerEvents === 'auto', 'hover reveals rounded highlight and close')
    check(JSON.stringify(idle.box) === JSON.stringify(hovered.box), 'hover does not move or resize tabs')
    check(idle.textContrast >= 4.5 && hovered.textContrast >= 4.5 && hovered.closeContrast >= 3 && active.closeContrast >= 3, 'text and close contrast across tab states')
    screenshots.hover = (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data
    await page.getByRole('heading', { name: 'Comparison', exact: true }).hover()
    check((await style(oldTab)).closeOpacity === '0', 'pointer exit hides the inactive close')
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true })
    check(await page.evaluate(() => matchMedia('(hover: none)').matches) && (await style(oldTab)).closeOpacity === '1', 'touch users retain a visible close control')
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
    await activeTab.focus(); await page.keyboard.press('Shift+Tab')
    const keyboard = await style(oldTab)
    check(keyboard.focused && keyboard.closeOpacity === '1', 'keyboard focus reveals the inactive close')
    await activeTab.focus(); await page.keyboard.press('ArrowLeft')
    check(await oldTab.getAttribute('aria-selected') === 'true' && (await style(oldTab)).closeOpacity === '1', 'arrow navigation restores the active tab')
    await oldTab.focus(); await page.keyboard.press('ArrowRight')
    await oldTab.hover(); await oldTab.locator('..').getByRole('button', { name: /^Close / }).click()
    check(await oldTab.count() === 0 && await activeTab.getAttribute('aria-selected') === 'true', 'closing an inactive tab preserves the active note')
    const geometry = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])
    check(geometry.join() === '1512,949,2' && !errors.length, 'exact viewport and no runtime errors')
    return { state, geometry, route: await page.evaluate(() => location.pathname), content: 'Comparison in Live Preview; Original inactive in idle and hover captures', idle, hovered, active, checks, errors, screenshots }
  } finally { await cdp.detach() }
}
