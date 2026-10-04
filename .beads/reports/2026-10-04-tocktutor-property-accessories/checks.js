async page => {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    if (!new URL(page.url()).pathname.startsWith('/tocktutor')) {
      const skip = page.getByRole('button', { name: 'Skip Onboarding', exact: true })
      if (await skip.isVisible()) await skip.click()
      await page.getByRole('button', { name: 'TockTutor', exact: true }).click()
    }
    await page.getByRole('button', { name: 'comparison.md', exact: true }).click()
    await page.locator('.ProseMirror h2').filter({ hasText: /^Data$/ }).waitFor()
    await page.mouse.move(20, 20)
    const state = await page.evaluate(async () => {
      await document.fonts.ready
      const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right } }
      const rows = document.querySelector('[aria-label="Document Properties"]')
      const tags = [...rows.children].find(row => row.querySelector('button[aria-label="Rename Property tags"]'))
      const lastChip = [...tags.querySelectorAll('button[aria-label^="Remove "]')].at(-1).closest('span')
      const suggestions = tags.querySelector('button[aria-label="tags Value Suggestions"]')
      const source = rows.querySelector('.tocktutor-property-source')
      const text = source.querySelector('span'), warning = source.querySelector('svg')
      const range = document.createRange(); range.selectNodeContents(text)
      const textBounds = range.getBoundingClientRect()
      const sourceRect = rect(source), warningRect = rect(warning), tagRect = rect(lastChip), suggestionsRect = rect(suggestions)
      return {
        geometry: [innerWidth, innerHeight, devicePixelRatio],
        scheme: document.documentElement.style.colorScheme,
        skin: document.documentElement.dataset.tockteamSkin ?? null,
        bodySkin: document.body.dataset.tockteamSkin ?? null,
        route: location.pathname,
        propertiesExpanded: document.querySelector('header button[aria-expanded]').getAttribute('aria-expanded') === 'true',
        propertyCount: rows.children.length,
        tagRect, suggestionsRect, sourceRect, warningRect,
        tagSuggestionsGap: suggestionsRect.x - tagRect.right,
        warningGap: warningRect.x - textBounds.right,
        warningDecorationHidden: warning.getAttribute('aria-hidden') === 'true',
        sourceHint: source.title,
        overflow: [...rows.children].filter(row => row.scrollWidth > row.clientWidth).map(row => row.querySelector('dt').textContent.trim()),
      }
    })
    if (state.geometry.join() !== '1512,949,2' || state.scheme !== 'dark' || state.skin !== null || state.bodySkin !== null || state.route !== '/tocktutor/comparison.md' || !state.propertiesExpanded || state.propertyCount !== 9 || state.overflow.length || state.tagSuggestionsGap < 0 || state.tagSuggestionsGap > 8 || state.warningGap < 0 || state.warningGap > 12 || !state.warningDecorationHidden || state.sourceHint !== 'Use Source Mode to edit this value.') throw Error(JSON.stringify(state))
    return state
  } finally { await cdp.detach() }
}
