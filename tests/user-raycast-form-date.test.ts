import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, type TestContext } from 'node:test'
// @ts-expect-error First-party private-runtime builder.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'

const owner={webContentsId:17},artifact=resolve('plugins/trusted-raycast/vendor/google-translate.tar')
async function fixture(t:TestContext,command:string){
 const root=mkdtempSync(join(tmpdir(),'tockteam-form-date-')),runtime=join(root,'host'),install=new UserRaycastInstall(join(root,'installed')),source=join(root,'source');mkdirSync(source)
 writeFileSync(join(source,'package.json'),JSON.stringify({name:'offline-date-fields',title:'Offline Date Fields',commands:[{name:'edit',mode:'view'}]}));writeFileSync(join(source,'edit.js'),command)
 const messages:UserRaycastMessage[]=[],errors:string[]=[],pids:number[]=[];let copies=0
 const manager=new UserRaycastManager({install,runtime,nodePath:process.execPath,artifact,onMessage:(_owner,message)=>messages.push(message),onError:(_owner,error)=>errors.push(error.message),copyText:async()=>{copies++}})
 t.after(async()=>{try{await manager.close();for(const pid of pids)assert.throws(()=>process.kill(-pid,0),/ESRCH/);t.diagnostic(`Stopped owned process groups: ${pids.join(', ')}`)}finally{rmSync(root,{recursive:true,force:true})}})
 await buildUserRaycast(runtime);const chosen=install.prepare(source);install.approve(chosen.digest);install.enable()
 const open=async()=>{await manager.close();messages.length=0;errors.length=0;const pending=manager.start(owner);if(manager.childPid)pids.push(manager.childPid);await pending;assert.deepEqual(errors,[])}
 const latest=()=>messages.filter(m=>m.root).at(-1)!,nodes=(type:string):any[]=>{const result:any[]=[];const walk=(node:any):void=>{if(!node||typeof node==='string')return;if(node.type===type)result.push(node);for(const child of node.children??[])walk(child)};walk(latest().root);return result},field=(id:string)=>{const node=nodes('raycast-text-field').find(n=>n.props.id===id);assert.ok(node,`Missing field ${id}`);return node}
 let requests=0,lastActionStart=0
 const edit=(id:string,value:unknown,kind='fieldChanged')=>manager.send(owner,{sessionId:latest().sessionId,revision:latest().revision,eventId:field(id).props.fieldEventId,requestId:`date-${++requests}`,kind,value}as any)
 const act=async(title='Submit Form')=>{const action=nodes('raycast-action').find(n=>n.props.title===title);assert.ok(action);const before=messages.length;lastActionStart=before;manager.send(owner,{sessionId:latest().sessionId,revision:latest().revision,eventId:action.props.actionEventId,kind:'action'});const deadline=Date.now()+3000;while(!messages.slice(before).some(m=>m.type==='outcome')&&!errors.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));const outcome=messages.slice(before).find(m=>m.type==='outcome');assert.ok(outcome,JSON.stringify({errors,messages}));return outcome}
 const answer=async()=>{const deadline=Date.now()+2500;while(!messages.slice(lastActionStart).some(m=>m.root)&&!errors.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.ok(messages.slice(lastActionStart).some(m=>m.root),'Wait for the callback result to become visible');return JSON.parse(nodes('raycast-list-item')[0].props.title)}
 await open();return{root,install,manager,messages,errors,pids,open,latest,nodes,field,edit,act,copies:()=>copies,answer}
}
const shell=(fields:string,body='',submit='setAnswer(JSON.stringify(Object.fromEntries(Object.entries(values).map(([id,value])=>[id,value===null?null:{isDate:value instanceof Date,iso:value.toISOString()}]))))',actions='null')=>`
 const React=require('react');const {Form,FormDatePicker,Action,ActionPanel,List}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};
 exports.default=function Edit(){const [result,setResult]=React.useState({answer:'Ready',revision:0});const setAnswer=answer=>setResult(previous=>({answer,revision:previous.revision+1}));${body};return React.createElement(React.Fragment,null,React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Submit Form',onSubmit:async values=>{${submit}}}),${actions})},${fields}),React.createElement(List,null,React.createElement(List.Item,{title:result.answer,subtitle:String(result.revision)})));};`

test('date fields submit real JavaScript Dates and nulls while only canonical strings enter the renderer',async t=>{
 const initial='2026-10-02T12:34:56.789Z',edited='2026-10-03T01:02:03.456Z'
 const f=await fixture(t,shell(`React.createElement(Form.DatePicker,{id:'when',title:'When',defaultValue:new Date('${initial}')}),React.createElement(Form.DatePicker,{id:'empty',title:'Optional Date'}),React.createElement(FormDatePicker,{id:'day',title:'Day',type:Form.DatePicker.Type.Date,defaultValue:new Date('2026-10-04T00:00:00.000Z')})`))
 assert.equal(f.field('when').props.fieldKind,'date');assert.equal(f.field('when').props.value,initial);assert.equal(f.field('when').props.dateType,'date_time');assert.equal(f.field('empty').props.value,null);assert.equal(f.field('day').props.dateType,'date')
 assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{when:{isDate:true,iso:initial},empty:null,day:{isDate:true,iso:'2026-10-04T00:00:00.000Z'}})
 await f.edit('when',edited);await f.edit('day',null);assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{when:{isDate:true,iso:edited},empty:null,day:null});assert.deepEqual(f.errors,[])
})

test('date selection limits are inclusive, ignore clocks only in day mode and never mutate rejected values',async t=>{
 const f=await fixture(t,shell(`React.createElement(Form.DatePicker,{id:'day',type:Form.DatePicker.Type.Date,defaultValue:new Date('2026-10-02T12:00:00.000Z'),min:new Date('2026-10-01T23:00:00.000Z'),max:new Date('2026-10-03T01:00:00.000Z')}),React.createElement(Form.DatePicker,{id:'time',defaultValue:new Date('2026-10-02T12:00:00.000Z'),min:new Date('2026-10-01T23:00:00.000Z'),max:new Date('2026-10-03T01:00:00.000Z')})`,`process.env.TZ='UTC'`))
 assert.equal(f.field('day').props.min,'2026-10-01T23:00:00.000Z');assert.equal(f.field('time').props.max,'2026-10-03T01:00:00.000Z')
 for(const value of ['2026-10-01T00:00:00.000Z','2026-10-03T23:59:59.999Z'])await f.edit('day',value)
 for(const value of ['2026-09-30T23:59:59.999Z','2026-10-04T00:00:00.000Z'])await assert.rejects(async()=>await f.edit('day',value),/allowed range/)
 assert.equal(f.field('day').props.value,'2026-10-03T23:59:59.999Z')
 for(const value of ['2026-10-01T23:00:00.000Z','2026-10-03T01:00:00.000Z'])await f.edit('time',value)
 for(const value of ['2026-10-01T22:59:59.999Z','2026-10-03T01:00:00.001Z'])await assert.rejects(async()=>await f.edit('time',value),/allowed range/)
 assert.equal(f.field('time').props.value,'2026-10-03T01:00:00.000Z');await f.edit('time',null);assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{day:{isDate:true,iso:'2026-10-03T23:59:59.999Z'},time:null})
})

test('controlled date callbacks, focus events and reset refs receive fresh Dates or null',async t=>{
 const initial='2026-10-02T12:00:00.000Z'
 const f=await fixture(t,shell(`React.createElement(Form.DatePicker,{id:'when',value:when,defaultValue:new Date('${initial}'),ref:dateRef,onChange:async value=>{await new Promise(r=>setTimeout(r,20));setWhen(value===null?null:new Date(value.getTime()+60000))},onFocus:event=>{setAnswer(JSON.stringify({type:event.type,id:event.target.id,isDate:event.target.value instanceof Date,iso:event.target.value===null?null:event.target.value.toISOString()}));event.target.value?.setUTCFullYear(1999)},onBlur:event=>setAnswer(JSON.stringify({type:event.type,id:event.target.id,value:event.target.value===null?null:event.target.value.toISOString()}))})`,`const [when,setWhen]=React.useState(null);const dateRef=React.useRef(null)`,undefined,`React.createElement(Action,{title:'Reset and Focus',onAction:()=>{dateRef.current.reset();dateRef.current.focus()}})`))
 assert.equal(f.field('when').props.value,null);await f.edit('when',initial);assert.equal(f.field('when').props.value,'2026-10-02T12:01:00.000Z')
 await f.edit('when','2026-10-02T12:01:00.000Z','fieldFocused');assert.deepEqual(await f.answer(),{type:'focus',id:'when',isDate:true,iso:'2026-10-02T12:01:00.000Z'});assert.equal(f.field('when').props.value,'2026-10-02T12:01:00.000Z')
 await f.edit('when',null);await f.edit('when',null,'fieldBlurred');assert.deepEqual(await f.answer(),{type:'blur',id:'when',value:null})
 const focused=f.field('when').props.focusRequest;assert.equal((await f.act('Reset and Focus')).succeeded,true)
 const deadline=Date.now()+2500;while(f.field('when').props.value!=='2026-10-02T12:01:00.000Z'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10))
 assert.equal(f.field('when').props.value,'2026-10-02T12:01:00.000Z');assert.ok(f.field('when').props.focusRequest>focused)
})

test('mutable Date defaults, callback arguments and submit arguments never alias owned values',async t=>{
 const initial='2026-10-02T12:00:00.123Z',next='2026-10-03T13:00:00.456Z'
 const f=await fixture(t,shell(`React.createElement(Form.DatePicker,{id:'when',defaultValue:defaults,ref:dateRef,onChange:value=>value?.setUTCFullYear(1999)})`,`const defaults=React.useRef(Object.assign(new Date('${initial}'),{toISOString:()=>{throw Error('Custom serialization prohibited')},toJSON:()=>{throw Error('Custom serialization prohibited')}})).current,dateRef=React.useRef(null);const [round,setRound]=React.useState(0)`,`setAnswer(JSON.stringify({isDate:values.when instanceof Date,iso:values.when.toISOString()}));values.when.setUTCFullYear(2000)`,`React.createElement(Action,{title:'Mutate Default',onAction:()=>{defaults.setUTCFullYear(2001);setRound(round+1)}}),React.createElement(Action,{title:'Reset Date',onAction:()=>dateRef.current.reset()})`))
 assert.equal((await f.act('Mutate Default')).succeeded,true);assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{isDate:true,iso:initial})
 await f.edit('when',next);assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{isDate:true,iso:next});assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{isDate:true,iso:next})
 assert.equal((await f.act('Reset Date')).succeeded,true);const deadline=Date.now()+2500;while(f.field('when').props.value!==initial&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.equal(f.field('when').props.value,initial)
})

test('stored dates and stored nulls restore as typed values only after accepted submission',async t=>{
 const initial='2026-10-02T12:00:00.000Z',next='2026-10-03T13:00:00.456Z'
 const f=await fixture(t,shell(`React.createElement(Form.DatePicker,{id:'when',defaultValue:new Date('${initial}'),storeValue:true}),React.createElement(Form.DatePicker,{id:'temporary',defaultValue:new Date('${initial}')})`,`const [reject,setReject]=React.useState(false)`,`if(reject)return false;setAnswer(JSON.stringify({isDate:values.when instanceof Date,iso:values.when===null?null:values.when.toISOString()}));values.when?.setUTCFullYear(1999)`,`React.createElement(Action,{title:'Reject Next Save',onAction:()=>setReject(true)})`))
 await f.edit('when',next);await f.open();assert.equal(f.field('when').props.value,initial)
 await f.edit('when',next);await f.edit('temporary',next);assert.equal((await f.act()).succeeded,true);await f.open();assert.equal(f.field('when').props.value,next);assert.equal(f.field('temporary').props.value,initial)
 assert.equal((await f.act('Reject Next Save')).succeeded,true);await f.edit('when',null);assert.equal((await f.act()).succeeded,false);await f.open();assert.equal(f.field('when').props.value,next)
 await f.edit('when',null);assert.equal((await f.act()).succeeded,true);await f.open();assert.equal(f.field('when').props.value,null);assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{isDate:false,iso:null})
})

test('malformed, foreign and wrong-kind date edits fail without granting native action authority',async t=>{
 const initial='2026-10-02T12:00:00.000Z'
 const f=await fixture(t,shell(`React.createElement(Form.DatePicker,{id:'when',defaultValue:new Date('${initial}'),onChange:()=>require('@raycast/api').Clipboard.copy('fake-only')}),React.createElement(Form.TextField,{id:'text',defaultValue:'keep'}),React.createElement(Form.Checkbox,{id:'check',defaultValue:false})`))
 for(const value of ['',true,0,{},[],['2026-10-03'],new Date(initial),'2026-02-30T12:00:00.000Z','2026-10-02T12:00:00Z','2026-10-02T12:00:00.000+00:00','2026-10-02T12:00:00.000Z\n','x'.repeat(16385)])await assert.rejects(async()=>await f.edit('when',value))
 const current=f.latest(),node=f.field('when');for(const changed of [{sessionId:'foreign'},{revision:current.revision+1},{eventId:'unknown'},{requestId:''}])await assert.rejects(async()=>await f.manager.send(owner,{sessionId:current.sessionId,revision:current.revision,eventId:node.props.fieldEventId,requestId:'bad-date',kind:'fieldChanged',value:initial,...changed}as any))
 for(const id of ['text','check'])await assert.rejects(async()=>await f.edit(id,null));await assert.rejects(async()=>await f.edit('when','query','fieldSearchChanged'));assert.equal(f.field('when').props.value,initial)
 await assert.rejects(async()=>await f.edit('when','2026-10-03T12:00:00.000Z'),/current approved action/);assert.equal(f.copies(),0);assert.ok(f.manager.childPid)
})

test('retired date fields release submission values and handles while unverified full-day helpers reject explicitly',async t=>{
 const f=await fixture(t,shell(`show?React.createElement(Form.DatePicker,{id:'when',defaultValue:new Date('2026-10-02T12:00:00.000Z')}):null`,`const [show,setShow]=React.useState(true)`,undefined,`React.createElement(Action,{title:'Remove Date',onAction:()=>setShow(false)}),React.createElement(Action,{title:'Check Full Day',onAction:()=>Form.DatePicker.isFullDay(new Date())})`))
 const old=f.field('when');assert.equal((await f.act('Remove Date')).succeeded,true);const deadline=Date.now()+2500;while(f.nodes('raycast-text-field').length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10))
 await assert.rejects(async()=>await f.manager.send(owner,{sessionId:f.latest().sessionId,revision:f.latest().revision,eventId:old.props.fieldEventId,requestId:'retired-date',kind:'fieldChanged',value:null}as any));assert.equal((await f.act()).succeeded,true);assert.deepEqual(await f.answer(),{})
 const result=await f.act('Check Full Day');assert.equal(result.succeeded,false);assert.match(result.message??'',/Form.DatePicker.isFullDay.*not admitted/)
})

test('invalid public date props and forged date metadata cannot enter the owned renderer',async t=>{
 const fields=[`React.createElement(Form.DatePicker,{id:'when',defaultValue:'2026-10-02T12:00:00.000Z'})`,`React.createElement(Form.DatePicker,{id:'when',value:new Date(NaN)})`,`React.createElement(Form.DatePicker,{id:'when',type:'guessed'})`,`React.createElement(Form.DatePicker,{id:'when',min:null})`,`React.createElement(Form.DatePicker,{id:'when',min:new Date('2026-10-03'),max:new Date('2026-10-01')})`,`React.createElement('raycast-text-field',{id:'when',fieldEventId:'forged',focusRequest:0,fieldKind:'date',value:null,dateType:'guessed'})`,`React.createElement('raycast-text-field',{id:'when',fieldEventId:'forged',focusRequest:0,fieldKind:'date',value:null,dateType:'date_time',min:'forged'})`]
 for(const field of fields){let f:Awaited<ReturnType<typeof fixture>>|undefined;try{f=await fixture(t,shell(field))}catch(error){assert.ok(error instanceof Error);continue}const deadline=Date.now()+2500;while(!f.errors.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.ok(f.errors.length,'Invalid date props must fail visibly');await f.manager.close();assert.equal(f.manager.childPid,undefined)}
})
