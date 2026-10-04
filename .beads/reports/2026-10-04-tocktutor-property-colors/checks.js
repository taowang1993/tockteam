async page => {
  const errors = [], failedRequests = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure() }));
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    if (!new URL(page.url()).pathname.startsWith('/tocktutor')) {
      const skip = page.getByRole('button', { name: 'Skip Onboarding', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.getByRole('button', { name: 'TockTutor', exact: true }).click();
    }
    await page.getByRole('button', { name: 'comparison.md', exact: true }).click();
    await page.locator('.ProseMirror hr').waitFor();
    await page.mouse.move(20, 20);
    const state = await page.evaluate(async () => {
      await document.fonts.ready;
      const button = document.querySelector('button[aria-label="tags Value Suggestions"]');
      const rule = document.querySelector('.ProseMirror hr');
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--dsw-alias-border-l3)';
      rule.parentElement.append(probe);
      const expectedRule = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        geometry: [innerWidth, innerHeight, devicePixelRatio], route: location.pathname,
        scheme: document.documentElement.style.colorScheme,
        skin: document.documentElement.dataset.tockteamSkin ?? null,
        bodySkin: document.body.dataset.tockteamSkin ?? null,
        buttonBackground: getComputedStyle(button).backgroundColor,
        sidebarBackground: getComputedStyle(document.querySelector('.tocktutor-sidebar')).backgroundColor,
        arrowColor: getComputedStyle(button.querySelector('svg')).color,
        ruleBackground: getComputedStyle(rule).backgroundColor,
        expectedRule, ruleHeight: rule.getBoundingClientRect().height,
        propertyCount: document.querySelector('[aria-label="Document Properties"]').children.length,
        propertiesExpanded: [...document.querySelectorAll('header button[aria-expanded]')].find(button => button.textContent.trim() === 'Properties').getAttribute('aria-expanded') === 'true',
      };
    });
    if (state.geometry.join() !== '1512,949,2' || state.route !== '/tocktutor/comparison.md' || state.scheme !== 'dark' || state.skin !== null || state.bodySkin !== null || state.propertyCount !== 9 || !state.propertiesExpanded || state.buttonBackground !== state.sidebarBackground || state.ruleBackground !== state.expectedRule || errors.length || failedRequests.length) throw Error(JSON.stringify({ state, errors, failedRequests }));
    return { state, errors, failedRequests };
  } finally { await cdp.detach(); }
}
