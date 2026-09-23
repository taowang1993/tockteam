async page => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const editor = page.locator('.ProseMirror[contenteditable=true]');
  const baseline = await editor.innerText();
  await editor.click(); await editor.press('Meta+ArrowDown'); await editor.pressSequentially(' live-before');
  const before = await editor.innerText();
  if (!before.includes('live-before')) throw Error('Typing before replacement failed');
  await page.getByRole('button', { name: 'More Note Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Replace…', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find in Note', exact: true }).fill('omega');
  await page.getByRole('textbox', { name: 'Replace in Note', exact: true }).fill('sigma');
  await page.getByRole('button', { name: 'Replace All', exact: true }).click();
  const replaced = await editor.innerText();
  if (replaced !== before.replaceAll('omega', 'sigma')) throw Error('Live Preview replacement changed unexpected content');
  await page.getByRole('button', { name: 'Exit Find', exact: true }).click();
  await editor.click(); await editor.press('Meta+ArrowDown'); await editor.pressSequentially(' live-after');
  const after = await editor.innerText();
  const undo = [];
  for (const expected of [replaced, before, baseline]) {
    await editor.press('Meta+z'); const actual = await editor.innerText(); undo.push(actual);
    if (actual !== expected) throw Error('Live Preview Undo mismatch: ' + JSON.stringify({expected, actual}));
  }
  const redo = [];
  for (const expected of [before, replaced, after]) {
    await editor.press('Meta+Shift+z'); const actual = await editor.innerText(); redo.push(actual);
    if (actual !== expected) throw Error('Live Preview Redo mismatch: ' + JSON.stringify({expected, actual}));
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  await page.screenshot({path:'/tmp/tutor-live-undo-dark.png',scale:'device'});
  return {mode:'Live Preview', url:page.url(),baseline,before,replaced,after,undo,redo,pageErrors:errors,screenshot:'/tmp/tutor-live-undo-dark.png'};
}
