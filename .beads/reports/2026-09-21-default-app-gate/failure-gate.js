async page => {
  const id = await page.evaluate(() => window.__defaultAppProof.sourceId);
  const source = page.locator(`[data-pane-id="${id}"]`);
  await source.getByRole('button', { name: 'More Note Actions', exact: true }).click();
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/tocktutorDesktop/openInDefaultApp')),
    page.getByRole('menuitem', { name: 'Open in Default App', exact: true }).click(),
  ]);
  const result = (await response.json()).result;
  if (result.ok || result.error?.code !== 'unavailable') throw new Error('OS failure was not propagated');
  await page.getByText('The native action failed safely.', { exact: true }).first().waitFor();
  const failed = await source.innerText();
  await page.screenshot({ path: '/tmp/tocktutor-default-app-20260921/os-failure.png', scale: 'device' });
  await source.locator('.cm-content').fill('# Default App Proof\n\nUnsaved local conflict draft.\n');
  await source.getByText('Unsaved changes.', { exact: true }).waitFor();
  return { result, failed, preparedConflict: await source.locator('.cm-content').innerText() };
}
