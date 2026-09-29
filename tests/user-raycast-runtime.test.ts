import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager } from '../src/user-raycast-manager.ts'

const artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')
const manifest = { name: 'example-list', title: 'Example List', commands: [{ name: 'browse', title: 'Browse', mode: 'view' }] }
const source = `const React = require('react'); const { List, Action, ActionPanel } = require('@raycast/api');
exports.default = function Browse() { return React.createElement(List, { onSearchTextChange() {} }, React.createElement(List.Item, { title: 'Pinned Item', actions: React.createElement(ActionPanel, null, React.createElement(Action.CopyToClipboard, { title: 'Copy Item', content: 'Pinned Item' })) })) }`
const owner = { webContentsId: 17 }

test('packaged Desktop includes the first-party user extension host outside ASAR', () => {
  const packageManifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { build: { asarUnpack: string[]; files: string[] } }
  assert.ok(packageManifest.build.asarUnpack.includes('dist/user-raycast/**'))
  assert.ok(packageManifest.build.files.includes('dist/user-raycast/**'))
  assert.match(readFileSync(resolve('scripts/build.mjs'), 'utf8'), /await buildUserRaycast\(join\(dist, 'user-raycast'\)\)/)
})

test('an extension cannot request a native effect before a user-owned action', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-user-raycast-unowned-'))
  const folder = join(root, 'source')
  mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(folder, 'browse.js'), `process.stdout.write(JSON.stringify({ type: 'native', extensionId: process.env.TOCKTEAM_USER_RAYCAST_ID, sessionId: process.env.TOCKTEAM_USER_RAYCAST_SESSION, revision: 0, eventId: 'forged', requestId: 'native-1', kind: 'copy', text: 'must-not-copy' }) + '\\n'); exports.default = function Browse() { return null }`)
  try {
    const runtime = join(root, 'host')
    await buildUserRaycast(runtime)
    const install = new UserRaycastInstall(join(root, 'installed'))
    const selected = install.prepare(folder, 'browse')
    install.approve(selected.digest); install.enable()
    const copied: string[] = []
    const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: () => {}, copyText: (_owner, text) => { copied.push(text) } })
    t.after(async () => manager.close())
    await assert.rejects(manager.start(owner), /unowned|exited/i)
    assert.deepEqual(copied, [])
    assert.equal(manager.childPid, undefined)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('an approved no-view command gets private storage, defaults, feedback and one fixture copy', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-user-raycast-no-view-'))
  const runtime = join(root, 'host')
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: any[] = []
  const copied: string[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => messages.push(message), copyText: (_owner, text) => { copied.push(text) } })
  t.after(async () => manager.close())
  try {
    await buildUserRaycast(runtime)
    for (const extensionId of ['first-uuid', 'second-uuid']) {
      const folder = join(root, extensionId)
      mkdirSync(folder)
      writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: extensionId, title: extensionId, preferences: [{ name: 'defaultAction', default: 'copy' }, { name: 'prefix', default: `${extensionId}-pref` }], commands: [{ name: 'generate', title: 'Generate UUIDs', mode: 'no-view' }, { name: 'generateV5', title: 'Generate V5', mode: 'no-view' }] }))
      writeFileSync(join(folder, 'generate.js'), `const {Clipboard,LocalStorage,getPreferenceValues,showHUD}=require('@raycast/api'); exports.default=async ({arguments:args})=>{if(getPreferenceValues().defaultAction!=='copy'||getPreferenceValues().prefix!=='${extensionId}-pref'||Object.keys(args).length)throw Error('Invalid preferences or arguments');const prior=await LocalStorage.getItem('history');const count=Number(prior??'0')+1;await LocalStorage.setItem('history',String(count));await Clipboard.copy('${extensionId}-'+count);await showHUD('Copied UUID')}`)
      const selected = install.prepare(folder)
      assert.equal((selected as { mode?: string }).mode, 'no-view')
      install.approve(selected.digest); install.enable()
      for (let index = 0; index < (extensionId === 'first-uuid' ? 2 : 1); index++) {
        const before = messages.length
        await manager.start(owner)
        const deadline = Date.now() + 5000
        while ((!messages.slice(before).some(message => message.type === 'outcome') || manager.childPid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
        const outcome = messages.slice(before).find(message => message.type === 'outcome')
        assert.equal(outcome?.succeeded, true)
        assert.equal(outcome?.eventId, 'run')
        await manager.close()
        assert.equal(manager.childPid, undefined)
        assert.ok(messages.slice(before).some(message => message.type === 'toast' && message.title === 'Copied UUID'))
      }
    }
    assert.deepEqual(copied, ['first-uuid-1', 'first-uuid-2', 'second-uuid-1'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('unsupported no-view APIs fail visibly and cancellation stops the owned child', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-user-raycast-cancel-'))
  const runtime = join(root, 'host')
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: any[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => messages.push(message) })
  t.after(async () => manager.close())
  try {
    await buildUserRaycast(runtime)
    for (const [extensionId, script] of [
      ['unsupported-api', `const {Clipboard}=require('@raycast/api');exports.default=async()=>Clipboard.paste('not admitted')`],
      ['pending-command', `exports.default=async()=>new Promise(()=>{})`],
    ]) {
      const folder = join(root, extensionId)
      mkdirSync(folder)
      writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: extensionId, title: extensionId, commands: [{ name: 'run', title: 'Run', mode: 'no-view' }] }))
      writeFileSync(join(folder, 'run.js'), script)
      const selected = install.prepare(folder)
      install.approve(selected.digest); install.enable()
      await manager.start(owner)
      const pid = manager.childPid
      assert.ok(pid)
      if (extensionId === 'unsupported-api') {
        const deadline = Date.now() + 5000
        while (!messages.some(message => message.type === 'outcome') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
        assert.match(messages.find(message => message.type === 'outcome')?.message ?? '', /Clipboard\.paste.*not admitted/i)
      }
      await manager.closeOwner(owner)
      assert.equal(manager.childPid, undefined)
      assert.throws(() => process.kill(pid, 0), /ESRCH/)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a selected local List stays inert until approved and enabled, then runs in an owned child', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-user-raycast-test-'))
  const folder = join(root, 'source')
  mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(folder, 'browse.js'), source)
  const runtime = join(root, 'built-host')
  try {
    await buildUserRaycast(runtime)
    const install = new UserRaycastInstall(join(root, 'installed'))
    const candidate = install.prepare(folder, 'browse')
    const messages: unknown[] = []
    const copied: string[] = []
    const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => messages.push(message), copyText: (_owner, text) => { copied.push(text) } })
    t.after(async () => manager.close())
    await assert.rejects(manager.start(owner), /not enabled|not approved/i)
    assert.equal(manager.childPid, undefined)
    install.approve(candidate.digest)
    await assert.rejects(manager.start(owner), /not enabled/i)
    install.enable()
    await manager.start(owner)
    const ready = messages.find((message: any) => message.type === 'ready') as any
    assert.ok(ready, 'child projected a List')
    assert.match(JSON.stringify(ready.root), /Pinned Item/)
    const action = JSON.stringify(ready.root).match(/"actionEventId":"([^"]+)"/)
    assert.ok(action)
    assert.throws(() => manager.send({ webContentsId: 18 }, { revision: ready.revision, eventId: action[1]!, kind: 'action' }), /owner/i)
    manager.send(owner, { revision: ready.revision, eventId: action[1]!, kind: 'action' })
    await new Promise<void>((yes, no) => { const until = setTimeout(() => no(new Error('No action outcome')), 2000); const check = setInterval(() => { if (messages.some((message: any) => message.type === 'outcome')) { clearInterval(check); clearTimeout(until); yes() } }, 10) })
    assert.equal((messages.find((message: any) => message.type === 'outcome') as any).succeeded, true)
    assert.deepEqual(copied, ['Pinned Item'])
    const pid = manager.childPid
    await manager.closeOwner(owner)
    assert.equal(manager.childPid, undefined)
    if (pid) assert.throws(() => process.kill(pid, 0), /ESRCH/)
    install.disable()
    await assert.rejects(manager.start(owner), /not enabled/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
