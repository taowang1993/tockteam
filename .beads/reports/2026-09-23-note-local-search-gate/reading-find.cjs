async page => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', {name:'Notes/Source.md',exact:true}).click();
  await page.getByRole('tabpanel', {name:'Note Editor'}).getByRole('heading', {name:'Source',level:2,exact:true}).waitFor();
  if (await page.getByRole('button', {name:'Exit Find',exact:true}).isVisible()) await page.getByRole('button', {name:'Exit Find',exact:true}).click();
  await page.getByRole('button', {name:'Switch to Reading View',exact:true}).click();
  await page.locator('.tocktutor-reading').waitFor();
  await page.getByRole('button', {name:'More Note Actions',exact:true}).click();
  await page.getByRole('menuitem', {name:'Find…',exact:true}).click();
  await page.getByRole('searchbox', {name:'Find in Note',exact:true}).fill('Source formatted phrase.');
  const strip = page.getByRole('search', {name:'Find in Note',exact:true});
  await strip.getByRole('status').filter({hasText:'1 / 1'}).waitFor();
  const marks = await page.locator('mark[data-tocktutor-find]').evaluateAll(items=>items.map(mark=>({text:mark.textContent,id:mark.dataset.tocktutorFind,strong:mark.parentElement.tagName==='STRONG'})));
  if (marks.length!==3 || new Set(marks.map(m=>m.id)).size!==1 || !marks[1].strong || marks.map(m=>m.text).join('')!=='Source formatted phrase.') throw Error('Cross-inline logical match failed');
  const geometry = await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,color:document.documentElement.style.colorScheme,skin:document.documentElement.dataset.tockteamSkin??null}));
  if (geometry.width!==1512 || geometry.height!==949 || geometry.dpr!==2 || geometry.color!=='dark' || geometry.skin!==null) throw Error('Invalid canonical geometry/theme');
  if (errors.length) throw Error(JSON.stringify(errors));
  await page.screenshot({path:'/tmp/tutor-reading-find-dark.png',scale:'device'});
  return {url:page.url(),mode:'Reading',query:'Source formatted phrase.',strip:await strip.innerText(),marks,geometry,pageErrors:errors,screenshot:'/tmp/tutor-reading-find-dark.png'};
}
