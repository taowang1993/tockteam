async page => {
  const facts = await page.evaluate(() => {
    const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
    const root = document.querySelector('.tocktutor-grid'), footers = [...document.querySelectorAll('[aria-label="TockTutor Status Bar"]')]
    const footer = footers[0], panel = document.querySelector('[aria-label="Right Sidebar"][data-open="true"]') ?? document.querySelector('[aria-label="Workbench Utilities"][data-open="true"]')
    if (!root || !footer) throw Error('Open the real TockTutor workbench first')
    const wrap = document.querySelector('.tocktutor-assistant-composer-wrap'), composer = document.querySelector('.tocktutor-assistant-composer')
    const visibleComposer = composer && composer.getBoundingClientRect().width > 0
    let composerLift = null
    if (visibleComposer) {
      const before = box(composer), old = wrap.style.paddingBottom
      wrap.style.paddingBottom = '12px'
      const baseline = box(composer)
      wrap.style.paddingBottom = old
      composerLift = baseline.y - before.y
    }
    return { geometry: [innerWidth, innerHeight, devicePixelRatio], root: box(root), footer: box(footer), footerCount: footers.length, footerOutsideEditor: !footer.closest('[aria-label="Note Editor"]'), text: footer.textContent, panel: panel ? box(panel) : null, panelFooterSpace: panel ? parseFloat(getComputedStyle(panel).paddingBottom) : null, composer: visibleComposer ? box(composer) : null, composerLift, composerPadding: visibleComposer ? parseFloat(getComputedStyle(wrap).paddingBottom) : null, gap: visibleComposer ? footer.getBoundingClientRect().top - composer.getBoundingClientRect().bottom : null, scheme: document.documentElement.style.colorScheme, skin: document.body.dataset.tockteamSkin ?? null }
  })
  if (JSON.stringify(facts.geometry) !== '[1512,949,2]' || facts.footerCount !== 1 || !facts.footerOutsideEditor || Math.abs(facts.footer.right-facts.root.right) > .5 || Math.abs(facts.footer.bottom-facts.root.bottom) > .5) throw Error('Footer must stay at the workspace right edge: '+JSON.stringify(facts))
  if (facts.panel && facts.panelFooterSpace < facts.footer.height) throw Error('Panel needs footer-safe space: '+JSON.stringify(facts))
  if (facts.composer && (facts.composerLift !== 5 || facts.composerPadding !== 17 || facts.gap < 5)) throw Error('Composer must lift5px and remain clear of footer: '+JSON.stringify(facts))
  return facts
}
