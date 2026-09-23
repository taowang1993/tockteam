async page => {
  page.__watchProof = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', error => page.__watchProof.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.__watchProof.consoleErrors.push(message.text()); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  await page.getByRole('button', {name:'Continue',exact:true}).click();
  await page.getByRole('button', {name:'Configure later',exact:true}).click();
  await page.getByRole('navigation',{name:'App Navigation'}).getByRole('button',{name:'TockTutor',exact:true}).click();
  await page.getByRole('button',{name:'Editable.md',exact:true}).click();
  await page.getByRole('button',{name:'More Note Actions',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Source Mode',exact:true}).click();
  const editor = page.locator('.cm-content:visible');
  await editor.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('# Editable\n\nSaved through the UI.\n');
  await page.keyboard.press('Meta+s');
  return { source: (await editor.locator('.cm-line').allTextContents()).join('\n'), ...page.__watchProof };
}
