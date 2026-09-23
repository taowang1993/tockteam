async page => {
  const id = await page.evaluate(() => window.__defaultAppProof.sourceId);
  const source = page.locator(`[data-pane-id="${id}"]`);
  let dispatches = 0;
  const count = request => { if (request.url().endsWith('/api/tocktutorDesktop/openInDefaultApp')) dispatches++; };
  page.on('request', count);
  try {
    await source.getByRole('button', { name: 'More Note Actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open in Default App', exact: true }).click();
    await page.getByText('The note could not be saved.', { exact: true }).first().waitFor();
    if (dispatches !== 0) throw new Error('A failed save reached native dispatch');
    if (!(await source.locator('.cm-content').innerText()).includes('Unsaved local conflict draft.')) throw new Error('Local draft was lost');
    await page.screenshot({ path: '/tmp/tocktutor-default-app-20260921/save-conflict.png', scale: 'device' });
    return { dispatches, source: await source.innerText(), route: page.url() };
  } finally { page.off('request', count); }
}
