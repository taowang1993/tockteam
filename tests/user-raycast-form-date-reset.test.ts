import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync,mkdtempSync,writeFileSync,rmSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
// @ts-expect-error First-party private-runtime builder.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager } from '../src/user-raycast-manager.ts'
import { createUserRaycastView } from '../src/user-raycast-renderer.ts'
const {JSDOM}=createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json',import.meta.url))('jsdom')
const wait=async(check:()=>boolean)=>{const end=Date.now()+2500;while(!check()&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.ok(check(),'The expected public state must become visible')}

test('an explicit SDK date reset clears an invalid unacknowledged native draft even when the stored value already equals its default',async t=>{
 const root=mkdtempSync(join(tmpdir(),'tockteam-date-reset-public-')),runtime=join(root,'runtime'),source=join(root,'source');mkdirSync(source);await buildUserRaycast(runtime);writeFileSync(join(source,'package.json'),JSON.stringify({name:'date-reset-public',title:'Date Reset Public',commands:[{name:'reset',title:'Reset Fake Dates',mode:'view'}]}));writeFileSync(join(source,'reset.js'),`const React=require('react'),{Form,ActionPanel,Action}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};process.env.TZ='UTC';module.exports.default=()=>{const ref=React.useRef(null);return React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action,{title:'Reset Date',onAction:()=>{ref.current.reset();ref.current.focus()}}))},React.createElement(Form.DatePicker,{id:'day',title:'Day',type:Form.DatePicker.Type.Date,defaultValue:new Date(2026,9,2),min:new Date(2026,9,1),max:new Date(2026,9,31),ref}))};`)
 const install=new UserRaycastInstall(join(root,'home')),candidate=install.prepare(source);install.approve(candidate.digest);install.enable();const dom=new JSDOM('<!doctype html><html><body></body></html>'),document=dom.window.document as Document,groups=new Set<number>(),owner={webContentsId:44};let listener:any;const errors:any[]=[]
 const manager=new UserRaycastManager({install,runtime,nodePath:process.execPath,artifact:resolve('plugins/trusted-raycast/vendor/google-translate.tar'),onError:(_owner,error)=>errors.push(error.message),copyText:async()=>{throw Error('Native effects prohibited')},onMessage:(_owner,message)=>{if(manager.childPid)groups.add(manager.childPid);listener?.(message)}})
 const bridge={userRaycastState:async()=>({enabled:true,installed:true,digest:candidate.digest}),userRaycastOpen:()=>manager.start(owner),userRaycastClose:()=>manager.close(),userRaycastEvent:(event:any)=>manager.send(owner,event),onUserRaycastView:(callback:any)=>{listener=callback;return()=>{listener=undefined}}}
 const previous=process.env.TZ;process.env.TZ='UTC';const view=createUserRaycastView(document,bridge as any,()=>{});document.body.append(view.element)
 t.after(async()=>{await manager.close();view.dispose();dom.window.close();for(const pid of groups)assert.throws(()=>process.kill(-pid,0),(e:any)=>e.code==='ESRCH');rmSync(root,{recursive:true,force:true});if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;console.log('Stopped reset public groups: '+[...groups].join(','))})
 await wait(()=>Boolean(document.querySelector('[data-user-raycast-action="open"]')));document.querySelector<HTMLButtonElement>('[data-user-raycast-action="open"]')!.click();await wait(()=>Boolean(document.querySelector('input[aria-label="Day"]')))
 const day=document.querySelector<HTMLInputElement>('input[aria-label="Day"]')!;assert.equal(day.value,'2026-10-02');day.value='2026-11-02';day.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait(()=>day.getAttribute('aria-invalid')==='true');assert.equal(day.value,'2026-11-02')
 Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='Reset Date')!.click();try{await wait(()=>day.value==='2026-10-02')}catch{assert.equal(day.value,'2026-10-02','Explicit SDK reset must overwrite the rejected native draft')};assert.equal(day.getAttribute('aria-invalid'),'false');assert.equal(document.activeElement,day);assert.equal(errors.length,0)
})
