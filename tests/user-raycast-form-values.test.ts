import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party JavaScript build helper.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'

const owner = { webContentsId: 17 }
const artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')
const cases = ['text-default', 'typed-defaults', 'controlled-lifecycle', 'strict-lifecycle', 'form-isolation', 'false-submit', 'rejected-submit', 'invalid-id', 'invalid-value'] as const

for (const behavior of cases) test(`approved Form API: ${behavior}`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-form-values-'))
  const source = join(root, 'source'), runtime = join(root, 'host')
  mkdirSync(source)
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'form-values', title: 'Offline Form Values', commands: [{ name: 'edit', mode: 'view' }] }))
  const fields = behavior === 'invalid-id' ? `React.createElement(Form.TextField,{id:'',defaultValue:'Invalid'})`
    : behavior === 'invalid-value' ? `React.createElement(Form.TextField,{id:'name',value:true})`
    : behavior === 'typed-defaults'
    ? `React.createElement(Form.TextField,{id:'name',defaultValue:'First'}),React.createElement(Form.PasswordField,{id:'password',defaultValue:'fake-password'}),React.createElement(Form.TextArea,{id:'notes',defaultValue:'Two\\nLines'}),React.createElement(Form.Checkbox,{id:'enabled',label:'Enabled',defaultValue:false})`
    : behavior === 'controlled-lifecycle'
      ? `React.createElement(Form.TextField,{id:'name',defaultValue:round?'Later':'First'}),React.createElement(Form.TextField,{id:'controlled',value:round?'Updated':'',defaultValue:'Ignored'}),React.createElement(Form.Checkbox,{id:'enabled',value:Boolean(round),defaultValue:true}),React.createElement(Form.TextField,{id:'empty'}),round?null:React.createElement(Form.TextField,{id:'removed',defaultValue:'Removed'})`
      : `React.createElement(Form.TextField,{id:'name',defaultValue:'First'}),${behavior === 'form-isolation' ? `React.createElement(Form.TextField,{id:'__proto__',defaultValue:'Own Key'}),React.createElement(Form.TextField,{id:'constructor',defaultValue:'Own Constructor'})` : 'null'}`
  writeFileSync(join(source, 'edit.js'), `
    const React=require('react');const {Form,Action,ActionPanel,List}=require('@raycast/api');global.fetch=()=>{throw Error('Network prohibited')};
    exports.default=function Edit(){const [round,setRound]=React.useState(0),[answer,setAnswer]=React.useState('Ready');
      const submit=values=>{${behavior === 'false-submit' ? 'return false' : behavior === 'rejected-submit' ? "return Promise.reject(Error('Rejected by Fixture'))" : "setAnswer(JSON.stringify({values,plain:Object.getPrototypeOf(values)===Object.prototype}))"}};
      return React.createElement(${behavior === 'strict-lifecycle' ? 'React.StrictMode' : 'React.Fragment'},null,
        React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Submit Form',onSubmit:submit}),React.createElement(Action,{title:'Change Values',onAction:()=>setRound(1)}))},${fields}),
        ${behavior === 'form-isolation' ? "React.createElement(Form,{actions:React.createElement(ActionPanel,null,React.createElement(Action.SubmitForm,{title:'Submit Other Form',onSubmit:submit}))},React.createElement(Form.TextField,{id:'name',defaultValue:'Other'}))," : ''}
        React.createElement(List,null,React.createElement(List.Item,{title:answer})));
    }
  `)
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: UserRaycastMessage[] = [], errors: string[] = [], pids: number[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact,
    onMessage: (_owner, message) => messages.push(message), onError: (_owner, error) => errors.push(error.message),
  })
  t.after(async () => {
    await manager.close()
    for (const pid of pids) assert.throws(() => process.kill(-pid, 0), /ESRCH/)
    t.diagnostic(`Stopped owned process groups: ${pids.join(', ')}`)
    rmSync(root, { recursive: true, force: true })
  })
  await buildUserRaycast(runtime)
  const selected = install.prepare(source); install.approve(selected.digest); install.enable()
  const opening = manager.start(owner)
  if (manager.childPid) pids.push(manager.childPid)
  if (behavior === 'invalid-id' || behavior === 'invalid-value') {
    await opening.catch(error => assert.match(error.message, /Invalid form field ID or value/))
    // React can commit an empty ready frame before delivering the render error.
    const deadline = Date.now() + 2500
    while (!errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.match(errors.join('\n'), /Invalid form field ID or value/)
    assert.equal(messages.some(message => message.type === 'outcome' && message.succeeded), false)
    return
  }
  await opening
  const latestNodes = (type: string): Array<{ props: Record<string, unknown> }> => {
    const nodes: Array<{ props: Record<string, unknown> }> = []
    const walk = (node: any): void => { if (!node || typeof node === 'string') return; if (node.type === type) nodes.push(node); for (const child of node.children ?? []) walk(child) }
    walk(messages.filter(message => message.root).at(-1)?.root)
    return nodes
  }
  const act = async (title: string) => {
    const action = latestNodes('raycast-action').find(node => node.props.title === title)
    assert.ok(action)
    const before = messages.length
    manager.send(owner, { revision: messages.filter(message => message.root).at(-1)!.revision, eventId: action.props.actionEventId as string, kind: 'action' })
    const deadline = Date.now() + 2500
    while (!messages.slice(before).some(message => message.type === 'outcome') && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    const outcome = messages.slice(before).find(message => message.type === 'outcome')
    assert.ok(outcome, JSON.stringify({ errors, messages }))
    return outcome
  }
  if (behavior === 'controlled-lifecycle') {
    assert.equal((await act('Submit Form')).succeeded, true)
    assert.deepEqual(JSON.parse(latestNodes('raycast-list-item').at(-1)?.props.title as string).values,
      { name: 'First', controlled: '', enabled: false, empty: '', removed: 'Removed' })
    assert.equal((await act('Change Values')).succeeded, true)
  }
  const outcome = await act('Submit Form')
  if (behavior === 'false-submit' || behavior === 'rejected-submit') {
    assert.equal(outcome.succeeded, false, 'A rejected submit must not report success')
    if (behavior === 'rejected-submit') assert.match(outcome.message ?? '', /Rejected by Fixture/)
  } else {
    assert.equal(outcome.succeeded, true)
    const answer = () => JSON.parse(latestNodes('raycast-list-item').at(-1)?.props.title as string) as { values: Record<string, unknown>; plain: boolean }
    const expected = behavior === 'typed-defaults' ? { name: 'First', password: 'fake-password', notes: 'Two\nLines', enabled: false }
      : behavior === 'controlled-lifecycle' ? { name: 'First', controlled: 'Updated', enabled: true, empty: '' }
        : behavior === 'form-isolation' ? Object.fromEntries([['name', 'First'], ['__proto__', 'Own Key'], ['constructor', 'Own Constructor']]) : { name: 'First' }
    assert.deepEqual(answer(), { values: expected, plain: true })
    if (behavior === 'form-isolation') { assert.equal((await act('Submit Other Form')).succeeded, true); assert.deepEqual(answer(), { values: { name: 'Other' }, plain: true }) }
  }
  assert.deepEqual(errors, [])
})
