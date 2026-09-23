async page => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const editor = page.locator('.cm-content[contenteditable=true]');
  const baseline = await editor.innerText();
  await editor.click(); await editor.press('Meta+ArrowDown'); await editor.pressSequentially(' typed-before');
  const before = await editor.innerText();
  if (!before.includes('typed-before')) throw Error('Typing before replacement failed');
  await page.getByRole('button', { name: 'More Note Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Replace…', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find in Note', exact: true }).fill('alpha');
  await page.getByRole('textbox', { name: 'Replace in Note', exact: true }).fill('omega');
  await page.getByRole('button', { name: 'Replace All', exact: true }).click();
  const replaced = await editor.innerText();
  if (replaced !== before.replaceAll('alpha', 'omega')) throw Error('Source replacement changed unexpected content');
  await page.getByRole('button', { name: 'Exit Find', exact: true }).click();
  await editor.click(); await editor.press('Meta+ArrowDown'); await editor.pressSequentially(' typed-after');
  const after = await editor.innerText();
  const undo = [];
  for (const expected of [replaced, before, baseline]) {
    await editor.press('Meta+z'); const actual = await editor.innerText(); undo.push(actual);
    if (actual !== expected) throw Error('Source Undo mismatch: ' + JSON.stringify({expected, actual}));
  }
  const redo = [];
  for (const expected of [before, replaced, after]) {
    await editor.press('Meta+Shift+z'); const actual = await editor.innerText(); redo.push(actual);
    if (actual !== expected) throw Error('Source Redo mismatch: ' + JSON.stringify({expected, actual}));
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  await page.screenshot({path:'/tmp/tutor-source-undo-dark.png',scale:'device'});
  return {mode:'Source', url:page.url(), baseline,before,replaced,after,undo,redo,pageErrors:errors,screenshot:'/tmp/tutor-source-undo-dark.png'};
}
