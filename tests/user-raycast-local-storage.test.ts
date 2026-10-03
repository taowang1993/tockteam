import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, type TestContext } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'
import { createUserRaycastStorage } from '../src/user-raycast-storage.ts'

test('LocalStorage enumerates detached legacy string values without leaking named caches or writing state', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-storage-enumeration-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json')
  const legacy = Object.fromEntries([
    ['history', '["legacy"]'], ['empty', ''], ['__proto__', 'ordinary data'],
    ['constructor', 'also data'], ['cache:short', 'public key'], ['x'.repeat(128), 'long public key'],
  ])
  writeFileSync(path, JSON.stringify(legacy), { mode: 0o600 })
  const storage = createUserRaycastStorage(path)
  storage.cache('private').set('history', 'named cache')
  storage.cache('form:browse').set('form-1', 'fake remembered form')
  const before = readFileSync(path)
  const snapshot = await storage.allItems()
  assert.deepEqual(snapshot, legacy)
  assert.equal(Object.getPrototypeOf(snapshot), Object.prototype)
  assert.equal(Object.hasOwn(snapshot, '__proto__'), true)
  assert.deepEqual(readFileSync(path), before, 'Enumeration must not rewrite existing saved data')
  snapshot.history = 'changed snapshot'; snapshot.__proto__ = 'changed data'; snapshot.extra = 'not stored'
  assert.deepEqual(await storage.allItems(), legacy)
  assert.deepEqual(await createUserRaycastStorage(path).allItems(), legacy, 'Cold enumeration retains the same data')
  assert.deepEqual(await createUserRaycastStorage(join(root, 'other.json')).allItems(), {})
  assert.equal(existsSync(join(root, 'other.json')), false, 'Reading an empty extension must not create a file')
  await storage.removeItem('history')
  const remaining = { ...legacy }; delete remaining.history
  assert.deepEqual(await storage.allItems(), remaining)
  await storage.clear()
  assert.deepEqual(await storage.allItems(), {})
  assert.equal(storage.cache('private').get('history'), 'named cache')
  assert.equal(storage.cache('form:browse').get('form-1'), 'fake remembered form')
})

const owner = { webContentsId: 17 }
async function commandFixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-storage-command-'))
  const runtime = join(root, 'host'), install = new UserRaycastInstall(join(root, 'installed'))
  const messages: UserRaycastMessage[] = [], errors: string[] = [], pids: number[] = [], copies: string[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath,
    artifact: resolve('plugins/trusted-raycast/vendor/google-translate.tar'),
    onMessage: (_owner, message) => messages.push(message), onError: (_owner, error) => errors.push(error.message),
    copyText: (_owner, value) => { copies.push(value) },
  })
  t.after(async () => {
    try {
      await manager.close()
      for (const pid of pids) assert.throws(() => process.kill(-pid, 0), /ESRCH/)
      t.diagnostic(`Stopped owned process groups: ${pids.join(', ')}`)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  await buildUserRaycast(runtime)
  const prepare = (extensionId: string, mode: 'view' | 'no-view', body: string) => {
    const source = join(root, extensionId); mkdirSync(source)
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: extensionId, title: 'Offline Storage Fixture', commands: [{ name: 'run', title: 'Run', mode }] }))
    writeFileSync(join(source, 'run.js'), `
      const React = require('react'), { List, LocalStorage, Cache, showHUD, configureCompatibility, allLocalStorageItems, getLocalStorageItem, setLocalStorageItem, removeLocalStorageItem, clearLocalStorage } = require('@raycast/api');
      global.fetch = () => { throw Error('Network prohibited'); };
      async function work() { ${body} }
      ${mode === 'view' ? `exports.default = function Browse() {
        const [result, setResult] = React.useState('Starting');
        React.useEffect(() => { void work().then(value => setResult('Snapshot ' + JSON.stringify(value)), error => setResult('ERROR ' + error.message)); }, []);
        return React.createElement(List, null, React.createElement(List.Item, { title: result }));
      };` : `exports.default = async () => showHUD('Snapshot ' + JSON.stringify(await work()));`}
    `)
    const candidate = install.prepare(source, 'run'); install.approve(candidate.digest); install.enable()
  }
  const run = async (mode: 'view' | 'no-view') => {
    messages.length = 0; errors.length = 0
    const opening = manager.start(owner); if (manager.childPid) pids.push(manager.childPid); await opening
    const titles = (node: any): string[] => node && typeof node === 'object' && Array.isArray(node.children)
      ? [...(node.type === 'raycast-list-item' ? [String(node.props.title)] : []), ...node.children.flatMap(titles)] : []
    const report = () => messages.flatMap(message => mode === 'view' ? titles(message.root) : [message.title ?? '']).find(title => title.startsWith('Snapshot ') || title.startsWith('ERROR '))
    const outcome = () => messages.find(message => message.type === 'outcome')
    const deadline = Date.now() + 3000
    while ((!report() || mode === 'no-view' && !outcome()) && !errors.length && outcome()?.succeeded !== false && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(errors, [])
    if (mode === 'no-view') assert.equal(outcome()?.succeeded, true, outcome()?.message)
    assert.ok(report()?.startsWith('Snapshot '), `Missing successful snapshot: ${JSON.stringify(messages)}`)
    const value = JSON.parse(report()!.slice('Snapshot '.length))
    await manager.close()
    assert.deepEqual(copies, [], 'Storage APIs acquire no native effect authority')
    return value
  }
  return { prepare, run }
}

for (const mode of ['view', 'no-view'] as const) test(`${mode} commands enumerate exact private data across cold opens without exposing Cache namespaces`, async t => {
  const f = await commandFixture(t)
  for (const extensionId of ['storage-first', 'storage-second']) {
    f.prepare(extensionId, mode, `
      const previous = await LocalStorage.allItems();
      const next = String(Number(previous.runs ?? '0') + 1);
      await LocalStorage.setItem('runs', next);
      await LocalStorage.setItem('__proto__', ${JSON.stringify(extensionId)});
      const named = new Cache({ namespace: 'private' }); named.set('hidden', 'fake named value');
      new Cache({ namespace: 'form:run' }).set('form-1', 'fake remembered form');
      const snapshot = await LocalStorage.allItems(); snapshot.runs = 'mutated snapshot'; snapshot.extra = 'not saved';
      if (await LocalStorage.getItem('runs') !== next) throw Error('Snapshot mutation reached storage');
      return { previous, values: await LocalStorage.allItems(), named: named.get('hidden') };
    `)
    for (const next of extensionId === 'storage-first' ? ['1', '2'] : ['1']) {
      const previous = next === '1' ? {} : Object.fromEntries([['runs', '1'], ['__proto__', extensionId]])
      assert.deepEqual(await f.run(mode), { previous, values: Object.fromEntries([['runs', next], ['__proto__', extensionId]]), named: 'fake named value' })
    }
  }
})

test('legacy LocalStorage names share exact set, get, enumerate, remove and clear semantics', async t => {
  const f = await commandFixture(t)
  f.prepare('legacy-storage', 'no-view', `
    const empty = await allLocalStorageItems();
    await setLocalStorageItem('legacy', ''); await LocalStorage.setItem('regular', 'saved');
    const legacy = await LocalStorage.getItem('legacy'), regular = await getLocalStorageItem('regular');
    const named = new Cache({ namespace: 'private' }); named.set('saved', 'named');
    const all = await allLocalStorageItems();
    await removeLocalStorageItem('legacy');
    const missing = await getLocalStorageItem('legacy'), remaining = await LocalStorage.allItems();
    await clearLocalStorage();
    return { empty, legacy, regular, all, missing: missing === undefined, remaining, cleared: await allLocalStorageItems(), named: named.get('saved') };
  `)
  assert.deepEqual(await f.run('no-view'), { empty: {}, legacy: '', regular: 'saved', all: { legacy: '', regular: 'saved' }, missing: true, remaining: { regular: 'saved' }, cleared: {}, named: 'named' })
})

for (const invalid of ['symlink', 'oversized', 'malformed', 'non-string', 'too many entries']) test(`LocalStorage enumeration rejects ${invalid} state without changing bytes`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-storage-invalid-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), target = join(root, 'outside.json')
  writeFileSync(target, '{"outside":"untouched"}')
  if (invalid === 'symlink') symlinkSync(target, path)
  else writeFileSync(path, invalid === 'oversized' ? JSON.stringify({ saved: 'x'.repeat(65536) })
    : invalid === 'malformed' ? 'not json'
    : invalid === 'non-string' ? '{"saved":false}'
    : JSON.stringify(Object.fromEntries(Array.from({ length: 257 }, (_, index) => [String(index), 'value']))))
  const before = readFileSync(path), outside = readFileSync(target)
  await assert.rejects(createUserRaycastStorage(path).allItems())
  assert.deepEqual(readFileSync(path), before)
  assert.deepEqual(readFileSync(target), outside)
})

test('LocalStorage enumeration explicitly rejects unavailable and legacy-only providers', async t => {
  const f = await commandFixture(t)
  f.prepare('unavailable-storage', 'view', `
    const base = { native: async () => {}, selection: async () => '', toast: () => {} };
    const failure = async () => { try { await LocalStorage.allItems(); return 'unexpected success'; } catch (error) { return error.message; } };
    configureCompatibility(base);
    const unavailable = await failure();
    configureCompatibility({ ...base, storage: { getItem: async () => 'legacy', setItem: async () => {}, removeItem: async () => {}, clear: async () => {} } });
    return { unavailable, legacy: await LocalStorage.getItem('saved'), partial: await failure() };
  `)
  const message = 'Raycast API LocalStorage.allItems is not admitted by this capability'
  assert.deepEqual(await f.run('view'), { unavailable: message, legacy: 'legacy', partial: message })
})
