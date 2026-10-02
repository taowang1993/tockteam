async page => {
  const facts = await page.evaluate(() => {
    const box = element => {
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    const title = document.querySelector('[aria-label="TockTutor Title Bar"]')
    const left = title?.querySelector('.tocktutor-titlebar-sidebar')
    const chooser = title?.querySelector('[aria-label="Right Sidebar View"]')
    const right = chooser?.parentElement
    const panel = document.querySelector('[aria-label="Right Sidebar"][data-open="true"]')
    if (!left || !right || !panel) throw Error('Open Assistant or Properties in the real TockTutor workbench first')
    const leftStyle = getComputedStyle(left), rightStyle = getComputedStyle(right)
    const footer = document.querySelector('[aria-label="TockTutor Status Bar"]')
    return {
      geometry: [innerWidth, innerHeight, devicePixelRatio], route: location.pathname,
      scheme: document.documentElement.style.colorScheme,
      rootSkin: document.documentElement.dataset.tockteamSkin ?? null,
      bodySkin: document.body.dataset.tockteamSkin ?? null,
      view: chooser.getAttribute('data-view'), title: box(title), left: box(left), right: box(right), panel: box(panel),
      leftDivider: { width: leftStyle.borderRightWidth, style: leftStyle.borderRightStyle, color: leftStyle.borderRightColor },
      rightDivider: { width: rightStyle.borderLeftWidth, style: rightStyle.borderLeftStyle, color: rightStyle.borderLeftColor },
      rightOverflow: right.scrollWidth > right.clientWidth + 1,
      footer: box(footer), footerCount: document.querySelectorAll('[aria-label="TockTutor Status Bar"]').length,
      footerSafeArea: parseFloat(getComputedStyle(panel).paddingBottom),
    }
  })
  if (JSON.stringify(facts.geometry) !== '[1512,949,2]' || facts.leftDivider.width !== '1px' || facts.rightDivider.width !== facts.leftDivider.width || facts.rightDivider.style !== facts.leftDivider.style || facts.rightDivider.color !== facts.leftDivider.color || facts.rightDivider.style !== 'solid' || Math.abs(facts.right.x - facts.panel.x) > .5 || facts.right.width !== facts.panel.width || facts.right.y !== facts.title.y || facts.right.height !== facts.title.height || facts.title.height !== 40 || facts.rightOverflow || facts.footerCount !== 1 || facts.footer.right !== 1512 || facts.footer.bottom !== 949 || facts.footerSafeArea !== 28) {
    throw Error('Right titlebar must match the left divider and align with its pane: ' + JSON.stringify(facts))
  }
  return facts
}
