import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager } from '../src/user-raycast-manager.ts'
import { colorPickerMenu } from '../src/user-raycast-menu.ts'

const artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')
const manifest = { name: 'example-list', title: 'Example List', commands: [{ name: 'browse', title: 'Browse', mode: 'view' }] }
const source = `const React = require('react'); const { List, Action, ActionPanel } = require('@raycast/api');
exports.default = function Browse() { return React.createElement(List, { onSearchTextChange() {} }, React.createElement(List.Item, { title: 'Pinned Item', actions: React.createElement(ActionPanel, null, React.createElement(Action.CopyToClipboard, { title: 'Copy Item', content: 'Pinned Item' })) })) }`
const owner = { webContentsId: 17 }

test('a failed child stop retains cleanup ownership and blocks another extension until retry succeeds', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-user-raycast-stop-retry-'))
  const folder = join(root, 'source')
  const proof = join(root, 'workspace.txt')
  mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(folder, 'browse.js'), `require('node:fs').writeFileSync(${JSON.stringify(proof)}, process.cwd());\n${source}`)
  const runtime = join(root, 'host')
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: any[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => messages.push(message) })
  const signal = process.kill.bind(process)
  let pid: number | undefined
  let workspace: string | undefined
  let restoreSignal: (() => void) | undefined
  try {
    await buildUserRaycast(runtime)
    const candidate = install.prepare(folder, 'browse')
    install.approve(candidate.digest); install.enable()
    await manager.start(owner)
    pid = manager.childPid
    assert.ok(pid)
    t.diagnostic(`Owned fixture process group: ${pid}`)
    workspace = readFileSync(proof, 'utf8')
    const ready = messages.find(message => message.type === 'ready')
    assert.ok(ready)
    const action = JSON.stringify(ready.root).match(/"actionEventId":"([^"]+)"/)
    assert.ok(action)
    const failingSignal = t.mock.method(process, 'kill', (target: number, name?: NodeJS.Signals | number) => {
      if (target === -pid! && name === 'SIGTERM') throw Object.assign(new Error('Fixture stop failure'), { code: 'EIO' })
      return signal(target, name)
    })
    restoreSignal = () => failingSignal.mock.restore()
    await assert.rejects(manager.close(), /Fixture stop failure/)
    assert.equal(manager.childPid, pid, 'the stopped command remains owned until its process group is gone')
    assert.equal(signal(-pid, 0), true)
    assert.ok(existsSync(workspace), 'a live child keeps its runtime files')
    await assert.rejects(manager.start(owner), /busy/i)
    assert.throws(() => manager.send(owner, { revision: ready.revision, eventId: action[1]!, kind: 'action' }), /stale/i)
    await manager.closeOwner({ webContentsId: owner.webContentsId + 1 })
    assert.equal(manager.childPid, pid)
    restoreSignal()
    await manager.closeOwner(owner)
    assert.equal(manager.childPid, undefined)
    assert.equal(existsSync(workspace), false)
    assert.throws(() => signal(-pid!, 0), /ESRCH/)
    t.diagnostic(`Stopped owned fixture process group: ${pid}`)
    await manager.start(owner)
    pid = manager.childPid
    workspace = readFileSync(proof, 'utf8')
    assert.ok(pid, 'a successful cleanup permits the next run')
    t.diagnostic(`Owned fixture process group: ${pid}`)
  } finally {
    restoreSignal?.()
    await manager.close()
    if (pid) {
      try { signal(-pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
      let stopped = false
      for (let attempt = 0; attempt < 100; attempt++) {
        try { signal(-pid, 0) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
          stopped = true; break
        }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.ok(stopped, 'the full fixture process group stopped')
      t.diagnostic(`Stopped owned fixture process group: ${pid}`)
    }
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

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
    ] as const) {
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

test('an approved menu command projects saved colors, refreshes and copies only after an owned action', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-user-raycast-menu-'))
  const folder = join(root, 'source'), runtime = join(root, 'host')
  mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'color-picker', title: 'Color Picker', commands: [{ name: 'menu-bar', mode: 'menu-bar' }] }))
  writeFileSync(join(folder, 'icon.png'), readFileSync(resolve('assets/icon.png')))
  writeFileSync(join(folder, 'menu-bar.js'), `const React=require('react');const {MenuBarExtra,Clipboard,Cache}=require('@raycast/api');exports.default=function Command(){const cache=React.useMemo(()=>new Cache(),[]);const saved=React.useSyncExternalStore(cache.subscribe,()=>cache.get('history')??'[]');const changed=JSON.parse(saved).length>0;return React.createElement(MenuBarExtra,{icon:'EyeDropper'},React.createElement(MenuBarExtra.Item,{title:'Pick Color',onAction:()=>{throw Error('unsupported native picker')}}),React.createElement(MenuBarExtra.Section,{title:'Favorites'},React.createElement(MenuBarExtra.Item,{title:'#FF6363',onAction:()=>Clipboard.copy('#FF6363')})),React.createElement(MenuBarExtra.Section,{title:'Recent Colors'},React.createElement(MenuBarExtra.Item,{title:changed?'#334455':'#112233',onAction:async event=>{if(event?.type!=='left-click')throw Error('Menu action was not a left click');cache.set('history',JSON.stringify(['#334455']));await new Promise(resolve=>setTimeout(resolve,50))}})))}`)
  const install = new UserRaycastInstall(join(root, 'installed'))
  const copied: string[] = [], messages: any[] = []
  let pid: number | undefined
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => messages.push(message), copyText: (_owner, text) => { copied.push(text) } })
  try {
    await buildUserRaycast(runtime)
    const selected = install.prepare(folder, 'menu-bar')
    await assert.rejects(manager.start(owner), /not enabled|approved/i)
    install.approve(selected.digest)
    await assert.rejects(manager.start(owner), /not enabled/i)
    install.enable()
    await manager.start(owner); pid = manager.childPid
    const ready = messages.find(message => message.type === 'ready')
    assert.ok(ready)
    assert.match(JSON.stringify(ready.root), /#112233/, `Menu render failed: ${JSON.stringify(messages)}`)
    assert.deepEqual(manager.menuIcon().subarray(0, 8), readFileSync(resolve('assets/icon.png')).subarray(0, 8))
    const invoke = (message: any, title: string) => {
      let clicked: string | undefined
      const menu = colorPickerMenu(message.root, eventId => { manager.send(owner, { revision: message.revision, eventId, kind: 'action' }); clicked = eventId })
      const item = menu.flatMap(entry => entry.submenu ?? []).find(entry => entry.label === title)
      assert.ok(item?.click, `Missing saved color ${title}`)
      item.click(); assert.ok(clicked); return clicked
    }
    const firstAction = invoke(ready, '#112233'), deadline = Date.now() + 5000
    const outcome = (revision: number, eventId: string) => messages.find(message => message.type === 'outcome' && message.revision === revision && message.eventId === eventId)
    while ((!messages.some(message => message.type === 'patch') || !outcome(ready.revision, firstAction)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(outcome(ready.revision, firstAction)?.succeeded, true)
    const patch = messages.findLast(message => message.type === 'patch')
    assert.ok(patch)
    assert.match(JSON.stringify(patch.root), /#334455/)
    assert.equal(JSON.parse(readFileSync(install.statePath('color-picker'), 'utf8')).history, '["#334455"]')
    const copyAction = invoke(patch, '#FF6363'), copyDeadline = Date.now() + 5000
    while ((copied.length === 0 || !outcome(patch.revision, copyAction)) && Date.now() < copyDeadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(outcome(patch.revision, copyAction)?.succeeded, true)
    assert.deepEqual(copied, ['#FF6363'])
    await manager.closeOwner(owner)
    assert.ok(manager.childPid, 'the explicitly activated menu outlives a dismissed launcher')
    await manager.close()
    assert.equal(manager.childPid, undefined)
    assert.throws(() => manager.menuIcon(), /menu|active/i)
  } finally {
    await manager.close()
    if (pid) { assert.throws(() => process.kill(-pid!, 0), /ESRCH/); t.diagnostic(`Stopped owned fixture process group: ${pid}`) }
    rmSync(root, { recursive: true, force: true })
  }
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
