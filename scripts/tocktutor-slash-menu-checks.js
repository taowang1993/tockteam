// Attach with playwright-cli run-code to an owned extended_display Desktop endpoint.
// Isolated fixture: Slash Editing.md containing 健康 **Lesson**, Before after, Drag This Block, Destination Block.
async page => {
  const errors = [], screenshots = {}, checks = [], appearances = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const check = (condition, name) => { if (!condition) throw Error(name); checks.push(name); };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' });
  if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'TockTutor', exact: true }).click();
  await page.getByRole('button', { name: 'Slash Editing.md', exact: true }).click();
  const editor = page.locator('.ProseMirror');
  await editor.waitFor();
  const heading = editor.locator('h1').first();
  await heading.click();
  await heading.evaluate(el => getSelection().collapse(el.firstChild, 2));
  await page.keyboard.type('/');
  const list = page.getByRole('listbox', { name: 'Block Commands' });
  await list.waitFor();
  check(await list.getByRole('option').count() === 16, 'full command catalog');
  check(await page.evaluate(() => document.activeElement.matches('.ProseMirror')), 'editor keeps focus');
  check(await page.evaluate(() => {
    const editor = document.activeElement;
    return document.getElementById(editor.getAttribute('aria-controls'))?.getAttribute('role') === 'listbox'
      && document.getElementById(editor.getAttribute('aria-activedescendant'))?.getAttribute('role') === 'option';
  }), 'accessible editor-to-list association');
  const appearance = await page.evaluate(() => ({ skin: document.body.dataset.tockteamSkin ?? null, theme: document.documentElement.style.colorScheme }));
  await page.emulateMedia({ colorScheme: appearance.theme === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' });
  await page.waitForFunction(() => !!document.querySelector('.tocktutor-slash-menu')?.style.left);
  const metrics = await list.evaluate(list => {
    const box = list.closest('.tocktutor-slash-menu').getBoundingClientRect();
    const option = list.querySelector('[aria-selected="true"]');
    const context = document.createElement('canvas').getContext('2d');
    const rgb = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
    const light = rgb => rgb.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const css = getComputedStyle(option), background = getComputedStyle(list.closest('[cmdk-root]')).backgroundColor;
    const fg = light(rgb(css.color)), bg = light(rgb(css.backgroundColor)), normalBg = light(rgb(background));
    const groupFg = light(rgb(getComputedStyle(list.querySelector('[cmdk-group-heading] span')).color));
    return { x: box.x, y: box.y, right: box.right, bottom: box.bottom,
      selectedContrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05),
      normalContrast: (Math.max(fg, normalBg) + .05) / (Math.min(fg, normalBg) + .05),
      groupContrast: (Math.max(groupFg, normalBg) + .05) / (Math.min(groupFg, normalBg) + .05) };
  });
  check(metrics.x >= 0 && metrics.y >= 40 && metrics.right <= 1512 && metrics.bottom <= 949, 'bounded menu geometry');
  check(metrics.selectedContrast >= 4.5 && metrics.normalContrast >= 4.5 && metrics.groupContrast >= 4.5, 'text and icon contrast');
  appearances.push({ ...appearance, systemTheme: appearance.theme === 'dark' ? 'light' : 'dark', metrics });
  screenshots[appearance.skin ?? appearance.theme] = (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;
  await page.keyboard.type('h2');
  await page.waitForFunction(() => document.querySelectorAll('.tocktutor-slash-menu [role="option"]').length === 1);
  await page.keyboard.press('Enter');
  await editor.locator('h2').first().waitFor();
  check(await editor.locator('h2').first().textContent() === '健康 Lesson', 'heading prefix and suffix preserved');
  check(await editor.locator('h2 strong').textContent() === 'Lesson', 'bold suffix preserved');
  await page.keyboard.press('Meta+z');
  await editor.locator('h1').first().waitFor();
  check(await editor.locator('h1').textContent() === '健康/h2 Lesson', 'one undo restores query and original heading');
  await page.keyboard.press('Meta+Shift+z');
  await editor.locator('h2').first().waitFor();

  const paragraph = editor.locator('p').filter({ hasText: /^Before after$/ });
  await paragraph.click();
  await paragraph.evaluate(el => getSelection().collapse(el.firstChild, 6));
  await page.keyboard.type('/quote');
  await page.getByRole('option', { name: 'Quote', exact: true }).waitFor();
  await page.getByRole('option', { name: 'Quote', exact: true }).click();
  check(await editor.locator('blockquote').textContent() === 'Before after', 'pointer command preserves middle-of-block suffix');
  await page.keyboard.press('Meta+z');
  // Return the query to literal text, then remove it using native editing.
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  check(await paragraph.count() === 1, 'paragraph restored');

  const drag = editor.locator('p').filter({ hasText: /^Drag This Block$/ });
  const hoverDrag = async () => {
    await drag.hover();
    await page.waitForFunction(() => {
      const row = [...document.querySelectorAll('.ProseMirror > p')].find(el => el.textContent === 'Drag This Block');
      const handle = document.querySelector('.tocktutor-block-handle[data-show="true"]');
      return row && handle && Math.abs(row.getBoundingClientRect().top - handle.getBoundingClientRect().top) < 2;
    });
  };
  await hoverDrag();
  const add = page.getByRole('button', { name: 'Add Block', exact: true });
  await add.waitFor();
  await add.click();
  await list.waitFor();
  await page.keyboard.type('h3');
  await page.getByRole('option', { name: 'Heading 3', exact: true }).waitFor();
  await page.keyboard.press('Enter');
  check(await editor.locator('h3').count() === 1, 'add handle uses same command menu');
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await hoverDrag();
  const handle = page.getByRole('button', { name: 'Drag Block', exact: true });
  await handle.waitFor();
  const destination = editor.locator('p').filter({ hasText: /^Destination Block$/ });
  const box = await destination.boundingBox();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2, { steps: 3 });
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 2, { steps: 12 });
  await page.mouse.move(box.x + box.width - 7, box.y + box.height - 2);
  await page.mouse.up();
  const text = await editor.innerText();
  check(text.indexOf('Destination Block') < text.indexOf('Drag This Block'), 'native drag reorders whole block');
  check((text.match(/Drag This Block/g) ?? []).length === 1, 'drag neither duplicates nor drops content');
  await page.getByRole('button', { name: 'More Note Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Split Right', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ProseMirror').length === 2);
  for (const index of [0, 1]) {
    const pane = page.locator('.ProseMirror').nth(index);
    const heading = pane.locator('h2').first();
    await heading.click();
    await heading.evaluate(el => { getSelection().selectAllChildren(el); getSelection().collapseToEnd(); });
    await page.keyboard.type('/'); await list.waitFor();
    check(await page.getByRole('listbox', { name: 'Block Commands' }).count() === 1, `pane ${index}: exactly one active menu`);
    const paneBox = await pane.locator('xpath=ancestor::div[contains(@class,"tocktutor-editor-body")]').boundingBox();
    const menuBox = await page.locator('.tocktutor-slash-menu[data-show="true"]').boundingBox();
    check(menuBox.x >= paneBox.x && menuBox.x + menuBox.width <= paneBox.x + paneBox.width, `pane ${index}: menu fits its pane`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Backspace');
  }
  await page.getByRole('button', { name: 'More Note Actions', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Close Pane', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ProseMirror').length === 1);
  await page.keyboard.press('Meta+s');
  await page.waitForFunction(() => {
    const tab = document.querySelector('[role="tab"][aria-selected="true"][title="Slash Editing.md"]');
    return tab && !tab.querySelector('[aria-label="Unsaved"]');
  });
  await page.getByRole('button', { name: 'Close Slash Editing.md', exact: true }).click();
  await page.getByRole('button', { name: 'Slash Editing.md', exact: true }).click();
  await editor.locator('h2').waitFor();
  check(await editor.locator('h2').textContent() === '健康 Lesson' && await editor.locator('p').last().textContent() === 'Drag This Block', 'saved document reopens with conversion and block order');
  const state = await page.evaluate(() => ({ route: location.pathname, viewport: [innerWidth, innerHeight, devicePixelRatio],
    theme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null,
    bodySkin: document.body.dataset.tockteamSkin ?? null, mode: document.querySelector('.tocktutor-document-stats')?.textContent }));
  check(state.theme === appearance.theme && state.bodySkin === appearance.skin && state.htmlSkin === null, 'explicit seeded appearance retained');
  check(state.mode.includes('Live Preview'), 'Live Preview active');
  check(errors.length === 0, 'no runtime errors');
  return { checks, errors, state, appearances, screenshots };
}
