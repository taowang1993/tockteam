async page => {
 const s=page.getByRole('combobox',{name:'Language Set'});await s.focus();
 await page.evaluate(()=>{window.__selectProof=[];document.addEventListener('keydown',e=>{if(e.target.tagName==='SELECT')window.__selectProof.push({key:e.key,prevented:e.defaultPrevented,tag:e.target.tagName,trusted:e.isTrusted})});});
 const before=await s.evaluate(el=>({value:el.value,index:el.selectedIndex,tag:el.tagName,focused:document.activeElement===el}));
 await page.keyboard.press('ArrowDown');
 const down=await s.evaluate(el=>({value:el.value,index:el.selectedIndex,focused:document.activeElement===el}));
 await page.keyboard.press('ArrowUp');
 const up=await s.evaluate(el=>({value:el.value,index:el.selectedIndex,focused:document.activeElement===el}));
 const keys=await page.evaluate(()=>window.__selectProof);
 if(!down.focused||!up.focused||keys.length!==2||keys.some(e=>e.prevented))throw new Error(JSON.stringify({before,down,up,keys}));
 await page.screenshot({path:'/tmp/tockteam-final-launcher-proof.YEhNLs/reviewer-evidence/native-select.png'});
 return {before,down,up,keys};
}