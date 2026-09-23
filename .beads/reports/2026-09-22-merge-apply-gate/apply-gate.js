async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Confirm Merge',exact:true}).click();
  await page.waitForURL('**/tocktutor/Notes/Destination.md',{timeout:20000});
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'More Note Actions',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Source Mode',exact:true}).click();
  const editor=page.locator('.cm-content');await editor.waitFor();
  const merged=await editor.innerText();
  if(!merged.includes('Source paragraph 🙂.')||!merged.includes('Destination paragraph.'))throw Error('Merged source is incomplete');
  await page.screenshot({path:'/tmp/tutor-merge-production-applied.png',scale:'device'});
  await editor.fill('# Newer Destination\n\nDo not overwrite this edit.\n');
  await page.getByRole('button',{name:'More Note Actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Open in Default App',exact:true}).click();
  await page.getByText('Opened in the default app.',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'More Note Actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Merge Recovery',exact:true}).click();
  await page.getByText('Applied',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Restore Originals as New Notes',exact:true}).click();
  const message=page.getByText(/^Originals recovered in /);await message.waitFor({timeout:20000});
  await page.screenshot({path:'/tmp/tutor-merge-production-recovered.png',scale:'device'});
  return {merged,recovery:await message.innerText(),route:page.url(),errors,boundary:'Production Host/runtime filesystem effects; OS association was intercepted'};
}
