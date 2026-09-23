async page => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1512,height:949,deviceScaleFactor:2,mobile:false});
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  const outcomes=[];
  for(const leading of [true,false]) {
    await page.getByRole('button',{name:'Review Merge',exact:true}).click();
    const search=page.getByRole('combobox',{name:'Merge Destination'});
    await search.fill('Note.md');
    const candidates=await page.getByRole('option').allTextContents();
    if(JSON.stringify(candidates)!==JSON.stringify([' Note.md','Note.md'])) throw Error('Wrong exact candidates');
    const values=await page.getByRole('option').evaluateAll(items=>items.map(item=>item.getAttribute('data-value')));
    if(new Set(values).size!==2) throw Error('Colliding command values');
    if(!leading) await search.press('ArrowDown');
    const selected=await page.locator('[cmdk-item][data-selected="true"]').getAttribute('data-merge-path');
    if(selected!==(leading?' Note.md':'Note.md')) throw Error('Wrong highlighted exact path');
    await search.press('Shift+Enter');
    const placement=page.getByRole('combobox',{name:'Placement',exact:true}); await placement.waitFor();
    if(await placement.inputValue()!=='prepend') throw Error('Lost prepend');
    await page.getByRole('button',{name:'Preview Merge',exact:true}).click();
    await page.getByRole('heading',{name:'Merge Preview',exact:true}).waitFor();
    const content=await page.getByLabel('Destination Content',{exact:true}).textContent();
    if(!content.includes(leading?'# Leading-space destination':'# Plain destination')) throw Error('Wrong destination content');
    outcomes.push({selected,placement:'prepend',content});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.textContent==='Review Merge');
  }
  const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,theme:document.documentElement.style.colorScheme,skin:document.documentElement.dataset.tockteamSkin??null}));
  if(errors.length) throw Error(JSON.stringify(errors));
  return {outcomes,geometry,errors,scope:'Corrective exact-path component check; no production Host/apply assertion'};
}
