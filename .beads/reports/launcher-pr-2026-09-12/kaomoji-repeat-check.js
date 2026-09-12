async page => {
 const out=[];const check=(name,pass,detail)=>{out.push({name,pass,detail});if(!pass)throw new Error(JSON.stringify(out));};
 await page.getByRole('button',{name:'Save Preferences',exact:true}).click();const q=page.getByRole('searchbox',{name:'Search Kaomoji'});await q.waitFor();await q.fill('x');
 await page.evaluate(()=>{window.__kaomojiKeys=[];document.addEventListener('keydown',e=>window.__kaomojiKeys.push({key:e.key,repeat:e.repeat,trusted:e.isTrusted}),true)});
 await page.keyboard.down('Backspace');for(let i=0;i<5;i++)await page.keyboard.down('Backspace');await page.keyboard.up('Backspace');
 check('held delete reaching empty retains command',await q.isVisible()&&await q.inputValue()==='',await page.evaluate(()=>window.__kaomojiKeys));
 const ime=await q.evaluate(el=>{const events=['Backspace','Escape'].map(key=>{const e=new KeyboardEvent('keydown',{key,isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return {key,prevented:e.defaultPrevented,connected:el.isConnected}});return events});
 check('synthetic IME Backspace and Escape',ime.every(e=>!e.prevented&&e.connected),ime);
 await page.getByRole('button',{name:'Actions',exact:true}).click();await page.keyboard.press('Escape');
 check('Escape closes menu only',await q.isVisible()&&await page.locator('details[open]').count()===0,await page.locator('details[open]').count());
 await page.screenshot({path:'/tmp/tockteam-final-launcher-proof.YEhNLs/reviewer-evidence/kaomoji-retained.png'});
 await q.focus();await page.keyboard.press('Backspace');await page.getByRole('combobox',{name:'Search TockTeam'}).waitFor();check('fresh root Backspace closes',true,'launcher root visible');
 return out;
}