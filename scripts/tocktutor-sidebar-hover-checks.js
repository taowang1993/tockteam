// playwright-cli run-code --filename=scripts/tocktutor-sidebar-hover-checks.js
// Attach only to an owned extended_display endpoint. Isolated fixture: Original.md
// and This is a comparison note for tocktutor and obsidian.md.
async page => {
  const errors = [], checks = []
  const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  const metrics = locator => locator.evaluate(el => {
    const css = getComputedStyle(el), box = el.getBoundingClientRect()
    const ctx = document.createElement('canvas').getContext('2d')
    const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
    const foreground = luminance(css.color), background = luminance(css.backgroundColor)
    return { box: box.toJSON(), fillSize: box.width - 2 * parseFloat(css.borderLeftWidth), background: rgb(css.backgroundColor), luminance: background, baseline: luminance(css.getPropertyValue('--tt-selected')), contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05), opacity: css.opacity, focus: document.activeElement === el, focusVisible: el.matches(':focus-visible') }
  })
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' })
    if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click()
    const state = await page.evaluate(() => ({ theme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, skin: document.body.dataset.tockteamSkin ?? null }))
    await page.emulateMedia({ colorScheme: state.theme === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' })
    const path = 'This is a comparison note for tocktutor and obsidian.md'
    const row = page.getByRole('button', { name: path, exact: true })
    const more = page.getByRole('button', { name: `Note Actions for ${path}`, exact: true })
    await page.getByRole('button', { name: 'Original.md', exact: true }).click()
    await row.hover()
    const hovered = await metrics(row), idleIcon = await metrics(more)
    check(idleIcon.opacity === '1' && idleIcon.background.join() === hovered.background.join(), 'row hover reveals dots without a contrasting square')
    await more.hover()
    const icon = await metrics(more)
    check(icon.background.join() !== hovered.background.join(), 'icon hover reveals the square')
    check(icon.box.width === 24 && icon.box.height === 24 && icon.fillSize === 18, '18px square retains a 24px target')
    check(icon.contrast >= 3 && hovered.contrast >= 4.5, 'icon and row contrast')
    check(JSON.stringify(hovered.box) === JSON.stringify((await metrics(row)).box), 'no hover layout shift')
    await more.click()
    const menu = page.getByRole('menu', { name: 'Note Actions', exact: true })
    await menu.waitFor()
    check(await page.getByRole('button', { name: 'Original.md', exact: true }).getAttribute('aria-current') === 'page', 'menu does not select the note')
    await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' })
    check((await metrics(more)).focus, 'Escape restores focus')
    await row.focus(); await page.keyboard.press('Tab'); await row.hover()
    const keyboardIcon = await metrics(more)
    check(keyboardIcon.focus && keyboardIcon.focusVisible && keyboardIcon.background.join() !== hovered.background.join(), 'keyboard focus shows the square without icon hover')
    await row.click()
    await page.getByRole('heading', { name: 'Comparison', exact: true }).click()
    const active = await metrics(row)
    check(state.theme === 'dark' ? active.luminance < active.baseline : active.luminance === active.baseline, 'active row darkens only in app dark mode')
    await row.hover()
    check((await metrics(row)).background.join() === active.background.join(), 'active row stays dark on hover')
    check((await metrics(more)).background.join() === active.background.join(), 'active row hover shows no square')
    await more.hover()
    check((await metrics(more)).background.join() !== active.background.join(), 'active icon hover shows square')
    const geometry = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])
    check(geometry.join() === '1512,949,2' && !errors.length, 'exact geometry and zero runtime errors')
    return { state, geometry, route: await page.evaluate(() => location.pathname), content: 'Comparison note in Live Preview; active ellipsis hovered', hovered, icon, active, checks, errors, screenshot: (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data }
  } finally { await cdp.detach() }
}
