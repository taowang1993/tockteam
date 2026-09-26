// playwright-cli run-code; attach only to an owned extended_display Desktop endpoint.
// Fixture: Drafts/Source.md, Notes/A #1%.md and Attachments/existing.pdf in an isolated vault.
async page => {
  const checks = [], errors = [];
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const check = (value, name) => { if (!value) throw Error(name); checks.push(name); };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const notice = page.getByRole('dialog', { name: 'Internal Testing Notice' });
  if (await notice.isVisible()) await notice.getByRole('button', { name: 'Continue', exact: true }).click();
  const later = page.getByRole('button', { name: 'Configure later', exact: true });
  if (await later.isVisible()) await later.click();
  await page.getByRole('button', { name: 'TockTutor', exact: true }).click();
  await page.getByRole('button', { name: 'Drafts/Source.md', exact: true }).click();
  const editor = page.locator('.ProseMirror');
  await editor.waitFor();
  const invoke = async (prefix, query, name) => {
    const paragraph = editor.locator('p').filter({ hasText: new RegExp('^' + prefix) }).first();
    await paragraph.click();
    await paragraph.evaluate(el => { getSelection().selectAllChildren(el); getSelection().collapseToEnd(); });
    await page.keyboard.type('/' + query);
    await page.getByRole('option', { name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    await dialog.waitFor();
    check(await dialog.evaluate(el => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), `${name}: dialog is above the owning route`);
    return dialog;
  };
  let dialog = await invoke('Before after', 'url', 'Link');
  await dialog.getByLabel('URL', { exact: true }).fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Insert Link', exact: true }).click();
  check((await dialog.getByRole('alert').textContent()).includes('HTTP'), 'unsafe URL refused');
  await dialog.getByLabel('URL', { exact: true }).fill('https://example.com/a?q=1&b=2');
  await dialog.getByLabel('Display Text', { exact: true }).fill('Web [Link]');
  await dialog.getByRole('button', { name: 'Insert Link', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check(await editor.locator('a').filter({ hasText: 'Web [Link]' }).count() === 1, 'ordinary website link inserted');
  check(await page.evaluate(() => document.activeElement.matches('.ProseMirror')), 'focus restored after link');
  await page.keyboard.press('Meta+z');
  check((await editor.textContent()).includes('Before after/url'), 'one undo restores exact invocation');
  await page.keyboard.press('Meta+Shift+z');

  dialog = await invoke('Existing note:', 'link to note', 'Link to Note');
  await dialog.getByRole('combobox').fill('A #1%');
  await dialog.getByRole('option', { name: 'Notes/A #1%.md', exact: true }).click();
  await dialog.getByRole('button', { name: 'Insert Link', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check(await editor.locator('a[href="../Notes/A%20%231%25.md"]').count() === 1, 'exact source-relative encoded note target');

  dialog = await invoke('New note:', 'new note', 'New Note');
  await dialog.getByLabel('Note Name', { exact: true }).fill('Created Note');
  check(await dialog.getByLabel('Folder', { exact: true }).inputValue() === 'Drafts', 'creation defaults to source folder');
  await dialog.getByRole('button', { name: 'Create and Link', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check(await editor.locator('a[href="./Created%20Note.md"]').count() === 1, 'created note linked without leaving source');
  await page.keyboard.press('Meta+z');
  check((await editor.textContent()).includes('New note:/new note'), 'created note link supports native undo');
  check(await page.getByRole('button', { name: 'Drafts/Created Note.md', exact: true }).count() === 1, 'undo retains created file');
  await page.keyboard.press('Meta+Shift+z');

  dialog = await invoke('Attachment:', 'file', 'File Attachment');
  await dialog.getByRole('radio', { name: 'Upload File', exact: true }).click();
  await dialog.getByLabel('File', { exact: true }).setInputFiles('/tmp/tocktutor-markdown-proof/Document #1.pdf');
  await dialog.getByRole('button', { name: 'Upload and Link', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check(await editor.locator('a[href="../Attachments/Document%20%231.pdf"]').count() === 1, 'upload inserts a link rather than an embed');

  dialog = await invoke('Existing file:', 'file', 'File Attachment');
  await dialog.getByRole('combobox').fill('existing.pdf');
  await dialog.getByRole('option', { name: 'Attachments/existing.pdf', exact: true }).click();
  await dialog.getByRole('button', { name: 'Insert Link', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check(await editor.locator('a[href="../Attachments/existing.pdf"]').count() === 1, 'existing attachment inserts without another upload');
  await page.keyboard.press('Meta+s');
  await page.waitForFunction(() => {
    const tab = document.querySelector('[role="tab"][aria-selected="true"][title="Drafts/Source.md"]');
    return tab && !tab.querySelector('[aria-label="Unsaved"]');
  });
  check(true, 'source save clears active-tab Unsaved marker');
  await page.getByRole('button', { name: 'Close Source.md', exact: true }).click();
  await page.getByRole('button', { name: 'Drafts/Source.md', exact: true }).click();
  await editor.locator('a[href="../Notes/A%20%231%25.md"]').waitFor();
  check(await editor.locator('a').count() === 5, 'save/reopen retains all five ordinary links');
  await editor.locator('a[href="../Notes/A%20%231%25.md"]').click();
  await page.getByRole('heading', { name: 'Exact Destination', exact: true }).waitFor();
  check(page.url().includes('A%20%231%25.md'), 'Live Preview link opens exact target');
  await page.getByRole('button', { name: 'Drafts/Source.md', exact: true }).click();
  await page.getByRole('button', { name: 'More Note Actions', exact: true }).click();
  const reading = page.getByRole('menuitem', { name: 'Reading View', exact: true });
  await reading.click();
  await page.locator('a[data-link-kind="markdown"][data-target="../Notes/A%20%231%25.md"]').click();
  await page.getByRole('heading', { name: 'Exact Destination', exact: true }).waitFor();
  check(page.url().includes('A%20%231%25.md'), 'Reading link opens exact target');
  const state = await page.evaluate(() => ({ route: location.pathname, viewport: [innerWidth, innerHeight, devicePixelRatio], theme: document.documentElement.style.colorScheme, htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, bodySkin: document.body.dataset.tockteamSkin ?? null }));
  check(state.viewport.join(',') === '1512,949,2' && state.theme === 'dark' && state.htmlSkin === null && state.bodySkin === null, 'canonical dark geometry and appearance');
  check(errors.length === 0, 'no runtime errors');
  return { checks, errors, state };
}
