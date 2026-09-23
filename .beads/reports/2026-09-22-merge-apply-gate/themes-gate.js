async page => {
  const proofs=[], errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).first().click();
  for(const item of [
    {name:'Original',file:'light',theme:'light',skin:null},
    {name:'Deep Current',file:'deep-current',theme:'dark',skin:'tockteam-skin-deep-current'},
    {name:'Jade Circuit',file:'jade-circuit',theme:'dark',skin:'tockteam-skin-jade-circuit'},
    {name:'Porcelain',file:'porcelain',theme:'light',skin:'tockteam-skin-porcelain'},
    {name:'Ember Dusk',file:'ember-dusk',theme:'dark',skin:'tockteam-skin-ember-dusk'},
    {name:'Original',file:'dark',theme:'dark',skin:null},
  ]) {
    await page.getByRole('button',{name:item.name,exact:true}).click();
    await page.waitForFunction(item=>(document.body.dataset.tockteamSkin??null)===item.skin,item);
    if(item.skin===null) await page.getByRole('button',{name:item.theme==='dark'?'Dark':'Light',exact:true}).click();
    await page.waitForFunction(item=>document.documentElement.style.colorScheme===item.theme&&(document.body.dataset.tockteamSkin??null)===item.skin,item);
    await page.getByRole('button',{name:'TockTutor',exact:true}).click();
    await page.getByRole('button',{name:'More Note Actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Merge Entire File With…',exact:true}).click();
    await page.getByRole('option',{name:'Other.md',exact:true}).click();
    await page.getByRole('combobox',{name:'Original Note',exact:true}).selectOption('keep');
    await page.getByRole('button',{name:'Preview Merge',exact:true}).click();
    await page.getByRole('heading',{name:'Merge Preview',exact:true}).waitFor();
    await page.mouse.move(1500,935);
    const proof=await page.getByRole('dialog').evaluate((dialog,item)=>{
      const button=[...dialog.querySelectorAll('button')].find(button=>button.textContent==='Confirm Merge');
      const style=getComputedStyle(button), surface=getComputedStyle(dialog);
      const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
      const a=luminance(style.color),b=luminance(style.backgroundColor);
      return {name:item.name,file:item.file,theme:document.documentElement.style.colorScheme,skin:document.body.dataset.tockteamSkin??null,rootSkin:document.documentElement.dataset.tockteamSkin??null,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,route:location.pathname,background:surface.backgroundColor,foreground:surface.color,buttonForeground:style.color,buttonBackground:style.backgroundColor,contrast:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05),scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,content:dialog.textContent};
    },item);
    if(proof.width!==1512||proof.height!==949||proof.dpr!==2||proof.contrast<4.5||proof.scrollWidth>proof.clientWidth+2||!proof.content.includes('Source paragraph 🙂.'))throw Error(JSON.stringify(proof));
    if(errors.length)throw Error(JSON.stringify(errors));
    await page.screenshot({path:'/tmp/tutor-merge-production-'+item.file+'.png',scale:'device'});
    proofs.push(proof);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).first().click();
  }
  await page.getByRole('button',{name:'TockTutor',exact:true}).click();
  return {proofs,errors,boundary:'Real settings-controlled theme/skin captures, separately labeled; no merge applied'};
}
