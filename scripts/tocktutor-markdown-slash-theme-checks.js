// App-scoped Playwright check on the owned Desktop used by tocktutor-markdown-slash-checks.js.
async page => {
  page.setDefaultTimeout(8000);
  const errors = [], appearances = [], checks = [], screenshots = {};
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const check = (value, name) => { if (!value) throw Error(name); checks.push(name); };
  const cdp = await page.context().newCDPSession(page);
  // Renderer-only focus emulation keeps animation frames running while the owned window is occluded; never activate the OS window.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' });
  if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click();
  {
    const preferences = await page.evaluate(async () => {
      const response = await fetch('/tockteam/skins/preferences');
      if (!response.ok) throw Error('Seeded preferences failed to load');
      return response.json();
    });
    const skin = preferences.activeId;
    await page.waitForFunction(skin => (document.body.dataset.tockteamSkin ?? null) === skin && ['light', 'dark'].includes(document.documentElement.style.colorScheme), skin);
    const theme = await page.evaluate(() => document.documentElement.style.colorScheme);
    const name = skin ?? theme;
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click();
    await page.getByRole('button', { name: 'Drafts/Source.md', exact: true }).click();
    const editing = page.getByRole('button', { name: 'Switch to Editing View', exact: true });
    if (await editing.isVisible()) await editing.click();
    const editor = page.locator('.ProseMirror'), heading = editor.locator('h1').first();
    await heading.click();
    await heading.evaluate(el => { getSelection().selectAllChildren(el); getSelection().collapseToEnd(); });
    await page.keyboard.type('/');
    const list = page.getByRole('listbox', { name: 'Block Commands' });
    await list.waitFor();
    check(await list.getByRole('option').count() === 20, `${name}/${theme}: 20 commands`);
    for (let i = 0; i < 19; i++) await page.keyboard.press('ArrowDown');
    const down = await list.evaluate(el => el.scrollTop);
    for (let i = 0; i < 19; i++) await page.keyboard.press('ArrowUp');
    const menu = await list.evaluate(el => {
      const shell = el.closest('.tocktutor-slash-menu'), group = el.querySelector('[cmdk-group-heading]');
      return { fill: getComputedStyle(shell).backgroundColor, sidebar: getComputedStyle(document.querySelector('aside[aria-label="Files"]')).backgroundColor, top: el.scrollTop, groupVisible: group.getBoundingClientRect().top >= el.getBoundingClientRect().top };
    });
    check(down > menu.top && menu.groupVisible, `${name}/${theme}: keyboard scrolls both directions`);
    check(menu.fill === menu.sidebar, `${name}/${theme}: shell chrome fill retained`);
    await list.getByRole('option', { name: 'New Note', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New Note', exact: true });
    await dialog.getByLabel('Note Name', { exact: true }).fill('A long note name with spaces and brackets [and Unicode 健康]');
    await dialog.getByLabel('Note Name', { exact: true }).press('Tab');
    check(await dialog.evaluate(el => el.contains(document.activeElement)), `${name}/${theme}: keyboard stays in dialog`);
    const metrics = await dialog.evaluate(el => {
      const box = el.getBoundingClientRect();
      const ctx = document.createElement('canvas').getContext('2d');
      const luminance = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0); };
      const bg = luminance(getComputedStyle(el).backgroundColor);
      const contrasts = [...el.querySelectorAll('h2,label,p,input')].filter(node => node.textContent || node.matches('input')).map(node => { const fg = luminance(getComputedStyle(node).color); return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05); });
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, overflow: el.scrollWidth > el.clientWidth, contrast: Math.min(...contrasts), frontmost: el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
    });
    check(metrics.frontmost && !metrics.overflow && metrics.x >= 0 && metrics.y >= 40 && metrics.right <= 1512 && metrics.bottom <= 949, `${name}/${theme}: visible bounded form`);
    check(metrics.contrast >= 4.5, `${name}/${theme}: form contrast`);
    if (!skin && theme === 'dark') screenshots.dark = (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;
    appearances.push({ name, skin, theme, systemTheme: theme === 'dark' ? 'light' : 'dark', reducedMotion: true, down, menu, metrics });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement.matches('.ProseMirror'));
    check(true, `${name}/${theme}: Escape restores editor focus`);
    await page.keyboard.press('Backspace');
  }
  await page.keyboard.press('Meta+s');
  check(errors.length === 0, 'no runtime errors');
  const state = await page.evaluate(() => ({ route: location.pathname, viewport: [innerWidth, innerHeight, devicePixelRatio], theme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, bodySkin: document.body.dataset.tockteamSkin ?? null }));
  check(state.viewport.join(',') === '1512,949,2' && state.htmlSkin === null, 'exact capture geometry and skin ownership');
  if (state.bodySkin === null && state.theme === 'dark') check(true, 'canonical unskinned dark capture');
  return { checks, errors, state, appearances, screenshots };
}
