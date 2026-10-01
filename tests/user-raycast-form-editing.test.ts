import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, type TestContext } from 'node:test'
// @ts-expect-error First-party private-runtime builder.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'

const owner = { webContentsId: 17 }
const artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')
let fixtureId = 0

async function fixture(t: TestContext, command: string) {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-form-editing-'))
  const source = join(root, 'source'), runtime = join(root, 'host')
  mkdirSync(source)
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: `form-editing-${++fixtureId}`, title: 'Offline Form Editing', commands: [{ name: 'edit', mode: 'view' }] }))
  writeFileSync(join(source, 'edit.js'), command)
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: UserRaycastMessage[] = [], errors: string[] = [], pids: number[] = []
  let copyCalls = 0
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact,
    onMessage: (_owner, message) => messages.push(message), onError: (_owner, error) => errors.push(error.message),
    copyText: () => { copyCalls++; return Promise.resolve() },
  })
  t.after(async () => {
    await manager.close()
    for (const pid of pids) assert.throws(() => process.kill(-pid, 0), /ESRCH/)
    t.diagnostic(`Stopped owned process groups: ${pids.join(', ')}`)
    rmSync(root, { recursive: true, force: true })
  })
  await buildUserRaycast(runtime)
  const selected = install.prepare(source); install.approve(selected.digest); install.enable()
  const opening = manager.start(owner); if (manager.childPid) pids.push(manager.childPid); await opening
  const latest = () => messages.filter(message => message.root).at(-1)!
  const nodes = (type: string): any[] => { const found: any[] = []; const walk = (node: any): void => { if (!node || typeof node === 'string') return; if (node.type === type) found.push(node); for (const child of node.children ?? []) walk(child) }; walk(latest().root); return found }
  const field = (id: string) => { const result = nodes('raycast-text-field').find(node => node.props.id === id); assert.ok(result, `missing field ${id}`); return result }
  let requestSequence = 0
  const edit = (node: any, value: unknown, kind = 'fieldChanged') => manager.send(owner, { sessionId: latest().sessionId, revision: latest().revision, eventId: node.props.fieldEventId, requestId: `request-${++requestSequence}`, kind, value } as any)
  const act = async (title = 'Submit Form') => {
    const action = nodes('raycast-action').find(node => node.props.title === title); assert.ok(action)
    const before = messages.length
    manager.send(owner, { sessionId: latest().sessionId, revision: latest().revision, eventId: action.props.actionEventId, kind: 'action' })
    const deadline = Date.now() + 2500
    while (!messages.slice(before).some(message => message.type === 'outcome') && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(messages.slice(before).find(message => message.type === 'outcome')?.succeeded, true, errors.join('\n'))
  }
  const submit = async () => { await act(); return JSON.parse(nodes('raycast-list-item')[0].props.title) }
  return { manager, messages, errors, copyCalls: () => copyCalls, latest, nodes, field, edit, act, submit }
}
const shell = (form: string, body: string, action = "React.createElement(Action.SubmitForm,{title:'Submit Form',onSubmit:values=>setAnswer(JSON.stringify(values))})") => `
 const React=require('react');const {Form,Action,ActionPanel,List}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};
 exports.default=function Edit(){const [answer,setAnswer]=React.useState('Ready');${body};return React.createElement(React.Fragment,null,
 React.createElement(Form,{actions:React.createElement(ActionPanel,null,${action})},${form}),React.createElement(List,null,React.createElement(List.Item,{title:answer})));};`

test('all supported field kinds submit exact edited value types', async t => {
 const f = await fixture(t, shell("React.createElement(React.Fragment,null,React.createElement(Form.TextField,{id:'text',title:'Text',defaultValue:'a'}),React.createElement(Form.PasswordField,{id:'password',title:'Password',defaultValue:'b'}),React.createElement(Form.TextArea,{id:'area',title:'Area',defaultValue:'c'}),React.createElement(Form.Checkbox,{id:'check',title:'Check',label:'ok',defaultValue:false}))", ''))
 for (const [id,value] of [['text','T'],['password','P'],['area','A'],['check',true]] as const) await f.edit(f.field(id),value)
 assert.deepEqual(await f.submit(),{text:'T',password:'P',area:'A',check:true})
})

test('controlled async change is authoritative and ref reset/focus are projected', async t => {
 const f = await fixture(t, shell("React.createElement(Form.TextField,{id:'name',title:'Name',value:name,defaultValue:'Initial',onChange:async value=>{await new Promise(r=>setTimeout(r,20));setName(value.toUpperCase())},ref:fieldRef})", "const [name,setName]=React.useState('lower');const fieldRef=React.useRef(null)", "React.createElement(Action.SubmitForm,{title:'Submit Form',onSubmit:values=>setAnswer(JSON.stringify(values))}),React.createElement(Action,{title:'Reset and Focus',onAction:async()=>{fieldRef.current.reset();fieldRef.current.focus();await new Promise(r=>setTimeout(r,40))}})"))
 await f.edit(f.field('name'),'upper')
 assert.equal(f.field('name').props.value,'UPPER')
 const before = f.field('name').props.focusRequest
 await f.act('Reset and Focus')
 assert.equal(f.field('name').props.value,'INITIAL')
 assert.ok(f.field('name').props.focusRequest > before)
 assert.deepEqual(await f.submit(), {name:'INITIAL'})
})

test('field focus and blur forward typed SDK events', async t => {
 const f = await fixture(t, shell("React.createElement(Form.TextField,{id:'name',title:'Name',defaultValue:'abc',onFocus:e=>setAnswer(JSON.stringify({type:'focus',target:{id:e.target.id,value:e.target.value}})),onBlur:e=>setAnswer(JSON.stringify({type:'blur',target:{id:e.target.id,value:e.target.value}}))})",''))
 await f.edit(f.field('name'),'abc','fieldFocused')
 assert.deepEqual(JSON.parse(f.nodes('raycast-list-item')[0].props.title),{type:'focus',target:{id:'name',value:'abc'}})
 await f.edit(f.field('name'),'abc','fieldBlurred')
 assert.deepEqual(JSON.parse(f.nodes('raycast-list-item')[0].props.title),{type:'blur',target:{id:'name',value:'abc'}})
})

test('invalid owner, session, revision, handle, and field types reject without changing valid submitted value', async t => {
 const f = await fixture(t, shell("React.createElement(React.Fragment,null,React.createElement(Form.TextField,{id:'text',title:'Text',defaultValue:'keep'}),React.createElement(Form.Checkbox,{id:'check',title:'Check',label:'yes',defaultValue:false}))",''))
 const text=f.field('text'), check=f.field('check'), msg=f.latest()
 const send=(ownerArg:any, data:any) => async()=>await f.manager.send(ownerArg,data)
 await assert.rejects(send({webContentsId:18},{sessionId:msg.sessionId,revision:msg.revision,eventId:text.props.fieldEventId,requestId:'bad-owner',kind:'fieldChanged',value:'x'}))
 await assert.rejects(send(owner,{sessionId:'wrong',revision:msg.revision,eventId:text.props.fieldEventId,requestId:'bad-session',kind:'fieldChanged',value:'x'}))
 await assert.rejects(send(owner,{sessionId:msg.sessionId,revision:msg.revision+1,eventId:text.props.fieldEventId,requestId:'bad-revision',kind:'fieldChanged',value:'x'}))
 await assert.rejects(send(owner,{sessionId:msg.sessionId,revision:msg.revision,eventId:'unknown',requestId:'bad-handle',kind:'fieldChanged',value:'x'}))
 await assert.rejects(send(owner,{sessionId:msg.sessionId,revision:msg.revision,eventId:check.props.fieldEventId,requestId:'bad-type-1',kind:'fieldChanged',value:'x'}))
 await assert.rejects(send(owner,{sessionId:msg.sessionId,revision:msg.revision,eventId:text.props.fieldEventId,requestId:'bad-type-2',kind:'fieldChanged',value:true}))
 await f.edit(text,'keep'); await f.edit(check,false)
 assert.deepEqual(await f.submit(),{text:'keep',check:false})
})

test('clipboard copy from field change is denied without active action', async t => {
 const f = await fixture(t, shell("React.createElement(Form.TextField,{id:'name',title:'Name',defaultValue:'safe',onChange:value=>require('@raycast/api').Clipboard.copy('fake-only')})",''))
 const node=f.field('name')
 await assert.rejects(async()=>await f.edit(node,'attempt'))
 assert.equal(f.copyCalls(),0)
 assert.ok(f.manager.childPid)
})

test('closing session rejects pending field request and stops child group', async t => {
 const f = await fixture(t, shell("React.createElement(Form.TextField,{id:'name',title:'Name',defaultValue:'safe',onChange:()=>new Promise(()=>{})})",''))
 const pending=f.edit(f.field('name'),'hang'); const observed=assert.rejects(Promise.resolve(pending))
 await f.manager.close()
 await observed
 assert.equal(f.manager.childPid,undefined)
})
