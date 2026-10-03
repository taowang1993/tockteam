import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party private-runtime builder.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'
import { createUserRaycastStorage } from '../src/user-raycast-storage.ts'

type ViewNode = { type: string; props: Record<string, unknown>; children: Array<ViewNode | string> }
const visit = (node: ViewNode): ViewNode[] => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : visit(child))]

for (const layout of ['rows', 'root-lists'] as const) {
  test(`approved commands move keyed ${layout} without duplicating results or their actions`, async t => {
    const root = mkdtempSync(join(tmpdir(), 'tockteam-reconciliation-'))
    const source = join(root, 'source'), runtime = join(root, 'runtime')
    const install = new UserRaycastInstall(join(root, 'installed'))
    const owner = { webContentsId: 51 }, messages: UserRaycastMessage[] = [], errors: string[] = [], pids: number[] = []
    const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath,
      artifact: resolve('plugins/trusted-raycast/vendor/google-translate.tar'),
      onMessage: (_owner, message) => messages.push(message), onError: (_owner, error) => errors.push(error.message),
    })
    t.after(async () => {
      await manager.close()
      for (const pid of pids) assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
      t.diagnostic(`Stopped reconciliation process groups: ${pids.join(', ')}`)
      rmSync(root, { recursive: true, force: true })
    })
    mkdirSync(source)
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-order', title: 'Offline Order', commands: [{ name: 'browse', mode: 'view' }] }))
    writeFileSync(join(source, 'browse.js'), `
      const React = require('react'), { List, Action, ActionPanel, LocalStorage } = require('@raycast/api');
      global.fetch = () => { throw Error('Network prohibited') };
      exports.default = function Browse() {
        const [query, setQuery] = React.useState('');
        const orders = { reverse: ['Gamma', 'Beta', 'Alpha'], insert: ['Beta', 'Alpha', 'Gamma'], remove: ['Gamma', 'Alpha'] };
        const order = orders[query] || ['Alpha', 'Beta', 'Gamma'];
        const item = title => React.createElement(List.Item, {
          key: title, title, subtitle: query,
          actions: React.createElement(ActionPanel, null, React.createElement(Action, { title: 'Choose ' + title, onAction: () => LocalStorage.setItem('chosen', title) }))
        });
        return ${layout === 'rows'
          ? "React.createElement(List, { onSearchTextChange: setQuery }, order.map(item))"
          : "React.createElement(React.Fragment, null, order.map(title => React.createElement(List, { key: title, onSearchTextChange: setQuery }, item(title))))"};
      };
    `)
    await buildUserRaycast(runtime)
    const candidate = install.prepare(source)
    install.approve(candidate.digest); install.enable()
    const opening = manager.start(owner)
    if (manager.childPid) pids.push(manager.childPid)
    await opening
    const latest = (): UserRaycastMessage => messages.findLast(message => message.root !== undefined)!
    const rows = (): ViewNode[] => visit(latest().root as ViewNode).filter(node => node.type === 'raycast-list-item')
    assert.deepEqual(rows().map(node => node.props.title), ['Alpha', 'Beta', 'Gamma'])
    for (const [query, expected] of [
      ['reverse', ['Gamma', 'Beta', 'Alpha']],
      ['reset', ['Alpha', 'Beta', 'Gamma']],
      ['insert', ['Beta', 'Alpha', 'Gamma']],
      ['remove', ['Gamma', 'Alpha']],
      ['reset-again', ['Alpha', 'Beta', 'Gamma']],
    ] as const) {
      const previous = latest().revision
      manager.send(owner, { revision: previous, eventId: 'search', kind: 'searchChanged', value: query })
      const end = Date.now() + 3000
      while ((latest().revision <= previous || rows()[0]?.props.subtitle !== query) && !errors.length && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10))
      assert.deepEqual(errors, [])
      assert.ok(latest().revision > previous, 'The changed search must publish a new projection')
      assert.deepEqual(rows().map(node => node.props.title), expected, `Search ${query} must contain each current row exactly once`)
    }
    const gamma = rows().find(node => node.props.title === 'Gamma')!
    const action = visit(gamma).find(node => node.type === 'raycast-action')!
    const revision = latest().revision
    manager.send(owner, { revision, eventId: String(action.props.actionEventId), kind: 'action' })
    const end = Date.now() + 3000
    while (!messages.some(message => message.type === 'outcome' && message.revision === revision) && !errors.length && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(errors, [])
    assert.equal(messages.findLast(message => message.type === 'outcome')?.succeeded, true)
    assert.equal(await createUserRaycastStorage(install.statePath('offline-order')).getItem('chosen'), 'Gamma', 'A moved result keeps its own action')
  })
}
