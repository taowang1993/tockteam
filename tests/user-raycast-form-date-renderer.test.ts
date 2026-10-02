import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createUserRaycastView } from '../src/user-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { UserRaycastMessage } from '../src/user-raycast-manager.ts'
const {JSDOM}=createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json',import.meta.url))('jsdom')
const flush=()=>new Promise(r=>setImmediate(r))
const dates=(value:string|null='2026-10-03T14:30:15.250Z',extra={})=>({type:'root',props:{},children:[{type:'raycast-form',props:{formId:'form-1'},children:[{type:'raycast-text-field',props:{id:'day',title:'Day',fieldKind:'date',dateType:'date',value:'2026-10-02T00:00:00.000Z',min:'2026-10-01T23:00:00.000Z',max:'2026-10-31T01:00:00.000Z',fieldEventId:'field-day',focusRequest:0},children:[]},{type:'raycast-text-field',props:{id:'when',title:'When',fieldKind:'date',dateType:'date_time',value,fieldEventId:'field-when',focusRequest:0,...extra},children:[]},{type:'raycast-action',props:{title:'Submit Dates',submitForm:true,actionEventId:'action-0'},children:[]}]}]})
async function setup(run:(event:any)=>Promise<void>=async()=>{}){
 const dom=new JSDOM('<!doctype html><html><body></body></html>'),document=dom.window.document as Document,events:any[]=[];let listener:((message:UserRaycastMessage)=>void)|undefined
 const emit=(revision:number,tree:unknown,type:'ready'|'patch'='patch',sessionId='date-session')=>listener?.({type,extensionId:'date-demo',sessionId,revision,root:tree})
 const bridge={userRaycastState:async()=>({digest:'a'.repeat(64),enabled:true,installed:true,hasPrevious:false}),userRaycastOpen:async()=>emit(0,dates(),'ready'),userRaycastClose:async()=>{},userRaycastEvent:async(event:any)=>{events.push(event);await run(event)},onUserRaycastView:(callback:any)=>{listener=callback;return()=>{listener=undefined}}}as unknown as LauncherPreloadBridge
 const view=createUserRaycastView(document,bridge,()=>{});document.body.append(view.element);await flush();document.querySelector<HTMLButtonElement>('[data-user-raycast-action="open"]')!.click();await flush()
 return{dom,document,view,events,emit,close:()=>{view.dispose();dom.window.close()}}
}

test('date and local date-time controls keep exact projected instants on focus, expose inclusive bounds and clear to null',async()=>{
 const previous=process.env.TZ;process.env.TZ='UTC';const f=await setup()
 try{
  const day=f.document.querySelector<HTMLInputElement>('input[aria-label="Day"]')!,when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!
  assert.equal(day.type,'date');assert.equal(when.type,'datetime-local');assert.equal(day.value,'2026-10-02');assert.equal(day.min,'2026-10-01');assert.equal(day.max,'2026-10-31');assert.equal(when.valueAsNumber,Date.parse('2026-10-03T14:30:15.250Z'));assert.equal(when.step,'any')
  when.focus();await flush();assert.equal(f.events.find(e=>e.kind==='fieldFocused').value,'2026-10-03T14:30:15.250Z')
  when.value='';when.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush();assert.equal(f.events.find(e=>e.kind==='fieldChanged').value,null)
 }finally{f.close();if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})

test('nonexistent local times and out-of-range dates stay visible and block edits and submission without runtime errors',async()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';const f=await setup()
 try{
  const when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!
  when.value='2026-03-08T02:30';when.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush()
  assert.equal(f.events.filter(e=>e.kind==='fieldChanged').length,0);assert.equal(when.getAttribute('aria-invalid'),'true');assert.match(f.document.body.textContent??'',/does not exist/)
  when.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await flush();assert.equal(f.events.filter(e=>e.kind==='action').length,0)
  f.emit(1,dates('2026-10-04T12:00:00.000Z'));assert.equal(when.value,'2026-03-08T02:30','Do not erase an invalid pending draft on an unrelated patch')
  const day=f.document.querySelector<HTMLInputElement>('input[aria-label="Day"]')!;day.value='2026-11-02';day.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush();assert.equal(f.events.filter(e=>e.kind==='fieldChanged').length,0);assert.equal(day.getAttribute('aria-invalid'),'true');assert.match(f.document.body.textContent??'',/allowed range/)
  when.value='';when.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush();assert.equal(f.events.find(e=>e.kind==='fieldChanged').value,null)
 }finally{f.close();if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})

test('unchanged date projections retain exact milliseconds and late DST folds in four time zones',async()=>{
 const previous=process.env.TZ
 try{for(const [zone,instant]of [['UTC','2026-10-03T14:30:15.250Z'],['America/New_York','2026-11-01T06:30:15.123Z'],['Australia/Lord_Howe','2026-04-04T15:15:15.123Z'],['Pacific/Auckland','2026-04-04T14:15:15.123Z']]){
  process.env.TZ=zone;const f=await setup();try{f.emit(1,dates(instant));const when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!,date=new Date(instant!),wall=new Date(0);wall.setUTCFullYear(date.getFullYear(),date.getMonth(),date.getDate());wall.setUTCHours(date.getHours(),date.getMinutes(),date.getSeconds(),date.getMilliseconds());assert.equal(when.valueAsNumber,wall.getTime());when.focus();await flush();assert.equal(f.events.find(e=>e.kind==='fieldFocused').value,instant);when.blur();await flush();assert.equal(f.events.find(e=>e.kind==='fieldBlurred').value,instant);assert.equal(f.events.filter(e=>e.kind==='fieldChanged').length,0)}finally{f.close()}
 }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})

test('year 1 and 10000 stay exact, while unsupported calendar years remain visible failures rather than null submissions',async()=>{
 const previous=process.env.TZ;process.env.TZ='UTC';const f=await setup()
 try{let revision=0;for(const instant of ['0001-01-01T00:00:00.123Z','+010000-01-01T00:00:00.456Z']){f.emit(++revision,dates(instant));const when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!;assert.equal(when.valueAsNumber,Date.parse(instant));when.focus();await flush();assert.equal(f.events.filter(e=>e.kind==='fieldFocused').at(-1).value,instant);when.blur();await flush()}
  f.emit(++revision,dates('0000-01-01T00:00:00.000Z'));const when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!;assert.equal(when.value,'');assert.equal(when.getAttribute('aria-invalid'),'true');assert.match(f.document.body.textContent??'',/cannot display this year/);when.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await flush();assert.equal(f.events.filter(e=>e.kind==='action').length,0)
 }finally{f.close();if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})

test('local edits preserve draft, focus and stable identity until controlled acknowledgement and mode changes finish before keyboard submission',async()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';let release!:()=>void;const gate=new Promise<void>(r=>{release=r});const f=await setup(async event=>{if(event.kind==='fieldChanged')await gate})
 try{
  const when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!;when.focus();await flush();when.value='2026-10-03T11:12:13.123';when.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush();assert.equal(f.events.find(e=>e.kind==='fieldChanged').value,'2026-10-03T15:12:13.123Z')
  f.emit(1,dates('2026-10-04T16:00:00.000Z',{dateType:'date',focusRequest:1,info:'Choose a Day',error:''}));assert.equal(f.document.querySelector('input[aria-label="When"]'),when);assert.equal(when.type,'date');assert.equal(when.value,'2026-10-03');assert.equal(f.document.activeElement,when)
  when.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await flush();assert.equal(f.events.filter(e=>e.kind==='action').length,0);release();await flush();await flush();assert.equal(when.value,'2026-10-04');assert.equal(f.events.filter(e=>e.kind==='action').length,1);assert.equal(f.events.at(-1).revision,1);assert.equal(when.disabled,true)
 }finally{release();f.close();if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})

test('switching modes with an invalid date draft fails visibly without crashing or submitting a substituted value',async()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';const f=await setup()
 try{
  const when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!;when.value='2026-03-08T02:30';when.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush()
  assert.doesNotThrow(()=>f.emit(1,dates('2026-10-04T12:00:00.000Z',{dateType:'date'})));assert.equal(when.type,'date');assert.equal(when.value,'2026-03-08');assert.equal(when.getAttribute('aria-invalid'),'true');assert.match(f.document.body.textContent??'',/Re-enter/)
  when.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await flush();assert.equal(f.events.filter(e=>e.kind==='action').length,0);assert.equal(f.events.filter(e=>e.kind==='fieldChanged').length,0)
  when.value='2026-10-05';when.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush();assert.equal(f.events.find(e=>e.kind==='fieldChanged').value,'2026-10-05T04:00:00.000Z');assert.equal(when.getAttribute('aria-invalid'),'false')
 }finally{f.close();if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})

test('explicit date reset clears only invalid local drafts, not valid unacknowledged input or an ordinary focus patch',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r});const f=await setup(async event=>{if(event.kind==='fieldChanged')await gate})
 try{
  const when=f.document.querySelector<HTMLInputElement>('input[aria-label="When"]')!;when.value='2026-10-05T11:12:13.123';when.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush();const pending=when.valueAsNumber;f.emit(1,dates(undefined,{resetRequest:1,focusRequest:1}));assert.equal(when.valueAsNumber,pending);release();await flush();await flush()
  const day=f.document.querySelector<HTMLInputElement>('input[aria-label="Day"]')!;day.value='2026-11-02';day.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await flush();f.emit(2,dates(undefined,{focusRequest:2}));assert.equal(day.value,'2026-11-02');const reset=dates();reset.children[0]!.children[0]!.props={...reset.children[0]!.children[0]!.props,resetRequest:1}as any;f.emit(3,reset);assert.equal(day.getAttribute('aria-invalid'),'false');assert.notEqual(day.value,'2026-11-02')
 }finally{release();f.close()}
})

test('date validation belongs to its SubmitForm; reset actions and a separate healthy Form remain usable',async()=>{
 for(const [title,eventId]of [['Reset Date','reset-0'],['Submit Healthy Form','healthy-0']]){const f=await setup();try{
  const invalid=dates('0000-01-01T00:00:00.000Z'),first=invalid.children[0]!;first.children.push({type:'raycast-action',props:{title:'Reset Date',submitForm:false,actionEventId:'reset-0'},children:[]});invalid.children.push({type:'raycast-form',props:{formId:'form-2'},children:[{type:'raycast-action',props:{title:'Submit Healthy Form',submitForm:true,actionEventId:'healthy-0'},children:[]}]});f.emit(1,invalid)
  Array.from(f.document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===title)!.click();await flush();assert.equal(f.events.find(e=>e.kind==='action').eventId,eventId)
 }finally{f.close()}}
})
