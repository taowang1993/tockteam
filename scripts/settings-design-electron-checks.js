async page => {
  const errors = [];
  const cdp = await page.context().newCDPSession(page);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.waitForFunction(() => typeof window.renderPrimitives === 'function');
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const theme = async id => {
    await page.evaluate(id => {
      for (const s of window.auditSkins) for (const name of Object.keys(s.tokens)) document.body.style.removeProperty(name);
      const skin = window.auditSkins.find(s => s.id === id);
      document.documentElement.style.colorScheme = skin?.colorScheme ?? id;
      document.body.toggleAttribute('data-ds-dark-theme', (skin?.colorScheme ?? id) === 'dark');
      delete document.body.dataset.tockteamSkin;
      if (skin) { document.body.dataset.tockteamSkin = skin.id; for (const [key, value] of Object.entries(skin.tokens)) document.body.style.setProperty(key, value); }
    }, id);
    await page.waitForTimeout(250);
  };
  const captures = [];
  const capture = async (name, content) => {
    const facts = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight, devicePixelRatio], route: location.href, mode: document.documentElement.style.colorScheme, skin: document.body.dataset.tockteamSkin ?? document.documentElement.dataset.tockteamSkin ?? null }));
    check(JSON.stringify(facts.viewport) === '[1512,949,2]' && facts.mode === 'dark' && facts.skin === null, 'canonical Electron geometry/theme: ' + JSON.stringify(facts));
    await page.screenshot({ path: 'EVIDENCE_DIRECTORY/' + name + '.png' });
    captures.push({ name, content, ...facts });
  };
  const colors = locator => locator.evaluate(e => ({ color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }));
  await page.evaluate(() => window.renderPrimitives());
  await page.getByRole('checkbox', { name: 'Checked Option' }).waitFor();
  check(await page.getByRole('checkbox', { name: 'Checked Option' }).evaluate(e => getComputedStyle(e).padding === '0px' && e.getBoundingClientRect().width === 16), 'checkbox geometry excludes native button padding');
  const palettes = [];
  for (const id of await page.evaluate(() => ['dark', 'light', ...window.auditSkins.map(s => s.id)])) {
    await theme(id);
    const button = await colors(page.getByRole('button', { name: 'Default Action' }));
    const checkbox = await colors(page.getByRole('checkbox', { name: 'Checked Option' }));
    check(contrast(button.color, button.bg) >= 4.5, id + ': primary button text contrast ' + JSON.stringify(button));
    check(contrast(checkbox.color, checkbox.bg) >= 3, id + ': checked mark contrast');
    palettes.push({ id, button, checkbox });
  }
  await theme('dark');
  await page.evaluate(() => window.renderLauncher());
  await page.getByRole('heading', { name: 'TockLauncher', exact: true }).waitFor();
  await page.locator('details').evaluateAll(es => es.forEach(e => { e.open = true; }));
  const input = page.getByRole('spinbutton', { name: 'Maximum Results', exact: true });
  check(await input.evaluate(e => e.getBoundingClientRect().height) === 32, 'text inputs render 32px including padding and border');
  check(await page.locator('[data-slot="field-description"]').first().evaluate(e => getComputedStyle(e).marginTop === '0px' && getComputedStyle(e).marginBottom === '0px'), 'field descriptions have no UA margins');
  const range = page.getByRole('slider', { name: 'Search Fuzziness' });
  check(await range.evaluate(e => getComputedStyle(e).padding === '0px' && getComputedStyle(e).borderWidth === '0px'), 'range does not use text-input geometry');
  for (const name of ['Appearance and Input', 'Keyboard and Mouse', 'Browser and Shortcuts', 'Local Transformation Extensions', 'File Search', 'Network Extensions']) check(await page.getByRole('heading', { name, exact: true }).count() === 1, 'one heading: ' + name);
  const history = page.getByRole('switch', { name: 'Enable Search History' });
  const previous = await history.getAttribute('aria-checked');
  await page.getByText('Search History', { exact: true }).click();
  check(await history.getAttribute('aria-checked') !== previous, 'visible label toggles Search History');
  check(await history.evaluate(e => !!e.getAttribute('aria-describedby')?.split(' ').some(id => document.getElementById(id)?.textContent.includes('Desktop-owned'))), 'switch help is associated');
  await capture('launcher-dark', 'TockLauncher settings; all disclosures open; in-memory settings fixture');
  for (const width of [600, 375]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 949, deviceScaleFactor: 2, mobile: false });
    const widths = await page.locator('[data-slot="field-content"]').evaluateAll(es => es.filter(e => e.getBoundingClientRect().height > 0).map(e => e.getBoundingClientRect().width));
    check(widths.every(w => w >= 120), 'readable field labels at ' + width + ': ' + Math.min(...widths));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  await page.evaluate(() => window.renderMarketplace());
  await page.locator('input').first().waitFor();
  await page.locator('input').first().focus();
  check(await page.locator('input').first().evaluate(e => { const s = getComputedStyle(e), p = getComputedStyle(e.parentElement); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' || p.boxShadow !== 'none'; }), 'marketplace search shows keyboard focus');
  await page.emulateMedia({ colorScheme: 'dark' });
  const statusDark = await colors(page.locator('[role="status"]').first());
  await page.emulateMedia({ colorScheme: 'light' });
  check(JSON.stringify(await colors(page.locator('[role="status"]').first())) === JSON.stringify(statusDark), 'marketplace follows app theme, not system scheme');
  await page.evaluate(() => window.renderAssistant());
  await page.getByRole('button', { name: 'Add Context', exact: true }).click();
  await page.getByText('Assistant Settings', { exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Assistant Options' });
  for (const id of palettes.map(p => p.id)) {
    await theme(id);
    const assistant = await colors(popup);
    const save = await colors(page.getByRole('button', { name: 'Save Settings', exact: true }));
    check(contrast(assistant.color, assistant.bg) >= 4.5, id + ': assistant portal text contrast');
    check(contrast(save.color, save.bg) >= 4.5, id + ': assistant save contrast');
    await page.getByRole('textbox', { name: 'Provider', exact: true }).focus();
    check(await page.getByRole('textbox', { name: 'Provider', exact: true }).evaluate(e => { const s = getComputedStyle(e); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }), id + ': assistant portal keyboard focus');
  }
  await theme('dark');
  await capture('assistant-dark', 'TockTutor assistant; Assistant Settings body portal open; in-memory settings fixture');
  await page.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden' });
  await page.waitForTimeout(50);
  check(await page.getByRole('button', { name: 'Add Context', exact: true }).evaluate(e => document.activeElement === e), 'assistant restores trigger focus');
  check(errors.length === 0, JSON.stringify(errors));
  await page.evaluate(() => window.renderLauncher());
  await page.getByRole('heading', { name: 'TockLauncher', exact: true }).waitFor();
  check(await page.getByRole('heading', { name: 'TockLauncher', exact: true, level: 2 }).count() === 1, 'settings page heading has consistent level');
  await page.evaluate(() => window.renderSidebar());
  await page.getByRole('heading', { name: 'Side Panel', exact: true }).waitFor();
  check(await page.getByRole('heading', { name: 'Side Panel', level: 2 }).evaluate(e => getComputedStyle(e).fontSize === '18px'), 'Side Panel has an 18px page heading');
  check(await page.getByRole('heading', { name: 'Agent Access', level: 3 }).count() === 1, 'Side Panel subsection follows heading order');
  for (const render of ['renderSidebar', 'renderPresets']) {
    await page.evaluate(name => window[name](), render);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 280, height: 949, deviceScaleFactor: 2, mobile: false });
    await page.waitForTimeout(100);
    const geometry = await page.locator('main').evaluate(e => { const root = e.firstElementChild, r = root.getBoundingClientRect(); return { width: root.clientWidth, scroll: root.scrollWidth, overflow: [...root.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > r.right + 1).map(n => [n.tagName, n.textContent.slice(0, 35), n.getBoundingClientRect().width]) }; });
    check(geometry.scroll <= geometry.width, render + ' narrow content fits: ' + JSON.stringify(geometry));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  if (failures.length) throw new Error(failures.join('\n'));
  return { palettes, captures, errors, viewport: await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]) };
}
