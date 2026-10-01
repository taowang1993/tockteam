import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'

const owner = { webContentsId: 17 }
const artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')

for (const behavior of ['view-storage', 'declared-preferences'] as const) {
  test(behavior === 'view-storage'
    ? 'approved view commands save and reopen private data and report HUD feedback'
    : 'selected commands receive only their declared preferences, including bundled-name collisions', async t => {
    const root = mkdtempSync(join(tmpdir(), 'tockteam-user-view-data-'))
    const install = new UserRaycastInstall(join(root, 'installed'))
    const runtime = join(root, 'host')
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
    for (const extensionId of behavior === 'view-storage' ? ['first-view', 'second-view'] : ['declared-view', 'google-translate', 'kaomoji-search']) {
      const folder = join(root, extensionId)
      mkdirSync(folder)
      writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: extensionId, title: 'Offline View Data Fixture',
        preferences: [{ name: 'flag', default: false }, { name: 'prefix', default: 'extension' }],
        commands: [{ name: 'browse', mode: 'view', preferences: [{ name: 'prefix', default: 'command' }] }],
      }))
      writeFileSync(join(folder, 'browse.js'), `
        const React=require('react');const {List,LocalStorage,showHUD,getPreferenceValues}=require('@raycast/api');
        global.fetch=()=>{throw Error('Network prohibited')};
        exports.default=function Browse(){
          ${behavior === 'view-storage' ? `const [label,setLabel]=React.useState('Starting');React.useEffect(()=>{void(async()=>{
            const next=Number(await LocalStorage.getItem('runs')??'0')+1;await LocalStorage.setItem('runs',String(next));
            setLabel('Saved View '+await LocalStorage.getItem('runs'));await showHUD('Saved View '+next);
          })()},[]);` : `const label=JSON.stringify(getPreferenceValues());`}
          return React.createElement(List,null,React.createElement(List.Item,{title:label}));
        }
      `)
      const selected = install.prepare(folder, 'browse')
      install.approve(selected.digest); install.enable()
      for (const run of behavior === 'view-storage' && extensionId === 'first-view' ? [1, 2] : [1]) {
        messages.length = 0; errors.length = 0
        const opening = manager.start(owner)
        if (manager.childPid) pids.push(manager.childPid)
        await opening
        assert.ok(manager.childPid, 'A view owns a live child until it is closed')
        const expected = behavior === 'view-storage' ? `Saved View ${run}` : '{"flag":false,"prefix":"command"}'
        const hasTitle = (node: unknown): boolean => {
          if (!node || typeof node !== 'object') return false
          const entry = node as { type: string; props: Record<string, unknown>; children: unknown[] }
          return entry.type === 'raycast-list-item' && entry.props.title === expected || entry.children.some(hasTitle)
        }
        const finished = () => messages.some(message => hasTitle(message.root))
          && (behavior !== 'view-storage' || messages.some(message => message.type === 'toast' && message.title === expected))
        const deadline = Date.now() + 3000
        while (!finished() && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
        assert.equal(finished(), true, `Missing view result: ${JSON.stringify({ errors, messages })}`)
        assert.deepEqual(errors, [])
        await manager.close()
      }
    }
  })
}
