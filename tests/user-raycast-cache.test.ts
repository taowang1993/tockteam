import assert from 'node:assert/strict'
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'
import { createUserRaycastStorage } from '../src/user-raycast-storage.ts'

const owner = { webContentsId: 17 }

test('managed Cache scopes isolate keys, notifications and clearing while preserving legacy default data', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-cache-scopes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'first.json')
  writeFileSync(path, JSON.stringify({ history: 'legacy' }), { mode: 0o600 })
  const storage = createUserRaycastStorage(path)
  const plain = storage.cache(), a = storage.cache('a'), b = storage.cache('a:b'), same = storage.cache('a')
  assert.equal(plain.get('history'), 'legacy')
  const notified = { plain: 0, a: 0, b: 0, same: 0 }
  plain.subscribe(() => { notified.plain++ })
  a.subscribe(() => { notified.a++ })
  b.subscribe(() => { notified.b++ })
  const unsubscribe = same.subscribe(() => { notified.same++ })
  plain.set('a:b:c', 'default'); a.set('b:c', 'first'); b.set('c', 'second')
  assert.deepEqual(notified, { plain: 1, a: 1, b: 1, same: 1 })
  assert.equal(plain.get('a:b:c'), 'default'); assert.equal(same.get('b:c'), 'first'); assert.equal(b.get('c'), 'second')
  const reloaded = createUserRaycastStorage(path)
  assert.equal(reloaded.cache('a').get('b:c'), 'first')
  assert.equal(createUserRaycastStorage(join(root, 'second.json')).cache('a').get('b:c'), undefined)
  const reservedKey = Object.keys(JSON.parse(readFileSync(path, 'utf8'))).find(key => key.length > 128)!
  assert.throws(() => plain.set(reservedKey, 'collision'), /key/)
  a.remove('b:c')
  assert.equal(same.get('b:c'), undefined); assert.equal(b.get('c'), 'second')
  a.set('b:c', 'again'); unsubscribe(); a.clear()
  assert.equal(same.get('b:c'), undefined); assert.equal(plain.get('history'), 'legacy'); assert.equal(b.get('c'), 'second')
  assert.deepEqual(notified, { plain: 1, a: 4, b: 1, same: 3 })
  plain.clear()
  assert.equal(plain.get('history'), undefined); assert.equal(b.get('c'), 'second')
  await storage.setItem('local', 'saved')
  await storage.clear()
  assert.equal(await storage.getItem('local'), undefined); assert.equal(b.get('c'), 'second')
  assert.equal(lstatSync(path).mode & 0o777, 0o600)
})

test('Cache namespaces cannot bypass managed storage bounds or follow a replaced state file', t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-cache-bounds-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json')
  const storage = createUserRaycastStorage(path)
  const unicode = createUserRaycastStorage(join(root, 'unicode.json'))
  unicode.cache('\ud800').set('\ud800', 'first')
  unicode.cache('\ud800').set('\ud801', 'second')
  unicode.cache('\ud801').set('\ud800', 'third')
  assert.equal(unicode.cache('\ud800').get('\ud800'), 'first')
  assert.equal(unicode.cache('\ud800').get('\ud801'), 'second')
  assert.equal(unicode.cache('\ud801').get('\ud800'), 'third')
  for (const namespace of [null, 1, 'x'.repeat(129)]) assert.throws(() => storage.cache(namespace as never), /namespace/)
  const cache = storage.cache('../outside')
  for (const key of ['', 1, 'x'.repeat(129)]) assert.throws(() => cache.get(key as never), /key/)
  assert.throws(() => cache.set('large', 'x'.repeat(4097)), /value/)
  cache.set('x'.repeat(128), 'valid')
  for (let index = 1; index < 256; index++) storage.cache(String(index)).set('key', 'small')
  assert.throws(() => cache.set('extra', 'overflow'), /limit/)
  assert.equal(cache.get('extra'), undefined)
  assert.equal(cache.get('x'.repeat(128)), 'valid')
  const bytesPath = join(root, 'bytes.json'), bounded = createUserRaycastStorage(bytesPath).cache('query')
  for (let index = 0; index < 15; index++) bounded.set(String(index), 'x'.repeat(4096))
  assert.throws(() => bounded.set('overflow', 'x'.repeat(4096)), /limit/)
  assert.equal(bounded.get('overflow'), undefined)
  const target = join(root, 'target.json')
  writeFileSync(target, '{}')
  rmSync(path); symlinkSync(target, path)
  assert.throws(() => cache.set('key', 'must not write'), /invalid/)
  assert.equal(readFileSync(target, 'utf8'), '{}')
})

test('offline view and no-view commands share persistent Cache only within their extension and namespace', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-user-cache-'))
  const runtime = join(root, 'host')
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: UserRaycastMessage[] = [], errors: string[] = [], pids: number[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact: resolve('plugins/trusted-raycast/vendor/google-translate.tar'), onMessage: (_owner, message) => messages.push(message), onError: (_owner, error) => errors.push(error.message) })
  t.after(async () => {
    try {
      await manager.close()
      for (const pid of pids) assert.throws(() => process.kill(-pid, 0), /ESRCH/)
      t.diagnostic(`Stopped owned process groups: ${pids.join(', ')}`)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  await buildUserRaycast(runtime)
  for (const extensionId of ['cache-first', 'cache-second']) {
    for (const mode of ['view', 'no-view'] as const) {
      const folder = join(root, `${extensionId}-${mode}`)
      mkdirSync(folder)
      writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: extensionId, title: 'Offline Cache Fixture', commands: [{ name: 'run', title: 'Run', mode }] }))
      // Independently written fixture of the pinned useCachedPromise -> useCachedState path:
      // a function-hash namespace, string values, and an unbound external-store subscription.
      const roundTrip = `
        function caches() {
          const plain = new Cache();
          const named = new Cache({ namespace: '0123456789abcdef0123456789abcdef01234567' });
          function update() {
            const next = Number(plain.get('runs') ?? '0') + 1;
            if (Number(named.get('runs') ?? '0') !== next - 1) throw Error('Cache namespaces collided');
            plain.set('runs', String(next)); named.set('runs', String(next));
            if (plain.get('runs') !== String(next) || named.get('runs') !== String(next)) throw Error('Cache round trip failed');
            return next;
          }
          return { named, update };
        }
      `
      writeFileSync(join(folder, 'run.js'), `
        const React = require('react'); const { Cache, List, showHUD } = require('@raycast/api');
        global.fetch = () => { throw Error('Network prohibited'); };
        ${roundTrip}
        ${mode === 'view' ? `exports.default = function Command() {
          const { named, update } = React.useMemo(caches, []);
          const value = React.useSyncExternalStore(named.subscribe, () => named.get('runs') ?? '0');
          React.useEffect(() => { update(); }, []);
          return React.createElement(List, null, React.createElement(List.Item, { title: 'Cache Ready ' + value }));
        }` : `exports.default = async () => { await showHUD('Cache Ready ' + caches().update()); };`}
      `)
      const candidate = install.prepare(folder, 'run')
      install.approve(candidate.digest); install.enable()
      for (const expected of mode === 'view' ? [1, 2] : [3, 4]) {
        messages.length = 0; errors.length = 0
        const started = manager.start(owner)
        if (manager.childPid) pids.push(manager.childPid)
        await started
        const deadline = Date.now() + 5000
        const finished = () => mode === 'view'
          ? messages.some(message => JSON.stringify(message.root ?? null).includes(`Cache Ready ${expected}`))
          : messages.some(message => message.type === 'outcome')
        while (!finished() && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
        assert.deepEqual(errors, [])
        assert.equal(finished(), true, `Missing ${mode} Cache result: ${JSON.stringify(messages)}`)
        if (mode === 'no-view') {
          assert.equal(messages.find(message => message.type === 'outcome')?.succeeded, true)
          assert.ok(messages.some(message => message.type === 'toast' && message.title === `Cache Ready ${expected}`))
        }
        await manager.close()
      }
    }
  }
})
