import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
// @ts-expect-error First-party private-runtime builder.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager } from '../src/user-raycast-manager.ts'
import { createUserRaycastView } from '../src/user-raycast-renderer.ts'

const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
const wait = async (check: () => boolean) => {
  const end = Date.now() + 2500
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(check(), 'The expected public state must become visible')
}

async function fixture(t: any, code: string) {
  new Script(code) // Parse first-party fixtures before allocating or launching their runtime.
  const root = mkdtempSync(join(tmpdir(), 'tockteam-form-presentation-public-')), runtime = join(root, 'runtime'), source = join(root, 'source')
  mkdirSync(source); await buildUserRaycast(runtime)
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'form-presentation-public', title: 'Form Presentation Public', commands: [{ name: 'sections', title: 'Fake Sections', mode: 'view' }] }))
  writeFileSync(join(source, 'sections.js'), code)
  const install = new UserRaycastInstall(join(root, 'home')), candidate = install.prepare(source)
  install.approve(candidate.digest); install.enable()
  const dom = new JSDOM('<!doctype html><html><body></body></html>'), document = dom.window.document as Document, groups = new Set<number>(), owner = { webContentsId: 45 }, errors: string[] = [], requests: any[] = []
  let listener: any
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact: resolve('plugins/trusted-raycast/vendor/google-translate.tar'), onError: (_owner, error) => errors.push(error.message), copyText: async () => { throw Error('Native effects prohibited') }, onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); listener?.(message) } })
  const bridge = { userRaycastState: async () => ({ enabled: true, installed: true, digest: candidate.digest }), userRaycastOpen: () => manager.start(owner), userRaycastClose: () => manager.close(), userRaycastEvent: (event: any) => { requests.push(event); return manager.send(owner, event) }, onUserRaycastView: (callback: any) => { listener = callback; return () => { listener = undefined } } }
  const view = createUserRaycastView(document, bridge as any, () => {}); document.body.append(view.element)
  t.after(async () => { await manager.close(); view.dispose(); dom.window.close(); for (const pid of groups) assert.throws(() => process.kill(-pid, 0), (e: any) => e.code === 'ESRCH'); rmSync(root, { recursive: true, force: true }); console.log('Stopped presentation public groups: ' + [...groups].join(',')) })
  await wait(() => Boolean(document.querySelector('[data-user-raycast-action="open"]')))
  const open = () => document.querySelector<HTMLButtonElement>('[data-user-raycast-action="open"]')!.click()
  const action = (title: string) => { const control = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === title); assert.ok(control); control.click() }
  return { document, dom, errors, requests, manager, open, action }
}

const prefix = `const React=require('react'),{Form,FormSeparator,ActionPanel,Action}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};`

test('public descriptions and both separator names render in Form order without becoming submitted or saved fields', async t => {
  const f = await fixture(t, prefix + `module.exports.default=()=>{const [text,setText]=React.useState('Plain <button onclick="bad()">text</button>\\n**Not Markdown**'),[answer,setAnswer]=React.useState('');if(FormSeparator!==Form.Separator)throw Error('Legacy separator differs');return React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Save Fake Fields',onSubmit:values=>{setAnswer(JSON.stringify(values))}}))},React.createElement(Form.Description,{title:'Overview',text}),React.createElement(Form.TextField,{id:'name',title:'Name',defaultValue:'First',storeValue:true,onChange:value=>setText('Edited '+value)}),React.createElement(Form.Separator),React.createElement(React.Fragment,null,React.createElement(Form.Description,{text:'Choose a fake notification.'}),React.createElement(Form.Checkbox,{id:'enabled',title:'Notifications',label:'Enable Notifications',defaultValue:false,storeValue:true})),React.createElement(FormSeparator),React.createElement(Form.Description,{title:'Result',text:answer}),React.createElement(Form.Description,{text:''}))};`)
  f.open(); await wait(() => Boolean(f.document.querySelector('input[aria-label="Name"]')))
  const form = f.document.querySelector('form')!, name = f.document.querySelector<HTMLInputElement>('input[aria-label="Name"]')!
  const order = Array.from(form.firstElementChild!.children).map(row => row.tagName === 'HR' ? 'Separator' : row.textContent)
  assert.deepEqual(order, ['OverviewPlain <button onclick="bad()">text</button>\n**Not Markdown**', 'Name', 'Separator', 'Choose a fake notification.', 'NotificationsEnable Notifications', 'Separator', 'Result', ''])
  assert.equal(form.querySelectorAll('hr').length, 2); assert.equal(form.querySelector('button[onclick]'), null); assert.equal(form.querySelector('strong'), null)
  name.focus(); await wait(() => f.requests.some(event => event.kind === 'fieldFocused'))
  name.value = 'Edited'; name.setSelectionRange(3, 3); name.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }))
  await wait(() => form.textContent!.includes('Edited Edited'))
  assert.equal(f.document.querySelector('input[aria-label="Name"]'), name); assert.equal(f.document.activeElement, name); assert.equal(name.selectionStart, 3)
  const answer = () => Array.from(f.document.querySelectorAll('form p')).find(paragraph => paragraph.textContent?.startsWith('{'))?.textContent
  f.action('Save Fake Fields'); await wait(() => Boolean(answer())); assert.deepEqual(JSON.parse(answer()!), { name: 'Edited', enabled: false })
  await f.manager.close(); f.open(); await wait(() => Boolean(f.document.querySelector('input[aria-label="Name"]')))
  assert.equal(f.document.querySelector<HTMLInputElement>('input[aria-label="Name"]')!.value, 'Edited')
  assert.equal(f.document.querySelector<HTMLInputElement>('input[aria-label="Enable Notifications"]')!.checked, false)
  f.action('Save Fake Fields'); await wait(() => Boolean(answer())); assert.deepEqual(JSON.parse(answer()!), { name: 'Edited', enabled: false })
  assert.equal(f.errors.length, 0)
  assert.ok(f.requests.filter(event => event.kind.startsWith('field')).every(event => typeof event.value === 'string' || typeof event.value === 'boolean'))
})

test('a presentation-only Form submits no values and changes cannot replace another Form\'s focused field', async t => {
  const f = await fixture(t, prefix + `module.exports.default=()=>{const [answer,setAnswer]=React.useState('Ready');return React.createElement(React.Fragment,null,React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Submit Empty Form',onSubmit:values=>setAnswer(JSON.stringify(values))}))},React.createElement(Form.Description,{title:'Overview',text:answer}),React.createElement(Form.Separator)),React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Submit Second Form',onSubmit:values=>setAnswer(JSON.stringify(values))}))},React.createElement(Form.TextField,{id:'Overview',title:'Second Name',defaultValue:'Second',onChange:()=>setAnswer('Updated')})))};`)
  f.open(); await wait(() => Boolean(f.document.querySelector('input[aria-label="Second Name"]')))
  assert.equal(f.document.querySelectorAll('form').length, 2)
  f.action('Submit Empty Form'); await wait(() => f.document.querySelector('form')!.textContent!.includes('{}'))
  const input = f.document.querySelector<HTMLInputElement>('input[aria-label="Second Name"]')!; input.focus()
  input.value = 'Changed'; input.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }))
  await wait(() => f.document.querySelector('form')!.textContent!.includes('Updated'))
  assert.equal(f.document.activeElement, input); assert.equal(f.document.querySelector('input[aria-label="Second Name"]'), input)
  f.action('Submit Second Form'); await wait(() => f.document.querySelector('form')!.textContent!.includes('{"Overview":"Changed"}'))
  assert.equal(f.errors.length, 0)
})

test('bounded plain descriptions accept the existing text ceiling without exposing controls or executing extra props', async t => {
  const f = await fixture(t, prefix + `module.exports.default=()=>React.createElement(Form,null,React.createElement(Form.Description,{title:'Bounded',text:'A'.repeat(16384),id:'fake',onChange:()=>{throw Error('Must not run')},onAction:()=>{throw Error('Must not run')}}),React.createElement(Form.Separator,{id:'fake',text:'Ignored',onAction:()=>{throw Error('Must not run')}}));`)
  f.open(); await wait(() => f.errors.length > 0 || Boolean(f.document.querySelector('form p')))
  assert.deepEqual(f.errors, [], 'A valid bounded description must reach the Form')
  assert.equal(f.document.querySelector('form p')!.textContent!.length, 16384)
  assert.equal(f.document.querySelectorAll('form input, form textarea, form select, form button').length, 0)
  assert.equal(f.document.querySelectorAll('form hr').length, 1); assert.equal(f.requests.length, 0); assert.equal(f.errors.length, 0)
})

test('invalid public descriptions and counterfeit presentation handles fail closed in the approved-child pipeline', async t => {
  const cases = [
    ['missing description text', `React.createElement(Form.Description,{title:'Missing'})`, /Invalid form description/],
    ['non-string description text', `React.createElement(Form.Description,{text:false})`, /Invalid form description/],
    ['non-string description title', `React.createElement(Form.Description,{text:'Plain',title:42})`, /Invalid form description/],
    ['oversized description text', `React.createElement(Form.Description,{text:'A'.repeat(16385)})`, /Invalid form description/],
    ['oversized description title', `React.createElement(Form.Description,{text:'Plain',title:'A'.repeat(16385)})`, /Invalid form description/],
    ['counterfeit field handle', `React.createElement('raycast-form-description',{text:'Plain',fieldEventId:'fake',fieldKind:'text',value:'hidden',focusRequest:0})`, /Invalid extension projection/],
    ['counterfeit action handle', `React.createElement('raycast-form-description',{text:'Plain',actionEventId:'fake'})`, /Invalid extension projection/],
    ['description child action', `React.createElement('raycast-form-description',{text:'Plain'},React.createElement(Action,{title:'Hidden Action',onAction:()=>{}}))`, /Invalid extension projection/],
    ['raw missing description text', `React.createElement('raycast-form-description',{})`, /Invalid extension projection/],
    ['raw non-string title', `React.createElement('raycast-form-description',{text:'Plain',title:null})`, /Invalid extension projection/],
    ['separator with props', `React.createElement('raycast-form-separator',{title:'Hidden'})`, /Invalid extension projection/],
    ['separator with children', `React.createElement('raycast-form-separator',null,'Hidden')`, /Invalid extension projection/],
  ] as const
  for (const [label, element, error] of cases) await t.test(label, async child => {
    const f = await fixture(child, prefix + `module.exports.default=()=>React.createElement(Form,null,${element});`)
    f.open(); await wait(() => f.errors.length > 0); assert.match(f.errors[0]!, error)
    assert.equal(f.document.querySelector('form'), null); assert.equal(f.requests.length, 0)
  })
})
