async page => {
 const out=[]; const check=(name,pass,detail)=>{out.push({name,pass,detail});if(!pass)throw new Error(JSON.stringify(out));};
 await page.evaluate(()=>{window.__proofKeys=[];document.addEventListener('keydown',e=>window.__proofKeys.push({key:e.key,repeat:e.repeat,isTrusted:e.isTrusted}),true)});
 await page.keyboard.down('Backspace'); await page.getByRole('searchbox',{name:'Search Web Features'}).waitFor();
 check('nested Backspace pops to root',true,'Search Web Features visible');
 for(let i=0;i<5;i++)await page.keyboard.down('Backspace'); await page.keyboard.up('Backspace');
 check('held repeat cannot close root',await page.getByRole('searchbox',{name:'Search Web Features'}).isVisible(),await page.evaluate(()=>window.__proofKeys));
 await page.keyboard.press('Enter'); await page.getByRole('heading',{name:'AAC audio file format',exact:true}).waitFor();
 await page.keyboard.press('Escape'); await page.getByRole('searchbox',{name:'Search Web Features'}).waitFor();check('nested Escape pops',true,'root visible');
 const q=page.getByRole('searchbox',{name:'Search Web Features'});await q.fill('flex');await q.press('Backspace');check('text Backspace deletes',await q.inputValue()==='fle',await q.inputValue());await q.fill('');
 const ime=await q.evaluate(el=>{const e=new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return {prevented:e.defaultPrevented,connected:el.isConnected}});check('synthetic composition Escape retained',!ime.prevented&&ime.connected,ime);
 await q.press('Backspace');await page.getByRole('combobox',{name:'Search TockTeam'}).waitFor();check('root Backspace closes command',true,'launcher visible');
 return out;
}