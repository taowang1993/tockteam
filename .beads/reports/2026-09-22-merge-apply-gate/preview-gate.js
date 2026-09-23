async page => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const cdp=await page.context().newCDPSession(page); await cdp.send('Emulation.setDeviceMetricsOverride',{width:1512,height:949,deviceScaleFactor:2,mobile:false});
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Continue',exact:true}).click({timeout:20000});
  await page.getByRole('button',{name:'Configure later',exact:true}).click({timeout:20000});
  await page.getByRole('button',{name:'TockTutor',exact:true}).click();
  await page.getByRole('button',{name:'Notes/Source.md',exact:true}).click({timeout:20000});
  await page.getByRole('button',{name:'More Note Actions',exact:true}).click();
  const menu=await page.getByRole('menu').innerText();
  await page.screenshot({path:'/tmp/tutor-merge-production-menu.png',scale:'device'});
  await page.getByRole('menuitem',{name:'Merge Entire File With…',exact:true}).click();
  await page.getByRole('option',{name:'Notes/Destination.md',exact:true}).click();
  await page.getByRole('combobox',{name:'Value for status',exact:true}).selectOption('source');
  await page.getByRole('button',{name:'Preview Merge',exact:true}).click();
  await page.getByRole('heading',{name:'Merge Preview',exact:true}).waitFor({timeout:20000});
  const content=await page.getByLabel('Destination Content',{exact:true}).innerText();
  if(!content.includes('Source paragraph 🙂.')||!content.includes('Destination paragraph.'))throw Error('Missing merge content');
  if(await page.getByRole('button',{name:'Confirm Merge',exact:true}).isDisabled())throw Error('Unexpected blocked confirmation');
  await page.screenshot({path:'/tmp/tutor-merge-production-preview.png',scale:'device'});
  const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,theme:document.documentElement.style.colorScheme,skin:document.documentElement.dataset.tockteamSkin??null}));
  if(JSON.stringify(geometry)!==JSON.stringify({width:1512,height:949,dpr:2,theme:'dark',skin:null}))throw Error('Wrong geometry/theme');
  return {menu,content,geometry,errors,route:page.url(),state:'Preview ready; not applied'};
}
