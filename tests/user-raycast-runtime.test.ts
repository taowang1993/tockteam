import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
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
module.exports = function Browse() { return React.createElement(List, { onSearchTextChange() {} }, React.createElement(List.Item, { title: 'Pinned Item', actions: React.createElement(ActionPanel, null, React.createElement(Action, { title: 'Choose Item', onAction: () => console.error('CHOSEN') })) })) }`
const owner = { webContentsId: 17 }

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
    const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => messages.push(message) })
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
    const pid = manager.childPid
    await manager.closeOwner(owner)
    assert.equal(manager.childPid, undefined)
    if (pid) assert.throws(() => process.kill(pid, 0), /ESRCH/)
    install.disable()
    await assert.rejects(manager.start(owner), /not enabled/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
