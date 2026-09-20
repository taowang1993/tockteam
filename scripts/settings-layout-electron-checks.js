async page => {
  page = page.context().pages().find(p => p.url().startsWith('http://127.0.0.1:'));
  const errors = [], failures = [], captures = [];
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  const check = (condition, message) => { if (!condition) failures.push(message); };
  await page.waitForTimeout(1000);
  const welcome = page.getByRole('button', { name: 'Continue', exact: true });
  if (await welcome.count()) await welcome.click();
  const later = page.getByRole('button', { name: 'Configure later', exact: true });
  await later.waitFor(); await later.click(); await later.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const names = await dialog.locator('nav button').allTextContents();
  for (const name of names) {
    await dialog.locator('nav').getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(400);
    const tabs = await dialog.getByRole('tab').allTextContents();
    for (const tab of tabs.length ? tabs : [null]) {
      if (tab) {
        await dialog.getByRole('tab', { name: tab, exact: true }).click();
        await page.waitForTimeout(400);
      }
      const facts = await page.evaluate(name => {
        const slot = document.querySelector('[data-slot="settings.section"]');
        for (let p = slot; p; p = p.parentElement) p.scrollTop = 0;
        const heading = slot.querySelector('h1,h2');
        const rect = element => {
          const r = element.getBoundingClientRect(), s = getComputedStyle(element);
          return { x: r.x, y: r.y, width: r.width, height: r.height, font: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight };
        };
        return {
          name, activeTab: slot.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? null,
          viewport: [innerWidth, innerHeight, devicePixelRatio], colorScheme: document.documentElement.style.colorScheme,
          skin: document.body.dataset.tockteamSkin ?? document.documentElement.dataset.tockteamSkin ?? null,
          route: location.pathname, title: heading ? { text: heading.textContent, ...rect(heading) } : null,
          selected: document.querySelector('[role="dialog"] nav button[aria-current="true"]')?.textContent,
        };
      }, name);
      check(JSON.stringify(facts.viewport) === '[1512,949,2]', name + ': capture geometry');
      check(facts.colorScheme === 'dark' && facts.skin === null, name + ': built-in dark theme with no skin');
      check(facts.selected === name, name + ': selected navigation');
      check(facts.activeTab === tab, name + ': selected tab ' + tab);
      const file = [name, tab].filter(Boolean).join('-').toLowerCase().replaceAll(' ', '-') + '.png';
      await page.screenshot({ path: 'EVIDENCE_DIRECTORY/' + file });
      captures.push({ ...facts, file });
    }
  }
  const reference = captures.find(c => c.name === 'Agent Presets').title;
  for (const capture of captures) {
    check(capture.title?.text === capture.name, capture.name + ': visible page title');
    if (!capture.title) continue;
    check(capture.title.font === '18px' && capture.title.weight === '600' && capture.title.lineHeight === '24px', capture.name + ': consistent title typography');
    check(Math.abs(capture.title.x - reference.x) < .5 && Math.abs(capture.title.y - reference.y) < .5, capture.name + ': title origin differs from Agent Presets: ' + JSON.stringify(capture.title));
  }
  // Known startup defect tockteam-0ecj stays visible in evidence; no blanket error waiver.
  const unexpectedErrors = errors.filter(e => !e.message.includes('workspaces.startSession is not a function'));
  check(unexpectedErrors.length === 0, 'unexpected runtime errors: ' + JSON.stringify(unexpectedErrors));
  return { mode: 'real Desktop settings, isolated profile, built-in dark theme', captures, errors, failures };
}
