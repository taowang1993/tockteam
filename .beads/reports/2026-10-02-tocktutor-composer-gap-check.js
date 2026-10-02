async page => {
  const facts = await page.evaluate(() => {
    const box = element => {
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    const root = document.querySelector('.tocktutor-grid')
    const footer = document.querySelector('[aria-label="TockTutor Status Bar"]')
    const panel = document.querySelector('[aria-label="Right Sidebar"][data-open="true"]')
    const composer = document.querySelector('.tocktutor-assistant-composer')
    const wrap = document.querySelector('.tocktutor-assistant-composer-wrap')
    if (!root || !footer || !panel || !composer || !wrap || composer.getBoundingClientRect().width === 0) {
      throw Error('Open Assistant in the real TockTutor workbench first')
    }
    return {
      geometry: [innerWidth, innerHeight, devicePixelRatio],
      root: box(root), footer: box(footer), composer: box(composer),
      footerCount: document.querySelectorAll('[aria-label="TockTutor Status Bar"]').length,
      footerOutsideEditor: !footer.closest('[aria-label="Note Editor"]'),
      footerSafeArea: parseFloat(getComputedStyle(panel).paddingBottom),
      composerPadding: parseFloat(getComputedStyle(wrap).paddingBottom),
      gap: footer.getBoundingClientRect().top - composer.getBoundingClientRect().bottom,
      scheme: document.documentElement.style.colorScheme,
      skin: document.body.dataset.tockteamSkin ?? null,
    }
  })
  if (JSON.stringify(facts.geometry) !== '[1512,949,2]' || facts.footerCount !== 1 || !facts.footerOutsideEditor || Math.abs(facts.footer.right - facts.root.right) > .5 || Math.abs(facts.footer.bottom - facts.root.bottom) > .5 || facts.footerSafeArea !== 28 || facts.composerPadding !== 2 || Math.abs(facts.gap - 2) > .5) {
    throw Error('Expected a two-pixel composer gap and the unchanged right-edge footer: ' + JSON.stringify(facts))
  }
  return facts
}
