async page => {
  const appearances = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  for (const name of ['Default', 'Navy', 'Jade', 'Ember']) for (const theme of ['Light', 'Dark']) {
    if (!page.url().endsWith('/settings')) await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await settings.getByRole('radio', { name, exact: true }).click();
    await settings.getByRole('button', { name: theme, exact: true }).click();
    const skin = name === 'Default' ? null : 'tockteam-skin-' + name.toLowerCase();
    await page.waitForFunction(({ skin, theme }) => (document.body.dataset.tockteamSkin ?? null) === skin && document.documentElement.style.colorScheme === theme.toLowerCase(), { skin, theme });
    await page.emulateMedia({ colorScheme: theme === 'Dark' ? 'light' : 'dark', reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'TockTutor', exact: true }).click();
    await page.getByRole('button', { name: 'Properties.md', exact: true }).click();
    await page.getByRole('button', { name: 'comparison.md', exact: true }).click();
    await page.locator('.ProseMirror h2').filter({ hasText: /^Data$/ }).waitFor();
    await page.mouse.move(20, 20);
    const result = await page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror');
      const done = [...editor.querySelectorAll('p')].find(el => el.textContent === 'Completed task');
      const pending = [...editor.querySelectorAll('p')].find(el => el.textContent.startsWith('Pending task with'));
      const header = [...document.querySelectorAll('header')].find(header => [...header.querySelectorAll('button')].some(button => button.textContent.trim() === 'Properties'));
      const inputs = [...header.querySelectorAll('input[data-slot="input"]')].filter(input => input.getAttribute('aria-label') !== 'Note title');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].map((value, index) => index === 3 ? value / 255 : value); };
      const luminance = rgb => rgb.slice(0, 3).map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const contrast = element => {
        const parents = []; for (let node = element; node; node = node.parentElement) parents.unshift(node);
        let background = [255, 255, 255];
        for (const node of parents) { const color = rgba(getComputedStyle(node).backgroundColor); background = background.map((value, index) => color[index] * color[3] + value * (1 - color[3])); }
        const foreground = rgba(getComputedStyle(element).color); const top = luminance(foreground), bottom = luminance(background);
        return (Math.max(top, bottom) + .05) / (Math.min(top, bottom) + .05);
      };
      const button = header.querySelector('button[aria-label="tags Value Suggestions"]');
      const rule = editor.querySelector('hr');
      const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--dsw-alias-border-l3)'; rule.parentElement.append(probe);
      const expectedRule = getComputedStyle(probe).backgroundColor; probe.remove();
      return { buttonBackground: getComputedStyle(button).backgroundColor, sidebarBackground: getComputedStyle(document.querySelector('.tocktutor-sidebar')).backgroundColor, arrowContrast: contrast(button.querySelector('svg')), ruleBackground: getComputedStyle(rule).backgroundColor, expectedRule, route: location.pathname, theme: document.documentElement.style.colorScheme, skin: document.body.dataset.tockteamSkin ?? null, completed: getComputedStyle(done).textDecorationLine, pending: getComputedStyle(pending).textDecorationLine, viewport: [innerWidth, innerHeight, devicePixelRatio], propertiesExpanded: header.querySelector('button[aria-expanded]').getAttribute('aria-expanded') === 'true', borders: inputs.map(input => getComputedStyle(input).borderTopWidth), inputHeights: inputs.map(input => input.getBoundingClientRect().height), minimumInputContrast: Math.min(...inputs.map(contrast)), sourceHintContrast: contrast(header.querySelector('.tocktutor-property-source')), horizontalOverflow: header.scrollWidth > header.clientWidth }; 
    });
    if (result.buttonBackground !== result.sidebarBackground || result.arrowContrast < 3 || result.ruleBackground !== result.expectedRule || result.route !== '/tocktutor/comparison.md' || result.theme !== theme.toLowerCase() || result.skin !== skin || result.completed !== 'line-through' || result.pending !== 'none' || result.viewport.join() !== '1512,949,2' || !result.propertiesExpanded || result.borders.some(border => border !== '0px') || result.minimumInputContrast < 4.5 || result.sourceHintContrast < 4.5 || result.horizontalOverflow) throw Error(JSON.stringify(result));
    appearances.push({ name, systemTheme: theme === 'Dark' ? 'light' : 'dark', ...result });
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('radio', { name: 'Default', exact: true }).click();
  await settings.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'TockTutor', exact: true }).click();
  await page.getByRole('button', { name: 'Properties.md', exact: true }).click();
  await page.getByRole('button', { name: 'comparison.md', exact: true }).click();
  await page.locator('.ProseMirror h2').filter({ hasText: /^Data$/ }).waitFor();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  if (errors.length) throw Error(JSON.stringify(errors));
  return { appearances, errors };
}
