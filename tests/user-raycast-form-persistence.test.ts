import assert from 'node:assert/strict'
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, type TestContext } from 'node:test'
// @ts-expect-error First-party private-runtime builder.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'

const owner = { webContentsId: 17 }
const artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')
async function fixture(t: TestContext) {
 const root=mkdtempSync(join(tmpdir(),'tockteam-form-store-')),runtime=join(root,'host'),install=new UserRaycastInstall(join(root,'installed'))
 const messages:UserRaycastMessage[]=[],errors:string[]=[],pids:number[]=[]
 const manager=new UserRaycastManager({install,runtime,nodePath:process.execPath,artifact,onMessage:(_owner,message)=>messages.push(message),onError:(_owner,error)=>errors.push(error.message)})
 t.after(async()=>{try{await manager.close();for(const pid of pids)assert.throws(()=>process.kill(-pid,0),/ESRCH/);t.diagnostic(`Stopped owned process groups: ${pids.join(', ')}`)}finally{rmSync(root,{recursive:true,force:true})}})
 await buildUserRaycast(runtime)
 let sourceSequence=0,requestSequence=0
 const select=(name:string,source:string,command='edit')=>{const folder=join(root,`source-${++sourceSequence}`);mkdirSync(folder);writeFileSync(join(folder,'package.json'),JSON.stringify({name,title:'Offline Stored Forms',commands:[{name:'edit',mode:'view'},{name:'other',mode:'view'}]}));for(const file of ['edit','other'])writeFileSync(join(folder,`${file}.js`),source);const selected=install.prepare(folder,command);install.approve(selected.digest);install.enable()}
 const open=async()=>{await manager.close();messages.length=0;errors.length=0;const opening=manager.start(owner);if(manager.childPid)pids.push(manager.childPid);await opening;assert.deepEqual(errors,[])}
 const latest=()=>messages.filter(m=>m.root).at(-1)!
 const nodes=(type:string):any[]=>{const found:any[]=[];const walk=(node:any):void=>{if(!node||typeof node==='string')return;if(node.type===type)found.push(node);for(const child of node.children??[])walk(child)};walk(latest().root);return found}
 const field=(id:string,index=0)=>{const node=nodes('raycast-text-field').filter(n=>n.props.id===id)[index];assert.ok(node,`Missing field ${id}`);return node}
 const edit=(id:string,value:unknown,index=0)=>manager.send(owner,{sessionId:latest().sessionId,revision:latest().revision,eventId:field(id,index).props.fieldEventId,requestId:`store-${++requestSequence}`,kind:'fieldChanged',value} as any)
 const act=async(title='Submit Form')=>{const action=nodes('raycast-action').find(n=>n.props.title===title);assert.ok(action);const before=messages.length;manager.send(owner,{sessionId:latest().sessionId,revision:latest().revision,eventId:action.props.actionEventId,kind:'action'});const deadline=Date.now()+3000;while(!messages.slice(before).some(m=>m.type==='outcome')&&!errors.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));const outcome=messages.slice(before).find(m=>m.type==='outcome');assert.ok(outcome,JSON.stringify({errors,messages}));return outcome}
 return{root,install,manager,messages,errors,pids,select,open,latest,nodes,field,edit,act}
}
const shell=(fields:string,body='',submit='setAnswer(JSON.stringify(values))',actions='')=>`
 const React=require('react');const {Form,Action,ActionPanel,List,LocalStorage,Cache}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};
 exports.default=function Edit(){const [answer,setAnswer]=React.useState('Ready');${body};return React.createElement(React.Fragment,null,
 React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Submit Form',onSubmit:async values=>{${submit}}}),${actions||'null'})},${fields}),React.createElement(List,null,React.createElement(List.Item,{title:answer})));};`
const choices=`React.createElement(Form.Dropdown,{id:'locale',title:'Language',storeValue:true,defaultValue:'en'},React.createElement(Form.Dropdown.Item,{value:'en',title:'English'}),React.createElement(Form.Dropdown.Item,{value:'fr',title:'French'})),React.createElement(Form.TagPicker,{id:'tags',title:'Colors',storeValue:true,defaultValue:['red']},React.createElement(Form.TagPicker.Item,{value:'red',title:'Red'}),React.createElement(Form.TagPicker.Item,{value:'blue',title:'Blue'})),React.createElement(Form.Dropdown,{id:'temporary',title:'Temporary',defaultValue:'en'},React.createElement(Form.Dropdown.Item,{value:'en',title:'English'}),React.createElement(Form.Dropdown.Item,{value:'fr',title:'French'}))`

test('explicitly stored dropdown and ordered tag choices restore after accepted submission, not edits or cancellation',async t=>{
 const f=await fixture(t);f.select('remember-choices',shell(choices));await f.open()
 assert.equal(f.field('locale').props.value,'en');assert.deepEqual(f.field('tags').props.value,['red'])
 await f.edit('locale','fr');await f.edit('tags',['blue','red']);await f.open()
 assert.equal(f.field('locale').props.value,'en','An unsubmitted edit must not become a default');assert.deepEqual(f.field('tags').props.value,['red'])
 await f.edit('locale','fr');await f.edit('tags',['blue','red']);await f.edit('temporary','fr');assert.equal((await f.act()).succeeded,true)
 await f.open();assert.equal(f.field('locale').props.value,'fr','Accepted stored dropdown selection survives a cold child restart');assert.deepEqual(f.field('tags').props.value,['blue','red']);assert.equal(f.field('temporary').props.value,'en','Persistence is opt-in')
 await f.edit('locale','en');await f.edit('tags',[]);assert.equal((await f.act()).succeeded,true);await f.open();assert.equal(f.field('locale').props.value,'en');assert.deepEqual(f.field('tags').props.value,[])
})

test('false, rejected and cancelled asynchronous submissions preserve the last accepted choices',async t=>{
 const f=await fixture(t);f.select('rejected-store',shell(choices));await f.open();await f.edit('locale','fr');await f.edit('tags',['blue']);assert.equal((await f.act()).succeeded,true)
 for(const submit of ['await new Promise(r=>setTimeout(r,25));return false',"throw Error('Rejected by Fixture')"]){
  f.select('rejected-store',shell(choices,'',submit));await f.open();await f.edit('locale','en');await f.edit('tags',[]);assert.equal((await f.act()).succeeded,false)
  await f.open();assert.equal(f.field('locale').props.value,'fr');assert.deepEqual(f.field('tags').props.value,['blue'])
 }
 f.select('rejected-store',shell(choices,'','await new Promise(()=>{})'));await f.open();await f.edit('locale','en')
 const action=f.nodes('raycast-action')[0];f.manager.send(owner,{sessionId:f.latest().sessionId,revision:f.latest().revision,eventId:action.props.actionEventId,kind:'action'});await f.manager.close()
 f.select('rejected-store',shell(choices));await f.open();assert.equal(f.field('locale').props.value,'fr');assert.deepEqual(f.field('tags').props.value,['blue'])
})

test('controlled values win while reset uses declared defaults and submit mutations cannot change persisted snapshots',async t=>{
 const f=await fixture(t),fields=choices.replace("id:'locale',title:'Language',storeValue:true,defaultValue:'en'","id:'locale',title:'Language',storeValue:true,defaultValue:'en',value:locale,onChange:setLocale").replace("id:'tags',title:'Colors',storeValue:true,defaultValue:['red']","id:'tags',title:'Colors',storeValue:true,defaultValue:['red'],ref:tagsRef")
 f.select('controlled-store',shell(fields,"const [locale,setLocale]=React.useState('en');const tagsRef=React.useRef(null)","setAnswer(JSON.stringify(values));values.tags.push('mutated-by-submit')","React.createElement(Action,{title:'Reset Tags',onAction:()=>tagsRef.current.reset()})"));await f.open();await f.edit('locale','fr');await f.edit('tags',['blue']);assert.equal((await f.act()).succeeded,true)
 await f.open();assert.equal(f.field('locale').props.value,'en','A controlled prop overrides the remembered value');assert.deepEqual(f.field('tags').props.value,['blue'],'Stored arrays do not alias submit callback arguments')
 assert.equal((await f.act('Reset Tags')).succeeded,true);assert.deepEqual(f.field('tags').props.value,['red'],'Reset restores the declared default, not the remembered value')
 assert.equal((await f.act()).succeeded,true)
 f.select('controlled-store',shell(choices.replaceAll('storeValue:true','storeValue:false')));await f.open();assert.equal(f.field('locale').props.value,'en');assert.deepEqual(f.field('tags').props.value,['red'])
})

test('stored choices survive submit-triggered unmount and remain separate between extensions and commands',async t=>{
 const f=await fixture(t),code=`const React=require('react');const {Form,Action,ActionPanel,List}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};exports.default=function Edit(){const [saved,setSaved]=React.useState(null);if(saved)return React.createElement(List,null,React.createElement(List.Item,{title:JSON.stringify(saved)}));return React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Submit Form',onSubmit:values=>setSaved(values)}))},${choices});}`
 f.select('scope-first',code);await f.open();await f.edit('locale','fr');await f.edit('tags',['blue']);assert.equal((await f.act()).succeeded,true);assert.equal(f.nodes('raycast-form').length,0)
 await f.open();assert.equal(f.field('locale').props.value,'fr');assert.deepEqual(f.field('tags').props.value,['blue'])
 f.select('scope-first',code,'other');await f.open();assert.equal(f.field('locale').props.value,'en');assert.deepEqual(f.field('tags').props.value,['red']);await f.edit('tags',[]);assert.equal((await f.act()).succeeded,true)
 f.select('scope-second',code);await f.open();assert.equal(f.field('locale').props.value,'en');assert.deepEqual(f.field('tags').props.value,['red']);await f.edit('locale','en');assert.equal((await f.act()).succeeded,true)
 f.select('scope-first',code);await f.open();assert.equal(f.field('locale').props.value,'fr');assert.deepEqual(f.field('tags').props.value,['blue'])
 f.select('scope-first',code,'other');await f.open();assert.deepEqual(f.field('tags').props.value,[])
})

test('mounted forms with the same field ID keep separate remembered values and local storage clearing cannot erase them',async t=>{
 const f=await fixture(t),code=`const React=require('react');const {Form,Action,ActionPanel,List,LocalStorage,Cache}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};exports.default=function Edit(){const [answer,setAnswer]=React.useState('Ready');const form=(title,value)=>React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title,onSubmit:values=>setAnswer(JSON.stringify(values))}),React.createElement(Action,{title:'Clear Extension Cache',onAction:async()=>{await LocalStorage.setItem('saved','local');new Cache({namespace:'personal'}).set('saved','named');await LocalStorage.clear();new Cache().clear();if(new Cache({namespace:'personal'}).get('saved')!=='named')throw Error('Named cache lost')}}))},React.createElement(Form.Dropdown,{id:'choice',defaultValue:value,storeValue:true},React.createElement(Form.Dropdown.Item,{value:'en',title:'English'}),React.createElement(Form.Dropdown.Item,{value:'fr',title:'French'})));return React.createElement(React.Fragment,null,form('Save First Form','en'),form('Save Second Form','fr'),React.createElement(List,null,React.createElement(List.Item,{title:answer})));}`
 f.select('separate-forms',code);await f.open();await f.edit('choice','fr',0);assert.equal((await f.act('Save First Form')).succeeded,true);await f.edit('choice','en',1);assert.equal((await f.act('Save Second Form')).succeeded,true);assert.equal((await f.act('Clear Extension Cache')).succeeded,true)
 await f.open();assert.equal(f.field('choice',0).props.value,'fr');assert.equal(f.field('choice',1).props.value,'en')
})

test('common explicitly stored fields retain empty strings, false values and prototype-named IDs',async t=>{
 const f=await fixture(t),fields=`React.createElement(Form.TextField,{id:'__proto__',defaultValue:'text',storeValue:true}),React.createElement(Form.PasswordField,{id:'constructor',defaultValue:'fake-only',storeValue:true}),React.createElement(Form.TextArea,{id:'area',defaultValue:'area',storeValue:true}),React.createElement(Form.Checkbox,{id:'flag',defaultValue:true,storeValue:true,label:'Fake Flag'})`
 f.select('typed-store',shell(fields));await f.open();for(const [id,value]of [['__proto__',''],['constructor','fake-changed'],['area','line\nline'],['flag',false]]as const)await f.edit(id,value);assert.equal((await f.act()).succeeded,true);await f.open()
 assert.equal(f.field('__proto__').props.value,'');assert.equal(f.field('constructor').props.value,'fake-changed');assert.equal(f.field('area').props.value,'line\nline');assert.equal(f.field('flag').props.value,false)
 assert.equal(lstatSync(f.install.statePath('typed-store')).mode&0o777,0o600)
})

test('oversized stored snapshots reject before submitting and preserve prior exact bytes and choices',async t=>{
 const f=await fixture(t);f.select('bounded-store',shell(choices));await f.open();await f.edit('locale','fr');await f.edit('tags',['blue']);assert.equal((await f.act()).succeeded,true)
 const path=f.install.statePath('bounded-store'),before=readFileSync(path)
 await f.open();await f.edit('tags',Array.from({length:64},(_,i)=>String(i)+':'+ 'x'.repeat(80)))
 const outcome=await f.act();assert.equal(outcome.succeeded,false);assert.match(outcome.message??'',/4 KiB/);assert.equal(f.nodes('raycast-list-item')[0].props.title,'Ready','Known overflow must not run the submit callback');assert.deepEqual(readFileSync(path),before)
 await f.open();assert.equal(f.field('locale').props.value,'fr');assert.deepEqual(f.field('tags').props.value,['blue'])
})

test('replaced state files fail visibly without overwriting their targets or claiming persistence success',async t=>{
 const f=await fixture(t);f.select('write-error-store',shell(choices));await f.open();await f.edit('locale','fr');assert.equal((await f.act()).succeeded,true)
 const path=f.install.statePath('write-error-store'),before=readFileSync(path),target=join(f.root,'replacement.json');writeFileSync(target,before)
 await f.open();await f.edit('locale','en');rmSync(path);symlinkSync(target,path)
 const outcome=await f.act();assert.equal(outcome.succeeded,false);assert.match(outcome.message??'',/storage.*invalid/i);assert.deepEqual(readFileSync(target),before)
})

test('retired fields cannot overflow the remembered-field bound or write an unreadable replacement',async t=>{
 const f=await fixture(t),fields=Array.from({length:64},(_,i)=>`React.createElement(Form.TextField,{id:'field-${i}',storeValue:true,defaultValue:'v'})`).join(',')
 f.select('retired-store',shell(fields));await f.open();assert.equal((await f.act()).succeeded,true)
 const path=f.install.statePath('retired-store'),before=readFileSync(path)
 f.select('retired-store',shell("React.createElement(Form.TextField,{id:'new-field',storeValue:true,defaultValue:'new'})"));await f.open()
 assert.equal((await f.act()).succeeded,false);assert.equal(f.nodes('raycast-list-item')[0].props.title,'Ready','An unrepresentable saved snapshot must reject before the submit callback');assert.deepEqual(readFileSync(path),before)
})

test('invalid stored records reject without rewriting while opted-out fields ignore them',async t=>{
 const f=await fixture(t);f.select('invalid-store',shell(choices));await f.open();await f.edit('locale','fr');assert.equal((await f.act()).succeeded,true)
 const path=f.install.statePath('invalid-store'),original=JSON.parse(readFileSync(path,'utf8'))as Record<string,string>,record=JSON.parse(Object.values(original)[0]!)as any[]
 await f.manager.close()
 for(const raw of ['not-json',JSON.stringify(record.concat([record[0]])),JSON.stringify(record.map(entry=>entry[0]==='locale'?[entry[0],'checkbox','invalid']:entry)),JSON.stringify(record.map(entry=>entry[0]==='tags'?[entry[0],entry[1],['red','red']]:entry)),'x'.repeat(4097)]){
  const bytes=JSON.stringify(Object.fromEntries(Object.keys(original).map(key=>[key,raw])));writeFileSync(path,bytes)
  await f.open().catch(()=>{});const deadline=Date.now()+2500;while(!f.errors.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10))
  // React may wrap render errors; the public failure and unchanged bytes are the contract.
  assert.ok(f.errors.length,'Corrupt stored data must fail visibly');assert.equal(f.messages.some(m=>m.type==='outcome'&&m.succeeded),false);await f.manager.close();assert.equal(readFileSync(path,'utf8'),bytes)
 }
 f.select('invalid-store',shell(choices.replaceAll('storeValue:true','storeValue:false')));await f.open();assert.equal(f.field('locale').props.value,'en');assert.deepEqual(f.field('tags').props.value,['red']);assert.equal((await f.act()).succeeded,true)
})

test('field-kind changes use their own defaults without discarding unrelated remembered values',async t=>{
 const f=await fixture(t);f.select('kind-store',shell(choices));await f.open();await f.edit('locale','fr');await f.edit('tags',['blue']);assert.equal((await f.act()).succeeded,true)
 f.select('kind-store',shell("React.createElement(Form.Checkbox,{id:'locale',defaultValue:false,storeValue:true,label:'New Kind'})"));await f.open();assert.equal(f.field('locale').props.value,false);await f.edit('locale',true);assert.equal((await f.act()).succeeded,true)
 f.select('kind-store',shell(choices));await f.open();assert.equal(f.field('locale').props.value,'en','A different typed field cannot inherit the old choice');assert.deepEqual(f.field('tags').props.value,['blue'],'Submitting a partial form preserves absent remembered fields')
})
